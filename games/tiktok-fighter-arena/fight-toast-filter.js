const VERSION='1.0.0';

// Visual-only filter: suppresses the legacy small FIGHT! toast generated at the
// start of a round. Imported 3-2-1 / FIGHT / K.O announcers and all other event
// toasts (for example DOUBLE ATTACK) remain untouched.
function isRoundStartFight(el){
  return /^FIGHT!?$/i.test(String(el?.textContent||'').trim());
}
function suppress(el){
  if(!el||!isRoundStartFight(el))return;
  el.classList.remove('show');
  el.setAttribute('aria-hidden','true');
}
function install(){
  const el=document.querySelector('#eventToast');
  if(!el)return false;
  suppress(el);
  const observer=new MutationObserver(()=>{
    if(isRoundStartFight(el))suppress(el);
    else el.removeAttribute('aria-hidden');
  });
  observer.observe(el,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
  addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  return true;
}

if(!install()){
  const timer=setInterval(()=>{if(install())clearInterval(timer)},50);
  addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
window.__fighterArenaFightToastFilter={version:VERSION,duplicateFightToastHidden:true,importedAnnouncerUntouched:true};
