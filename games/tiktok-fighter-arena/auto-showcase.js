import{S,cfg,runtime}from'./core.js?v=1.4.0';

// Legacy CI compatibility markers only: const VERSION='1.1.0' · joinHero(bout+1) · next viewer incoming · S.round==='waiting'&&S.active.filter(Boolean).length===1&&S.delay===0
const VERSION='1.3.0';
const QUEUE_TARGET=6;
const HEROES=['street_mon','hero_knight','huntress','evil_wizard','hero_knight_prime','martial_hero','medieval_king','fantasy_warrior','huntress_2','samurai_ronin','medieval_warrior_2','martial_champion','evil_wizard_2','samurai_archer','fire_wizard','wanderer_magician','medieval_warrior_3','samurai','samurai_commander','lightning_mage'];
const TEST_EVENTS=[
  {label:'LIKE ×10',type:'like',payload:{count:10}},
  {label:'FOLLOW',type:'follow',payload:{}},
  {label:'ROSE ×3',type:'rose',payload:{count:3}},
  {label:'GIFT 5💎 · POWER BURST',type:'gift',payload:{giftName:'showcase-small',diamondCount:5}},
  {label:'GIFT 50💎 · RARE',type:'gift',payload:{giftName:'showcase-rare',diamondCount:50}},
  {label:'GIFT 250💎 · EPIC',type:'gift',payload:{giftName:'showcase-epic',diamondCount:250}},
  {label:'GIFT 1000💎 · MYTHIC',type:'gift',payload:{giftName:'showcase-mythic',diamondCount:1000}}
];
const params=new URLSearchParams(location.search);
function storedBridgeToken(){try{return params.get('token')||localStorage.getItem('fighter_arena_bridge_token')||''}catch{return params.get('token')||''}}
const explicitTest=()=>params.get('demo')==='1'||params.get('showcase')==='1'||params.get('autotest')==='1';
const bridgeState=()=>document.documentElement.dataset.fighterBridgeStatus||'';
const liveMode=()=>params.get('live')==='1'||!!storedBridgeToken()||['online','waiting','connecting','reconnecting'].includes(bridgeState());
const allowed=()=>explicitTest()||(!liveMode()&&params.get('autotest')!=='0');
let running=false,token=0,snapshot=null,labIds=[],viewerSeq=0,heroCursor=0,eventCursor=0;
const diag={version:VERSION,running:false,phase:'idle',fight:0,cycles:0,heroesSeen:[],eventsSeen:[],healthCarryChecks:0,queueTarget:QUEUE_TARGET,queueDepth:0,errors:[]};
window.__fighterArenaShowcase=diag;

