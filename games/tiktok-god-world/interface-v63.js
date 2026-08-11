(() => {
  'use strict';
  const commands = [
    ['👑', 'JOIN = crea il tuo regno'],
    ['❤️', 'LIKE = accelera economia'],
    ['🔨', 'FOLLOW = costruttori e materiali'],
    ['🌹', 'ROSE = cibo e oro'],
    ['🍦', 'ICE CREAM = cibo e popolazione'],
    ['🫰', 'FINGER HEART = grande bonus economia'],
    ['✨', 'PERFUME = oro e pietra'],
    ['🎵', 'TIKTOK = risorse e velocità'],
    ['🌌', 'GALAXY = risorse e rinforzi'],
    ['🦁', 'LION = esercito reale'],
    ['⚔️', 'ATTACK nome = dichiara guerra']
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
