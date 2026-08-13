(() => {
  'use strict';
  const VERSION='v712-latest-visuals-1';
  if(window.__GOD_WORLD_LATEST_VISUALS?.installed)return;
  const state=window.__GOD_WORLD_LATEST_VISUALS={installed:false,version:VERSION,smoothRivers:false,unifiedSea:false,errors:[]};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function smoothPath(g,sim,river){
    const pts=river.map(([x,y])=>sim.iso(x,y));
    if(pts.length<2)return;
    g.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length-1;i++){
      const p=pts[i],n=pts[i+1];
      g.quadraticCurveTo(p[0],p[1],(p[0]+n[0])/2,(p[1]+n[1])/2);
    }
    const last=pts[pts.length-1];
    g.lineTo(last[0],last[1]);
  }

  function replaceRivers(sim){
    const r=sim.r,P=window.PIXI;
    if(!r?.root||!P?.Graphics||!P?.Container)return false;
    const old=r.__v708RiverOverlay;
    if(old){try{old.parent?.removeChild?.(old);}catch(_){}try{old.destroy?.({children:true});}catch(_){}r.__v708RiverOverlay=null;}
    const group=new P.Container();group.label='latest-smooth-rivers';group.eventMode='none';
    const layers=[
      [0x173f59,16,.42],
      [0x2f7898,11,.98],
      [0x4e9fba,6.5,.84],
      [0x8bc5d2,2,.62]
    ];
    for(const [color,width,alpha] of layers){
      const g=new P.Graphics();
      for(const river of sim.w?.rivers||[])if(Array.isArray(river)&&river.length>1)smoothPath(g,sim,river);
      g.stroke({color,width,alpha});group.addChild(g);
    }
    r.root.addChildAt(group,Math.min(1,r.root.children.length));
    r.__v708RiverOverlay=group;r.__v712RiverOverlay=group;state.smoothRivers=true;return true;
  }

  function unifyOcean(sim){
    const r=sim.r,ocean=r?.__v708OceanBackdropContainer;
    const base=ocean?.children?.[0],waves=ocean?.children?.[1];
    if(!base||!waves)return false;
    const redraw=()=>{
      const pad=96,w=Math.max(1,innerWidth+pad*2),h=Math.max(1,innerHeight+pad*2);
      base.clear();base.rect(-pad,-pad,w,h).fill({color:0x2f7898,alpha:1});
      waves.clear();
      for(let y=-40;y<innerHeight+80;y+=34){const row=Math.floor((y+40)/34),shift=(row%2)*21;for(let x=-80+shift;x<innerWidth+100;x+=70){const len=18+(((x+row*13)%3+3)%3)*5;waves.rect(x,y,len,2).fill({color:row%3===0?0x4e9fba:0x3e8eaa,alpha:.24});if((row+Math.floor(x/70))%4===0)waves.rect(x+8,y+7,Math.max(8,len-9),1).fill({color:0x8bc5d2,alpha:.16});}}
    };
    redraw();window.addEventListener('resize',redraw,{passive:true});state.unifiedSea=true;return true;
  }

  async function install(){
    for(let i=0;i<1800;i++){if(window.__SIM?.r&&window.__V708_WATER_CAMERA_FISHING?.installed&&window.__GOD_WORLD_LATEST_SHAPE?.installed)break;await sleep(20);}
    const sim=window.__SIM;if(!sim?.r)throw new Error('latest visuals renderer unavailable');
    replaceRivers(sim);unifyOcean(sim);state.installed=true;document.documentElement.dataset.latestVisuals=VERSION;
  }
  install().catch(e=>{state.errors.push(String(e?.stack||e));console.error('[latest-visuals]',e);});
})();