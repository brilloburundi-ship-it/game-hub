const originalUrl = new URL('./index-V104FantasyRTS.js?build=7', import.meta.url);
const assetBase = new URL('./', originalUrl).href;

const readableMapBlock = String.raw`// Readable World V11: rebuilt geography with broad continents, true inland lakes and denser river systems.
const FANTASY_MAP_VERSION='readable-world-v2';
const fantasyEllipse=(x,y,cx,cy,rx,ry,turn=0)=>{const co=Math.cos(turn),si=Math.sin(turn),dx=x-cx,dy=y-cy,px=dx*co+dy*si,py=-dx*si+dy*co;return 1-Math.hypot(px/rx,py/ry);};
const fantasyField=(c,r,seed=1)=>{
  const x=(c+.5)/WORLD.cols*2-1,y=(r+.5)/WORLD.rows*2-1;
  const masses=Math.max(
    fantasyEllipse(x,y,-.61,-.24,.32,.47,-.13),
    fantasyEllipse(x,y,-.43,.31,.27,.36,.16),
    fantasyEllipse(x,y,-.05,-.20,.34,.40,.07),
    fantasyEllipse(x,y,.20,.18,.36,.49,-.10),
    fantasyEllipse(x,y,.61,-.14,.25,.34,.12),
    fantasyEllipse(x,y,.64,.48,.23,.17,-.06),
    fantasyEllipse(x,y,-.05,.62,.16,.13,.08)
  );
  const bridges=Math.max(
    fantasyEllipse(x,y,-.27,-.02,.21,.13,.32),
    fantasyEllipse(x,y,.42,.03,.22,.11,-.28)
  )*.33;
  const broad=.052*Math.sin(c*.052+r*.029+seed*.0009)+.037*Math.sin(c*.023-r*.049+1.8)+.023*Math.cos(c*.111+r*.067);
  const coves=.045*Math.max(0,Math.sin(c*.091-r*.038+1.4))*Math.max(0,Math.cos(r*.069+c*.018));
  return Math.max(masses,bridges-.18)+broad-coves+(hash$1(c>>4,r>>4,seed+311)-.5)*.025;
};
const fantasyLandBaseAt=(c,r,seed=1)=>c>=0&&r>=0&&c<WORLD.cols&&r<WORLD.rows&&fantasyField(c,r,seed)>.045;
const fantasyLakeAt=(c,r,seed=1)=>{
  if(!fantasyLandBaseAt(c,r,seed)||fantasyField(c,r,seed)<.13)return false;
  const x=(c+.5)/WORLD.cols*2-1,y=(r+.5)/WORLD.rows*2-1;
  const score=Math.max(
    fantasyEllipse(x,y,-.60,-.19,.045,.075,-.18),
    fantasyEllipse(x,y,-.43,.30,.038,.060,.12),
    fantasyEllipse(x,y,-.05,-.18,.050,.060,.10),
    fantasyEllipse(x,y,.21,.17,.045,.080,-.18),
    fantasyEllipse(x,y,.60,-.12,.035,.055,.08)
  );
  const irregular=.06*Math.sin(c*.21+r*.13+seed*.002)+.035*Math.cos(c*.11-r*.17);
  return score+irregular>.05;
};
const fantasyLandAt=(c,r,seed=1)=>fantasyLandBaseAt(c,r,seed)&&!fantasyLakeAt(c,r,seed);
const fantasyRiverAt=(c,r,seed=1)=>{
  const x=(c+.5)/WORLD.cols*2-1,y=(r+.5)/WORLD.rows*2-1;if(!fantasyLandAt(c,r,seed))return false;
  const rivers=[
    [-.62+.052*Math.sin((y+.20)*6.1+seed*.0004),-.62,.20,.009],
    [-.43+.045*Math.sin((y-.05)*7.2+1.6),.02,.58,.008],
    [-.07+.060*Math.sin((y+.22)*5.5+2.1),-.48,.30,.009],
    [.22+.055*Math.sin((y-.02)*6.0+.7),-.40,.62,.009],
    [.61+.038*Math.sin((y+.10)*8.0+2.9),-.42,.20,.008]
  ];
  for(const [rx,y0,y1,width] of rivers)if(y>y0&&y<y1&&Math.abs(x-rx)<width)return true;
  if(x>-.34&&x<.08){const ry=-.16+.12*Math.sin((x+.30)*8.2)+.25*(x+.18);if(Math.abs(y-ry)<.008)return true;}
  if(x>.08&&x<.47){const ry=.08+.10*Math.sin((x-.08)*9.1+1.1)-.18*(x-.22);if(Math.abs(y-ry)<.007)return true;}
  return false;
};
const fantasyMoisture=(c,r,seed=1)=>{
  const x=(c+.5)/WORLD.cols*2-1,y=(r+.5)/WORLD.rows*2-1;
  let m=.51-.13*Math.abs(y)+.13*Math.sin(x*6.2-y*3.1+1.2)+.08*Math.cos(x*3.5+y*7.7)+(hash$1(c>>2,r>>2,seed+71)-.5)*.08;
  if(fantasyRiverAt(c,r,seed))m+=.24;
  const nearLake=[[2,0],[-2,0],[0,2],[0,-2],[4,0],[-4,0],[0,4],[0,-4]].some(([dc,dr])=>fantasyLakeAt(c+dc,r+dr,seed));if(nearLake)m+=.14;
  if(x>.42&&y>.03)m-=.15;if(x<-.34&&y<-.28)m+=.10;return clamp$1(m,0,1);
};`;

