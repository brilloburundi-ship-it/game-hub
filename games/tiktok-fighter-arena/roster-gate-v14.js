import{S,setAvailableFighters}from'./core.js?v=1.4.0';

const REQUIRED=[
  'street_mon','hero_knight','evil_wizard','huntress','martial_hero','medieval_king',
  'martial_champion','evil_wizard_2','samurai','hero_knight_prime','fantasy_warrior',
  'huntress_2','samurai_ronin','samurai_archer','samurai_commander','fire_wizard',
  'lightning_mage','wanderer_magician','medieval_warrior_2','medieval_warrior_3'
];
const EXPECTED=REQUIRED.length;
const MIN_READY=EXPECTED-1;
const button=document.querySelector('#startButton');
const text=document.querySelector('#loadText');
let complete=false;

function check(){
  const source=S.availableFighters||new Set();
  const loaded=REQUIRED.filter(id=>source.has(id));
  const missing=REQUIRED.filter(id=>!source.has(id));

  // Never allow an unverified/unknown fighter into the active selection pool.
  if(source.size!==loaded.length||[...source].some(id=>!REQUIRED.includes(id))){
    setAvailableFighters(loaded);
  }

  complete=loaded.length>=MIN_READY;
  window.__fighterArenaRosterStatus={
    expected:EXPECTED,total:EXPECTED,minimumReady:MIN_READY,ready:loaded.length,complete,
    loaded:[...loaded],missing:[...missing]
  };
  window.__fighterArenaRoster={
    expected:EXPECTED,minimumReady:MIN_READY,loaded:[...loaded],missing:[...missing]
  };

  if(window.__fighterArenaLoadError){
    if(button){
      button.disabled=false;
      button.textContent='RELOAD ARENA';
    }
    return;
  }

  if(!S.manifest){
    if(button){
      button.disabled=true;
      button.textContent=`LOADING FIGHTERS`;
    }
    return;
  }

  if(!complete){
    if(button){
      button.disabled=true;
      button.textContent=`WAIT FOR ${MIN_READY} FIGHTERS`;
    }
    if(text)text.textContent=`${loaded.length}/${EXPECTED} fighters verified · ${MIN_READY} required to enter`;
    return;
  }

  if(text&&(!window.__fighterArenaReady||/fighters verified|waiting for complete roster|required to enter/i.test(text.textContent||''))){
    text.textContent=missing.length
      ?`${loaded.length}/${EXPECTED} fighters verified · arena ready · ${missing.length} unavailable`
      :`All ${EXPECTED} fighters verified · arenas ready`;
  }

  if(button){
    if(window.__fighterArenaReady){
      button.disabled=false;
      button.textContent='ENTER ARENA';
    }else{
      button.disabled=true;
      button.textContent='FINALIZING ARENA';
    }
  }
}

function guardEntry(event){
  if(complete||window.__fighterArenaLoadError||button?.dataset.retry==='1')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  check();
}

button?.addEventListener('pointerdown',guardEntry,true);
button?.addEventListener('click',guardEntry,true);

check();
setInterval(check,100);
