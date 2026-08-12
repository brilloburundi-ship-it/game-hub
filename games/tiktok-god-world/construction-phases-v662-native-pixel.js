(() => {
  'use strict';

  // Additive V6.6.2 construction visuals. Completed prefab artwork and core game stay untouched.
  const BUILDINGS = {
    barracks:{file:'assets/buildings/barracks.png',w:106,h:84},
    castle:{file:'assets/buildings/castle.png',w:161,h:190},
    church:{file:'assets/buildings/church.png',w:96,h:91},
    farm:{file:'assets/buildings/farm.png',w:120,h:83},
    forge:{file:'assets/buildings/forge.png',w:100,h:86},
    gate:{file:'assets/buildings/gate.png',w:170,h:141},
    house_a:{file:'assets/buildings/house_a.png',w:92,h:94},
    house_b:{file:'assets/buildings/house_b.png',w:95,h:90},
    house_c:{file:'assets/buildings/house_c.png',w:89,h:87},
    keep:{file:'assets/buildings/keep.png',w:148,h:163},
    market:{file:'assets/buildings/market.png',w:107,h:80},
    silo:{file:'assets/buildings/silo.png',w:85,h:85},
    stable:{file:'assets/buildings/stable.png',w:109,h:87},
    stone_tower:{file:'assets/buildings/stone_tower.png',w:66,h:99},
    wall:{file:'assets/buildings/wall.png',w:82,h:79},
    wall_corner:{file:'assets/buildings/wall_corner.png',w:90,h:73},
    warehouse:{file:'assets/buildings/warehouse.png',w:99,h:80},
    watchtower:{file:'assets/buildings/watchtower.png',w:68,h:104},
    windmill:{file:'assets/buildings/windmill.png',w:86,h:89}
  };

  const TYPES = new Set(Object.keys(BUILDINGS));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // The stable/setta prefab was explicitly requested to stay at the smaller in-game size.
  // This matches the small construction presentation (72% of the original 28px world-height target)
  // and prevents the original grow tween from leaving one instance larger than another.
  const STABLE_SMALL_SCALE = (28 * .72) / BUILDINGS.stable.h;

  const aliases = new Map([
    ['house','house_a'],['home','house_a'],['field','farm'],['farm_field','farm'],
    ['tower','stone_tower'],['stalla','stable'],['setta','stable']
  ]);

  function cleanType(value) {
    if (typeof value !== 'string') return null;
    const raw = value.trim().toLowerCase().replace(/\s+/g,'_');
    if (TYPES.has(raw)) return raw;
    if (aliases.has(raw)) return aliases.get(raw);
    for (const [type,meta] of Object.entries(BUILDINGS)) {
      if (raw === `${type}.png` || raw.endsWith(`/${type}.png`) || raw.endsWith(meta.file.toLowerCase())) return type;
    }
    return null;
  }

  function typeFromObject(value) {
    if (!value || typeof value !== 'object') return null;
    for (const key of ['buildingType','type','kind','id','name','asset','prefab','textureName']) {
      const found = cleanType(value[key]);
      if (found) return found;
    }
    return null;
  }

  function typeFromSprite(sprite) {
    if (!sprite) return null;
    for (const value of [
      sprite.__buildingType,sprite.buildingType,sprite.label,sprite.name,
      sprite.texture?.label,sprite.texture?.source?.label,
      sprite.texture?.source?.resource?.src,sprite.texture?.source?.resource?.url
    ]) {
      const found = cleanType(value);
      if (found) return found;
    }
    return null;
  }

  function inferType(args,result,candidates) {
    for (const arg of args) {
      const found = cleanType(arg) || typeFromObject(arg);
      if (found) return found;
    }
    const resultType = cleanType(result) || typeFromObject(result);
    if (resultType) return resultType;
    for (const sprite of candidates) {
      const found = typeFromSprite(sprite);
      if (found) return found;
    }
    return null;
  }

  function colorNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value & 0xffffff;
    if (typeof value === 'string') {
      let hex = value.trim().replace(/^#/,'');
      if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split('').map(x=>x+x).join('');
      if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex,16);
    }
    return null;
  }

  function inferKingdomColor(args,result,sprite) {
    // sim.addBuilding(k, type, x, y, ...) always passes the owning kingdom first.
    // Prefer that exact palette so construction phases can never fall back to another kingdom colour.
    const directKingdom = args.find(v => v && typeof v === 'object' && colorNumber(v.color) !== null);
    if (directKingdom) return colorNumber(directKingdom.color);

    const ownerId = Number.isInteger(result?.owner) ? result.owner : Number.isInteger(sprite?.__owner) ? sprite.__owner : null;
    const ownerKingdom = ownerId !== null ? window.__SIM?.kingdoms?.[ownerId] : null;
    const ownerColor = colorNumber(ownerKingdom?.color);
    if (ownerColor !== null) return ownerColor;

    const objects = [...args,result].filter(v=>v && typeof v === 'object');
    for (const object of objects) {
      for (const key of ['color','primaryColor','kingdomColor','accent','tint']) {
        const n = colorNumber(object[key]);
        if (n !== null) return n;
      }
      for (const paletteKey of ['palette','colors']) {
        const palette = object[paletteKey];
        if (!palette || typeof palette !== 'object') continue;
        for (const key of ['primary','main','roof','accent','color']) {
          const n = colorNumber(palette[key]);
          if (n !== null) return n;
        }
      }
    }
    const tint = colorNumber(sprite?.tint);
    return tint !== null && tint !== 0xffffff ? tint : 0x4da6ff;
  }

  function loadImage(url) {
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Construction source not available: ${url}`));
      image.src = url;
    });
  }

  function getOpaqueBounds(ctx,w,h) {
    const data = ctx.getImageData(0,0,w,h).data;
    let x0=w,y0=h,x1=-1,y1=-1;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      if (data[(y*w+x)*4+3] > 8) {
        if (x<x0) x0=x; if (x>x1) x1=x;
        if (y<y0) y0=y; if (y>y1) y1=y;
      }
    }
    return x1 < 0 ? {x0:0,y0:0,x1:w-1,y1:h-1} : {x0,y0,x1:x1+1,y1:y1+1};
  }

  function rect(ctx,x,y,w,h,color) {
    ctx.fillStyle=color;
    ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
  }

  function pixelLine(ctx,x0,y0,x1,y1,color,width=1) {
    x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
    const half=Math.max(0,Math.floor(width/2));
    ctx.fillStyle=color;
    while (true) {
      ctx.fillRect(x0-half,y0-half,Math.max(1,width),Math.max(1,width));
      if (x0===x1 && y0===y1) break;
      const e2=2*err;
      if (e2>=dy) { err+=dy; x0+=sx; }
      if (e2<=dx) { err+=dx; y0+=sy; }
    }
  }

  function buildStage(sourceCanvas,stage,bounds) {
    const w=sourceCanvas.width,h=sourceCanvas.height;
    const base=document.createElement('canvas'); base.width=w;base.height=h;
    const mask=document.createElement('canvas'); mask.width=w;mask.height=h;
    const ctx=base.getContext('2d',{willReadFrequently:true});
    const mctx=mask.getContext('2d');
    ctx.imageSmoothingEnabled=false;mctx.imageSmoothingEnabled=false;
    ctx.drawImage(sourceCanvas,0,0);

    const {x0,y0,x1,y1}=bounds;
    const bh=Math.max(1,y1-y0), bwBox=Math.max(1,x1-x0);
    const keep=[0,.22,.48,.74][stage];
    const cut=Math.max(0,Math.round(y1-bh*keep));
    ctx.clearRect(0,0,w,cut);

    const wood='#965522',woodDark='#5b3116',woodLight='#cd8339';
    const line=Math.max(1,Math.round(bwBox/48));
    const left=x0+Math.max(2,Math.round(bwBox*.12));
    const right=x1-Math.max(3,Math.round(bwBox*.10));
    const bottom=y1-Math.max(2,Math.round(bh*.04));
    const top=Math.max(y0+1,cut-1);

    if (stage===1) {
      for (const x of [left,right]) {
        rect(ctx,x-line,top-2,line*2+1,bottom-top+2,woodDark);
        rect(ctx,x-line+1,top-2,Math.max(1,line*2-1),bottom-top+2,wood);
      }
      const beam=bottom-Math.max(4,Math.round(bh*.12));
      rect(ctx,left,beam-line,right-left,line*2+1,wood);
      const pole=right-line;
      rect(ctx,pole,top,line,bh*.16,woodDark);
      rect(mctx,pole+line,top,Math.max(5,line*6),Math.max(3,line*3),'#ffffff');
    } else if (stage===2) {
      const xs=[left,left+(right-left)*.35,left+(right-left)*.68,right];
      for (const x of xs) rect(ctx,x-line,top-3,line*2+1,bottom-top+3,wood);
      for (const y of [top+Math.max(4,line*2),top+(bottom-top)*.48,bottom-bh*.07]) rect(ctx,left,y-line,right-left,line*2+1,wood);
      pixelLine(ctx,left,bottom,right,top+Math.max(4,line*2),woodLight,Math.max(1,line));
      rect(mctx,right+line,top+Math.max(4,line*2),Math.max(6,line*7),Math.max(4,line*4),'#ffffff');
    } else {
      rect(ctx,left,top-2,line+1,bottom-top+2,wood);
      rect(ctx,right-line,top-2,line+1,bottom-top+2,wood);
      const mid=(left+right)/2,roof=Math.max(y0+1,top-5);
      pixelLine(ctx,left,top+Math.max(4,line*2),mid,roof,woodLight,Math.max(1,line+1));
      pixelLine(ctx,mid,roof,right,top+Math.max(4,line*2),woodLight,Math.max(1,line+1));
      rect(ctx,left,top+(bottom-top)*.55-line,right-left,line*2+1,wood);
      rect(ctx,right-line,roof-2,line+1,Math.max(7,line*7),woodDark);
      mctx.fillStyle='#ffffff';
      mctx.beginPath();
      mctx.moveTo(right,roof);mctx.lineTo(Math.min(w-1,right+Math.max(7,line*8)),roof+Math.max(2,line));
      mctx.lineTo(right,roof+Math.max(4,line*4));mctx.closePath();mctx.fill();
    }
    return {base,mask};
  }

  async function preloadConstructionTextures() {
    while (!window.PIXI?.Texture) await sleep(16);
    const result=Object.create(null);
    await Promise.all(Object.entries(BUILDINGS).map(async ([type,meta]) => {
      const image=await loadImage(meta.file);
      const source=document.createElement('canvas');source.width=meta.w;source.height=meta.h;
      const ctx=source.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
      ctx.clearRect(0,0,meta.w,meta.h);ctx.drawImage(image,0,0,meta.w,meta.h);
      const bounds=getOpaqueBounds(ctx,meta.w,meta.h);
      result[type]=[1,2,3].map(stage => {
        const pair=buildStage(source,stage,bounds);
        return {base:window.PIXI.Texture.from(pair.base),mask:window.PIXI.Texture.from(pair.mask)};
      });
    }));
    window.__CONSTRUCTION_PIXEL_TEXTURES=result;
    window.__CONSTRUCTION_PIXEL_META={
      version:'v662-native-pixel-2',stages:3,nativeSizes:true,tintMasks:true,
      kingdomColorLocked:true,stableSmallScale:true,farmFoundationHidden:true
    };
    document.documentElement.dataset.constructionAssets='ready';
    return result;
  }

  window.__CONSTRUCTION_TEXTURES_READY = window.__CONSTRUCTION_TEXTURES_READY || preloadConstructionTextures().catch(error => {
    window.__CONSTRUCTION_TEXTURES_ERROR=String(error?.message||error);
    console.error('[construction-phases-v662 preload]',error);
    return null;
  });

  function resultSprite(result) {
    if (!result || typeof result !== 'object') return null;
    if (result._sprite?.texture) return result._sprite;
    for (const key of ['sprite','view','display','entity','node']) if (result[key]?.texture) return result[key];
    return null;
  }

  function area(sprite) {
    try { return Math.abs((sprite.width||0)*(sprite.height||0)); } catch (_) { return 0; }
  }

  function forceStableSmallScale(sprite) {
    if (!sprite?.scale) return;
    const sx=sprite.scale.x<0?-1:1, sy=sprite.scale.y<0?-1:1;
    sprite.scale.set(STABLE_SMALL_SCALE*sx,STABLE_SMALL_SCALE*sy);
    sprite.__stableSmallScaleLocked=true;
  }

  function hideFarmFoundation(result) {
    if (!result || result.type !== 'farm') return;
    if (result._foundation) {
      result._foundation.visible=false;
      result._foundation.renderable=false;
      result._foundation.alpha=0;
      result._foundation.__farmFoundationHidden=true;
    }
  }

  function copyTransform(from,to) {
    to.position?.copyFrom?.(from.position);
    if (from.anchor && to.anchor) to.anchor.copyFrom(from.anchor);
    if (from.pivot && to.pivot) to.pivot.copyFrom(from.pivot);
    if (from.skew && to.skew) to.skew.copyFrom(from.skew);
    if (from.scale && to.scale) to.scale.copyFrom(from.scale);
    to.rotation=from.rotation||0;to.alpha=from.alpha??1;to.zIndex=from.zIndex??0;
    to.roundPixels=true;to.eventMode='none';
  }

  async function play(sprite,type,color,renderer) {
    if (!sprite?.parent || sprite.destroyed || sprite.__constructionStagesPlayed) return;
    sprite.__constructionStagesPlayed=true;
    sprite.__constructionKingdomColor=color;
    if (type==='stable') forceStableSmallScale(sprite);

    const textures=await window.__CONSTRUCTION_TEXTURES_READY;
    const frames=textures?.[type];
    if (!frames?.length || !sprite?.parent || sprite.destroyed) return;
    const parent=sprite.parent,wasVisible=sprite.visible,wasRenderable=sprite.renderable;
    sprite.visible=false;sprite.renderable=false;
    let active=[];
    try {
      const durations=['castle','keep','gate'].includes(type)?[720,760,820]:[520,570,620];
      for (let i=0;i<3;i++) {
        for (const item of active) if (!item.destroyed) item.destroy();
        if (type==='stable') forceStableSmallScale(sprite);
        const base=new window.PIXI.Sprite(frames[i].base),mask=new window.PIXI.Sprite(frames[i].mask);
        copyTransform(sprite,base);copyTransform(sprite,mask);
        mask.tint=color;
        base.label=`construction-${type}-stage-${i+1}`;
        mask.label=`construction-${type}-faction-${i+1}`;
        mask.__kingdomColor=color;
        parent.addChild(base);parent.addChild(mask);active=[base,mask];
        if (parent.sortableChildren) parent.sortDirty=true;
        await sleep(durations[i]);
        if (!sprite || sprite.destroyed) break;
      }
    } finally {
      for (const item of active) if (item && !item.destroyed) item.destroy();
      if (sprite && !sprite.destroyed) {
        sprite.visible=wasVisible;sprite.renderable=wasRenderable;
        if (type==='stable') forceStableSmallScale(sprite);
      }
      if (renderer?.entities?.sortableChildren) renderer.entities.sortDirty=true;
    }
  }

  async function install() {
    for (let i=0;i<1200;i++) {
      if (window.__SIM?.r && typeof window.__SIM?.addBuilding==='function' && window.PIXI) break;
      await sleep(25);
    }
    const sim=window.__SIM,renderer=sim?.r,parent=renderer?.entities;
    if (!sim || !renderer || !parent || typeof sim.addBuilding!=='function' || sim.__constructionNativePixelV662) return;
    sim.__constructionNativePixelV662=true;
    const original=sim.addBuilding;

    sim.addBuilding=function(...args) {
      const before=new Set(parent.children||[]);
      const finalize=result => {
        // This only removes the generic diamond foundation for farm fields; no other building is changed.
        hideFarmFoundation(result);

        queueMicrotask(() => {
          const candidates=(parent.children||[]).filter(child=>!before.has(child) && child?.texture);
          const type=inferType(args,result,candidates);
          if (!type || !BUILDINGS[type]) return;
          let sprite=resultSprite(result);
          if (!sprite || sprite.destroyed || !sprite.texture) {
            sprite=candidates.find(item=>typeFromSprite(item)===type) || [...candidates].sort((a,b)=>area(b)-area(a))[0];
          }
          if (!sprite || sprite.destroyed || !sprite.texture) return;

          sprite.__buildingType=type;
          sprite.__owner=Number.isInteger(result?.owner)?result.owner:sprite.__owner;
          if (type==='stable') forceStableSmallScale(sprite);

          const color=inferKingdomColor(args,result,sprite);
          sprite.__constructionKingdomColor=color;
          play(sprite,type,color,renderer).catch(error=>{
            console.error('[construction-phases-v662]',error);
            if (sprite && !sprite.destroyed) {
              sprite.visible=true;sprite.renderable=true;
              if (type==='stable') forceStableSmallScale(sprite);
            }
          });
        });
        return result;
      };

      const result=original.apply(this,args);
      if (result && typeof result.then==='function') return result.then(finalize);
      return finalize(result);
    };

    document.documentElement.dataset.constructionStages='v662-native-pixel-installed';
  }

  install().catch(error => {
    window.__CONSTRUCTION_STAGES_ERROR=String(error?.message||error);
    console.error('[construction-phases-v662 install]',error);
  });
})();