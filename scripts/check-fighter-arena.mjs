import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../games/tiktok-fighter-arena');
const read=name=>readFileSync(resolve(root,name),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const version=JSON.parse(read('version.json'));
const index=read('index.html');
const game=read('game.js');
const core=read('core.js');
const combat=read('combat.js');
const effects=read('asset-effects.js');
const manifest=JSON.parse(read('manifest-core.json'));
const fighters={...JSON.parse(read('fighters-0.json')),...JSON.parse(read('fighters-1.json')),...JSON.parse(read('fighters-2.json'))};

assert(version.version==='1.2.1','Fighter Arena release version must be 1.2.1');
assert(index.includes(`game.js?v=${version.version}`),'index.html cache-bust does not match release version');
assert(game.includes(`const VERSION='${version.version}'`),'game.js version does not match version.json');
assert(game.includes("FX_ASSETS"),'Original VFX pack loader missing');
assert((effects.match(/data:image\/png;base64,/g)||[]).length===8,'Expected eight original Effects pack spritesheets');
assert(manifest.arenas.length===6,'Expected six Fighter Arena HD scenes');
assert(new Set(manifest.arenas.map(a=>a.id)).size===6,'Arena ids must be unique');
assert(combat.includes('renderArenaStatic'),'Native HD arena renderer missing');
assert(combat.includes('doubleChance'),'Random double attack bonus missing');
assert(combat.includes('DOUBLE ATTACK!'),'Double attack feedback missing');
assert(combat.includes('stableScaleFor'),'Stable fighter height normalization missing');
assert(combat.includes('combatGap'),'Base combat spacing missing');
assert(combat.includes('sheetFx'),'Original VFX sprite runtime missing');
assert(core.includes('resetRoundRuntime'),'Round-side reset missing');
assert(game.includes("window.FighterArenaBridge.version=VERSION"),'Bridge release version override missing');
assert(!game.includes('chooseFallbackAtlas'),'Cross-fighter sprite substitution must never return');
assert(game.includes('atlasFits'),'Sprite atlas geometry validation missing');
assert(game.includes("kind:'embedded-data'"),'Embedded fighter decode must be attempted before file recovery');
assert(game.includes('HELD_URLS.add'),'Persistent Safari Blob recovery missing');
assert(game.includes('arena start blocked'),'Missing fighter atlases must block arena start');
assert(!game.includes('procedural safety renderer enabled'),'Visible procedural fighter recovery must not be enabled by the loader');
assert(game.includes('RENDER_SCALE={samurai:.80,medieval_king:.94}'),'Mobile fighter scale calibration missing');
assert(game.includes('desiredCenterGap'),'Mobile engagement spacing guard missing');
assert(game.includes("a.x=S.w*.14;b.x=S.w*.86"),'Round fighters must reset farther apart');
assert(game.includes('@media(max-width:699px)'),'Mobile HUD safe-area correction missing');
for(const[id,f]of Object.entries(fighters)){
  assert(f.atlas,`${id}: missing atlas`);
  for(const a of ['idle','run','attack1','hurt'])assert(f.animations?.[a],`${id}: missing ${a} animation`);
  for(const[name,a]of Object.entries(f.animations||{})){
    assert(Number.isFinite(a.frameW)&&a.frameW>0,`${id}/${name}: invalid frameW`);
    assert(Number.isFinite(a.frameH)&&a.frameH>0,`${id}/${name}: invalid frameH`);
    assert(Number.isFinite(a.frames)&&a.frames>0,`${id}/${name}: invalid frames`);
    assert(Number.isFinite(a.fps)&&a.fps>0,`${id}/${name}: invalid fps`);
  }
}
for(const name of ['game.js','core.js','combat.js','asset-effects.js']){
  const p=resolve(root,name),r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  assert(r.status===0,`${name} syntax check failed: ${r.stderr||r.stdout}`);
}
console.log(`Fighter Arena ${version.version}: ${Object.keys(fighters).length} unique fighters, ${manifest.arenas.length} HD arenas, 8 VFX sheets, mobile spacing/asset checks passed.`);
