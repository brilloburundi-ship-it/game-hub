import{S,cfg,clamp,emit,fillArena,installBridge,setArena}from'./core.js?v=1.2.0';
import{startCombat}from'./combat.js?v=1.2.0';
import{FX_ASSETS}from'./asset-effects.js?v=1.2.0';

const VERSION='1.2.1';
const MODULES=Array.from({length:9},(_,i)=>`./assets-${i}.js?v=${VERSION}`);
const RESCUE_MODULES=['asset-evil-wizard.js','asset-hero-knight.js','asset-huntress.js','asset-martial-champion.js','asset-martial-hero.js','asset-medieval-king.js','asset-evil-wizard-2.js'];
const ASSETS={"./assets/street_mon.webp":"./assets/street_mon.webp"};
const HELD_URLS=new Set();
const RENDER_SCALE={samurai:.80,medieval_king:.94};
const IMAGE_SCALE=new WeakMap();
const key=src=>`./${String(src||'').replace(/^\.\//,'')}`;
const $=s=>document.querySelector(s);
const U={q:$('#queueCount'),fq:$('#fightCount'),dq:$('#drawerQueueCount'),ql:$('#queueList'),lb:$('#leaderboard'),next:$('#nextQueue'),arena:$('#arenaLabel'),ln:$('#leftName'),ll:$('#leftLevel'),lh:$('#leftHealth'),le:$('#leftEnergy'),lc:$('#leftClass'),lw:$('#leftWins'),rn:$('#rightName'),rl:$('#rightLevel'),rh:$('#rightHealth'),re:$('#rightEnergy'),rc:$('#rightClass'),rw:$('#rightWins'),rlabel:$('#roundLabel'),timer:$('#roundTimer'),drawer:$('#drawer'),shade:$('#drawerShade'),menu:$('#menuButton'),close:$('#closeDrawer'),load:$('#loading'),bar:$('#loadProgress'),text:$('#loadText'),start:$('#startButton'),test:$('#testName')};
const patch=document.createElement('style');patch.textContent=`#game{image-rendering:auto!important}.versus-hud{top:max(40px,calc(28px + env(safe-area-inset-top)))!important}.arena-label{top:25%!important}@media(max-width:699px){.versus-hud{top:max(92px,calc(50px + env(safe-area-inset-top)))!important}.arena-label{top:24%!important}}@media(min-width:800px) and (orientation:landscape){.versus-hud{top:38px!important}.arena-label{top:24%!important}}`;document.head.append(patch);

function installDrawCalibration(){
  const proto=CanvasRenderingContext2D.prototype;if(proto.__fighterArenaScale121)return;
  const native=proto.drawImage;Object.defineProperty(proto,'__fighterArenaScale121',{value:true,configurable:true});
  proto.drawImage=function(...args){
    if(this.canvas?.id==='game'&&args.length===9){
      const bias=IMAGE_SCALE.get(args[0]);
      if(bias&&bias!==1&&Number.isFinite(args[7])&&Number.isFinite(args[8])&&Math.abs(args[7])>48&&Math.abs(args[8])>48){
        const dw=args[7],dh=args[8],ndw=dw*bias,ndh=dh*bias;
        args[5]+=(dw-ndw)*.5;args[6]+=(dh-ndh)*.88;args[7]=ndw;args[8]=ndh;
      }
    }
    return native.apply(this,args);
  };
}
installDrawCalibration();

