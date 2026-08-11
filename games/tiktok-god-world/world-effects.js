(() => {
  'use strict';
  const canvas = document.querySelector('#weatherCanvas');
  const eventBox = document.querySelector('#worldEvent');
  if (!canvas || !eventBox) return;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  const ROTATION_MS = 120000;
  const particles = [];
  let current = null;
  let lastFrame = 0;
  let lightning = 0;

  const climates = [
    { id: 'rain', icon: '🌧️', name: 'FERTILE RAIN', note: '+ food for every kingdom', color: '#75bfff', apply: k => { k.resources.food += 90; } },
    { id: 'storm', icon: '⛈️', name: 'THUNDERSTORM', note: '- wood, + stone', color: '#b6b7ff', apply: k => { k.resources.wood = Math.max(0, k.resources.wood * .92); k.resources.stone += 45; } },
    { id: 'fog', icon: '🌫️', name: 'HEAVY FOG', note: 'armies are slowed', color: '#dce5df', apply: k => { k.military = Math.max(2, k.military * .96); } },
    { id: 'snow', icon: '❄️', name: 'DEEP FREEZE', note: '+ stone, - food', color: '#eaf8ff', apply: k => { k.resources.stone += 55; k.resources.food = Math.max(0, k.resources.food * .93); } },
    { id: 'wind', icon: '🍃', name: 'STRONG WIND', note: '+ gathered wood', color: '#9be6bc', apply: k => { k.resources.wood += 80; } },
    { id: 'drought', icon: '☀️', name: 'DROUGHT', note: '- harvest yield', color: '#ffbd59', apply: k => { k.resources.food = Math.max(0, k.resources.food * .86); } },
    { id: 'famine', icon: '🌑', name: 'FAMINE', note: '- food and population', color: '#d07b67', apply: k => { k.resources.food = Math.max(0, k.resources.food * .72); k.pop = Math.max(2, k.pop - 1); void window.__SIM?.syncCitizens(k); } },
    { id: 'clear', icon: '🌤️', name: 'CLEAR SKIES', note: '+ economy', color: '#ffe07b', apply: k => { k.resources.gold += 35; k.boostUntil = Math.max(k.boostUntil, (window.__SIM?.age || 0) + 20); } }
  ];

  const resize = () => {
    canvas.width = Math.max(160, Math.ceil(innerWidth / 3));
    canvas.height = Math.max(90, Math.ceil(innerHeight / 3));
  };
  addEventListener('resize', resize);
  resize();

  const seedParticles = climate => {
    particles.length = 0;
    const count = climate.id === 'storm' ? 150 : climate.id === 'rain' ? 115 : climate.id === 'snow' ? 80 : climate.id === 'wind' ? 55 : 32;
    for (let i = 0; i < count; i++) particles.push({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: climate.id === 'wind' ? 1.2 + Math.random() * 1.8 : climate.id === 'snow' ? -.15 + Math.random() * .3 : -.35,
      vy: climate.id === 'snow' ? .18 + Math.random() * .34 : climate.id === 'wind' ? .08 + Math.random() * .18 : 1.1 + Math.random() * 1.6,
      size: 1 + (Math.random() > .78 ? 1 : 0)
    });
  };

  const announce = climate => {
    eventBox.innerHTML = `<strong>${climate.icon} ${climate.name}</strong><span>${climate.note}</span>`;
    eventBox.style.setProperty('--event-color', climate.color);
    eventBox.classList.remove('show');
    requestAnimationFrame(() => eventBox.classList.add('show'));
    setTimeout(() => eventBox.classList.remove('show'), 6500);
  };

  const setClimate = climate => {
    current = climate;
    seedParticles(climate);
    document.documentElement.dataset.weather = climate.id;
    const sim = window.__SIM;
    if (sim?.kingdoms) for (const kingdom of sim.kingdoms) if (kingdom.alive) climate.apply(kingdom);
    announce(climate);
    window.__WEATHER_STATE = { id: climate.id, changedAt: Date.now(), rotationMs: ROTATION_MS };
  };

  const nextClimate = () => {
    const choices = climates.filter(item => item !== current);
    setClimate(choices[Math.floor(Math.random() * choices.length)]);
  };

  const draw = now => {
    requestAnimationFrame(draw);
    if (!current || now - lastFrame < 45) return;
    lastFrame = now;
    const w = canvas.width, h = canvas.height;
    context.clearRect(0, 0, w, h);
    if (current.id === 'fog' || current.id === 'famine') {
      context.fillStyle = current.id === 'fog' ? 'rgba(205,220,214,.16)' : 'rgba(72,42,35,.18)';
      context.fillRect(0, 0, w, h);
    } else if (current.id === 'drought') {
      context.fillStyle = 'rgba(255,168,55,.10)'; context.fillRect(0, 0, w, h);
    }
    if (current.id === 'clear' || current.id === 'drought' || current.id === 'fog' || current.id === 'famine') return;
    for (const particle of particles) {
      particle.x += particle.vx; particle.y += particle.vy;
      if (particle.y > h + 3 || particle.x < -5 || particle.x > w + 5) { particle.x = Math.random() * w; particle.y = -3; }
      if (current.id === 'snow') {
        context.fillStyle = 'rgba(245,252,255,.82)'; context.fillRect(particle.x, particle.y, particle.size, particle.size);
      } else if (current.id === 'wind') {
        context.fillStyle = 'rgba(112,190,121,.7)'; context.fillRect(particle.x, particle.y, 3, 1);
      } else {
        context.fillStyle = current.id === 'storm' ? 'rgba(174,195,255,.8)' : 'rgba(98,177,255,.72)';
        context.fillRect(particle.x, particle.y, 1, current.id === 'storm' ? 5 : 3);
      }
    }
    if (current.id === 'storm') {
      if (Math.random() < .008) lightning = 2;
      if (lightning > 0) { context.fillStyle = `rgba(230,238,255,${lightning * .18})`; context.fillRect(0, 0, w, h); lightning--; }
    }
  };

  requestAnimationFrame(draw);
  setTimeout(() => {
    setClimate(climates[0]);
    setInterval(nextClimate, ROTATION_MS);
  }, 8000);
  window.GodWorldWeather = { next: nextClimate, set: id => { const climate = climates.find(item => item.id === id); if (climate) setClimate(climate); } };
})();
