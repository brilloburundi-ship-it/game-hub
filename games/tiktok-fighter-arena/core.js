export * from './core-r18.js?v=r18-step1';
import{S,rotate as baseRotate}from'./core-r18.js?v=r18-step1';
const ACTIVE_R20=new Set(['street_mon','hero_knight','evil_wizard','huntress','martial_hero','medieval_king','martial_champion','evil_wizard_2','samurai','hero_knight_prime','fantasy_warrior','huntress_2','samurai_ronin','samurai_archer','samurai_commander','fire_wizard','lightning_mage','wanderer_magician','medieval_warrior_2','medieval_warrior_3']);
export const cfg=id=>ACTIVE_R20.has(id)?S.manifest?.fighters?.[id]:undefined;

export function rotate(){
  const carry=new Map(S.active.filter(r=>r&&!r.dead).map(r=>[r.viewer.id,r.hp]));
  baseRotate();
  for(const r of S.active){
    if(!r)continue;
    const hp=carry.get(r.viewer.id);
    if(Number.isFinite(hp))r.hp=Math.max(0,Math.min(r.maxHp,hp));
  }
}