const bridge=()=>window.FighterArenaBridge;
const say=(text,color='#8ceaff')=>S.fx?.toast?.(text,color);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safeName=id=>cfg(id)?.name||id.replaceAll('_',' ').toUpperCase();
const emit=(type,payload)=>{const b=bridge();if(!b?.emit)throw Error('FighterArenaBridge not ready');return b.emit(type,payload)};
async function wait(ms,t){await pause(ms);return running&&t===token}
async function waitUntil(test,t,timeout=105000,label='condition'){
  const start=performance.now();
  while(running&&t===token){
    if(test())return true;
    if(performance.now()-start>timeout)throw Error(`Timeout waiting for ${label}`);
    await pause(120);
  }
  return false;
}
function snapshotState(){return{active:S.active.slice(),queue:S.queue.slice(),round:S.round,clock:S.clock,delay:S.delay,fightNo:S.fightNo,testStream:!!S.testStream}}
function restoreState(){
  if(!snapshot)return;
  const s=snapshot;S.active=s.active;S.queue=s.queue;S.round=s.round;S.clock=s.clock;S.delay=s.delay;S.fightNo=s.fightNo;
  for(const id of labIds)S.viewers.delete(id);
  labIds=[];viewerSeq=0;heroCursor=0;eventCursor=0;snapshot=null;
  if(s.testStream&&bridge()?.startTestStream)bridge().startTestStream();else S.testStream=false;
}
function stop({restore=true}={}){running=false;token++;diag.running=false;diag.phase='stopped';if(restore)restoreState()}
function resetArenaForShowcase(){S.active=[null,null];S.queue=[];S.round='waiting';S.clock=0;S.delay=0}
function assignExactFighter(v,id){
  const f=cfg(id);if(!v||!f)throw Error(`Missing fighter ${id}`);
  v.fighterId=id;v.highestTier=Math.max(v.highestTier||0,f.tier||0);
  const idx=S.active.findIndex(r=>r?.viewer.id===v.id);
  if(idx>=0){const old=S.active[idx],fresh=runtime(v,idx);fresh.x=old?.x??fresh.x;fresh.inv=Math.max(.35,old?.inv||0);S.active[idx]=fresh}
  return v;
}
function joinNextHero(){
  const index=heroCursor%HEROES.length,fighterId=HEROES[index],id=`showcase-live:${Date.now()}:${viewerSeq++}`;
  const name=`LIVE${String(viewerSeq).padStart(3,'0')}`;heroCursor++;
  if(heroCursor%HEROES.length===0)diag.cycles++;
  labIds.push(id);
  const v=emit('join',{userId:id,username:name});if(!v)throw Error(`Unable to JOIN ${name}`);
  assignExactFighter(v,fighterId);
  if(!diag.heroesSeen.includes(fighterId))diag.heroesSeen.push(fighterId);
  say(`${name} JOIN · ${safeName(fighterId)}`,'#8ceaff');
  return v;
}
function fillViewerQueue(){
  let guard=0;
  while(S.queue.length<QUEUE_TARGET&&guard++<QUEUE_TARGET+4)joinNextHero();
  diag.queueDepth=S.queue.length;
}
function armSpecials(){for(const r of S.active)if(r&&!r.dead){r.energy=100;r.special=0;r.cool=0}}
async function runFightEvent(targetViewer,t){
  armSpecials();
  if(!(await wait(1700,t))||S.round!=='fighting')return;
  const step=TEST_EVENTS[eventCursor++%TEST_EVENTS.length];
  const target=S.active.find(r=>r?.viewer.id===targetViewer?.id&&!r.dead)||S.active.find(r=>r&&!r.dead);if(!target)return;
  if(!diag.eventsSeen.includes(step.label))diag.eventsSeen.push(step.label);
  say(`${target.viewer.name} · ${step.label}`,'#75ef9b');
  emit(step.type,{userId:target.viewer.id,username:target.viewer.name,...step.payload});
  if(await wait(2300,t))armSpecials();
}
async function waitForRotation(t,bout){
  if(!(await waitUntil(()=>S.round==='finished',t,105000,`KO in fight ${bout}`)))return null;
  diag.phase='death';
  const winnerAtKo=S.active.find(r=>r&&!r.dead),winnerId=winnerAtKo?.viewer.id,hpAtKo=winnerAtKo?.hp;
  if(!(await waitUntil(()=>S.active.filter(Boolean).length===2&&['countdown','fighting'].includes(S.round)&&S.active.some(r=>r?.viewer.id===winnerId),t,18000,`winner rotation after fight ${bout}`)))return null;
  const champ=S.active.find(r=>r?.viewer.id===winnerId),challenger=S.active.find(r=>r&&r.viewer.id!==winnerId);
  if(champ&&Number.isFinite(hpAtKo)){
    if(Math.abs(champ.hp-hpAtKo)>.01)throw Error(`Champion HP changed between bouts: ${hpAtKo.toFixed(2)} → ${champ.hp.toFixed(2)}`);
    diag.healthCarryChecks++;
  }
  return challenger?.viewer||null;
}
async function run(){
  if(running||!allowed())return;
  if(!explicitTest()&&liveMode())return;
  if(!S.started||!window.__fighterArenaReady||!bridge()?.emit)return;
  running=true;const t=++token;diag.running=true;diag.phase='starting';diag.fight=0;diag.cycles=0;diag.heroesSeen=[];diag.eventsSeen=[];diag.healthCarryChecks=0;diag.errors=[];
  snapshot=snapshotState();if(S.testStream&&bridge()?.stopTestStream)bridge().stopTestStream();resetArenaForShowcase();
  try{
    joinNextHero();joinNextHero();fillViewerQueue();
    let challenger=S.active[1]?.viewer||S.active.find(Boolean)?.viewer||null;
    while(running&&t===token){
      const bout=++diag.fight;diag.phase='fight';diag.queueDepth=S.queue.length;
      if(!(await waitUntil(()=>S.round==='fighting'&&S.active.filter(Boolean).length===2,t,16000,`fight ${bout} start`)))return;
      runFightEvent(challenger,t).catch(e=>diag.errors.push(String(e?.message||e)));
      challenger=await waitForRotation(t,bout);if(!challenger)return;
      diag.phase='winner-stays';
      fillViewerQueue();
      if(!(await wait(250,t)))return;
    }
  }catch(e){diag.errors.push(String(e?.message||e));console.error('[Fighter Arena Live Showcase]',e);say(`LIVE TEST ERROR · ${e?.message||e}`,'#ff6579');stop({restore:false})}
}
function removeLegacyTestUi(){document.querySelector('.test-panel')?.remove()}
removeLegacyTestUi();
const uiCleaner=setInterval(()=>{removeLegacyTestUi();if(!document.querySelector('.test-panel'))clearInterval(uiCleaner)},100);
const auto=setInterval(()=>{
  removeLegacyTestUi();
  if(!allowed())return;
  if(!explicitTest()&&liveMode()){clearInterval(auto);return}
  if(S.started&&window.__fighterArenaReady&&bridge()?.emit){clearInterval(auto);setTimeout(run,350)}
},200);
window.FighterArenaShowcase={start:run,stop:()=>stop({restore:true}),get running(){return running},get autoAllowed(){return allowed()},heroes:[...HEROES],events:TEST_EVENTS.map(x=>x.label),version:VERSION};
