(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const suppliedToken = params.get('token');
  const storageKey = 'fighter_arena_bridge_token';
  if (suppliedToken) localStorage.setItem(storageKey, suppliedToken);
  const token = suppliedToken || localStorage.getItem(storageKey) || '';
  const queuedEvents = [];
  const giftProgress = new Map();
  let stream = null;

  function status(text, state = 'offline') {
    document.documentElement.dataset.fighterBridgeStatus = state;
    const el = document.querySelector('#liveBridgeState');
    if (el) el.textContent = `LIVE bridge: ${text}`;
  }

  function payloadOf(raw) {
    const envelope = raw && typeof raw === 'object' ? raw : {};
    const nested = [envelope.data, envelope.eventData, envelope.payload]
      .find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
    return { envelope, data: { ...envelope, ...nested } };
  }

  function usernameOf(data) {
    return String(
      data.username ?? data.uniqueId ?? data.userId ??
      data.user?.uniqueId ?? data.user?.nickname ?? data.nickname ?? 'Viewer'
    ).replace(/^@/, '').trim().slice(0, 32) || 'Viewer';
  }

  function userIdOf(data, username) {
    return String(data.userId ?? data.user?.userId ?? data.user?.id ?? `viewer:${username.toLowerCase()}`);
  }

  function hasDirectIdentity(data) {
    return Boolean(
      data?.username || data?.uniqueId || data?.userId || data?.nickname ||
      data?.user?.uniqueId || data?.user?.userId || data?.user?.id || data?.user?.nickname
    );
  }

  function looksLikeJoin(eventName, data) {
    const action = String(data.action ?? data.memberAction ?? '').toLowerCase();
    const displayType = String(data.displayType ?? data.common?.displayType ?? '').toLowerCase();
    const label = String(data.label ?? '').toLowerCase();
    const actionId = Number(data.actionId ?? data.actionCode ?? 0);
    const namedJoin = ['member', 'viewerenter', 'viewerjoin', 'memberenter', 'memberjoin', 'userjoin', 'roomenter', 'enterroom', 'enter', 'join']
      .some(name => eventName.includes(name));
    const payloadJoin = action === 'join' || action === 'enter' || actionId === 1 ||
      displayType.includes('enter') || displayType.includes('joined') || label.includes(' joined');
    return hasDirectIdentity(data) && (namedJoin || payloadJoin);
  }

  function giftPayload(data, username, userId) {
    const details = data.giftDetails && typeof data.giftDetails === 'object' ? data.giftDetails : {};
    const gift = data.gift && typeof data.gift === 'object' ? data.gift : {};
    const extended = data.extendedGiftInfo && typeof data.extendedGiftInfo === 'object' ? data.extendedGiftInfo : {};
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
    const eventName = String(
      envelope.event ?? envelope.type ?? envelope.eventType ?? envelope.event_name ??
      data.event ?? data.type ?? data.eventType ?? ''
    ).toLowerCase();
    const username = usernameOf(data);
    const userId = userIdOf(data, username);
    const base = { userId, username, uniqueId: username };

    if (['viewerleave', 'memberleave', 'viewerexit', 'memberexit', 'leave', 'exit'].some(name => eventName.includes(name))) {
      return { type: 'leave', payload: base };
    }
    if (looksLikeJoin(eventName, data)) {
      return { type: 'join', payload: base };
    }
    if (eventName.includes('chat') || eventName.includes('comment') || data.comment || data.message) {
      const comment = String(data.comment ?? data.message ?? data.text ?? data.commentText ?? '').trim();
      return { type: 'join', payload: { ...base, comment } };
    }
    if (eventName.includes('like')) {
      return { type: 'like', payload: { ...base, count: Math.max(1, Number(data.likeCount ?? data.count ?? data.repeatCount ?? 1) || 1) } };
    }
    if (eventName.includes('follow') || (eventName.includes('social') && String(data.action ?? '').toLowerCase().includes('follow'))) {
      return { type: 'follow', payload: base };
    }
    if (eventName.includes('gift')) {
      const payload = giftPayload(data, username, userId);
      return payload ? { type: 'gift', payload } : null;
    }
    return null;
  }

  function gameReady() {
    return window.__fighterArenaReady === true && Boolean(window.FighterArenaBridge?.emit);
  }

  function deliver(raw) {
    if (raw?.__bridgeStatus) {
      if (raw.__bridgeStatus === 'connected') status('TikFinity online', 'online');
      else status('PC online · waiting for TikFinity', 'waiting');
      return;
    }
    const event = normalize(raw);
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
    window.FighterArenaLanBridge = { stream, flushQueue, normalize, reconnect: connect, pending: queuedEvents };
  }

  const readyTimer = setInterval(() => {
    if (!flushQueue()) return;
    clearInterval(readyTimer);
  }, 100);

  connect();
})();