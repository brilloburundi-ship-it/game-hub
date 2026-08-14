import{S,cfg,clamp,emit,fillArena,installBridge,setArena}from'./core.js?v=1.1.0';
import{startCombat}from'./combat.js?v=1.1.0';

const VERSION='1.1.0';
const MODULES=Array.from({length:9},(_,i)=>`./assets-${i}.js?v=${VERSION}`);
const ASSETS={"./assets/street_mon.webp":"./assets/street_mon.webp"};
const $=s=>document.querySelector(s);
const U={q:$('#queueCount'),fq:$('#fightCount'),dq:$('#drawerQueueCount'),ql:$('#queueList'),lb:$('#leaderboard'),next:$('#nextQueue'),arena:$('#arenaLabel'),ln:$('#leftName'),ll:$('#leftLevel'),lh:$('#leftHealth'),le:$('#leftEnergy'),lc:$('#leftClass'),lw:$('#leftWins'),rn:$('#rightName'),rl:$('#rightLevel'),rh:$('#rightHealth'),re:$('#rightEnergy'),rc:$('#rightClass'),rw:$('#rightWins'),rlabel:$('#roundLabel'),timer:$('#roundTimer'),drawer:$('#drawer'),shade:$('#drawerShade'),menu:$('#menuButton'),close:$('#closeDrawer'),load:$('#loading'),bar:$('#loadProgress'),text:$('#loadText'),start:$('#startButton'),test:$('#testName')};

const hudPatch=document.createElement('style');
hudPatch.textContent=`.versus-hud{top:max(40px,calc(28px + env(safe-area-inset-top)))!important}.arena-label{top:25%!important}@media(min-width:800px) and (orientation:landscape){.versus-hud{top:38px!important}.arena-label{top:24%!important}}`;
document.head.append(hudPatch);

const key=src=>`./${String(src||'').replace(/^\.\//,'')}`;
async function json(url){const r=await fetch(`${url}?v=${VERSION}`,{cache:'no-store'});if(!r.ok)throw Error(`Failed ${url} (${r.status})`);return r.json()}

async function loadAssetModules(){
  const errors=[];
  for(let i=0;i<MODULES.length;i++){
    U.text.textContent=`Loading fighter pack ${i+1}/${MODULES.length}…`;
    U.bar.style.width=`${Math.round(i/MODULES.length*28)}%`;
    try{
      const mod=await import(MODULES[i]);
      const pack=mod[`A${i}`]||Object.values(mod).find(v=>v&&typeof v==='object'&&!Array.isArray(v));
      if(pack)Object.assign(ASSETS,pack);else throw Error(`A${i} export missing`);
    }catch(e){errors.push(`pack ${i}: ${e?.message||e}`);console.warn('[Fighter Arena] optional pack failed',i,e)}
  }
  return errors;
}

function dataUriToBlobUrl(data){
  if(typeof data!=='string'||!data.startsWith('data:image/'))return {url:data,revoke:false};
  const comma=data.indexOf(','),head=data.slice(0,comma),payload=data.slice(comma+1);
  const mime=(head.match(/^data:([^;,]+)/)||[])[1]||'image/webp';
  if(!/;base64/i.test(head))return {url:data,revoke:false};
  const raw=atob(payload),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return {url:URL.createObjectURL(new Blob([bytes],{type:mime})),revoke:true};
}

function imageFrom(url,label){
  return new Promise((ok,no)=>{
    const im=new Image();im.decoding='async';
    im.onload=()=>ok(im);
    im.onerror=()=>no(Error(`Image decode failed: ${label}`));
    im.src=url;
  });
}

async function loadImage(src){
  try{return await imageFrom(`${src}?v=${VERSION}`,src)}catch{}
  const data=ASSETS[key(src)]||ASSETS[src];
  if(!data)throw Error(`Asset missing: ${src}`);
  const h=dataUriToBlobUrl(data);
  try{return await imageFrom(h.url,src)}finally{if(h.revoke)URL.revokeObjectURL(h.url)}
}

function chooseFallbackAtlas(failed,good){
  const list=Object.values(S.manifest.fighters),bad=list.find(f=>f.atlas===failed);
  if(!bad)return good[0];
  return list.find(f=>f.atlas!==failed&&good.includes(f.atlas)&&f.tier===bad.tier)?.atlas||good.find(a=>/martial|knight|samurai/i.test(a))||good[0];
}

