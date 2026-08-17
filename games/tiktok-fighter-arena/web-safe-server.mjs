import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.FIGHTER_ARENA_WEB_PORT || 8777);
const HOST = '127.0.0.1';
const TIKTOOL_API_KEY = String(process.env.TIKTOOL_API_KEY || 'tk_fbdb0dbd17546f878ddc86ae2ace8fbca16c1d1c31e75dae').trim();
const TIKTOOL_AUTH_URL = 'https://api.tik.tools/authentication/jwt';
const TIKTOOL_WS_URL = 'wss://api.tik.tools';

const MIME = {
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

function baseHeaders(type = 'text/plain; charset=utf-8') {
  return {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
}

function send(response, code, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(code, baseHeaders(type));
  response.end(body);
}

function sendJson(response, code, payload) {
  send(response, code, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function validCreator(value) {
  const creator = String(value || '').replace(/^@/, '').trim();
  if (!creator || creator.length > 32) return '';
  if (!/^[A-Za-z0-9._]+$/.test(creator)) return '';
  return creator;
}

async function mintTikToolToken(uniqueId) {
  if (!TIKTOOL_API_KEY) throw new Error('TikTool API key missing');

  const response = await fetch(`${TIKTOOL_AUTH_URL}?apiKey=${encodeURIComponent(TIKTOOL_API_KEY)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      allowed_creators: [uniqueId],
      expire_after: 3600,
      max_websockets: 1
    }),
    signal: AbortSignal.timeout(10000)
  });

  let payload = null;
  try { payload = await response.json(); } catch {}

  if (!response.ok) {
    const message = payload?.message || payload?.error || `TikTool auth ${response.status}`;
    throw new Error(message);
  }

  const token = payload?.data?.token || payload?.token;
  if (!token) throw new Error('TikTool JWT token missing');
  return token;
}

const server = http.createServer(async (request, response) => {
  let url;
  try {
    url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  } catch {
    send(response, 400, 'Bad request');
    return;
  }

  if (url.pathname === '/__health') {
    sendJson(response, 200, { ok: true, app: 'fighter-arena-web-safe', liveBridge: 'tiktool' });
    return;
  }

  if (url.pathname === '/api/tiktool/token') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    const uniqueId = validCreator(url.searchParams.get('uniqueId'));
    if (!uniqueId) {
      sendJson(response, 400, { error: 'TikTok username non valido' });
      return;
    }

    try {
      const token = await mintTikToolToken(uniqueId);
      sendJson(response, 200, { token, wsUrl: TIKTOOL_WS_URL, uniqueId });
    } catch (error) {
      console.error(`[tiktool] JWT error for @${uniqueId}: ${error?.message || error}`);
      sendJson(response, 502, { error: 'TikTool non raggiungibile o autenticazione rifiutata' });
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method not allowed');
    return;
  }

  let pathname = url.pathname;
  try { pathname = decodeURIComponent(pathname); } catch {
    send(response, 400, 'Bad path');
    return;
  }
  if (pathname === '/') pathname = '/desktop-live.html';

  const file = resolve(ROOT, `.${pathname}`);
  const rel = relative(ROOT, file);
  if (rel.startsWith('..') || file === ROOT) {
    send(response, 403, 'Forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    send(response, 404, `Missing local file: ${pathname}`);
    return;
  }

  const stats = statSync(file);
  const headers = {
    ...baseHeaders(MIME[extname(file).toLowerCase()] || 'application/octet-stream'),
    'Accept-Ranges': 'bytes'
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
});

server.on('error', error => {
  console.error(`[web-safe] ${error?.code || 'ERROR'}: ${error?.message || error}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Fighter Arena WEB APP: http://${HOST}:${PORT}/desktop-live.html`);
  console.log('LIVE bridge: TikTool cloud WebSocket (TikFinity non necessario).');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
