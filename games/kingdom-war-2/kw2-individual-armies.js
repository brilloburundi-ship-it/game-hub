(() => {
  'use strict';

  const VERSION = '20260814-individual-armies-gifts-1';
  const GIFT_RESERVE_CAP = 12;
  const RELEASE_STEP_MS = 105;
  const RELEASE_JITTER_MS = 95;
  const MIN_SAME_SIDE_SPACING = 7.4;
  const EXTRA_MOVE_SPEED = 23;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  if (window.__KW2_INDIVIDUAL_ARMIES?.installed) return;

  function activeWar(sim) {
    return (sim.wars || []).find(war => !war.done) || null;
  }

  function castlePoint(sim, kingdom) {
    const castle = (kingdom?.buildings || []).find(b => b?.type === 'castle' && !b.__v66Destroyed);
    if (castle && Number.isFinite(castle.sx) && Number.isFinite(castle.sy)) return [castle.sx, castle.sy + 5];
    const p = sim.iso(...(kingdom?.capital || [0, 0]));
    return [p[0], p[1] + 6];
  }

  function setVisible(sprite, visible) {
    if (!sprite || sprite.destroyed) return;
    sprite.visible = visible;
    sprite.renderable = visible;
    if (visible) sprite.play?.(); else sprite.stop?.();
  }

  function moveToward(x, y, tx, ty, speed, dt, epsilon = 2.5) {
    const dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy);
    if (d <= epsilon) return { x, y, arrived: true };
    const step = Math.min(d, Math.max(0, speed * dt));
    return { x: x + dx / d * step, y: y + dy / d * step, arrived: d - step <= epsilon };
  }

  function guards(renderer, side, warId = null) {
    return (renderer.__v66Guards?.get?.(side) || []).filter(unit =>
      unit && !unit.dead && unit.s && !unit.s.destroyed && (!warId || unit.warId === warId)
    );
  }

  function mobilized(renderer, side) {
    return (renderer.__kw2MobilizedReserves?.get?.(side) || []).filter(unit =>
      unit && unit.s && !unit.s.destroyed
    );
  }

  function giftMap(renderer) {
    renderer.__kw2GiftWarReserves ||= new Map();
    return renderer.__kw2GiftWarReserves;
  }

  function giftUnits(renderer, side) {
    return (giftMap(renderer).get(side) || []).filter(unit => unit?.s && !unit.s.destroyed);
  }

  function allSideUnits(renderer, side, warId) {
    return [...guards(renderer, side, warId), ...mobilized(renderer, side), ...giftUnits(renderer, side)];
  }

  function fallbackGiftValue(name) {
    const g = String(name || '').toLowerCase();
    if (g.includes('rose')) return 1;
    if (g.includes('ice cream') || g.includes('finger heart')) return 5;
    if (g.includes('coffee') || g.includes('doughnut') || g.includes('donut')) return 15;
    if (g.includes('perfume') || g.includes('firework') || g.includes('tiktok')) return 50;
    if (g.includes('money gun') || g.includes('train') || g.includes('motorcycle')) return 180;
    if (g.includes('sports car') || g.includes('yacht') || g.includes('private jet') || g.includes('whale')) return 600;
    if (g.includes('meteor') || g.includes('galaxy') || g.includes('lion') || g.includes('universe') || g.includes('dragon') || g.includes('phoenix')) return 1500;
    return 1;
  }

  function giftValue(gift, repeat, meta) {
    const n = Math.max(1, Number(repeat) || 1);
    const fields = [meta?.diamonds, meta?.diamondCount, meta?.giftValue, meta?.coinValue, meta?.value, meta?.price];
    const explicit = fields.map(Number).find(v => Number.isFinite(v) && v > 0);
    return Math.max(1, explicit || fallbackGiftValue(gift)) * n;
  }

  function visibleGiftReinforcements(value) {
    return clamp(1 + Math.floor(Math.log2(Math.max(1, value) + 1) / 2), 1, 6);
  }

  function militaryGiftGain(value) {
    return clamp(0.9 + Math.sqrt(Math.max(1, value)) * 0.38 + Math.log2(value + 1) * 0.55, 1.2, 38);
  }

  function makeGiftReserve(sim, renderer, kingdom, index, warId) {
    const role = index % 5 === 0 ? 'archer' : (index % 3 === 0 ? 'spear' : 'sword');
    const sprite = renderer.makeSoldier?.(kingdom, role);
    if (!sprite) return null;
    const [cx, cy] = castlePoint(sim, kingdom);
    const now = performance.now();
    sprite.scale.set(0.88);
    sprite.position.set(cx, cy);
    renderer.entities?.addChild?.(sprite);
    renderer.swapAnim?.(sprite, 'walk');
    setVisible(sprite, false);
    return {
      s: sprite, side: kingdom.id, role, x: cx, y: cy, index, warId, anim: 'walk',
      speed: rand(29, 40), phase: rand(0, Math.PI * 2), lane: rand(-15, 15),
      releaseAt: now + index * RELEASE_STEP_MS + rand(0, RELEASE_JITTER_MS), giftReserve: true
    };
  }

  function setAnim(renderer, unit, action) {
    if (!unit?.s || unit.s.destroyed || unit.anim === action) return;
    unit.anim = action;
    renderer.swapAnim?.(unit.s, action);
  }

  function face(unit, targetX) {
    const sprite = unit?.s?._sprite;
    if (!sprite) return;
    const mag = Math.abs(sprite.scale.x || 1);
    sprite.scale.x = targetX >= unit.x ? mag : -mag;
  }

  function ensureReleaseData(sim, renderer, war) {
    if (!war || war.done) return;
    const now = performance.now();
    war.__kw2IndividualReleaseEpoch ||= now;
    for (const side of [war.a, war.b]) {
      const kingdom = sim.kingdoms?.[side];
      if (!kingdom?.alive) continue;
      const [cx, cy] = castlePoint(sim, kingdom);
      const core = guards(renderer, side, war.id);
      const extra = mobilized(renderer, side);
      const combined = [...core, ...extra];
      for (let i = 0; i < combined.length; i++) {
        const unit = combined[i];
        if (!Number.isFinite(unit.__kw2IndividualReleaseAt)) {
          unit.__kw2IndividualReleaseAt = war.__kw2IndividualReleaseEpoch + i * RELEASE_STEP_MS + rand(0, RELEASE_JITTER_MS);
          unit.__kw2IndividualSpeed = rand(0.91, 1.12);
          unit.__kw2IndividualPhase = rand(0, Math.PI * 2);
          unit.__kw2IndividualLane = rand(-9, 9);
        }
        if (now < unit.__kw2IndividualReleaseAt) {
          unit.x = cx + rand(-1.2, 1.2);
          unit.y = cy + rand(-0.8, 0.8);
          if (unit.s && !unit.s.destroyed) {
            unit.s.position.set(unit.x, unit.y);
            setVisible(unit.s, false);
          }
        } else if (unit.s && !unit.s.destroyed) {
          setVisible(unit.s, true);
        }
      }
    }
  }

  function nearestEnemyUnit(renderer, war, side, x, y) {
    const enemySide = side === war.a ? war.b : war.a;
    const enemies = allSideUnits(renderer, enemySide, war.id);
    let best = null, bestD = Infinity;
    for (const enemy of enemies) {
      const ex = Number(enemy.x ?? enemy.s?.x), ey = Number(enemy.y ?? enemy.s?.y);
      if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue;
      const d = Math.hypot(ex - x, ey - y);
      if (d < bestD) { bestD = d; best = { unit: enemy, x: ex, y: ey, d }; }
    }
    return best;
  }

  function individualizeMobilized(sim, renderer, war, dt) {
    if (!war || war.done) return;
    const now = performance.now();
    for (const side of [war.a, war.b]) {
      const kingdom = sim.kingdoms?.[side];
      const enemy = sim.kingdoms?.[side === war.a ? war.b : war.a];
      if (!kingdom?.alive || !enemy?.alive) continue;
      const list = mobilized(renderer, side);
      const core = guards(renderer, side, war.id);
      const enemyCastle = castlePoint(sim, enemy);
      for (let i = 0; i < list.length; i++) {
        const unit = list[i];
        if (!unit?.s || unit.s.destroyed || now < Number(unit.__kw2IndividualReleaseAt || 0)) continue;
        unit.__kw2IndividualPhase ||= rand(0.1, Math.PI * 2);
        unit.__kw2IndividualLane ??= rand(-10, 10);
        unit.__kw2IndividualSpeed ||= rand(0.90, 1.12);

        let tx, ty, action = 'walk';
        if (war.__v66?.phase === 'combat') {
          const target = nearestEnemyUnit(renderer, war, side, unit.x, unit.y);
          if (target) {
            const range = unit.role === 'archer' ? 26 : 8.5;
            if (target.d <= range) {
              tx = unit.x; ty = unit.y; action = 'attack';
            } else {
              tx = target.x + Math.sin(unit.__kw2IndividualPhase) * 5;
              ty = target.y + Math.cos(unit.__kw2IndividualPhase) * 3;
            }
          }
        }
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
          const leader = core.length ? core[i % core.length] : null;
          if (leader && Number.isFinite(leader.x) && Number.isFinite(leader.y)) {
            const dx = enemyCastle[0] - leader.x, dy = enemyCastle[1] - leader.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            const px = -dy / len, py = dx / len;
            tx = leader.x - dx / len * (8 + (i % 3) * 3) + px * unit.__kw2IndividualLane;
            ty = leader.y - dy / len * (8 + (i % 3) * 3) + py * unit.__kw2IndividualLane;
          } else {
            tx = enemyCastle[0]; ty = enemyCastle[1];
          }
        }
        const step = moveToward(unit.x, unit.y, tx, ty, EXTRA_MOVE_SPEED * unit.__kw2IndividualSpeed, dt);
        unit.x = step.x; unit.y = step.y;
        unit.s.position.set(unit.x, unit.y);
        unit.s.zIndex = Math.round(unit.y * 100) + 15;
        setAnim(renderer, unit, action);
        face(unit, Number.isFinite(tx) ? tx : enemyCastle[0]);
      }
    }
  }

  function separateSide(renderer, side, warId) {
    const units = allSideUnits(renderer, side, warId).filter(unit => unit?.s && !unit.s.destroyed && unit.s.visible !== false);
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      let ax = Number(a.x ?? a.s.x), ay = Number(a.y ?? a.s.y);
      if (!Number.isFinite(ax) || !Number.isFinite(ay)) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        let bx = Number(b.x ?? b.s.x), by = Number(b.y ?? b.s.y);
        if (!Number.isFinite(bx) || !Number.isFinite(by)) continue;
        let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
        if (d >= MIN_SAME_SIDE_SPACING) continue;
        if (d < 0.01) { dx = rand(-1, 1); dy = rand(-1, 1); d = Math.max(0.01, Math.hypot(dx, dy)); }
        const push = Math.min(0.7, (MIN_SAME_SIDE_SPACING - d) * 0.14);
        const nx = dx / d, ny = dy / d;
        ax -= nx * push; ay -= ny * push; bx += nx * push; by += ny * push;
        if ('x' in a) { a.x = ax; a.y = ay; }
        if ('x' in b) { b.x = bx; b.y = by; }
        a.s.position.set(ax, ay); b.s.position.set(bx, by);
      }
    }
  }

  function syncGiftReserves(sim, renderer, war, dt) {
    if (!war || war.done) return;
    war.__kw2GiftForce ||= {};
    const now = performance.now();
    for (const side of [war.a, war.b]) {
      const kingdom = sim.kingdoms?.[side];
      const enemy = sim.kingdoms?.[side === war.a ? war.b : war.a];
      if (!kingdom?.alive || !enemy?.alive) continue;
      const wanted = clamp(Number(war.__kw2GiftForce[side] || 0), 0, GIFT_RESERVE_CAP);
      const map = giftMap(renderer);
      const list = map.get(side) || [];
      while (list.length < wanted) {
        const unit = makeGiftReserve(sim, renderer, kingdom, list.length, war.id);
        if (!unit) break;
        list.push(unit);
      }
      map.set(side, list);
      const enemyCastle = castlePoint(sim, enemy);
      const core = guards(renderer, side, war.id);
      for (let i = 0; i < list.length; i++) {
        const unit = list[i];
        if (!unit?.s || unit.s.destroyed) continue;
        if (now < unit.releaseAt) {
          const [cx, cy] = castlePoint(sim, kingdom);
          unit.x = cx; unit.y = cy; unit.s.position.set(cx, cy); setVisible(unit.s, false); continue;
        }
        setVisible(unit.s, true);
        let tx, ty, action = 'walk';
        const target = war.__v66?.phase === 'combat' ? nearestEnemyUnit(renderer, war, side, unit.x, unit.y) : null;
        if (target) {
          const range = unit.role === 'archer' ? 26 : 8.5;
          if (target.d <= range) { tx = unit.x; ty = unit.y; action = 'attack'; }
          else { tx = target.x + Math.sin(unit.phase) * 6; ty = target.y + Math.cos(unit.phase) * 4; }
        } else {
          const leader = core.length ? core[i % core.length] : null;
          if (leader && Number.isFinite(leader.x) && Number.isFinite(leader.y)) {
            tx = leader.x + Math.sin(unit.phase) * 10;
            ty = leader.y + Math.cos(unit.phase) * 6;
          } else { tx = enemyCastle[0]; ty = enemyCastle[1]; }
        }
        const step = moveToward(unit.x, unit.y, tx, ty, unit.speed, dt);
        unit.x = step.x; unit.y = step.y;
        unit.s.position.set(unit.x, unit.y);
        unit.s.zIndex = Math.round(unit.y * 100) + 15;
        setAnim(renderer, unit, action);
        face(unit, Number.isFinite(tx) ? tx : enemyCastle[0]);
      }
      kingdom.__kw2GiftWarVisibleUnits = list.length;
    }
  }

  function takeGiftReserves(renderer, war) {
    const map = giftMap(renderer), result = [];
    for (const side of [war.a, war.b]) {
      for (const unit of map.get(side) || []) result.push({ side, unit });
      map.delete(side);
    }
    return result;
  }

  function appendGiftReturners(sim, renderer, war, giftReturners) {
    const state = sim.__kw2Demobilization;
    if (!state || !Array.isArray(state.units)) {
      for (const entry of giftReturners) if (entry.unit?.s && !entry.unit.s.destroyed) entry.unit.s.destroy({ children: true });
      return;
    }
    for (const entry of giftReturners) {
      const kingdom = sim.kingdoms?.[entry.side], unit = entry.unit;
      if (!kingdom?.alive || !unit?.s || unit.s.destroyed) continue;
      state.units.push({ type: 'reserve', side: entry.side, unit, x: Number(unit.x) || unit.s.x, y: Number(unit.y) || unit.s.y });
    }
  }

  function install(sim) {
    if (sim.__kw2IndividualArmies === VERSION) return;
    const renderer = sim.r;

    const oldGift = typeof sim.gift === 'function' ? sim.gift.bind(sim) : null;
    if (oldGift) {
      sim.gift = async function(name, gift, repeat = 1, meta = {}) {
        const result = await oldGift(name, gift, repeat, meta);
        const war = activeWar(this);
        const kingdom = this.kingdomByName?.get?.(String(name || '').trim().toLowerCase());
        if (!war || !kingdom?.alive || (war.a !== kingdom.id && war.b !== kingdom.id)) return result;

        const value = giftValue(gift, repeat, meta);
        const military = militaryGiftGain(value);
        const visible = visibleGiftReinforcements(value);
        kingdom.military = Math.max(2, Number(kingdom.military || 2) + military);
        war.__kw2GiftForce ||= {};
        war.__kw2GiftForce[kingdom.id] = clamp(Number(war.__kw2GiftForce[kingdom.id] || 0) + visible, 0, GIFT_RESERVE_CAP);
        kingdom.__kw2WarGiftMilitaryAdded = Number(kingdom.__kw2WarGiftMilitaryAdded || 0) + military;
        document.documentElement.dataset.kw2LastWarGift = `${kingdom.name}:${Math.round(military * 10) / 10}mil:+${visible}units`;
        this.updateSelected?.();
        this.updateUI?.();
        return result;
      };
    }

    const oldEndWar = typeof renderer.endWar === 'function' ? renderer.endWar.bind(renderer) : null;
    if (oldEndWar) {
      renderer.endWar = function(war) {
        const giftReturners = takeGiftReserves(this, war);
        const result = oldEndWar(war);
        appendGiftReturners(sim, this, war, giftReturners);
        return result;
      };
    }

    const oldUpdateWars = renderer.updateWars.bind(renderer);
    renderer.updateWars = function(battleSim, rawDt) {
      const liveSim = battleSim || sim;
      const dt = clamp(Number(rawDt) || 0.016, 0.001, 0.05);
      const result = oldUpdateWars(liveSim, dt);
      const war = activeWar(liveSim);
      if (war) {
        ensureReleaseData(liveSim, this, war);
        individualizeMobilized(liveSim, this, war, dt);
        syncGiftReserves(liveSim, this, war, dt);
        separateSide(this, war.a, war.id);
        separateSide(this, war.b, war.id);
        const a = liveSim.kingdoms?.[war.a], b = liveSim.kingdoms?.[war.b];
        if (a?.alive && b?.alive) {
          const aCount = allSideUnits(this, war.a, war.id).filter(u => u.s?.visible !== false).length;
          const bCount = allSideUnits(this, war.b, war.id).filter(u => u.s?.visible !== false).length;
          document.documentElement.dataset.kw2IndividualArmy = `${a.name}:${aCount}|${b.name}:${bCount}`;
        }
      }
      return result;
    };

    sim.__kw2IndividualArmies = VERSION;
    window.__KW2_INDIVIDUAL_ARMIES = Object.freeze({
      installed: true,
      version: VERSION,
      giftsAddMilitaryDuringWar: true,
      giftsAddVisibleCastleReinforcements: true,
      giftReserveCapPerSide: GIFT_RESERVE_CAP,
      staggeredCastleExit: true,
      individualMovement: true,
      individualTargetReference: true,
      sameSideSeparation: true,
      remotePopIn: false
    });
    document.documentElement.dataset.kw2IndividualArmies = VERSION;
  }

  async function wait() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && window.__KW2_MOBILIZATION_FLOW?.installed && window.__KW2_OPEN_FIELD_BALANCE?.installed && typeof sim.gift === 'function' && typeof sim.r.updateWars === 'function') {
        install(sim);
        return;
      }
      await sleep(25);
    }
    throw new Error('Kingdom War 2 runtime unavailable for individual army patch');
  }

  wait().catch(error => {
    window.__KW2_INDIVIDUAL_ARMIES_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 individual armies]', error);
  });
})();