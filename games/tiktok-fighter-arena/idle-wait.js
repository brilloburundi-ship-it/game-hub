import{S}from'./core.js?v=1.4.0';
let last=performance.now();
function loop(now){
  const dt=Math.min(.05,(now-last)/1000||0);last=now;
  if(S.started&&S.round==='waiting'){
    for(const r of S.active){
      if(!r)continue;
      if(r.state!=='idle'){r.state='idle';r.anim=0;r.time=0;r.hit=false}
      r.anim+=dt;r.time+=dt;r.airY=0;r.knock=0;
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
