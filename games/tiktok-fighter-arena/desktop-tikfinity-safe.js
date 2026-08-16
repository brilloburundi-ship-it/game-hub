(() => {
  'use strict';

  // Desktop LIVE bridge: one passive Event API client only.
  // It never launches, closes, reconnects or otherwise controls TikFinity/TikTok LIVE Studio.
  const TIKFINITY_URL = 'ws://127.0.0.1:21213/';
  const LOCK_NAME = 'fighter-arena-tikfinity-event-api-v1';
  const READY_DELAY_MS = 1200;
  const JOIN_COMMANDS = new Set(['join', 'me', 'play', 'fight', 'entra', 'gioca', 'combatti', 'arena']);
  const giftProgress = new Map();

  let socket = null;
  let connecting = false;
  let connected = false;
  let readyTimer = null;
  let lockTask = null;
  let releaseLock = null;
  let lastRaw = null;
  let lastNormalized = null;

  const statusEl = () => document.querySelector('#liveBridgeState');
  const reconnectButton = () => document.querySelector('#liveBridgeReconnect');

  function status(text, state = 'waiting') {
    document.documentElement.dataset.fighterBridgeStatus = state;
    document.documentElement.dataset.fighterBridgeTransport = 'desktop-safe-direct';
    const el = statusEl();
    if (el) el.textContent = text;
    const retry = reconnectButton();
    if (retry) retry.hidden = !['offline', 'error', 'busy'].includes(state);
  }

  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

  function payloadOf(raw) {
    const envelope = isObject(raw) ? raw : {};
    const merged = { ...envelope };
    let current = envelope;
    const seen = new Set([current]);
    for (let depth = 0; depth < 5; depth++) {
      const nested = [current.data, current.eventData, current.payload, current.detail, current.body, current.message]
        .find(value => isObject(value) && !seen.has(value));
      if (!nested) break;
      seen.add(nested);
      Object.assign(merged, nested);
      current = nested;
    }
    return { envelope, data: merged };
  }

  function identitySources(data) {
    const roots = [
      data, data.user, data.userInfo, data.userData, data.author,
      data.sender, data.from, data.member, data.profile, data.owner
    ].filter(isObject);
    for (const root of [...roots]) {
      for (const child of [root.user, root.userInfo, root.userData, root.author, root.sender]) {
        if (isObject(child) && !roots.includes(child)) roots.push(child);
      }
    }
    return roots;
  }

  function firstText(sources, keys) {
    for (const source of sources) {
      if (!isObject(source)) continue;
      for (const key of keys) {
        const value = source[key];
        if (value === undefined || value === null || isObject(value)) continue;
        const text = String(value).trim();
        if (text) return text;
      }
    }
    return '';
  }

  function usernameOf(data) {
    const sources = identitySources(data);
    const direct = firstText(sources, [
      'uniqueId', 'unique_id', 'username', 'userName', 'user_name',
      'nickname', 'displayName', 'display_name', 'handle'
    ]);
    if (direct) return direct.replace(/^@/, '').trim().slice(0, 32) || 'Viewer';
    const numeric = firstText(sources.slice(1), ['userId', 'user_id', 'id', 'uid']);
    return numeric ? `Viewer-${numeric.slice(-8)}` : 'Viewer';
  }

  function userIdOf(data, username) {
    const sources = identitySources(data);
    return firstText(sources.slice(1), ['secUid', 'sec_uid', 'userId', 'user_id', 'id', 'uid']) ||
      firstText([data], ['userId', 'user_id', 'senderUserId', 'sender_user_id', 'gifterId', 'gifter_id', 'secUid', 'sec_uid']) ||
      `viewer:${username.toLowerCase()}`;
  }

  function hasIdentity(data) {
    const sources = identitySources(data);
    return Boolean(
      firstText(sources, ['uniqueId', 'unique_id', 'username', 'userName', 'user_name', 'nickname', 'displayName', 'display_name']) ||
      firstText(sources.slice(1), ['secUid', 'sec_uid', 'userId', 'user_id', 'id', 'uid']) ||
      firstText([data], ['userId', 'user_id', 'senderUserId', 'sender_user_id'])
    );
  }

  function eventNameOf(envelope, data) {
    return String(
      envelope.type ?? envelope.event ?? envelope.eventType ?? envelope.event_name ?? envelope.eventName ?? envelope.action ?? envelope.name ??
      data.type ?? data.event ?? data.eventType ?? data.event_name ?? data.eventName ?? data.action ?? data.name ?? ''
    ).toLowerCase().replace(/[\s_-]+/g, '');
  }

  function commentOf(data) {
    return firstText([data], ['comment', 'text', 'commentText', 'comment_text', 'chatText', 'chat_text', 'content']) ||
      (typeof data.message === 'string' ? data.message.trim() : '');
  }

  function commandOf(comment) {
    const first = String(comment || '').trim().toLowerCase().split(/\s+/)[0].replace(/^[!/.#]+/, '');
    return JOIN_COMMANDS.has(first) ? first : '';
  }

  function looksLikeJoin(eventName, data) {
    if (eventName.includes('roomuser')) return false;
    const action = String(data.action ?? data.memberAction ?? data.actionName ?? '').toLowerCase();
    const displayType = String(data.displayType ?? data.common?.displayType ?? '').toLowerCase();
    const label = String(data.label ?? '').toLowerCase();
    const actionId = Number(data.actionId ?? data.actionCode ?? 0);
    const namedJoin = [
      'member', 'viewerenter', 'viewerjoin', 'memberenter', 'memberjoin', 'userjoin',
      'roomenter', 'enterroom', 'enter', 'join', 'subscribe'
    ].some(name => eventName.includes(name));
    const payloadJoin = action === 'join' || action === 'enter' || action === 'joined' || actionId === 1 ||
      displayType.includes('enter') || displayType.includes('joined') || label.includes(' joined');
    return hasIdentity(data) && (namedJoin || payloadJoin);
  }

  function giftPayload(data, username, userId) {
    const details = isObject(data.giftDetails) ? data.giftDetails : {};
    const gift = isObject(data.gift) ? data.gift : {};
    const extended = isObject(data.extendedGiftInfo) ? data.extendedGiftInfo : {};
    const giftName = String(
      data.giftName ?? data.gift_name ?? details.giftName ?? details.gift_name ?? details.name ??
      gift.name ?? extended.giftName ?? extended.name ?? data.name ?? 'gift'
    );
    const totalRepeat = Math.max(1, Number(
      data.repeatCount ?? data.repeat_count ?? details.repeatCount ?? details.repeat_count ?? data.count ?? 1
    ) || 1);
    const transaction = String(
      data.transactionId ?? data.transaction_id ?? data.groupId ?? data.group_id ??
      details.transactionId ?? details.groupId ?? ''
    );

    let repeatCount = totalRepeat;
    if (transaction) {
      const key = `${userId}|${transaction}`;
      const previous = giftProgress.get(key) || 0;
      if (totalRepeat <= previous) return null;
      repeatCount = totalRepeat - previous;
      giftProgress.set(key, totalRepeat);
      if (giftProgress.size > 500) giftProgress.delete(giftProgress.keys().next().value);
    } else {
      const giftType = Number(data.giftType ?? data.gift_type ?? details.giftType ?? details.gift_type ?? gift.giftType ?? 0);
      const repeatEndValue = data.repeatEnd ?? data.repeat_end ?? details.repeatEnd ?? details.repeat_end;
      const repeatEnded = repeatEndValue === true || repeatEndValue === 1 || String(repeatEndValue).toLowerCase() === 'true';
      if (giftType === 1 && !repeatEnded) return null;
    }

    const diamondCount = Math.max(1, Number(
      data.diamondCount ?? data.diamond_count ?? details.diamondCount ?? details.diamond_count ??
      gift.diamondCount ?? gift.diamond_count ?? extended.diamondCount ?? extended.diamond_count ??
      data.coins ?? details.coins ?? gift.coins ?? 1
    ) || 1);

    return { userId, username, uniqueId: username, giftName, diamondCount, repeatCount };
  }

  function normalize(raw) {
    const { envelope, data } = payloadOf(raw);
    const eventName = eventNameOf(envelope, data);
    if (!eventName || eventName === 'connected' || eventName === 'roominfo') return null;

    if (eventName.includes('roomuser') || eventName.includes('viewercount')) return null;

    const username = usernameOf(data);
    const userId = userIdOf(data, username);
    const base = { userId, username, uniqueId: username };
    const identified = hasIdentity(data);
    const comment = commentOf(data);

    if (['viewerleave', 'memberleave', 'viewerexit', 'memberexit', 'leave', 'exit'].some(name => eventName.includes(name))) {
      return identified ? { type: 'leave', payload: base } : null;
    }

    if (eventName.includes('chat') || eventName.includes('comment') || Boolean(comment)) {
      return identified ? { type: 'join', payload: { ...base, comment, command: commandOf(comment), sourceEvent: eventName || 'chat' } } : null;
    }

    if (looksLikeJoin(eventName, data)) return { type: 'join', payload: base };

    if (eventName.includes('like')) {
      return identified ? {
        type: 'like',
        payload: { ...base, count: Math.max(1, Number(data.likeCount ?? data.like_count ?? data.count ?? data.repeatCount ?? 1) || 1) }
      } : null;
    }

    if (eventName.includes('follow') || (eventName.includes('social') && String(data.action ?? '').toLowerCase().includes('follow'))) {
      return identified ? { type: 'follow', payload: base } : null;
    }

    if (eventName.includes('gift')) {
      if (!identified) return null;
      const payload = giftPayload(data, username, userId);
      return payload ? { type: 'gift', payload } : null;
    }

    return null;
  }

  function gameReady() {
    return window.__fighterArenaReady === true && Boolean(window.FighterArenaBridge?.emit);
  }

  function deliver(raw) {
    if (Array.isArray(raw)) {
      raw.forEach(deliver);
      return;
    }
    lastRaw = raw;
    const event = normalize(raw);
    lastNormalized = event;
    if (!event || !gameReady()) return;
    window.FighterArenaBridge.emit(event.type, event.payload);
  }

  function parseMessage(data) {
    if (typeof data === 'string') {
      try { deliver(JSON.parse(data)); } catch {}
      return;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.text().then(parseMessage).catch(() => {});
      return;
    }
    if (isObject(data) || Array.isArray(data)) deliver(data);
  }

  function unlock() {
    if (releaseLock) {
      const release = releaseLock;
      releaseLock = null;
      release();
    }
  }

  function startSocket() {
    if (!gameReady() || connecting || connected || socket) return;
    connecting = true;
    status('TIKFINITY: CONNECTING…', 'connecting');

    try {
      socket = new WebSocket(TIKFINITY_URL);
    } catch {
      socket = null;
      connecting = false;
      status('TIKFINITY: OFFLINE · MANUAL RECONNECT', 'error');
      unlock();
      return;
    }

    socket.addEventListener('open', () => {
      connecting = false;
      connected = true;
      status('TIKFINITY: CONNECTED · SAFE MODE', 'online');
    }, { once: true });

    socket.addEventListener('message', event => parseMessage(event.data));

    socket.addEventListener('close', () => {
      socket = null;
      connecting = false;
      connected = false;
      status('TIKFINITY: DISCONNECTED · MANUAL RECONNECT', 'offline');
      unlock();
    }, { once: true });

    socket.addEventListener('error', () => {
      status('TIKFINITY: EVENT API ERROR · MANUAL RECONNECT', 'error');
      try { socket?.close(); } catch {
        socket = null;
        connecting = false;
        connected = false;
        unlock();
      }
    }, { once: true });
  }

  function connect() {
    if (!gameReady() || connecting || connected || socket || lockTask) return;

    if (navigator.locks?.request) {
      lockTask = navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) {
          status('TIKFINITY: ANOTHER FIGHTER ARENA TAB IS CONNECTED', 'busy');
          return;
        }
        await new Promise(resolve => {
          releaseLock = resolve;
          startSocket();
        });
      }).catch(() => {
        status('TIKFINITY: LOCK ERROR · MANUAL RECONNECT', 'error');
      }).finally(() => {
        lockTask = null;
      });
      return;
    }

    startSocket();
  }

  function disconnect() {
    try { socket?.close(1000, 'Fighter Arena manual disconnect'); } catch {}
    if (!socket) unlock();
  }

  function reconnect() {
    disconnect();
    setTimeout(() => {
      if (!socket && !connecting && !connected) connect();
    }, 350);
  }

  window.FighterArenaTikFinity = {
    connect,
    disconnect,
    reconnect,
    normalize,
    get socket() { return socket; },
    get connected() { return connected; },
    get lastRaw() { return lastRaw; },
    get lastNormalized() { return lastNormalized; },
    transport: 'desktop-safe-direct',
    url: TIKFINITY_URL
  };
  window.FighterArenaLiveBridge = window.FighterArenaTikFinity;

  const retry = reconnectButton();
  if (retry) retry.addEventListener('click', reconnect);

  status('TIKFINITY: WAITING FOR GAME PRELOAD', 'waiting');
  readyTimer = setInterval(() => {
    if (!gameReady()) return;
    clearInterval(readyTimer);
    readyTimer = null;
    status('TIKFINITY: GAME READY · SAFE CONNECT PENDING', 'waiting');
    setTimeout(connect, READY_DELAY_MS);
  }, 250);

  window.addEventListener('beforeunload', () => {
    if (readyTimer) clearInterval(readyTimer);
    try { socket?.close(1000, 'Fighter Arena page closed'); } catch {}
    socket = null;
    unlock();
  }, { once: true });
})();
