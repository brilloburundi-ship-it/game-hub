(() => {
  'use strict';

  const commands = [
    ['👑', 'JOIN = create your kingdom'],
    ['❤️', 'LIKE = speed up the economy'],
    ['🔨', 'FOLLOW = builders and materials'],
    ['🌹', 'ROSE = food and gold'],
    ['🍦', 'ICE CREAM = food and population'],
    ['☕', 'COFFEE / DOUGHNUT = food boost'],
    ['💞', 'HEART ME = new citizens'],
    ['🫰', 'FINGER HEART = economy boost'],
    ['✨', 'PERFUME = gold and stone'],
    ['🎆', 'FIREWORKS = resource burst'],
    ['🦢', 'SWAN = instant development help'],
    ['🎤', 'CONCERT = big development help'],
    ['💰', 'MONEY GUN / TRAIN = big instant help'],
    ['✈️', 'PRIVATE JET = big instant help'],
    ['🏎️', 'SPORTS CAR = instant buildings'],
    ['🛥️', 'YACHT = instant buildings'],
    ['🐋', 'WHALE DIVING = instant buildings'],
    ['☄️', 'METEOR = mega development help'],
    ['🚀', 'ROCKET / PLANET = mega development help'],
    ['🎵', 'TIKTOK = resources and speed'],
    ['🌌', 'GALAXY = instant city boost'],
    ['🦁', 'LION = royal army and city'],
    ['🐉', 'DRAGON = legendary kingdom boost'],
    ['🌠', 'UNIVERSE = legendary kingdom boost'],
    ['🔥', 'PHOENIX / INTERSTELLAR = legendary boost'],
    ['🏰', 'CASTLE FANTASY = legendary boost'],
    ['⚔️', 'ATTACK name = declare war']
  ];

  const icon = document.querySelector('#commandIcon');
  const text = document.querySelector('#bridgeText');
  if (icon && text) {
    let index = 0;
    const paint = () => {
      const [symbol, label] = commands[index++ % commands.length];
      icon.textContent = symbol;
      text.textContent = label;
      text.classList.remove('command-pop');
      requestAnimationFrame(() => text.classList.add('command-pop'));
    };
    paint();
    setInterval(paint, 4200);
  }

  // The stable V6.6 battle base keeps its internal compatibility flags, but the
  // player must see one product identity only. Finalize the visible identity once
  // the integrated battle authority is installed.
  const finalizeIdentity = () => {
    if (!window.__SIM?.__gwIntegratedBattleInstalled) {
      setTimeout(finalizeIdentity, 50);
      return;
    }
    window.__BUILD_VERSION = 'stable-integrated-1';
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'STABLE INTEGRATED';
    document.documentElement.dataset.build = 'stable-integrated-1';
    for (const el of document.querySelectorAll('#toast .toast')) {
      if (/V6\.4 LIVING KINGDOMS loaded/i.test(el.textContent || '')) el.remove();
    }
  };
  finalizeIdentity();
})();
