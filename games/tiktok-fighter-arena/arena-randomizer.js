import{S,setArena}from'./core.js?v=1.4.0';

let lastFight=S.fightNo||0;
let lastArena=S.arenaIndex||0;

function chooseRandomArena(){
  const count=S.manifest?.arenas?.length||0;
  if(count<=0)return;
  if(count===1){lastArena=0;setArena(0);return}
  let next=lastArena;
  while(next===lastArena)next=Math.floor(Math.random()*count);
  lastArena=next;
  setArena(next);
}

function watch(){
  if(S.fightNo!==lastFight){
    lastFight=S.fightNo;
    chooseRandomArena();
  }
  requestAnimationFrame(watch);
}

requestAnimationFrame(watch);
