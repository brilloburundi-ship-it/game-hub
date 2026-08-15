import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces, homedir } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.FIGHTER_ARENA_PORT || 8795);
const HOST = '0.0.0.0';
const TIKFINITY_URL = process.env.TIKFINITY_URL || 'ws://127.0.0.1:21213/';
const APP_ID = 'tiktok-fighter-arena';
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_CLIENTS = 8;
const TOKEN_DIR = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'FighterArenaBridge')
  : join(homedir(), '.fighter-arena-bridge');
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
  for (const client of [...clients]) {
    if (!sendSse(client, payload)) clients.delete(client);
  }
}

function bridgeStatus() {
  return {
    __bridgeStatus: tikFinityConnected ? 'connected' : 'waiting',
    message: tikFinityConnected ? 'TikFinity connected through the PC' : 'Waiting for TikFinity on the PC'
  };
}

function scheduleReconnect() {
  if (shuttingDown) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectTikFinity, 3000);
}

function connectTikFinity() {
  if (shuttingDown) return;
  clearTimeout(reconnectTimer);
  try {
    tikFinity = new WebSocket(TIKFINITY_URL);
  } catch (error) {
    console.error(`[bridge] Impossibile aprire TikFinity: ${error?.message || error}`);
    scheduleReconnect();
    return;
  }

  tikFinity.addEventListener('open', () => {
    tikFinityConnected = true;
    console.log(`[bridge] TikFinity collegato: ${TIKFINITY_URL}`);
    broadcast(bridgeStatus());
  });

  tikFinity.addEventListener('message', event => {
    let raw = '';
    try {
      raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    } catch {
      return;
    }
    if (!raw || Buffer.byteLength(raw) > MAX_EVENT_BYTES) return;
    try {
      broadcast(JSON.parse(raw));
    } catch {
      // TikFinity Event API is JSON; ignore unrelated/non-JSON frames.
    }
  });

  const disconnected = () => {
    tikFinityConnected = false;
    tikFinity = null;
    broadcast(bridgeStatus());
    scheduleReconnect();
  };
  tikFinity.addEventListener('close', disconnected, { once: true });
  tikFinity.addEventListener('error', () => {
    try { tikFinity?.close(); } catch { disconnected(); }
  }, { once: true });
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

const blockedTopLevel = new Set([
  'bridge', 'README.md', 'BRIDGE_TIKFINITY.md',
  'AVVIA_IPHONE_TIKFINITY.bat', 'ABILITA_BRIDGE_WIFI.bat', 'URL_IPHONE.txt'
]);

function serveStatic(request, response, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end('Bad path'); return; }
  if (pathname === '/') pathname = '/index.html';

  const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
  if (blockedTopLevel.has(firstSegment)) {
    response.writeHead(404).end('Not found');
    return;
  }

  const file = resolve(ROOT, `.${pathname}`);
  const rel = relative(ROOT, file);
  if (rel.startsWith('..') || resolve(file) === resolve(ROOT)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }

  const stats = statSync(file);
  const headers = {
    'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self';"
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
    else createReadStream(file, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Length': stats.size });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const info of entries || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      const address = info.address;
      if (/^169\.254\./.test(address)) continue;
      if (/^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address)) {
        addresses.push(address);
      }
    }
  }
  return [...new Set(addresses)];
}

function urlFor(address) {
  return `http://${address}:${PORT}/?token=${encodeURIComponent(token)}`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/bridge/events') {
    if (!tokenMatches(url.searchParams.get('token'))) {
      response.writeHead(401).end('Invalid token');
      return;
    }
    if (clients.size >= MAX_CLIENTS) {
      response.writeHead(503).end('Too many clients');
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.write(': fighter-arena bridge\n\n');
    clients.add(response);
    sendSse(response, bridgeStatus());
    request.on('close', () => clients.delete(response));
    return;
  }

  if (url.pathname === '/bridge/health') {
    if (!tokenMatches(url.searchParams.get('token'))) {
      response.writeHead(401).end('Invalid token');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({
      ok: true,
      app: APP_ID,
      port: PORT,
      tikFinityConnected,
      clients: clients.size,
      tikfinityUrl: TIKFINITY_URL
    }));
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end('Method not allowed');
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

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  clearInterval(heartbeat);
  try { tikFinity?.close(); } catch {}
  for (const client of clients) {
    try { client.end(); } catch {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('error', error => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`\nLa porta dedicata ${PORT} e gia in uso.`);
    console.error('Se Fighter Arena e gia aperto, usa lo stesso URL su iPhone.');
    console.error('Altrimenti chiudi il programma che usa la porta e riprova.\n');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  const phoneUrls = lanAddresses().map(urlFor);
  const output = phoneUrls.length
    ? `FIGHTER ARENA - URL IPHONE (stessa Wi-Fi):\r\n${phoneUrls.join('\r\n')}\r\n`
    : 'Nessun indirizzo Wi-Fi privato rilevato. Collega PC e telefono alla stessa rete e riavvia.\r\n';
  writeFileSync(join(ROOT, 'URL_IPHONE.txt'), output, 'utf8');

  console.log('\n=============================================================');
  console.log(' FIGHTER ARENA - IPHONE + TIKFINITY BRIDGE (8795)');
  console.log('=============================================================');
  console.log('TikFinity Desktop deve restare aperto sul PC.');
  console.log(`Event API TikFinity: ${TIKFINITY_URL}`);
  console.log('\nApri su iPhone, sulla stessa Wi-Fi:');
  if (phoneUrls.length) for (const phoneUrl of phoneUrls) console.log(`  ${phoneUrl}`);
  else console.log('  Nessun IP LAN rilevato.');
  console.log(`\nPC: ${urlFor('127.0.0.1')}`);
  console.log(`Health:  http://127.0.0.1:${PORT}/bridge/health?token=${encodeURIComponent(token)}`);
  console.log('\nLascia aperta questa finestra durante la LIVE.');
  console.log('CTRL+C per chiudere il bridge.\n');

  connectTikFinity();
});
