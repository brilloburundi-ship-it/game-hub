import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const outDir = path.join(here, 'www');

const skipNames = new Set([
  'desktop',
  '.DS_Store'
]);

const skipFile = name =>
  name.startsWith('_probe') ||
  name.endsWith('.md') ||
  name.endsWith('.bat');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of await readdir(gameRoot, { withFileTypes: true })) {
  if (skipNames.has(entry.name) || skipFile(entry.name)) continue;
  const source = path.join(gameRoot, entry.name);
  const target = path.join(outDir, entry.name);
  await cp(source, target, { recursive: true, force: true });
}

// Desktop LIVE profile only: keep the shared web game untouched, but prevent the
// WebView canvas from allocating a 2.5x backing surface while LIVE Studio is
// capturing it. At 1280x720, DPR 1.25 renders at 1600x900 internally: still sharp,
// with far less GPU bandwidth/memory pressure than the previous 3200x1800 path.
const combatPath = path.join(outDir, 'combat-v14-closer.js');
let combat = await readFile(combatPath, 'utf8');
const originalDpr = 'dpr=Math.min(devicePixelRatio||1,S.w<700?2.25:2.5)';
const liveSafeDpr = 'dpr=Math.min(devicePixelRatio||1,1.25)';
if (!combat.includes(originalDpr)) {
  throw new Error('LIVE-safe DPR patch target not found in combat-v14-closer.js');
}
combat = combat.replace(originalDpr, liveSafeDpr);
await writeFile(combatPath, combat, 'utf8');

// Desktop uses the cloud bridge only. Do not silently load the local TikFinity
// WebSocket fallback when no cloud username has been configured: that fallback
// repeatedly opens ws://localhost:21213 and can show up in TikFinity as a client
// connecting/disconnecting. The web build keeps its existing fallback behavior.
const bridgePath = path.join(outDir, 'live-bridge.js');
let bridge = await readFile(bridgePath, 'utf8');
const fallbackPattern = /if\s*\(forceLocal\s*\|\|\s*!liveUser\)\s*\{\s*loadLegacyBridge\(\);\s*return;\s*\}/m;
if (!fallbackPattern.test(bridge)) {
  throw new Error('Cloud-only bridge patch target not found in live-bridge.js');
}
bridge = bridge.replace(fallbackPattern, `if (forceLocal) {
    status('local bridge disabled in Fighter Arena Desktop', 'inactive');
    return;
  }

  if (!liveUser) {
    document.documentElement.dataset.fighterBridgeTransport = 'cloud';
    status('set TikTok LIVE account to connect', 'waiting');
    return;
  }`);
await writeFile(bridgePath, bridge, 'utf8');

