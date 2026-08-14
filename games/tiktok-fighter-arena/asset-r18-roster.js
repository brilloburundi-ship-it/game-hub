const V='r18-step1';
const read=async path=>{const r=await fetch(`${path}?v=${V}`,{cache:'no-store'});if(!r.ok)throw new Error(`${path} ${r.status}`);return(await r.text()).trim()};
const join=async paths=>(await Promise.all(paths.map(read))).join('');
function validWebp(b64,expected,label){
  if(b64.length!==expected)throw new Error(`${label} payload length ${b64.length}/${expected}`);
  if(!b64.startsWith('UklGR'))throw new Error(`${label} missing RIFF header`);
  const raw=atob(b64);
  if(raw.slice(0,4)!=='RIFF'||raw.slice(8,12)!=='WEBP')throw new Error(`${label} invalid WebP header`);
  const n=(raw.charCodeAt(4)|(raw.charCodeAt(5)<<8)|(raw.charCodeAt(6)<<16)|(raw.charCodeAt(7)<<24))>>>0;
  if(n+8!==raw.length)throw new Error(`${label} truncated WebP ${raw.length}/${n+8}`);
  return`data:image/webp;base64,${b64}`;
}
const specs=[
 ['new_hero_knight_prime.webp',19196,['./assets/new_hero_knight_prime.b64']],
 ['new_fantasy_warrior.webp',22832,['./assets/r18/fantasy_warrior.0.b64','./assets/r18/fantasy_warrior.1.b64','./assets/r18/fantasy_warrior.2.b64','./assets/r18/fantasy_warrior.3.b64']],
 ['new_huntress_2.webp',8800,['./assets/r18/huntress_2.0.b64','./assets/r18/huntress_2.1.b64']],
 ['new_samurai_ronin.webp',23664,['./assets/r18/samurai_ronin.0.b64','./assets/r18/samurai_ronin.1.b64','./assets/r18/samurai_ronin.2.b64','./assets/r18/samurai_ronin.3.b64']],
 ['new_samurai_archer.webp',26688,['./assets/r18/samurai_archer.0.b64','./assets/r18/samurai_archer.1.b64','./assets/r18/samurai_archer.2.b64','./assets/r18/samurai_archer.3.b64']],
 ['new_samurai_commander.webp',25824,['./assets/r18/commander.clean0.b64','./assets/r18/samurai_commander.tail0.b64','./assets/r18/samurai_commander.tail12.b64']],
 ['new_fire_wizard.webp',22860,['./assets/r18/fire.clean0.b64','./assets/r18/fire.clean1.b64','./assets/r18/fire_wizard.tail0.b64','./assets/r18/fire_wizard.tail1.b64']],
 ['new_lightning_mage.webp',19408,['./assets/r18/lightning.clean0.b64','./assets/r18/lightning.clean1.b64','./assets/r18/lightning.clean2.b64','./assets/r18/lightning_mage.tail.b64']],
 ['new_wanderer_magician.webp',24104,['./assets/r18/wanderer_magician.0.b64','./assets/r18/wanderer_magician.1a.b64','./assets/r18/wanderer_magician.1b.b64']]
];
const pack={};
for(const[name,expected,paths]of specs){const b64=await join(paths);pack[`./assets/${name}`]=validWebp(b64,expected,name)}
export const R18_ROSTER_ASSETS=pack;
