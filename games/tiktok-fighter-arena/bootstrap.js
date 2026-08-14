const text=document.querySelector('#loadText');
const button=document.querySelector('#startButton');
const fail=err=>{
  const msg=err?.message||String(err||'Unknown startup error');
  text.textContent=`Startup error: ${msg}`;
  button.disabled=false;
  button.textContent='RELOAD ARENA';
  button.onclick=()=>location.reload();
  console.error(err);
};
window.addEventListener('error',e=>{if(!window.__fighterArenaReady&&e?.error)fail(e.error)});
window.addEventListener('unhandledrejection',e=>{if(!window.__fighterArenaReady)fail(e.reason)});
Promise.all([
  import('./idle-wait.js?v=1.3.0'),
  import('./game.js?v=1.3.0-r13')
]).catch(fail);
