(() => {
'use strict';

const VERSION = '0.3.3';
const SOURCE_CHUNKS = 8;
const FIGHTER_B64_LENGTH = 46920;

function decodeBase64(base64, mime, label) {
  if (!base64 || base64.length % 4 !== 0) {
    throw new Error(`${label}: base64 non valida (${base64?.length || 0})`);
  }
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  if (mime === 'image/webp') {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff !== 'RIFF' || webp !== 'WEBP') throw new Error(`${label}: firma WEBP non valida`);
  }
  if (mime === 'image/png') {
    if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) {
      throw new Error(`${label}: firma PNG non valida`);
    }
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function loadBlobImage(base64, mime, label) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = decodeBase64(base64, mime, label); }
    catch (error) { reject(error); return; }

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${label}: immagine non decodificabile`)); };
    img.src = url;
  });
}

window.LiveDropzoneSourceReady = (async () => {
  document.documentElement.dataset.dropzoneAssets = 'loading-complete-prefabs';

  const fighters64 = window.LD033F || '';
  if (fighters64.length !== FIGHTER_B64_LENGTH) {
    throw new Error(`fighter atlas incompleto: ${fighters64.length}/${FIGHTER_B64_LENGTH}`);
  }

  const parts = await Promise.all(Array.from({ length: SOURCE_CHUNKS }, (_, i) =>
    fetch(`./source/chunk${i}.txt?v=${VERSION}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`source chunk${i}: HTTP ${response.status}`);
      return response.text();
    })
  ));
  const payload = JSON.parse(parts.join(''));

  const [fighters, weapons, tiles] = await Promise.all([
    loadBlobImage(fighters64, 'image/webp', 'fighters'),
    loadBlobImage(payload.weapons, 'image/png', 'weapons'),
    loadBlobImage(payload.tiles, 'image/webp', 'tiles')
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
