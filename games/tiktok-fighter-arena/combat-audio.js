import{S,cfg}from'./core.js?v=1.4.0';
import swordSlice from'./assets/audio/combat/sword-slice-data.js?v=1.0.0';
import swordClash from'./assets/audio/combat/sword-clash-data.js?v=1.0.0';
import swordStab from'./assets/audio/combat/sword-stab-data.js?v=1.0.0';
import magicCastA from'./assets/audio/combat/magic-cast-a-data.js?v=1.0.0';
import magicCastB from'./assets/audio/combat/magic-cast-b-data.js?v=1.0.0';
import magicImpact from'./assets/audio/combat/magic-impact-data.js?v=1.0.0';

const BANK={sword:[swordSlice,swordClash],stab:[swordStab],magic:[magicCastA,magicCastB],magicImpact:[magicImpact]};
const MAGIC=/wizard|mage|magician/i,BLADE=/knight|warrior|king|samurai|ronin|commander/i;
const cache=new Map(),lastPick=new Map(),tracked=new WeakMap(),previous=[null,null],active=[];
const MAX_VOICES=6,MASTER=.58;
let unlocked=false;

function preload(){for(const[group,list]of Object.entries(BANK))for(let i=0;i<list.length;i++){const key=`${group}:${i}`,a=new Audio(list[i]);a.preload='auto';a.playsInline=true;a.load();cache.set(key,a)}}
function unlock(){if(unlocked)return;unlocked=true;for(const a of cache.values()){a.muted=true;const p=a.play();p?.then?.(()=>{a.pause();a.currentTime=0;a.muted=false}).catch(()=>a.muted=false)}}
addEventListener('pointerdown',unlock,{once:true,capture:true,passive:true});
addEventListener('keydown',unlock,{once:true,capture:true});
preload();

function prune(){for(let i=active.length-1;i>=0;i--)if(active[i].ended||active[i].paused)active.splice(i,1)}
function pick(group){const list=BANK[group]||[];if(!list.length)return null;let i=Math.floor(Math.random()*list.length),last=lastPick.get(group);if(list.length>1&&i===last)i=(i+1)%list.length;lastPick.set(group,i);return cache.get(`${group}:${i}`)}
function play(group,{volume=1,rate=1,pan=0}={}){if(!S.started||!unlocked||document.hidden)return false;prune();if(active.length>=MAX_VOICES){const oldest=active.shift();try{oldest.pause();oldest.currentTime=0}catch{}}const base=pick(group);if(!base)return false;const a=base.cloneNode();a.volume=Math.max(0,Math.min(1,MASTER*volume*(.94+Math.random()*.10)));a.playbackRate=Math.max(.82,Math.min(1.18,rate*(.96+Math.random()*.08)));if('preservesPitch'in a)a.preservesPitch=false;a.dataset.pan=String(pan);active.push(a);const done=()=>{const i=active.indexOf(a);if(i>=0)active.splice(i,1)};a.addEventListener('ended',done,{once:true});a.addEventListener('error',done,{once:true});a.play().catch(done);return true}
function typeOf(r){const f=cfg(r?.fighterId),text=`${r?.fighterId||''} ${f?.name||''}`;if(MAGIC.test(text))return'magic';if(BLADE.test(text))return'blade';return'other'}
function attacking(state){return state==='dash'||state==='special'||/^attack\d+$/.test(state||'')}
function snapshot(r){return r?{hp:r.hp,shield:r.shield}:null}
function hitChanged(target,prev){return!!target&&!!prev&&(target.hp<prev.hp-.001||target.shield<prev.shield-.001)}
function shieldChanged(target,prev){return!!target&&!!prev&&target.shield<prev.shield-.001}
function panFor(r){return r?.side===0?-.18:.18}
function watchFighter(r,target,prevTarget){if(!r)return;let t=tracked.get(r);if(!t){t={state:r.state,hit:!!r.hit,time:r.time,serial:0,castSerial:-1,impactSerial:-1};tracked.set(r,t)}const entered=attacking(r.state)&&(!attacking(t.state)||r.state!==t.state||r.time<(t.time||0));if(entered){t.serial++;if(typeOf(r)==='magic'&&t.castSerial!==t.serial){t.castSerial=t.serial;const strong=r.state==='special'||r.state==='attack3'||r.state==='attack4';play('magic',{volume:strong?.92:.78,rate:strong?.93:1.03,pan:panFor(r)})}}if(r.hit&&!t.hit&&hitChanged(target,prevTarget)){const kind=typeOf(r),strong=r.state==='special'||r.state==='dash'||r.state==='attack3'||r.state==='attack4'||r.comboStrike;if(kind==='blade'){const shielded=shieldChanged(target,prevTarget),stab=/attack2|attack4/.test(r.state||'')&&!r.comboStrike;play(shielded?'sword':stab?'stab':'sword',{volume:shielded?1:strong?.96:.82,rate:shielded?.92:strong?.94:1,pan:panFor(r)})}else if(kind==='magic'&&t.impactSerial!==t.serial){t.impactSerial=t.serial;const travel=.2+Math.min(.3,Math.abs((target?.x||0)-(r?.x||0))/850);setTimeout(()=>play('magicImpact',{volume:strong?1:.86,rate:strong?.93:1,pan:panFor(r)}),Math.max(150,travel*1000))}}t.state=r.state;t.hit=!!r.hit;t.time=r.time}
function frame(){const fighters=S.active||[],prev=[previous[0],previous[1]];watchFighter(fighters[0],fighters[1],prev[1]);watchFighter(fighters[1],fighters[0],prev[0]);previous[0]=snapshot(fighters[0]);previous[1]=snapshot(fighters[1]);requestAnimationFrame(frame)}
requestAnimationFrame(frame);
window.FighterArenaCombatAudio={version:'1.0.0',embedded:true,banks:Object.keys(BANK),maxVoices:MAX_VOICES};
