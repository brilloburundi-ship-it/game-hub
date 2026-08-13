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
  projectsText, flora, battles, battleStability, interfaceSource, styles, focusLayout, manifestText, lanBridge, bridgeServer, bridgePackageText
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
  read('interface-v63.js'), read('styles.css'), read('v65-overrides.css'), read('manifest.webmanifest'), read('lan-bridge.js'),
  read('bridge/server.mjs'), read('package.json')
]);

const version = JSON.parse(versionText);
if (version.game !== 'Kingdom War') throw new Error(`Expected Kingdom War identity, found ${version.game}`);
if (version.version !== '8.0.6-mobile') throw new Error(`Expected mobile V8.0.6 release, found ${version.version}`);
if (version.marker !== 'kingdom-war-v806-live-camera-victory-reset') throw new Error('V8.0.6 camera/victory marker missing');
requireText(index, '<b>Kingdom War</b>', 'Kingdom War wooden-tablet title missing');
requireText(index, '<span class="age-title">World Age</span><span id="age">', 'Fantasy World Age label/time pair missing');
rejectText(index, 'build-tag', 'The game version is still visible in the top bar');
rejectText(index, 'bridgeDot', 'The old red bridge dot is still present');
rejectText(lanBridge, 'bridgeDot', 'The removed bridge dot still has a runtime owner');
requireText(manifestText, '"name": "Kingdom War"', 'Installed-game identity was not renamed');
requireText(index, "window.__GOD_WORLD_RELEASE='8.0.6-mobile'", 'Atomic V8.0.6 Mobile release marker missing');
requireText(sw, "const CACHE = 'kingdom-war-v8-0-6-mobile-1'", 'V8.0.6 Mobile service-worker cache marker missing');
rejectText(index, 'id="zoomIn"', 'The removed plus zoom button is still visible');
rejectText(index, 'id="zoomOut"', 'The removed minus zoom button is still visible');
rejectText(gameCore, "$('#zoomIn')", 'The removed plus zoom button still has a runtime handler');
rejectText(gameCore, "$('#zoomOut')", 'The removed minus zoom button still has a runtime handler');
requireText(index, 'id="victoryScreen"', 'Final victory screen is missing');
requireText(index, 'id="victoryWinner"', 'Victory screen has no winner field');
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

