import{S,setAvailableFighters}from'./core.js?v=1.4.0';
const REQUIRED=['street_mon','hero_knight','evil_wizard','huntress','martial_hero','medieval_king','martial_champion','evil_wizard_2','samurai','hero_knight_prime','fantasy_warrior','huntress_2','samurai_ronin','samurai_archer','samurai_commander','fire_wizard','lightning_mage','wanderer_magician'];
const EXPECTED=REQUIRED.length;
const button=document.querySelector('#startButton');
const text=document.querySelector('#loadText');
function check(){
  const source=S.availableFighters||new Set();
  const loaded=REQUIRED.filter(id=>source.has(id));
  const missing=REQUIRED.filter(id=>!source.has(id));
  if(source.size!==loaded.length)setAvailableFighters(loaded);
  const complete=loaded.length===EXPECTED;
  window.__fighterArenaRosterStatus={expected:EXPECTED,total:EXPECTED,ready:loaded.length,complete,loaded:[...loaded],missing:[...missing]};
  window.__fighterArenaRoster={expected:EXPECTED,loaded:[...loaded],missing:[...missing]};
  if(window.__fighterArenaLoadError){if(button){button.disabled=false;button.textContent='RELOAD ARENA'}return}
  if(!S.manifest)return;
  if(!complete){
    if(button){button.disabled=true;button.textContent='WAIT FOR 18 FIGHTERS'}
    if(text)text.textContent=`${loaded.length}/18 fighters verified · waiting for complete roster`;
    return;
  }
  if(text)text.textContent='All 18 fighters verified · arenas ready';
  if(button&&window.__fighterArenaReady){button.disabled=false;button.textContent='ENTER ARENA'}
}
check();
setInterval(check,200);
