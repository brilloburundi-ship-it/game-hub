import{S}from'./core.js?v=1.4.0';

const VERSION='1.0.0';

// Focused HUD override only: combat, roster, gifts and queue logic are untouched.
function syncMatchHud(){
  if(S.round!=='fighting')return;
  const label=document.querySelector('#roundLabel');
  const value=document.querySelector('#roundTimer');
  if(label&&label.textContent!=='FIGHT')label.textContent='FIGHT';
  const match=String(Math.max(1,Number(S.fightNo||1)));
  if(value&&value.textContent!==match)value.textContent=match;
}

const timer=setInterval(syncMatchHud,50);
addEventListener('pagehide',()=>clearInterval(timer),{once:true});
window.__fighterArenaMatchHud={version:VERSION,mode:'fight-label-plus-match-number',timerHidden:true};
