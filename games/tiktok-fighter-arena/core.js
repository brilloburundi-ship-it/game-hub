export * from './core-r18.js?v=r18-step1';
import{S}from'./core-r18.js?v=r18-step1';
const ACTIVE_R20=new Set(['street_mon','hero_knight','evil_wizard','huntress','martial_hero','medieval_king','martial_champion','evil_wizard_2','samurai','hero_knight_prime','fantasy_warrior','huntress_2','samurai_ronin','samurai_archer','samurai_commander','fire_wizard','lightning_mage','wanderer_magician','medieval_warrior_2','medieval_warrior_3']);
export const cfg=id=>ACTIVE_R20.has(id)?S.manifest?.fighters?.[id]:undefined;
