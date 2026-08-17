(() => {
'use strict';

const $ = selector => document.querySelector(selector);
const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const W = 540;
const H = 800;
const MAX = 18;
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const FIGHTER_W = 54;
const FIGHTER_H = 81;
const FIGHTER_HIT = 15;

ctx.imageSmoothingEnabled = true;

const ui = {
  alive: $('#aliveCount'), timer: $('#zoneTimer'), board: $('#leaderboardList'),
  feed: $('#killFeed'), queue: $('#queueCount'), wait: $('#waitingOverlay'),
  banner: $('#roundBanner'), bk: $('#roundBannerKicker'), bn: $('#roundBannerName'),
  mode: $('#modeBadge'), demo: $('#demoPanel')
};

const COLORS = [
  '#ffb11f','#61c7ff','#f04c2b','#f4f4f4',
  '#28455f','#78905b','#d4bb62','#c69814',
  '#1bbc7d','#929292','#b76b56','#ff5a1e',
  '#c6cdd1','#e9edf1','#73965e','#4f8dd8'
];
const names = [
  'NIGHTHAWK','LUNA_PLAYS','FASTFURY','PIXELPANDA','SILENTFOX','BLAZE_ON',
  'GHOST_77','QUEENBEE','ICYBOY','DRAGONYT','ROOKIE99','NOVA','KRAKEN','VOLT','RAVEN','ASTRA'
];
const obstacles = [
  {x:55,y:105,w:95,h:44},{x:390,y:100,w:96,h:44},
  {x:210,y:180,w:50,h:92},{x:305,y:245,w:108,h:45},
  {x:70,y:330,w:58,h:90},{x:170,y:385,w:92,h:45},
  {x:333,y:405,w:58,h:103},{x:430,y:520,w:62,h:62},
  {x:78,y:588,w:93,h:43},{x:230,y:610,w:60,h:90}
];

const state = {
  players: [], bullets: [], fx: [], pickups: [], queue: [], feed: [],
  round: 1, time: 0, zoneT: 96, zoneR: 355, ended: false,
  last: performance.now(), lastUI: 0
};
let idSeed = 1;
let source = null;
let started = false;

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rnd(a,b){ return a + Math.random() * (b-a); }
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function blocked(x,y,r=16){
  return obstacles.some(o => x+r>o.x && x-r<o.x+o.w && y+r>o.y && y-r<o.y+o.h);
}
function safeSpawn(){
  for(let i=0;i<80;i++){
    const p={x:rnd(45,W-45),y:rnd(85,H-55)};
    if(!blocked(p.x,p.y,22) && Math.hypot(p.x-W/2,p.y-H/2)<state.zoneR-28) return p;
  }
  return {x:W/2,y:H/2};
}
function cleanName(v){ return String(v||'Viewer').replace(/^@/,'').trim().slice(0,18) || 'Viewer'; }
function keyOf(payload={}){ return String(payload.userId||payload.uniqueId||payload.username||'').toLowerCase(); }
function find(payload){
  const key=keyOf(payload);
  return state.players.find(p=>p.key===key || p.name.toLowerCase()===key);
}
function add(payload={}){
  const existing=find(payload);
  if(existing) return existing;
  const name=cleanName(payload.username||payload.uniqueId);
  const key=String(payload.userId||payload.uniqueId||name).toLowerCase();
  if(state.ended || state.players.filter(p=>p.alive).length>=MAX || state.zoneT<18){
    if(!state.queue.some(q=>q.key===key)) state.queue.push({key,name,payload});
    syncUI();
    return null;
  }
  const s=safeSpawn();
  const skin=(idSeed-1)%16;
  const p={
    id:idSeed++,key,name,x:s.x,y:s.y,vx:0,vy:0,a:rnd(0,Math.PI*2),
    hp:100,max:100,shield:0,level:1,weapon:0,kills:0,alive:true,
    shot:rnd(.2,.8),think:0,target:null,skin,color:COLORS[skin],
    flash:0,followed:false,score:0,walkPhase:rnd(0,Math.PI*2)
  };
  state.players.push(p);
  ui.wait.hidden=true;
  burst(p.x,p.y,p.color,12);
  syncUI();
  return p;
}
function heal(p,n){
  if(!p||!p.alive) return;
  p.hp=clamp(p.hp+n,0,p.max);
  burst(p.x,p.y,'#5aff8b',5);
}
function upgrade(p,n=1){
  if(!p||!p.alive) return;
  p.level=clamp(p.level+n,1,12);
  p.max=100+(p.level-1)*8;
  p.hp=clamp(p.hp+18,0,p.max);
  p.weapon=clamp(Math.floor((p.level-1)/2),0,4);
  p.shield=clamp(p.shield+12,0,65);
  burst(p.x,p.y,'#ffd34f',10);
}
function gift(p,d=1,name='gift'){
  if(!p||!p.alive) return;
  if(/rose|rosa/i.test(name)){ upgrade(p,1); return; }
  if(d>=100){ airstrike(p); upgrade(p,2); }
  else if(d>=20){ p.weapon=clamp(p.weapon+1,0,4); p.shield=clamp(p.shield+30,0,80); burst(p.x,p.y,'#c979ff',14); }
  else { heal(p,20+d*.4); p.shield=clamp(p.shield+10,0,60); }
}
function airstrike(owner){
  for(let i=0;i<3;i++) setTimeout(()=>{
    const enemies=state.players.filter(p=>p.alive&&p!==owner);
    if(!enemies.length) return;
    const t=enemies[(Math.random()*enemies.length)|0];
    burst(t.x,t.y,'#ff713d',24); damage(t,34,owner);
  },i*180);
}
function event(type,payload={}){
  const p=find(payload);
  if(type==='join') add(payload);
  else if(type==='like') heal(p,Math.min(24,2+Math.sqrt(Math.max(1,+payload.count||1))*2.2));
  else if(type==='follow'&&p&&!p.followed){
    p.followed=true; p.weapon=clamp(p.weapon+1,0,4); p.shield=clamp(p.shield+28,0,70); burst(p.x,p.y,'#6cf26e',12);
  } else if(type==='gift') gift(p,Math.max(1,+payload.diamondCount||1)*Math.max(1,+payload.repeatCount||1),payload.giftName);
}
window.addEventListener('live-dropzone:event',e=>event(e.detail?.type,e.detail?.payload));

const WS = [
  {speed:440,rate:.74,dmg:16,spread:.045,count:1},
  {speed:470,rate:.55,dmg:14,spread:.07,count:1},
  {speed:420,rate:.92,dmg:9,spread:.22,count:4},
  {speed:520,rate:.34,dmg:11,spread:.09,count:1},
  {speed:570,rate:.22,dmg:10,spread:.12,count:1}
];
function shoot(p,t){
  const w=WS[p.weapon]||WS[0];
  if(p.shot>0||!t) return;
  p.shot=w.rate*(.94+Math.random()*.18);
  p.a=Math.atan2(t.y-p.y,t.x-p.x);
  for(let i=0;i<w.count;i++){
    const a=p.a+(Math.random()-.5)*w.spread;
    state.bullets.push({
      x:p.x+Math.cos(a)*34,y:p.y+Math.sin(a)*34,
      vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,life:1.25,
      owner:p,dmg:w.dmg*(1+(p.level-1)*.025),color:p.color
    });
  }
  p.flash=.06;
}
function damage(p,n,owner){
  if(!p||!p.alive) return;
  const sh=Math.min(p.shield,n); p.shield-=sh; n-=sh; p.hp-=n;
  burst(p.x,p.y,n>20?'#ff725b':'#ffffff',4);
  if(p.hp<=0){
    p.alive=false; p.hp=0; p.vx=p.vy=0;
    if(owner&&owner!==p){ owner.kills++; owner.score+=100; }
    state.feed.unshift(`${owner?.name||'ZONA'} ✕ ${p.name}`);
    state.feed=state.feed.slice(0,5); burst(p.x,p.y,'#ff4a43',18);
    const alive=state.players.filter(x=>x.alive);
    if(alive.length===1&&state.players.length>1) finish(alive[0]);
  }
}
function nearest(p){
  let best=null,bd=1e9;
  for(const q of state.players){
    if(!q.alive||q===p) continue;
    const d=(p.x-q.x)**2+(p.y-q.y)**2;
    if(d<bd){bd=d;best=q;}
  }
  return best;
}
function movePlayer(p,dt){
  p.shot=Math.max(0,p.shot-dt); p.flash=Math.max(0,p.flash-dt); p.think-=dt;
  if(p.think<=0){
    p.think=rnd(.18,.5); p.target=nearest(p);
    if(p.target){
      const a=Math.atan2(p.target.y-p.y,p.target.x-p.x),d=dist(p,p.target);
      const strafe=(Math.random()-.5)*1.8,ideal=p.weapon===2?105:150;
      const dir=d>ideal+35?1:d<ideal-35?-1:.15;
      p.vx=(Math.cos(a)*dir+Math.cos(a+Math.PI/2)*strafe*.45)*rnd(45,72);
      p.vy=(Math.sin(a)*dir+Math.sin(a+Math.PI/2)*strafe*.45)*rnd(45,72);
      p.a=a;
    }
  }
  const ox=p.x,oy=p.y;
  p.x=clamp(p.x+p.vx*dt,24,W-24); p.y=clamp(p.y+p.vy*dt,58,H-24);
  if(blocked(p.x,p.y,18)){ p.x=ox;p.y=oy;p.vx*=-.7;p.vy*=-.7; }
  const cx=p.x-W/2,cy=p.y-H/2,dz=Math.hypot(cx,cy);
  if(dz>state.zoneR-18){
    const a=Math.atan2(cy,cx); p.x-=Math.cos(a)*85*dt; p.y-=Math.sin(a)*85*dt; damage(p,8*dt,null);
  }
  if(p.target&&p.target.alive&&dist(p,p.target)<310) shoot(p,p.target);
}
function updateBullets(dt){
  for(let i=state.bullets.length-1;i>=0;i--){
    const b=state.bullets[i]; b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    if(b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H||blocked(b.x,b.y,2)){ state.bullets.splice(i,1); continue; }
    const hit=state.players.find(p=>p.alive&&p!==b.owner&&Math.hypot(p.x-b.x,p.y-b.y)<FIGHTER_HIT);
    if(hit){ damage(hit,b.dmg,b.owner); state.bullets.splice(i,1); }
  }
}
function burst(x,y,color,n=6){
  for(let i=0;i<n;i++){
    const a=rnd(0,Math.PI*2),s=rnd(20,105);
    state.fx.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.15,.55),max:.55,color});
  }
}
function updateFx(dt){
  for(let i=state.fx.length-1;i>=0;i--){
    const f=state.fx[i]; f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.94;f.vy*=.94;f.life-=dt;
    if(f.life<=0) state.fx.splice(i,1);
  }
}
function spawnPickups(){
  state.pickups=[];
  for(const k of [0,3,4,5,3,4,0]){ const s=safeSpawn(); state.pickups.push({x:s.x,y:s.y,k,up:true,resp:0}); }
}
function pickups(dt){
  for(const a of state.pickups){
    if(!a.up){ a.resp-=dt; if(a.resp<=0){const s=safeSpawn();a.x=s.x;a.y=s.y;a.up=true;} continue; }
    const p=state.players.find(q=>q.alive&&Math.hypot(q.x-a.x,q.y-a.y)<27);
    if(!p) continue;
    a.up=false;a.resp=rnd(12,22);
    if(a.k===3) heal(p,30);
    else if(a.k===4){p.shot=0;p.score+=15;burst(p.x,p.y,'#ffdc46',6);}
    else if(a.k===0){p.shield=clamp(p.shield+25,0,80);p.score+=25;burst(p.x,p.y,'#4dcaff',8);}
    else {p.weapon=clamp(p.weapon+1,0,4);p.score+=35;burst(p.x,p.y,'#ff9d31',10);}
  }
}
function update(dt){
  if(!state.ended&&state.players.some(p=>p.alive)){
    state.time+=dt; state.zoneT=Math.max(0,96-state.time);
    const t=clamp(state.time/96,0,1); state.zoneR=355-(230*Math.pow(t,1.15));
    for(const p of state.players) if(p.alive) movePlayer(p,dt);
    updateBullets(dt); pickups(dt);
  }
  updateFx(dt);
}

