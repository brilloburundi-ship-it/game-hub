import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces, homedir } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.GOD_WORLD_PORT || 8793);
const HOST = '0.0.0.0';
const TIKFINITY_URL = process.env.TIKFINITY_URL || 'ws://127.0.0.1:21213/';
const APP_ID = 'kingdom-war-v804-mobile';
const BUNDLED_MUSIC = join(ROOT, 'assets', 'audio', 'medieval-market-full.mp3');
const DOWNLOAD_MUSIC = join(homedir(), 'Downloads', 'Medieval Fantasy Music – Medieval Market _ Folk, Traditional, Instrumental _ Fantasy Music World #2.mp3');
const MUSIC_FILE = process.env.GOD_WORLD_MUSIC || (existsSync(BUNDLED_MUSIC) ? BUNDLED_MUSIC : DOWNLOAD_MUSIC);
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_CLIENTS = 8;
const TOKEN_DIR = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'TikTokGodWorldPixelBridge')
  : join(homedir(), '.tiktok-god-world-pixel-bridge');
const TOKEN_FILE = join(TOKEN_DIR, 'bridge-token.txt');

function loadToken() {
  mkdirSync(TOKEN_DIR, { recursive: true });
  if (existsSync(TOKEN_FILE)) {
    const saved = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (saved) return saved;
  }
  const value = randomBytes(24).toString('base64url');
  writeFileSync(TOKEN_FILE, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  return value;
}

const token = loadToken();
const clients = new Set();
let tikFinity = null;
let tikFinityConnected = false;
let reconnectTimer = null;
let shuttingDown = false;
let lastTestAt = 0;

function tokenMatches(candidate = '') {
  const left = Buffer.from(String(candidate));
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sendSse(response, payload) {
  if (response.destroyed || response.writableEnded) return false;
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
  return true;
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  if (Buffer.byteLength(data) > MAX_EVENT_BYTES) return;
  for (const client of [...clients]) if (!sendSse(client, payload)) clients.delete(client);
}

function bridgeStatus() {
  return {
    __bridgeStatus: tikFinityConnected ? 'connected' : 'waiting',
    message: tikFinityConnected ? 'TikFinity connected through the PC' : 'Waiting for TikFinity on the PC'
  };
}

function connectTikFinity() {
  if (shuttingDown) return;
  clearTimeout(reconnectTimer);
  try { tikFinity = new WebSocket(TIKFINITY_URL); }
  catch { reconnectTimer = setTimeout(connectTikFinity, 3000); return; }

  tikFinity.addEventListener('open', () => {
    tikFinityConnected = true;
    console.log(`[bridge] TikFinity collegato: ${TIKFINITY_URL}`);
    broadcast(bridgeStatus());
  });
  tikFinity.addEventListener('message', event => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    if (Buffer.byteLength(raw) > MAX_EVENT_BYTES) return;
    try { broadcast(JSON.parse(raw)); } catch { /* Ignora frame non JSON. */ }
  });
  const disconnected = () => {
    if (!tikFinity && shuttingDown) return;
    tikFinityConnected = false;
    tikFinity = null;
    broadcast(bridgeStatus());
    if (!shuttingDown) reconnectTimer = setTimeout(connectTikFinity, 3000);
  };
  tikFinity.addEventListener('close', disconnected, { once: true });
  tikFinity.addEventListener('error', () => tikFinity?.close());
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
};

const blockedTopLevel = new Set([
  'bridge', 'tools', 'server.py', 'package.json', 'README.md',
  'AVVIA_GIOCO.bat', 'AVVIA_SAFARI_TIKFINITY.bat', 'ABILITA_WIFI_PRIVATO.bat',
  'INVIA_EVENTO_TEST.bat', 'URL_IPHONE.txt'
]);

function serveStatic(request, response, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end('Bad path'); return; }
  if (pathname === '/') pathname = '/index.html';
  const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
  if (blockedTopLevel.has(firstSegment)) { response.writeHead(404).end('Not found'); return; }
  const file = resolve(ROOT, `.${pathname}`);
  const rel = relative(ROOT, file);
  if (rel.startsWith('..') || resolve(file) === resolve(ROOT)) {
    response.writeHead(403).end('Forbidden'); return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('Not found'); return;
  }
  const stats = statSync(file);
  const headers = {
    'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache', 'Expires': '0', 'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';"
  };

  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` }).end(); return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stats.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= stats.size) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` }).end(); return;
    }
    const boundedEnd = Math.min(end, stats.size - 1);
    response.writeHead(206, {
      ...headers, 'Content-Range': `bytes ${start}-${boundedEnd}/${stats.size}`,
      'Content-Length': boundedEnd - start + 1
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file, { start, end: boundedEnd }).pipe(response);
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Length': stats.size });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}

function serveMusic(request, response) {
  if (!existsSync(MUSIC_FILE) || !statSync(MUSIC_FILE).isFile()) {
    response.writeHead(404, { 'Cache-Control': 'no-store' }).end('Music file not found');
    return;
  }
  const stats = statSync(MUSIC_FILE);
  const headers = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff'
  };
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` }).end();
      return;
    }
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : stats.size - 1;
    if (!match[1] && match[2]) {
      const suffix = Number(match[2]);
      start = Math.max(0, stats.size - suffix);
      end = stats.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= stats.size) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` }).end();
      return;
    }
    end = Math.min(end, stats.size - 1);
    response.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Content-Length': end - start + 1
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(MUSIC_FILE, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, 'Content-Length': stats.size });
  if (request.method === 'HEAD') response.end();
  else createReadStream(MUSIC_FILE).pipe(response);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/bridge/events') {
    if (!tokenMatches(url.searchParams.get('token'))) { response.writeHead(401).end('Invalid token'); return; }
    if (clients.size >= MAX_CLIENTS) { response.writeHead(503).end('Too many clients'); return; }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    response.write(': kingdom-war bridge\n\n');
    clients.add(response);
    sendSse(response, bridgeStatus());
    request.on('close', () => clients.delete(response));
    return;
  }
  if (url.pathname === '/bridge/health') {
    if (!tokenMatches(url.searchParams.get('token'))) { response.writeHead(401).end('Invalid token'); return; }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({
      ok: true, app: APP_ID, port: PORT, tikFinityConnected, clients: clients.size,
      musicAvailable: existsSync(MUSIC_FILE),
      musicSize: existsSync(MUSIC_FILE) ? statSync(MUSIC_FILE).size : 0
    }));
    return;
  }
  if (url.pathname === '/bridge/music' && (request.method === 'GET' || request.method === 'HEAD')) {
    if (!tokenMatches(url.searchParams.get('token'))) { response.writeHead(401).end('Invalid token'); return; }
    serveMusic(request, response);
    return;
  }
  if (url.pathname === '/bridge/test' && request.method === 'POST') {
    if (!tokenMatches(url.searchParams.get('token'))) { response.writeHead(401).end('Invalid token'); return; }
    if (Date.now() - lastTestAt < 700) { response.writeHead(429).end('Slow down'); return; }
    lastTestAt = Date.now();
    const allowed = new Set(['like', 'follow', 'comment', 'gift']);
    const type = allowed.has(url.searchParams.get('type')) ? url.searchParams.get('type') : 'comment';
    const event = { type, username: '@BridgeTest', count: 1, eventId: `test-${Date.now()}` };
    if (type === 'comment') event.comment = 'JOIN';
    if (type === 'gift') { event.giftName = 'Rose'; event.repeatCount = 1; event.repeatEnd = true; }
    broadcast(event);
    response.writeHead(204).end();
    return;
  }
  serveStatic(request, response, url);
});

