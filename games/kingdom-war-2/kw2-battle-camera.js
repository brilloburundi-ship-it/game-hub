(() => {
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function target(sim,r,director,now){
 const war=sim?.wars?.find(w=>!w.done);
 if(!war){director.__kw2BattleKey=null;director.__kw2BattleSample=null;return null;}
 if(director.__kw2BattleSample?.id===war.id&&now-director.__kw2BattleSample.at<180)return director.__kw2BattleSample.target;
 const a=sim.kingdoms[war.a],b=sim.kingdoms[war.b];if(!a?.alive||!b?.alive)return null;
 const us=(sim.__kw2CivilizationWar?.units||[]).filter(u=>!u.dead&&!u.retiring&&u.warId===war.id);
 const A=us.filter(u=>u.side===a.id),B=us.filter(u=>u.side===b.id);
 let points=[];
 const centroid=list=>list.length?[list.reduce((n,u)=>n+u.x,0)/list.length,list.reduce((n,u)=>n+u.y,0)/list.length]:null;
 if(war.__v66?.phase==='combat'){
  const engaged=us.filter(u=>u.anim==='attack'||u.anim==='hurt');
  if(engaged.length){
   const c=centroid(engaged);
   points=us.filter(u=>Math.hypot(u.x-c[0],u.y-c[1])<260).map(u=>[u.x,u.y]);
   for(const u of engaged)if(u.target?.building)points.push([u.target.building.sx,u.target.building.sy]);
  }
 }
 if(!points.length){
  const ca=centroid(A)||sim.iso(...a.capital),cb=centroid(B)||sim.iso(...b.capital);
  points=[ca,cb];
  for(const u of us){const c=u.side===a.id?ca:cb;if(Math.hypot(u.x-c[0],u.y-c[1])<160)points.push([u.x,u.y]);}
 }
 const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
 const W=typeof innerWidth==='number'?innerWidth:1280,H=typeof innerHeight==='number'?innerHeight:720;
 const portrait=W<600,scale=clamp(Math.min(W*.68/Math.max(220,maxX-minX+100),H*.52/Math.max(150,maxY-minY+85)),r.overviewScale?.()||.18,portrait?1.05:1.32);
 const x=(minX+maxX)/2,y=(minY+maxY)/2;
 director.mode='war';director.focusKingdom=null;director.shotKey='battle-'+war.id;director.warShot=null;director.__kw2BattleKey=war.id;
 document.documentElement.dataset.kw2BattleCamera=war.__v66?.phase||'rally';
 const result={scale,x:W*.5-x*scale,y:H*.48-y*scale};director.__kw2BattleSample={id:war.id,at:now,target:result};return result;
}
window.__KW2_BATTLE_CAMERA={target};
})();