const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
ctx.imageSmoothingEnabled = false;

const ui = {
  active: document.querySelector("#activeCount"),
  kos: document.querySelector("#koCount"),
  ranking: document.querySelector("#rankingRows"),
  feed: document.querySelector("#feedRows"),
  loading: document.querySelector("#loading"),
  testPanel: document.querySelector("#testPanel"),
  testToggle: document.querySelector("#testToggle"),
  testName: document.querySelector("#testName"),
};

const DIRS = ["N","NW","W","SW","S","SE","E","NE"];
const ANIMS = {
  idle:   { file:"./assets/idle.webp",   cols:4, cellW:112, cellH:112, fps:4,  loop:true },
  walk:   { file:"./assets/walk.webp",   cols:6, cellW:112, cellH:112, fps:8,  loop:true },
  attack: { file:"./assets/attack.webp", cols:6, cellW:112, cellH:112, fps:10, loop:false },
  hit:    { file:"./assets/hit.webp",    cols:3, cellW:112, cellH:112, fps:12, loop:false },
  dead:   { file:"./assets/dead.webp",   cols:6, cellW:112, cellH:112, fps:9,  loop:false },
  vfx:    { file:"./assets/vfx.webp",    cols:5, cellW:128, cellH:112, fps:12, loop:false },
};

const images = {};
const arena = { half: 7.6, tileW: 70, tileH: 35, centerX: 0, centerY: 0, scale: 1, totalKOs: 0, tick: 0 };
const fighters = new Map();
const particles = [];
const floatingText = [];
const feedLines = [];
const palette = ["#49cfff","#ff6f7d","#ffd15c","#79e37f","#c784ff","#ff9b55","#59f0da","#ff7fd1","#a6e85c","#70a7ff"];
let nextColor = 0;
let lastTs = performance.now();
let uiTimer = 0;
let autoDemoTimer = 1.5;
let audioCtx = null;