const heartbeat = setInterval(() => {
  for (const client of [...clients]) {
    if (client.destroyed || client.writableEnded) clients.delete(client);
    else client.write(': keepalive\n\n');
  }
}, 15000);
heartbeat.unref();

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const info of entries || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (/^(169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address)) continue;
      addresses.push(info.address);
    }
  }
  return [...new Set(addresses)];
}

function urlFor(address) {
  return `http://${address}:${PORT}/?token=${encodeURIComponent(token)}`;
}

function openLocalUrl() {
  const child = spawn('cmd.exe', ['/c', 'start', '', urlFor('127.0.0.1')], {
    detached: true, stdio: 'ignore', windowsHide: true
  });
  child.unref();
}

server.on('error', error => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`\nLa porta dedicata ${PORT} e gia in uso.`);
    console.error('Se God World e gia aperto, usa lo stesso URL su Safari.');
    console.error('Altrimenti chiudi il programma che usa la porta e riprova.\n');
  } else console.error(error);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  const phoneUrls = lanAddresses().map(urlFor);
  const output = phoneUrls.length
    ? `URL FISSO SAFARI (stessa Wi-Fi):\r\n${phoneUrls.join('\r\n')}\r\n`
    : 'Nessun indirizzo Wi-Fi rilevato. Collega il PC alla rete e riavvia.\r\n';
  if (process.env.GOD_WORLD_SKIP_URL_FILE !== '1') writeFileSync(join(ROOT, 'URL_IPHONE.txt'), output, 'utf8');

  console.log('\n=============================================================');
  console.log(' KINGDOM WAR V8.0.4 MOBILE - SAFARI + TIKFINITY (8793)');
  console.log('=============================================================');
  console.log('Questa versione e separata dagli altri giochi.');
  console.log('Il suo URL resta uguale anche quando modifichi i file.\n');
  console.log('Apri su Safari iPhone, sulla stessa Wi-Fi:');
  for (const phoneUrl of phoneUrls) console.log(`  ${phoneUrl}`);
  console.log(`\nTest PC: ${urlFor('127.0.0.1')}`);
  console.log('\nStato TikFinity: connessione a ws://127.0.0.1:21213/');
  console.log(`Musica completa in loop: ${existsSync(MUSIC_FILE) ? 'PRONTA' : 'FILE NON TROVATO'}`);
  console.log('Lascia aperta questa finestra durante la LIVE.');
  console.log('Se Safari non apre la pagina, usa ABILITA_WIFI_PRIVATO.bat.\n');
  connectTikFinity();
  if (process.env.GOD_WORLD_NO_OPEN !== '1') setTimeout(openLocalUrl, 500);
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  clearInterval(heartbeat);
  tikFinity?.close();
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