// Desktop-only first-run setup. The host enters the TikTok @handle once; it is
// stored in the same localStorage key consumed by live-bridge.js. Viewer accounts
// never need configuration. A small CHANGE button is visible only on the loading
// screen so the host can switch LIVE account later without editing URLs/files.
const setupScript = `(() => {
  'use strict';
  const KEY = 'fighter_arena_live_user';
  const clean = value => String(value || '').trim().replace(/^@+/, '').replace(/^https?:\\/\\/(?:www\\.)?tiktok\\.com\\/@/i, '').split(/[/?#]/)[0].trim().slice(0, 32);
  const current = () => clean(localStorage.getItem(KEY) || '');

  function closeSetup() {
    document.querySelector('#desktopLiveSetup')?.remove();
  }

  function openSetup() {
    closeSetup();
    const saved = current();
    const overlay = document.createElement('div');
    overlay.id = 'desktopLiveSetup';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(5,4,12,.88);backdrop-filter:blur(8px);font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff';
    const card = document.createElement('form');
    card.style.cssText = 'width:min(430px,calc(100vw - 40px));padding:26px;border:1px solid rgba(255,213,107,.35);border-radius:18px;background:#100d1d;box-shadow:0 24px 70px rgba(0,0,0,.55)';
    card.innerHTML = '<div style="font-size:11px;letter-spacing:.18em;color:#ffd56b;margin-bottom:8px">FIGHTER ARENA · LIVE SETUP</div><div style="font-size:24px;font-weight:800;margin-bottom:8px">TikTok LIVE account</div><div style="font-size:13px;line-height:1.45;color:#b9b4ca;margin-bottom:18px">Inserisci l’@username dell’account che trasmette la LIVE. Va fatto una sola volta; JOIN, like, follow e regali degli spettatori arriveranno automaticamente dal bridge cloud.</div><label style="display:block;font-size:12px;color:#d7d2e4;margin-bottom:6px">ACCOUNT HOST</label><div style="display:flex;align-items:center;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#090714;padding:0 12px"><span style="color:#ffd56b;font-weight:800">@</span><input id="desktopLiveUserInput" autocomplete="off" spellcheck="false" style="flex:1;border:0;outline:0;background:transparent;color:#fff;font-size:16px;padding:13px 8px" /></div><div id="desktopLiveSetupError" style="min-height:18px;margin-top:7px;font-size:12px;color:#ff8292"></div><div style="display:flex;gap:10px;margin-top:10px"><button type="submit" style="flex:1;border:0;border-radius:10px;padding:13px 16px;background:#ffd56b;color:#130f19;font-weight:900;cursor:pointer">SAVE & CONNECT</button>' + (saved ? '<button id="desktopLiveCancel" type="button" style="border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:13px 16px;background:transparent;color:#fff;font-weight:700;cursor:pointer">CANCEL</button>' : '') + '</div><div style="margin-top:12px;font-size:11px;color:#777187">TikFinity is disabled in this Desktop build.</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const input = card.querySelector('#desktopLiveUserInput');
    input.value = saved;
    setTimeout(() => input.focus(), 0);
    card.querySelector('#desktopLiveCancel')?.addEventListener('click', closeSetup);
    card.addEventListener('submit', event => {
      event.preventDefault();
      const user = clean(input.value);
      const error = card.querySelector('#desktopLiveSetupError');
      if (!user || user.length < 2) {
        error.textContent = 'Inserisci un @username TikTok valido.';
        return;
      }
      localStorage.setItem(KEY, user);
      location.reload();
    });
  }

  function installControl() {
    const card = document.querySelector('#loading .loading-card');
    if (!card) return;
    let button = document.querySelector('#desktopLiveAccountButton');
    if (!button) {
      button = document.createElement('button');
      button.id = 'desktopLiveAccountButton';
      button.type = 'button';
      button.style.cssText = 'margin-top:10px;border:1px solid rgba(255,213,107,.35);border-radius:9px;padding:9px 12px;background:rgba(255,213,107,.08);color:#ffd56b;font-size:11px;font-weight:800;letter-spacing:.04em;cursor:pointer';
      button.addEventListener('click', openSetup);
      card.appendChild(button);
    }
    const user = current();
    button.textContent = user ? 'LIVE: @' + user + ' · CHANGE' : 'SET TIKTOK LIVE ACCOUNT';
    if (!user) openSetup();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installControl, { once: true });
  else installControl();
})();\n`;
await writeFile(path.join(outDir, 'desktop-live-setup.js'), setupScript, 'utf8');

const indexPath = path.join(outDir, 'index.html');
let index = await readFile(indexPath, 'utf8');
const bridgeTag = '<script src="./live-bridge.js?v=1.0.0-cloud-primary"></script>';
if (!index.includes(bridgeTag)) {
  throw new Error('Desktop LIVE setup injection target not found in index.html');
}
index = index.replace(bridgeTag, '<script src="./desktop-live-setup.js?v=1.0.0"></script>\\n  ' + bridgeTag);
await writeFile(indexPath, index, 'utf8');

console.log(`Prepared LIVE-safe Fighter Arena assets in ${outDir} (1280x720, DPR <= 1.25, cloud-only, first-run LIVE setup)`);
