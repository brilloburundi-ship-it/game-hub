(() => {
  'use strict';

  // Load the final war policy independently from the legacy command UI. The patch
  // waits for the physical-war runtime before installing, so existing script order
  // and all non-war systems remain unchanged.
  if (!document.querySelector('script[data-kw2-auto-war-performance]')) {
    const script = document.createElement('script');
    script.src = 'live-auto-war-performance.js?v=20260814-auto-war-performance-1';
    script.async = true;
    script.dataset.kw2AutoWarPerformance = '1';
    document.head.appendChild(script);
  }

  const commands = [
    ['👑', 'JOIN = create your kingdom'],
    ['❤️', 'LIKE = speed up the economy'],
    ['🔨', 'FOLLOW = builders and materials'],
    ['🌹', 'ROSE = +100 power, food and gold'],
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
    ['🤝', 'ALLY name = form an alliance']
  ];
  const icon = document.querySelector('#commandIcon');
  const text = document.querySelector('#bridgeText');
  if (!icon || !text) return;
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
})();
