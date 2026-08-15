import{S}from'./core.js?v=1.4.0';

const VERSION='2.0.0';

// Visible match HUD is now structurally separated from the hidden round signals.
// game-v14 keeps updating #roundLabel/#roundTimer for the imported 3-2-1/FIGHT/K.O
// announcer, while this module only updates the dedicated visible match number.
let number=null;
function bind(){
  number=document.querySelector('#matchNumber');
  return !!number;
}
function sync(){
  if(!number&&!bind())return;
  const match=String(Math.max(1,Number(S.fightNo||0)));
  if(number.textContent!==match)number.textContent=match;
}

sync();
const timer=setInterval(sync,100);
addEventListener('pagehide',()=>clearInterval(timer),{once:true});
window.__fighterArenaMatchHud={
  version:VERSION,
  mode:'dedicated-static-fight-plus-match-number',
  visibleTimer:false,
  roundSignalsSeparated:true,
  importedAnnouncerUntouched:true
};
