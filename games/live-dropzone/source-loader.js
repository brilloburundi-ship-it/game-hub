(() => {
'use strict';

const VERSION = '0.3.2';
const CHUNK_COUNT = 8;
const RIG_CHUNK_COUNT = 7;
const EXPECTED_RIG_B64_LENGTH = 30152;

function loadImage(src, label) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${label}: decode fallita`));
    img.src = src;
  });
}

function loadText(path, label) {
  return fetch(`${path}?v=${VERSION}`, { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    return response.text();
  });
}

function base64BlobUrl(base64, mime, label) {
  if (!base64 || base64.length % 4 !== 0) throw new Error(`${label}: base64 non valida`);
  const raw = atob(base64);
  if (mime === 'image/webp' && (raw.slice(0,4) !== 'RIFF' || raw.slice(8,12) !== 'WEBP')) {
    throw new Error(`${label}: firma WEBP non valida`);
  }
  if (mime === 'image/png' && raw.charCodeAt(0) !== 0x89) {
    throw new Error(`${label}: firma PNG non valida`);
  }
  const bytes = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) bytes[i] = raw.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

async function loadBase64Image(base64, mime, label) {
  const url = base64BlobUrl(base64, mime, label);
  try { return await loadImage(url, label); }
  finally { URL.revokeObjectURL(url); }
}

window.LiveDropzoneSourceReady = (async () => {
  document.documentElement.dataset.dropzoneAssets = 'loading-rigged-prefabs';

  const [sourceParts, rigParts] = await Promise.all([
    Promise.all(Array.from({ length: CHUNK_COUNT }, (_, i) => loadText(`./source/chunk${i}.txt`, `chunk${i}`))),
    Promise.all(Array.from({ length: RIG_CHUNK_COUNT }, (_, i) => loadText(`./rig/rig${i}.txt`, `rig${i}`)))
  ]);

  const payload = JSON.parse(sourceParts.join(''));
  const correctedFighters = rigParts.join('');
  if (correctedFighters.length !== EXPECTED_RIG_B64_LENGTH) {
    throw new Error(`fighter rig incompleto: ${correctedFighters.length}/${EXPECTED_RIG_B64_LENGTH}`);
  }

  const [fighters, weapons, tiles] = await Promise.all([
    loadBase64Image(correctedFighters, 'image/webp', 'fighters'),
    loadBase64Image(payload.weapons, 'image/png', 'weapons'),
    loadBase64Image(payload.tiles, 'image/webp', 'tiles')
  ]);

  const source = Object.freeze({
    fighters,
    weapons,
    tiles,
    fighterCell: 96,
    weaponBoxes: payload.weaponBoxes,
    tileCell: Number(payload.tileCell) || 128,
    provenance: 'source-rigged-shoulder-hand-validated'
  });

  document.documentElement.dataset.dropzoneAssets = 'rigged-prefabs-ready';
  return source;
})().catch(error => {
  console.error('[LIVE DROPZONE] Rigged prefab loader failed:', error);
  document.documentElement.dataset.dropzoneAssets = 'rigged-prefabs-error';
  throw error;
});
})();
