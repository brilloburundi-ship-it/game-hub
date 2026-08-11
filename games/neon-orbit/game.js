const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const intro = document.querySelector("#intro");
const scoreElement = document.querySelector("#score");
const bestElement = document.querySelector("#best");
const versionElement = document.querySelector("#version");

let width = 1;
let height = 1;
let scale = 1;
let running = false;
let score = 0;
let lastTime = 0;
let spawnTimer = 0;
let particles = [];
let objects = [];
const player = { x: .5, y: .72, targetX: .5, targetY: .72, radius: 12 };
const bestKey = "neon-orbit-best";
let best = Number(localStorage.getItem(bestKey) || 0);
bestElement.textContent = String(best).padStart(3, "0");

fetch(`version.json?t=${Date.now()}`, { cache: "no-store" })
  .then(response => response.json())
  .then(data => { versionElement.textContent = data.marker; })
  .catch(() => { versionElement.textContent = "local preview"; });

function resize() {
  const rect = canvas.getBoundingClientRect();
  scale = Math.min(devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

function randomObject() {
  const harmful = Math.random() < Math.min(.28 + score / 500, .55);
  return { x: .1 + Math.random() * .8, y: -.05, radius: harmful ? 9 : 7, speed: .12 + Math.random() * .09 + score / 8000, harmful, spin: Math.random() * Math.PI };
}

function burst(x, y, color, count = 10) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(angle) * (20 + Math.random() * 45), vy: Math.sin(angle) * (20 + Math.random() * 45), life: 1, color });
  }
}

function reset() {
  score = 0;
  objects = [];
  particles = [];
  player.x = player.targetX = .5;
  player.y = player.targetY = .72;
  scoreElement.textContent = "000";
  intro.classList.add("is-hidden");
  running = true;
  lastTime = performance.now();
}

function endRun() {
  running = false;
  best = Math.max(best, score);
  localStorage.setItem(bestKey, String(best));
  bestElement.textContent = String(best).padStart(3, "0");
  intro.querySelector("h1").textContent = `Signal ${score}.`;
  intro.querySelector("p").textContent = "Run saved locally. Tap start to stabilize another orbit.";
  intro.querySelector("button").textContent = "Run again";
  intro.classList.remove("is-hidden");
}

function setTarget(event) {
  const rect = canvas.getBoundingClientRect();
  player.targetX = Math.max(.05, Math.min(.95, (event.clientX - rect.left) / rect.width));
  player.targetY = Math.max(.05, Math.min(.95, (event.clientY - rect.top) / rect.height));
}

canvas.addEventListener("pointerdown", event => { canvas.setPointerCapture(event.pointerId); setTarget(event); });
canvas.addEventListener("pointermove", event => { if (event.buttons || event.pointerType === "touch") setTarget(event); });
document.querySelector("#start").addEventListener("click", reset);
window.addEventListener("resize", resize);
resize();

function drawGrid(time) {
  context.strokeStyle = "rgba(159,255,216,.045)";
  context.lineWidth = 1;
  const offset = (time * .015) % 38;
  for (let x = offset; x < width; x += 38) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  for (let y = offset; y < height; y += 38) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
}

function frame(time) {
  const delta = Math.min((time - lastTime) / 1000, .04);
  lastTime = time;
  context.clearRect(0, 0, width, height);
  drawGrid(time);

  if (running) {
    player.x += (player.targetX - player.x) * Math.min(1, delta * 11);
    player.y += (player.targetY - player.y) * Math.min(1, delta * 11);
    spawnTimer -= delta;
    if (spawnTimer <= 0) { objects.push(randomObject()); spawnTimer = Math.max(.24, .65 - score / 900); }

    for (const object of objects) {
      object.y += object.speed * delta;
      object.spin += delta * 2.4;
      const dx = object.x * width - player.x * width;
      const dy = object.y * height - player.y * height;
      if (Math.hypot(dx, dy) < object.radius + player.radius) {
        object.dead = true;
        if (object.harmful) { burst(player.x * width, player.y * height, "#ff6f7d", 24); endRun(); }
        else { score += 5; scoreElement.textContent = String(score).padStart(3, "0"); burst(object.x * width, object.y * height, "#9fffd8"); navigator.vibrate?.(12); }
      }
    }
    objects = objects.filter(object => !object.dead && object.y < 1.1);
  }

  for (const object of objects) {
    const x = object.x * width;
    const y = object.y * height;
    context.save(); context.translate(x, y); context.rotate(object.spin);
    context.strokeStyle = object.harmful ? "#ff6f7d" : "#9fffd8";
    context.fillStyle = object.harmful ? "rgba(255,111,125,.14)" : "rgba(159,255,216,.18)";
    context.shadowColor = context.strokeStyle; context.shadowBlur = 15;
    context.beginPath(); context.rect(-object.radius, -object.radius, object.radius * 2, object.radius * 2); context.fill(); context.stroke(); context.restore();
  }

  for (const particle of particles) {
    particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.life -= delta * 1.8;
    context.globalAlpha = Math.max(0, particle.life); context.fillStyle = particle.color; context.fillRect(particle.x, particle.y, 2, 2);
  }
  context.globalAlpha = 1;
  particles = particles.filter(particle => particle.life > 0);

  const px = player.x * width; const py = player.y * height;
  context.strokeStyle = "#66d9ff"; context.fillStyle = "rgba(102,217,255,.12)"; context.shadowColor = "#66d9ff"; context.shadowBlur = 22; context.lineWidth = 2;
  context.beginPath(); context.arc(px, py, player.radius + Math.sin(time / 180) * 2, 0, Math.PI * 2); context.fill(); context.stroke(); context.shadowBlur = 0;
  context.beginPath(); context.arc(px, py, 3, 0, Math.PI * 2); context.fillStyle = "#fff"; context.fill();
  requestAnimationFrame(frame);
}
requestAnimationFrame(time => { lastTime = time; frame(time); });
