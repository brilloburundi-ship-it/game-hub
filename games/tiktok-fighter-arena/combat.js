import{S,cfg,clamp,finish,rotate,tierColor}from'./core.js?v=1.1.0';

export function startCombat(canvas){
  const x=canvas.getContext('2d',{alpha:false,desynchronized:true});
  let last=performance.now(),shake=0,flash=0,toastTimer=0,parts=[],floats=[],audio=null;
  let arenaId='sky_dojo',arenaCanvas=null,dpr=1;
  const anchors=new Map();
  const gy=()=>S.h*(S.w<600?.70:.75);
  const tone=(f=220,d=.05,g=.025,t='square')=>{if(!S.started)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),v=audio.createGain();o.type=t;o.frequency.value=f;v.gain.setValueAtTime(g,audio.currentTime);v.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(v);v.connect(audio.destination);o.start();o.stop(audio.currentTime+d)}catch{}};
  const burst=(px,py,c,n=10,p=1)=>{for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=(30+Math.random()*90)*p;parts.push({x:px,y:py,vx:Math.cos(a)*s,vy:Math.sin(a)*s-20,l:.35+Math.random()*.45,m:.8,c,z:2+Math.random()*4})}};
  const float=(px,py,t,c)=>floats.push({x:px,y:py,t,c,l:.8,m:.8});
  const toast=(t,c='#ffd56b')=>{const e=document.querySelector('#eventToast');e.textContent=t;e.style.color=c;e.classList.add('show');toastTimer=1.8};

  function path(c,pts,fill,stroke=null,lw=1){c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke()}}
  function glowCircle(c,cx,cy,r,color,alpha=.7){c.save();c.globalAlpha=alpha;c.shadowColor=color;c.shadowBlur=r*.8;c.fillStyle=color;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fill();c.restore()}
  function floorPerspective(c,w,h,y,horizonColor,lineColor){
    const g=c.createLinearGradient(0,y,0,h);g.addColorStop(0,horizonColor);g.addColorStop(1,'#070712');c.fillStyle=g;c.fillRect(0,y,w,h-y);
    c.strokeStyle=lineColor;c.lineWidth=1;
    for(let i=-8;i<=8;i++){c.beginPath();c.moveTo(w*.5,y);c.lineTo(w*.5+i*w*.12,h);c.stroke()}
    for(let j=0;j<8;j++){const p=j/8,yy=y+(h-y)*(p*p);c.globalAlpha=.22+.4*p;c.beginPath();c.moveTo(0,yy);c.lineTo(w,yy);c.stroke()}c.globalAlpha=1;
  }
  function renderArenaStatic(c,id,w,h){
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    if(id==='neon_city'){
      let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#08091f');g.addColorStop(.56,'#181149');g.addColorStop(1,'#080711');c.fillStyle=g;c.fillRect(0,0,w,h);
      glowCircle(c,w*.25,h*.18,Math.max(60,w*.11),'#e54cff',.18);glowCircle(c,w*.76,h*.22,Math.max(70,w*.12),'#2ceaff',.16);
      const base=h*.58;for(let i=0;i<18;i++){const bw=w*(.035+(i%5)*.012),bh=h*(.12+(i%7)*.028),bx=(i/17)*w-bw*.5;c.fillStyle=i%2?'#0b1028':'#10122f';c.fillRect(bx,base-bh,bw,bh);c.fillStyle=i%3?'#35e5ff':'#ff4fbf';for(let yy=base-bh+12;yy<base-8;yy+=18)for(let xx=bx+6;xx<bx+bw-5;xx+=13){c.globalAlpha=.35+((xx+yy+i)%17)/30;c.fillRect(xx,yy,3,7)}c.globalAlpha=1}
      floorPerspective(c,w,h,h*.59,'#151238','rgba(65,229,255,.34)');
      c.strokeStyle='rgba(255,64,185,.38)';c.lineWidth=2;c.beginPath();c.moveTo(0,h*.73);c.lineTo(w,h*.68);c.stroke();
    }else if(id==='volcanic_ring'){
      let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#16060a');g.addColorStop(.5,'#4c130d');g.addColorStop(1,'#090607');c.fillStyle=g;c.fillRect(0,0,w,h);
      glowCircle(c,w*.52,h*.36,Math.max(85,w*.14),'#ff5b20',.22);
      path(c,[[0,h*.56],[w*.13,h*.39],[w*.24,h*.51],[w*.38,h*.27],[w*.49,h*.5],[w*.63,h*.31],[w*.77,h*.49],[w*.89,h*.36],[w,h*.54],[w,h*.66],[0,h*.66]],'#190c0b');
      floorPerspective(c,w,h,h*.59,'#22100c','rgba(255,94,28,.22)');
      c.strokeStyle='rgba(255,91,32,.8)';c.lineWidth=2;for(let i=0;i<10;i++){const xx=(i+.4)*w/10;c.beginPath();c.moveTo(xx,h*.71);c.lineTo(xx+w*.05*(i%2?1:-1),h*.78);c.lineTo(xx-w*.015,h*.86);c.stroke()}
    }else if(id==='ice_crystal'){
      let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#07172c');g.addColorStop(.46,'#164263');g.addColorStop(1,'#071018');c.fillStyle=g;c.fillRect(0,0,w,h);
      const aur=c.createLinearGradient(0,0,w,0);aur.addColorStop(0,'rgba(80,255,210,0)');aur.addColorStop(.35,'rgba(80,255,210,.22)');aur.addColorStop(.65,'rgba(170,98,255,.18)');aur.addColorStop(1,'rgba(90,214,255,0)');c.fillStyle=aur;c.fillRect(0,h*.1,w,h*.26);
      for(let i=0;i<11;i++){const cx=(i+.35)*w/11,hh=h*(.10+(i%4)*.055),ww=w*(.025+(i%3)*.008);path(c,[[cx-ww,h*.61],[cx,h*.61-hh],[cx+ww,h*.61]],i%2?'#7de7ff':'#b3fbff');}
      floorPerspective(c,w,h,h*.6,'#163342','rgba(166,245,255,.3)');
      c.globalAlpha=.18;c.fillStyle='#d7fbff';c.fillRect(0,h*.61,w,h*.28);c.globalAlpha=1;
    }else if(id==='mecha_forge'){
      let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#10131a');g.addColorStop(.6,'#252024');g.addColorStop(1,'#08090d');c.fillStyle=g;c.fillRect(0,0,w,h);
      c.fillStyle='#1b2028';for(let i=0;i<7;i++)c.fillRect(i*w/7,h*.18,w*.105,h*.41);
      c.strokeStyle='#47515d';c.lineWidth=Math.max(2,w*.004);for(let i=0;i<7;i++){c.beginPath();c.moveTo(i*w/7,h*.18);c.lineTo((i+.5)*w/7,h*.58);c.stroke()}
      glowCircle(c,w*.5,h*.45,Math.max(55,w*.085),'#ff9b2f',.25);c.fillStyle='#5a2b16';c.fillRect(w*.38,h*.38,w*.24,h*.19);c.fillStyle='#ffad36';c.fillRect(w*.405,h*.405,w*.19,h*.11);
      floorPerspective(c,w,h,h*.59,'#20242a','rgba(255,174,62,.21)');
      c.fillStyle='#5a6672';c.fillRect(0,h*.63,w,h*.015);c.fillStyle='#222831';for(let i=0;i<12;i++)c.fillRect(i*w/12,h*.61,w*.045,h*.06);
    }else if(id==='dragon_temple'){
      let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#100b22');g.addColorStop(.48,'#312046');g.addColorStop(1,'#08070d');c.fillStyle=g;c.fillRect(0,0,w,h);
      glowCircle(c,w*.78,h*.16,Math.max(38,w*.06),'#ffe7c2',.72);
      path(c,[[0,h*.52],[w*.16,h*.39],[w*.29,h*.48],[w*.45,h*.31],[w*.61,h*.49],[w*.78,h*.37],[w,h*.51],[w,h*.61],[0,h*.61]],'#0e0c19');
      c.fillStyle='#2b1722';c.fillRect(w*.08,h*.31,w*.055,h*.30);c.fillRect(w*.865,h*.31,w*.055,h*.30);c.fillStyle='#62253c';c.fillRect(w*.06,h*.29,w*.095,h*.025);c.fillRect(w*.845,h*.29,w*.095,h*.025);
      path(c,[[w*.27,h*.36],[w*.5,h*.25],[w*.73,h*.36],[w*.67,h*.39],[w*.5,h*.31],[w*.33,h*.39]],'#341827');
      floorPerspective(c,w,h,h*.59,'#21141d','rgba(255,211,120,.18)');
      for(const xx of [w*.16,w*.84]){c.fillStyle='#6b2a38';c.fillRect(xx-2,h*.42,4,h*.13);glowCircle(c,xx,h*.43,7,'#ffbf54',.8)}
    }else{
      let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#112647');g.addColorStop(.46,'#5c7ea2');g.addColorStop(1,'#0b0d17');c.fillStyle=g;c.fillRect(0,0,w,h);
      glowCircle(c,w*.78,h*.17,Math.max(44,w*.07),'#ffe5ad',.62);
      path(c,[[0,h*.52],[w*.14,h*.39],[w*.25,h*.48],[w*.39,h*.28],[w*.53,h*.49],[w*.68,h*.34],[w*.81,h*.47],[w,h*.35],[w,h*.61],[0,h*.61]],'#203447');
      path(c,[[0,h*.56],[w*.16,h*.47],[w*.31,h*.54],[w*.51,h*.42],[w*.72,h*.53],[w,h*.46],[w,h*.63],[0,h*.63]],'#294b56');
      c.fillStyle='#241b22';c.fillRect(w*.11,h*.36,w*.055,h*.24);c.fillRect(w*.835,h*.36,w*.055,h*.24);c.fillStyle='#5d2736';c.fillRect(w*.09,h*.34,w*.095,h*.025);c.fillRect(w*.815,h*.34,w*.095,h*.025);
      floorPerspective(c,w,h,h*.59,'#2a2527','rgba(255,222,166,.2)');
      c.fillStyle='rgba(227,210,179,.26)';c.fillRect(w*.12,h*.61,w*.76,h*.015);
    }
    const vign=c.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.18,w*.5,h*.48,Math.max(w,h)*.72);vign.addColorStop(.5,'rgba(0,0,0,0)');vign.addColorStop(1,'rgba(0,0,0,.5)');c.fillStyle=vign;c.fillRect(0,0,w,h);
  }
  function rebuildArena(){if(!S.w||!S.h)return;arenaCanvas=document.createElement('canvas');arenaCanvas.width=Math.max(1,Math.round(S.w*dpr));arenaCanvas.height=Math.max(1,Math.round(S.h*dpr));renderArenaStatic(arenaCanvas.getContext('2d'),arenaId,S.w,S.h)}
  const arena=a=>{arenaId=a?.id||'sky_dojo';document.querySelector('#arenaLabel').textContent=(a?.name||'Sky Dojo').toUpperCase();rebuildArena()};
  S.fx={tone,burst,float,toast,arena,flash:v=>flash=Math.max(flash,v)};

  function resize(){S.w=innerWidth;S.h=innerHeight;dpr=Math.min(devicePixelRatio||1,S.w<700?2.25:2.5);canvas.width=Math.round(S.w*dpr);canvas.height=Math.round(S.h*dpr);canvas.style.width=S.w+'px';canvas.style.height=S.h+'px';x.setTransform(dpr,0,0,dpr,0,0);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';rebuildArena()}addEventListener('resize',resize,{passive:true});resize();if(S.manifest)arena(S.manifest.arenas[S.arenaIndex]);

  const meta=(r,n=r.state)=>{const f=cfg(r.fighterId),a=f.animations[n];if(a)return{name:n,a};if(n==='special')return f.animations.attack3?{name:'attack3',a:f.animations.attack3}:f.animations.attack2?{name:'attack2',a:f.animations.attack2}:f.animations.attack1?{name:'attack1',a:f.animations.attack1}:{name:'idle',a:f.animations.idle};if(n==='death'&&!f.animations.death)return f.animations.hurt?{name:'hurt',a:f.animations.hurt}:{name:'idle',a:f.animations.idle};if(n==='fall'&&!f.animations.fall)return{name:'idle',a:f.animations.idle};return{name:'idle',a:f.animations.idle}};
  const anim=(r,n)=>{if(r.state===n)return;r.state=n;r.anim=0;r.time=0;r.hit=false};
  const dur=r=>{const{a}=meta(r);return Math.max(.24,a.frames/a.fps)};
  const attacks=f=>Object.keys(f.animations).filter(k=>/^attack\d+$/.test(k));
  function anchorFor(f,im,m){const key=`${f.atlas}:${m.name}`;if(anchors.has(key))return anchors.get(key);const a=m.a;let out={x:.5,y:.88,top:.18,visibleH:.70};try{const c=document.createElement('canvas');c.width=a.frameW;c.height=a.frameH;const q=c.getContext('2d',{willReadFrequently:true});const samples=Math.min(a.frames,4);let ax=0,ay=0,at=0,ah=0,count=0;for(let s=0;s<samples;s++){const fr=Math.floor(s*Math.max(0,a.frames-1)/Math.max(1,samples-1));q.clearRect(0,0,c.width,c.height);q.drawImage(im,(a.x||0)+fr*a.frameW,a.y||0,a.frameW,a.frameH,0,0,a.frameW,a.frameH);const d=q.getImageData(0,0,a.frameW,a.frameH).data;let minX=a.frameW,minY=a.frameH,maxX=-1,maxY=-1;for(let yy=0;yy<a.frameH;yy+=2)for(let xx=0;xx<a.frameW;xx+=2){const i=(yy*a.frameW+xx)*4,al=d[i+3],lum=d[i]+d[i+1]+d[i+2];if(al>18&&lum>10){if(xx<minX)minX=xx;if(xx>maxX)maxX=xx;if(yy<minY)minY=yy;if(yy>maxY)maxY=yy}}if(maxX>=minX&&maxY>=minY){ax+=((minX+maxX+1)/2)/a.frameW;ay+=(maxY+1)/a.frameH;at+=minY/a.frameH;ah+=Math.max(.12,(maxY-minY+1)/a.frameH);count++}}if(count)out={x:ax/count,y:ay/count,top:at/count,visibleH:ah/count}}catch{}anchors.set(key,out);return out}

  function hit(a,b,strong){if(!b||b.dead||b.inv>0)return;const dist=Math.abs(a.x-b.x),reach=Math.max(54,a.range*Math.min(1.55,S.w/880))+(strong?25:0);if(dist>reach)return;let d=Math.max(2,a.attack*(strong?1.45:1)*(.9+Math.random()*.2)-b.defense*.32);if(b.shield>0){const q=Math.min(b.shield,d);b.shield-=q;d-=q;float(b.x,gy()-132,`SHIELD ${Math.round(q)}`,'#75cfff')}b.hp-=d;a.energy=clamp(a.energy+18,0,100);b.energy=clamp(b.energy+11,0,100);b.flash=.15;b.inv=.12;b.knock=Math.sign(b.x-a.x)*(strong?115:68);anim(b,'hurt');burst(b.x,gy()-70,strong?'#ffd56b':'#ff6579',strong?18:10,strong?1.2:.7);float(b.x,gy()-126,`-${Math.round(d)}`,strong?'#ffd56b':'#ff889a');tone(strong?120:175,.045,.018,'square');shake=Math.max(shake,strong?7:3.5);if(b.hp<=0){b.hp=0;b.dead=true;b.airY=0;anim(b,'death');a.energy=100;finish(b,a)}}

  function fighter(r,e,dt){
    r.time+=dt;r.anim+=dt;r.cool=Math.max(0,r.cool-dt);r.special=Math.max(0,r.special-dt);r.inv=Math.max(0,r.inv-dt);r.flash=Math.max(0,r.flash-dt);r.glow=Math.max(0,r.glow-dt);r.knock*=Math.pow(.04,dt);r.x=clamp(r.x+r.knock*dt,S.w*.08,S.w*.92);r.airY??=0;
    if(r.dead)return;
    const f=cfg(r.fighterId),d=dur(r);
    if(r.state==='hurt'){if(r.time>=d)anim(r,'idle');return}
    if(r.state==='jump'){const p=clamp(r.time/d,0,1);r.airY=-Math.sin(p*Math.PI*.7)*Math.min(48,S.h*.055);if(r.time>=d){if(f.animations.fall)anim(r,'fall');else{r.airY=0;anim(r,'idle')}}return}
    if(r.state==='fall'){const p=clamp(r.time/d,0,1);r.airY=-Math.cos(p*Math.PI*.5)*Math.min(38,S.h*.045);if(r.time>=d){r.airY=0;anim(r,'idle')}return}
    if(r.state==='dash'){const dir=r.side===0?1:-1;r.x=clamp(r.x+dir*170*r.speed*dt,S.w*.08,S.w*.92);if(!r.hit&&r.time>=d*.48){r.hit=true;hit(r,e,true)}if(r.time>=d){r.cool=.5;anim(r,'idle')}return}
    if(/^attack\d+$/.test(r.state)||r.state==='special'){if(!r.hit&&r.time>=d*.54){r.hit=true;hit(r,e,r.state==='special'||r.state==='attack3')}if(r.time>=d){r.cool=.42/Math.max(.85,r.speed);anim(r,'idle')}return}
    const dist=Math.abs(e.x-r.x),want=Math.max(54,r.range*Math.min(1.42,S.w/920));
    if(dist>want+3){if(f.animations.dash&&dist<want*2.4&&r.cool<=0&&Math.random()<.012){anim(r,'dash');return}anim(r,'run');const dir=r.side===0?1:-1,desired=e.x-dir*want,delta=desired-r.x,maxStep=90*r.speed*dt;r.x+=clamp(delta,-maxStep,maxStep);return}
    if(r.cool<=0){const list=attacks(f);if(r.energy>=100||(r.special<=0&&Math.random()<.2)){r.energy=Math.max(0,r.energy-70);r.special=4.5;anim(r,'special')}else if(f.animations.jump&&f.animations.fall&&Math.random()<.08){r.cool=.25;anim(r,'jump')}else anim(r,list.length?list[Math.floor(Math.random()*list.length)]:'attack1');return}
    anim(r,'idle')
  }
  function separate(a,b){if(!a||!b)return;const minGap=Math.max(34,S.w*.025);if(a.x>b.x-minGap){const mid=(a.x+b.x)/2;a.x=clamp(mid-minGap/2,S.w*.08,S.w*.88);b.x=clamp(mid+minGap/2,S.w*.12,S.w*.92);a.knock=Math.min(0,a.knock);b.knock=Math.max(0,b.knock)}}
  function update(dt){if(S.round==='countdown'){S.clock-=dt;if(S.clock<=0){S.round='fighting';S.clock=90;toast('FIGHT!','#ff5aa5');tone(250,.08,.025,'square')}return}if(S.round==='finished'){S.delay-=dt;if(S.delay<=0)rotate();return}if(S.round!=='fighting')return;S.clock=Math.max(0,S.clock-dt);const[a,b]=S.active;if(!a||!b)return;fighter(a,b,dt);fighter(b,a,dt);separate(a,b);if(S.clock<=0&&!a.dead&&!b.dead){const l=a.hp<=b.hp?a:b,w=l===a?b:a;l.hp=0;l.dead=true;l.airY=0;anim(l,'death');finish(l,w)}}

  function dynamicArena(t){
    if(arenaId==='neon_city'){x.save();x.strokeStyle='rgba(110,220,255,.16)';x.lineWidth=1;for(let i=0;i<18;i++){const xx=(i*83+t*95)%S.w,yy=(i*127+t*220)%S.h;x.beginPath();x.moveTo(xx,yy);x.lineTo(xx-12,yy+32);x.stroke()}x.restore()}
    else if(arenaId==='volcanic_ring'||arenaId==='mecha_forge'){x.save();for(let i=0;i<15;i++){const xx=(i*137+t*24)%S.w,yy=gy()+20-((i*61+t*48)%(S.h*.42));x.globalAlpha=.18+(i%4)*.08;x.fillStyle=arenaId==='volcanic_ring'?'#ff6a2a':'#ffc15b';x.fillRect(xx,yy,2+(i%3),2+(i%3))}x.restore()}
    else if(arenaId==='sky_dojo'){x.save();x.globalAlpha=.08;x.fillStyle='#fff';for(let i=0;i<5;i++){const yy=S.h*(.18+i*.07),xx=((i*190+t*12)%(S.w+220))-110;x.beginPath();x.ellipse(xx,yy,80,13,0,0,Math.PI*2);x.fill()}x.restore()}
  }
  function bg(t){x.save();x.setTransform(dpr,0,0,dpr,0,0);x.fillStyle='#080511';x.fillRect(0,0,S.w,S.h);if(shake>0){x.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.86}if(arenaCanvas){x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(arenaCanvas,0,0,arenaCanvas.width,arenaCanvas.height,0,0,S.w,S.h)}dynamicArena(t);const g=x.createLinearGradient(0,0,0,S.h);g.addColorStop(0,'rgba(4,3,12,.20)');g.addColorStop(.55,'rgba(4,3,12,.02)');g.addColorStop(1,'rgba(4,2,10,.62)');x.fillStyle=g;x.fillRect(0,0,S.w,S.h);x.fillStyle='rgba(8,5,15,.26)';x.fillRect(0,gy()+18,S.w,S.h-gy());x.strokeStyle='rgba(255,214,107,.18)';x.beginPath();x.moveTo(S.w*.08,gy()+16);x.lineTo(S.w*.92,gy()+16);x.stroke();x.restore()}

  function fallbackPose(r){const s=r.state,t=r.time;let bob=0,leg=Math.sin(t*11)*.55,arm=-leg,lean=0,attack=0,dead=0;if(s==='idle')bob=Math.sin(t*4)*2;if(s==='run'){bob=Math.sin(t*12)*3;lean=.08}else if(/^attack/.test(s)||s==='special'||s==='dash'){const p=clamp(t/Math.max(.24,dur(r)),0,1);attack=Math.sin(p*Math.PI)*1.25;lean=.15*Math.sin(p*Math.PI)}else if(s==='hurt')lean=-.28;else if(s==='death')dead=clamp(t/Math.max(.3,dur(r)),0,1)*1.35;return{bob,leg,arm,lean,attack,dead}}
  function drawFallbackFighter(r,f,targetVisible){
    const y=gy()+(r.airY||0),sc=targetVisible/150,p=fallbackPose(r),accent=tierColor(f.tier),body=r.viewer.color||accent;x.save();x.translate(r.x,y);if(r.side===1)x.scale(-1,1);x.rotate(p.dead);x.translate(0,-p.bob);x.shadowColor=accent;x.shadowBlur=r.glow>0?24:10;x.globalAlpha=r.flash>0?.72:1;
    const line=Math.max(5,8*sc);x.lineCap='round';x.lineJoin='round';x.strokeStyle='#11131a';x.lineWidth=line+3*sc;
    const hipY=-54*sc,shoulderY=-103*sc,headY=-127*sc;
    function limb(ax,ay,bx,by,c=body,w=line){x.strokeStyle='#11131a';x.lineWidth=w+3*sc;x.beginPath();x.moveTo(ax,ay);x.lineTo(bx,by);x.stroke();x.strokeStyle=c;x.lineWidth=w;x.beginPath();x.moveTo(ax,ay);x.lineTo(bx,by);x.stroke()}
    limb(-12*sc,hipY,-18*sc+Math.sin(p.leg)*23*sc,0,body);limb(12*sc,hipY,18*sc-Math.sin(p.leg)*23*sc,0,body);
    x.fillStyle=body;x.strokeStyle='#11131a';x.lineWidth=3*sc;x.beginPath();x.roundRect(-25*sc,-111*sc,50*sc,62*sc,12*sc);x.fill();x.stroke();
    limb(-21*sc,shoulderY,-40*sc+Math.sin(p.arm)*18*sc,-63*sc,body);limb(21*sc,shoulderY,42*sc+Math.sin(p.attack)*38*sc,-82*sc+p.attack*10*sc,accent,line*.88);
    x.fillStyle='#e9c6a7';x.beginPath();x.arc(0,headY,17*sc,0,Math.PI*2);x.fill();x.strokeStyle='#11131a';x.lineWidth=3*sc;x.stroke();
    x.fillStyle=accent;x.fillRect(-17*sc,-145*sc,34*sc,7*sc);
    const name=f.name.toLowerCase();if(/knight|king|samurai/.test(name)){x.strokeStyle='#f4e7bf';x.lineWidth=4*sc;x.beginPath();x.moveTo(38*sc,-82*sc);x.lineTo((66+28*p.attack)*sc,(-112+8*p.attack)*sc);x.stroke();x.strokeStyle=accent;x.lineWidth=2*sc;x.stroke()}else if(/wizard|mage/.test(name)){limb(36*sc,-80*sc,61*sc,-116*sc,'#6d4a33',4*sc);glowCircle(x,63*sc,-121*sc,7*sc,accent,.95)}else if(/huntress/.test(name)){x.strokeStyle='#e9d5a6';x.lineWidth=3*sc;x.beginPath();x.moveTo(38*sc,-79*sc);x.lineTo((78+25*p.attack)*sc,-88*sc);x.stroke()}
    x.restore();
  }
  function draw(r){if(!r)return;const f=cfg(r.fighterId),im=S.images.get(f.atlas)||S.images.get(`./${f.atlas.replace(/^\.\//,'')}`),targetVisible=S.w<600?Math.min(156,S.h*.235):Math.min(205,S.h*.29);if(!im){drawFallbackFighter(r,f,targetVisible);drawLabels(r,targetVisible);return}const m=meta(r),a=m.a;let fr=Math.floor(r.anim*a.fps);fr=a.loop?fr%a.frames:Math.min(a.frames-1,fr);const an=anchorFor(f,im,m),visiblePx=Math.max(8,an.visibleH*a.frameH),sc=clamp(targetVisible/visiblePx,.62,5.2),W=a.frameW*sc,H=a.frameH*sc,dx=r.x-an.x*a.frameW*sc,dy=gy()+(r.airY||0)-an.y*a.frameH*sc;x.save();x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';if(r.glow>0){x.shadowColor=tierColor(f.tier);x.shadowBlur=16+r.glow*10}if(r.flash>0)x.globalAlpha=.64+Math.random()*.3;if(r.side===1){x.translate(r.x,0);x.scale(-1,1);x.translate(-r.x,0)}x.drawImage(im,(a.x||0)+fr*a.frameW,a.y||0,a.frameW,a.frameH,dx,dy,W,H);x.restore();drawLabels(r,targetVisible,(an.y-an.top)*a.frameH*sc)}
  function drawLabels(r,targetVisible,headOffset=targetVisible*.78){const yy=gy()+(r.airY||0);x.globalAlpha=.34;x.fillStyle='#000';x.beginPath();x.ellipse(r.x,gy()+7,Math.max(22,targetVisible*.18),7,0,0,Math.PI*2);x.fill();x.globalAlpha=1;if(r.shield>0){x.strokeStyle='rgba(86,215,255,.72)';x.lineWidth=1.5;x.beginPath();x.ellipse(r.x,yy-targetVisible*.48,targetVisible*.28,targetVisible*.40,0,0,Math.PI*2);x.stroke()}x.textAlign='center';x.font='700 11px system-ui';x.fillStyle='#fff';x.fillText(r.viewer.name,r.x,yy-headOffset-9)}
  function fx(dt){for(const p of parts){p.l-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=90*dt}parts=parts.filter(p=>p.l>0);for(const f of floats){f.l-=dt;f.y-=24*dt}floats=floats.filter(f=>f.l>0);for(const p of parts){x.globalAlpha=clamp(p.l/p.m,0,1);x.fillStyle=p.c;x.fillRect(p.x,p.y,p.z,p.z)}for(const f of floats){x.globalAlpha=clamp(f.l/f.m,0,1);x.fillStyle=f.c;x.font='800 12px system-ui';x.textAlign='center';x.fillText(f.t,f.x,f.y)}x.globalAlpha=1;if(flash>0){flash=Math.max(0,flash-dt);x.fillStyle=`rgba(255,255,255,${Math.min(.22,flash)})`;x.fillRect(0,0,S.w,S.h)}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)document.querySelector('#eventToast').classList.remove('show')}}
  function loop(t){const dt=Math.min(.033,(t-last)/1000||0);last=t;if(S.started)update(dt);bg(t/1000);if(S.started){draw(S.active[0]);draw(S.active[1]);fx(dt)}requestAnimationFrame(loop)}requestAnimationFrame(loop);return{tone}}
}
