(() => {
  'use strict';
  const VERSION='v712-latest-visuals-1';
  if(window.__GOD_WORLD_LATEST_VISUALS?.installed)return;
  const state=window.__GOD_WORLD_LATEST_VISUALS={
    installed:false,version:VERSION,smoothRivers:false,unifiedSea:false,
    riverMouthBlend:false,seaRiverSuppressed:false,errors:[]
  };
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function smoothPath(g,sim,cells){
    const pts=cells.map(([x,y])=>sim.iso(x,y));
    if(pts.length<2)return;
    g.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length-1;i++){
      const p=pts[i],n=pts[i+1];
      g.quadraticCurveTo(p[0],p[1],(p[0]+n[0])/2,(p[1]+n[1])/2);
    }
    const last=pts[pts.length-1];
    g.lineTo(last[0],last[1]);
  }

  function splitRiver(sim,river){
    const land=[];
    const sea=[];
    let enteredSea=false;
    for(const cell of river||[]){
      const x=cell?.[0],y=cell?.[1];
      const isLand=Number.isInteger(x)&&Number.isInteger(y)&&!!sim.w?.land?.[y]?.[x];
      if(!enteredSea&&isLand)land.push([x,y]);
      else{
        enteredSea=true;
        if(Number.isInteger(x)&&Number.isInteger(y))sea.push([x,y]);
      }
    }
    return {land,sea};
  }

  function replaceRivers(sim){
    const r=sim.r,P=window.PIXI;
    if(!r?.root||!P?.Graphics||!P?.Container)return false;
    const old=r.__v708RiverOverlay;
    if(old){
      try{old.parent?.removeChild?.(old);}catch(_){}
      try{old.destroy?.({children:true});}catch(_){}
      r.__v708RiverOverlay=null;
    }

    const group=new P.Container();
    group.label='latest-smooth-rivers';
    group.eventMode='none';

    // The terrain texture used to contain the extended river mouth all the way into
    // open water. Paint only those ocean cells back to the sea base colour first.
    // This removes the visible "second water line" without changing river logic.
    const seaCleaner=new P.Graphics();
    let cleaned=0;
    for(const river of sim.w?.rivers||[]){
      const {sea}=splitRiver(sim,river);
      if(!sea.length)continue;
      cleaned+=sea.length;
      if(sea.length>1)smoothPath(seaCleaner,sim,sea);
      else{
        const p=sim.iso(sea[0][0],sea[0][1]);
        seaCleaner.circle(p[0],p[1],13).fill({color:0x2f7898,alpha:1});
      }
    }
    if(cleaned){
      seaCleaner.stroke({color:0x2f7898,width:24,alpha:1});
      seaCleaner.eventMode='none';
      group.addChild(seaCleaner);
    }

    const layers=[
      [0x173f59,16,.42],
      [0x2f7898,11,.98],
      [0x4e9fba,6.5,.84],
      [0x8bc5d2,2,.62]
    ];
    for(const [color,width,alpha] of layers){
      const g=new P.Graphics();
      for(const river of sim.w?.rivers||[]){
        const {land}=splitRiver(sim,river);
        if(land.length>1)smoothPath(g,sim,land);
      }
      g.stroke({color,width,alpha});
      group.addChild(g);
    }

    // Mouth cap lives on the final LAND cell only. Nothing river-coloured is drawn
    // over open sea; the sea itself visually completes the river.
    const mouths=new P.Graphics();
    for(const river of sim.w?.rivers||[]){
      const {land}=splitRiver(sim,river);
      if(!land.length)continue;
      const last=land[land.length-1];
      const p=sim.iso(last[0],last[1]);
      mouths.circle(p[0],p[1],8).fill({color:0x2f7898,alpha:.96});
      mouths.circle(p[0],p[1],3.5).fill({color:0x4e9fba,alpha:.24});
    }
    mouths.eventMode='none';
    group.addChild(mouths);

    r.root.addChildAt(group,Math.min(1,r.root.children.length));
    r.__v708RiverOverlay=group;
    r.__v712RiverOverlay=group;
    state.smoothRivers=true;
    state.riverMouthBlend=true;
    state.seaRiverSuppressed=true;
    return true;
  }

  function unifyOcean(sim){
    const r=sim.r,ocean=r?.__v708OceanBackdropContainer;
    const base=ocean?.children?.[0],waves=ocean?.children?.[1];
    if(!base||!waves)return false;
    const redraw=()=>{
      const pad=96,w=Math.max(1,innerWidth+pad*2),h=Math.max(1,innerHeight+pad*2);
      base.clear();base.rect(-pad,-pad,w,h).fill({color:0x2f7898,alpha:1});
      waves.clear();
      for(let y=-40;y<innerHeight+80;y+=34){
        const row=Math.floor((y+40)/34),shift=(row%2)*21;
        for(let x=-80+shift;x<innerWidth+100;x+=70){
          const len=18+(((x+row*13)%3+3)%3)*5;
          waves.rect(x,y,len,2).fill({color:row%3===0?0x4e9fba:0x3e8eaa,alpha:.24});
          if((row+Math.floor(x/70))%4===0)waves.rect(x+8,y+7,Math.max(8,len-9),1).fill({color:0x8bc5d2,alpha:.16});
        }
      }
    };
    redraw();
    window.addEventListener('resize',redraw,{passive:true});
    state.unifiedSea=true;
    return true;
  }

  async function install(){
    for(let i=0;i<1800;i++){
      if(window.__SIM?.r&&window.__V708_WATER_CAMERA_FISHING?.installed&&window.__GOD_WORLD_LATEST_SHAPE?.installed)break;
      await sleep(20);
    }
    const sim=window.__SIM;
    if(!sim?.r)throw new Error('latest visuals renderer unavailable');
    replaceRivers(sim);
    unifyOcean(sim);
    state.installed=true;
    document.documentElement.dataset.latestVisuals=VERSION;
  }

  install().catch(e=>{
    state.errors.push(String(e?.stack||e));
    console.error('[latest-visuals]',e);
  });
})();
