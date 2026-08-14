import{S}from'./core.js?v=1.3.0';
const EXPECTED=18;
const button=document.querySelector('#startButton');
const text=document.querySelector('#loadText');
let last='';
function check(){
  const total=Object.keys(S.manifest?.fighters||{}).length;
  const ready=S.availableFighters?.size||0;
  window.__fighterArenaRosterStatus={expected:EXPECTED,total,ready,complete:total===EXPECTED&&ready===EXPECTED};
  if(!total)return;
  if(total!==EXPECTED||ready!==EXPECTED){
    if(button){button.disabled=true;button.textContent='WAIT FOR 18 FIGHTERS'}
    const msg=`${ready}/${EXPECTED} fighters verified · waiting for complete roster`;
    if(text&&text.textContent!==msg)text.textContent=msg;
    last=msg;
    return;
  }
  if(button&&window.__fighterArenaReady){button.disabled=false;button.textContent='ENTER ARENA'}
  if(text&&last&&text.textContent===last)text.textContent=`All ${EXPECTED} unique fighters verified · arenas ready`;
  last='';
}
check();
setInterval(check,250);
