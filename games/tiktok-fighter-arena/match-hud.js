import{S}from'./core.js?v=1.4.0';

const VERSION='1.1.0';

// Visual-only HUD layer. The original roundLabel/roundTimer remain untouched and
// hidden so the existing imported 3-2-1 / FIGHT / K.O announcer keeps receiving
// its normal game-state signals without any duplicate or flickering HUD text.
const style=document.createElement('style');
style.textContent=`.round-badge.match-hud-static>#roundLabel,.round-badge.match-hud-static>#roundTimer{display:none!important}.round-badge .match-hud-label{display:block}.round-badge .match-hud-number{display:block;color:var(--gold,#ffd56b)!important}`;
document.head.append(style);

let label=null,number=null;
function install(){
  const badge=document.querySelector('.round-badge');
  if(!badge)return false;
  badge.classList.add('match-hud-static');
  label=badge.querySelector('.match-hud-label');
  number=badge.querySelector('.match-hud-number');
  if(!label){label=document.createElement('small');label.className='match-hud-label';label.textContent='FIGHT';badge.append(label)}
  if(!number){number=document.createElement('b');number.className='match-hud-number';badge.append(number)}
  return true;
}
function sync(){
  if(!number&&!install())return;
  if(label&&label.textContent!=='FIGHT')label.textContent='FIGHT';
  const match=String(Math.max(1,Number(S.fightNo||0)));
  if(number.textContent!==match)number.textContent=match;
}

sync();
const timer=setInterval(sync,50);
addEventListener('pagehide',()=>clearInterval(timer),{once:true});
window.__fighterArenaMatchHud={version:VERSION,mode:'static-fight-plus-match-number',roundSignalsUntouched:true,importedAnnouncerUntouched:true};
