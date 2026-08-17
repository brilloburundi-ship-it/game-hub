(async () => {
  const loading = document.querySelector('#loading');
  try {
    const response = await fetch('game.js', { cache: 'no-store' });
    if (!response.ok) throw new Error(`game.js ${response.status}`);
    let source = await response.text();

    const replaceOnce = (needle, replacement, label) => {
      if (!source.includes(needle)) throw new Error(`Prefab patch mismatch: ${label}`);
      source = source.replace(needle, replacement);
    };

    replaceOnce(
      "  const assets = [\n    ['1', 'assets/soldiers/soldier_1_atlas.webp']",
      "  const assets = [\n    ['prefab_blue_hq', 'assets/prefabs/blue_hq.webp'],\n    ['prefab_trench', 'assets/prefabs/trench.webp'],\n    ['prefab_village', 'assets/prefabs/village.webp'],\n    ['prefab_checkpoint', 'assets/prefabs/checkpoint.webp'],\n    ['prefab_bunker', 'assets/prefabs/bunker.webp'],\n    ['prefab_bridge', 'assets/prefabs/bridge.webp'],\n    ['prefab_red_hq', 'assets/prefabs/red_hq.webp'],\n    ['1', 'assets/soldiers/soldier_1_atlas.webp']",
      'asset loader'
    );

    replaceOnce(
      "  for (let i = 0; i < W.sectors; i++) drawSectorTheme(i, i * sw, sw);",
      "  drawPrefabMap();",
      'sector renderer'
    );

    replaceOnce(
      "  drawBase(58, 'blue'); drawBase(1222, 'red');\n  for (const c of COVER) drawCover(c, false);",
      "  // Build 0.5: generated prefab modules replace procedural scenery.",
      'procedural scenery'
    );

    const prefabRenderer = `
const PREFAB_MODULES = [
  ['prefab_blue_hq', -12, 418, 210, 175],
  ['prefab_trench', 170, 430, 205, 170],
  ['prefab_village', 350, 410, 210, 182],
  ['prefab_checkpoint', 535, 438, 205, 160],
  ['prefab_bunker', 715, 425, 210, 170],
  ['prefab_bridge', 895, 432, 215, 165],
  ['prefab_red_hq', 1074, 414, 218, 182]
];
function drawPrefabMap() {
  x.save();
  x.imageSmoothingEnabled = false;
  for (const [key, dx, dy, dw, dh] of PREFAB_MODULES) {
    const image = I[key];
    if (image) x.drawImage(image, dx, dy, dw, dh);
  }
  x.restore();
}
`;

    replaceOnce(
      "function drawFX() {",
      `${prefabRenderer}\nfunction drawFX() {`,
      'prefab renderer injection'
    );

    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('[Frontline prefab map]', error);
    if (loading) {
      loading.classList.remove('hidden');
      loading.innerHTML = `<b>MAP LOAD ERROR</b><span>${String(error.message || error)}</span>`;
    }
  }
})();
