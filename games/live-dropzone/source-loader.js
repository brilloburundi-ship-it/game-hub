(() => {
'use strict';

const VERSION = '0.3.0';
const CHUNK_COUNT = 8;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossibile caricare asset: ${src.slice(0, 40)}...`));
    img.src = src;
  });
}

window.LiveDropzoneSourceReady = (async () => {
  document.documentElement.dataset.dropzoneAssets = 'loading-source-prefabs';

  const requests = Array.from({ length: CHUNK_COUNT }, (_, i) =>
    fetch(`./source/chunk${i}.txt?v=${VERSION}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`chunk${i}: HTTP ${response.status}`);
      return response.text();
    })
  );

  const payload = JSON.parse((await Promise.all(requests)).join(''));

  const [fighters, weapons, tiles] = await Promise.all([
    loadImage(`data:image/webp;base64,${payload.fighters}`),
    loadImage(`data:image/png;base64,${payload.weapons}`),
    loadImage(`data:image/webp;base64,${payload.tiles}`)
  ]);

  const source = Object.freeze({
    fighters,
    weapons,
    tiles,
    fighterCell: Number(payload.fighterCell) || 96,
    weaponBoxes: payload.weaponBoxes,
    tileCell: Number(payload.tileCell) || 128,
    provenance: 'source-assembled'
  });

  document.documentElement.dataset.dropzoneAssets = 'source-prefabs-ready';
  return source;
})().catch(error => {
  console.error('[LIVE DROPZONE] Source prefab loader failed:', error);
  document.documentElement.dataset.dropzoneAssets = 'source-prefabs-error';
  throw error;
});
})();
