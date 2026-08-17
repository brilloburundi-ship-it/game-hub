export const S={
  manifest:null,images:new Map(),viewers:new Map(),queue:[],active:[null,null],
  fightNo:0,arenaIndex:0,round:'waiting',clock:0,delay:0,started:false,
  w:innerWidth,h:innerHeight,fx:null,availableFighters:new Set()
};

const R=[
  ['hero_knight','medieval_king','huntress_2','evil_wizard_2'],
  ['huntress','evil_wizard','hero_knight_prime'],
  ['martial_hero','fantasy_warrior','medieval_warrior_2'],
  ['martial_champion','fire_wizard','samurai_archer','wanderer_magician','medieval_warrior_3'],
  ['samurai','samurai_commander','lightning_mage']
];
const STARTER_FIGHTERS=R[0];
const FOLLOW_FIGHTER='samurai_ronin';
const C=['#50ddff','#ff5aa5','#ffd45f','#6fe985','#b987ff','#ff845c','#67f1cf','#8da5ff'];

export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clean=v=>String(v||'Viewer').replace(/[<>&"']/g,'').trim().slice(0,16)||'Viewer';
const uid=n=>`viewer:${clean(n).toLowerCase().replace(/\s+/g,'-')}`;
export const cfg=id=>S.manifest?.fighters?.[id];
export const tierColor=t=>['#8ceaff','#75ef9b','#ffd56b','#c489ff','#ff6ab6'][t]||'#fff';

const say=(t,c)=>S.fx?.toast?.(t,c);
const burst=(x,y,c,n=14,p=1)=>S.fx?.burst?.(x,y,c,n,p);
const tone=(...a)=>S.fx?.tone?.(...a);
const sheet=(...a)=>S.fx?.sheet?.(...a);
const isAvailable=id=>S.availableFighters.size===0||S.availableFighters.has(id);

export function setAvailableFighters(ids=[]){S.availableFighters=new Set(ids)}

function tierPool(t){
  const exact=(R[t]||[]).filter(isAvailable);
  if(exact.length)return exact;
  for(let d=1;d<R.length;d++){
    const low=R[t-d]?.filter(isAvailable)||[];
    if(low.length)return low;
    const high=R[t+d]?.filter(isAvailable)||[];
    if(high.length)return high;
  }
  return [...S.availableFighters];
}

function choose(ids,viewerId){
  const available=ids.filter(isAvailable);
  const used=new Set([
    ...S.active.filter(Boolean).map(r=>r.fighterId),
    ...S.queue.filter(v=>v.id!==viewerId).map(v=>v.fighterId)
  ]);
  const free=available.filter(id=>!used.has(id));
  return pick(free.length?free:available);
}

function statBlock(v,f){
  const g=1+(v.level-1)*.075,roseHp=Math.max(0,Number(v.roseHpBonus||0));
  return{
    hp:f.stats.hp*g+roseHp,
    attack:f.stats.attack*(1+(v.level-1)*.055),
    defense:f.stats.defense*(1+(v.level-1)*.045)
  };
}

const spawnX=side=>S.w*(side?.84:.16);

export function runtime(v,side){
  if(!isAvailable(v.fighterId)){
    const tier=Math.max(0,Number(v.highestTier||0));
    const replacement=tier===0?choose(STARTER_FIGHTERS,v.id):choose(tierPool(tier),v.id);
    if(replacement)v.fighterId=replacement;
  }
  const f=cfg(v.fighterId),st=statBlock(v,f);
  return{
    viewer:v,side,fighterId:v.fighterId,x:spawnX(side),
    hp:st.hp,maxHp:st.hp,attack:st.attack,defense:st.defense,
    speed:f.stats.speed,range:f.stats.range,
    energy:Math.min(100,v.savedEnergy||0),shield:0,
    state:'idle',anim:0,time:0,hit:false,cool:.4,special:3+Math.random(),
    inv:.7,knock:0,flash:0,dead:false,glow:0,airY:0,lastAttack:'',
    doubleQueued:false,comboStrike:false
  };
}

export function createViewer(p={}){
  const name=clean(p.username||p.uniqueId||p.name);
  const id=String(p.userId||p.id||uid(name));
  let v=S.viewers.get(id);
  if(v){
    if(!S.active.some(a=>a?.viewer.id===id)&&!S.queue.some(q=>q.id===id))enqueue(v);
    return v;
  }
  const starter=choose(STARTER_FIGHTERS,id);
  if(!starter)return null;
  v={
    id,name,level:1,fighterId:starter,highestTier:0,wins:0,losses:0,streak:0,
    score:0,likes:0,gifts:0,followed:false,color:C[S.viewers.size%C.length],
    savedEnergy:0,potions:0,roseHpBonus:0
  };
  S.viewers.set(id,v);
  enqueue(v);
  say(`${name} joined the battle queue`,'#8ceaff');
  tone(520,.08,.02,'triangle');
  return v;
}

export function enqueue(v){
  if(!v||S.active.some(a=>a?.viewer.id===v.id)||S.queue.some(q=>q.id===v.id))return;
  S.queue.push(v);
  fillArena();
}

export function fillArena(){
  if(S.round==='fighting'||S.round==='countdown'||S.delay>0)return;
  if(!S.active[0]&&S.queue.length)S.active[0]=runtime(S.queue.shift(),0);
  if(!S.active[1]&&S.queue.length)S.active[1]=runtime(S.queue.shift(),1);
  if(S.active[0]&&S.active[1])startRound();
  else S.round='waiting';
}

function resetRoundRuntime(r,side){
  r.side=side;r.x=spawnX(side);r.state='idle';r.dead=false;r.anim=0;r.time=0;
  r.hit=false;r.inv=.8;r.knock=0;r.flash=0;r.airY=0;r.doubleQueued=false;
  r.comboStrike=false;r.cool=.45;
}

export function startRound(){
  const[a,b]=S.active;
  if(!a||!b)return;
  resetRoundRuntime(a,0);
  resetRoundRuntime(b,1);
  S.round='countdown';S.clock=2.6;S.fightNo++;
  if((S.fightNo-1)%2===0)setArena(Math.floor((S.fightNo-1)/2)%S.manifest.arenas.length);
  say(`${a.viewer.name} VS ${b.viewer.name}`,'#ffd56b');
  tone(410,.08,.022,'square');
}

export function finish(loser,winner){
  if(S.round==='finished')return;
  S.round='finished';S.delay=2.8;
  winner.viewer.wins++;winner.viewer.streak++;
  winner.viewer.score+=100+winner.viewer.streak*20+winner.viewer.level*5;
  loser.viewer.losses++;loser.viewer.streak=0;
  loser.viewer.savedEnergy=Math.floor(loser.energy*.35);
  winner.viewer.savedEnergy=Math.floor(winner.energy*.5);
  say(`${winner.viewer.name} WINS · ${winner.viewer.streak} STREAK`,'#ffd56b');
  burst(winner.x,S.h*.62,'#ffd56b',28,1.8);
  sheet('burst',winner.x,S.h*.59,2.6);
  tone(820,.16,.035,'triangle');
}

export function rotate(){
  const[a,b]=S.active;
  if(!a||!b){S.delay=0;fillArena();return}
  const winner=a.dead?b:a,winSide=winner.side,nextSide=1-winSide,next=S.queue.shift();
  winner.hp=Math.max(1,winner.maxHp*.78);
  winner.energy=Math.min(100,winner.energy+18);
  winner.dead=false;winner.state='idle';winner.anim=0;winner.time=0;winner.hit=false;
  winner.cool=.35;winner.inv=.8;winner.knock=0;winner.flash=0;winner.glow=.35;
  winner.airY=0;winner.doubleQueued=false;winner.comboStrike=false;
  winner.x=spawnX(winSide);
  const slots=[null,null];
  slots[winSide]=winner;
  if(next)slots[nextSide]=runtime(next,nextSide);
  S.active=slots;S.round='waiting';S.delay=0;
  fillArena();
}

export function setArena(i){
  if(!S.manifest)return;
  S.arenaIndex=((i%S.manifest.arenas.length)+S.manifest.arenas.length)%S.manifest.arenas.length;
  S.fx?.arena?.(S.manifest.arenas[S.arenaIndex]);
}

function setFighter(v,id,reason='TRANSFORM'){
  if(!cfg(id)||!isAvailable(id))return;
  const f=cfg(id),t=f.tier;
  if(t<v.highestTier)return;
  v.fighterId=id;
  v.highestTier=Math.max(v.highestTier,t);
  const rt=S.active.find(a=>a?.viewer.id===v.id);
  if(rt){
    const ratio=clamp(rt.hp/rt.maxHp,.2,1),oldEnergy=rt.energy,st=statBlock(v,f),oldX=rt.x;
    rt.fighterId=id;rt.maxHp=st.hp;rt.hp=rt.maxHp*Math.max(.55,ratio);
    rt.attack=st.attack;rt.defense=st.defense;rt.speed=f.stats.speed;rt.range=f.stats.range;
    rt.energy=Math.min(100,oldEnergy+25);rt.glow=1.6;rt.state='idle';rt.anim=0;rt.time=0;
    rt.hit=false;rt.cool=.18;rt.special=1.2;rt.inv=.35;rt.x=oldX;rt.doubleQueued=false;
    rt.comboStrike=false;
    burst(rt.x,S.h*.62,tierColor(t),32,2);
    sheet(t>=3?'burstGb':'burst',rt.x,S.h*.58,2.5+t*.16);
    S.fx?.flash?.(.22);
    tone(700+t*90,.14,.035,'sawtooth');
  }
  say(`${v.name} · ${reason} → ${f.name}`,tierColor(t));
}

function grantTier(v,t,why){
  t=clamp(t,0,4);
  if(t<v.highestTier)return;
  let pool=tierPool(t);
  const opponent=S.active.find(a=>a&&a.viewer.id!==v.id)?.fighterId;
  const distinct=pool.filter(id=>id!==opponent);
  if(distinct.length)pool=distinct;
  const id=choose(pool,v.id);
  if(id)setFighter(v,id,why);
}

function level(v,n=1){
  v.level+=n;
  const rt=S.active.find(a=>a?.viewer.id===v.id);
  if(rt){
    const old=rt.maxHp,f=cfg(v.fighterId),st=statBlock(v,f);
    rt.maxHp=st.hp;
    rt.hp=Math.min(rt.maxHp,rt.hp+(rt.maxHp-old)+18*n);
    rt.attack=st.attack;rt.defense=st.defense;rt.glow=1;
    burst(rt.x,S.h*.62,'#ff78c2',16+n*2,1.1);
    sheet('sparkGb',rt.x,S.h*.57,2.1);
  }
  say(`${v.name} LEVEL UP → LV ${v.level}`,'#ff78c2');
  tone(620,.1,.025,'triangle');
}

const get=p=>{
  const name=clean(p.username||p.uniqueId||p.name);
  const id=String(p.userId||p.id||uid(name));
  return S.viewers.get(id)||createViewer({...p,userId:id,username:name});
};

function like(p={}){
  const v=get(p);if(!v)return;
  const n=clamp(Number(p.count||p.likeCount||1),1,1000);
  v.likes+=n;
  const r=S.active.find(a=>a?.viewer.id===v.id);
  if(r&&!r.dead){
    const heal=Math.min(26,n*2.2),before=r.hp;
    r.hp=Math.min(r.maxHp,r.hp+heal);
    if(r.hp>before){
      S.fx?.float?.(r.x,S.h*.53,`+${Math.round(r.hp-before)} HP`,'#66f29b');
      burst(r.x,S.h*.62,'#66f29b',6,.45);
      sheet('impactGb',r.x,S.h*.59,1.8);
      tone(720,.035,.012,'sine');
    }
  }else v.potions=Math.min(5,v.potions+Math.ceil(n/10));
}

function follow(p={}){
  const v=get(p);
  if(!v||v.followed)return;
  v.followed=true;
  setFighter(v,FOLLOW_FIGHTER,'FOLLOW FIGHTER');
}

function rose(p={}){
  const v=get(p);if(!v)return;
  const n=clamp(Number(p.repeatCount||p.count||1),1,10000);
  v.roseHpBonus=Math.max(0,Number(v.roseHpBonus||0))+n;
  const rt=S.active.find(a=>a?.viewer.id===v.id);
  if(rt&&!rt.dead){
    rt.maxHp+=n;
    rt.glow=1;
    S.fx?.float?.(rt.x,S.h*.53,`+${n} MAX HP`,'#ff78c2');
    burst(rt.x,S.h*.62,'#ff78c2',Math.min(28,8+Math.ceil(Math.sqrt(n))),1.05);
    sheet('sparkGb',rt.x,S.h*.57,2.1);
  }
  say(`${v.name} · ROSE ×${n} → +${n} MAX HP`,'#ff78c2');
  tone(620,.1,.025,'triangle');
}

function power(r,t){
  if(!r)return;
  r.shield+=12+t*8;
  r.energy=Math.min(100,r.energy+34+t*12);
  r.glow=1.2;
  if(t>=3){r.energy=100;r.cool=0}
  if(t>=4){r.hp=r.maxHp;r.shield+=30}
  burst(r.x,S.h*.62,tierColor(t),20+t*5,1.4);
  sheet(t>=3?'impactGb':'impact',r.x,S.h*.57,2.2+t*.15);
  S.fx?.flash?.(.1+t*.04);
}

function gift(p={}){
  if(String(p.giftName||p.name||'').toLowerCase().includes('rose'))return rose(p);
  const v=get(p);if(!v)return;
  const d=Math.max(1,Number(p.diamondCount||p.value||p.coins||1))*Math.max(1,Number(p.repeatCount||1));
  v.gifts+=d;
  const t=d>=500?4:d>=100?3:d>=10?2:0;
  if(!t){
    power(S.active.find(a=>a?.viewer.id===v.id),1);
    say(`${v.name} POWER BURST`,'#75ef9b');
  }else{
    grantTier(v,t,t===4?'MYTHIC ASCENSION':t===3?'EPIC ASCENSION':'RARE TRANSFORM');
    power(S.active.find(a=>a?.viewer.id===v.id),t);
  }
}

export function emit(type,p={}){
  const t=String(type||'').toLowerCase();
  if(['join','enter','viewerenter','member'].includes(t))return createViewer(p);
  if(t==='like')return like(p);
  if(t==='follow')return follow(p);
  if(t==='rose')return rose(p);
  if(t==='gift')return gift(p);
}

export function installBridge(){
  window.FighterArenaBridge={
    emit,viewers:S.viewers,
    get queue(){return S.queue},
    get active(){return S.active},
    version:'1.4.0-r18'
  };
  window.dispatchFighterArenaEvent=emit;
  window.addEventListener('message',e=>{
    const d=e.data;
    if(d&&typeof d==='object'&&(d.source==='fighter-arena'||d.channel==='tiktok-live'||d.type==='tiktok-event'))
      emit(d.event||d.eventType||d.name,d.payload||d.data||d);
  });
  window.addEventListener('fighter-arena-event',e=>{
    const d=e.detail||{};
    emit(d.type,d.payload||d);
  });
}
