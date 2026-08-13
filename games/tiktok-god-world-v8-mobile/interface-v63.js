(() => {
  'use strict';
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
    ['⚔️', 'ATTACK name = declare war']
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
