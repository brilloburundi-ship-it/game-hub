(() => {
  'use strict';
  const RELEASE='20260813-2145-v804';
  if(window.__GOD_WORLD_FLORA_LOADER)return;
  window.__GOD_WORLD_FLORA_LOADER=true;
  const wait=()=>{
    if(window.__GOD_WORLD_LATEST_SHAPE?.installed){
      const s=document.createElement('script');
      s.src=`latest/flora.js?v=${RELEASE}`;
      s.dataset.release='v8.0.4';
      document.head.appendChild(s);
      return;
    }
    setTimeout(wait,25);
  };
  wait();
})();