function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function tone(freq=220, dur=.05, gain=.035, type="square"){
  try{ ensureAudio(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(gain,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur); }catch{}
}
function addFeed(html){ feedLines.unshift(html); feedLines.length=Math.min(feedLines.length,5); ui.feed.innerHTML=feedLines.map(x=>`<div class="feed-row">${x}</div>`).join(""); }
function cleanName(v){ return String(v||"Viewer").replace(/[<>&"']/g,"").trim().slice(0,16)||"Viewer"; }
function idFromName(name){ return `viewer:${name.toLowerCase().replace(/\s+/g,"-")}`; }

function spawnFighter({ userId, username, color }){
  const id=userId||idFromName(username), existing=fighters.get(id);
  if(existing){ if(existing.dead){ existing.respawnTimer=0; revive(existing); } return existing; }
  if(fighters.size>=32){ const oldestDead=[...fighters.values()].find(f=>f.dead&&f.respawnTimer>2); if(oldestDead) fighters.delete(oldestDead.id); else return null; }
  const a=Math.random()*Math.PI*2, r=3.2+Math.random()*3.7;
  const f={id,name:cleanName(username),color:color||palette[nextColor++%palette.length],x:Math.cos(a)*r,y:Math.sin(a)*r,vx:0,vy:0,dir:4,state:"idle",stateTime:Math.random(),animTime:Math.random(),hp:100,maxHp:100,attack:13,defense:2.5,speed:1.12,range:.88,attackCooldown:Math.random()*.8,attackRate:1.12,crit:.08,level:1,evolution:0,gifts:0,likes:0,kills:0,deaths:0,targetId:null,attackHit:false,dead:false,respawnTimer:0,invuln:1.15,flash:0,glow:0,spawnFx:1};
  fighters.set(id,f); addFeed(`<b>${f.name}</b> entered the arena`); burst(f.x,f.y,f.color,18,1.3); tone(540,.07,.025,"triangle"); return f;
}
function revive(f){ const a=Math.random()*Math.PI*2,r=3.5+Math.random()*3.5; f.x=Math.cos(a)*r;f.y=Math.sin(a)*r;f.hp=f.maxHp;f.dead=false;f.respawnTimer=0;f.state="idle";f.stateTime=0;f.attackCooldown=.75;f.invuln=1.5;f.targetId=null;f.spawnFx=1;burst(f.x,f.y,f.color,16,1.25); }

function applyLike(payload={}){
  const id=payload.userId||idFromName(cleanName(payload.username)); const f=fighters.get(id)||spawnFighter({userId:id,username:payload.username||"Viewer"}); if(!f||f.dead)return;
  const count=Math.max(1,Number(payload.count||1)),heal=Math.min(25,2.5*count),before=f.hp; f.hp=Math.min(f.maxHp,f.hp+heal);f.likes+=count;f.glow=.35;
  if(f.hp>before){ floatingText.push({x:f.x,y:f.y,z:54,text:`+${Math.round(f.hp-before)} HP`,color:"#66f5a0",life:1});burst(f.x,f.y,"#69f7a9",5,.5);tone(700,.04,.015,"sine"); }
}
function applyGift(payload={},tier="small"){
  const id=payload.userId||idFromName(cleanName(payload.username)); const f=fighters.get(id)||spawnFighter({userId:id,username:payload.username||"Viewer"}); if(!f)return;
  const mult=tier==="large"?4:tier==="medium"?2:1; f.gifts+=mult;f.level+=mult;f.evolution=Math.min(4,Math.floor(f.gifts/3));f.maxHp+=12*mult;f.hp=Math.min(f.maxHp,f.hp+35*mult);f.attack+=2.6*mult;f.defense+=.55*mult;f.speed=Math.min(1.75,f.speed+.035*mult);f.attackRate=Math.min(1.75,f.attackRate+.035*mult);f.crit=Math.min(.35,f.crit+.012*mult);f.glow=1.5;
  const label=tier==="large"?"ASCENDED":tier==="medium"?"EVOLVED":"POWER UP"; floatingText.push({x:f.x,y:f.y,z:74,text:`${label} · LV ${f.level}`,color:"#ffd866",life:1.6});burst(f.x,f.y,"#ffd35b",20+mult*5,1.6);addFeed(`<b>${f.name}</b> ${label.toLowerCase()} → Lv.${f.level}`);tone(tier==="large"?880:660,.12,.035,"triangle");
}
function eventEmit(type,payload={}){ if(type==="join"||type==="enter"||type==="viewerEnter")return spawnFighter(payload); if(type==="like")return applyLike(payload); if(type==="gift"||type==="giftSmall")return applyGift(payload,payload.tier||"small"); if(type==="giftMedium")return applyGift(payload,"medium"); if(type==="giftLarge")return applyGift(payload,"large"); }
window.ArenaLiveBridge={emit:eventEmit,fighters,version:"1.0.0"}; window.dispatchArenaLiveEvent=eventEmit;

function nearestEnemy(f){ let best=null,bestD=1e9; for(const o of fighters.values()){if(o===f||o.dead)continue;const dx=o.x-f.x,dy=o.y-f.y,d=dx*dx+dy*dy;if(d<bestD){best=o;bestD=d;}} return best; }
function setState(f,state){ if(f.state===state)return;f.state=state;f.stateTime=0;f.animTime=0;if(state==="attack")f.attackHit=false; }
function damage(attacker,target){
  if(!target||target.dead||target.invuln>0)return; let dmg=Math.max(1,attacker.attack-target.defense*.55),crit=Math.random()<attacker.crit;if(crit)dmg*=1.7;dmg*=.88+Math.random()*.24;target.hp-=dmg;target.flash=.18;target.glow=.15;floatingText.push({x:target.x,y:target.y,z:60,text:`-${Math.round(dmg)}${crit?"!":""}`,color:crit?"#ffe267":"#ff7e7e",life:.75});burst(target.x,target.y,crit?"#ffd94e":"#ff7d64",crit?12:6,.65);tone(crit?130:175,.04,.018,"square");
  if(target.hp<=0){target.hp=0;target.dead=true;target.deaths++;setState(target,"dead");target.respawnTimer=5.5;attacker.kills++;arena.totalKOs++;attacker.hp=Math.min(attacker.maxHp,attacker.hp+8);addFeed(`<b>${attacker.name}</b> defeated <b>${target.name}</b>`);burst(target.x,target.y,"#e8eef3",18,1.4);}else setState(target,"hit");
}
function updateFighter(f,dt){
  f.stateTime+=dt;f.animTime+=dt;f.attackCooldown=Math.max(0,f.attackCooldown-dt);f.invuln=Math.max(0,f.invuln-dt);f.flash=Math.max(0,f.flash-dt);f.glow=Math.max(0,f.glow-dt);f.spawnFx=Math.max(0,f.spawnFx-dt);
  if(f.dead){f.respawnTimer-=dt;const deadDur=ANIMS.dead.cols/ANIMS.dead.fps;if(f.stateTime>deadDur)f.stateTime=deadDur;if(f.respawnTimer<=0)revive(f);return;}
  if(f.state==="hit"){if(f.stateTime>=ANIMS.hit.cols/ANIMS.hit.fps)setState(f,"idle");return;}
  if(f.state==="attack"){const p=f.stateTime*ANIMS.attack.fps;if(!f.attackHit&&p>=3){f.attackHit=true;const t=fighters.get(f.targetId);if(t&&!t.dead){const dx=t.x-f.x,dy=t.y-f.y;if(Math.hypot(dx,dy)<f.range+.5)damage(f,t);}}if(f.stateTime>=ANIMS.attack.cols/ANIMS.attack.fps){f.attackCooldown=1/f.attackRate;setState(f,"idle");}return;}
  let target=fighters.get(f.targetId);if(!target||target.dead){target=nearestEnemy(f);f.targetId=target?.id||null;}if(!target){setState(f,"idle");return;}
  const dx=target.x-f.x,dy=target.y-f.y,dist=Math.hypot(dx,dy)||.001,screenDX=dx-dy,screenDY=(dx+dy)*.5;f.dir=directionIndex(screenDX,screenDY);
  if(dist>f.range){setState(f,"walk");const sp=f.speed;f.vx=(dx/dist)*sp;f.vy=(dy/dist)*sp;f.x+=f.vx*dt;f.y+=f.vy*dt;}else{f.vx=f.vy=0;if(f.attackCooldown<=0){setState(f,"attack");tone(240,.035,.012,"square");}else setState(f,"idle");}
  for(const o of fighters.values()){if(o===f||o.dead)continue;const sx=f.x-o.x,sy=f.y-o.y,d2=sx*sx+sy*sy;if(d2>0&&d2<.34*.34){const d=Math.sqrt(d2),push=(.34-d)*.35;f.x+=(sx/d)*push*dt*5;f.y+=(sy/d)*push*dt*5;}}
  const m=Math.max(Math.abs(f.x),Math.abs(f.y));if(m>arena.half){const k=arena.half/m;f.x*=k;f.y*=k;}
}
function directionIndex(dx,dy){const a=Math.atan2(dy,dx),oct=Math.round(a/(Math.PI/4)),map={0:6,1:5,2:4,3:3,4:2,"-4":2,"-3":1,"-2":0,"-1":7};return map[oct]??4;}

function resize(){const dpr=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";ctx.setTransform(dpr,0,0,dpr,0,0);arena.scale=Math.min(w/860,h/1430);arena.tileW=76*arena.scale;arena.tileH=38*arena.scale;arena.centerX=w/2;arena.centerY=h*.48;}
addEventListener("resize",resize);resize();
function worldToScreen(x,y,z=0){return{x:arena.centerX+(x-y)*arena.tileW/2,y:arena.centerY+(x+y)*arena.tileH/2-z*arena.scale};}
function poly(points,fill,stroke=null,lw=1){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
function drawArena(){
  const s=arena.scale;ctx.fillStyle="#071018";ctx.fillRect(0,0,innerWidth,innerHeight);const g=ctx.createRadialGradient(arena.centerX,arena.centerY,20,arena.centerX,arena.centerY,Math.min(innerWidth,innerHeight)*.7);g.addColorStop(0,"rgba(41,97,92,.24)");g.addColorStop(1,"rgba(5,9,14,0)");ctx.fillStyle=g;ctx.fillRect(0,0,innerWidth,innerHeight);
  const corners=[worldToScreen(-8,-8),worldToScreen(8,-8),worldToScreen(8,8),worldToScreen(-8,8)],down=corners.map(p=>({x:p.x,y:p.y+28*s}));poly([corners[1],corners[2],down[2],down[1]],"#27343b","#10191f",1);poly([corners[2],corners[3],down[3],down[2]],"#1c2930","#10191f",1);
  for(let yy=-8;yy<8;yy++)for(let xx=-8;xx<8;xx++){const p0=worldToScreen(xx,yy),p1=worldToScreen(xx+1,yy),p2=worldToScreen(xx+1,yy+1),p3=worldToScreen(xx,yy+1),edge=Math.max(Math.abs(xx+.5),Math.abs(yy+.5))>6.7,checker=(xx+yy)&1,fill=edge?(checker?"#354449":"#304046"):(checker?"#486157":"#40584f");poly([p0,p1,p2,p3],fill,"rgba(10,22,25,.45)",Math.max(.5,s*.65));if(!edge&&((xx*17+yy*31)%29===0)){const c=worldToScreen(xx+.5,yy+.5);ctx.fillStyle="rgba(199,214,176,.12)";ctx.beginPath();ctx.ellipse(c.x,c.y,8*s,3*s,0,0,Math.PI*2);ctx.fill();}}
  const c=worldToScreen(0,0);ctx.save();ctx.translate(c.x,c.y);ctx.scale(1,.5);ctx.strokeStyle="rgba(119,214,218,.23)";ctx.lineWidth=2*s;ctx.beginPath();ctx.arc(0,0,132*s,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="rgba(239,205,100,.16)";ctx.beginPath();ctx.arc(0,0,94*s,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*72*s,Math.sin(a)*72*s);ctx.lineTo(Math.cos(a)*120*s,Math.sin(a)*120*s);ctx.stroke();}ctx.restore();[[-7,-7],[7,-7],[-7,7],[7,7]].forEach(([x,y])=>drawPillar(x,y));
}
function drawPillar(x,y){const p=worldToScreen(x,y),s=arena.scale;ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(p.x,p.y+8*s,24*s,8*s,0,0,Math.PI*2);ctx.fill();poly([{x:p.x-13*s,y:p.y},{x:p.x,y:p.y-7*s},{x:p.x+13*s,y:p.y},{x:p.x,y:p.y+7*s}],"#596168");ctx.fillStyle="#384047";ctx.fillRect(p.x-9*s,p.y-33*s,18*s,34*s);ctx.fillStyle="#727a7f";ctx.fillRect(p.x-9*s,p.y-33*s,18*s,5*s);const flameY=p.y-41*s;ctx.fillStyle="rgba(255,177,54,.16)";ctx.beginPath();ctx.arc(p.x,flameY,23*s,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffb43f";ctx.beginPath();ctx.moveTo(p.x,flameY-14*s);ctx.quadraticCurveTo(p.x+10*s,flameY,p.x,flameY+8*s);ctx.quadraticCurveTo(p.x-9*s,flameY,p.x,flameY-14*s);ctx.fill();ctx.fillStyle="#ffe27b";ctx.beginPath();ctx.arc(p.x,flameY,4*s,0,Math.PI*2);ctx.fill();}
function frameFor(f,anim){const a=ANIMS[anim];let i=Math.floor(f.animTime*a.fps);if(a.loop)i%=a.cols;else i=Math.min(a.cols-1,i);return i;}
function drawFighter(f){
  const p=worldToScreen(f.x,f.y),s=arena.scale,shadowScale=f.dead?.78:1;ctx.fillStyle="rgba(0,0,0,.34)";ctx.beginPath();ctx.ellipse(p.x,p.y+8*s,34*s*shadowScale,11*s*shadowScale,0,0,Math.PI*2);ctx.fill();if(f.invuln>0&&Math.floor(f.invuln*12)%2===0)ctx.globalAlpha=.55;
  if(f.evolution>0||f.glow>0){const r=(27+f.evolution*5)*s,ag=ctx.createRadialGradient(p.x,p.y-35*s,2,p.x,p.y-35*s,r);ag.addColorStop(0,f.evolution>=3?"rgba(255,217,91,.20)":"rgba(86,212,255,.18)");ag.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=ag;ctx.beginPath();ctx.arc(p.x,p.y-35*s,r,0,Math.PI*2);ctx.fill();}
  const anim=f.state,a=ANIMS[anim],im=images[anim];if(im){const fi=frameFor(f,anim),srcX=fi*a.cellW,srcY=f.dir*a.cellH,drawSize=136*s*(1+f.evolution*.025),ratio=a.cellH/a.cellW,dw=drawSize,dh=drawSize*ratio;ctx.drawImage(im,srcX,srcY,a.cellW,a.cellH,p.x-dw/2,p.y-dh+25*s,dw,dh);}ctx.globalAlpha=1;if(f.state==="attack"){const impactFrame=frameFor(f,"attack");if(impactFrame>=2&&impactFrame<=4)drawAttackVfx(f,p,impactFrame-2);}if(!f.dead)drawNameplate(f,p);else if(f.respawnTimer>0){ctx.font=`${Math.max(8,9*s)}px system-ui`;ctx.textAlign="center";ctx.fillStyle="rgba(225,235,240,.65)";ctx.fillText(`respawn ${Math.ceil(f.respawnTimer)}`,p.x,p.y+24*s);}
}
function drawAttackVfx(f,p,phase){const a=ANIMS.vfx,im=images.vfx;if(!im)return;const fi=Math.min(a.cols-1,phase+1),size=150*arena.scale;ctx.globalAlpha=.78;ctx.drawImage(im,fi*a.cellW,f.dir*a.cellH,a.cellW,a.cellH,p.x-size/2,p.y-size*.72,size,size*(a.cellH/a.cellW));ctx.globalAlpha=1;}
function drawNameplate(f,p){const s=arena.scale,y=p.y-116*s,width=Math.min(104,66+f.name.length*3.7)*s;ctx.textAlign="center";ctx.font=`800 ${Math.max(8,10*s)}px system-ui`;ctx.fillStyle="rgba(5,10,15,.82)";roundRect(p.x-width/2,y-19*s,width,15*s,6*s);ctx.fill();ctx.fillStyle="#fff";ctx.fillText(f.name,p.x,y-8*s);const bw=74*s,bh=6*s,bx=p.x-bw/2,by=y-1*s;ctx.fillStyle="rgba(0,0,0,.7)";roundRect(bx,by,bw,bh,3*s);ctx.fill();const hpw=bw*Math.max(0,f.hp/f.maxHp),col=f.hp/f.maxHp>.55?"#55dc7b":f.hp/f.maxHp>.25?"#ffd156":"#ff5d67";ctx.fillStyle=col;if(hpw>0){roundRect(bx,by,hpw,bh,3*s);ctx.fill();}if(f.level>1){ctx.textAlign="left";ctx.font=`800 ${Math.max(7,8*s)}px system-ui`;ctx.fillStyle="#ffe06c";ctx.fillText(`Lv${f.level}`,bx,by+15*s);}}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function burst(x,y,color,count=8,power=1){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,sp=(.35+Math.random())*power;particles.push({x,y,z:18+Math.random()*25,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,vz:15+Math.random()*24,life:.4+Math.random()*.55,color,size:1.5+Math.random()*2.5});}}
function updateFx(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=44*dt;if(p.life<=0)particles.splice(i,1);}for(let i=floatingText.length-1;i>=0;i--){const t=floatingText[i];t.life-=dt;t.z+=18*dt;if(t.life<=0)floatingText.splice(i,1);}}
function drawFx(){for(const p of particles){const q=worldToScreen(p.x,p.y,p.z);ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(q.x,q.y,p.size*arena.scale,p.size*arena.scale);}ctx.globalAlpha=1;for(const t of floatingText){const q=worldToScreen(t.x,t.y,t.z);ctx.globalAlpha=Math.min(1,t.life*2);ctx.textAlign="center";ctx.font=`900 ${Math.max(10,12*arena.scale)}px system-ui`;ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillText(t.text,q.x+1,q.y+1);ctx.fillStyle=t.color;ctx.fillText(t.text,q.x,q.y);}ctx.globalAlpha=1;}
function updateUI(){const alive=[...fighters.values()].filter(f=>!f.dead);ui.active.textContent=alive.length;ui.kos.textContent=arena.totalKOs;const ranked=[...fighters.values()].sort((a,b)=>(b.kills*10+b.level)-(a.kills*10+a.level)).slice(0,5);ui.ranking.innerHTML=ranked.map((f,i)=>`<div class="rank-row"><span class="rank-num">${i+1}</span><span class="rank-name">${f.name} <small style="color:${f.color}">◆</small></span><span class="rank-kills">${f.kills} KO</span></div>`).join("");}
function demoJoin(){const demoNames=["Nova","Mika","Leo","Ari","Kira","Nico","Luna","Teo","Maya","Rex","Ivy","Zed","Sora","Kai","Vale","Nox"],available=demoNames.filter(n=>!fighters.has(idFromName(n)));if(!available.length)return;const n=available[Math.floor(Math.random()*available.length)];spawnFighter({username:n,userId:idFromName(n)});}
function update(dt){arena.tick+=dt;for(const f of fighters.values())updateFighter(f,dt);updateFx(dt);autoDemoTimer-=dt;if(autoDemoTimer<=0&&fighters.size<10){demoJoin();autoDemoTimer=1.25+Math.random()*1.5;}uiTimer-=dt;if(uiTimer<=0){updateUI();uiTimer=.25;}}
function render(){drawArena();const ordered=[...fighters.values()].sort((a,b)=>worldToScreen(a.x,a.y).y-worldToScreen(b.x,b.y).y);for(const f of ordered)drawFighter(f);drawFx();}
function loop(ts){const dt=Math.min(.033,(ts-lastTs)/1000||.016);lastTs=ts;update(dt);render();requestAnimationFrame(loop);}
async function preload(){await Promise.all(Object.entries(ANIMS).map(([key,a])=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[key]=im;resolve();};im.onerror=reject;im.src=a.file;})));ui.loading.classList.add("done");setTimeout(()=>ui.loading.remove(),450);["Astra","Blaze","Rune","Vex"].forEach((name,i)=>setTimeout(()=>spawnFighter({username:name,userId:idFromName(name)}),i*160));requestAnimationFrame(loop);}
preload().catch(err=>{console.error(err);ui.loading.querySelector("span").textContent="Asset load error — refresh";});
ui.testToggle.addEventListener("click",()=>ui.testPanel.classList.toggle("hidden"));document.querySelectorAll("[data-event]").forEach(btn=>btn.addEventListener("click",()=>{const type=btn.dataset.event,name=cleanName(ui.testName.value);eventEmit(type,{username:name,userId:idFromName(name),count:type==="like"?8:1});}));addEventListener("pointerdown",()=>{try{ensureAudio();audioCtx?.resume();}catch{}},{once:true});