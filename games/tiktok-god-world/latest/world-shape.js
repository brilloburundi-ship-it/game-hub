(() => {
  'use strict';
  const VERSION = 'v712-latest-world-shape-1';
  if (window.__GOD_WORLD_LATEST_SHAPE?.installed) return;
  const state = window.__GOD_WORLD_LATEST_SHAPE = {
    installed:false, version:VERSION, rounded:false, coastSculpted:false,
    riverMouths:0, terrain:false, errors:[]
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const key = (x,y) => `${x},${y}`;

  function hash01(x,y,s=0){
    let h=Math.imul((x+101+s)|0,374761393)^Math.imul((y+211-s)|0,668265263);
    h=(h^(h>>>13))|0; h=Math.imul(h,1274126177); h^=h>>>16;
    return (h>>>0)/4294967295;
  }
  function cellToScreen(w,x,y,d=1){ return [(w.originX+(x-y)*w.tileW/2)/d,(w.originY+(x+y)*w.tileH/2)/d]; }
  function cornerToScreen(w,x,y,d=1){ return [(w.originX+(x-y)*w.tileW/2)/d,(w.originY+(x+y)*w.tileH/2-w.tileH/2)/d]; }
  function inBounds(w,x,y){ return x>=0&&y>=0&&x<w.gridW&&y<w.gridH; }
  function landAt(mask,x,y){ return y>=0&&y<mask.length&&x>=0&&x<(mask[0]?.length||0)&&!!mask[y][x]; }

  function recomputeCoast(w){
    const dist=Array.from({length:w.gridH},()=>Array(w.gridW).fill(999)),q=[]; let head=0;
    for(let y=0;y<w.gridH;y++)for(let x=0;x<w.gridW;x++)if(!w.land[y][x]){dist[y][x]=0;q.push([x,y]);}
    while(head<q.length){
      const [x,y]=q[head++],n=dist[y][x]+1;
      for(const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        if(a<0||b<0||a>=w.gridW||b>=w.gridH||dist[b][a]<=n)continue;
        dist[b][a]=n;q.push([a,b]);
      }
    }
    w.coastDistance=dist; return dist;
  }

  function coastExposure(mask,x,y){
    let sea=0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(!landAt(mask,x+dx,y+dy)) sea++;
    return sea;
  }
  function landAround(mask,x,y){
    let n=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&landAt(mask,x+dx,y+dy))n++;
    return n;
  }
  function straightCoast(mask,x,y){
    const l=landAt(mask,x-1,y),r=landAt(mask,x+1,y),u=landAt(mask,x,y-1),d=landAt(mask,x,y+1);
    return (l&&r&&!u&&!d)||(u&&d&&!l&&!r)||(l&&u&&!r&&!d)||(r&&d&&!l&&!u);
  }

  // Breaks long ruler-straight coast runs into bays and headlands while keeping
  // the island contiguous. This only removes exposed edge cells, never interior land.
  function sculptCoast(land,biomes){
    for(let pass=0;pass<2;pass++){
      const remove=[];
      for(let y=1;y<land.length-1;y++)for(let x=1;x<land[0].length-1;x++){
        if(!land[y][x])continue;
        const sea=coastExposure(land,x,y);
        if(!sea)continue;
        const neighbours=landAround(land,x,y);
        if(neighbours<4)continue;
        const straight=straightCoast(land,x,y);
        const wave=Math.sin(x*.78+y*.31+pass*1.7)*.5+.5;
        const rnd=hash01(x,y,1701+pass*83);
        const cut=(sea>=2&&rnd>.72)||(straight&&rnd+.22*wave>.76);
        if(cut)remove.push([x,y]);
      }
      for(const [x,y] of remove){land[y][x]=0;biomes[y][x]='ocean';}
    }
  }

  function longestSegment(w,river){
    const segs=[];let cur=[];
    for(const c of river||[]){
      const x=c?.[0],y=c?.[1],ok=Number.isInteger(x)&&Number.isInteger(y)&&inBounds(w,x,y)&&!!w.land[y][x];
      if(ok)cur.push([x,y]);else if(cur.length){segs.push(cur);cur=[];}
    }
    if(cur.length)segs.push(cur);
    segs.sort((a,b)=>b.length-a.length);
    return segs[0]?.length>=2?segs[0]:null;
  }

  // Continues the downhill end of a river until it actually enters the ocean,
  // then carries it one extra sea cell so the mouth visually merges into the sea.
  function extendRiverToSea(w,river){
    if(!river?.length||river.length<2)return river;
    const out=river.slice();
    const first=out[0],last=out[out.length-1];
    const dFirst=w.coastDistance?.[first[1]]?.[first[0]]??999;
    const dLast=w.coastDistance?.[last[1]]?.[last[0]]??999;
    if(dFirst<dLast)out.reverse();

    let [x,y]=out[out.length-1];
    const visited=new Set(out.map(([a,b])=>key(a,b)));
    for(let step=0;step<96;step++){
      const neighbours=[[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]]
        .filter(([a,b])=>inBounds(w,a,b));

      const sea=neighbours.find(([a,b])=>!w.land[b][a]);
      if(sea){
        out.push(sea);
        const dx=sea[0]-x,dy=sea[1]-y;
        const farther=[sea[0]+dx,sea[1]+dy];
        if(inBounds(w,farther[0],farther[1])&&!w.land[farther[1]][farther[0]])out.push(farther);
        state.riverMouths++;
        return out;
      }

      const currentDist=w.coastDistance?.[y]?.[x]??999;
      const candidates=neighbours
        .filter(([a,b])=>w.land[b][a]&&!visited.has(key(a,b)))
        .map(cell=>({cell,dist:w.coastDistance?.[cell[1]]?.[cell[0]]??999,jitter:hash01(cell[0],cell[1],2207)}))
        .sort((a,b)=>(a.dist+a.jitter*.32)-(b.dist+b.jitter*.32));
      const choice=candidates.find(v=>v.dist<=currentDist)||candidates[0];
      if(!choice)break;
      [x,y]=choice.cell;visited.add(key(x,y));out.push([x,y]);
    }
    return out;
  }

  function reshape(sim){
    if(sim.__v712RoundedWorld)return true;
    const w=sim.w;if(!w?.land?.length||!w?.biomes?.length)return false;
    const oldLand=w.land.map(r=>r.slice()),oldBiome=w.biomes.map(r=>r.slice());
    const cx=(w.gridW-1)/2,cy=(w.gridH-1)/2,[mx,my]=cellToScreen(w,cx,cy);
    const halfX=((w.gridW-1)+(w.gridH-1))*w.tileW/4,halfY=((w.gridW-1)+(w.gridH-1))*w.tileH/4;
    const rx=halfX*.80,ry=halfY*.92;
    const land=Array.from({length:w.gridH},()=>Array(w.gridW).fill(0));
    const biomes=Array.from({length:w.gridH},()=>Array(w.gridW).fill('ocean'));

    for(let y=0;y<w.gridH;y++)for(let x=0;x<w.gridW;x++){
      const [sx,sy]=cellToScreen(w,x,y),nx=(sx-mx)/rx,ny=(sy-my)/ry,r=Math.hypot(nx,ny),a=Math.atan2(ny,nx);
      // Multi-frequency coast profile plus coordinate waves: no long straight sides.
      const angular=Math.sin(a*2.7+.35)*.052+Math.sin(a*5.6-1.15)*.034+Math.sin(a*9.4+1.8)*.018;
      const local=Math.sin(nx*7.3+ny*3.1+.4)*.020+Math.cos(nx*3.7-ny*8.1)*.015+Math.sin((nx+ny)*10.7)*.010;
      const edge=.875+angular+local;
      if(r>edge)continue;
      land[y][x]=1;
      const prev=oldLand[y]?.[x]?oldBiome[y]?.[x]:null;
      if(prev&&prev!=='ocean')biomes[y][x]=prev;
      else{
        const n=hash01(x,y,911);
        if(y<w.gridH*.18&&n<.24)biomes[y][x]='tundra';
        else if(x>w.gridW*.68&&y>w.gridH*.50&&n<.27)biomes[y][x]='desert';
        else if(n<.16)biomes[y][x]='forest';
        else biomes[y][x]='grass';
      }
    }

    sculptCoast(land,biomes);
    w.land=land;w.biomes=biomes;
    const coast=recomputeCoast(w);
    state.coastSculpted=true;

    for(let y=0;y<w.gridH;y++)for(let x=0;x<w.gridW;x++){
      if(w.land[y][x]&&coast[y][x]<=1&&!['mountain','tundra','ice_coast'].includes(w.biomes[y][x]))w.biomes[y][x]='beach';
    }

    w.rivers=(w.rivers||[])
      .map(r=>longestSegment(w,r))
      .filter(Boolean)
      .map(r=>extendRiverToSea(w,r))
      .filter(r=>r?.length>=2);

    if(sim.riverSet instanceof Set){
      sim.riverSet.clear();
      for(const river of w.rivers)for(const [x,y] of river){
        if(inBounds(w,x,y)&&w.land[y][x])sim.riverSet.add(key(x,y));
      }
    }
    sim.__v712RoundedWorld=true;state.rounded=true;return true;
  }

  function loops(mask){
    const h=mask.length,w=h?mask[0].length:0,edges=[],inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&!!mask[y][x],add=(a,b)=>edges.push({a,b,u:false});
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(!inside(x,y))continue;
      if(!inside(x,y-1))add([x,y],[x+1,y]);
      if(!inside(x+1,y))add([x+1,y],[x+1,y+1]);
      if(!inside(x,y+1))add([x+1,y+1],[x,y+1]);
      if(!inside(x-1,y))add([x,y+1],[x,y]);
    }
    const out=new Map();edges.forEach((e,i)=>{const k=key(...e.a);if(!out.has(k))out.set(k,[]);out.get(k).push(i);});const result=[];
    for(let i=0;i<edges.length;i++){
      if(edges[i].u)continue;const l=[];let j=i,g=0;
      while(g++<edges.length+8){
        const e=edges[j];if(!e||e.u)break;e.u=true;l.push(e.a);const end=e.b;
        if(end[0]===l[0][0]&&end[1]===l[0][1])break;
        const n=(out.get(key(...end))||[]).find(v=>!edges[v].u);
        if(n==null){l.push(end);break;}j=n;
      }
      if(l.length>=3)result.push(l);
    }
    return result;
  }
  function pathFor(w,ls,d,wave,salt){
    const p=new Path2D();
    for(const l of ls){
      const pts=l.map(([x,y],i)=>{const [sx,sy]=cornerToScreen(w,x,y,d);return[sx+(hash01(x,y,salt+i*3)-.5)*wave/d,sy+(hash01(x,y,salt+97+i*5)-.5)*wave*.42/d];});
      if(pts.length<3)continue;
      const m=[(pts[0][0]+pts[1][0])/2,(pts[0][1]+pts[1][1])/2];p.moveTo(...m);
      for(let i=1;i<=pts.length;i++){const a=pts[i%pts.length],b=pts[(i+1)%pts.length];p.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}
      p.closePath();
    }
    return p;
  }
  function region(ctx,w,name,color,d,alpha=1){
    const mask=w.biomes.map((r,y)=>r.map((v,x)=>!!w.land[y][x]&&v===name)),ls=loops(mask);if(!ls.length)return;
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fill(pathFor(w,ls,d,4,101+name.length*17),'evenodd');ctx.restore();
  }
  function riverPath(ctx,pts){
    if(pts.length<2)return;ctx.beginPath();ctx.moveTo(...pts[0]);
    for(let i=1;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];ctx.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}
    ctx.lineTo(...pts[pts.length-1]);
  }
  function terrain(sim,d=1){
    const w=sim.w,c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w.mapWidth/d));c.height=Math.max(1,Math.round(w.mapHeight/d));
    const ctx=c.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#2f7898';ctx.fillRect(0,0,c.width,c.height);
    ctx.globalAlpha=.18;
    for(let y=24;y<c.height;y+=48){ctx.fillStyle=(Math.floor(y/48)%2)?'#4e9fba':'#3e8eaa';ctx.fillRect(0,y,c.width,Math.max(1,Math.round(2/d)));}
    ctx.globalAlpha=1;

    const coast=pathFor(w,loops(w.land),d,7.5,31);
    ctx.fillStyle='#6e9a48';ctx.fill(coast,'evenodd');
    ctx.strokeStyle='#c6a85d';ctx.lineWidth=Math.max(2,8/d);ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(coast);
    ctx.strokeStyle='#789a4f';ctx.lineWidth=Math.max(1,3/d);ctx.stroke(coast);
    region(ctx,w,'forest','#527c3d',d,.90);region(ctx,w,'desert','#c9a55b',d);region(ctx,w,'tundra','#87977f',d);region(ctx,w,'mountain','#777d79',d);region(ctx,w,'ice_coast','#bac8c3',d);region(ctx,w,'beach','#cfb56b',d);

    for(const river of w.rivers||[]){
      if(!river?.length||river.length<2)continue;
      const pts=river.map(([x,y])=>cellToScreen(w,x,y,d));
      riverPath(ctx,pts);ctx.strokeStyle='#23617e';ctx.lineWidth=Math.max(2,8/d);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
      riverPath(ctx,pts);ctx.strokeStyle='#2f7898';ctx.lineWidth=Math.max(1,5.5/d);ctx.stroke();
      riverPath(ctx,pts);ctx.strokeStyle='#8bc5d2';ctx.lineWidth=Math.max(1,1.4/d);ctx.stroke();
      const mouth=pts[pts.length-1];
      ctx.save();ctx.globalAlpha=.92;ctx.beginPath();ctx.arc(mouth[0],mouth[1],Math.max(4,9/d),0,Math.PI*2);ctx.fillStyle='#2f7898';ctx.fill();ctx.globalAlpha=.24;ctx.beginPath();ctx.arc(mouth[0],mouth[1],Math.max(2,4/d),0,Math.PI*2);ctx.fillStyle='#8bc5d2';ctx.fill();ctx.restore();
    }
    return c;
  }
  function replace(sim){
    const r=sim.r;
    if(r?.root?.children?.length&&window.PIXI){
      const s=r.root.children[0],d=Number(window.__V705_WORLD_SCALE||1)>1?Number(window.__V705_WORLD_SCALE):1,c=terrain(sim,d),t=window.PIXI.Texture.from(c);
      if(t?.source)t.source.scaleMode='nearest';s.texture=t;s.scale.set(d);r.__v706TerrainCanvas=c;r.__v712TerrainCanvas=c;r.home?.();return true;
    }
    if(r?.map){r.map=terrain(sim,1);r.__v706TerrainCanvas=r.map;r.__v712TerrainCanvas=r.map;r.home?.();return true;}
    return false;
  }

  async function install(){
    for(let i=0;i<1600;i++){if(window.__SIM?.r&&window.__V706_WORLD_POLISH?.installed)break;await sleep(20);}
    const sim=window.__SIM;if(!sim?.r)throw new Error('latest world renderer unavailable');
    reshape(sim);state.terrain=replace(sim);sim.r.redrawTerritories?.(sim);state.installed=true;document.documentElement.dataset.latestWorld=VERSION;
  }
  install().catch(e=>{state.errors.push(String(e?.stack||e));console.error('[latest-world-shape]',e);});
})();