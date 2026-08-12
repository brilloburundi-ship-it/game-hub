(() => {
  'use strict';

  const audio = document.querySelector('#bgMusic');
  if (!audio) return;

  // Il file è servito direttamente: Safari non dipende dal token o dalla
  // connessione TikFinity per riprodurre la colonna sonora.
  if (!audio.getAttribute('src')) audio.src = 'assets/audio/medieval-market-full.mp3';
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 1;
  audio.muted = false;
  audio.playsInline = true;
  audio.load();

  let started = false;
  const mark = state => {
    document.documentElement.dataset.music = state;
    window.__MUSIC_STATUS = { state, time: audio.currentTime, readyState: audio.readyState };
  };

  const startMusic = async () => {
    if (!audio.paused && !audio.ended) { mark('playing'); return true; }
    try {
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      started = true;
      mark('playing');
      return true;
    } catch (_) {
      mark('waiting-gesture');
      return false;
    }
  };

  // Safari/iPhone authorizes media only during a real user gesture. The first
  // touch anywhere on the map starts the full soundtrack, with no extra button.
  const unlock = () => {
    audio.muted = false;
    audio.volume = 1;
    void audio.play().then(() => {
      started = true;
      localStorage.setItem('godworld_music_started', '1');
      mark('playing');
    }).catch(() => mark('waiting-gesture'));
  };
  for (const eventName of ['touchstart', 'touchend', 'pointerdown', 'click']) {
    document.addEventListener(eventName, unlock, { capture: true, passive: true });
  }
  window.addEventListener('pageshow', () => { if (started || localStorage.getItem('godworld_music_started') === '1') startMusic(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && started) startMusic(); });
  audio.addEventListener('play', () => { started = true; localStorage.setItem('godworld_music_started', '1'); mark('playing'); });
  audio.addEventListener('pause', () => mark(started ? 'paused' : 'waiting-gesture'));
  audio.addEventListener('ended', () => { audio.currentTime = 0; startMusic(); });
  audio.addEventListener('error', () => mark('error'));
  startMusic();
})();