async function load(){
  try{
    window.__fighterArenaReady=false;window.__fighterArenaLoadError=null;
    U.text.textContent='Loading fighter data…';U.bar.style.width='3%';
    const[f0,f1,f2,m]=await Promise.all(['./fighters-0.json','./fighters-1.json','./fighters-2.json','./manifest-core.json'].map(json));
    S.manifest={fighters:{...f0,...f1,...f2},...m};
    const moduleErrors=await loadAssetModules();
    const fighterAtlases=[...new Set(Object.values(S.manifest.fighters).map(f=>f.atlas))];
    const failed=[];
    for(let i=0;i<fighterAtlases.length;i++){
      const src=fighterAtlases[i];U.text.textContent=`Decoding fighter ${i+1}/${fighterAtlases.length}…`;
      try{const im=await loadImage(src);S.images.set(src,im);S.images.set(key(src),im)}catch(e){failed.push(src);console.warn('[Fighter Arena] fighter unavailable',src,e)}
      U.bar.style.width=`${30+Math.round((i+1)/fighterAtlases.length*68)}%`;
    }
    const good=fighterAtlases.filter(a=>S.images.has(a)||S.images.has(key(a)));
    if(good.length<2)throw Error(`Only ${good.length} fighter atlas decoded`);
    for(const f of Object.values(S.manifest.fighters))if(!S.images.has(f.atlas)&&!S.images.has(key(f.atlas))){const replacement=chooseFallbackAtlas(f.atlas,good);f.originalAtlas=f.atlas;f.atlas=replacement;f.assetFallback=true}
    setArena(0);U.bar.style.width='100%';
    const notes=[];if(moduleErrors.length)notes.push(`${moduleErrors.length} optional pack recovered`);if(failed.length)notes.push(`${failed.length} fighter fallback`);
    U.text.textContent=notes.length?`Ready · ${notes.join(' · ')}`:'All fighters ready · HD arenas ready';
    U.start.disabled=false;U.start.textContent='ENTER ARENA';U.start.dataset.retry='';window.__fighterArenaReady=true;window.__fighterArenaAssetFailures={modules:moduleErrors,files:failed};
  }catch(e){window.__fighterArenaLoadError=e;U.text.textContent=`Load error: ${e?.message||e}`;U.start.disabled=false;U.start.textContent='RETRY LOADING';U.start.dataset.retry='1';console.error(e)}
}

const panel=open=>{U.drawer.classList.toggle('open',open);U.shade.classList.toggle('open',open);U.drawer.setAttribute('aria-hidden',String(!open))};U.menu.onclick=()=>panel(true);U.close.onclick=()=>panel(false);U.shade.onclick=()=>panel(false);
function hud(r,p){if(!r){U[p+'n'].textContent='WAITING';U[p+'l'].textContent='—';U[p+'c'].textContent='—';U[p+'w'].textContent='0W';U[p+'h'].style.width='0%';U[p+'e'].style.width='0%';return}const v=r.viewer,f=cfg(r.fighterId);U[p+'n'].textContent=v.name;U[p+'l'].textContent=`LV ${v.level}`;U[p+'c'].textContent=f.name;U[p+'w'].textContent=`${v.wins}W`;U[p+'h'].style.width=`${clamp(r.hp/r.maxHp*100,0,100)}%`;U[p+'e'].style.width=`${clamp(r.energy,0,100)}%`}
function ui(){U.q.textContent=S.queue.length;U.dq.textContent=`${S.queue.length} waiting`;U.fq.textContent=S.fightNo;hud(S.active[0],'l');hud(S.active[1],'r');if(S.round==='countdown'){U.rlabel.textContent='READY';U.timer.textContent=Math.max(1,Math.ceil(S.clock))}else if(S.round==='fighting'){U.rlabel.textContent=`FIGHT ${S.fightNo}`;U.timer.textContent=Math.ceil(S.clock)}else if(S.round==='finished'){U.rlabel.textContent='WINNER';U.timer.textContent='KO'}else{U.rlabel.textContent='NEXT BATTLE';U.timer.textContent='VS'}U.ql.innerHTML=S.queue.length?S.queue.slice(0,12).map((v,i)=>`<div class="queue-item"><i>${i+1}</i><div><b>${v.name}</b><span>${cfg(v.fighterId).name} · LV ${v.level}</span></div><span>${v.wins}W</span></div>`).join(''):'<div class="empty">No challengers yet.</div>';const rank=[...S.viewers.values()].sort((a,b)=>b.score-a.score||b.wins-a.wins||b.level-a.level).slice(0,8);U.lb.innerHTML=rank.length?rank.map((v,i)=>`<div class="rank-item"><i>${i+1}</i><div><b>${v.name}</b><span>${cfg(v.fighterId).rarity} · LV ${v.level}</span></div><span>${v.score}</span></div>`).join(''):'<div class="empty">Leaderboard starts with the first JOIN.</div>';const q=S.queue[0];U.next.innerHTML=q?`<b>NEXT: ${q.name}</b><span>${cfg(q.fighterId).name} · LV ${q.level}</span>`:'<b>JOIN THE LIVE</b><span>Viewers enter the battle queue automatically</span>'}
function test(type){const name=(U.test.value||'Viewer').slice(0,16),userId=`viewer:${name.toLowerCase()}`;if(type==='join')emit('join',{userId,username:name});if(type==='like')emit('like',{userId,username:name,count:10});if(type==='follow')emit('follow',{userId,username:name});if(type==='rose')emit('rose',{userId,username:name,count:1});const gifts={'gift-small':5,'gift-medium':50,'gift-high':250,'gift-legend':1000};if(gifts[type])emit('gift',{userId,username:name,giftName:type,diamondCount:gifts[type]});ui()}document.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>test(b.dataset.test));
U.start.onclick=()=>{if(U.start.dataset.retry==='1'){U.start.dataset.retry='';U.start.disabled=true;U.start.textContent='ENTER ARENA';U.bar.style.width='0%';S.images.clear();load();return}S.started=true;U.load.classList.add('done');fillArena();if(new URLSearchParams(location.search).get('demo')==='1'){['ShadowKing','PinkStorm','NeoBlade','FireBoy'].forEach((n,i)=>emit('join',{userId:'demo:'+i,username:n}));emit('follow',{userId:'demo:0',username:'ShadowKing'});emit('rose',{userId:'demo:1',username:'PinkStorm'})}};
installBridge();startCombat($('#game'));setInterval(ui,100);load();