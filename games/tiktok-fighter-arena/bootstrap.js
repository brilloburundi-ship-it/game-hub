const text=document.querySelector('#loadText');
const button=document.querySelector('#startButton');
const fail=err=>{
  const msg=err?.message||String(err||'Unknown startup error');
  window.__fighterArenaLoadError=err||new Error(msg);
  text.textContent=`Startup error: ${msg}`;
  button.disabled=false;
  button.textContent='RELOAD ARENA';
  button.onclick=()=>location.reload();
  console.error(err);
};
window.addEventListener('error',e=>{if(!window.__fighterArenaReady&&e?.error)fail(e.error)});
window.addEventListener('unhandledrejection',e=>{if(!window.__fighterArenaReady)fail(e.reason)});
(async()=>{
  await Promise.allSettled([
    fetch('./core.js?v=1.4.0',{cache:'reload'}),
    fetch('./combat-v14.js?v=1.4.0',{cache:'reload'}),
    fetch('./idle-wait.js?v=1.4.0',{cache:'reload'}),
    fetch('./asset-medieval-king.js?v=1.4.0',{cache:'reload'}),
    fetch('./asset-medieval-warrior-2.js?v=1.4.0',{cache:'reload'}),
    fetch('./asset-medieval-warrior-3.js?v=1.4.0',{cache:'reload'})
  ]);
  await Promise.all([
    import('./idle-wait.js?v=1.4.0'),
    import('./roster-gate-v14.js?v=1.4.0'),
    import('./game-v14.js?v=1.4.0')
  ]);
})().catch(fail);