async function json(url){const r=await fetch(`${url}?v=${VERSION}`,{cache:'no-store'});if(!r.ok)throw Error(`Failed ${url} (${r.status})`);return r.json()}
async function loadAssetModules(){
  const errors=[];
  for(let i=0;i<MODULES.length;i++){U.text.textContent=`Loading fighter pack ${i+1}/${MODULES.length}…`;U.bar.style.width=`${6+Math.round(i/MODULES.length*22)}%`;try{const mod=await import(MODULES[i]);const pack=mod[`A${i}`]||Object.values(mod).find(v=>v&&typeof v==='object'&&!Array.isArray(v));if(!pack)throw Error(`A${i} export missing`);Object.assign(ASSETS,pack)}catch(e){errors.push(`pack ${i}: ${e?.message||e}`)}}
  for(const file of RESCUE_MODULES){try{const mod=await import(`./${file}?v=${VERSION}`);const pack=Object.values(mod).find(v=>v&&typeof v==='object'&&!Array.isArray(v));if(pack)Object.assign(ASSETS,pack)}catch(e){errors.push(`${file}: ${e?.message||e}`)}}
  if(errors.length)console.warn('[Fighter Arena] recovered optional asset module errors',errors);return errors;
}
function releaseHeldUrls(){for(const url of HELD_URLS)try{URL.revokeObjectURL(url)}catch{}HELD_URLS.clear()}
function dataUriToBlobUrl(data){if(typeof data!=='string'||!data.startsWith('data:image/'))return{url:data,revoke:false};const comma=data.indexOf(','),head=data.slice(0,comma),payload=data.slice(comma+1),mime=(head.match(/^data:([^;,]+)/)||[])[1]||'image/png';if(!/;base64/i.test(head))return{url:data,revoke:false};const raw=atob(payload),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return{url:URL.createObjectURL(new Blob([bytes],{type:mime})),revoke:true}}
function imageFrom(url,label){return new Promise((ok,no)=>{const im=new Image();im.decoding='async';im.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').drawImage(im,0,0,1,1);ok(im)}catch(e){no(Error(`Image render failed: ${label} · ${e?.message||e}`))}};im.onerror=()=>no(Error(`Image decode failed: ${label}`));im.src=url})}
function requiredBounds(f){let w=1,h=1;for(const a of Object.values(f.animations||{})){if(!a?.frameW||!a?.frameH||!a?.frames)continue;w=Math.max(w,(a.x||0)+a.frameW*a.frames);h=Math.max(h,(a.y||0)+a.frameH)}return{w,h}}
function atlasFits(im,fighters){return fighters.every(f=>{const b=requiredBounds(f);return im.naturalWidth>=b.w&&im.naturalHeight>=b.h})}
async function decodeAtlas(src,fighters){
  const embedded=ASSETS[key(src)]||ASSETS[src],attempts=[];
  if(typeof embedded==='string'&&embedded.startsWith('data:image/'))attempts.push({url:embedded,revoke:false,kind:'embedded-data'});
  attempts.push({url:`${key(src)}?v=${VERSION}`,revoke:false,kind:'direct-file'});
  if(typeof embedded==='string'&&embedded.startsWith('data:image/')){const h=dataUriToBlobUrl(embedded);attempts.push({...h,kind:'persistent-blob'})}
  let last=null;
  for(const h of attempts){let keep=false;try{const im=await imageFrom(h.url,`${src} (${h.kind})`);if(!atlasFits(im,fighters))throw Error(`Atlas geometry mismatch ${im.naturalWidth}x${im.naturalHeight}`);if(h.revoke){HELD_URLS.add(h.url);keep=true}return im}catch(e){last=e}finally{if(h.revoke&&!keep)try{URL.revokeObjectURL(h.url)}catch{}}}
  throw last||Error(`Asset missing: ${src}`);
}
async function loadFxAssets(){const failed=[];let i=0;for(const[name,data]of Object.entries(FX_ASSETS)){U.text.textContent=`Loading original VFX pack ${i+1}/${Object.keys(FX_ASSETS).length}…`;const h=dataUriToBlobUrl(data);try{const im=await imageFrom(h.url,`VFX ${name}`);S.images.set(`fx:${name}`,im)}catch(e){failed.push(name);console.warn('[Fighter Arena] optional VFX sheet unavailable',name,e)}finally{if(h.revoke)URL.revokeObjectURL(h.url)}i++;U.bar.style.width=`${84+Math.round(i/Object.keys(FX_ASSETS).length*14)}%`}return failed}
function calibrateFighterImages(){for(const[id,f]of Object.entries(S.manifest?.fighters||{})){const im=S.images.get(f.atlas)||S.images.get(key(f.atlas));const bias=RENDER_SCALE[id]||1;if(im&&bias!==1)IMAGE_SCALE.set(im,bias)}}

function desiredCenterGap(){return S.w<700?Math.max(132,Math.min(150,S.w*.36)):Math.max(142,Math.min(190,S.w*.11))}
function tuneRuntimeRange(r){if(!r)return;const f=cfg(r.fighterId);if(!f)return;const factor=Math.max(.42,Math.min(1.28,S.w/920));r.range=Math.max(f.stats.range,desiredCenterGap()/factor)}
let resetFight=-1;
function guardFighterLayout(){
  const[a,b]=S.active;tuneRuntimeRange(a);tuneRuntimeRange(b);
  if(a&&b){
    if(S.round==='countdown'&&resetFight!==S.fightNo){a.x=S.w*.14;b.x=S.w*.86;a.knock=b.knock=0;resetFight=S.fightNo}
    if(S.round==='fighting'){
      const hard=desiredCenterGap()*.90;
      if(a.x>b.x-hard){const mid=(a.x+b.x)/2,ta=clamp(mid-hard/2,S.w*.07,S.w*.84),tb=clamp(mid+hard/2,S.w*.16,S.w*.93);a.x+=clamp(ta-a.x,-5,5);b.x+=clamp(tb-b.x,-5,5)}
    }
  }
  requestAnimationFrame(guardFighterLayout);
}
requestAnimationFrame(guardFighterLayout);

async function load(){try{
  window.__fighterArenaReady=false;window.__fighterArenaLoadError=null;releaseHeldUrls();S.images.clear();U.text.textContent='Loading fighter data…';U.bar.style.width='3%';
  const[f0,f1,f2,m]=await Promise.all(['./fighters-0.json','./fighters-1.json','./fighters-2.json','./manifest-core.json'].map(json));S.manifest={fighters:{...f0,...f1,...f2},...m};
  const moduleErrors=await loadAssetModules();const groups=new Map();for(const f of Object.values(S.manifest.fighters)){if(!groups.has(f.atlas))groups.set(f.atlas,[]);groups.get(f.atlas).push(f)}
  const failed=[];let i=0;for(const[src,fighters]of groups){U.text.textContent=`Validating unique fighter ${i+1}/${groups.size}…`;try{const im=await decodeAtlas(src,fighters);S.images.set(src,im);S.images.set(key(src),im);fighters.forEach(f=>f.assetFallback=false)}catch(e){failed.push(src);fighters.forEach(f=>f.assetFallback=false);console.error('[Fighter Arena] fighter atlas unavailable; arena start blocked',src,e)}i++;U.bar.style.width=`${30+Math.round(i/groups.size*53)}%`}
  if(failed.length){window.__fighterArenaAssetFailures={modules:moduleErrors,files:failed,vfx:[]};U.bar.style.width='83%';U.text.textContent=`Fighter asset retry required · ${groups.size-failed.length}/${groups.size} ready`;U.start.disabled=false;U.start.textContent='RETRY FIGHTERS';U.start.dataset.retry='1';return}
  calibrateFighterImages();
  const failedFx=await loadFxAssets();setArena(0);U.bar.style.width='100%';const fxLoaded=Object.keys(FX_ASSETS).length-failedFx.length;U.text.textContent=`All ${groups.size} unique fighters · ${fxLoaded}/8 original VFX sheets · ${S.manifest.arenas.length} HD arenas ready`;U.start.disabled=false;U.start.textContent='ENTER ARENA';U.start.dataset.retry='';window.__fighterArenaReady=true;window.__fighterArenaAssetFailures={modules:moduleErrors,files:[],vfx:failedFx};
}catch(e){window.__fighterArenaLoadError=e;U.text.textContent=`Load error: ${e?.message||e}`;U.start.disabled=false;U.start.textContent='RETRY LOADING';U.start.dataset.retry='1';console.error(e)}}

const panel=open=>{U.drawer.classList.toggle('open',open);U.shade.classList.toggle('open',open);U.drawer.setAttribute('aria-hidden',String(!open))};U.menu.onclick=()=>panel(true);U.close.onclick=()=>panel(false);U.shade.onclick=()=>panel(false);
function hud(r,p){if(!r){U[p+'n'].textContent='WAITING';U[p+'l'].textContent='—';U[p+'c'].textContent='—';U[p+'w'].textContent='0W';U[p+'h'].style.width='0%';U[p+'e'].style.width='0%';return}const v=r.viewer,f=cfg(r.fighterId);U[p+'n'].textContent=v.name;U[p+'l'].textContent=`LV ${v.level}`;U[p+'c'].textContent=f.name;U[p+'w'].textContent=`${v.wins}W`;U[p+'h'].style.width=`${clamp(r.hp/r.maxHp*100,0,100)}%`;U[p+'e'].style.width=`${clamp(r.energy,0,100)}%`}
function ui(){U.q.textContent=S.queue.length;U.dq.textContent=`${S.queue.length} waiting`;U.fq.textContent=S.fightNo;hud(S.active[0],'l');hud(S.active[1],'r');if(S.round==='countdown'){U.rlabel.textContent='READY';U.timer.textContent=Math.max(1,Math.ceil(S.clock))}else if(S.round==='fighting'){U.rlabel.textContent=`FIGHT ${S.fightNo}`;U.timer.textContent=Math.ceil(S.clock)}else if(S.round==='finished'){U.rlabel.textContent='WINNER';U.timer.textContent='KO'}else{U.rlabel.textContent='NEXT BATTLE';U.timer.textContent='VS'}U.ql.innerHTML=S.queue.length?S.queue.slice(0,12).map((v,i)=>`<div class="queue-item"><i>${i+1}</i><div><b>${v.name}</b><span>${cfg(v.fighterId).name} · LV ${v.level}</span></div><span>${v.wins}W</span></div>`).join(''):'<div class="empty">No challengers yet.</div>';const rank=[...S.viewers.values()].sort((a,b)=>b.score-a.score||b.wins-a.wins||b.level-a.level).slice(0,8);U.lb.innerHTML=rank.length?rank.map((v,i)=>`<div class="rank-item"><i>${i+1}</i><div><b>${v.name}</b><span>${cfg(v.fighterId).rarity} · LV ${v.level}</span></div><span>${v.score}</span></div>`).join(''):'<div class="empty">Leaderboard starts with the first JOIN.</div>';const q=S.queue[0];U.next.innerHTML=q?`<b>NEXT: ${q.name}</b><span>${cfg(q.fighterId).name} · LV ${q.level}</span>`:'<b>JOIN THE LIVE</b><span>Viewers enter the battle queue automatically</span>'}
function test(type){const name=(U.test.value||'Viewer').slice(0,16),userId=`viewer:${name.toLowerCase()}`;if(type==='join')emit('join',{userId,username:name});if(type==='like')emit('like',{userId,username:name,count:10});if(type==='follow')emit('follow',{userId,username:name});if(type==='rose')emit('rose',{userId,username:name,count:1});const gifts={'gift-small':5,'gift-medium':50,'gift-high':250,'gift-legend':1000};if(gifts[type])emit('gift',{userId,username:name,giftName:type,diamondCount:gifts[type]});ui()}document.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>test(b.dataset.test));
U.start.onclick=()=>{if(U.start.dataset.retry==='1'){U.start.dataset.retry='';U.start.disabled=true;U.start.textContent='ENTER ARENA';U.bar.style.width='0%';load();return}S.started=true;U.load.classList.add('done');fillArena();if(new URLSearchParams(location.search).get('demo')==='1'){['ShadowKing','PinkStorm','NeoBlade','FireBoy'].forEach((n,i)=>emit('join',{userId:'demo:'+i,username:n}));emit('follow',{userId:'demo:0',username:'ShadowKing'});emit('rose',{userId:'demo:1',username:'PinkStorm'})}};
installBridge();if(window.FighterArenaBridge)window.FighterArenaBridge.version=VERSION;startCombat($('#game'));setInterval(ui,100);load();
