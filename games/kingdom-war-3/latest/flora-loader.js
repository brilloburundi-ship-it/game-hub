(() => {
  'use strict';
  const RELEASE='20260813-2300-v806';
  if(window.__GOD_WORLD_FLORA_LOADER)return;
  window.__GOD_WORLD_FLORA_LOADER=true;
  const wait=()=>{
    if(window.__GOD_WORLD_LATEST_SHAPE?.installed){
      const s=document.createElement('script');
      s.src=`latest/flora.js?v=${RELEASE}`;
      s.dataset.release='v8.0.6';
      document.head.appendChild(s);
      return;
    }
    setTimeout(wait,25);
  };
  wait();
})();
