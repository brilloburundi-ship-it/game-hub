import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../games/tiktok-fighter-arena');
const read=name=>readFileSync(resolve(root,name),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const must=name=>{const path=resolve(root,name);assert(existsSync(path),`Missing Fighter Arena audio file: ${name}`);return path};

const audioModule='combat-audio-v11.js';
const dataModules=[
  'assets/audio/combat/sword-slice-data.js',
  'assets/audio/combat/sword-clash-data.js',
  'assets/audio/combat/sword-stab-data.js',
  'assets/audio/combat/magic-cast-a-data.js',
  'assets/audio/combat/magic-cast-b-data.js',
  'assets/audio/combat/magic-impact-data.js'
];
for(const name of [audioModule,...dataModules])must(name);

const index=read('index.html');
const audio=read(audioModule);
assert(index.includes('combat-audio-v11.js?v=1.1.0'),'Combat audio v1.1 is not wired into Fighter Arena index.html');
assert(!index.includes('combat-audio.js?v=1.0.0'),'Legacy combat audio must not remain active');
assert(audio.includes("const VERSION='1.1.0'"),'Combat audio module version mismatch');
assert(audio.includes('AudioContext||window.webkitAudioContext'),'Combat audio must use Web Audio with Safari fallback');
assert(audio.includes('decodeAudioData'),'Embedded combat audio decode path missing');
assert(audio.includes("document.querySelector('#startButton')"),'Combat audio must prime from ENTER ARENA');
assert(audio.includes('MAGIC_IDS'),'Magic fighter routing missing');
assert(audio.includes('RANGED_IDS'),'Ranged fighter routing missing');
assert(audio.includes('BLADE_IDS'),'Blade fighter routing missing');
for(const bank of ['swordSwing','swordImpact','stab','magicCast','magicImpact'])assert(audio.includes(bank),`Combat audio bank missing: ${bank}`);
for(const id of ['hero_knight','medieval_king','samurai','evil_wizard','fire_wizard','lightning_mage','huntress','samurai_archer'])assert(audio.includes(`'${id}'`),`Combat audio fighter mapping missing: ${id}`);

for(const name of dataModules){
  const source=read(name);
  const match=source.match(/export default 'data:audio\/mpeg;base64,([A-Za-z0-9+/=]+)'/);
  assert(match,`${name}: embedded MP3 data URI missing`);
  const bytes=Buffer.from(match[1],'base64');
  assert(bytes.length>1000,`${name}: embedded MP3 is unexpectedly small`);
  const id3=bytes.subarray(0,3).toString('ascii')==='ID3';
  const mpeg=bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0;
  assert(id3||mpeg,`${name}: invalid MP3 header`);
}

for(const name of [audioModule,...dataModules]){
  const result=spawnSync(process.execPath,['--check',resolve(root,name)],{encoding:'utf8'});
  assert(result.status===0,`${name} syntax check failed: ${result.stderr||result.stdout}`);
}

console.log(`Fighter Arena combat audio OK: ${dataModules.length} embedded MP3 assets, Web Audio v1.1 active`);
