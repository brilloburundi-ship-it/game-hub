const q = (s) => document.querySelector(s);
const C = q('#game');
const x = C.getContext('2d', { alpha: false });
x.imageSmoothingEnabled = false;

const W = { w: 1280, h: 720, ground: 548, sectors: 7 };
const LANES = [522, 553, 584];
const TEAM = {
  blue: { color: '#55c8ff', dark: '#12374c', spawn: 72, kills: 0, dir: 1 },
  red: { color: '#ff625f', dark: '#512126', spawn: 1208, kills: 0, dir: -1 }
};
const CLASS = {
  1: { name: 'RIFLEMAN', hp: 100, speed: 43, range: 245, damage: 19, mag: 7, reload: 1.45, fire: .73, grenade: 12, accuracy: .76, ideal: 210 },
  2: { name: 'ASSAULT', hp: 115, speed: 56, range: 190, damage: 16, mag: 9, reload: 1.2, fire: .52, grenade: 14, accuracy: .64, ideal: 145 },
  3: { name: 'GRENADIER', hp: 125, speed: 38, range: 230, damage: 22, mag: 6, reload: 1.6, fire: .88, grenade: 7.5, accuracy: .69, ideal: 235 }
};
const ANIM = {
  idle: [0, 7, 8, 1], run: [1, 8, 12, 1], shot: [2, 4, 13, 0],
  recharge: [3, 13, 11, 0], grenade: [4, 9, 12, 0], hurt: [5, 3, 12, 0], dead: [6, 4, 9, 0]
};
const FRAMES = {
  1: { idle: 7, run: 8, shot: 4, recharge: 13, grenade: 9, hurt: 3, dead: 4 },
  2: { idle: 9, run: 8, shot: 4, recharge: 7, grenade: 16, hurt: 3, dead: 4 },
  3: { idle: 7, run: 6, shot: 4, recharge: 8, grenade: 8, hurt: 4, dead: 5 }
};

const COVER = [
  { x: 185, lane: 0, kind: 'sandbags', w: 58 }, { x: 250, lane: 2, kind: 'trench', w: 86 },
  { x: 370, lane: 1, kind: 'crates', w: 48 }, { x: 455, lane: 0, kind: 'trench', w: 92 },
  { x: 545, lane: 2, kind: 'sandbags', w: 64 }, { x: 635, lane: 1, kind: 'wreck', w: 72 },
  { x: 730, lane: 0, kind: 'sandbags', w: 64 }, { x: 820, lane: 2, kind: 'trench', w: 92 },
  { x: 910, lane: 1, kind: 'crates', w: 48 }, { x: 1025, lane: 0, kind: 'trench', w: 86 },
  { x: 1100, lane: 2, kind: 'sandbags', w: 58 }
];
const CRATERS = [130, 318, 510, 688, 782, 970, 1160].map((px, i) => ({ x: px, y: LANES[i % 3] + 24, r: 20 + (i % 3) * 4 }));

const I = {};
const SOLDIERS = [];
const VIEWERS = new Map();
const FX = [];
const TRACERS = [];
const GRENADES = [];
const SMOKE = [];
const SECTORS = Array.from({ length: 7 }, (_, i) => ({ owner: i < 3 ? 'blue' : i > 3 ? 'red' : 'neutral', progress: 0, pushing: '' }));

let running = false;
let winner = '';
let last = performance.now();
let cameraX = 640;
let shake = 0;
let zoomKick = 0;
let round = 1;
let captureClock = 0;
let fps = 60;
let viewerIndex = 0;
let worldTime = 0;

const params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
const live = params.get('live') === '1';

const U = {
  blueCount: q('#blue-count'), redCount: q('#red-count'), blueKills: q('#blue-kills'), redKills: q('#red-kills'),
  sectorStrip: q('#sector-strip'), mode: q('#mode-label'), round: q('#round-label'), fps: q('#fps-label'),
  feed: q('#kill-feed'), start: q('#start-card'), winner: q('#winner-card'), winnerTitle: q('#winner-title'),
  loading: q('#loading'), progress: q('#load-progress'), panel: q('#test-panel'), startButton: q('#start-test')
};

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  C.width = innerWidth * dpr;
  C.height = innerHeight * dpr;
  x.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);
resize();

async function load() {
  const assets = [
    ['1', 'assets/soldiers/soldier_1_atlas.webp'], ['2', 'assets/soldiers/soldier_2_atlas.webp'],
    ['3', 'assets/soldiers/soldier_3_atlas.webp'], ['explosion', 'assets/vfx/explosion.webp']
  ];
  let loaded = 0;
  await Promise.all(assets.map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { I[key] = image; U.progress.textContent = `${Math.round(++loaded / assets.length * 100)}%`; resolve(); };
    image.onerror = () => reject(Error(src));
    image.src = src;
  })));
  U.loading.classList.add('hidden');
  U.mode.textContent = live ? 'LIVE MODE' : demo ? 'DEMO MODE' : 'TEST MODE';
  if (live) U.startButton.textContent = 'START LIVE BATTLE';
  if (demo) { start(true); U.start.classList.add('hidden'); }
}

