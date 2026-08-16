(() => {
'use strict';

const VERSION = '0.3.1';
const CHUNK_COUNT = 8;
const RIG_CHUNK_COUNT = 7;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossibile caricare asset: ${src.slice(0, 40)}...`));
    img.src = src;
  });
}

function loadText(path, label) {
  return fetch(`${path}?v=${VERSION}`, { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    return response.text();
  });
}

window.LiveDropzoneSourceReady = (async () => {
  document.documentElement.dataset.dropzoneAssets = 'loading-rigged-prefabs';

  const sourceRequests = Array.from({ length: CHUNK_COUNT }, (_, i) =>
    loadText(`./source/chunk${i}.txt`, `chunk${i}`)
  );
  const rigRequests = Array.from({ length: RIG_CHUNK_COUNT }, (_, i) =>
    loadText(`./rig/rig${i}.txt`, `rig${i}`)
  );

  const [sourceParts, rigParts] = await Promise.all([
    Promise.all(sourceRequests),
    Promise.all(rigRequests)
  ]);

  const payload = JSON.parse(sourceParts.join(''));
  const correctedFighters = rigParts.join('');

  const [fighters, weapons, tiles] = await Promise.all([
    loadImage(`data:image/webp;base64,${correctedFighters}`),
    loadImage(`data:image/png;base64,${payload.weapons}`),
    loadImage(`data:image/webp;base64,${payload.tiles}`)
  ]);

  const source = Object.freeze({
    fighters,
    weapons,
    tiles,
    fighterCell: 96,
    weaponBoxes: payload.weaponBoxes,
    tileCell: Number(payload.tileCell) || 128,
    provenance: 'source-rigged-shoulder-hand'
  });

  document.documentElement.dataset.dropzoneAssets = 'rigged-prefabs-ready';
  return source;
})().catch(error => {
  console.error('[LIVE DROPZONE] Rigged prefab loader failed:', error);
  document.documentElement.dataset.dropzoneAssets = 'rigged-prefabs-error';
  throw error;
});
})();
