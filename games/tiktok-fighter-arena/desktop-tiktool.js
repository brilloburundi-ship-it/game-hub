(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const USER_STORAGE_KEY = 'fighter_arena_live_user';
  const TOKEN_ENDPOINT = './api/tiktool/token';
  const WS_ENDPOINT = 'wss://api.tik.tools';
  const JOIN_COMMANDS = new Set(['join', 'me', 'play', 'fight', 'entra', 'gioca', 'combatti', 'arena']);
  const giftProgress = new Map();
  const queuedEvents = [];

  let socket = null;
  let connecting = false;
  let connected = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let manualStop = false;
  let liveUser = '';
  let lastRaw = null;
  let lastNormalized = null;

  const dot = () => document.querySelector('#tiktoolStatusDot');
  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

  function cleanCreator(value) {
    return String(value || '').replace(/^@/, '').trim().slice(0, 32);
  }

  function setStatus(isConnected, message) {
    connected = Boolean(isConnected);
    document.documentElement.dataset.fighterBridgeStatus = connected ? 'online' : 'offline';
    document.documentElement.dataset.fighterBridgeTransport = 'tiktool-cloud';
    const el = dot();
    if (!el) return;
    el.classList.toggle('is-connected', connected);
    el.classList.toggle('is-disconnected', !connected);
    el.setAttribute('aria-label', message);
    el.title = message;
  }

  function loadCreator() {
    const supplied = cleanCreator(params.get('liveUser') || params.get('tiktokUser') || params.get('creator'));
    if (supplied) localStorage.setItem(USER_STORAGE_KEY, supplied);
    liveUser = supplied || cleanCreator(localStorage.getItem(USER_STORAGE_KEY));
    return liveUser;
  }

  function promptCreator() {
    const current = liveUser ? `@${liveUser}` : '';
    const answer = window.prompt('Username TikTok della LIVE (senza @):', current);
    if (answer === null) return false;
    const next = cleanCreator(answer);
    if (!next) return false;
    liveUser = next;
    localStorage.setItem(USER_STORAGE_KEY, liveUser);
    return true;
  }

  function identity(data) {
    const user = isObject(data?.user) ? data.user : {};
    const username = cleanCreator(
      user.uniqueId || user.unique_id || data?.uniqueId || data?.unique_id || data?.user_unique_id ||
      user.nickname || data?.nickname || data?.username
    ) || 'Viewer';
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

    if (eventName.includes('roomuser') || eventName.includes('viewercount')) return null;

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
    if (!event) return;
    if (!gameReady()) {
      queuedEvents.push(event);
      if (queuedEvents.length > 400) queuedEvents.shift();
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
      try { deliver(JSON.parse(data)); } catch {}
      return;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.text().then(parseMessage).catch(() => {});
      return;
    }
    if (isObject(data) || Array.isArray(data)) deliver(data);
  }

  function reconnectDelay() {
    const delays = [1200, 2200, 3500, 5000, 8000, 12000];
    return delays[Math.min(reconnectAttempt, delays.length - 1)];
  }

  function scheduleReconnect() {
    if (manualStop || !liveUser) return;
    clearTimeout(reconnectTimer);
    setStatus(false, `TikTool: disconnesso da @${liveUser} · riconnessione automatica`);
    const delay = reconnectDelay();
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  async function getTicket() {
    const response = await fetch(`${TOKEN_ENDPOINT}?uniqueId=${encodeURIComponent(liveUser)}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.error || `TikTool auth ${response.status}`);
    if (!payload?.token) throw new Error('TikTool token missing');
    return payload;
  }

  async function connect() {
    if (connecting || connected || manualStop) return;
    if (!liveUser && !loadCreator()) {
      setStatus(false, 'TikTool: disconnesso · clicca il pallino rosso per impostare @username');
      return;
    }

    connecting = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    setStatus(false, `TikTool: connessione a @${liveUser}…`);

    try {
      try { socket?.close(); } catch {}
      socket = null;
      const ticket = await getTicket();
      const wsUrl = new URL(ticket.wsUrl || WS_ENDPOINT);
      wsUrl.searchParams.set('uniqueId', liveUser);
      wsUrl.searchParams.set('jwtKey', ticket.token);
      socket = new WebSocket(wsUrl.toString());

      socket.addEventListener('open', () => {
        connecting = false;
        reconnectAttempt = 0;
        setStatus(true, `TikTool: connesso a @${liveUser}`);
      }, { once: true });

      socket.addEventListener('message', event => parseMessage(event.data));

      socket.addEventListener('close', () => {
        socket = null;
        connecting = false;
        connected = false;
        scheduleReconnect();
      }, { once: true });

      socket.addEventListener('error', () => {
        setStatus(false, `TikTool: errore di connessione @${liveUser}`);
        try { socket?.close(); } catch {
          socket = null;
          connecting = false;
          connected = false;
          scheduleReconnect();
        }
      }, { once: true });
    } catch (error) {
      socket = null;
      connecting = false;
      connected = false;
      setStatus(false, `TikTool: disconnesso · ${error?.message || 'errore'}`);
      scheduleReconnect();
    }
  }

  function disconnect() {
    manualStop = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { socket?.close(1000, 'Fighter Arena disconnect'); } catch {}
    socket = null;
    connecting = false;
    connected = false;
    setStatus(false, liveUser ? `TikTool: disconnesso da @${liveUser}` : 'TikTool: disconnesso');
  }

  function reconnect() {
    manualStop = false;
    reconnectAttempt = 0;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { socket?.close(); } catch {}
    socket = null;
    connecting = false;
    connected = false;
    connect();
  }

  function changeCreator() {
    if (!promptCreator()) return;
    manualStop = false;
    reconnectAttempt = 0;
    try { socket?.close(); } catch {}
    socket = null;
    connecting = false;
    connected = false;
    connect();
  }

  window.FighterArenaTikTool = {
    connect,
    disconnect,
    reconnect,
    changeCreator,
    normalize,
    flushQueue,
    get socket() { return socket; },
    get connected() { return connected; },
    get liveUser() { return liveUser; },
    get lastRaw() { return lastRaw; },
    get lastNormalized() { return lastNormalized; },
    transport: 'tiktool-cloud'
  };
  window.FighterArenaLiveBridge = window.FighterArenaTikTool;

  const readyTimer = setInterval(() => {
    if (!flushQueue()) return;
    clearInterval(readyTimer);
  }, 100);

  const statusDot = dot();
  if (statusDot) {
    statusDot.addEventListener('click', () => {
      if (!liveUser) {
        changeCreator();
        return;
      }
      if (!connected && !connecting) reconnect();
    });
    statusDot.addEventListener('dblclick', event => {
      event.preventDefault();
      changeCreator();
    });
  }

  loadCreator();
  if (liveUser) {
    setStatus(false, `TikTool: connessione a @${liveUser}…`);
    connect();
  } else {
    setStatus(false, 'TikTool: disconnesso · clicca il pallino rosso per impostare @username');
  }

  window.addEventListener('beforeunload', () => {
    manualStop = true;
    clearTimeout(reconnectTimer);
    try { socket?.close(1000, 'Fighter Arena page closed'); } catch {}
  }, { once: true });
})();
