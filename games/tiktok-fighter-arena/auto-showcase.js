import{S,cfg,runtime,setArena}from'./core.js?v=1.4.0';

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
let running=false,token=0,snapshot=null,labIds=[],button=null,status=null;
const diag={running:false,phase:'idle',heroIndex:-1,heroesSeen:[],eventsSeen:[],errors:[],complete:false};
window.__fighterArenaShowcase=diag;

const wait=(ms,t)=>new Promise(resolve=>setTimeout(()=>resolve(running&&t===token),ms));
const bridge=()=>window.FighterArenaBridge;
const say=(text,color='#8ceaff')=>S.fx?.toast?.(text,color);
function setStatus(text){if(status)status.textContent=text}
function emit(type,payload){const b=bridge();if(!b?.emit)throw Error('FighterArenaBridge not ready');return b.emit(type,payload)}
function safeName(id){return cfg(id)?.name||id.replaceAll('_',' ').toUpperCase()}
function removeLabFromQueue(){if(!labIds.length)return;S.queue=S.queue.filter(v=>!labIds.includes(v.id))}
function testSpacing(){return Math.max(S.w<700?178:220,S.w*(S.w<700?.44:.18))}
function exactRuntime(v,id,side,{dummy=false}={}){const f=cfg(id);if(!f)throw Error(`Missing fighter ${id}`);v.fighterId=id;v.highestTier=Math.max(v.highestTier||0,f.tier||0);const r=runtime(v,side),dist=testSpacing();r.x=S.w*.5+(side?1:-1)*dist*.5;r.inv=.08;r.cool=dummy?999:0;r.special=dummy?999:0;r.energy=dummy?0:100;r.glow=.45;if(dummy){r.maxHp=99999;r.hp=99999;r.attack=1;r.defense=999;r.shield=0}return r}
function armSpecial(r){if(!r||r.dead)return;r.energy=100;r.cool=0;r.special=0;r.inv=0}
function snapshotState(){return{active:S.active.slice(),queue:S.queue.slice(),round:S.round,clock:S.clock,delay:S.delay,arenaIndex:S.arenaIndex,testStream:!!S.testStream}}
function restoreState(){if(!snapshot)return;const s=snapshot;S.active=s.active;S.queue=s.queue;S.round=s.round;S.clock=s.clock;S.delay=s.delay;try{setArena(s.arenaIndex)}catch{}for(const id of labIds)S.viewers.delete(id);labIds=[];snapshot=null;if(s.testStream&&bridge()?.startTestStream)bridge().startTestStream()}
function stop({restore=true,complete=false}={}){running=false;token++;diag.running=false;diag.complete=complete;diag.phase=complete?'complete':'stopped';if(restore)restoreState();if(button)button.textContent='AUTO SHOWCASE';if(!complete)setStatus('Auto showcase stopped · test state restored')}
function makeLabViewer(suffix,name){const id=`showcase:${Date.now()}:${suffix}`;labIds.push(id);const v=emit('join',{userId:id,username:name});if(!v)throw Error(`Unable to create showcase viewer ${name}`);return v}
async function rosterTour(a,b,t){diag.phase='roster';diag.heroesSeen=[];for(let i=0;i<HEROES.length;i++){
    if(!running||t!==token)return false;
    const id=HEROES[i],name=safeName(id),arenaCount=S.manifest?.arenas?.length||1;
    try{setArena(i%arenaCount)}catch{}
    S.active=[exactRuntime(a,id,0),exactRuntime(b,'hero_knight',1,{dummy:true})];
    S.round='fighting';S.clock=90;S.delay=0;diag.heroIndex=i;diag.heroesSeen.push(id);
    setStatus(`ROSTER ${i+1}/${HEROES.length} · ${name} · forcing attack + Ultimate`);
    say(`${i+1}/${HEROES.length} · ${name}`,'#ffd56b');
    if(!(await wait(1150,t)))return false;armSpecial(S.active[0]);
    if(!(await wait(2150,t)))return false;armSpecial(S.active[0]);
    if(!(await wait(1450,t)))return false;
  }return true}
