(() => {
  'use strict';
  const RELEASE='20260813-1236-v712';
  if(window.__GOD_WORLD_FLORA_LOADER)return;
  window.__GOD_WORLD_FLORA_LOADER=true;
  const wait=()=>{
    if(window.__GOD_WORLD_LATEST_SHAPE?.installed){
      const s=document.createElement('script');
      s.src=`latest/flora.js?v=${RELEASE}`;
      s.dataset.release='v7.1.2';
      document.head.appendChild(s);
      return;
    }
    setTimeout(wait,25);
  };
  wait();
})();