function feed(team, text) {
  const el = document.createElement('div');
  el.className = `kill-item ${team}`;
  el.textContent = text;
  U.feed.prepend(el);
  while (U.feed.children.length > 6) U.feed.lastChild.remove();
  setTimeout(() => el.remove(), 4200);
}

function laneY(lane) { return LANES[Math.max(0, Math.min(2, lane))]; }
function nearestCover(soldier, direction = TEAM[soldier.team].dir) {
  let best = null;
  let score = Infinity;
  for (const c of COVER) {
    const ahead = (c.x - soldier.x) * direction;
    if (ahead < -80 || ahead > 210) continue;
    const d = Math.abs(c.x - soldier.x) + Math.abs(c.lane - soldier.lane) * 55;
    if (d < score) { score = d; best = c; }
  }
  return best;
}
function inCover(soldier) {
  for (const c of COVER) {
    if (c.lane !== soldier.lane) continue;
    if (Math.abs(c.x - soldier.x) <= c.w * .48) return c.kind === 'trench' ? .52 : c.kind === 'wreck' ? .42 : .35;
  }
  return 0;
}
function laneCrowd(soldier) {
  let n = 0;
  for (const other of SOLDIERS) if (other !== soldier && !other.dead && other.team === soldier.team && other.lane === soldier.lane && Math.abs(other.x - soldier.x) < 55) n++;
  return n;
}

