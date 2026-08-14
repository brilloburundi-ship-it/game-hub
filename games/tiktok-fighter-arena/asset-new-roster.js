const files=[
  ['./assets/new_hero_knight_prime.webp','./assets/new_hero_knight_prime.b64',19196],
  ['./assets/new_fantasy_warrior.webp','./assets/new_fantasy_warrior.b64',22832],
  ['./assets/new_huntress_2.webp','./assets/new_huntress_2.b64',8800],
  ['./assets/new_samurai_ronin.webp','./assets/new_samurai_ronin.b64',23664]
];
const pack={};
for(const[atlas,path,expected]of files){
  const r=await fetch(`${path}?v=roster13`,{cache:'no-store'});
  if(!r.ok)throw new Error(`New roster payload ${path} ${r.status}`);
  const b64=(await r.text()).trim();
  if(b64.length!==expected||!b64.startsWith('UklGR'))throw new Error(`New roster payload invalid ${path} (${b64.length}/${expected})`);
  pack[atlas]=`data:image/webp;base64,${b64}`;
}
export const NEW_ROSTER_ASSETS=pack;
