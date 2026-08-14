import{S}from'./core.js?v=1.4.0';
const EXPECTED=20;
const button=document.querySelector('#startButton');
const text=document.querySelector('#loadText');
let last='';
function check(){
  const total=Object.keys(S.manifest?.fighters||{}).length;
  const ready=S.availableFighters?.size||0;
  const complete=total===EXPECTED&&ready===EXPECTED;
  window.__fighterArenaRosterStatus={expected:EXPECTED,total,ready,complete};
  if(!total)return;
  if(!complete){
    if(button&&!window.__fighterArenaReady){button.disabled=true;button.textContent=`WAIT FOR ${EXPECTED} FIGHTERS`}
    const msg=`${ready}/${EXPECTED} fighters verified · recovering missing assets`;
    if(text&&!window.__fighterArenaReady&&text.textContent!==msg)text.textContent=msg;
    last=msg;
    return;
  }
  if(button&&window.__fighterArenaReady){button.disabled=false;button.textContent='ENTER ARENA'}
  if(text&&last&&text.textContent===last)text.textContent=`All ${EXPECTED} fighters verified · arenas ready`;
  last='';
}
check();
setInterval(check,250);
