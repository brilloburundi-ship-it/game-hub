(() => {
'use strict';

const VERSION = '0.3.4';
const W = 540;
const H = 800;
const PAD = 18;
const COVER_PAD = 30;
const THINK_MS = 110;

const obstacles = [
  {x:55,y:105,w:95,h:44},{x:390,y:100,w:96,h:44},
  {x:210,y:180,w:50,h:92},{x:305,y:245,w:108,h:45},
  {x:70,y:330,w:58,h:90},{x:170,y:385,w:92,h:45},
  {x:333,y:405,w:58,h:103},{x:430,y:520,w:62,h:62},
  {x:78,y:588,w:93,h:43},{x:230,y:610,w:60,h:90}
];

const memory = new Map();
let timer = 0;

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function norm(x,y){ const l=Math.hypot(x,y)||1; return {x:x/l,y:y/l}; }
function insideRect(x,y,r,o){ return x+r>o.x && x-r<o.x+o.w && y+r>o.y && y-r<o.y+o.h; }
function blocked(x,y,r=PAD){ return obstacles.some(o=>insideRect(x,y,r,o)); }
function safeInZone(x,y,zoneR,margin=24){ return Math.hypot(x-W/2,y-H/2) < Math.max(40,zoneR-margin); }

function segmentHitsRect(ax,ay,bx,by,o,pad=7){
  const minX=o.x-pad,maxX=o.x+o.w+pad,minY=o.y-pad,maxY=o.y+o.h+pad;
  let t0=0,t1=1;
  const dx=bx-ax,dy=by-ay;
  const p=[-dx,dx,-dy,dy];
  const q=[ax-minX,maxX-ax,ay-minY,maxY-ay];
  for(let i=0;i<4;i++){
    if(Math.abs(p[i])<1e-7){ if(q[i]<0) return false; continue; }
    const r=q[i]/p[i];
    if(p[i]<0){ if(r>t1)return false; if(r>t0)t0=r; }
    else { if(r<t0)return false; if(r<t1)t1=r; }
  }
  return true;
}
function lineClear(a,b,pad=7){ return !obstacles.some(o=>segmentHitsRect(a.x,a.y,b.x,b.y,o,pad)); }
function routeClear(a,b){ return lineClear(a,b,18); }

function targetScore(p,q){
  const dist=Math.hypot(p.x-q.x,p.y-q.y);
  const weak=(1-clamp(q.hp/Math.max(1,q.max),0,1))*95;
  const threat=(q.weapon||0)*11+(q.level||1)*2;
  return dist - weak + threat*.18;
}
function chooseTarget(p,players){
  let best=null,bestScore=Infinity;
  for(const q of players){
    if(!q.alive||q===p)continue;
    const s=targetScore(p,q);
    if(s<bestScore){bestScore=s;best=q;}
  }
  return best;
}

function coverCandidates(zoneR){
  const out=[];
  for(let i=0;i<obstacles.length;i++){
    const o=obstacles[i],cx=o.x+o.w/2,cy=o.y+o.h/2;
    const pts=[
      {x:o.x-COVER_PAD,y:cy,side:'l'}, {x:o.x+o.w+COVER_PAD,y:cy,side:'r'},
      {x:cx,y:o.y-COVER_PAD,side:'t'}, {x:cx,y:o.y+o.h+COVER_PAD,side:'b'},
      {x:o.x-COVER_PAD,y:o.y-COVER_PAD,side:'tl'}, {x:o.x+o.w+COVER_PAD,y:o.y-COVER_PAD,side:'tr'},
      {x:o.x-COVER_PAD,y:o.y+o.h+COVER_PAD,side:'bl'}, {x:o.x+o.w+COVER_PAD,y:o.y+o.h+COVER_PAD,side:'br'}
    ];
    for(const pt of pts){
      pt.obstacle=i;
      if(pt.x>25&&pt.x<W-25&&pt.y>65&&pt.y<H-25&&!blocked(pt.x,pt.y,16)&&safeInZone(pt.x,pt.y,zoneR,30))out.push(pt);
    }
  }
  return out;
}

function pickCover(p,t,zoneR){
  let best=null,bestScore=Infinity;
  for(const c of coverCandidates(zoneR)){
    const pd=Math.hypot(c.x-p.x,c.y-p.y);
    if(pd>245||!routeClear(p,c)||lineClear(c,t,11))continue;
    const score=pd+Math.hypot(c.x-W/2,c.y-H/2)*.03+Math.random()*12;
    if(score<bestScore){bestScore=score;best=c;}
  }
  return best;
}

function pickPeek(c,t,zoneR){
  if(!c)return null;
  const o=obstacles[c.obstacle];
  if(!o)return null;
  const cx=o.x+o.w/2,cy=o.y+o.h/2;
  const toward=norm(t.x-cx,t.y-cy);
  const perp={x:-toward.y,y:toward.x};
  const tries=[
    {x:c.x+perp.x*44,y:c.y+perp.y*44},
    {x:c.x-perp.x*44,y:c.y-perp.y*44},
    {x:c.x+toward.x*36,y:c.y+toward.y*36}
  ];
  for(const q of tries){
    if(q.x<24||q.x>W-24||q.y<60||q.y>H-24||blocked(q.x,q.y,16)||!safeInZone(q.x,q.y,zoneR,24))continue;
    if(lineClear(q,t,8))return q;
  }
  return null;
}

function pickFlank(p,t,zoneR,side){
  const v=norm(p.x-t.x,p.y-t.y),perp={x:-v.y*side,y:v.x*side};
  const q={x:t.x+v.x*95+perp.x*70,y:t.y+v.y*95+perp.y*70};
  q.x=clamp(q.x,28,W-28);q.y=clamp(q.y,64,H-28);
  if(blocked(q.x,q.y,16)||!safeInZone(q.x,q.y,zoneR,25)||!routeClear(p,q))return null;
  return q;
}

function separation(p,players){
  let sx=0,sy=0,n=0;
  for(const q of players){
    if(!q.alive||q===p)continue;
    const dx=p.x-q.x,dy=p.y-q.y,dd=Math.hypot(dx,dy);
    if(dd>0&&dd<42){const k=(42-dd)/42;sx+=dx/dd*k;sy+=dy/dd*k;n++;}
  }
  return n?{x:sx/n,y:sy/n}:{x:0,y:0};
}

function steer(p,goal,speed,players){
  if(!goal){p.vx*=.7;p.vy*=.7;return;}
  const v=norm(goal.x-p.x,goal.y-p.y),sep=separation(p,players);
  const n=norm(v.x+sep.x*.75,v.y+sep.y*.75);
  p.vx=n.x*speed;p.vy=n.y*speed;
}

function engage(p,t,m,players){
  const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy)||1;
  const dir={x:dx/d,y:dy/d},perp={x:-dir.y*m.strafeSide,y:dir.x*m.strafeSide};
  const ideal=p.weapon===2?100:(p.weapon>=3?175:145);
  let radial=0;
  if(d>ideal+32)radial=1; else if(d<ideal-30)radial=-1;
  const sep=separation(p,players);
  const n=norm(dir.x*radial+perp.x*.72+sep.x*.85,dir.y*radial+perp.y*.72+sep.y*.85);
  const speed=56+(p.weapon===2?8:0);
  p.vx=n.x*speed;p.vy=n.y*speed;
}

function retreat(p,t,players){
  const away=norm(p.x-t.x,p.y-t.y),sep=separation(p,players);
  const n=norm(away.x+sep.x*.65,away.y+sep.y*.65);
  p.vx=n.x*78;p.vy=n.y*78;
}

function updateFighter(p,players,state,now){
  let m=memory.get(p.id);
  if(!m){
    m={mode:'engage',until:0,cover:null,peek:null,strafeSide:Math.random()<.5?-1:1,lastHp:p.hp,underFire:0,lastX:p.x,lastY:p.y,stuck:0};
    memory.set(p.id,m);
  }

  const hpLoss=Math.max(0,m.lastHp-p.hp);m.lastHp=p.hp;
  if(hpLoss>.4)m.underFire=1.35; else m.underFire=Math.max(0,m.underFire-.11);

  const moved=Math.hypot(p.x-m.lastX,p.y-m.lastY);
  if(Math.hypot(p.vx,p.vy)>25&&moved<1.2)m.stuck+=.11; else m.stuck=Math.max(0,m.stuck-.2);
  m.lastX=p.x;m.lastY=p.y;

  const zoneDist=Math.hypot(p.x-W/2,p.y-H/2);
  if(zoneDist>state.zoneR-40){
    m.mode='zone';m.until=now+400;steer(p,{x:W/2,y:H/2},90,players);p.think=.32;return;
  }

  const t=(p.target&&p.target.alive)?p.target:chooseTarget(p,players);
  if(!t){p.vx*=.8;p.vy*=.8;p.think=.32;return;}
  p.target=t;p.a=Math.atan2(t.y-p.y,t.x-p.x);

  const d=Math.hypot(t.x-p.x,t.y-p.y);
  const hpRatio=p.hp/Math.max(1,p.max),enemyRatio=t.hp/Math.max(1,t.max);
  const enemyStronger=(t.level||1)>(p.level||1)+2 || (enemyRatio-hpRatio)>.42;
  const visible=lineClear(p,t,8);

  if(m.stuck>.7){m.strafeSide*=-1;m.cover=null;m.peek=null;m.mode='flank';m.until=now+700;m.stuck=0;}

  if(now>=m.until){
    const shouldCover=(hpRatio<.42||m.underFire>.45)&&d<300;
    if(shouldCover){
      const c=pickCover(p,t,state.zoneR);
      if(c){m.cover=c;m.peek=pickPeek(c,t,state.zoneR);m.mode='cover';m.until=now+700+Math.random()*450;}
      else {m.mode=enemyStronger?'retreat':'flank';m.until=now+550+Math.random()*450;}
    } else if(!visible){
      m.mode='flank';m.until=now+650+Math.random()*500;m.strafeSide*=-1;
    } else if(enemyStronger&&d<125&&hpRatio<.7){
      m.mode='retreat';m.until=now+500+Math.random()*350;
    } else {
      m.mode='engage';m.until=now+650+Math.random()*550;if(Math.random()<.35)m.strafeSide*=-1;
    }
  }

  if(m.mode==='cover'){
    const dc=m.cover?Math.hypot(p.x-m.cover.x,p.y-m.cover.y):999;
    if(!m.cover)m.mode='engage';
    else if(dc>16)steer(p,m.cover,74,players);
    else if(m.peek&&m.underFire<.95){m.mode='peek';m.until=now+420+Math.random()*380;steer(p,m.peek,60,players);}
    else {p.vx*=.55;p.vy*=.55;}
  } else if(m.mode==='peek'){
    if(m.peek)steer(p,m.peek,58,players);
    if(!visible&&m.cover&&Math.random()<.22){m.mode='cover';m.until=now+360;}
  } else if(m.mode==='flank'){
    const q=pickFlank(p,t,state.zoneR,m.strafeSide);
    if(q)steer(p,q,72,players); else engage(p,t,m,players);
  } else if(m.mode==='retreat') retreat(p,t,players);
  else engage(p,t,m,players);

  p.think=.34;
}

function tick(){
  const api=window.LiveDropzone;
  if(!api?.state){timer=window.setTimeout(tick,150);return;}
  const state=api.state,players=state.players||[],now=performance.now();
  for(const p of players)if(p.alive)updateFighter(p,players,state,now);
  for(const id of [...memory.keys()])if(!players.some(p=>p.id===id&&p.alive))memory.delete(id);
  timer=window.setTimeout(tick,THINK_MS);
}

window.LiveDropzoneAI = Object.freeze({version:VERSION,memory,stop(){clearTimeout(timer);}});
tick();
})();
