import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../games/tiktok-fighter-arena');
const read=path=>readFileSync(resolve(root,path),'utf8').trim();

function validateWebP(b64,expected,label){
  assert.equal(b64.length,expected,`${label}: base64 length`);
  assert.match(b64,/^UklGR/,`${label}: base64 RIFF prefix`);
  const buf=Buffer.from(b64,'base64');
  assert.equal(buf.subarray(0,4).toString('ascii'),'RIFF',`${label}: RIFF header`);
  assert.equal(buf.subarray(8,12).toString('ascii'),'WEBP',`${label}: WEBP header`);
  assert.equal(buf.readUInt32LE(4)+8,buf.length,`${label}: complete RIFF payload`);
}

const specs=[
  ['hero_knight_prime',19196,['assets/new_hero_knight_prime.b64']],
  ['fantasy_warrior',22832,['assets/r18/fantasy_warrior.0.b64','assets/r18/fantasy_warrior.1.b64','assets/r18/fantasy_warrior.2.b64','assets/r18/fantasy_warrior.3.b64']],
  ['huntress_2',8800,['assets/r18/huntress_2.0.b64','assets/r18/huntress_2.1.b64']],
  ['samurai_ronin',23664,['assets/r18/samurai_ronin.0.b64','assets/r18/samurai_ronin.1.b64','assets/r18/samurai_ronin.2.b64','assets/r18/samurai_ronin.3.b64']],
  ['samurai_archer',26688,['assets/r18/samurai_archer.0.b64','assets/r18/samurai_archer.1.b64','assets/r18/samurai_archer.2.b64','assets/r18/samurai_archer.3.b64']],
  ['samurai_commander',25404,['assets/r20/samurai-commander.0.b64','assets/r20/samurai-commander.1.b64','assets/r20/samurai-commander.2.b64','assets/r20/samurai-commander.3.b64']],
  ['fire_wizard',22860,['assets/r18_fire_wizard.b64']],
  ['lightning_mage',19408,['assets/r18/lightning.clean0.b64','assets/r18/lightning.clean1.b64','assets/r18/lightning.clean2.b64','assets/r18/lightning_mage.tail.b64']],
  ['wanderer_magician',24104,['assets/r18/wanderer_magician.0.b64','assets/r18/wanderer_magician.1a.b64','assets/r18/wanderer_magician.1b.b64']],
  ['medieval_warrior_3',9976,['assets/r20/medieval-warrior-3.0.b64','assets/r20/medieval-warrior-3.1.b64','assets/r20/medieval-warrior-3.2.b64','assets/r20/medieval-warrior-3.3.b64']]
];

test('Fighter Arena R20 source atlases are complete RIFF/WebP payloads',()=>{
  for(const[label,expected,paths]of specs){
    const b64=paths.map(read).join('');
    validateWebP(b64,expected,label);
  }
});
