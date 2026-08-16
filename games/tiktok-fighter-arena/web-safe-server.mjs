import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.FIGHTER_ARENA_WEB_PORT || 8777);
const HOST = '127.0.0.1';

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

function send(response, code, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  let url;
  try {
    url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  } catch {
    send(response, 400, 'Bad request');
    return;
  }

  if (url.pathname === '/__health') {
    send(response, 200, 'ok');
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
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
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
  console.log(`Fighter Arena WEB SAFE server: http://${HOST}:${PORT}/desktop-live.html`);
  console.log('This server only serves local game files. It does not touch TikFinity or LIVE Studio.');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
