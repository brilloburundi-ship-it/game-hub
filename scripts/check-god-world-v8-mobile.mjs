import { access, readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world-v8-mobile');
const read = name => readFile(resolve(gameRoot, name), 'utf8');
const requireText = (source, value, message) => {
  if (!source.includes(value)) throw new Error(message);
};
const rejectText = (source, value, message) => {
  if (source.includes(value)) throw new Error(message);
};

const [
  index, sw, versionText, worldShape, visuals, gameplay, waterBase,
  farmerDirection, buildingScale, livePower, performanceKernel,
  construction, fishingBoats, warCleanup, groundContact, livingKingdoms, gameCore, packageJson,
  projectsText, flora, battles, battleStability, interfaceSource, styles, manifestText, lanBridge
] = await Promise.all([
  read('index.html'), read('sw.js'), read('version.json'),
  read('latest/world-shape.js'), read('latest/visuals.js'), read('latest/gameplay.js'),
  read('latest/water-base.js'), read('latest/farmer-direction.js'), read('latest/building-scale.js'),
  read('latest/live-power.js'), read('latest/performance-kernel.js'),
  read('construction-phases-v662-native-pixel.js'), read('v68-fishing-boats.js'),
  read('latest/war-peace-cleanup.js'), read('v651-ground-contact.js'),
  read('living-kingdoms-v65.js'),
  read('game.js'),
  readFile(resolve(root, 'package.json'), 'utf8'), readFile(resolve(root, 'data/projects.json'), 'utf8'),
  read('latest/flora.js'), read('v66-living-battles.js'), read('v661-battle-stability.js'),
  read('interface-v63.js'), read('styles.css'), read('manifest.webmanifest'), read('lan-bridge.js')
]);

const version = JSON.parse(versionText);
if (version.game !== 'Kingdom War') throw new Error(`Expected Kingdom War identity, found ${version.game}`);
if (version.version !== '8.0.3-mobile') throw new Error(`Expected mobile V8.0.3 release, found ${version.version}`);
if (version.marker !== 'kingdom-war-v803-npc-combat-camera') throw new Error('V8.0.3 NPC/combat/camera marker missing');
requireText(index, '<b>Kingdom War</b>', 'Kingdom War wooden-tablet title missing');
requireText(index, '<span class="age-title">World Age</span><span id="age">', 'Fantasy World Age label/time pair missing');
rejectText(index, 'build-tag', 'The game version is still visible in the top bar');
rejectText(index, 'bridgeDot', 'The old red bridge dot is still present');
rejectText(lanBridge, 'bridgeDot', 'The removed bridge dot still has a runtime owner');
requireText(manifestText, '"name": "Kingdom War"', 'Installed-game identity was not renamed');
requireText(index, "window.__GOD_WORLD_RELEASE='8.0.3-mobile'", 'Atomic V8.0.3 Mobile release marker missing');
requireText(sw, "const CACHE = 'kingdom-war-v8-0-3-mobile-1'", 'V8.0.3 Mobile service-worker cache marker missing');
rejectText(index, 'V7.1.2 LATEST', 'Stale V7 UI label remains active');
requireText(projectsText, '"rootPath": "games/tiktok-god-world-v8-mobile"', 'Separate Game Hub project path missing');
requireText(projectsText, 'https://brilloburundi-ship-it.github.io/game-hub/games/tiktok-god-world-v8-mobile/', 'Separate live URL missing');
requireText(projectsText, '"name": "Kingdom War"', 'Game Hub display name was not updated');

const forbiddenActivePatchPaths = [
  'v69-runtime-stability.js', 'v705-world-npc-expansion.js', 'v706-world-polish.js', 'tree-depth.js',
  'v70-war-peace-cleanup.js', 'v707-gameplay-polish.js', 'v708-water-camera-fishing.js',
  'v709-water-palette.js', 'v710-farmer-direction.js', 'v711-building-scale-lock.js'
];
for (const file of forbiddenActivePatchPaths) {
  if (index.includes(`src="${file}`)) throw new Error(`Legacy patch must not be loaded: ${file}`);
  if (sw.includes(`'${file}'`)) throw new Error(`Legacy patch must not be cached: ${file}`);
}

const releaseScripts = [
  'latest/runtime-stability.js', 'latest/world-npc-expansion.js', 'latest/world-base.js',
  'latest/world-shape.js', 'latest/flora-loader.js', 'latest/war-peace-cleanup.js',
  'latest/gameplay.js', 'latest/water-base.js', 'latest/visuals.js',
  'latest/farmer-direction.js', 'latest/building-scale.js', 'latest/live-power.js',
  'latest/performance-kernel.js'
];
for (const file of releaseScripts) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loads = (index.match(new RegExp(escaped, 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must be loaded exactly once, found ${loads}`);
  requireText(sw, `'${file}'`, `${file} missing from V8 cache shell`);
}

const token = '20260813-2033-v803';
const localScriptSrcs = [...index.matchAll(/<script src="(?!https?:\/\/)([^"]+)"/g)].map(match => match[1]);
for (const src of localScriptSrcs) {
  if (!src.includes(`v=${token}`)) throw new Error(`Local script is not pinned to V8: ${src}`);
}
const liveIndex = index.indexOf('latest/live-power.js');
const kernelIndex = index.indexOf('latest/performance-kernel.js');
if (liveIndex < 0 || kernelIndex <= liveIndex) throw new Error('Performance kernel must load after explicit LIVE power');

// Map contract: V8 changes no world geometry or artwork.
const digest = async name => createHash('sha256').update(await readFile(resolve(gameRoot, name))).digest('hex');
if (await digest('assets/map/world.json') !== '854c05c914b2765153193b2f49314e8a79d1ef102c3372ef4cfe0f2d87a10e14') {
  throw new Error('World geometry changed; the accepted map must remain unchanged');
}
if (await digest('assets/map/world.png') !== '40a552c90796e827af556517c46592bf0ad322ba31576daebdf57052447da2a4') {
  throw new Error('World artwork changed; the accepted map must remain unchanged');
}
requireText(worldShape, "const VERSION = 'v712-latest-world-shape-1'", 'Accepted rounded-world module missing');
requireText(worldShape, 'function sculptCoast', 'Coast sculpting missing');
requireText(worldShape, 'function extendRiverToSea', 'River mouths must reach the sea');
requireText(visuals, "const VERSION='v712-latest-visuals-1'", 'Accepted water visual layer missing');

// Construction pipeline and original pixel palette remain authoritative.
requireText(construction, "version:'v662-native-pixel-5-final-visibility'", 'Construction phase pipeline missing');
requireText(construction, 'function kingdomFrames', 'Kingdom-coloured construction frames missing');
requireText(construction, 'renderer?.textureToCanvas?.(sprite?.texture)', 'Construction stages must derive from completed prefab');
requireText(construction, 'return recolorTeamCanvas(canvas,color)', 'Construction palette fallback missing');
requireText(construction, 'function finishCompletedSprite(sprite,renderer)', 'Construction completion visibility owner missing');
requireText(construction, 'sprite.__constructionStagesComplete=true', 'Completed castle state marker missing');
requireText(construction, 'renderer?.__v800RequestCull?.()', 'Completed castle must re-evaluate current viewport');
rejectText(construction, 'sprite.visible=wasVisible', 'Construction still restores stale pre-focus castle visibility');

// Smooth civilian direction is one final presentation owner.
requireText(farmerDirection, 'const LOOKAHEAD = 4', 'Civilian route lookahead missing');
requireText(farmerDirection, "const VERSION = 'v803-farmer-direction-fluid-3'", 'Fluid civilian direction owner missing');
requireText(farmerDirection, 'const OPPOSITE_HOLD_MS = 170', 'Opposite-direction debounce missing');
requireText(farmerDirection, 'oppositeFlipHoldMs: 170', 'Civilian direction diagnostic is stale');
requireText(farmerDirection, 'const WALK_ANIMATION_SPEED = 0.133', 'Civilian walk cadence is not aligned to the source animation');
requireText(farmerDirection, 'function preserveWalkFrame(sprite, run)', 'Walking direction changes still reset the footstep frame');
requireText(farmerDirection, 'previousFrame % frameCount', 'Directional walk frame continuity missing');
requireText(farmerDirection, 'sprite.roundPixels = false', 'Fractional walking missing');
requireText(farmerDirection, 'Math.exp(-44 * dt)', 'Civilian interpolation missing');

// Trees and building footprints are one navigation constraint for civilians and armies.
requireText(gameCore, 'vegetationBlocksCell(x, y)', 'Shared vegetation collision query missing');
requireText(gameCore, 'isNpcWalkableCell(k, x, y)', 'Shared civilian walkability owner missing');
requireText(gameCore, 'approachVegetationCell(k, target', 'Workers have no safe approach cell around trees');
requireText(flora, "const VERSION = 'v803-sparse-pixel-flora-navigation-2'", 'Active flora navigation index missing');
requireText(flora, 'buildSim.approachVegetationCell?.(kingdom', 'Construction workers still walk through vegetation');
requireText(battles, 'function navigationObstacle(sim, worldX, worldY)', 'Military obstacle owner missing');
requireText(battles, 'function buildingRadii(b)', 'Military navigation does not respect rendered building size');
requireText(battles, 'nearbyVegetation(sim, worldX, worldY)', 'Military tree avoidance missing');
requireText(battles, 'navigableVelocity(sim, u, vx, vy, step)', 'Military collision-safe steering missing');

// Combat is deliberately slower and ranged attacks have readable projectiles.
requireText(battleStability, "const VERSION = '8.0.3-battle-readability-arrows-2'", 'Readable combat owner missing');
requireText(battleStability, 'function ensureArrowPool(r)', 'Pooled archer projectiles missing');
requireText(battleStability, 'function updateBattleArrows(r, dt)', 'Archer projectile flight missing');
requireText(battles, "r.spawnBattleArrow?.(u, target.x, target.y - 7)", 'Archers do not release arrows at units');
requireText(battles, "r.spawnBattleArrow?.(u, b.sx, b.sy - 9)", 'Archers do not release arrows at buildings');
requireText(battleStability, "sprite.animationSpeed = role === 'archer' ? 0.055 : 0.07", 'Combat attack animation was not slowed');
requireText(battleStability, 'rand(1050, 1400)', 'Combat hit cadence remains too fast to read');

// Building scale is event-driven; no perpetual rescanning is allowed.
requireText(buildingScale, 'const STABLE_LOCKED_WORLD_HEIGHT = 17.5', 'Reduced stable height missing');
requireText(buildingScale, 'const FORGE_LOCKED_WORLD_HEIGHT = 24', 'Reduced forge height missing');
requireText(buildingScale, 'const MARKET_LOCKED_WORLD_HEIGHT = 24', 'Reduced market height missing');
rejectText(buildingScale, 'requestAnimationFrame(sweep)', 'Building scale still rescans on every animation frame');
rejectText(buildingScale, 'loadLivePower', 'LIVE power must be loaded explicitly by the atomic release');
rejectText(buildingScale, 'installPortGuard', 'Building scale must not duplicate the final V8 port owner');
rejectText(groundContact, 'setInterval(() => enforceKingdoms', 'Ground contact still rescans every kingdom forever');
rejectText(construction, 'STABLE_SMALL_SCALE', 'Construction phases still own stable scale');
rejectText(construction, 'forceStableSmallScale', 'Construction phases still override stable scale');
rejectText(await read('v66-living-battles.js'), 'stable: 0.88', 'Battle visuals still override stable scale');

// Port recovery and cleanup run on the simulation clock, not Pixi's render clock.
requireText(gameplay, 'sim.__v712MaybeBuildPort = k => buildIndependentPort(sim, k)', 'Port milestone hook missing');
rejectText(gameplay, 'acquireCoastalBerth', 'Port recovery must not claim a corridor to the sea');
requireText(gameplay, 'portsWaitingForCoast', 'Inland kingdoms must wait for natural coastal expansion');
requireText(gameplay, "sim.findBuildCell(k, 'port', false)", 'Port milestone must use already-owned coastal territory');
rejectText(gameplay, "sim.addBuilding(k, 'port', cell[0], cell[1], true", 'Port milestone must not force-build on unowned land');
rejectText(gameplay, "'stone_tower', 'port'", 'High gifts must leave port construction to the natural coastal milestone');
const pixelBuildings = await read('v67-pixel-buildings.js');
rejectText(pixelBuildings, 'const originalBuildAI = sim.buildAI.bind(sim)', 'Legacy V67 port buildAI owner remains active');
rejectText(pixelBuildings, 'function portBasicCell', 'Legacy V67 port placement owner remains active');
rejectText(pixelBuildings, "if (type === 'port') return portCell", 'Legacy V67 port cell selector remains active');
requireText(warCleanup, 'sim.__v70Housekeeping = housekeeping', 'Simulation-owned housekeeping missing');
rejectText(warCleanup, 'renderer.app?.ticker) renderer.app.ticker.add(housekeeping)', 'Housekeeping still runs on the render ticker');
requireText(fishingBoats, 'fishingLoop:true', 'Primary fishing work loop missing');
requireText(fishingBoats, 'returnToPort:true', 'Fishing boats must return to port');
requireText(waterBase, 'const BOATS_PER_PORT = 2', 'Two fishing boats per port rule missing');

// LIVE power is explicit and ROSE produces an exact +100 total power delta.
requireText(livePower, 'POWER_PER_DIAMOND=100', '100 power per diamond rule missing');
requireText(livePower, "if(g.includes('rose'))return 1", 'Rose diamond fallback missing');
requireText(livePower, 'meta?.giftValue', 'TikFinity gift-value metadata support missing');
requireText(livePower, 'Number.isFinite(v)&&v>0', 'Gift metadata selector must ignore empty zero fields');
requireText(livePower, "await this.waitForKingdomReady(name)", 'LIVE gifts must wait for the JOIN castle transaction');
requireText(livePower, 'before=k?.alive?this.power(k):0', 'Gift power baseline missing');
requireText(livePower, 'target=v*POWER_PER_DIAMOND,current=Math.max(0,this.power(live)-before)', 'Exact gift power compensation missing');
requireText(livePower, '__v713GiftBuildOverrideCount', 'Concurrent high-gift war override reference count missing');
requireText(livePower, '__v713GiftBuildOverride=k.__v713GiftBuildOverrideCount>0', 'High-gift war override can be cleared while queued gifts remain');
requireText(livePower, 'dataset.lastGiftPowerDelta', 'Runtime gift delta diagnostic missing');

// V8 hot paths use shared indexes and revision-based rendering.
requireText(performanceKernel, "const VERSION = 'v803-mobile-performance-kernel-4-kingdom-war'", 'V8.0.3 Mobile kernel marker missing');
requireText(performanceKernel, "dataset.completeRelease = '8.0.3-mobile'", 'V8.0.3 Mobile runtime release diagnostic missing');
requireText(performanceKernel, "document.title = 'Kingdom War'", 'Runtime title still exposes the old game identity');
requireText(performanceKernel, 'mapGeometryChanged: false', 'V8 map-preservation diagnostic missing');
requireText(performanceKernel, 'function rebuildBuildingIndex()', 'Building spatial index missing');
requireText(performanceKernel, 'function cachedTerritory(kingdom)', 'Territory parse cache missing');
requireText(performanceKernel, 'function frontierFor(kingdom)', 'Expansion frontier cache missing');
requireText(performanceKernel, 'sim.buildingBlockingCell = function', 'Indexed collision owner missing');
requireText(performanceKernel, 'sim.economy = function', 'Single cached economy owner missing');
requireText(performanceKernel, 'sim.expandAI = function', 'Cached expansion owner missing');
requireText(performanceKernel, 'this.pickExpansionCell?.(kingdom, candidates', 'Irregular expansion selector missing from final owner');
requireText(gameCore, 'pickExpansionCell(k, candidates', 'Shared irregular frontier selector missing');
requireText(gameCore, 'founding: true', 'Transactional kingdom founding state missing');
requireText(gameCore, 'rollbackFounding(k)', 'Failed JOIN rollback missing');
requireText(gameCore, 'if (!this.hasBuildingVisual(castle))', 'JOIN castle postcondition missing');
requireText(gameCore, 'this.foundingByName = new Map()', 'Per-viewer JOIN transaction owner missing');
requireText(gameCore, 'if (pending) return pending', 'Duplicate JOINs do not await the active founding transaction');
requireText(gameCore, 'alive: false, founding: true', 'Partial kingdoms must remain inactive until the castle exists');
requireText(gameCore, 'waitForKingdomReady(name)', 'Gift readiness gate missing');
requireText(gameCore, 'flushFoundingInteractions(k)', 'JOIN-time interaction replay missing');
requireText(gameCore, 'giftValue: e.giftValue ?? e.gift_value', 'TikFinity gift-value gateway mapping missing');
requireText(gameCore, 'coinValue: e.coinValue ?? e.coin_value', 'TikFinity coin-value gateway mapping missing');
requireText(gameCore, 'envelope.eventData, envelope.payload', 'Nested TikFinity payload normalization missing');
requireText(gameCore, 'const giftProgress = new Map()', 'Gift streak progress normalization missing');
requireText(gameCore, 'repeat = total - previous', 'Gift streak updates are not converted to deltas');
requireText(gameCore, 'giftData.value', 'TikFinity giftData value mapping missing');
requireText(gameCore, 'e.giftName ?? e.gift_name ?? details.giftName', 'TikFinity gift-details name mapping missing');
requireText(livingKingdoms, "queueFoundingInteraction?.(k, 'follow'", 'FOLLOW must not be lost during founding');
requireText(gameplay, 'function bigCityBuildingCount', 'High-gift building scaling missing');
requireText(gameplay, 'lastBigHelpBuilt', 'High-gift build diagnostic missing');
requireText(gameplay, 'lastBigHelpCitizens', 'High-gift visible-citizen diagnostic missing');
requireText(gameplay, 'k.__v712VisibleCitizenCap', 'High gifts do not raise the existing citizen visibility owner');
requireText(gameplay, 'const citizenGain = clamp(Math.round(realizedPlan * 0.65), 18, 32)', 'High-gift citizens are not proportional to realized construction');
requireText(gameCore, 'MAX_GIFT_VISIBLE_FARMERS = 36', 'High-gift citizen performance cap missing');
requireText(gameCore, 'dataset.visibleCitizens', 'Visible citizen runtime diagnostic missing');
requireText(gameplay, 'k.__v712BigHelpQueue', 'High gifts must be serialized per kingdom');
rejectText(gameplay, 'k.__v712BigHelpBusy ||', 'Concurrent high gifts still discard a building plan');
requireText(gameplay, '__v712HighGiftPlan: true', 'High-gift building owner route missing');
requireText(gameCore, 'V8 buildPowerCity is the single high-gift building-plan owner', 'High-gift building ownership is not consolidated');
requireText(gameCore, "if (!meta.__v712HighGiftPlan) await this.instantGiftBuild", 'Legacy named gifts do not delegate high-value building plans');
requireText(livingKingdoms, 'tier && !meta.__v712HighGiftPlan', 'V6.5 help tiers still duplicate high-gift building plans');
rejectText(gameCore, "this.claimGiftLand(k, 24 * n); await this.instantGiftBuild", 'Legacy legendary gift building plan is still active');
requireText(performanceKernel, 'function portDirection(kingdom, x, y)', 'Coast-only port validator missing');
requireText(performanceKernel, 'lastTerritoryDrawRevision === ownerRevision', 'Territory revision gate missing');
requireText(performanceKernel, 'dataset.averageTickMs', 'Long-run performance diagnostic missing');
requireText(performanceKernel, 'renderer.__v800RequestSort', 'Throttled depth-sort owner missing');
requireText(performanceKernel, 'dataset.culledEntities', 'Off-camera entity culling diagnostic missing');
requireText(performanceKernel, 'display.__v800RestoreVisible', 'Off-camera transform culling missing');
requireText(performanceKernel, 'await new Promise(resolve => setTimeout(resolve, 0))', 'Long tick work is not distributed across event-loop slices');
requireText(performanceKernel, 'originalSettlementDraw(visibleSimulation(true))', 'Viewport-scoped settlement-road redraw missing');
requireText(performanceKernel, 'originalRedrawTerritories(visibleSimulation(false))', 'Viewport-scoped territory redraw missing');
requireText(performanceKernel, 'if (bounds.scale < 0.55 && buildings.length > 7)', 'World-overview road budget missing');
requireText(performanceKernel, 'farmer.__v800MotionDebt < 0.18', 'Off-screen civilian motion throttling missing');
requireText(performanceKernel, 'index % 3 === phase', 'Civilian path planning is not distributed');
requireText(performanceKernel, 'warUpdateAccumulator >= 1 / 30', 'Fixed-rate combat update missing');
requireText(gameCore, 'if (this.__v800RequestSort) this.__v800RequestSort()', 'Farmer depth sorting still bypasses the V8 scheduler');
requireText(gameCore, 'this.__v800RequestCull?.()', 'New entities are not culled at creation time');
requireText(gameCore, 'autoDensity: true, resolution: 1', 'Pixel-art renderer must use the stable 1x fill-rate budget');

// Alliances and the renderer-owned automatic camera do not add parallel loops.
requireText(interfaceSource, 'ALLY name = form an alliance', 'ALLY command is missing from the English command/gift rotator');
requireText(gameCore, 'ally(a, b)', 'Reciprocal alliance command owner missing');
requireText(gameCore, 'if (this.areAllied(attacker, target))', 'Allies can still be attacked manually');
requireText(gameCore, '!this.areAllied(k, this.kingdoms[o])', 'Allies remain automatic war candidates');
requireText(gameCore, 'installAutoCamera()', 'Renderer-owned automatic camera missing');
requireText(gameCore, "dataset.autoCamera = 'overview-10s-kingdoms-10s'", 'Automatic camera timing diagnostic missing');
requireText(gameCore, 'dataset.autoCameraMode = this.autoCamera.mode', 'Automatic camera mode diagnostic missing');
requireText(gameCore, 'elapsed < 10000', 'Whole-map opening shot is not ten seconds');
requireText(gameCore, '(elapsed - 10000) / 10000', 'Kingdom shots are not ten seconds each');
requireText(gameCore, "director.mode = 'war'", 'Active wars do not own camera priority');
requireText(gameCore, "director.mode = 'gift'", 'Gift castle focus is missing');
requireText(gameCore, 'this.r.notifyCameraGift?.(k, 10)', 'Gift gateway does not notify the camera owner');
requireText(gameCore, 'Math.exp(-Math.max(.35, 3 / this.autoCamera.transitionSeconds)', 'Automatic camera transitions are not smoothed');
requireText(gameCore, "UI.ranking.classList.toggle('hidden', !overview)", 'WORLD POWERS is not tied to map overview zoom');
requireText(waterBase, 'r.syncOverviewHud?.()', 'Final water/camera clamp bypasses WORLD POWERS zoom visibility');
requireText(styles, 'V8.0.3 Kingdom War wooden tablet HUD', 'Wooden tablet HUD styling missing');
requireText(styles, '.brand b,.age-title,#age', 'Game name and World Age do not share the fantasy style');
rejectText(styles, '.age-title{display:none}', 'World Age becomes hidden on narrow mobile screens');

// Prefabs are already lightweight. Protect quality by enforcing a generous
// lossless ceiling rather than resampling the supplied pixel art.
const buildingDir = resolve(gameRoot, 'assets/buildings');
const buildingFiles = (await readdir(buildingDir)).filter(name => name.endsWith('.png'));
let prefabBytes = 0;
for (const name of buildingFiles) {
  const size = (await stat(resolve(buildingDir, name))).size;
  prefabBytes += size;
  if (size > 70 * 1024) throw new Error(`Building prefab unexpectedly heavy: ${name} (${size} bytes)`);
}
if (prefabBytes > 500 * 1024) throw new Error(`Building prefab set unexpectedly heavy: ${prefabBytes} bytes`);

const pkg = JSON.parse(packageJson);
if (!String(pkg.scripts?.['check:pages'] || '').includes('check:god-world-v8-mobile')) throw new Error('Pages check must include the separate V8 Mobile project');

const syntaxFiles = [
  ...releaseScripts, 'latest/flora.js', 'construction-phases-v662-native-pixel.js',
  'v651-ground-contact.js', 'v66-living-battles.js', 'v661-battle-stability.js',
  'v67-pixel-buildings.js', 'v68-fishing-boats.js', 'game.js', 'sw.js'
];
for (const file of syntaxFiles) {
  const full = resolve(gameRoot, file);
  await access(full);
  const check = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`Invalid JavaScript in ${file}:\n${check.stderr || check.stdout}`);
}

const shellMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shellMatch) throw new Error('Service worker SHELL list missing');
for (const entry of [...shellMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1])) {
  if (entry === './') continue;
  await access(resolve(gameRoot, entry));
}

console.log(`Kingdom War V8.0.3 Mobile: shared NPC obstacles + fluid civilians + readable archer combat + proportional gift citizens + alliances + automatic camera + fixed map/runtime OK (${buildingFiles.length} lossless prefabs, ${prefabBytes} bytes)`);
