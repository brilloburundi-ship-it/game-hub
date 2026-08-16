import { cp, mkdir, readdir, rm } from 'node:fs/promises';
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

console.log(`Prepared local Fighter Arena assets in ${outDir}`);
