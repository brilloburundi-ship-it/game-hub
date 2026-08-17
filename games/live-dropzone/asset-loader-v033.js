(() => {
'use strict';

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
  const f = window.LD033F || '';
  const w = window.LD033W || '';
  const t = window.LD033T || '';
  if (!f || !w || !t || f.length !== 65352 || w.length !== 3096 || t.length !== 86536) {
    throw new Error(`asset payload incompleto f=${f.length} w=${w.length} t=${t.length}`);
  }

  const [fighters, weapons, tiles] = await Promise.all([
    loadImage(`data:image/webp;base64,${f}`, 'fighters'),
    loadImage(`data:image/webp;base64,${w}`, 'weapons'),
    loadImage(`data:image/webp;base64,${t}`, 'tiles')
  ]);

  if (fighters.naturalWidth !== 384 || fighters.naturalHeight !== 576) {
    throw new Error(`fighters: dimensione inattesa ${fighters.naturalWidth}x${fighters.naturalHeight}`);
  }
  if (tiles.naturalWidth !== 512 || tiles.naturalHeight !== 512) {
    throw new Error(`tiles: dimensione inattesa ${tiles.naturalWidth}x${tiles.naturalHeight}`);
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
    tileCell: 128,
    weaponBoxes: [[4,4,60,134],[68,4,80,94],[152,4,58,117],[214,4,68,336],[286,4,71,365]],
    provenance: 'complete-prefab-atlas-v033'
  });
})().catch(error => {
  console.error('[LIVE DROPZONE] Complete prefab loader failed:', error);
  document.documentElement.dataset.dropzoneAssets = 'complete-prefabs-error';
  throw error;
});
})();
