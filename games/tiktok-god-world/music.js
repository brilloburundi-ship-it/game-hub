(() => {
  'use strict';

  const audio = document.querySelector('#bgMusic');
  if (!audio) return;

  if (!audio.getAttribute('src')) audio.src = 'assets/audio/medieval-market-full.mp3';
  audio.loop = true;
  audio.preload = 'metadata';
  audio.volume = 1;
  audio.muted = false;
  audio.playsInline = true;

  let started = false;
  let starting = false;
  const unlockEvents = ['pointerdown', 'keydown'];

  const mark = state => {
    document.documentElement.dataset.music = state;
    window.__MUSIC_STATUS = { state, time: audio.currentTime, readyState: audio.readyState };
  };

  const removeUnlockListeners = () => {
    for (const eventName of unlockEvents) document.removeEventListener(eventName, unlock, true);
  };

  const startMusic = async () => {
    if (starting) return false;
    if (!audio.paused && !audio.ended) {
      started = true;
      mark('playing');
      return true;
    }
    starting = true;
    try {
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      started = true;
      localStorage.setItem('godworld_music_started', '1');
      mark('playing');
      removeUnlockListeners();
      return true;
    } catch (_) {
      mark('waiting-gesture');
      return false;
    } finally {
      starting = false;
    }
  };

  function unlock() {
    if (started || starting) return;
    void startMusic();
  }

  for (const eventName of unlockEvents) {
    document.addEventListener(eventName, unlock, { capture: true, passive: true });
  }

  window.addEventListener('pageshow', () => {
    if (started || localStorage.getItem('godworld_music_started') === '1') void startMusic();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && started) void startMusic();
  });
  audio.addEventListener('play', () => {
    started = true;
    localStorage.setItem('godworld_music_started', '1');
    mark('playing');
    removeUnlockListeners();
  });
  audio.addEventListener('pause', () => mark(started ? 'paused' : 'waiting-gesture'));
  audio.addEventListener('ended', () => {
    audio.currentTime = 0;
    if (started) void startMusic();
  });
  audio.addEventListener('error', () => mark('error'));

  mark('waiting-gesture');
})();
