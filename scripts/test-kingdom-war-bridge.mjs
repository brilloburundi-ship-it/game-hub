import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const bridgePort = 18893;
const tikFinityPort = 22113;
const temp = await mkdtemp(join(tmpdir(), 'kingdom-war-bridge-'));
let bridge;
let socket;

const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function textFrame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  const header = Buffer.alloc(4);
  header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

const fakeTikFinity = http.createServer();
fakeTikFinity.on('upgrade', (request, upgradedSocket) => {
  const key = request.headers['sec-websocket-key'];
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  upgradedSocket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '', ''
  ].join('\r\n'));
  socket = upgradedSocket;
});

try {
  await new Promise((resolveListen, reject) => {
    fakeTikFinity.once('error', reject);
    fakeTikFinity.listen(tikFinityPort, '127.0.0.1', resolveListen);
  });

  bridge = spawn(process.execPath, ['bridge/server.mjs'], {
    cwd: resolve(root, 'games/tiktok-god-world-v8-mobile'),
    env: {
      ...process.env,
      GOD_WORLD_PORT: String(bridgePort),
      TIKFINITY_URL: `ws://127.0.0.1:${tikFinityPort}/`,
      GOD_WORLD_NO_OPEN: '1',
      GOD_WORLD_SKIP_URL_FILE: '1',
      LOCALAPPDATA: temp
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  const tokenFile = join(temp, 'TikTokGodWorldPixelBridge', 'bridge-token.txt');
  let token = '';
  for (let i = 0; i < 60 && !token; i++) {
    try { token = (await readFile(tokenFile, 'utf8')).trim(); } catch { await delay(50); }
  }
  assert(token, 'Bridge token was not created');

  let health;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${bridgePort}/bridge/health?token=${encodeURIComponent(token)}`);
      if (response.ok) {
        health = await response.json();
        if (health.tikFinityConnected) break;
      }
    } catch {}
    await delay(50);
  }
  assert(health?.ok && health.app === 'kingdom-war-v804-mobile', 'Bridge health identity is incorrect');
  assert(health.port === bridgePort && health.tikFinityConnected, 'Bridge did not connect to the TikFinity WebSocket');
  assert(socket && !socket.destroyed, 'Mock TikFinity connection was not established');

  const controller = new AbortController();
  const streamResponse = await fetch(`http://127.0.0.1:${bridgePort}/bridge/events?token=${encodeURIComponent(token)}`, { signal: controller.signal });
  assert(streamResponse.ok && streamResponse.headers.get('content-type')?.includes('text/event-stream'), 'Bridge SSE stream did not open');
  const reader = streamResponse.body.getReader();

  const tikFinityGift = {
    event: 'gift',
    data: {
      uniqueId: 'BridgeViewer',
      giftDetails: { giftName: 'Universe' },
      giftData: { value: 1500 },
      repeatCount: 1,
      transactionId: 'bridge-integration-1'
    }
  };
  socket.write(textFrame(tikFinityGift));

  const decoder = new TextDecoder();
  let buffer = '';
  let relayed;
  const abortTimer = setTimeout(() => controller.abort(), 4000);
  try {
    while (!relayed) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      for (const block of buffer.split('\n\n')) {
        const line = block.split('\n').find(entry => entry.startsWith('data: '));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload?.data?.transactionId === 'bridge-integration-1') relayed = payload;
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
  } finally { clearTimeout(abortTimer); }
  controller.abort();
  assert(relayed?.data?.giftDetails?.giftName === 'Universe', 'TikFinity gift name was not relayed unchanged');
  assert(relayed?.data?.giftData?.value === 1500, 'TikFinity gift value was not relayed unchanged');
  console.log('Kingdom War bridge integration OK (TikFinity WebSocket -> token SSE -> nested Universe payload)');
} finally {
  bridge?.kill();
  socket?.destroy();
  await new Promise(resolveClose => fakeTikFinity.close(resolveClose));
  await rm(temp, { recursive: true, force: true });
}
