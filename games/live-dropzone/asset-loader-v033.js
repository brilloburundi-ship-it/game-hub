(() => {
'use strict';

const VERSION = '0.3.3';
const SOURCE_CHUNKS = 8;

function loadImage(src, label) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${label}: immagine non decodificabile`));
    img.src = src;
  });
}

window.LiveDropzoneSourceReady = (async () => {
  document.documentElement.dataset.dropzoneAssets = 'loading-complete-prefabs';
  const fighters64 = window.LD033F || '';
  if (fighters64.length !== 46920) {
    throw new Error(`fighter atlas incompleto: ${fighters64.length}/46920`);
  }

  const parts = await Promise.all(Array.from({length:SOURCE_CHUNKS},(_,i)=>
    fetch(`./source/chunk${i}.txt?v=${VERSION}`,{cache:'no-store'}).then(r=>{
      if(!r.ok) throw new Error(`source chunk${i}: HTTP ${r.status}`);
      return r.text();
    })
  ));
  const payload = JSON.parse(parts.join(''));

  const [fighters, weapons, tiles] = await Promise.all([
    loadImage(`data:image/webp;base64,${fighters64}`, 'fighters'),
    loadImage(`data:image/png;base64,${payload.weapons}`, 'weapons'),
    loadImage(`data:image/webp;base64,${payload.tiles}`, 'tiles')
  ]);

  if (fighters.naturalWidth !== 384 || fighters.naturalHeight !== 576) {
    throw new Error(`fighters: dimensione inattesa ${fighters.naturalWidth}x${fighters.naturalHeight}`);
  }

  document.documentElement.dataset.dropzoneAssets = 'complete-prefabs-ready';
  return Object.freeze({
    fighters,
    weapons,
    tiles,
    fighterCellW: 96,
    fighterCellH: 144,
    fighterPivotX: 48,
    fighterPivotY: 61.5,
    tileCell: Number(payload.tileCell) || 128,
    weaponBoxes: payload.weaponBoxes,
    provenance: 'complete-prefab-atlas-v033'
  });
})().catch(error => {
  console.error('[LIVE DROPZONE] Complete prefab loader failed:', error);
  document.documentElement.dataset.dropzoneAssets = 'complete-prefabs-error';
  throw error;
});
})();
