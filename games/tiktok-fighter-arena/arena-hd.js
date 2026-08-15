const VERSION='1.4.1';
const IDS=['sky_dojo','ice_crystal','arcane_ruins','desert_moon','neon_city','jungle_temple','volcanic_ring','celestial_citadel'];
const cache=new Map(),pending=new Map();
const valid=id=>IDS.includes(id)?id:'sky_dojo';
const url=id=>`./assets/arenas/${valid(id)}.avif?v=${VERSION}`;
function load(id){id=valid(id);if(cache.has(id))return Promise.resolve(cache.get(id));if(pending.has(id))return pending.get(id);const p=new Promise((resolve,reject)=>{const im=new Image();im.decoding='async';im.onload=()=>{cache.set(id,im);pending.delete(id);resolve(im)};im.onerror=()=>{pending.delete(id);reject(new Error(`Arena image failed: ${id}`))};im.src=url(id)});pending.set(id,p);return p}
function fallback(c,w,h){const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#07112a');g.addColorStop(.52,'#17112b');g.addColorStop(1,'#07060d');c.fillStyle=g;c.fillRect(0,0,w,h);const y=h*.72;c.fillStyle='rgba(18,19,31,.96)';c.fillRect(0,y,w,h-y);c.strokeStyle='rgba(130,190,255,.18)';c.lineWidth=1;for(let i=-10;i<=10;i++){c.beginPath();c.moveTo(w*.5,y);c.lineTo(w*.5+i*w*.12,h);c.stroke()}}
function cover(c,im,w,h){const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;if(!iw||!ih)return;const s=Math.max(w/iw,h/ih),sw=w/s,sh=h/s,sx=(iw-sw)*.5,sy=Math.max(0,(ih-sh)*.44);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(im,sx,sy,sw,sh,0,0,w,h)}
function vignette(c,w,h){const v=c.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.2,w*.5,h*.5,Math.max(w,h)*.72);v.addColorStop(.55,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.42)');c.fillStyle=v;c.fillRect(0,0,w,h)}
function paint(c,id,w,h,dpr,im){c.save();c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);fallback(c,w,h);if(im)cover(c,im,w,h);vignette(c,w,h);c.restore()}
export function renderArenaHD(c,id,w,h,dpr=1){id=valid(id);const im=cache.get(id);paint(c,id,w,h,dpr,im);if(!im)load(id).then(img=>paint(c,id,w,h,dpr,img)).catch(e=>console.warn('[Fighter Arena] '+e.message))}
export function preloadArenaHD(){return Promise.allSettled(IDS.map(load))}
const idle=window.requestIdleCallback||((fn)=>setTimeout(fn,0));idle(()=>preloadArenaHD());
