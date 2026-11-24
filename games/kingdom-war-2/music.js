(() => {
'use strict';
const audio=document.querySelector('#bgMusic');if(!audio)return;
const source=audio.getAttribute('src')||'assets/audio/medieval-market-full.mp3';
audio.src=source;audio.loop=true;audio.preload='auto';audio.playsInline=true;audio.volume=1;audio.muted=false;
let unlocked=false,pending=null,lastTime=0,lastProgress=Date.now(),lastRecovery=0,attempt=0;
const remember=()=>{try{localStorage.setItem('godworld_music_started','1');}catch{}};
const mark=state=>{document.documentElement.dataset.music=state;window.__MUSIC_STATUS={state,time:audio.currentTime,readyState:audio.readyState,retries:attempt};};
function play(){
 if(pending)return pending;
 try{pending=Promise.resolve(audio.play()).then(()=>{unlocked=true;remember();lastProgress=Date.now();mark('playing');return true;}).catch(error=>{mark(error?.name==='NotAllowedError'?'waiting-gesture':'retrying');return false;}).finally(()=>{pending=null;});return pending;}
 catch{mark('retrying');return Promise.resolve(false);}
}
function recover(force=false){
 if(document.hidden||!unlocked||Date.now()-lastRecovery<3000)return;
 lastRecovery=Date.now();attempt++;
 if(audio.ended){audio.currentTime=0;play();return;}
 if(force||audio.error||audio.readyState<2){
  const resume=Number.isFinite(audio.currentTime)?audio.currentTime:0;
  const restore=()=>{if(resume>0&&resume<audio.duration)try{audio.currentTime=resume;}catch{}play();};
  audio.addEventListener('loadedmetadata',restore,{once:true});audio.load();play();
 }else play();
}
for(const event of ['pointerdown','touchend','keydown'])document.addEventListener(event,()=>{if(audio.paused||!unlocked)play();},{capture:true,passive:true});
audio.addEventListener('playing',()=>{unlocked=true;remember();lastProgress=Date.now();attempt=0;mark('playing');});
audio.addEventListener('timeupdate',()=>{if(Math.abs(audio.currentTime-lastTime)>.05){lastTime=audio.currentTime;lastProgress=Date.now();}});
audio.addEventListener('pause',()=>{mark(unlocked?'paused':'waiting-gesture');if(unlocked&&!document.hidden)setTimeout(()=>recover(),350);});
audio.addEventListener('ended',()=>{audio.currentTime=0;play();});
audio.addEventListener('error',()=>{mark('error');if(unlocked)setTimeout(()=>recover(true),1000);});
for(const event of ['waiting','stalled'])audio.addEventListener(event,()=>mark('buffering'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastProgress=Date.now();if(unlocked)play();}});
window.addEventListener('pageshow',()=>{if(unlocked)play();});
window.addEventListener('online',()=>{if(unlocked)recover(true);});
setInterval(()=>{
 if(document.hidden||!unlocked)return;
 if(audio.ended||audio.paused)recover();
 else if(Date.now()-lastProgress>9000)recover(true);
},2500);
play();
})();