class Soldier {
  constructor(username, team, kind, bot = false) {
    this.username = username;
    this.team = team;
    this.kind = kind;
    this.cfg = CLASS[kind];
    this.bot = bot;
    this.lane = Math.floor(Math.random() * 3);
    this.x = TEAM[team].spawn + Math.random() * 34 - 17;
    this.y = laneY(this.lane) + Math.random() * 7 - 3;
    this.hp = this.maxHp = this.cfg.hp;
    this.ammo = this.cfg.mag;
    this.state = 'run';
    this.animTime = 0;
    this.fireCooldown = Math.random() * .6;
    this.grenadeCooldown = 2.5 + Math.random() * 4;
    this.target = null;
    this.dead = false;
    this.deadTime = 0;
    this.actionDone = false;
    this.armor = 0;
    this.followed = false;
    this.scale = .82 + Math.random() * .08;
    this.suppression = 0;
    this.retreat = 0;
    this.laneCooldown = Math.random() * 2;
    this.forceGrenade = false;
    this.coverGoal = null;
  }
  setState(state) {
    if (this.state !== state) { this.state = state; this.animTime = 0; this.actionDone = false; }
  }
  progress() {
    const a = ANIM[this.state];
    const frames = FRAMES[this.kind][this.state];
    return Math.min(1, this.animTime / (frames / a[2]));
  }
  nearestEnemy() {
    let chosen = null;
    let best = Infinity;
    for (const s of SOLDIERS) {
      if (s.dead || s.team === this.team) continue;
      const d = Math.abs(s.x - this.x) + Math.abs(s.y - this.y) * .7;
      if (d < best) { best = d; chosen = s; }
    }
    return this.target = chosen;
  }
  maybeChangeLane(dt) {
    this.laneCooldown -= dt;
    if (this.laneCooldown > 0) return;
    const crowd = laneCrowd(this);
    if (crowd < 2 && this.suppression < 45) return;
    const options = [0, 1, 2].filter(l => l !== this.lane);
    options.sort((a, b) => {
      const ca = SOLDIERS.filter(s => !s.dead && s.team === this.team && s.lane === a && Math.abs(s.x - this.x) < 80).length;
      const cb = SOLDIERS.filter(s => !s.dead && s.team === this.team && s.lane === b && Math.abs(s.x - this.x) < 80).length;
      return ca - cb;
    });
    this.lane = options[0];
    this.laneCooldown = 2.5 + Math.random() * 2.5;
  }
  update(dt) {
    this.animTime += dt;
    if (this.dead) { this.deadTime += dt; return; }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    this.suppression = Math.max(0, this.suppression - dt * 16);
    this.retreat = Math.max(0, this.retreat - dt);
    this.maybeChangeLane(dt);
    this.y += (laneY(this.lane) - this.y) * Math.min(1, dt * 4.8);

    if (this.state === 'hurt') { if (this.progress() >= 1) this.setState('idle'); return; }
    if (this.state === 'recharge') { if (this.progress() >= 1) { this.ammo = this.cfg.mag; this.setState('idle'); } return; }
    if (this.state === 'shot') { if (!this.actionDone && this.progress() > .38) { this.fire(); this.actionDone = true; } if (this.progress() >= 1) this.setState('idle'); return; }
    if (this.state === 'grenade') { if (!this.actionDone && this.progress() > .46) { this.throwGrenade(); this.actionDone = true; } if (this.progress() >= 1) this.setState('idle'); return; }

    const enemy = this.target && !this.target.dead ? this.target : this.nearestEnemy();
    if (!enemy) return this.move(dt);
    const distance = Math.abs(enemy.x - this.x);
    const laneGap = Math.abs(enemy.lane - this.lane);

    if ((this.forceGrenade || this.grenadeCooldown <= 0) && distance > 85 && distance < 330 && laneGap <= 1 && (this.forceGrenade || Math.random() < dt * (this.kind === 3 ? .55 : .16))) {
      this.forceGrenade = false;
      return this.setState('grenade');
    }
    if (distance <= this.cfg.range && laneGap <= 1) {
      if (this.ammo <= 0) return this.setState('recharge');
      if (this.fireCooldown <= 0) return this.setState('shot');
      return this.setState('idle');
    }
    this.move(dt, enemy);
  }
  move(dt, enemy = null) {
    this.setState('run');
    const dir = TEAM[this.team].dir;
    let velocity = this.cfg.speed;
    const f = frontline();
    if (Math.abs(this.x - f) > 350) velocity *= 1.32;
    if (this.kind === 2 && Math.abs(this.x - f) < 220) velocity *= 1.12;
    if (this.retreat > 0) velocity *= -.8;

    if (!this.coverGoal || Math.abs(this.coverGoal.x - this.x) < 13 || Math.random() < dt * .15) this.coverGoal = nearestCover(this, dir);
    if (this.coverGoal && this.retreat <= 0 && enemy) {
      const coverAhead = (this.coverGoal.x - this.x) * dir;
      const enemyDistance = Math.abs(enemy.x - this.x);
      if (coverAhead > 5 && coverAhead < 150 && enemyDistance < 390) {
        if (this.coverGoal.lane !== this.lane && this.laneCooldown <= 0) this.lane = this.coverGoal.lane;
        if (Math.abs(this.coverGoal.x - this.x) < 18 && enemyDistance <= this.cfg.range * 1.15) velocity = 0;
      }
    }

    let repel = 0;
    for (const other of SOLDIERS) {
      if (other === this || other.dead || other.team !== this.team || other.lane !== this.lane) continue;
      const dx = this.x - other.x;
      if (Math.abs(dx) < 30) repel += Math.sign(dx || (Math.random() - .5)) * (30 - Math.abs(dx)) * .7;
    }
    this.x = Math.max(36, Math.min(1244, this.x + dir * velocity * dt + repel * dt));
  }
  fire() {
    const enemy = this.target && !this.target.dead ? this.target : this.nearestEnemy();
    if (!enemy) return;
    this.ammo--;
    this.fireCooldown = this.cfg.fire * (.86 + Math.random() * .28);
    const muzzleX = this.x + TEAM[this.team].dir * 20;
    const muzzleY = this.y - 38;
    const targetY = enemy.y - 34 + (Math.random() - .5) * 9;
    TRACERS.push({ x1: muzzleX, y1: muzzleY, x2: enemy.x, y2: targetY, life: .075, team: this.team });
    FX.push({ type: 'muzzle', x: muzzleX + TEAM[this.team].dir * 9, y: muzzleY, life: .09, team: this.team });

    const distance = Math.abs(enemy.x - this.x);
    const cover = inCover(enemy);
    const distancePenalty = Math.max(0, distance - 90) / Math.max(120, this.cfg.range) * .18;
    const suppressionPenalty = Math.min(.2, this.suppression / 360);
    const accuracy = Math.max(.22, this.cfg.accuracy - cover - distancePenalty - suppressionPenalty);
    enemy.suppression = Math.min(100, enemy.suppression + 8 + Math.random() * 7);

    if (Math.random() < accuracy) {
      enemy.hit(this.cfg.damage * (.82 + Math.random() * .35), this);
    } else {
      const impactX = enemy.x + (Math.random() - .5) * 32;
      FX.push({ type: 'dust', x: impactX, y: enemy.y - 5, life: .3, vx: (Math.random() - .5) * 16, vy: -12 - Math.random() * 18 });
    }
  }
  throwGrenade() {
    const enemy = this.target && !this.target.dead ? this.target : this.nearestEnemy();
    const tx = enemy ? enemy.x + (Math.random() - .5) * 28 : this.x + TEAM[this.team].dir * 195;
    const ty = enemy ? laneY(enemy.lane) : this.y;
    this.grenadeCooldown = this.cfg.grenade * (.82 + Math.random() * .35);
    GRENADES.push({ x: this.x, y: this.y - 43, sx: this.x, sy: this.y - 43, tx, ty: ty - 4, p: 0, duration: .68 + Math.random() * .2, team: this.team, owner: this });
  }
  hit(amount, attacker) {
    const cover = inCover(this);
    if (cover) amount *= 1 - cover * .35;
    const absorbed = Math.min(this.armor, amount * .45);
    this.armor -= absorbed;
    this.hp -= amount - absorbed;
    this.suppression = Math.min(100, this.suppression + 25);
    if (this.suppression > 70 && Math.random() < .42) this.retreat = .8 + Math.random() * .7;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.setState('dead');
      if (attacker) { TEAM[attacker.team].kills++; feed(attacker.team, `${attacker.username} ▸ ${this.username}`); }
    } else if (!['grenade', 'recharge'].includes(this.state)) this.setState('hurt');
  }
  heal(amount) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.suppression = Math.max(0, this.suppression - 28);
    FX.push({ type: 'heal', x: this.x, y: this.y - 58, life: .6 });
  }
  boost() {
    if (this.followed || this.dead) return;
    this.followed = true;
    this.maxHp += 20;
    this.hp += 20;
    this.armor += 18;
    FX.push({ type: 'follow', x: this.x, y: this.y - 66, life: .85 });
  }
  draw() {
    const image = I[this.kind];
    const a = ANIM[this.state];
    const frames = FRAMES[this.kind][this.state];
    if (!image) return;
    let frame = Math.floor(this.animTime * a[2]);
    frame = a[3] ? frame % frames : Math.min(frames - 1, frame);
    const size = 128 * this.scale;
    x.save();
    x.translate(this.x, this.y);
    if (this.team === 'red') x.scale(-1, 1);
    x.drawImage(image, frame * 64, a[0] * 64, 64, 64, -size / 2, -size + 17, size, size);
    x.restore();

    if (!this.dead) {
      const barY = this.y - 100 * this.scale;
      x.fillStyle = '#000b'; x.fillRect(this.x - 29, barY, 58, 4);
      x.fillStyle = TEAM[this.team].color; x.fillRect(this.x - 29, barY, 58 * this.hp / this.maxHp, 4);
      if (this.armor > 0) { x.fillStyle = '#d8f0ff'; x.fillRect(this.x - 29, barY + 5, Math.min(58, this.armor), 2); }
      x.font = 'bold 9px system-ui'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.fillText(this.username, this.x, barY - 5);
      x.font = '7px system-ui'; x.fillStyle = '#cbd2d4'; x.fillText(this.cfg.name, this.x, barY + 15);
      if (this.suppression > 60) { x.fillStyle = '#ffd56a'; x.font = 'bold 7px system-ui'; x.fillText('SUPPRESSED', this.x, barY + 24); }
    }
  }
}

