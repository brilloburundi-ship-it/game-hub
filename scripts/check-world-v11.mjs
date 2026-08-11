import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { patchWorldV11Source } from '../games/tiktok-world-earth/assets/world-v11-patch.js';

const root=resolve(import.meta.dirname,'..');
const sourcePath=resolve(root,'games/tiktok-world-earth/assets/index-V104FantasyRTS.js');
const tempPath=resolve(root,'.world-v11-patched-check.mjs');
const source=await readFile(sourcePath,'utf8');
const patched=patchWorldV11Source(source,'https://example.invalid/game-hub/games/tiktok-world-earth/assets/');

for(const marker of ["shapeVersion:'readable-world-v2'","const fantasyLakeAt=","window.__TIKTOK_WORLD_MAP_VERSION='readable-world-v2'","https://example.invalid/game-hub/games/tiktok-world-earth/assets/browserAll-MobileFix5.js"]){
  if(!patched.includes(marker))throw new Error(`World V11 patch marker missing: ${marker}`);
}
if(patched.includes("shapeVersion:'fantasy-rts-v1'"))throw new Error('Old world shape version survived V11 patch');

await writeFile(tempPath,patched);
const check=spawnSync(process.execPath,['--check',tempPath],{encoding:'utf8'});
await rm(tempPath,{force:true});
if(check.status!==0)throw new Error(`Patched World Earth bundle is invalid:\n${check.stderr||check.stdout}`);

console.log('World Earth V11 patch: geography, lakes, rivers, import paths and JavaScript syntax OK');
