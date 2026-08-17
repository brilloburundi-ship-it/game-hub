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
      "  const assets = [\n    ['prefabs', 'assets/prefabs/frontline_map_prefabs.webp'],\n    ['1', 'assets/soldiers/soldier_1_atlas.webp']",
      'asset loader'
    );

    replaceOnce(
      "  for (let i = 0; i < W.sectors; i++) drawSectorTheme(i, i * sw, sw);",
      "  drawPrefabMap();",
      'sector renderer'
    );

    replaceOnce(
      "  drawBase(58, 'blue'); drawBase(1222, 'red');\n  for (const c of COVER) drawCover(c, false);",
      "  // Prefab atlas replaces procedural bases and back-layer cover props.",
      'procedural props'
    );

    const prefabRenderer = `
const PREFAB_MAP_SLICES = [
  { src: [2, 2, 118, 58], dst: [-12, 514, 210, 110] },
  { src: [120, 2, 136, 37], dst: [168, 548, 218, 76] },
  { src: [2, 62, 146, 34], dst: [348, 516, 222, 108] },
  { src: [150, 62, 106, 36], dst: [530, 542, 212, 82] },
  { src: [2, 100, 138, 36], dst: [708, 534, 220, 90] },
  { src: [2, 139, 210, 26], dst: [886, 536, 236, 88] },
  { src: [142, 100, 114, 32], dst: [1066, 512, 224, 112] }
];
function drawPrefabMap() {
  const atlas = I.prefabs;
  if (!atlas) return;
  x.save();
  x.imageSmoothingEnabled = false;
  for (const piece of PREFAB_MAP_SLICES) {
    const [sx, sy, sw, sh] = piece.src;
    const [dx, dy, dw, dh] = piece.dst;
    x.drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh);
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