function counts() {
  let blue = 0, red = 0;
  for (const s of SOLDIERS) if (!s.dead) s.team === 'blue' ? blue++ : red++;
  return { blue, red };
}
function spawn(username, team, kind, bot = false) {
  if (VIEWERS.has(username) && !VIEWERS.get(username).dead) return VIEWERS.get(username);
  const c = counts();
  team = team || (c.blue <= c.red ? 'blue' : 'red');
  kind = kind || 1 + Math.floor(Math.random() * 3);
  const soldier = new Soldier(username, team, kind, bot);
  SOLDIERS.push(soldier);
  VIEWERS.set(username, soldier);
  FX.push({ type: 'spawn', x: soldier.x, y: soldier.y - 42, life: .8, team });
  feed(team, `${username} DEPLOYED • ${CLASS[kind].name}`);
  return soldier;
}
function randomViewerSoldier() {
  const choices = SOLDIERS.filter(s => !s.dead && !s.bot);
  const pool = choices.length ? choices : SOLDIERS.filter(s => !s.dead);
  return pool[Math.floor(Math.random() * pool.length)];
}
function frontline() {
  let blue = -1, red = 7;
  SECTORS.forEach((s, i) => { if (s.owner === 'blue') blue = Math.max(blue, i); if (s.owner === 'red') red = Math.min(red, i); });
  return Math.max(90, Math.min(1190, ((blue + red) / 2 + .5) * W.w / 7));
}

function updateSectors(dt) {
  const sectorW = W.w / W.sectors;
  for (let i = 0; i < W.sectors; i++) {
    const left = i * sectorW, right = left + sectorW;
    let blue = 0, red = 0;
    for (const s of SOLDIERS) {
      if (s.dead || s.x < left || s.x >= right) continue;
      const weight = 1 + (s.kind === 2 ? .08 : s.kind === 3 ? .04 : 0);
      s.team === 'blue' ? blue += weight : red += weight;
    }
    const sector = SECTORS[i];
    if (!blue && !red) { sector.progress = Math.max(0, sector.progress - dt * .22); sector.pushing = ''; continue; }
    if (Math.abs(blue - red) < .2) { sector.progress = Math.max(0, sector.progress - dt * .08); continue; }
    const pushing = blue > red ? 'blue' : 'red';
    const advantage = Math.abs(blue - red);
    if (sector.pushing !== pushing) {
      sector.progress = Math.max(0, sector.progress - dt * .75);
      if (!sector.progress) sector.pushing = pushing;
    } else sector.progress += dt * (.12 + Math.min(4, advantage) * .05);

    if (sector.progress >= 1 && sector.owner !== pushing) {
      sector.owner = pushing; sector.progress = 0; sector.pushing = '';
      feed(pushing, `${pushing.toUpperCase()} CAPTURED SECTOR ${i + 1}`);
      shake = 6; zoomKick = .025;
      FX.push({ type: 'capture', x: left + sectorW / 2, y: 444, life: 1.2, team: pushing });
      if ((pushing === 'blue' && i === 6) || (pushing === 'red' && i === 0)) finish(pushing);
    }
  }
}