const token = '20260813-2300-v806';
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
requireText(battleStability, "const VERSION = '8.0.4-battle-readability-arrows-3'", 'Readable combat owner missing');
requireText(battleStability, 'function ensureArrowPool(r)', 'Pooled archer projectiles missing');
requireText(battleStability, 'function updateBattleArrows(r, dt)', 'Archer projectile flight missing');
requireText(battles, "r.spawnBattleArrow?.(u, target.x, target.y - 7)", 'Archers do not release arrows at units');
requireText(battles, "r.spawnBattleArrow?.(u, b.sx, b.sy - 9)", 'Archers do not release arrows at buildings');
requireText(battleStability, "sprite.animationSpeed = role === 'archer' ? 0.038 : 0.05", 'Combat attack animation was not slowed again');
requireText(battleStability, 'rand(1450, 1900)', 'Combat hit cadence remains too fast to read');
requireText(battleStability, "shaft.moveTo(-5, 0).lineTo(3.5, 0)", 'Archer projectiles were not reduced');
requireText(battleStability, "building.type === 'castle' && kingdom?.alive", 'Castle fire destruction does not eliminate the kingdom');

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
requireText(performanceKernel, "const VERSION = 'v806-mobile-performance-kernel-7-round-end'", 'V8.0.6 Mobile kernel marker missing');
requireText(performanceKernel, "dataset.completeRelease = '8.0.6-mobile'", 'V8.0.6 Mobile runtime release diagnostic missing');
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
requireText(lanBridge, 'new EventSource(`/bridge/events?token=', 'LAN bridge does not use its single token-protected SSE owner');
requireText(bridgeServer, "const TIKFINITY_URL = process.env.TIKFINITY_URL || 'ws://127.0.0.1:21213/'", 'TikFinity WebSocket target changed');
requireText(bridgeServer, "const APP_ID = 'kingdom-war-v804-mobile'", 'Bridge health identity is stale');
requireText(bridgeServer, "tikFinity.addEventListener('message'", 'TikFinity frames are not relayed');
requireText(bridgeServer, "if (url.pathname === '/bridge/events')", 'Token-protected SSE endpoint missing');
rejectText(gameCore, 'function connectBridge', 'Legacy duplicate WebSocket bridge remains beside the SSE owner');
if (JSON.parse(bridgePackageText).version !== '8.0.4') throw new Error('Bridge package version is stale');
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
requireText(gameCore, "dataset.autoCamera = 'director-live-territory-v806'", 'Automatic camera timing diagnostic missing');
requireText(gameCore, 'dataset.autoCameraMode = this.autoCamera.mode', 'Automatic camera mode diagnostic missing');
requireText(gameCore, "dataset.autoCameraShotMs = '10000'", 'Ten-second camera slot diagnostic missing');
requireText(gameCore, 'elapsed < 10000', 'Whole-map opening shot is not ten seconds');
requireText(gameCore, '(elapsed - 10000) / 10000', 'Kingdom shots are not ten seconds each');
requireText(gameCore, 'until: now + 10000', 'War handoff does not preserve a full ten-second shot');
requireText(gameCore, 'notifyCameraCastleDestruction(building, kingdom, winner, seconds = 10)', 'Castle destruction camera priority missing');
requireText(gameCore, 'criticalQueue', 'Concurrent castle destructions are not shown in full');
requireText(gameCore, "director.mode = 'castle-destruction'", 'Castle destruction is not the absolute camera priority');
requireText(gameCore, 'kingdomWorldBounds(kingdom)', 'Large-kingdom camera bounds missing');
requireText(gameCore, 'kingdomCameraTarget(kingdom, now, shotStartedAt)', 'Peace-time kingdom pan missing');
requireText(gameCore, "dataset.autoCameraPan = panX || panY ? 'kingdom-slow-pan'", 'Large kingdoms are not panned slowly');
requireText(gameCore, "director.mode = 'war'", 'Active wars do not own camera priority');
requireText(gameCore, "director.mode = 'gift'", 'Gift castle focus is missing');
requireText(gameCore, 'this.r.notifyCameraGift?.(k, 10)', 'Gift gateway does not notify the camera owner');
requireText(gameCore, 'isCameraKingdom(kingdom)', 'Camera lacks a single live-content kingdom predicate');
requireText(gameCore, "dataset.autoCameraFallback = 'live-kingdom'", 'Closed-war camera does not leave cleared territory');
requireText(gameCore, "dataset.autoCameraFallback = 'castle-winner'", 'Castle camera does not hand off from cleared territory');
requireText(gameCore, 'Math.exp(-Math.max(.35, 3 / this.autoCamera.transitionSeconds)', 'Automatic camera transitions are not smoothed');
requireText(gameCore, 'transitionSeconds: 4.8', 'Automatic camera settling is still too abrupt');
requireText(gameCore, 'progress * progress * progress * (progress * (progress * 6 - 15) + 10)', 'Large-kingdom pan lacks soft acceleration and deceleration');
requireText(gameCore, "now - this.detailShot.shownAt >= 2000", 'Kingdom Focus does not begin fading after two seconds');
requireText(gameCore, "now - this.detailShot.shownAt >= 2600", 'Kingdom Focus fade does not finish');
requireText(gameCore, 'this.setOwner(x, y, -1)', 'Destroyed-castle territory is not neutralized');
requireText(gameCore, 'kingdom.allies?.delete?.(loser.id)', 'Eliminated kingdom remains linked to active AI diplomacy');
requireText(gameCore, 'const MAX_MATCH_KINGDOMS = 12', 'Round player cap is not 12');
requireText(gameCore, 'this.roundEntrants >= MAX_MATCH_KINGDOMS', 'JOIN does not enforce the 12-player round cap');
requireText(gameCore, 'this.checkVictory()', 'Castle elimination does not check for the last surviving player');
requireText(gameCore, "dataset.matchState = 'victory'", 'Victory state is not exposed');
requireText(gameCore, 'window.location.reload()', 'Victory does not restart an empty world automatically');
requireText(gameCore, 'if (this.matchOver) { this.updateUI(); return; }', 'AI continues after the round winner is declared');
requireText(gameCore, "UI.ranking.classList.toggle('hidden', !overview)", 'WORLD POWERS is not tied to map overview zoom');
requireText(waterBase, 'r.syncOverviewHud?.()', 'Final water/camera clamp bypasses WORLD POWERS zoom visibility');
requireText(styles, 'V8.0.6 Kingdom War round victory HUD', 'Wooden tablet HUD styling missing');
requireText(styles, '.brand b,.age-title,#age', 'Game name and World Age do not share the fantasy style');
requireText(styles, '.kingdom-card.fading', 'Kingdom Focus dissolve style missing');
requireText(styles, '.victory-screen{', 'Victory screen has no presentation owner');
requireText(styles, 'top:max(1px,env(safe-area-inset-top))', 'Top wooden tablet is not attached to the safe top edge');
requireText(focusLayout, 'width:166px', 'Desktop Kingdom Focus was not narrowed in its final layout owner');
requireText(focusLayout, 'width:150px', 'Mobile Kingdom Focus was not narrowed in its final layout owner');
requireText(focusLayout, 'width:144px', 'Narrow-mobile Kingdom Focus was not narrowed in its final layout owner');
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
  'v67-pixel-buildings.js', 'v68-fishing-boats.js', 'game.js', 'sw.js', 'bridge/server.mjs'
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

console.log(`Kingdom War V8.0.6 Mobile: live-content camera + 12-player rounds + victory reset + V8.0.4 gameplay/bridge contract OK (${buildingFiles.length} lossless prefabs, ${prefabBytes} bytes)`);
