const VERSION='1.1.0';

// Visual-only filter. Do not observe class mutations here: the old observer could
// continuously react to its own class changes and stall the main game loop.
// We only suppress the legacy small round-start FIGHT! toast. Imported 3-2-1 /
// FIGHT / K.O announcers and other event toasts such as DOUBLE ATTACK are untouched.
function suppressRoundFight(){
  const el=document.querySelector('#eventToast');
  if(!el)return;
  const text=String(el.textContent||'').trim();
  if(/^FIGHT!?$/i.test(text)){
    if(el.classList.contains('show'))el.classList.remove('show');
    if(el.getAttribute('aria-hidden')!=='true')el.setAttribute('aria-hidden','true');
  }else if(el.hasAttribute('aria-hidden')){
    el.removeAttribute('aria-hidden');
  }
}

suppressRoundFight();
const timer=setInterval(suppressRoundFight,25);
addEventListener('pagehide',()=>clearInterval(timer),{once:true});
window.__fighterArenaFightToastFilter={
  version:VERSION,
  duplicateFightToastHidden:true,
  importedAnnouncerUntouched:true,
  mutationObserver:false,
  mainLoopSafe:true
};