async function interactionTour(a,b,t){diag.phase='interactions';diag.eventsSeen=[];S.active=[exactRuntime(a,'hero_knight',0),exactRuntime(b,'hero_knight',1,{dummy:true})];S.round='fighting';S.clock=90;S.delay=0;for(let i=0;i<TEST_EVENTS.length;i++){
    if(!running||t!==token)return false;
    const step=TEST_EVENTS[i];diag.eventsSeen.push(step.label);setStatus(`INTERACTIONS ${i+1}/${TEST_EVENTS.length} · ${step.label}`);say(step.label,'#75ef9b');
    emit(step.type,{userId:a.id,username:a.name,...step.payload});
    if(S.active[0]?.viewer.id===a.id)armSpecial(S.active[0]);
    if(!(await wait(3500,t)))return false;
  }return true}
async function koCheck(a,b,t){diag.phase='ko';S.active=[exactRuntime(a,'samurai_commander',0),exactRuntime(b,'evil_wizard',1)];const left=S.active[0],right=S.active[1],dist=testSpacing();left.x=S.w*.5-dist*.5;right.x=S.w*.5+dist*.5;left.attack=Math.max(left.attack,120);armSpecial(left);right.maxHp=1;right.hp=1;right.defense=0;right.cool=999;right.special=999;right.energy=0;S.round='fighting';S.clock=20;S.delay=0;setStatus('FINAL CHECK · forcing real KO + death animation');say('FINAL CHECK · KO','#ff6ab6');return wait(5200,t)}
async function run(){if(running)return;if(!allowed()){setStatus('Auto showcase is locked outside test mode · open with ?demo=1 or ?showcase=1');say('AUTO SHOWCASE requires ?demo=1 or ?showcase=1','#ffd56b');return}if(!S.started||!window.__fighterArenaReady){setStatus('Enter the arena first, then run AUTO SHOWCASE');say('ENTER ARENA first','#ffd56b');return}if(!bridge()?.emit){setStatus('Bridge not ready');return}
  running=true;const t=++token;diag.running=true;diag.complete=false;diag.errors=[];diag.heroIndex=-1;if(button)button.textContent='STOP SHOWCASE';snapshot=snapshotState();if(S.testStream&&bridge()?.stopTestStream)bridge().stopTestStream();
  try{
    const a=makeLabViewer('a','SHOWCASE HERO'),b=makeLabViewer('b','SPARRING DUMMY');removeLabFromQueue();
    const custom=window.__fighterArenaCombatVfx?.loaded?.length||0;setStatus(`Starting deterministic showcase · ${HEROES.length} heroes · ${custom}/5 custom VFX ready`);
    S.active=[exactRuntime(a,HEROES[0],0),exactRuntime(b,'hero_knight',1,{dummy:true})];S.queue=[];S.round='fighting';S.clock=90;S.delay=0;
    if(!(await rosterTour(a,b,t)))return;
    if(!(await interactionTour(a,b,t)))return;
    if(!(await koCheck(a,b,t)))return;
    if(!running||t!==token)return;diag.phase='complete';diag.complete=true;setStatus(`COMPLETE · ${diag.heroesSeen.length}/${HEROES.length} heroes · ${diag.eventsSeen.length}/${TEST_EVENTS.length} interactions · KO checked`);say('AUTO SHOWCASE COMPLETE','#75ef9b');
    await wait(2200,t);if(running&&t===token)stop({restore:true,complete:true});
  }catch(e){diag.errors.push(String(e?.message||e));console.error('[Fighter Arena Showcase]',e);setStatus(`SHOWCASE ERROR · ${e?.message||e}`);stop({restore:true,complete:false})}}
function installUi(){const grid=document.querySelector('.test-grid');if(!grid)return false;if(!button){button=document.createElement('button');button.id='autoShowcaseButton';button.type='button';button.textContent='AUTO SHOWCASE';button.onclick=()=>running?stop({restore:true}):run();grid.append(button)}if(!status){status=document.createElement('p');status.id='autoShowcaseState';status.className='bridge-state';status.textContent='20 heroes + attacks/Ultimates + gifts + KO · test mode only';grid.insertAdjacentElement('afterend',status)}return true}
const uiTimer=setInterval(()=>{if(installUi())clearInterval(uiTimer)},150);
if(params.get('showcase')==='1'){const auto=setInterval(()=>{installUi();if(S.started&&window.__fighterArenaReady&&bridge()?.emit){clearInterval(auto);setTimeout(run,350)}},250)}
window.FighterArenaShowcase={start:run,stop:()=>stop({restore:true}),get running(){return running},heroes:[...HEROES],events:TEST_EVENTS.map(x=>x.label)};
