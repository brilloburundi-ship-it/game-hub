(() => {
'use strict';
const $=id=>document.getElementById(id);
const put=(id,value)=>{const e=$(id);if(e&&e.textContent!==String(value))e.textContent=String(value);};
const fmt=n=>Math.floor(Math.max(0,Number(n)||0)).toLocaleString('en-US');
const live=sim=>sim.kingdoms.filter(k=>k?.alive&&!k.founding);
const labels={rally:'Mobilization',advance:'Armies advancing',combat:'Battle & siege'};
const state={installed:false,events:[],lastWar:null,lastCapture:0,lastDestroyed:0,lastKills:0,known:new Map()};
function chronicle(message){
 if(!message||state.events[0]===message)return;
 state.events.unshift(message);state.events.length=Math.min(state.events.length,5);
 const list=$('royalEvents');if(!list)return;
 list.replaceChildren(...state.events.map(m=>{const p=document.createElement('p');p.textContent=m;return p;}));
}
function focus(sim,k){if(!k?.alive)return;sim.select(k);sim.r.pauseAutoCamera?.(15);sim.r.focusCell?.(...k.capital);}
function render(sim){
 const ks=live(sim),army=sim.__kw2CivilizationWar;
 put('royalCities',ks.reduce((n,k)=>n+(k.__kw2Cities||[]).filter(c=>!c.dead).length,0)+' cities');put('royalShips',(sim.__kw2Maritime?.ships.length||0)+' ships');
 if(sim.__kw2Maritime?.lastGift)put('royalGiftDetail',sim.__kw2Maritime.lastGift);
 $('royalGifts').classList.toggle('royal-testing',!$('testPanel').classList.contains('collapsed'));
 const totals=ks.reduce((a,k)=>{a.pop+=k.pop||0;for(const r of ['gold','food','stone','wood'])a[r]+=Number(k.resources[r])||0;return a;},{pop:0,gold:0,food:0,stone:0,wood:0});
 for(const [k,id] of Object.entries({pop:'totalPop',gold:'totalGold',food:'totalFood',stone:'totalStone',wood:'totalWood'}))put(id,fmt(totals[k]));
 // Preserve the core ranking and its ordering. Add accessible interactions
 // after the engine replaces its five rows.
 const ranked=[...ks].sort((a,b)=>sim.power(b)-sim.power(a)).slice(0,5);
 Array.from($('rankRows')?.children||[]).forEach((row,i)=>{const k=ranked[i];if(!k)return;row.dataset.kingdomId=k.id;row.setAttribute('role','button');row.tabIndex=0;row.setAttribute('aria-label','Focus '+k.name);});
 const w=sim.wars.find(v=>!v.done),panel=$('royalWar');
 panel.classList.toggle('hidden',!w);
 if(w){
  const a=sim.kingdoms[w.a],b=sim.kingdoms[w.b];
  if(a&&b){
   put('warAName',a.name);put('warBName',b.name);
   const n=id=>(army?.units||[]).filter(u=>!u.dead&&!u.retiring&&u.side===id).length;
   put('warAUnits',fmt(n(a.id))+' soldiers');put('warBUnits',fmt(n(b.id))+' soldiers');
   const pa=Math.max(0,sim.power(a)),pb=Math.max(0,sim.power(b)),share=pa+pb?pa/(pa+pb)*100:50;
   $('warA').style.setProperty('--side',a.css);$('warB').style.setProperty('--side',b.css);
   $('warFillA').style.cssText='width:'+share+'%;background:'+a.css;
   $('warFillB').style.cssText='width:'+(100-share)+'%;background:'+b.css;
   $('warA').dataset.kingdomId=a.id;$('warB').dataset.kingdomId=b.id;
   put('warPhase',labels[w.__v66?.phase]||'War in progress');
   if(state.lastWar!==w.id){chronicle('⚔ '+a.name+' declares war on '+b.name);state.lastWar=w.id;}
  }
 }else if(state.lastWar){chronicle('🕊 War ended. Survivors return home.');state.lastWar=null;}
 if(army){
  if(army.territoryCaptured>state.lastCapture)chronicle('⚑ '+(army.territoryCaptured-state.lastCapture)+' tiles conquered in battle');
  if(army.buildingsDestroyed>state.lastDestroyed)chronicle('🔥 '+(army.buildingsDestroyed-state.lastDestroyed)+' buildings destroyed');
  state.lastCapture=army.territoryCaptured;state.lastDestroyed=army.buildingsDestroyed;state.lastKills=army.combatKills;
 }
 for(const k of sim.kingdoms){
  if(!k||k.founding)continue;
  const old=state.known.get(k.id);
  if(old?.alive&&!k.alive)chronicle('🏰 '+k.name+' lost its castle');
  if(k.alive&&old&&k.pop-old.pop>=5)chronicle('👥 '+k.name+' gained '+(k.pop-old.pop)+' citizens');
  const walls=k.__kw2Fort?.cells.length||0,built=k.buildings.filter(b=>b.__kw2Fortification&&b.hp>0).length;
  if(k.alive&&walls&&built>=walls&&(!old||old.built<walls))chronicle('🛡 '+k.name+' completed its fortifications');
  state.known.set(k.id,{alive:k.alive,pop:k.pop,built});
 }
}
function install(sim){
 if(state.installed)return;state.installed=true;
 const collapse=(button,panel)=>$(button).addEventListener('click',()=>{const hidden=$(panel).classList.toggle('royal-collapsed');$(button).setAttribute('aria-expanded',String(!hidden));});
 collapse('rankToggle','ranking');collapse('chronicleToggle','royalChronicle');collapse('giftsToggle','royalGifts');
 $('royalHudToggle').addEventListener('click',()=>{const clean=document.body.classList.toggle('royal-clean');$('royalHudToggle').setAttribute('aria-pressed',String(clean));});
 function pick(e){const row=e.target.closest('[data-kingdom-id]');if(row)focus(sim,sim.kingdoms[Number(row.dataset.kingdomId)]);}
 $('rankRows').addEventListener('click',pick);
 $('rankRows').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e);}});
 for(const id of ['warA','warB'])$(id).addEventListener('click',pick);
 $('royalGiftItems').addEventListener('click',e=>{
  const action=e.target.closest('[data-royal-action]')?.dataset.royalAction;if(!action)return;
  const panel=$('testPanel');
  // Only simulate after the operator explicitly enables TEST.
  if(panel.classList.contains('collapsed')){panel.classList.remove('collapsed');$('royalGifts').classList.add('royal-testing');chronicle('TEST enabled: choose a player and tap the gift again.');return;}
  panel.querySelector('[data-test="'+action+'"]')?.click();
 });
 const feed=$('feed');
 if(feed)new MutationObserver(records=>{for(const rec of records)for(const el of rec.addedNodes){if(el.nodeType===1)chronicle(el.textContent.trim());}}).observe(feed,{childList:true});
 const original=sim.updateUI.bind(sim);sim.updateUI=function(...args){const result=original(...args);render(this);return result;};
 render(sim);document.documentElement.dataset.royalHud='interactive-atlas-1';
}
window.__KW2_ROYAL_HUD={state,render,chronicle};
const timer=setInterval(()=>{const sim=window.__SIM;if(sim&&window.TikTokGodWorld?.emit){clearInterval(timer);install(sim);}},100);
})();
