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

console.log(`Prepared LIVE-safe Fighter Arena assets in ${outDir} (1280x720, DPR <= 1.25)`);
