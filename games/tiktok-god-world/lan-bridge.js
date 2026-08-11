(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const suppliedToken = params.get('token');
  if (suppliedToken) localStorage.setItem('godworld_pixel_bridge_token', suppliedToken);
  const token = suppliedToken || localStorage.getItem('godworld_pixel_bridge_token') || '';
  const queuedEvents = [];

  function setStatus(label, color) {
    const dot = document.querySelector('#bridgeDot');
    if (dot) dot.style.background = color;
    document.documentElement.dataset.bridgeStatus = label;
  }

  function deliver(payload) {
    if (payload?.__bridgeStatus) {
      if (payload.__bridgeStatus === 'connected') setStatus('TikFinity online', '#45d66d');
      else setStatus('PC online · attesa TikFinity', '#d39d34');
      return;
    }
    if (!window.TikTokGodWorld) {
      queuedEvents.push(payload);
      return;
    }
    window.dispatchEvent(new CustomEvent('tiktok-event', { detail: payload }));
  }

  function flushQueue() {
    if (!window.TikTokGodWorld) return false;
    while (queuedEvents.length) {
      window.dispatchEvent(new CustomEvent('tiktok-event', { detail: queuedEvents.shift() }));
    }
    return true;
  }

  function connect() {
    if (!token) {
      setStatus('URL Safari incompleto', '#b33');
      return;
    }
    setStatus('collegamento al PC…', '#d39d34');
    const stream = new EventSource(`/bridge/events?token=${encodeURIComponent(token)}`);
    stream.onopen = () => setStatus('PC online · attesa TikFinity', '#d39d34');
    stream.onmessage = message => {
      try { deliver(JSON.parse(message.data)); }
      catch (error) { console.warn('[GodWorld LAN] Evento ignorato', error); }
    };
    stream.onerror = () => setStatus('PC bridge riconnessione', '#b33');
    window.GodWorldLanBridge = { stream, flushQueue };
  }

  const readyTimer = setInterval(() => {
    if (!flushQueue()) return;
    clearInterval(readyTimer);
    connect();
  }, 100);
})();