const readableTerrainMethod = String.raw`  drawTerrain(){
    this.layers.terrain.removeChildren().forEach(x=>x.destroy({texture:true,textureSource:true}));const pixelScale=2,w=WORLD.cols*pixelScale,h=WORLD.rows*pixelScale,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h),data=image.data,palettes={
      grass:[117,164,87],meadow:[143,180,103],forest:[55,105,66],desert:[203,169,104],hill:[132,132,91],snow:[230,235,228],
      river:[39,132,164],lake:[31,119,151],beach:[220,198,139],shallow:[42,121,145],ocean:[20,73,102],deep:[11,48,75]
    };
    for(let row=0;row<WORLD.rows;row++)for(let col=0;col<WORLD.cols;col++){
      const cellIndex=row*WORLD.cols+col,cell=this.sim.cells[cellIndex],land=this.sim.isLand(cell),lake=fantasyLakeAt(col,row,this.sim.seed),neighbors=[col>0?this.sim.cells[cellIndex-1]:null,col<WORLD.cols-1?this.sim.cells[cellIndex+1]:null,row>0?this.sim.cells[cellIndex-WORLD.cols]:null,row<WORLD.rows-1?this.sim.cells[cellIndex+WORLD.cols]:null],coast=land&&neighbors.some(n=>n&&!this.sim.isLand(n)),shore=!land&&neighbors.some(n=>n&&this.sim.isLand(n));
      let base;if(!land){if(lake)base=palettes.lake;else if(shore)base=palettes.shallow;else base=cell.elevation<WORLD.waterLevel-.10?palettes.deep:palettes.ocean;}else if(coast)base=palettes.beach;else base=palettes[cell.terrain]||palettes.grass;if(cell.river>.18&&land)base=palettes.river;
      let shade=(hash(col,row,this.sim.seed+91)-.5)*7+(land?(cell.elevation-.55)*5:0);if(lake)shade*=.35;if(cell.river>.18)shade*=.25;
      for(let py=0;py<pixelScale;py++)for(let pxl=0;pxl<pixelScale;pxl++){
        let detail=pxl===0&&py===0?2:pxl===1&&py===1?-2:0;if(coast&&pxl===1&&py===1)detail-=10;if(shore&&!lake&&pxl===0&&py===0)detail+=7;if(lake&&pxl===0&&py===1)detail+=4;if(cell.river>.18&&pxl===1)detail+=3;
        const index=((row*pixelScale+py)*w+col*pixelScale+pxl)*4;data[index]=clamp(base[0]+shade+detail,0,255);data[index+1]=clamp(base[1]+shade+detail,0,255);data[index+2]=clamp(base[2]+shade+detail,0,255);data[index+3]=255;
      }
    }
    ctx.putImageData(image,0,0);const texture=Texture.from(canvas);texture.source.scaleMode='nearest';const sprite=new Sprite(texture);sprite.width=WORLD.cols*WORLD.tile;sprite.height=WORLD.rows*WORLD.tile;this.layers.terrain.addChild(sprite);window.__TIKTOK_WORLD_MAP_VERSION='readable-world-v2';
  }
  tree(`;

function patchSource(source){
  const mapPattern=/\/\/ Fantasy RTS map rebuilt from zero\.[\s\S]*?\nclass WorldSimulation extends EventTarget \{/;
  const terrainPattern=/  drawTerrain\(\)\{[\s\S]*?\n  \}\n  tree\(/;
  if(!mapPattern.test(source))throw new Error('V11 map patch could not find the geography block');
  if(!terrainPattern.test(source))throw new Error('V11 map patch could not find the terrain renderer');
  source=source.replace("shapeVersion:'fantasy-rts-v1'","shapeVersion:'readable-world-v2'");
  source=source.replace(mapPattern,`${readableMapBlock}\nclass WorldSimulation extends EventTarget {`);
  source=source.replace(terrainPattern,readableTerrainMethod);
  source=source.replace("background:'#102d4c'","background:'#12445f'");
  source=source.replaceAll("import('./",`import('${assetBase}`);
  source=source.replaceAll('import("./',`import("${assetBase}`);
  return source;
}

async function start(){
  const response=await fetch(originalUrl,{cache:'no-store'});if(!response.ok)throw new Error(`Unable to load game bundle (${response.status})`);
  const source=patchSource(await response.text());
  const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{await import(blobUrl);}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),15000);}
}

start().catch(async error=>{
  console.error('Readable World V11 bootstrap failed',error);
  const label=document.querySelector('#bridge-label');if(label)label.textContent='MAP FALLBACK';
  await import(originalUrl.href);
});
