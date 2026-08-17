import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.FIGHTER_ARENA_WEB_PORT || 8777);
const HOST = '127.0.0.1';
const TIKTOOL_API_KEY = String(process.env.TIKTOOL_API_KEY || '').trim();
const TIKTOOL_API_URL = 'https://api.tik.tools';
const TIKTOOL_WS_URL = 'wss://api.tik.tools';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg'
};

function headers(type = 'text/plain; charset=utf-8') {
  return {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache', 'Expires': '0',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
  };
}
function send(res, code, body, type) { res.writeHead(code, headers(type)); res.end(body); }
function json(res, code, payload) { send(res, code, JSON.stringify(payload), 'application/json; charset=utf-8'); }
function creator(value) {
  const v = String(value || '').replace(/^@/, '').trim();
  return v && v.length <= 32 && /^[A-Za-z0-9._]+$/.test(v) ? v : '';
}
function requireKey() {
  if (!TIKTOOL_API_KEY) throw new Error('TikTool API key missing');
  return TIKTOOL_API_KEY;
}
async function readJson(res) { try { return await res.json(); } catch { return null; } }

async function mintJwt(uniqueId) {
  const url = new URL(`${TIKTOOL_API_URL}/authentication/jwt`);
  url.searchParams.set('apiKey', requireKey());
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ allowed_creators: [uniqueId], expire_after: 600, max_websockets: 1 }),
    signal: AbortSignal.timeout(12000)
  });
  const payload = await readJson(res);
  if (!res.ok) throw new Error(payload?.message || payload?.error || `TikTool auth ${res.status}`);
  const token = payload?.data?.token || payload?.token;
  if (!token) throw new Error(payload?.message || 'TikTool JWT token missing');
  return token;
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url || '/', `http://${HOST}:${PORT}`); }
  catch { send(res, 400, 'Bad request'); return; }

  if (url.pathname === '/__health') {
    json(res, 200, {
      ok: true,
      app: 'fighter-arena-web-safe',
      liveBridge: 'tiktool-browser-direct-v3',
      keyConfigured: Boolean(TIKTOOL_API_KEY)
    });
    return;
  }

  if (url.pathname === '/api/tiktool/client-config') {
    if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed' }); return; }
    const uniqueId = creator(url.searchParams.get('uniqueId'));
    if (!uniqueId) { json(res, 400, { error: 'TikTok username non valido' }); return; }
    try {
      json(res, 200, { uniqueId, apiKey: requireKey(), wsUrl: TIKTOOL_WS_URL, mode: 'api-key-direct' });
    } catch (error) {
      json(res, 500, { error: error?.message || 'TikTool key missing' });
    }
    return;
  }

  if (url.pathname === '/api/tiktool/token') {
    if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed' }); return; }
    const uniqueId = creator(url.searchParams.get('uniqueId'));
    if (!uniqueId) { json(res, 400, { error: 'TikTok username non valido' }); return; }
    try { json(res, 200, { token: await mintJwt(uniqueId), wsUrl: TIKTOOL_WS_URL, uniqueId }); }
    catch (error) { json(res, 502, { error: error?.message || 'TikTool authentication failed' }); }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, 'Method not allowed'); return; }
  let pathname = url.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { send(res, 400, 'Bad path'); return; }
  if (pathname === '/') pathname = '/desktop-live.html';

  const file = resolve(ROOT, `.${pathname}`);
  const rel = relative(ROOT, file);
  if (rel.startsWith('..') || file === ROOT) { send(res, 403, 'Forbidden'); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { send(res, 404, `Missing local file: ${pathname}`); return; }

  const stats = statSync(file);
  const base = { ...headers(MIME[extname(file).toLowerCase()] || 'application/octet-stream'), 'Accept-Ranges': 'bytes' };
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${stats.size}` }).end(); return; }
    let start = m[1] ? Number(m[1]) : 0;
    let end = m[2] ? Number(m[2]) : stats.size - 1;
    if (!m[1] && m[2]) { const suffix = Number(m[2]); start = Math.max(0, stats.size - suffix); end = stats.size - 1; }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= stats.size) {
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${stats.size}` }).end(); return;
    }
    end = Math.min(end, stats.size - 1);
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${stats.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') res.end(); else createReadStream(file, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...base, 'Content-Length': stats.size });
  if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
});

server.on('error', error => {
  console.error(`[fighter-arena] ${error?.code || 'ERROR'}: ${error?.message || error}`);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.log(`Fighter Arena: http://${HOST}:${PORT}/desktop-live.html`);
  console.log('TikTool: browser connects directly to wss://api.tik.tools using the local API key.');
  console.log(`API key: ${TIKTOOL_API_KEY ? 'configured' : 'MISSING'}.`);
});
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
