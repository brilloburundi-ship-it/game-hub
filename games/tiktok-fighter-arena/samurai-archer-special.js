import{S,clamp}from'./core.js?v=1.4.0';

const VERSION='1.0.0';
const DEFS={
  lightning:{url:'./assets/vfx/lightning-bolt.b64',frameW:128,frameH:64,frames:4,fps:24},
  slash:{url:'./assets/vfx/sword-slash.b64',frameW:96,frameH:96,frames:7,fps:22},
  thunder:{url:'./assets/vfx/thunder-ultimate.b64',frameW:128,frameH:128,frames:6,fps:24}
};
const images=new Map(),effects=[],tracked=new WeakMap();
const groundY=()=>S.h*(S.w<600?.70:.75);
const attacking=s=>/^attack\d+$/.test(s||'')||s==='special'||s==='dash';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function imageFromBase64(data){return new Promise((ok,no)=>{const im=new Image();im.decoding='async';im.onload=()=>ok(im);im.onerror=no;im.src=`data:image/png;base64,${data}`})}
async function preload(){
  await Promise.all(Object.entries(DEFS).map(async([key,d])=>{
    try{const r=await fetch(`${d.url}?v=${VERSION}`,{cache:'force-cache'});if(!r.ok)throw Error(`${r.status}`);images.set(key,await imageFromBase64((await r.text()).trim()))}
    catch(e){console.warn('[Samurai Archer Special] VFX missing',key,e)}
  }));
}
function spawn(key,x,y,scale=1,flipX=false,extra={}){const d=DEFS[key];if(!d||!images.has(key))return;effects.push({key,x,y,scale,flipX,age:0,duration:d.frames/d.fps,...extra});if(effects.length>32)effects.splice(0,effects.length-32)}
function projectile(a,b,delay=0,offsetY=0){
  if(!a||!b||!images.has('lightning'))return;
  setTimeout(()=>{
    if(!S.started||a.dead)return;
    const y=groundY()-82+offsetY,dur=Math.max(.16,Math.min(.34,Math.abs(b.x-a.x)/900+.16));
    effects.push({key:'lightning',x:a.x,y,scale:.58,flipX:a.side===1,age:0,duration:dur,fromX:a.x,toX:b.x,fromY:y,toY:y,moving:true,fade:true});
  },delay);
}
function play(group){try{void window.FighterArenaCombatAudio?.test?.(group)}catch{}}
function archerAttackStart(r,e){
  if(!e)return;
  const flip=r.side===1;
  if(r.state==='attack1'){
    S.fx?.sheet?.('sparkGb',r.x,groundY()-84,1.65,flip);
    projectile(r,e,0,-4);projectile(r,e,90,8);
    play('stab');
  }else if(r.state==='attack2'){
    spawn('slash',r.x+(flip?-18:18),groundY()-82,1.22,flip);
    S.fx?.sheet?.('slashGb',r.x+(flip?-14:14),groundY()-78,1.9,flip);
    play('swordSwing');
  }else if(r.state==='attack3'||r.state==='special'||r.comboStrike){
    spawn('slash',r.x+(flip?-20:20),groundY()-84,1.45,flip);
    S.fx?.sheet?.('sparkGb',r.x,groundY()-86,2.25,flip);
    projectile(r,e,0,0);
    play('swordSwing');play('magicCast');
  }
}
function archerHit(r,e){
  if(!e)return;
  const flip=r.side===1,strong=r.state==='attack3'||r.state==='special'||r.comboStrike;
  if(r.state==='attack2'){
    spawn('slash',e.x,groundY()-80,1.4,flip);
    S.fx?.sheet?.('impactGb',e.x,groundY()-78,2.25,flip);
    play('swordImpact');
  }else if(strong){
    spawn('slash',e.x,groundY()-82,1.65,flip);
    spawn('thunder',e.x,groundY()-112,1.08,flip,{alpha:.96});
    S.fx?.sheet?.('sparkGb',e.x,groundY()-80,2.8,flip);
    S.fx?.flash?.(.16);
    play('swordImpact');play('magicImpact');
  }else{
    S.fx?.sheet?.('spark',e.x,groundY()-78,1.75,flip);
    play('stab');
  }
}
function monkAttackStart(r){
  if(r.fighterId!=='street_mon')return;
  play(r.state==='attack2'||r.comboStrike?'swordSwing':'stab');
}
function monkHit(r){
  if(r.fighterId!=='street_mon')return;
  play(r.state==='attack2'||r.comboStrike?'swordImpact':'stab');
  S.fx?.sheet?.(r.comboStrike?'impactGb':'impact',r.x+(r.side===0?34:-34),groundY()-74,r.comboStrike?2.0:1.55,r.side===1);
}
function inspect(r,e){
  if(!r)return;
  let t=tracked.get(r);if(!t){t={state:r.state,time:r.time||0,hit:!!r.hit};tracked.set(r,t)}
  const restarted=r.state===t.state&&(r.time||0)+.02<t.time;
  const entered=attacking(r.state)&&(!attacking(t.state)||r.state!==t.state||restarted);
  if(entered&&!r.dead){
    if(r.fighterId==='samurai_archer')archerAttackStart(r,e);
    else if(r.fighterId==='street_mon')monkAttackStart(r);
  }
  if(r.hit&&!t.hit&&!r.dead){
    if(r.fighterId==='samurai_archer')archerHit(r,e);
    else if(r.fighterId==='street_mon')monkHit(r);
  }
  t.state=r.state;t.time=r.time||0;t.hit=!!r.hit;
}
function update(dt){
  const[a,b]=S.active||[];inspect(a,b);inspect(b,a);
  for(const f of effects){f.age+=dt;if(f.moving){const q=clamp(f.age/f.duration,0,1);f.x=f.fromX+(f.toX-f.fromX)*q;f.y=f.fromY+(f.toY-f.fromY)*q-Math.sin(q*Math.PI)*10}}
  for(let i=effects.length-1;i>=0;i--)if(effects[i].age>=effects[i].duration)effects.splice(i,1);
}
function draw(ctx){
  for(const f of effects){const d=DEFS[f.key],im=images.get(f.key);if(!d||!im)continue;const q=clamp(f.age/f.duration,0,1),fr=Math.min(d.frames-1,Math.floor(q*d.frames)),w=d.frameW*f.scale,h=d.frameH*f.scale;ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=(f.alpha??1)*(f.fade?Math.max(0,1-q):1);ctx.translate(f.x,f.y);if(f.flipX)ctx.scale(-1,1);ctx.drawImage(im,0,fr*d.frameH,d.frameW,d.frameH,-w/2,-h/2,w,h);ctx.restore()}
}
async function install(){
  await preload();
  const canvas=document.querySelector('#game');if(!canvas)return;
  const ctx=canvas.getContext('2d');let last=performance.now();
  function loop(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;if(S.started){update(dt);draw(ctx)}requestAnimationFrame(loop)}
  requestAnimationFrame(loop);
  window.__samuraiArcherSpecial={version:VERSION,loaded:[...images.keys()],streetMonkAudio:true,combo:['double-electric-arrow','blade-slash','electric-blade']};
}
install().catch(e=>console.warn('[Samurai Archer Special] disabled',e));