function explode(grenade) {
  FX.push({ type: 'explosion', x: grenade.tx, y: grenade.ty - 18, life: .78 });
  shake = 12; zoomKick = .045;
  for (let i = 0; i < 10; i++) SMOKE.push({ x: grenade.tx + (Math.random() - .5) * 35, y: grenade.ty - 24 + (Math.random() - .5) * 25, r: 8 + Math.random() * 14, life: 1.6 + Math.random() * 2.2, max: 3.8, vx: (Math.random() - .5) * 8, vy: -5 - Math.random() * 10 });
  for (const s of SOLDIERS) {
    if (s.dead || s.team === grenade.team) continue;
    const d = Math.hypot(s.x - grenade.tx, (s.y - grenade.ty) * .72);
    if (d < 128) s.hit((1 - d / 128) * 82 + 14, grenade.owner);
    if (d < 190) s.suppression = Math.min(100, s.suppression + 38 * (1 - d / 190));
  }
}
function updateGrenades(dt) {
  for (let i = GRENADES.length - 1; i >= 0; i--) {
    const g = GRENADES[i];
    g.p += dt / g.duration;
    if (g.p >= 1) { explode(g); GRENADES.splice(i, 1); continue; }
    g.x = g.sx + (g.tx - g.sx) * g.p;
    g.y = g.sy + (g.ty - g.sy) * g.p - Math.sin(Math.PI * g.p) * 96;
  }
}
function updateFX(dt) {
  for (const list of [FX, TRACERS]) for (let i = list.length - 1; i >= 0; i--) if ((list[i].life -= dt) <= 0) list.splice(i, 1);
  for (let i = SMOKE.length - 1; i >= 0; i--) {
    const s = SMOKE[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += dt * 4;
    if (s.life <= 0) SMOKE.splice(i, 1);
  }
}

function drawCloud(px, py, w, alpha) {
  x.globalAlpha = alpha; x.fillStyle = '#c6d0d1';
  x.fillRect(px, py, w, 9); x.fillRect(px + w * .18, py - 7, w * .42, 12); x.fillRect(px + w * .55, py - 4, w * .28, 10);
  x.globalAlpha = 1;
}
function drawRuins(px, py, scale = 1) {
  x.save(); x.translate(px, py); x.scale(scale, scale);
  x.fillStyle = '#1c2627'; x.fillRect(-55, -58, 110, 58); x.fillRect(-38, -83, 42, 30); x.fillRect(18, -72, 28, 23);
  x.fillStyle = '#11191b'; x.fillRect(-28, -42, 18, 30); x.fillRect(14, -45, 14, 20); x.fillRect(-45, -70, 10, 11);
  x.fillStyle = '#2a3030'; x.beginPath(); x.moveTo(-58, -58); x.lineTo(-29, -88); x.lineTo(4, -58); x.fill();
  x.restore();
}
function drawCover(c, front = false) {
  const y = laneY(c.lane) + 5;
  if (c.kind === 'trench') {
    if (!front) { x.fillStyle = '#171914'; x.fillRect(c.x - c.w / 2, y - 2, c.w, 19); x.fillStyle = '#24231c'; x.fillRect(c.x - c.w / 2 - 5, y - 6, c.w + 10, 7); }
    else { x.fillStyle = '#514a38'; x.fillRect(c.x - c.w / 2 - 4, y + 7, c.w + 8, 7); }
    return;
  }
  if (front) return;
  if (c.kind === 'sandbags') {
    for (let row = 0; row < 2; row++) for (let i = 0; i < Math.max(3, Math.floor(c.w / 15) - row); i++) {
      x.fillStyle = row ? '#736750' : '#83755a'; x.fillRect(c.x - c.w / 2 + i * 15 + row * 7, y - 7 - row * 8, 13, 7);
    }
  } else if (c.kind === 'crates') {
    x.fillStyle = '#604b35'; x.fillRect(c.x - 22, y - 28, 22, 28); x.fillRect(c.x + 2, y - 20, 22, 20); x.strokeStyle = '#8a6c47'; x.strokeRect(c.x - 20, y - 26, 18, 24); x.strokeRect(c.x + 4, y - 18, 18, 16);
  } else if (c.kind === 'wreck') {
    x.fillStyle = '#30383a'; x.fillRect(c.x - 34, y - 20, 68, 17); x.fillRect(c.x - 12, y - 34, 35, 18); x.fillStyle = '#171c1e'; x.fillRect(c.x - 28, y - 7, 18, 10); x.fillRect(c.x + 16, y - 7, 18, 10);
  }
}
function drawFlag(i) {
  const sw = W.w / W.sectors;
  const s = SECTORS[i];
  const px = i * sw + sw / 2;
  const py = 468;
  x.strokeStyle = '#687274'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, py + 50); x.lineTo(px, py); x.stroke();
  x.fillStyle = s.owner === 'neutral' ? '#8b9191' : TEAM[s.owner].color;
  x.beginPath(); x.moveTo(px + 2, py + 3); x.lineTo(px + 34, py + 10); x.lineTo(px + 2, py + 20); x.fill();
  if (s.progress > 0) {
    x.strokeStyle = s.pushing ? TEAM[s.pushing].color : '#fff'; x.lineWidth = 3; x.beginPath(); x.arc(px, py + 53, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.progress)); x.stroke();
  }
}
function drawBackground() {
  const sky = x.createLinearGradient(0, 0, 0, 520);
  sky.addColorStop(0, '#0d1b25'); sky.addColorStop(.58, '#344248'); sky.addColorStop(1, '#7a6955');
  x.fillStyle = sky; x.fillRect(0, 0, 1280, 540);

  const cloudShift = (worldTime * 7) % 1450;
  drawCloud(120 - cloudShift % 1450, 122, 150, .14); drawCloud(630 - (cloudShift * .65) % 1450, 170, 190, .11); drawCloud(1080 - (cloudShift * .45) % 1450, 105, 135, .13);

  x.fillStyle = '#202c30'; x.beginPath(); x.moveTo(0, 410); for (let px = 0; px <= 1280; px += 80) x.lineTo(px, 330 + Math.sin(px * .013) * 28 + Math.sin(px * .029) * 14); x.lineTo(1280, 520); x.lineTo(0, 520); x.fill();
  x.fillStyle = '#293234'; x.beginPath(); x.moveTo(0, 465); for (let px = 0; px <= 1280; px += 55) x.lineTo(px, 405 + Math.sin(px * .02) * 24); x.lineTo(1280, 535); x.lineTo(0, 535); x.fill();

  drawRuins(330, 520, .85); drawRuins(950, 525, 1.0);

  const ground = x.createLinearGradient(0, 500, 0, 720); ground.addColorStop(0, '#554c3b'); ground.addColorStop(.35, '#3f392d'); ground.addColorStop(1, '#20211b');
  x.fillStyle = ground; x.fillRect(0, 500, 1280, 220);
  x.fillStyle = '#2d2b23'; for (let px = 0; px < 1280; px += 74) x.fillRect(px + (px % 3) * 7, 620 + Math.sin(px) * 8, 42, 3);

  for (const c of CRATERS) { x.fillStyle = '#24221c'; x.beginPath(); x.ellipse(c.x, c.y, c.r * 1.6, c.r * .55, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#655b45'; x.stroke(); }

  const sw = 1280 / 7;
  x.font = 'bold 9px system-ui'; x.textAlign = 'center';
  for (let i = 0; i < 7; i++) {
    x.strokeStyle = '#ffffff10'; x.setLineDash([4, 8]); x.beginPath(); x.moveTo(i * sw, 455); x.lineTo(i * sw, 720); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#ffffff20'; x.fillText(`SECTOR ${i + 1}`, i * sw + sw / 2, 514);
    drawFlag(i);
  }

  drawBase(58, 'blue'); drawBase(1222, 'red');
  for (const c of COVER) drawCover(c, false);
  drawBarbedWire(600, 618, 86); drawBarbedWire(865, 641, 80); drawBarbedWire(407, 642, 72);
}
function drawBase(px, team) {
  x.fillStyle = TEAM[team].dark; x.fillRect(px - 38, 456, 76, 92);
  x.fillStyle = '#0b1215'; x.fillRect(px - 19, 501, 38, 47);
  x.fillStyle = '#273033'; x.fillRect(px - 43, 450, 86, 11);
  x.fillStyle = TEAM[team].color; const fx = px + (team === 'blue' ? -28 : 22); x.fillRect(fx, 419, 7, 38); x.fillRect(fx + (team === 'blue' ? 7 : -31), 419, 31, 16);
}
function drawBarbedWire(px, py, width) {
  x.strokeStyle = '#777b76'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px - width / 2, py); x.lineTo(px + width / 2, py); x.stroke();
  for (let i = -width / 2; i <= width / 2; i += 16) { x.beginPath(); x.arc(px + i, py, 8, 0, Math.PI * 2); x.stroke(); }
}
function drawForeground() { for (const c of COVER) drawCover(c, true); x.fillStyle = '#151712bb'; x.fillRect(0, 695, 1280, 25); }

function drawFX() {
  for (const r of TRACERS) {
    x.globalAlpha = Math.min(1, r.life / .055); x.strokeStyle = '#ffe9b0'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(r.x1, r.y1); x.lineTo(r.x2, r.y2); x.stroke();
  }
  x.globalAlpha = 1;
  for (const g of GRENADES) { x.fillStyle = '#d9dfcf'; x.fillRect(g.x - 3, g.y - 3, 6, 6); x.fillStyle = '#7a826f'; x.fillRect(g.x - 1, g.y - 5, 3, 3); }
  for (const e of FX) {
    if (e.type === 'muzzle') { x.globalAlpha = Math.min(1, e.life / .07); x.fillStyle = '#ffe28d'; x.beginPath(); x.arc(e.x, e.y, 6 + Math.random() * 3, 0, Math.PI * 2); x.fill(); }
    if (e.type === 'heal' || e.type === 'follow') { x.globalAlpha = Math.min(1, e.life / .45); x.fillStyle = e.type === 'heal' ? '#74f0a8' : '#bde4ff'; x.font = 'bold 12px system-ui'; x.textAlign = 'center'; x.fillText(e.type === 'heal' ? '+HP' : 'FOLLOW +ARMOR', e.x, e.y); }
    if (e.type === 'spawn') { x.globalAlpha = Math.min(1, e.life / .35); x.strokeStyle = TEAM[e.team].color; x.lineWidth = 2; x.beginPath(); x.arc(e.x, e.y, 18 + (1 - e.life) * 22, 0, Math.PI * 2); x.stroke(); }
    if (e.type === 'capture') { x.globalAlpha = Math.min(1, e.life / .6); x.fillStyle = TEAM[e.team].color; x.font = '900 18px system-ui'; x.textAlign = 'center'; x.fillText('SECTOR CAPTURED', e.x, e.y - (1.2 - e.life) * 16); }
    if (e.type === 'dust') { e.x += (e.vx || 0) * .016; e.y += (e.vy || 0) * .016; x.globalAlpha = Math.min(.55, e.life / .3); x.fillStyle = '#b49c73'; x.fillRect(e.x, e.y, 3, 3); }
    if (e.type === 'explosion' && I.explosion) { const n = I.explosion.width / 64, p = 1 - e.life / .78, f = Math.min(n - 1, Math.floor(p * n)); x.globalAlpha = 1; x.drawImage(I.explosion, f * 64, 0, 64, 64, e.x - 68, e.y - 92, 136, 136); }
  }
  x.globalAlpha = 1;
  for (const s of SMOKE) { x.globalAlpha = Math.min(.34, s.life / 2.3); x.fillStyle = '#a9aaa2'; x.beginPath(); x.arc(s.x, s.y, s.r, 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1;
}

function render() {
  const baseScale = C.height / 720;
  const visibleWorldWidth = C.width / baseScale;
  const target = frontline();
  cameraX += (target - cameraX) * .052;
  cameraX = Math.max(visibleWorldWidth / 2, Math.min(1280 - visibleWorldWidth / 2, cameraX));
  const cameraZoom = 1 + zoomKick;
  zoomKick *= .9;
  const jx = (Math.random() - .5) * shake, jy = (Math.random() - .5) * shake * .5; shake *= .86;

  x.save();
  const scale = baseScale * cameraZoom;
  x.setTransform(scale, 0, 0, scale, C.width / 2 - cameraX * scale + jx, C.height / 2 - 360 * scale + jy);
  drawBackground();
  [...SOLDIERS].sort((a, b) => a.y - b.y).forEach(s => s.draw());
  drawFX();
  drawForeground();
  x.restore();
}

function update(dt) {
  worldTime += dt;
  if (!running || winner) { updateFX(dt); return; }
  SOLDIERS.forEach(s => s.update(dt));
  updateGrenades(dt); updateFX(dt);
  captureClock += dt;
  if (captureClock > .24) { updateSectors(captureClock); captureClock = 0; }
  for (let i = SOLDIERS.length - 1; i >= 0; i--) {
    const s = SOLDIERS[i];
    if (s.dead && s.deadTime > 5.5) { SOLDIERS.splice(i, 1); if (VIEWERS.get(s.username) === s) VIEWERS.delete(s.username); }
  }
  if (demo) {
    const c = counts();
    if (c.blue < 8) spawn(`Blue${Math.floor(Math.random() * 999)}`, 'blue', 0, true);
    if (c.red < 8) spawn(`Red${Math.floor(Math.random() * 999)}`, 'red', 0, true);
  }
}

function hud() {
  const c = counts();
  U.blueCount.textContent = c.blue; U.redCount.textContent = c.red;
  U.blueKills.textContent = `${TEAM.blue.kills} KILLS`; U.redKills.textContent = `${TEAM.red.kills} KILLS`;
  U.fps.textContent = `${Math.round(fps)} FPS`; U.round.textContent = `ROUND ${round} • FRONT ${Math.round(frontline())}`;
  U.sectorStrip.innerHTML = SECTORS.map((s, i) => `<i class="sector ${s.owner} ${s.progress > .02 ? 'contested' : ''}" style="--capture:${Math.min(1, s.progress)}" title="Sector ${i + 1}"></i>`).join('');
}

function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  fps = fps * .92 + (1 / Math.max(.001, dt)) * .08;
  update(dt); render(); hud(); requestAnimationFrame(loop);
}

function reset(startImmediately = false) {
  SOLDIERS.length = FX.length = TRACERS.length = GRENADES.length = SMOKE.length = 0;
  VIEWERS.clear(); TEAM.blue.kills = TEAM.red.kills = 0;
  SECTORS.forEach((s, i) => Object.assign(s, { owner: i < 3 ? 'blue' : i > 3 ? 'red' : 'neutral', progress: 0, pushing: '' }));
  round++; winner = ''; cameraX = 640;
  if (startImmediately) start(true);
}
function start(withBots = true) {
  running = true; winner = ''; U.start.classList.add('hidden');
  if (withBots && !SOLDIERS.length) for (let i = 0; i < 7; i++) { spawn(`B-${i + 1}`, 'blue', 1 + i % 3, true); spawn(`R-${i + 1}`, 'red', 1 + (i + 1) % 3, true); }
}
function finish(team) {
  if (winner) return;
  winner = team; U.winnerTitle.textContent = `${team.toUpperCase()} FORCE WINS`; U.winnerTitle.style.color = TEAM[team].color; U.winner.classList.remove('hidden');
  setTimeout(() => { U.winner.classList.add('hidden'); reset(!live); }, 4500);
}

function handle(event) {
  if (!event) return;
  const type = String(event.type || event.event || '').toLowerCase();
  const username = String(event.username || event.user || event.uniqueId || 'Viewer').slice(0, 18);
  if (type === 'join') { running = true; U.start.classList.add('hidden'); return spawn(username); }
  const soldier = VIEWERS.get(username) || randomViewerSoldier();
  if (!soldier) return;
  if (type === 'like') return soldier.heal(Math.min(30, Math.max(2, Number(event.count || 1) * .6)));
  if (type === 'follow') return soldier.boost();
  if (type === 'gift') {
    const name = String(event.giftName || event.name || '').toLowerCase();
    const value = Number(event.diamonds || event.value || 1);
    if (name.includes('rose') || value <= 2) { soldier.forceGrenade = true; soldier.grenadeCooldown = 0; feed(soldier.team, `${soldier.username} • GRENADE READY`); }
    else if (value < 50) { soldier.heal(35); soldier.armor += 12; }
    else { const n = Math.min(5, 1 + Math.floor(value / 100)); for (let i = 0; i < n; i++) spawn(`${username}-${i + 1}`, soldier.team, 0, true); feed(soldier.team, `${username} CALLED REINFORCEMENTS`); }
  }
}

window.FRONTLINE_LIVE = {
  handle,
  join: u => handle({ type: 'join', username: u }),
  like: (u, count = 1) => handle({ type: 'like', username: u, count }),
  follow: u => handle({ type: 'follow', username: u }),
  gift: (u, name = 'Rose', diamonds = 1) => handle({ type: 'gift', username: u, giftName: name, diamonds }),
  reset: () => reset(),
  state: () => ({ soldiers: SOLDIERS.length, sectors: SECTORS.map(s => s.owner), kills: { blue: TEAM.blue.kills, red: TEAM.red.kills } })
};

U.startButton.onclick = () => start(!live);
q('#test-toggle').onclick = () => U.panel.classList.toggle('hidden');
q('#close-test').onclick = () => U.panel.classList.add('hidden');
document.querySelectorAll('[data-test]').forEach(button => button.onclick = () => {
  const action = button.dataset.test; running = true; U.start.classList.add('hidden');
  if (action === 'join') return handle({ type: 'join', username: `Viewer${++viewerIndex}` });
  if (action === 'reset') return reset(true);
  if (action === 'reinforce') { const c = counts(), team = c.blue <= c.red ? 'blue' : 'red'; for (let i = 0; i < 3; i++) spawn(`Reinf${++viewerIndex}`, team, 0, true); return; }
  const soldier = randomViewerSoldier(); if (!soldier) return;
  if (action === 'like') handle({ type: 'like', username: soldier.username, count: 25 });
  if (action === 'rose') handle({ type: 'gift', username: soldier.username, giftName: 'Rose' });
  if (action === 'follow') handle({ type: 'follow', username: soldier.username });
});

load().catch(err => U.loading.innerHTML = `<b>ASSET LOAD ERROR</b><span>${err.message}</span>`);
requestAnimationFrame(loop);
