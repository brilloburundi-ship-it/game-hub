(() => {
'use strict';
const VERSION = 'v71-surgical-gameplay-fixes-2';
const SHIELD_SECONDS = 120;
const FARMER_SPEED_FACTOR = 0.58;
const WALK_ANIM_SPEED = 0.085;
const WORK_ANIM_SPEED = 0.095;
const MAINTENANCE_MS = 200;
if (window.__V71_SURGICAL_FIXES?.installed) return;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function toast(message) {
  const host = document.querySelector('#toast');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function isAtWar(sim, kingdom) {
  if (!kingdom?.alive) return false;
  return (sim.wars || []).some(w => !w.done && (w.a === kingdom.id || w.b === kingdom.id));
}
function activeWarBetween(sim, a, b) {
  return (sim.wars || []).some(w => !w.done && ((w.a === a && w.b === b) || (w.a === b && w.b === a)));
}
function tuneFarmerSpeed(farmer) {
  if (!farmer || farmer.fixedBuilding || farmer.speed <= 0) return farmer;
  if (!farmer.__v71SpeedTuned) {
    farmer.__v71SpeedTuned = true;
    farmer.speed = clamp(Number(farmer.speed || 20) * FARMER_SPEED_FACTOR, 9.5, 14.5);
  }
  return farmer;
}
function walkingAction(dx, dy) {
  if (Math.abs(dx) + Math.abs(dy) < 0.05) return null;
  if (dx >= 0 && dy >= 0) return 'walk_right';
  if (dx < 0 && dy < 0) return 'walk_left';
  if (dx < 0 && dy >= 0) return 'walk_down';
  return 'walk_up';
}
function stripSpearGraphic(holder) {
  const weapon = holder?._weapon;
  if (!weapon) return;
  try { weapon.removeFromParent?.(); } catch (_) {}
  try { if (!weapon.destroyed) weapon.destroy({ children: true }); } catch (_) {
    try { if (!weapon.destroyed) weapon.destroy(); } catch (_) {}
  }
  holder._weapon = null;
}
function seaDirections(sim, x, y) {
  const dirs = [[0, 1], [1, 0], [-1, 0], [0, -1]];
  return dirs.filter(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    if (typeof sim.inBounds === 'function' && !sim.inBounds(nx, ny)) return false;
    return !sim.land(nx, ny);
  });
}
function portBasicCell(sim, x, y) {
  if (!sim.land(x, y) || sim.isRiver(x, y)) return false;
  if (['mountain', 'ice_coast'].includes(sim.biome(x, y))) return false;
  if (sim.coastDistance(x, y) > 1) return false;
  return seaDirections(sim, x, y).length > 0;
}
function portCell(sim, kingdom) {
  let best = null, bestScore = -Infinity;
  for (const token of kingdom.territory || []) {
    const [x, y] = token.split(',').map(Number);
    if (sim.getOwner(x, y) !== kingdom.id || !portBasicCell(sim, x, y)) continue;
    if (sim.buildingBlockingCell(x, y) || !sim.buildingSpacingOK(kingdom, 'port', x, y)) continue;
    if ((kingdom.farmers || []).some(f => f.cell?.[0] === x && f.cell?.[1] === y)) continue;
    const waterSides = seaDirections(sim, x, y).length;
    const beach = sim.biome(x, y) === 'beach' ? 5 : 0;
    const d = Math.hypot(kingdom.capital[0] - x, kingdom.capital[1] - y);
    const score = beach + waterSides * 0.75 - d * 0.035 + Math.random() * 0.25;
    if (score > bestScore) { best = [x, y]; bestScore = score; }
  }
  return best;
}
function orientPort(sim, building) {
  if (!building?._sprite || building.type !== 'port') return;
  const dirs = seaDirections(sim, building.x, building.y);
  if (!dirs.length) return;
  const [dx, dy] = dirs[0];
  building.__v71PortSeaDir = [dx, dy];
  const here = sim.iso(building.x, building.y);
  const sea = sim.iso(building.x + dx, building.y + dy);
  const vx = sea[0] - here[0], vy = sea[1] - here[1];
  const sprite = building._sprite;
  const sx = Math.abs(sprite.scale.x || 1);
  sprite.scale.x = vx > 0 ? -sx : sx;
  sprite.x = Math.round(building.sx + vx * 0.16);
  sprite.y = Math.round(building.sy + 1 + vy * 0.10);
  sprite.roundPixels = true;
}
function findBuildingOwner(sim, building) {
  if (!building) return null;
  return (sim.kingdoms || []).find(k => (k.buildings || []).includes(building)) || sim.kingdoms?.[building.owner] || null;
}
function enemyGuardNear(sim, renderer, building, owner, radius = 27) {
  if (!owner || !(renderer.__v66Guards instanceof Map)) return false;
  for (const [kingdomId, guards] of renderer.__v66Guards) {
    if (kingdomId === owner.id || !activeWarBetween(sim, kingdomId, owner.id)) continue;
    for (const unit of guards || []) {
      if (unit?.dead || !unit?.s || unit.s.destroyed) continue;
      if (Math.hypot(Number(unit.x) - building.sx, Number(unit.y) - building.sy) <= radius) return true;
    }
  }
  return false;
}
function destroyDisplay(obj) {
  if (!obj) return;
  try { obj.removeFromParent?.(); } catch (_) {}
  try { if (!obj.destroyed) obj.destroy({ children: true }); } catch (_) {
    try { if (!obj.destroyed) obj.destroy(); } catch (_) {}
  }
}
function destroyFireVisual(renderer, building) {
  const fx = renderer.__v66Fires?.get?.(building);
  if (!fx) return;
  try { if (fx.c && !fx.c.destroyed) fx.c.destroy({ children: true }); } catch (_) {}
  renderer.__v66Fires.delete(building);
}
function killFarmerByFire(sim, renderer, kingdom, farmer) {
  if (!kingdom || !farmer || farmer.__v71FireDeath) return;
  farmer.__v71FireDeath = true;
  renderer.battleFx?.(farmer.x, farmer.y - 4, 0xc33a1d);
  kingdom.farmers = (kingdom.farmers || []).filter(f => f !== farmer);
  kingdom.pop = Math.max(0, Number(kingdom.pop || 0) - 1);
  renderer.removeFarmer?.(farmer);
}
function destroyBurnedBuilding(sim, renderer, building) {
  if (!building || building.__v66Destroyed) return;
  const owner = findBuildingOwner(sim, building);
  building.__v66Destroyed = true;
  if (owner) {
    owner.buildings = (owner.buildings || []).filter(b => b !== building);
    for (const farmer of [...(owner.farmers || [])]) {
      if (farmer.fixedBuilding === building.id || (farmer.cell?.[0] === building.x && farmer.cell?.[1] === building.y)) {
        killFarmerByFire(sim, renderer, owner, farmer);
      }
    }
  }
  destroyFireVisual(renderer, building);
  renderer.destroyBuilding?.(building);
  renderer.redrawSettlementGround?.(sim);
}
function updateConfirmedFires(sim, renderer, dt) {
  const fires = renderer.__v66Fires;
  if (!(fires instanceof Map) || !fires.size) return;
  const now = performance.now();
  for (const [building, fx] of [...fires]) {
    if (!building || building.__v66Destroyed || !building._sprite) {
      destroyFireVisual(renderer, building);
      continue;
    }
    const owner = findBuildingOwner(sim, building);
    const recentHit = now - Number(building.__v71LastAttackedAt || 0) <= 2200;
    const physicallyAttacked = enemyGuardNear(sim, renderer, building, owner);
    if (!building.__v71FireConfirmed) {
      if (!recentHit && !physicallyAttacked) {
        destroyFireVisual(renderer, building);
        continue;
      }
      building.__v71FireConfirmed = true;
      building.__v71BurnClock = 0;
    }
    if (fx) fx.life = Math.max(Number(fx.life || 0), 2.0);
    building.__v71BurnClock += dt;
    const burnRate = building.type === 'castle' ? 0.010 : (building.type === 'farm' ? 0.040 : 0.026);
    building.hp = Math.max(building.type === 'castle' ? 1 : 0,
      Number(building.hp || building.maxHp || 1) - Number(building.maxHp || 100) * burnRate * dt);
    const ratio = clamp(building.hp / Math.max(1, building.maxHp), 0, 1);
    building.damageState = ratio < 0.35 ? 2 : 1;
    if (building._sprite) building._sprite.tint = ratio < 0.35 ? 0x886d63 : 0xc9ad9d;
    if (owner && building.type === 'farm') {
      for (const farmer of [...(owner.farmers || [])]) {
        if (farmer.fixedBuilding === building.id || (farmer.cell?.[0] === building.x && farmer.cell?.[1] === building.y)) {
          killFarmerByFire(sim, renderer, owner, farmer);
        }
      }
    }
    if (building.type === 'castle' && building.__v71BurnClock >= 18) {
      destroyFireVisual(renderer, building);
      building.__v71FireConfirmed = false;
    } else if (building.type !== 'castle' && building.hp <= 0) {
      destroyBurnedBuilding(sim, renderer, building);
    }
  }
}
function militaryGiftStrength(giftName, repeat, diamonds) {
  const g = String(giftName || '').toLowerCase();
  const n = Math.max(1, Number(repeat) || 1);
  const value = Math.max(1, Number(diamonds) || 0) * n;
  let military = clamp(Math.round(4 + Math.sqrt(value) * 2.2), 4, 160);
  let heal = clamp(Math.round(5 + Math.sqrt(value) * 0.8), 5, 30);
  let icon = '⚔️';
  if (/rose|ice cream|coffee|doughnut|donut|finger heart/.test(g)) { military = 5 * n; heal = 6; }
  if (/firework|perfume|paper crane|heart me|hand heart|tiktok/.test(g)) { military = 16 * n; heal = 10; icon = '🛡️'; }
  if (/money gun|train|motorcycle|swan|concert|meteor/.test(g)) { military = 42 * n; heal = 16; icon = '⚔️'; }
  if (/sports car|yacht|private jet|whale diving/.test(g)) { military = 78 * n; heal = 22; icon = '🛡️'; }
  if (/galaxy/.test(g)) { military = 190 * n; heal = 34; icon = '🌌'; }
  if (/lion/.test(g)) { military = 380 * n; heal = 42; icon = '🦁'; }
  if (/universe|dragon|castle fantasy|interstellar|phoenix/.test(g) || value >= 1000) {
    military = 620 * n; heal = 55; icon = '👑';
  }
  return { military, heal, icon };
}
function applyWarGift(sim, renderer, kingdom, giftName, repeat, meta) {
  const diamonds = Number(meta?.diamonds || meta?.diamondCount || 0);
  const support = militaryGiftStrength(giftName, repeat, diamonds);
  kingdom.military += support.military;
  kingdom.__v71WarSupportUntil = Math.max(Number(kingdom.__v71WarSupportUntil || 0), sim.age + 18);
  const guards = renderer.__v66Guards?.get?.(kingdom.id) || [];
  for (const unit of guards) {
    if (unit?.dead) continue;
    if (Number.isFinite(unit.__v661Hp)) unit.__v661Hp = Math.min(80, unit.__v661Hp + support.heal);
    unit.hurt = Math.max(0, Number(unit.hurt || 0) - 0.2);
  }
  renderer.supportFx?.(kingdom, support.icon, clamp(Math.round(4 + support.military / 45), 4, 18));
  toast(`${kingdom.name}: WAR SUPPORT +${support.military} military`);
  sim.updateSelected?.();
  return support;
}
function updateShieldVisuals(sim, renderer, state) {
  if (!renderer.labels || !window.PIXI?.Text) return;
  const nowAge = Number(sim.age || 0);
  for (const kingdom of sim.kingdoms || []) {
    const active = kingdom?.alive && Number(kingdom.__v71ShieldUntil || 0) > nowAge;
    let icon = state.shieldVisuals.get(kingdom.id);
    if (!active) {
      if (icon) destroyDisplay(icon);
      state.shieldVisuals.delete(kingdom.id);
      continue;
    }
    if (!icon) {
      icon = new window.PIXI.Text({ text: '🛡️', style: { fontSize: 14 } });
      icon.anchor.set(.5, 1);
      icon.zIndex = 10001;
      renderer.labels.addChild(icon);
      state.shieldVisuals.set(kingdom.id, icon);
    }
    const [x, y] = sim.iso(...kingdom.capital);
    icon.position.set(x + 20, y - 68);
  }
}
function applyPostWarShield(sim, renderer, state, war) {
  if (!war || state.shieldedWars.has(war.id)) return;
  state.shieldedWars.add(war.id);
  let applied = 0;
  for (const side of [war.a, war.b]) {
    const kingdom = sim.kingdoms?.[side];
    if (!kingdom?.alive) continue;
    kingdom.__v71ShieldUntil = Math.max(Number(kingdom.__v71ShieldUntil || 0), sim.age + SHIELD_SECONDS);
    kingdom.aggressive = null;
    kingdom.lastExpand = Math.min(Number(kingdom.lastExpand || 0), sim.age - 3);
    renderer.supportFx?.(kingdom, '🛡️', 6);
    applied++;
  }
  if (applied) toast(`🛡️ Post-war shield: ${SHIELD_SECONDS}s to rebuild`);
}
async function install() {
  for (let i = 0; i < 2500; i++) {
    const sim = window.__SIM;
    if (sim?.r?.app?.ticker && window.__V70_WAR_PEACE_CLEANUP?.installed && window.__V67_PIXEL_BUILDINGS?.installed && sim.__v661BattleStabilityInstalled) break;
    await sleep(20);
  }
  const sim = window.__SIM, renderer = sim?.r;
  if (!sim || !renderer?.app?.ticker) return;
  const state = {
    installed: true,
    version: VERSION,
    shieldVisuals: new Map(),
    shieldedWars: new Set(),
    activeWarIds: new Set((sim.wars || []).filter(w => !w.done).map(w => w.id))
  };
  for (const kingdom of sim.kingdoms || []) for (const farmer of kingdom.farmers || []) tuneFarmerSpeed(farmer);
  const originalSpawnFarmer = sim.spawnFarmer?.bind(sim);
  if (originalSpawnFarmer) {
    sim.spawnFarmer = async function (...args) {
      const farmer = await originalSpawnFarmer(...args);
      return tuneFarmerSpeed(farmer);
    };
  }
  const originalReleaseFarmWorker = sim.releaseFarmWorker?.bind(sim);
  if (originalReleaseFarmWorker) {
    sim.releaseFarmWorker = function (...args) {
      const farmer = originalReleaseFarmWorker(...args);
      if (farmer) {
        farmer.__v71SpeedTuned = false;
        tuneFarmerSpeed(farmer);
      }
      return farmer;
    };
  }
  const originalSetFarmerAction = renderer.setFarmerAction?.bind(renderer);
  if (originalSetFarmerAction) {
    renderer.setFarmerAction = function (farmer, action) {
      const result = originalSetFarmerAction(farmer, action);
      if (farmer?._sprite) farmer._sprite.animationSpeed = action === 'walk' ? WALK_ANIM_SPEED : WORK_ANIM_SPEED;
      return result;
    };
  }
  const originalUpdateFarmer = renderer.updateFarmer?.bind(renderer);
  if (originalUpdateFarmer) {
    renderer.updateFarmer = function (farmer, dx, dy) {
      const result = originalUpdateFarmer(farmer, dx, dy);
      const sprite = farmer?._sprite;
      if (!sprite) return result;
      if (farmer.action === 'walk') {
        const action = walkingAction(Number(dx) || 0, Number(dy) || 0);
        if (action && this.anim?.[action] && sprite._action !== action) {
          sprite.textures = this.anim[action];
          sprite._action = action;
          this.applyFarmerScale?.(sprite, action);
          sprite.gotoAndPlay?.(0);
        }
        sprite.animationSpeed = WALK_ANIM_SPEED;
      } else {
        sprite.animationSpeed = WORK_ANIM_SPEED;
      }
      return result;
    };
  }
  const originalMakeSoldier = renderer.makeSoldier?.bind(renderer);
  if (originalMakeSoldier) {
    renderer.makeSoldier = function (...args) {
      const holder = originalMakeSoldier(...args);
      stripSpearGraphic(holder);
      return holder;
    };
  }
  for (const [, guards] of renderer.__v66Guards || []) for (const unit of guards || []) stripSpearGraphic(unit?.s);
  for (const visual of renderer.warVisuals?.values?.() || []) for (const unit of visual.armies || []) stripSpearGraphic(unit?.s);
  const previousIsBuildable = sim.isBuildableCell.bind(sim);
  sim.isBuildableCell = function (x, y, type = 'house_a') {
    if (type === 'port') return portBasicCell(this, x, y);
    return previousIsBuildable(x, y, type);
  };
  const previousFindBuildCell = sim.findBuildCell.bind(sim);
  sim.findBuildCell = function (kingdom, type, initial = false) {
    if (type === 'port') return portCell(this, kingdom);
    return previousFindBuildCell(kingdom, type, initial);
  };
  const previousRendererAddBuilding = renderer.addBuilding?.bind(renderer);
  if (previousRendererAddBuilding) {
    renderer.addBuilding = async function (kingdom, building) {
      const result = await previousRendererAddBuilding(kingdom, building);
      if (building?.type === 'port') orientPort(sim, building);
      return result;
    };
  }
  for (const kingdom of sim.kingdoms || []) for (const building of kingdom.buildings || []) if (building.type === 'port') orientPort(sim, building);
  const previousDamageBuilding = renderer.damageBuilding?.bind(renderer);
  if (previousDamageBuilding) {
    renderer.damageBuilding = function (building, damage, ...rest) {
      if (building) building.__v71LastAttackedAt = performance.now();
      return previousDamageBuilding(building, damage, ...rest);
    };
  }
  const previousGift = sim.gift?.bind(sim);
  if (previousGift) {
    sim.gift = async function (name, giftName, repeat = 1, meta = {}) {
      const kingdom = this.kingdomByName?.get(String(name).toLowerCase());
      if (kingdom?.alive && isAtWar(this, kingdom)) return applyWarGift(this, renderer, kingdom, giftName, repeat, meta);
      return previousGift(name, giftName, repeat, meta);
    };
  }
  const previousStartWar = sim.startWar.bind(sim);
  sim.startWar = function (a, b) {
    const age = Number(this.age || 0);
    if (Number(a?.__v71ShieldUntil || 0) > age || Number(b?.__v71ShieldUntil || 0) > age) return false;
    return previousStartWar(a, b);
  };
  const previousAttack = sim.attack?.bind(sim);
  if (previousAttack) {
    sim.attack = function (a, b) {
      const age = Number(this.age || 0);
      if (Number(a?.__v71ShieldUntil || 0) > age || Number(b?.__v71ShieldUntil || 0) > age) return false;
      return previousAttack(a, b);
    };
  }
  let lastMaintenance = performance.now();
  let shieldClock = 0;
  const maintenanceTimer = setInterval(() => {
    if (document.hidden || !window.__SIM) return;
    const now = performance.now();
    const dt = clamp((now - lastMaintenance) / 1000, 0.05, 0.30);
    lastMaintenance = now;
    updateConfirmedFires(sim, renderer, dt);
    shieldClock += dt;
    if (shieldClock < 0.4) return;
    shieldClock = 0;
    const currentActive = new Set();
    for (const war of sim.wars || []) {
      if (!war.done) currentActive.add(war.id);
      if (war.done && state.activeWarIds.has(war.id)) applyPostWarShield(sim, renderer, state, war);
    }
    state.activeWarIds = currentActive;
    updateShieldVisuals(sim, renderer, state);
    for (const [, guards] of renderer.__v66Guards || []) for (const unit of guards || []) stripSpearGraphic(unit?.s);
  }, MAINTENANCE_MS);
  state.maintenanceTimer = maintenanceTimer;
  window.__V71_SURGICAL_FIXES = state;
  Object.assign(window.__V71_SURGICAL_FIXES, {
    farmerSpeedTuned: true,
    farmerDirectionsStable: true,
    portsAllCoasts: true,
    noCustomSpearOverlay: true,
    attackOnlyFire: true,
    burningFarmKillsFarmer: true,
    wartimeGiftsMilitaryOnly: true,
    postWarShieldSeconds: SHIELD_SECONDS,
    syntheticArmyRemoved: true,
    perFrameGameplayTickerRemoved: true,
    fireMaintenanceHz: Math.round(1000 / MAINTENANCE_MS),
    visibleArmyScalesWithPower: false
  });
  document.documentElement.dataset.surgicalFixes = VERSION;
}
install().catch(error => {
  window.__V71_SURGICAL_FIXES_ERROR = String(error?.stack || error?.message || error);
  console.error('[v71-surgical-gameplay-fixes]', error);
});
})();