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

  // Keep one product identity visible even while the proven V6.6 compatibility
  // layer initializes internally. Legacy module labels are implementation details.
  const buildTag = document.querySelector('.build-tag');
  const keepSingleBuildTag = () => {
    if (buildTag && buildTag.textContent !== 'STABLE INTEGRATED') buildTag.textContent = 'STABLE INTEGRATED';
  };
  keepSingleBuildTag();
  if (buildTag) new MutationObserver(keepSingleBuildTag).observe(buildTag, { childList: true, characterData: true, subtree: true });

  const toastHost = document.querySelector('#toast');
  const removeLegacyVersionToasts = () => {
    for (const el of document.querySelectorAll('#toast .toast')) {
      if (/V6\.4 LIVING KINGDOMS loaded/i.test(el.textContent || '')) el.remove();
    }
  };
  if (toastHost) new MutationObserver(removeLegacyVersionToasts).observe(toastHost, { childList: true, subtree: true });

  const finalizeIdentity = () => {
    if (!window.__SIM?.__gwIntegratedBattleInstalled) {
      setTimeout(finalizeIdentity, 50);
      return;
    }
    window.__BUILD_VERSION = 'stable-integrated-1';
    document.documentElement.dataset.build = 'stable-integrated-1';
    keepSingleBuildTag();
    removeLegacyVersionToasts();
  };
  finalizeIdentity();
})();
