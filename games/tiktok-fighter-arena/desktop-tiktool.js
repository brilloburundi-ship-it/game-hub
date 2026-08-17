(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const USER_STORAGE_KEY = 'fighter_arena_live_user';
  const CONFIG_ENDPOINT = './api/tiktool/client-config';
  const RECONNECT_MS = 3500;
  const ROOMINFO_TIMEOUT_MS = 20000;
  const JOIN_COMMANDS = new Set(['join', 'me', 'play', 'fight', 'entra', 'gioca', 'combatti', 'arena']);
  const giftProgress = new Map();
  const queuedEvents = [];

  let socket = null;
  let reconnectTimer = null;
  let roomInfoTimer = null;
  let connecting = false;
  let connected = false;
  let manualStop = false;
  let liveUser = '';
  let roomId = '';
  let eventsReceived = 0;
  let lastRaw = null;
  let lastNormalized = null;
  let lastError = '';

  const dot = () => document.querySelector('#tiktoolStatusDot');
  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

  function cleanCreator(value) {
    return String(value || '').replace(/^@/, '').trim().slice(0, 32);
  }

  function setStatus(state, message) {
    connected = state === 'connected';
    document.documentElement.dataset.fighterBridgeStatus = state;
    document.documentElement.dataset.fighterBridgeTransport = 'tiktool-browser-direct-v3';
    document.documentElement.dataset.fighterBridgeEvents = String(eventsReceived);
    const el = dot();
    if (!el) return;
    el.classList.toggle('is-connected', state === 'connected');
    el.classList.toggle('is-waiting', state === 'waiting');
    el.classList.toggle('is-disconnected', state === 'disconnected');
    el.style.backgroundColor = state === 'connected' ? '#2bd96b' : state === 'waiting' ? '#f4c542' : '#ff3b4f';
    el.setAttribute('aria-label', message);
    el.title = message;
  }

  function pulseEvent() {
    const el = dot();
    if (!el) return;
    el.animate?.([
      { transform: 'scale(1)', boxShadow: '0 1px 5px rgba(0,0,0,.75)' },
      { transform: 'scale(1.65)', boxShadow: '0 0 12px rgba(90,255,155,.95)' },
      { transform: 'scale(1)', boxShadow: '0 1px 5px rgba(0,0,0,.75)' }
    ], { duration: 260, easing: 'ease-out' });
  }

  function loadCreator() {
    const supplied = cleanCreator(params.get('liveUser') || params.get('tiktokUser') || params.get('creator'));
    if (supplied) localStorage.setItem(USER_STORAGE_KEY, supplied);
    liveUser = supplied || cleanCreator(localStorage.getItem(USER_STORAGE_KEY));
    return liveUser;
  }

  function promptCreator() {
    const answer = window.prompt('Username TikTok della LIVE (senza @):', liveUser ? `@${liveUser}` : '');
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
      user.secUid || user.sec_uid || user.id || user.userId || data?.senderUserId || data?.sender_user_id ||
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
    const eventName = String(raw.event || raw.type || data.type || '').trim().toLowerCase();
    const compact = eventName.replace(/[\s_-]+/g, '');
    if (!compact || compact === 'roominfo' || compact === 'connected') return null;
    if (compact.includes('roomuser') || compact.includes('viewercount')) return null;

    const base = identity(data);

    if (compact === 'chat' || compact.includes('comment')) {
      const comment = String(data.comment ?? data.text ?? data.content ?? '').trim();
      const command = commandOf(comment);
      if (!command) return null;
      return { type: 'join', payload: { ...base, comment, command, sourceEvent: eventName } };
    }

    if (compact === 'member' || compact.includes('viewerenter') || compact === 'join' || compact === 'enter') {
      return { type: 'join', payload: base };
    }

    if (compact === 'like' || compact.includes('likeevent')) {
      return {
        type: 'like',
        payload: { ...base, count: Math.max(1, Number(data.likeCount ?? data.like_count ?? data.count ?? 1) || 1) }
      };
    }

    const action = String(data?.action || '').trim().toLowerCase();
    if (compact === 'follow' || (compact === 'social' && action === 'follow')) {
      return { type: 'follow', payload: base };
    }

    if (compact === 'gift' || compact.includes('giftevent')) {
      const payload = giftPayload(data, base);
      return payload ? { type: 'gift', payload } : null;
    }

    return null;
  }

  function gameReady() {
    return window.__fighterArenaReady === true && Boolean(window.FighterArenaBridge?.emit);
  }

  function deliver(event) {
    if (!event) return;
    if (!gameReady()) {
      queuedEvents.push(event);
      if (queuedEvents.length > 500) queuedEvents.shift();
      return;
    }
    window.FighterArenaBridge.emit(event.type, event.payload);
  }

  function markLive(message) {
    clearTimeout(roomInfoTimer);
    roomInfoTimer = null;
    setStatus('connected', message);
  }

  function handleMessage(raw) {
    if (!isObject(raw)) return;
    lastRaw = raw;
    const eventName = String(raw.event || raw.type || '').trim().toLowerCase();

    if (eventName === 'roominfo') {
      roomId = String(raw.roomId || raw.data?.roomId || raw.data?.room_id || '');
      markLive(`TikTool: LIVE @${liveUser}${roomId ? ` · room ${roomId}` : ''} · 0 eventi`);
      return;
    }

    if (eventName === 'control' && Number(raw.data?.action ?? raw.action) === 3) {
      setStatus('waiting', `TikTool: LIVE terminata @${liveUser} · attendo riavvio`);
      try { socket?.close(); } catch {}
      return;
    }

    const normalized = normalize(raw);
    lastNormalized = normalized;
    if (!normalized) return;

    eventsReceived += 1;
    if (!connected) markLive(`TikTool: eventi LIVE ricevuti da @${liveUser}`);
    deliver(normalized);
    pulseEvent();
    setStatus('connected', `TikTool: LIVE @${liveUser} · ${eventsReceived} eventi ricevuti`);
  }

  function parseMessage(data) {
    if (typeof data === 'string') {
      try { handleMessage(JSON.parse(data)); }
      catch (error) { lastError = `JSON: ${error?.message || error}`; }
      return;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.text().then(parseMessage).catch(error => { lastError = String(error?.message || error); });
      return;
    }
    if (isObject(data)) handleMessage(data);
  }

  function flushQueue() {
    if (!gameReady()) return false;
    while (queuedEvents.length) deliver(queuedEvents.shift());
    return true;
  }

  async function getConfig() {
    const response = await fetch(`${CONFIG_ENDPOINT}?uniqueId=${encodeURIComponent(liveUser)}`, {
      cache: 'no-store', credentials: 'same-origin'
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.error || `TikTool config ${response.status}`);
    if (!payload?.apiKey || !payload?.wsUrl) throw new Error('TikTool config incompleta');
    return payload;
  }

  function clearTimers() {
    clearTimeout(reconnectTimer);
    clearTimeout(roomInfoTimer);
    reconnectTimer = null;
    roomInfoTimer = null;
  }

  function scheduleReconnect(delay = RECONNECT_MS) {
    if (manualStop || !liveUser) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
  }

  function closeSocket(reason = 'Fighter Arena reconnect') {
    try { socket?.close(1000, reason); } catch {}
    socket = null;
    connecting = false;
    connected = false;
  }

  async function connect() {
    if (manualStop) manualStop = false;
    if (!liveUser && !loadCreator()) {
      setStatus('disconnected', 'TikTool: manca @username · clicca il pallino rosso');
      return;
    }
    if (connecting || socket) return;

    clearTimers();
    connecting = true;
    lastError = '';
    roomId = '';
    setStatus('waiting', `TikTool: collegamento diretto a @${liveUser}…`);

    try {
      const config = await getConfig();
      if (manualStop) { connecting = false; return; }
      const wsUrl = new URL(config.wsUrl);
      wsUrl.searchParams.set('uniqueId', liveUser);
      wsUrl.searchParams.set('apiKey', config.apiKey);
      socket = new WebSocket(wsUrl.toString());

      socket.addEventListener('open', () => {
        connecting = false;
        setStatus('waiting', `TikTool: socket aperto · aggancio LIVE @${liveUser}…`);
        roomInfoTimer = setTimeout(() => {
          if (!connected && socket) {
            lastError = 'roomInfo timeout';
            setStatus('waiting', `TikTool: LIVE non agganciata · nuovo tentativo @${liveUser}`);
            try { socket.close(); } catch {}
          }
        }, ROOMINFO_TIMEOUT_MS);
      }, { once: true });

      socket.addEventListener('message', event => parseMessage(event.data));

      socket.addEventListener('close', event => {
        clearTimeout(roomInfoTimer);
        roomInfoTimer = null;
        socket = null;
        connecting = false;
        connected = false;
        if (manualStop) return;
        const reason = String(event.reason || '').trim();
        lastError = reason || `WebSocket closed (${event.code || 0})`;
        setStatus('waiting', reason ? `TikTool: ${reason} · ritento` : `TikTool: riconnessione LIVE @${liveUser}…`);
        scheduleReconnect();
      }, { once: true });

      socket.addEventListener('error', () => {
        lastError = 'WebSocket error';
        setStatus('disconnected', `TikTool: errore socket · ritento automaticamente`);
      });
    } catch (error) {
      socket = null;
      connecting = false;
      connected = false;
      lastError = error?.message || 'TikTool connection error';
      setStatus('disconnected', `TikTool: ${lastError} · ritento automaticamente`);
      scheduleReconnect(5000);
    }
  }

  function disconnect() {
    manualStop = true;
    clearTimers();
    closeSocket('Fighter Arena disconnect');
    setStatus('disconnected', liveUser ? `TikTool: disconnesso da @${liveUser}` : 'TikTool: disconnesso');
  }

  function reconnect() {
    manualStop = false;
    clearTimers();
    closeSocket('Fighter Arena reconnect');
    setStatus('waiting', `TikTool: nuovo collegamento a @${liveUser}…`);
    setTimeout(connect, 100);
  }

  function changeCreator() {
    if (!promptCreator()) return;
    reconnect();
  }

  window.FighterArenaTikTool = {
    connect, disconnect, reconnect, changeCreator, normalize, flushQueue,
    get socket() { return socket; },
    get connected() { return connected; },
    get liveUser() { return liveUser; },
    get roomId() { return roomId; },
    get eventsReceived() { return eventsReceived; },
    get lastRaw() { return lastRaw; },
    get lastNormalized() { return lastNormalized; },
    get lastError() { return lastError; },
    transport: 'tiktool-browser-direct-v3'
  };
  window.FighterArenaLiveBridge = window.FighterArenaTikTool;

  const readyTimer = setInterval(() => {
    if (!flushQueue()) return;
    clearInterval(readyTimer);
  }, 100);

  const statusDot = dot();
  if (statusDot) {
    statusDot.addEventListener('click', () => {
      if (!liveUser) changeCreator(); else if (!connected && !connecting) reconnect();
    });
    statusDot.addEventListener('dblclick', event => {
      event.preventDefault();
      changeCreator();
    });
  }

  loadCreator();
  if (liveUser) {
    setStatus('waiting', `TikTool: connessione diretta a @${liveUser}…`);
    connect();
  } else {
    setStatus('disconnected', 'TikTool: manca @username · clicca il pallino rosso');
  }

  window.addEventListener('beforeunload', () => {
    manualStop = true;
    clearTimers();
    try { socket?.close(1000, 'Fighter Arena page closed'); } catch {}
  }, { once: true });
})();
