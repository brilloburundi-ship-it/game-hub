(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const suppliedToken = params.get('token');
  const storageKey = 'fighter_arena_bridge_token';
  if (suppliedToken) localStorage.setItem(storageKey, suppliedToken);
  const token = suppliedToken || localStorage.getItem(storageKey) || '';
  const DEBUG = params.get('bridgeDebug') === '1' || localStorage.getItem('fighter_arena_bridge_debug') === '1';
  const queuedEvents = [];
  const giftProgress = new Map();
  const JOIN_COMMANDS = new Set(['join', 'me', 'play', 'fight', 'entra', 'gioca', 'combatti', 'arena']);
  let stream = null;
  let lastRaw = null;
  let lastNormalized = null;

  function status(text, state = 'offline') {
    document.documentElement.dataset.fighterBridgeStatus = state;
    const el = document.querySelector('#liveBridgeState');
    if (el) el.textContent = `LIVE bridge: ${text}`;
  }

  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

  function payloadOf(raw) {
    const envelope = isObject(raw) ? raw : {};
    const merged = { ...envelope };
    let current = envelope;
    const seen = new Set([current]);
    for (let depth = 0; depth < 4; depth++) {
      const nested = [current.data, current.eventData, current.payload, current.detail, current.body]
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
      data,
      data.user,
      data.userInfo,
      data.userData,
      data.author,
      data.sender,
      data.from,
      data.member,
      data.profile,
      data.owner
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
        if (value === undefined || value === null) continue;
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
    const stable = firstText(sources.slice(1), ['secUid', 'sec_uid', 'userId', 'user_id', 'id', 'uid']) ||
      firstText([data], ['userId', 'user_id', 'senderUserId', 'sender_user_id', 'gifterId', 'gifter_id', 'secUid', 'sec_uid']);
    return stable || `viewer:${username.toLowerCase()}`;
  }

  function hasDirectIdentity(data) {
    const sources = identitySources(data);
    return Boolean(
      firstText(sources, ['uniqueId', 'unique_id', 'username', 'userName', 'user_name', 'nickname', 'displayName', 'display_name']) ||
      firstText(sources.slice(1), ['secUid', 'sec_uid', 'userId', 'user_id', 'id', 'uid']) ||
      firstText([data], ['userId', 'user_id', 'senderUserId', 'sender_user_id'])
    );
  }

  function eventNameOf(envelope, data) {
    return String(
      envelope.event ?? envelope.type ?? envelope.eventType ?? envelope.event_name ?? envelope.eventName ??
      data.event ?? data.type ?? data.eventType ?? data.event_name ?? data.eventName ?? ''
    ).toLowerCase().replace(/[\s_-]+/g, '');
  }

  function commentOf(data) {
    return firstText([data], ['comment', 'message', 'text', 'commentText', 'comment_text', 'chatText', 'chat_text', 'content']);
  }

  function commandOf(comment) {
    const first = String(comment || '').trim().toLowerCase().split(/\s+/)[0].replace(/^[!/.#]+/, '');
    return JOIN_COMMANDS.has(first) ? first : '';
  }

  function looksLikeJoin(eventName, data) {
    const action = String(data.action ?? data.memberAction ?? data.actionName ?? '').toLowerCase();
    const displayType = String(data.displayType ?? data.common?.displayType ?? '').toLowerCase();
    const label = String(data.label ?? '').toLowerCase();
    const actionId = Number(data.actionId ?? data.actionCode ?? 0);
    const namedJoin = [
      'member', 'viewerenter', 'viewerjoin', 'memberenter', 'memberjoin', 'userjoin',
      'roomenter', 'enterroom', 'roomuserjoin', 'roomuserenter', 'enter', 'join'
    ].some(name => eventName.includes(name));
    const roomUserWithIdentity = eventName.includes('roomuser') && hasDirectIdentity(data);
    const payloadJoin = action === 'join' || action === 'enter' || action === 'joined' || actionId === 1 ||
      displayType.includes('enter') || displayType.includes('joined') || label.includes(' joined');
    return hasDirectIdentity(data) && (namedJoin || roomUserWithIdentity || payloadJoin);
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
      const giftType = Number(data.giftType ?? data.gift_type ?? details.giftType ?? details.gift_type);
      const repeatEndValue = data.repeatEnd ?? data.repeat_end ?? details.repeatEnd ?? details.repeat_end;
      const repeatEnded = repeatEndValue === true || repeatEndValue === 1 || String(repeatEndValue).toLowerCase() === 'true';
      if (giftType === 1 && !repeatEnded) return null;
    }

    const diamondCount = Math.max(1, Number(
      data.diamondCount ?? data.diamond_count ?? details.diamondCount ?? details.diamond_count ??
      gift.diamondCount ?? gift.diamond_count ?? extended.diamondCount ?? extended.diamond_count ??
      data.coins ?? details.coins ?? gift.coins ?? 1
    ) || 1);

    return { userId, username, giftName, diamondCount, repeatCount };
  }

  function normalize(raw) {
    const { envelope, data } = payloadOf(raw);
    const eventName = eventNameOf(envelope, data);
    const username = usernameOf(data);
    const userId = userIdOf(data, username);
    const base = { userId, username, uniqueId: username };
    const hasIdentity = hasDirectIdentity(data);
    const comment = commentOf(data);

    if (['viewerleave', 'memberleave', 'viewerexit', 'memberexit', 'leave', 'exit'].some(name => eventName.includes(name))) {
      return hasIdentity ? { type: 'leave', payload: base } : null;
    }
    if (looksLikeJoin(eventName, data)) {
      return { type: 'join', payload: base };
    }

    const chatLike = eventName.includes('chat') || eventName.includes('comment') || Boolean(comment);
    if (chatLike) {
      if (!hasIdentity) {
        if (DEBUG) console.warn('[Fighter Arena LAN] Chat event without user identity', raw);
        return null;
      }
      return { type: 'join', payload: { ...base, comment, command: commandOf(comment), sourceEvent: eventName || 'chat' } };
    }

    if (eventName.includes('like')) {
      return hasIdentity ? {
        type: 'like',
        payload: { ...base, count: Math.max(1, Number(data.likeCount ?? data.like_count ?? data.count ?? data.repeatCount ?? 1) || 1) }
      } : null;
    }
    if (eventName.includes('follow') || (eventName.includes('social') && String(data.action ?? '').toLowerCase().includes('follow'))) {
      return hasIdentity ? { type: 'follow', payload: base } : null;
    }
    if (eventName.includes('gift')) {
      if (!hasIdentity) return null;
      const payload = giftPayload(data, username, userId);
      return payload ? { type: 'gift', payload } : null;
    }
    return null;
  }

  function gameReady() {
    return window.__fighterArenaReady === true && Boolean(window.FighterArenaBridge?.emit);
  }

  function deliver(raw) {
    lastRaw = raw;
    if (raw?.__bridgeStatus) {
      if (raw.__bridgeStatus === 'connected') status('TikFinity online', 'online');
      else status('PC online · waiting for TikFinity', 'waiting');
      return;
    }
    const event = normalize(raw);
    lastNormalized = event;
    if (DEBUG) console.debug('[Fighter Arena LAN]', raw, '=>', event);
    if (!event) return;
    if (!gameReady()) {
      queuedEvents.push(event);
      if (queuedEvents.length > 300) queuedEvents.shift();
      return;
    }
    window.FighterArenaBridge.emit(event.type, event.payload);
  }

  function flushQueue() {
    if (!gameReady()) return false;
    const api = window.FighterArenaBridge;
    while (queuedEvents.length) {
      const event = queuedEvents.shift();
      api.emit(event.type, event.payload);
    }
    return true;
  }

  function connect() {
    if (!token) {
      status('local bridge not active — open the phone URL generated by the PC', 'inactive');
      return;
    }
    status('connecting to PC…', 'connecting');
    stream = new EventSource(`/bridge/events?token=${encodeURIComponent(token)}`);
    stream.onopen = () => status('PC online · waiting for TikFinity', 'waiting');
    stream.onmessage = message => {
      try { deliver(JSON.parse(message.data)); }
      catch (error) { console.warn('[Fighter Arena LAN] Event ignored', error); }
    };
    stream.onerror = () => status('PC bridge reconnecting…', 'reconnecting');
    window.FighterArenaLanBridge = {
      stream,
      flushQueue,
      normalize,
      reconnect: connect,
      pending: queuedEvents,
      get lastRaw() { return lastRaw; },
      get lastNormalized() { return lastNormalized; },
      debug: DEBUG,
      joinCommands: [...JOIN_COMMANDS]
    };
  }

  const readyTimer = setInterval(() => {
    if (!flushQueue()) return;
    clearInterval(readyTimer);
  }, 100);

  connect();
})();
