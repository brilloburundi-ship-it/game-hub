(() => {
  'use strict';
  const VERSION = 'v712-latest-world-shape-1';
  if (window.__GOD_WORLD_LATEST_SHAPE?.installed) return;
  const state = window.__GOD_WORLD_LATEST_SHAPE = { installed:false, version:VERSION, rounded:false, terrain:false, errors:[] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const key = (x,y) => `${x},${y}`;

  function hash01(x,y,s=0){
    let h=Math.imul((x+101+s)|0,374761393)^Math.imul((y+211-s)|0,668265263);
    h=(h^(h>>>13))|0; h=Math.imul(h,1274126177); h^=h>>>16;
    return (h>>>0)/4294967295;
  }
  function cellToScreen(w,x,y,d=1){ return [(w.originX+(x-y)*w.tileW/2)/d,(w.originY+(x+y)*w.tileH/2)/d]; }
  function cornerToScreen(w,x,y,d=1){ return [(w.originX+(x-y)*w.tileW/2)/d,(w.originY+(x+y)*w.tileH/2-w.tileH/2)/d]; }

  function recomputeCoast(w){
    const dist=Array.from({length:w.gridH},()=>Array(w.gridW).fill(999)),q=[]; let head=0;
    for(let y=0;y<w.gridH;y++)for(let x=0;x<w.gridW;x++)if(!w.land[y][x]){dist[y][x]=0;q.push([x,y]);}
    while(head<q.length){const [x,y]=q[head++],n=dist[y][x]+1;for(const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(a<0||b<0||a>=w.gridW||b>=w.gridH||dist[b][a]<=n)continue;dist[b][a]=n;q.push([a,b]);}}
    w.coastDistance=dist; return dist;
  }
  function longestSegment(w,river){
    const segs=[];let cur=[];
    for(const c of river||[]){const x=c?.[0],y=c?.[1],ok=Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<w.gridW&&y<w.gridH&&!!w.land[y][x];if(ok)cur.push([x,y]);else if(cur.length){segs.push(cur);cur=[];}}
    if(cur.length)segs.push(cur);segs.sort((a,b)=>b.length-a.length);return segs[0]?.length>=2?segs[0]:null;
  }
  function reshape(sim){
    if(sim.__v712RoundedWorld)return true;
    const w=sim.w;if(!w?.land?.length||!w?.biomes?.length)return false;
    const oldLand=w.land.map(r=>r.slice()),oldBiome=w.biomes.map(r=>r.slice());
    const cx=(w.gridW-1)/2,cy=(w.gridH-1)/2,[mx,my]=cellToScreen(w,cx,cy);
    const halfX=((w.gridW-1)+(w.gridH-1))*w.tileW/4,halfY=((w.gridW-1)+(w.gridH-1))*w.tileH/4;
    const rx=halfX*.82,ry=halfY*.94;
    const land=Array.from({length:w.gridH},()=>Array(w.gridW).fill(0));
    const biomes=Array.from({length:w.gridH},()=>Array(w.gridW).fill('ocean'));
    for(let y=0;y<w.gridH;y++)for(let x=0;x<w.gridW;x++){
      const [sx,sy]=cellToScreen(w,x,y),nx=(sx-mx)/rx,ny=(sy-my)/ry,r=Math.hypot(nx,ny),a=Math.atan2(ny,nx);
      const edge=.91+Math.sin(a*3+.55)*.032+Math.sin(a*5-.85)*.022+Math.sin(a*8+1.4)*.010;
      if(r>edge)continue; land[y][x]=1;
      const prev=oldLand[y]?.[x]?oldBiome[y]?.[x]:null;
      if(prev&&prev!=='ocean')biomes[y][x]=prev;
      else{const n=hash01(x,y,911);if(y<w.gridH*.18&&n<.24)biomes[y][x]='tundra';else if(x>w.gridW*.68&&y>w.gridH*.50&&n<.27)biomes[y][x]='desert';else if(n<.16)biomes[y][x]='forest';else biomes[y][x]='grass';}
    }
    w.land=land;w.biomes=biomes;const coast=recomputeCoast(w);
    for(let y=0;y<w.gridH;y++)for(let x=0;x<w.gridW;x++)if(w.land[y][x]&&coast[y][x]<=1&&!['mountain','tundra','ice_coast'].includes(w.biomes[y][x]))w.biomes[y][x]='beach';
    w.rivers=(w.rivers||[]).map(r=>longestSegment(w,r)).filter(Boolean);
    if(sim.riverSet instanceof Set){sim.riverSet.clear();for(const r of w.rivers)for(const [x,y] of r)sim.riverSet.add(key(x,y));}
    sim.__v712RoundedWorld=true;state.rounded=true;return true;
  }

  function loops(mask){
    const h=mask.length,w=h?mask[0].length:0,edges=[],inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&!!mask[y][x],add=(a,b)=>edges.push({a,b,u:false});
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!inside(x,y))continue;if(!inside(x,y-1))add([x,y],[x+1,y]);if(!inside(x+1,y))add([x+1,y],[x+1,y+1]);if(!inside(x,y+1))add([x+1,y+1],[x,y+1]);if(!inside(x-1,y))add([x,y+1],[x,y]);}
    const out=new Map();edges.forEach((e,i)=>{const k=key(...e.a);if(!out.has(k))out.set(k,[]);out.get(k).push(i);});const result=[];
    for(let i=0;i<edges.length;i++){if(edges[i].u)continue;const l=[];let j=i,g=0;while(g++<edges.length+8){const e=edges[j];if(!e||e.u)break;e.u=true;l.push(e.a);const end=e.b;if(end[0]===l[0][0]&&end[1]===l[0][1])break;const n=(out.get(key(...end))||[]).find(v=>!edges[v].u);if(n==null){l.push(end);break;}j=n;}if(l.length>=3)result.push(l);}return result;
  }
  function pathFor(w,ls,d,wave,salt){const p=new Path2D();for(const l of ls){const pts=l.map(([x,y],i)=>{const [sx,sy]=cornerToScreen(w,x,y,d);return[sx+(hash01(x,y,salt+i*3)-.5)*wave/d,sy+(hash01(x,y,salt+97+i*5)-.5)*wave*.42/d];});if(pts.length<3)continue;const m=[(pts[0][0]+pts[1][0])/2,(pts[0][1]+pts[1][1])/2];p.moveTo(...m);for(let i=1;i<=pts.length;i++){const a=pts[i%pts.length],b=pts[(i+1)%pts.length];p.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}p.closePath();}return p;}
  function region(ctx,w,name,color,d,alpha=1){const mask=w.biomes.map((r,y)=>r.map((v,x)=>!!w.land[y][x]&&v===name)),ls=loops(mask);if(!ls.length)return;ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fill(pathFor(w,ls,d,4,101+name.length*17),'evenodd');ctx.restore();}
  function riverPath(ctx,pts){if(pts.length<2)return;ctx.beginPath();ctx.moveTo(...pts[0]);for(let i=1;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];ctx.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}ctx.lineTo(...pts[pts.length-1]);}
  function terrain(sim,d=1){
    const w=sim.w,c=document.createElement('canvas');c.width=Math.max(1,Math.round(w.mapWidth/d));c.height=Math.max(1,Math.round(w.mapHeight/d));const ctx=c.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#2f7898';ctx.fillRect(0,0,c.width,c.height);ctx.globalAlpha=.18;for(let y=24;y<c.height;y+=48){ctx.fillStyle=(Math.floor(y/48)%2)?'#4e9fba':'#3e8eaa';ctx.fillRect(0,y,c.width,Math.max(1,Math.round(2/d)));}ctx.globalAlpha=1;
    const coast=pathFor(w,loops(w.land),d,4.5,31);ctx.fillStyle='#6e9a48';ctx.fill(coast,'evenodd');ctx.strokeStyle='#c6a85d';ctx.lineWidth=Math.max(2,8/d);ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(coast);ctx.strokeStyle='#789a4f';ctx.lineWidth=Math.max(1,3/d);ctx.stroke(coast);
    region(ctx,w,'forest','#527c3d',d,.90);region(ctx,w,'desert','#c9a55b',d);region(ctx,w,'tundra','#87977f',d);region(ctx,w,'mountain','#777d79',d);region(ctx,w,'ice_coast','#bac8c3',d);region(ctx,w,'beach','#cfb56b',d);
    for(const river of w.rivers||[]){if(!river?.length||river.length<2)continue;const pts=river.map(([x,y])=>cellToScreen(w,x,y,d));riverPath(ctx,pts);ctx.strokeStyle='#23617e';ctx.lineWidth=Math.max(2,7/d);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();riverPath(ctx,pts);ctx.strokeStyle='#2f7898';ctx.lineWidth=Math.max(1,5/d);ctx.stroke();riverPath(ctx,pts);ctx.strokeStyle='#8bc5d2';ctx.lineWidth=Math.max(1,1.4/d);ctx.stroke();}
    return c;
  }
  function replace(sim){const r=sim.r;if(r?.root?.children?.length&&window.PIXI){const s=r.root.children[0],d=Number(window.__V705_WORLD_SCALE||1)>1?Number(window.__V705_WORLD_SCALE):1,c=terrain(sim,d),t=window.PIXI.Texture.from(c);if(t?.source)t.source.scaleMode='nearest';s.texture=t;s.scale.set(d);r.__v706TerrainCanvas=c;r.__v712TerrainCanvas=c;r.home?.();return true;}if(r?.map){r.map=terrain(sim,1);r.__v706TerrainCanvas=r.map;r.__v712TerrainCanvas=r.map;r.home?.();return true;}return false;}

  async function install(){for(let i=0;i<1600;i++){if(window.__SIM?.r&&window.__V706_WORLD_POLISH?.installed)break;await sleep(20);}const sim=window.__SIM;if(!sim?.r)throw new Error('latest world renderer unavailable');reshape(sim);state.terrain=replace(sim);sim.r.redrawTerritories?.(sim);state.installed=true;document.documentElement.dataset.latestWorld=VERSION;}
  install().catch(e=>{state.errors.push(String(e?.stack||e));console.error('[latest-world-shape]',e);});
})();