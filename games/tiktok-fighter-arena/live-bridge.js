(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const USER_STORAGE_KEY = 'fighter_arena_live_user';
  const DEBUG_STORAGE_KEY = 'fighter_arena_bridge_debug';
  const CONNECT_API = 'https://tik.tools/api/live/connect';
  const LEGACY_SRC = './lan-bridge.js?v=1.4.0-direct-tikfinity';
  const JOIN_COMMANDS = new Set(['join', 'me', 'play', 'fight', 'entra', 'gioca', 'combatti', 'arena']);
  const DEBUG = params.get('bridgeDebug') === '1' || localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  const forceLocal = params.get('bridge') === 'local' || params.get('cloudBridge') === '0';

  const suppliedUser = String(
    params.get('liveUser') || params.get('tiktokUser') || params.get('creator') || ''
  ).replace(/^@/, '').trim();
  if (suppliedUser) localStorage.setItem(USER_STORAGE_KEY, suppliedUser);
  const liveUser = suppliedUser || String(localStorage.getItem(USER_STORAGE_KEY) || '').replace(/^@/, '').trim();

  function status(text, state = 'offline') {
    document.documentElement.dataset.fighterBridgeStatus = state;
    document.documentElement.dataset.fighterBridgeTransport = forceLocal || !liveUser ? 'local' : 'cloud';
    const el = document.querySelector('#liveBridgeState');
    if (el) el.textContent = `LIVE bridge: ${text}`;
  }

  function loadLegacyBridge() {
    status(liveUser ? 'local fallback selected' : 'cloud username not configured · local fallback', 'waiting');
    const script = document.createElement('script');
    script.src = LEGACY_SRC;
    script.async = false;
    script.dataset.fighterBridgeTransport = 'legacy';
    script.onerror = () => status('local LIVE bridge unavailable', 'inactive');
    document.head.appendChild(script);
  }

  if (forceLocal || !liveUser) {
    loadLegacyBridge();
    return;
  }

  const queuedEvents = [];
  const giftProgress = new Map();
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let manuallyDisconnected = false;
  let connecting = false;
  let lastRaw = null;
  let lastNormalized = null;

  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

  function cleanUsername(value) {
    return String(value || '').replace(/^@/, '').trim().slice(0, 32) || 'Viewer';
  }

  function identity(data) {
    const user = isObject(data?.user) ? data.user : {};
    const username = cleanUsername(
      user.uniqueId || user.unique_id || data?.uniqueId || data?.unique_id || data?.user_unique_id ||
      user.nickname || data?.nickname || data?.username
    );
    const userId = String(
      user.secUid || user.sec_uid || user.id || data?.senderUserId || data?.sender_user_id ||
      data?.userId || data?.user_id || `viewer:${username.toLowerCase()}`
    );
    return { userId, username, uniqueId: username };
  }

  function commandOf(comment) {
    const first = String(comment || '').trim().toLowerCase().split(/\s+/)[0].replace(/^[!/.#]+/, '');
    return JOIN_COMMANDS.has(first) ? first : '';
  }

  function giftPayload(data, base) {
    const giftName = String(data?.giftName || data?.gift_name || data?.gift?.name || 'gift');
    const totalRepeat = Math.max(1, Number(data?.repeatCount ?? data?.repeat_count ?? data?.count ?? 1) || 1);
    const transaction = String(data?.transactionId || data?.transaction_id || data?.groupId || data?.group_id || '');
    let repeatCount = totalRepeat;

    if (transaction) {
      const key = `${base.userId}|${transaction}`;
      const previous = giftProgress.get(key) || 0;
      if (totalRepeat <= previous) return null;
      repeatCount = totalRepeat - previous;
      giftProgress.set(key, totalRepeat);
      if (giftProgress.size > 500) giftProgress.delete(giftProgress.keys().next().value);
    } else if (data?.repeatEnd === false || data?.repeat_end === false) {
      return null;
    }

    const diamondCount = Math.max(1, Number(
      data?.diamondCount ?? data?.diamond_count ?? data?.gift?.diamondCount ?? data?.gift?.diamond_count ?? 1
    ) || 1);
    return { ...base, giftName, diamondCount, repeatCount };
  }

  function normalize(raw) {
    if (!isObject(raw)) return null;
    const data = isObject(raw.data) ? raw.data : raw;
    const eventName = String(raw.event || raw.type || data.type || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (!eventName || eventName === 'roominfo' || eventName === 'connected') return null;

    if (eventName.includes('roomuser') || eventName.includes('viewercount')) {
      return {
        type: 'roomuser',
        payload: { viewerCount: Math.max(0, Number(data.viewerCount ?? data.viewer_count ?? data.count ?? 0) || 0) }
      };
    }

    const base = identity(data);
    if (['leave', 'memberleave', 'viewerleave', 'exit'].some(name => eventName.includes(name))) {
      return { type: 'leave', payload: base };
    }

    if (eventName.includes('chat') || eventName.includes('comment')) {
      const comment = String(data.comment ?? data.text ?? data.content ?? '').trim();
      return { type: 'join', payload: { ...base, comment, command: commandOf(comment), sourceEvent: eventName } };
    }

    if (eventName.includes('member') || eventName.includes('join') || eventName.includes('enter')) {
      return { type: 'join', payload: base };
    }

    if (eventName.includes('like')) {
      return {
        type: 'like',
        payload: { ...base, count: Math.max(1, Number(data.likeCount ?? data.like_count ?? data.count ?? 1) || 1) }
      };
    }

    if (eventName.includes('follow') || (eventName.includes('social') && String(data.action || '').toLowerCase().includes('follow'))) {
      return { type: 'follow', payload: base };
    }

    if (eventName.includes('gift')) {
      const payload = giftPayload(data, base);
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
    if (DEBUG) console.debug('[Fighter Arena cloud]', raw, '=>', event);
    if (!event || event.type === 'roomuser') return;
    if (!gameReady()) {
      queuedEvents.push(event);
      if (queuedEvents.length > 300) queuedEvents.shift();
      return;
    }
    window.FighterArenaBridge.emit(event.type, event.payload);
  }

  function flushQueue() {
    if (!gameReady()) return false;
    while (queuedEvents.length) {
      const event = queuedEvents.shift();
      window.FighterArenaBridge.emit(event.type, event.payload);
    }
    return true;
  }

  function parseMessage(data) {
    if (typeof data === 'string') {
      try { deliver(JSON.parse(data)); }
      catch (error) { if (DEBUG) console.warn('[Fighter Arena cloud] Invalid JSON', error); }
      return;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.text().then(parseMessage).catch(() => {});
      return;
    }
    if (isObject(data) || Array.isArray(data)) deliver(data);
  }

  function reconnectDelay() {
    const steps = [1500, 2500, 4000, 6000, 9000, 12000];
    return steps[Math.min(reconnectAttempt, steps.length - 1)];
  }

  function scheduleReconnect(reason = 'reconnecting') {
    if (manuallyDisconnected) return;
    clearTimeout(reconnectTimer);
    const delay = reconnectDelay();
    reconnectAttempt += 1;
    status(`cloud @${liveUser} ${reason}…`, 'reconnecting');
    reconnectTimer = setTimeout(connectCloud, delay);
  }

  async function fetchCloudTicket() {
    const url = `${CONNECT_API}?uniqueId=${encodeURIComponent(liveUser)}`;
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.message || payload?.error || `Cloud auth ${response.status}`);
    if (!payload?.token || !payload?.wsUrl) throw new Error('Cloud auth response incomplete');
    if (payload.stream && payload.stream.alive === false) {
      const error = new Error(`@${liveUser} is not LIVE`);
      error.code = 'NOT_LIVE';
      throw error;
    }
    return payload;
  }

  async function connectCloud() {
    if (connecting || manuallyDisconnected) return;
    connecting = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { socket?.close(); } catch {}
    socket = null;
    status(`connecting cloud @${liveUser}…`, 'connecting');

    try {
      const ticket = await fetchCloudTicket();
      const wsUrl = new URL(ticket.wsUrl);
      wsUrl.searchParams.set('uniqueId', liveUser);
      wsUrl.searchParams.set('jwtKey', ticket.token);
      socket = new WebSocket(wsUrl.toString());

      socket.addEventListener('open', () => {
        reconnectAttempt = 0;
        status(`cloud @${liveUser} online`, 'online');
        if (DEBUG) console.info(`[Fighter Arena cloud] connected @${liveUser}`);
      });
      socket.addEventListener('message', event => parseMessage(event.data));
      socket.addEventListener('close', () => {
        socket = null;
        scheduleReconnect('reconnecting');
      }, { once: true });
      socket.addEventListener('error', () => {
        try { socket?.close(); } catch { scheduleReconnect('reconnecting'); }
      }, { once: true });
    } catch (error) {
      if (DEBUG) console.warn('[Fighter Arena cloud] connect failed', error);
      const notLive = error?.code === 'NOT_LIVE';
      status(notLive ? `@${liveUser} is not LIVE` : `cloud unavailable · retrying @${liveUser}`, notLive ? 'waiting' : 'reconnecting');
      reconnectAttempt = Math.max(reconnectAttempt, notLive ? 3 : reconnectAttempt);
      scheduleReconnect(notLive ? 'waiting for LIVE' : 'reconnecting');
    } finally {
      connecting = false;
    }
  }

  function disconnect({ reconnect = false } = {}) {
    manuallyDisconnected = !reconnect;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { socket?.close(); } catch {}
    socket = null;
    if (reconnect) {
      manuallyDisconnected = false;
      reconnectAttempt = 0;
      connectCloud();
    } else {
      status('cloud LIVE bridge disconnected', 'inactive');
    }
  }

  window.FighterArenaCloudBridge = {
    normalize,
    flushQueue,
    reconnect: () => disconnect({ reconnect: true }),
    disconnect,
    pending: queuedEvents,
    get socket() { return socket; },
    get liveUser() { return liveUser; },
    get lastRaw() { return lastRaw; },
    get lastNormalized() { return lastNormalized; },
    transport: 'cloud-ws',
    debug: DEBUG
  };
  window.FighterArenaLiveBridge = window.FighterArenaCloudBridge;

  const readyTimer = setInterval(() => {
    if (!flushQueue()) return;
    clearInterval(readyTimer);
  }, 100);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket && !connecting && !manuallyDisconnected) {
      reconnectAttempt = 0;
      connectCloud();
    }
  });

  connectCloud();
})();
