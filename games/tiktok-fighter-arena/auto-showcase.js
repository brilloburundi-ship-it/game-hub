import{S,cfg,runtime,setArena}from'./core.js?v=1.4.0';

const VERSION='1.1.0';
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
const allowed=()=>params.get('demo')==='1'||params.get('showcase')==='1';
let running=false,token=0,snapshot=null,labIds=[],button=null,status=null,viewerSeq=0;
const diag={version:VERSION,running:false,phase:'idle',fight:0,completedFights:0,heroesSeen:[],eventsSeen:[],errors:[],complete:false};
window.__fighterArenaShowcase=diag;

const bridge=()=>window.FighterArenaBridge;
const say=(text,color='#8ceaff')=>S.fx?.toast?.(text,color);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setStatus(text){if(status)status.textContent=text}
function emit(type,payload){const b=bridge();if(!b?.emit)throw Error('FighterArenaBridge not ready');return b.emit(type,payload)}
function safeName(id){return cfg(id)?.name||id.replaceAll('_',' ').toUpperCase()}
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
function snapshotState(){return{active:S.active.slice(),queue:S.queue.slice(),round:S.round,clock:S.clock,delay:S.delay,arenaIndex:S.arenaIndex,fightNo:S.fightNo,testStream:!!S.testStream}}
function restoreState(){
  if(!snapshot)return;
  const s=snapshot;
  S.active=s.active;S.queue=s.queue;S.round=s.round;S.clock=s.clock;S.delay=s.delay;S.fightNo=s.fightNo;
  try{setArena(s.arenaIndex)}catch{}
  for(const id of labIds)S.viewers.delete(id);
  labIds=[];viewerSeq=0;snapshot=null;
  if(s.testStream&&bridge()?.startTestStream)bridge().startTestStream();else S.testStream=false;
}
function stop({restore=true,complete=false}={}){
  running=false;token++;diag.running=false;diag.complete=complete;diag.phase=complete?'complete':'stopped';
  if(restore)restoreState();
  if(button)button.textContent='LIVE SHOWCASE';
  if(!complete)setStatus('Live showcase stopped · previous test state restored');
}
function resetArenaForShowcase(){S.active=[null,null];S.queue=[];S.round='waiting';S.clock=0;S.delay=0}
function assignExactFighter(v,id){
  const f=cfg(id);if(!v||!f)throw Error(`Missing fighter ${id}`);
  v.fighterId=id;v.highestTier=Math.max(v.highestTier||0,f.tier||0);
  const idx=S.active.findIndex(r=>r?.viewer.id===v.id);
  if(idx>=0){const old=S.active[idx],fresh=runtime(v,idx);fresh.x=old?.x??fresh.x;fresh.inv=Math.max(.35,old?.inv||0);S.active[idx]=fresh}
  return v;
}
function joinHero(index){
  const fighterId=HEROES[index],id=`showcase-live:${Date.now()}:${viewerSeq++}`;
  const name=`LIVE${String(index+1).padStart(2,'0')}`;
  labIds.push(id);
  const v=emit('join',{userId:id,username:name});
  if(!v)throw Error(`Unable to JOIN ${name}`);
  assignExactFighter(v,fighterId);
  diag.heroesSeen.push(fighterId);
  say(`${name} JOIN · ${safeName(fighterId)}`,'#8ceaff');
  return v;
}
function armSpecials(){for(const r of S.active)if(r&&!r.dead){r.energy=100;r.special=0;r.cool=0}}
function livePair(){return S.active.filter(Boolean).map(r=>`${r.viewer.name} · ${safeName(r.fighterId)}`).join('  VS  ')}
async function runFightEvent(challenger,t,bout){
  armSpecials();
  if(!(await wait(1700,t))||S.round!=='fighting')return;
  const step=TEST_EVENTS[(bout-1)%TEST_EVENTS.length];
  const target=S.active.find(r=>r?.viewer.id===challenger?.id&&!r.dead)||S.active.find(r=>r&&!r.dead);
  if(!target)return;
  diag.eventsSeen.push(step.label);
  say(`${target.viewer.name} · ${step.label}`,'#75ef9b');
  emit(step.type,{userId:target.viewer.id,username:target.viewer.name,...step.payload});
  setStatus(`FIGHT ${bout}/${HEROES.length-1} · ${step.label} · combat continues to real KO`);
  if(await wait(2300,t))armSpecials();
}
async function waitForRealFinish(t,bout){
  if(!(await waitUntil(()=>S.round==='finished',t,105000,`KO in fight ${bout}`)))return false;
  diag.phase='death';setStatus(`FIGHT ${bout} · KO · waiting for full death animation`);
  if(!(await waitUntil(()=>S.round==='waiting'&&S.active.filter(Boolean).length===1&&S.delay===0,t,15000,`winner rotation after fight ${bout}`)))return false;
  diag.completedFights=bout;
  const champ=S.active.find(Boolean);
  if(champ)setStatus(`FIGHT ${bout} complete · ${champ.viewer.name} stays champion · next viewer incoming`);
  return true;
}
async function run(){
  if(running)return;
  if(!allowed()){setStatus('LIVE SHOWCASE is locked outside test mode · use ?demo=1 or ?showcase=1');say('LIVE SHOWCASE requires test mode','#ffd56b');return}
  if(!S.started||!window.__fighterArenaReady){setStatus('Enter the arena first, then run LIVE SHOWCASE');say('ENTER ARENA first','#ffd56b');return}
  if(!bridge()?.emit){setStatus('Bridge not ready');return}
  running=true;const t=++token;diag.running=true;diag.complete=false;diag.phase='starting';diag.fight=0;diag.completedFights=0;diag.heroesSeen=[];diag.eventsSeen=[];diag.errors=[];
  if(button)button.textContent='STOP SHOWCASE';
  snapshot=snapshotState();if(S.testStream&&bridge()?.stopTestStream)bridge().stopTestStream();resetArenaForShowcase();
  try{
    const custom=window.__fighterArenaCombatVfx?.loaded?.length||0;
    setStatus(`LIVE simulation starting · ${HEROES.length} viewers/heroes · ${custom}/5 custom VFX ready`);
    joinHero(0);
    if(!(await wait(900,t)))return;
    let challenger=joinHero(1);
    for(let bout=1;bout<HEROES.length;bout++){
      diag.phase='fight';diag.fight=bout;
      if(!(await waitUntil(()=>S.round==='fighting'&&S.active.filter(Boolean).length===2,t,15000,`fight ${bout} start`)))return;
      setStatus(`FIGHT ${bout}/${HEROES.length-1} · ${livePair()}`);
      runFightEvent(challenger,t,bout).catch(e=>diag.errors.push(String(e?.message||e)));
      if(!(await waitForRealFinish(t,bout)))return;
      if(bout>=HEROES.length-1)break;
      if(!(await wait(1200,t)))return;
      challenger=joinHero(bout+1);
    }
    if(!running||t!==token)return;
    diag.phase='complete';diag.complete=true;
    const champ=S.active.find(Boolean);
    setStatus(`COMPLETE · ${diag.completedFights}/${HEROES.length-1} real fights · ${diag.heroesSeen.length}/${HEROES.length} heroes · final champion ${champ?.viewer.name||'—'}`);
    say('LIVE SHOWCASE COMPLETE','#75ef9b');
    if(await wait(3000,t))stop({restore:true,complete:true});
  }catch(e){diag.errors.push(String(e?.message||e));console.error('[Fighter Arena Live Showcase]',e);setStatus(`SHOWCASE ERROR · ${e?.message||e}`);stop({restore:true,complete:false})}
}
function installUi(){
  const grid=document.querySelector('.test-grid');if(!grid)return false;
  if(!button){button=document.createElement('button');button.id='autoShowcaseButton';button.type='button';button.textContent='LIVE SHOWCASE';button.onclick=()=>running?stop({restore:true}):run();grid.append(button)}
  if(!status){status=document.createElement('p');status.id='autoShowcaseState';status.className='bridge-state';status.textContent='Real live flow: JOIN → fight → KO/death → winner stays → next viewer';grid.insertAdjacentElement('afterend',status)}
  return true;
}
const uiTimer=setInterval(()=>{if(installUi())clearInterval(uiTimer)},150);
if(params.get('showcase')==='1'){const auto=setInterval(()=>{installUi();if(S.started&&window.__fighterArenaReady&&bridge()?.emit){clearInterval(auto);setTimeout(run,350)}},250)}
window.FighterArenaShowcase={start:run,stop:()=>stop({restore:true}),get running(){return running},heroes:[...HEROES],events:TEST_EVENTS.map(x=>x.label),version:VERSION};
