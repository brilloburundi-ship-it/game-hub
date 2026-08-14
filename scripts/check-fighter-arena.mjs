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
const combat=read('combat.js');
const manifest=JSON.parse(read('manifest-core.json'));
const fighters={...JSON.parse(read('fighters-0.json')),...JSON.parse(read('fighters-1.json')),...JSON.parse(read('fighters-2.json'))};

assert(version.version==='1.1.0','Fighter Arena release version must be 1.1.0');
assert(index.includes(`game.js?v=${version.version}`),'index.html cache-bust does not match release version');
assert(game.includes(`const VERSION='${version.version}'`),'game.js version does not match version.json');
assert(manifest.arenas.length===6,'Expected six Fighter Arena HD scenes');
assert(new Set(manifest.arenas.map(a=>a.id)).size===6,'Arena ids must be unique');
assert(combat.includes('renderArenaStatic'),'Native HD arena renderer missing');
assert(combat.includes('drawFallbackFighter'),'Animated safe fighter fallback missing');
assert(!game.includes('chooseFallbackAtlas'),'Cross-fighter sprite substitution must never return');
assert(game.includes('atlasFits'),'Sprite atlas geometry validation missing');
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
for(const name of ['game.js','core.js','combat.js']){
  const p=resolve(root,name),r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  assert(r.status===0,`${name} syntax check failed: ${r.stderr||r.stdout}`);
}
console.log(`Fighter Arena ${version.version}: ${Object.keys(fighters).length} unique fighters, ${manifest.arenas.length} HD arenas, checks passed.`);
