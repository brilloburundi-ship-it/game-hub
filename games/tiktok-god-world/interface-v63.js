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
    ['💰', 'MONEY GUN / TRAIN = instant help'],
    ['🏎️', 'SPORTS CAR = instant buildings'],
    ['🛥️', 'YACHT = instant buildings'],
    ['🐋', 'WHALE DIVING = instant buildings'],
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