function sourceSprite(img,sx,sy,sw,sh,dx,dy,dw,dh,rot=0,alpha=1){
  if(!img||!img.complete||!img.naturalWidth) return false;
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(dx,dy);ctx.rotate(rot);
  ctx.drawImage(img,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);ctx.restore();return true;
}
function tile(index,dx,dy,dw,dh,rot=0,alpha=1){
  if(!source) return false;
  const c=source.tileCell,sx=(index%4)*c,sy=Math.floor(index/4)*c;
  return sourceSprite(source.tiles,sx,sy,c,c,dx,dy,dw,dh,rot,alpha);
}
function fighterSprite(skin,dx,dy,rot,alpha=1,bob=0){
  if(!source) return false;
  const cw=source.fighterCellW,ch=source.fighterCellH;
  const sx=(skin%4)*cw,sy=Math.floor(skin/4)*ch;
  const scale=FIGHTER_W/cw;
  const drawH=ch*scale;
  const pivotX=source.fighterPivotX*scale;
  const pivotY=source.fighterPivotY*scale;
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(dx,dy+bob);ctx.rotate(rot);
  ctx.drawImage(source.fighters,sx,sy,cw,ch,-pivotX,-pivotY,FIGHTER_W,drawH);
  ctx.restore();return true;
}
function floor(){
  ctx.fillStyle='#56616b';ctx.fillRect(0,0,W,H);
  if(source){
    const cell=96;
    let row=0;
    for(let y=0;y<H;y+=cell,row++){
      let col=0;
      for(let x=0;x<W;x+=cell,col++) tile((col+row*3)%4,x+cell/2,y+cell/2,cell+1,cell+1);
    }
    ctx.fillStyle='rgba(8,11,15,.12)';ctx.fillRect(0,0,W,H);
    for(let i=0;i<obstacles.length;i++){
      const o=obstacles[i],ratio=o.w/o.h,asset=ratio>1.55?4:ratio<.75?5:(i%2?6:7);
      ctx.save();ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=7;ctx.shadowOffsetY=4;
      tile(asset,o.x+o.w/2,o.y+o.h/2,o.w,o.h);ctx.restore();
    }
    tile(14,35,744,52,52);tile(15,503,744,55,55);
  }else{
    ctx.fillStyle='#172636';for(const o of obstacles) ctx.fillRect(o.x,o.y,o.w,o.h);
  }
}
function drawZone(){
  ctx.save();ctx.fillStyle='rgba(207,18,35,.30)';ctx.beginPath();ctx.rect(0,0,W,H);
  ctx.arc(W/2,H/2,state.zoneR,0,Math.PI*2,true);ctx.fill('evenodd');
  ctx.strokeStyle='rgba(255,72,45,.96)';ctx.shadowColor='#ff341f';ctx.shadowBlur=16;ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(W/2,H/2,state.zoneR,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function pickupTileIndex(kind){ if(kind===3)return 11;if(kind===4)return 12;if(kind===5)return 13;return 8; }
function drawPickup(a){
  if(!a.up)return;
  const pulse=1+Math.sin(performance.now()/180+a.x)*.08,index=pickupTileIndex(a.k);
  ctx.save();ctx.shadowColor=a.k===3?'#61ff83':a.k===4?'#ffda42':a.k===5?'#ff9d31':'#44c8ff';ctx.shadowBlur=12;
  const ok=tile(index,a.x,a.y,38*pulse,38*pulse);ctx.restore();
  if(!ok){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(a.x,a.y,8,0,Math.PI*2);ctx.fill();}
}
function drawPlayer(p){
  const bodyRot=p.a-Math.PI/2;
  const moving=Math.hypot(p.vx,p.vy)>12;
  const bob=moving?Math.sin(state.time*11+p.walkPhase)*1.0:0;

  ctx.save();ctx.translate(p.x,p.y+5);ctx.fillStyle='rgba(0,0,0,.34)';
  ctx.beginPath();ctx.ellipse(0,0,20,9,0,0,Math.PI*2);ctx.fill();
  if(p.shield>0){ctx.strokeStyle='rgba(83,198,255,.78)';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,-4,27,0,Math.PI*2);ctx.stroke();}
  ctx.restore();

  const alpha=p.alive?1:.22;
  const drawn=fighterSprite(p.skin,p.x,p.y,bodyRot,alpha,bob);
  if(!drawn){
    ctx.globalAlpha=alpha;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,18,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.stroke();ctx.globalAlpha=1;
  }

  if(p.alive&&p.flash>0){
    const mx=p.x+Math.cos(p.a)*47,my=p.y+Math.sin(p.a)*47;
    ctx.save();ctx.fillStyle='#fff5b8';ctx.shadowColor='#ffb52e';ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(mx,my,5,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  ctx.textAlign='center';ctx.font='800 11px system-ui';ctx.lineWidth=4;ctx.strokeStyle='rgba(0,0,0,.92)';
  ctx.strokeText(p.name,p.x,p.y-43);ctx.fillStyle=p.color;ctx.fillText(p.name,p.x,p.y-43);
  if(p.alive){
    const w=50,h=6,x=p.x-w/2,y=p.y-35;ctx.fillStyle='#0c0d0f';ctx.fillRect(x,y,w,h);
    ctx.fillStyle=p.hp/p.max>.35?'#64ee62':'#ff4c49';ctx.fillRect(x+1,y+1,(w-2)*clamp(p.hp/p.max,0,1),h-2);
  }
}
function render(){
  floor();for(const a of state.pickups)drawPickup(a);drawZone();
  for(const b of state.bullets){ctx.strokeStyle=b.color;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.025,b.y-b.vy*.025);ctx.stroke();}
  for(const p of state.players)drawPlayer(p);
  for(const f of state.fx){ctx.globalAlpha=clamp(f.life/f.max,0,1);ctx.fillStyle=f.color;ctx.fillRect(f.x-1.5,f.y-1.5,3,3);}ctx.globalAlpha=1;
}
function syncUI(){
  const alive=state.players.filter(p=>p.alive);ui.alive.textContent=alive.length;
  const m=Math.floor(state.zoneT/60),s=Math.floor(state.zoneT%60);ui.timer.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  ui.queue.textContent=state.queue.length;
  const top=[...state.players].sort((a,b)=>(b.kills*100+b.score+b.hp)-(a.kills*100+a.score+a.hp)).slice(0,3);
  ui.board.innerHTML=top.map((p,i)=>`<li><span class="rank">${i+1}</span><span class="name">${p.name}</span><span class="kills">☠ ${p.kills}</span></li>`).join('');
  ui.feed.innerHTML=state.feed.map(x=>`<div class="kill-line">${x}</div>`).join('');ui.wait.hidden=state.players.length>0;
}
function finish(w){
  if(state.ended)return;state.ended=true;state.bullets.length=0;ui.bk.textContent='WINNER';ui.bn.textContent=w?.name||'—';ui.banner.hidden=false;
  setTimeout(nextRound,5200);
}
function nextRound(){
  const roster=[...state.players.map(p=>({key:p.key,name:p.name,payload:{userId:p.key,username:p.name}})),...state.queue];
  state.players=[];state.queue=[];state.feed=[];state.time=0;state.zoneT=96;state.zoneR=355;state.ended=false;state.round++;ui.banner.hidden=true;
  spawnPickups();for(const q of roster.slice(0,MAX))add(q.payload);for(const q of roster.slice(MAX))state.queue.push(q);syncUI();
}
function frame(now){
  const dt=Math.min(.033,(now-state.last)/1000||.016);state.last=now;update(dt);render();
  if(now-state.lastUI>200){state.lastUI=now;syncUI();}requestAnimationFrame(frame);
}
function demoSeed(){
  ui.mode.textContent='DEMO';ui.mode.classList.add('demo');ui.demo.hidden=false;
  for(let i=0;i<12;i++)add({userId:`demo:${i}`,username:names[i]});
  ui.demo.addEventListener('click',e=>{
    const t=e.target.closest('button[data-demo]');if(!t)return;
    const alive=state.players.filter(x=>x.alive),p=alive[(Math.random()*Math.max(1,alive.length))|0],type=t.dataset.demo;
    if(type==='join')add({userId:`demo:${Date.now()}`,username:names[(idSeed-1)%names.length]+idSeed});
    else if(type==='rose')event('gift',{userId:p?.key,username:p?.name,giftName:'Rose',diamondCount:1});
    else if(type==='gift')event('gift',{userId:p?.key,username:p?.name,giftName:'Power Gift',diamondCount:120});
    else event(type,{userId:p?.key,username:p?.name,count:25});
  });
}
function failAssetBoot(error){
  console.error('[LIVE DROPZONE] v0.3.3 complete prefab boot failed',error);
  const h2=ui.wait?.querySelector('h2'),p=ui.wait?.querySelector('p');
  if(h2)h2.textContent='ERRORE PREFAB';if(p)p.textContent='ricarica la pagina';render();
}
function boot(a){
  if(started)return;started=true;source=a;spawnPickups();if(DEMO)demoSeed();syncUI();
  window.LiveDropzone=Object.freeze({state,add,event,finish,nextRound,assetMode:'complete-prefab-atlas-v033'});
  requestAnimationFrame(frame);
}
if(window.LiveDropzoneSourceReady) window.LiveDropzoneSourceReady.then(boot).catch(failAssetBoot);
else failAssetBoot(new Error('asset-loader-v033.js non caricato'));
})();
