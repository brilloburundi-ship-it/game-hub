import{S,cfg,clamp,finish,rotate,tierColor}from'./core.js?v=1.1.0';

export function startCombat(canvas){
  const ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
  let last=performance.now(),dpr=1,shake=0,flash=0,toastTimer=0,audio=null;
  let arenaId='sky_dojo',arenaCanvas=null,particles=[],floats=[];
  const anchors=new Map();
  const groundY=()=>S.h*(S.w<600?.70:.75);

  const tone=(freq=220,duration=.05,gain=.025,type='square')=>{
    if(!S.started)return;
    try{
      audio??=new(window.AudioContext||window.webkitAudioContext)();
      if(audio.state==='suspended')audio.resume();
      const osc=audio.createOscillator(),vol=audio.createGain();
      osc.type=type;osc.frequency.value=freq;
      vol.gain.setValueAtTime(gain,audio.currentTime);
      vol.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
      osc.connect(vol);vol.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
    }catch{}
  };

  function burst(px,py,color,count=10,power=1){
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,speed=(30+Math.random()*90)*power;
      particles.push({x:px,y:py,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-20,l:.35+Math.random()*.45,m:.8,c:color,z:2+Math.random()*4});
    }
  }
  const floatText=(px,py,text,color)=>floats.push({x:px,y:py,t:text,c:color,l:.8,m:.8});
  function toast(text,color='#ffd56b'){
    const el=document.querySelector('#eventToast');
    if(!el)return;
    el.textContent=text;el.style.color=color;el.classList.add('show');toastTimer=1.8;
  }

  function poly(c,pts,fill,stroke=null,width=1){
    c.beginPath();c.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);
    c.closePath();
    if(fill){c.fillStyle=fill;c.fill()}
    if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}
  }
  function glow(c,cx,cy,r,color,alpha=.65){
    c.save();c.globalAlpha=alpha;c.shadowColor=color;c.shadowBlur=r*.75;c.fillStyle=color;
    c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fill();c.restore();
  }
  function perspectiveFloor(c,w,h,y,base,line){
    const g=c.createLinearGradient(0,y,0,h);g.addColorStop(0,base);g.addColorStop(1,'#070711');
    c.fillStyle=g;c.fillRect(0,y,w,h-y);
    c.strokeStyle=line;c.lineWidth=1;
    for(let i=-8;i<=8;i++){c.beginPath();c.moveTo(w*.5,y);c.lineTo(w*.5+i*w*.12,h);c.stroke()}
    for(let j=0;j<8;j++){const p=j/8,yy=y+(h-y)*p*p;c.globalAlpha=.2+.45*p;c.beginPath();c.moveTo(0,yy);c.lineTo(w,yy);c.stroke()}
    c.globalAlpha=1;
  }
  function columns(c,w,h,color,accent){
    c.fillStyle=color;
    for(const px of [w*.1,w*.9]){
      c.fillRect(px-w*.018,h*.31,w*.036,h*.29);
      c.fillRect(px-w*.035,h*.29,w*.07,h*.025);
      c.fillRect(px-w*.035,h*.59,w*.07,h*.025);
      c.fillStyle=accent;c.fillRect(px-w*.022,h*.37,w*.044,h*.008);c.fillStyle=color;
    }
  }

  function renderArenaStatic(c,id,w,h){
    c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,w,h);
    c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';

    if(id==='neon_city'){
      const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#06091c');g.addColorStop(.55,'#1d1350');g.addColorStop(1,'#080711');c.fillStyle=g;c.fillRect(0,0,w,h);
      glow(c,w*.24,h*.18,Math.max(58,w*.1),'#e94dff',.18);glow(c,w*.77,h*.22,Math.max(65,w*.11),'#2ceaff',.16);
      const base=h*.58;
      for(let i=0;i<18;i++){
        const bw=w*(.035+(i%5)*.012),bh=h*(.12+(i%7)*.028),bx=i*w/17-bw*.5;
        c.fillStyle=i%2?'#0b1028':'#10122f';c.fillRect(bx,base-bh,bw,bh);
        c.fillStyle=i%3?'#35e5ff':'#ff4fbf';
        for(let yy=base-bh+12;yy<base-8;yy+=18)for(let xx=bx+6;xx<bx+bw-5;xx+=13){c.globalAlpha=.35+((xx+yy+i)%17)/30;c.fillRect(xx,yy,3,7)}
        c.globalAlpha=1;
      }
      perspectiveFloor(c,w,h,h*.59,'#151238','rgba(65,229,255,.34)');
    }else if(id==='volcanic_ring'){
      const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#150509');g.addColorStop(.5,'#4b130c');g.addColorStop(1,'#090607');c.fillStyle=g;c.fillRect(0,0,w,h);
      glow(c,w*.52,h*.37,Math.max(82,w*.14),'#ff5b20',.22);
      poly(c,[[0,h*.56],[w*.13,h*.39],[w*.24,h*.51],[w*.38,h*.27],[w*.49,h*.5],[w*.63,h*.31],[w*.77,h*.49],[w*.89,h*.36],[w,h*.54],[w,h*.66],[0,h*.66]],'#190c0b');
      perspectiveFloor(c,w,h,h*.59,'#22100c','rgba(255,94,28,.25)');
      c.strokeStyle='rgba(255,91,32,.75)';c.lineWidth=2;
      for(let i=0;i<10;i++){const xx=(i+.4)*w/10;c.beginPath();c.moveTo(xx,h*.71);c.lineTo(xx+w*.05*(i%2?1:-1),h*.78);c.lineTo(xx-w*.015,h*.86);c.stroke()}
    }else if(id==='ice_crystal'){
      const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#07172c');g.addColorStop(.46,'#164263');g.addColorStop(1,'#071018');c.fillStyle=g;c.fillRect(0,0,w,h);
      const aur=c.createLinearGradient(0,0,w,0);aur.addColorStop(0,'rgba(80,255,210,0)');aur.addColorStop(.35,'rgba(80,255,210,.22)');aur.addColorStop(.65,'rgba(170,98,255,.18)');aur.addColorStop(1,'rgba(90,214,255,0)');c.fillStyle=aur;c.fillRect(0,h*.1,w,h*.26);
      for(let i=0;i<11;i++){const cx=(i+.35)*w/11,hh=h*(.1+(i%4)*.055),ww=w*(.025+(i%3)*.008);poly(c,[[cx-ww,h*.61],[cx,h*.61-hh],[cx+ww,h*.61]],i%2?'#7de7ff':'#b3fbff')}
      perspectiveFloor(c,w,h,h*.6,'#163342','rgba(166,245,255,.3)');
    }else if(id==='mecha_forge'){
      const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#10131a');g.addColorStop(.6,'#252024');g.addColorStop(1,'#08090d');c.fillStyle=g;c.fillRect(0,0,w,h);
      c.fillStyle='#1b2028';for(let i=0;i<7;i++)c.fillRect(i*w/7,h*.18,w*.105,h*.41);
      c.strokeStyle='#47515d';c.lineWidth=Math.max(2,w*.004);for(let i=0;i<7;i++){c.beginPath();c.moveTo(i*w/7,h*.18);c.lineTo((i+.5)*w/7,h*.58);c.stroke()}
      glow(c,w*.5,h*.45,Math.max(55,w*.085),'#ff9b2f',.25);c.fillStyle='#5a2b16';c.fillRect(w*.38,h*.38,w*.24,h*.19);c.fillStyle='#ffad36';c.fillRect(w*.405,h*.405,w*.19,h*.11);
      perspectiveFloor(c,w,h,h*.59,'#20242a','rgba(255,174,62,.22)');
    }else if(id==='dragon_temple'){
      const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#100b22');g.addColorStop(.48,'#312046');g.addColorStop(1,'#08070d');c.fillStyle=g;c.fillRect(0,0,w,h);
      glow(c,w*.78,h*.16,Math.max(38,w*.06),'#ffe7c2',.72);
      poly(c,[[0,h*.52],[w*.16,h*.39],[w*.29,h*.48],[w*.45,h*.31],[w*.61,h*.49],[w*.78,h*.37],[w,h*.51],[w,h*.61],[0,h*.61]],'#0e0c19');
      columns(c,w,h,'#2b1722','#8a3c55');
      poly(c,[[w*.27,h*.36],[w*.5,h*.25],[w*.73,h*.36],[w*.67,h*.39],[w*.5,h*.31],[w*.33,h*.39]],'#341827');
      perspectiveFloor(c,w,h,h*.59,'#21141d','rgba(255,211,120,.18)');
    }else{
      const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#112647');g.addColorStop(.46,'#5c7ea2');g.addColorStop(1,'#0b0d17');c.fillStyle=g;c.fillRect(0,0,w,h);
      glow(c,w*.78,h*.17,Math.max(44,w*.07),'#ffe5ad',.62);
      poly(c,[[0,h*.52],[w*.14,h*.39],[w*.25,h*.48],[w*.39,h*.28],[w*.53,h*.49],[w*.68,h*.34],[w*.81,h*.47],[w,h*.35],[w,h*.61],[0,h*.61]],'#203447');
      poly(c,[[0,h*.56],[w*.16,h*.47],[w*.31,h*.54],[w*.51,h*.42],[w*.72,h*.53],[w,h*.46],[w,h*.63],[0,h*.63]],'#294b56');
      columns(c,w,h,'#241b22','#714052');
      perspectiveFloor(c,w,h,h*.59,'#2a2527','rgba(255,222,166,.2)');
    }
    const vignette=c.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.18,w*.5,h*.48,Math.max(w,h)*.72);
    vignette.addColorStop(.5,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.5)');
    c.fillStyle=vignette;c.fillRect(0,0,w,h);
  }

  function rebuildArena(){
    if(!S.w||!S.h)return;
    arenaCanvas=document.createElement('canvas');
    arenaCanvas.width=Math.max(1,Math.round(S.w*dpr));
    arenaCanvas.height=Math.max(1,Math.round(S.h*dpr));
    renderArenaStatic(arenaCanvas.getContext('2d'),arenaId,S.w,S.h);
  }
  function setArenaVisual(arena){
    arenaId=arena?.id||'sky_dojo';
    const label=document.querySelector('#arenaLabel');
    if(label)label.textContent=(arena?.name||'Sky Dojo').toUpperCase();
    rebuildArena();
  }
  S.fx={tone,burst,float:floatText,toast,arena:setArenaVisual,flash:value=>{flash=Math.max(flash,value)}};

  function resize(){
    S.w=innerWidth;S.h=innerHeight;
    dpr=Math.min(devicePixelRatio||1,S.w<700?2.25:2.5);
    canvas.width=Math.round(S.w*dpr);canvas.height=Math.round(S.h*dpr);
    canvas.style.width=`${S.w}px`;canvas.style.height=`${S.h}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    rebuildArena();
  }
  addEventListener('resize',resize,{passive:true});resize();
  if(S.manifest)setArenaVisual(S.manifest.arenas[S.arenaIndex]);

  function animationMeta(runtime,state=runtime.state){
    const fighter=cfg(runtime.fighterId),direct=fighter.animations[state];
    if(direct)return{name:state,a:direct};
    if(state==='special'){
      for(const name of ['attack3','attack2','attack1'])if(fighter.animations[name])return{name,a:fighter.animations[name]};
    }
    if(state==='death'&&!fighter.animations.death)return fighter.animations.hurt?{name:'hurt',a:fighter.animations.hurt}:{name:'idle',a:fighter.animations.idle};
    if(state==='fall'&&!fighter.animations.fall)return{name:'idle',a:fighter.animations.idle};
    return{name:'idle',a:fighter.animations.idle};
  }
  function setAnimation(runtime,state){
    if(runtime.state===state)return;
    runtime.state=state;runtime.anim=0;runtime.time=0;runtime.hit=false;
  }
  const animationDuration=runtime=>{const {a}=animationMeta(runtime);return Math.max(.24,a.frames/a.fps)};
  const attackNames=fighter=>Object.keys(fighter.animations).filter(name=>/^attack\d+$/.test(name));

  function anchorFor(fighter,image,meta){
    const cacheKey=`${fighter.atlas}:${meta.name}`;
    if(anchors.has(cacheKey))return anchors.get(cacheKey);
    const a=meta.a;let out={x:.5,y:.88,top:.18,visibleH:.7};
    try{
      const work=document.createElement('canvas');work.width=a.frameW;work.height=a.frameH;
      const q=work.getContext('2d',{willReadFrequently:true});
      const samples=Math.min(a.frames,4);let sx=0,sy=0,st=0,sh=0,count=0;
      for(let sample=0;sample<samples;sample++){
        const frame=Math.floor(sample*Math.max(0,a.frames-1)/Math.max(1,samples-1));
        q.clearRect(0,0,a.frameW,a.frameH);
        q.drawImage(image,(a.x||0)+frame*a.frameW,a.y||0,a.frameW,a.frameH,0,0,a.frameW,a.frameH);
        const pixels=q.getImageData(0,0,a.frameW,a.frameH).data;
        let minX=a.frameW,minY=a.frameH,maxX=-1,maxY=-1;
        for(let yy=0;yy<a.frameH;yy+=2)for(let xx=0;xx<a.frameW;xx+=2){
          const i=(yy*a.frameW+xx)*4,alpha=pixels[i+3],lum=pixels[i]+pixels[i+1]+pixels[i+2];
          if(alpha>18&&lum>10){minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy)}
        }
        if(maxX>=minX&&maxY>=minY){sx+=((minX+maxX+1)/2)/a.frameW;sy+=(maxY+1)/a.frameH;st+=minY/a.frameH;sh+=Math.max(.12,(maxY-minY+1)/a.frameH);count++}
      }
      if(count)out={x:sx/count,y:sy/count,top:st/count,visibleH:sh/count};
    }catch{}
    anchors.set(cacheKey,out);return out;
  }

  function hit(attacker,defender,strong=false){
    if(!defender||defender.dead||defender.inv>0)return;
    const distance=Math.abs(attacker.x-defender.x);
    const reach=Math.max(54,attacker.range*Math.min(1.55,S.w/880))+(strong?25:0);
    if(distance>reach)return;
    let damage=Math.max(2,attacker.attack*(strong?1.45:1)*(.9+Math.random()*.2)-defender.defense*.32);
    if(defender.shield>0){
      const blocked=Math.min(defender.shield,damage);defender.shield-=blocked;damage-=blocked;
      floatText(defender.x,groundY()-132,`SHIELD ${Math.round(blocked)}`,'#75cfff');
    }
    defender.hp-=damage;attacker.energy=clamp(attacker.energy+18,0,100);defender.energy=clamp(defender.energy+11,0,100);
    defender.flash=.15;defender.inv=.12;defender.knock=Math.sign(defender.x-attacker.x)*(strong?115:68);
    setAnimation(defender,'hurt');burst(defender.x,groundY()-70,strong?'#ffd56b':'#ff6579',strong?18:10,strong?1.2:.7);
    floatText(defender.x,groundY()-126,`-${Math.round(damage)}`,strong?'#ffd56b':'#ff889a');
    tone(strong?120:175,.045,.018,'square');shake=Math.max(shake,strong?7:3.5);
    if(defender.hp<=0){
      defender.hp=0;defender.dead=true;defender.airY=0;setAnimation(defender,'death');attacker.energy=100;finish(defender,attacker);
    }
  }

  function updateFighter(runtime,enemy,dt){
    runtime.time+=dt;runtime.anim+=dt;runtime.cool=Math.max(0,runtime.cool-dt);runtime.special=Math.max(0,runtime.special-dt);
    runtime.inv=Math.max(0,runtime.inv-dt);runtime.flash=Math.max(0,runtime.flash-dt);runtime.glow=Math.max(0,runtime.glow-dt);
    runtime.knock*=Math.pow(.04,dt);runtime.x=clamp(runtime.x+runtime.knock*dt,S.w*.08,S.w*.92);runtime.airY??=0;
    if(runtime.dead)return;
    const fighter=cfg(runtime.fighterId),duration=animationDuration(runtime);

    if(runtime.state==='hurt'){if(runtime.time>=duration)setAnimation(runtime,'idle');return}
    if(runtime.state==='jump'){
      const p=clamp(runtime.time/duration,0,1);runtime.airY=-Math.sin(p*Math.PI*.7)*Math.min(48,S.h*.055);
      if(runtime.time>=duration){if(fighter.animations.fall)setAnimation(runtime,'fall');else{runtime.airY=0;setAnimation(runtime,'idle')}}return;
    }
    if(runtime.state==='fall'){
      const p=clamp(runtime.time/duration,0,1);runtime.airY=-Math.cos(p*Math.PI*.5)*Math.min(38,S.h*.045);
      if(runtime.time>=duration){runtime.airY=0;setAnimation(runtime,'idle')}return;
    }
    if(runtime.state==='dash'){
      const direction=runtime.side===0?1:-1;runtime.x=clamp(runtime.x+direction*170*runtime.speed*dt,S.w*.08,S.w*.92);
      if(!runtime.hit&&runtime.time>=duration*.48){runtime.hit=true;hit(runtime,enemy,true)}
      if(runtime.time>=duration){runtime.cool=.5;setAnimation(runtime,'idle')}return;
    }
    if(/^attack\d+$/.test(runtime.state)||runtime.state==='special'){
      if(!runtime.hit&&runtime.time>=duration*.54){runtime.hit=true;hit(runtime,enemy,runtime.state==='special'||runtime.state==='attack3')}
      if(runtime.time>=duration){runtime.cool=.42/Math.max(.85,runtime.speed);setAnimation(runtime,'idle')}return;
    }

    const distance=Math.abs(enemy.x-runtime.x),wanted=Math.max(54,runtime.range*Math.min(1.42,S.w/920));
    if(distance>wanted+3){
      if(fighter.animations.dash&&distance<wanted*2.4&&runtime.cool<=0&&Math.random()<.012){setAnimation(runtime,'dash');return}
      setAnimation(runtime,'run');
      const direction=runtime.side===0?1:-1,desired=enemy.x-direction*wanted,delta=desired-runtime.x,maxStep=90*runtime.speed*dt;
      runtime.x+=clamp(delta,-maxStep,maxStep);return;
    }
    if(runtime.cool<=0){
      const list=attackNames(fighter);
      if(runtime.energy>=100||(runtime.special<=0&&Math.random()<.2)){runtime.energy=Math.max(0,runtime.energy-70);runtime.special=4.5;setAnimation(runtime,'special')}
      else if(fighter.animations.jump&&fighter.animations.fall&&Math.random()<.08){runtime.cool=.25;setAnimation(runtime,'jump')}
      else setAnimation(runtime,list.length?list[Math.floor(Math.random()*list.length)]:'attack1');
      return;
    }
    setAnimation(runtime,'idle');
  }

  function separate(a,b){
    if(!a||!b)return;
    const minGap=Math.max(34,S.w*.025);
    if(a.x>b.x-minGap){
      const mid=(a.x+b.x)/2;a.x=clamp(mid-minGap/2,S.w*.08,S.w*.88);b.x=clamp(mid+minGap/2,S.w*.12,S.w*.92);
      a.knock=Math.min(0,a.knock);b.knock=Math.max(0,b.knock);
    }
  }
  function update(dt){
    if(S.round==='countdown'){S.clock-=dt;if(S.clock<=0){S.round='fighting';S.clock=90;toast('FIGHT!','#ff5aa5');tone(250,.08,.025,'square')}return}
    if(S.round==='finished'){S.delay-=dt;if(S.delay<=0)rotate();return}
    if(S.round!=='fighting')return;
    S.clock=Math.max(0,S.clock-dt);
    const [a,b]=S.active;if(!a||!b)return;
    updateFighter(a,b,dt);updateFighter(b,a,dt);separate(a,b);
    if(S.clock<=0&&!a.dead&&!b.dead){
      const loser=a.hp<=b.hp?a:b,winner=loser===a?b:a;loser.hp=0;loser.dead=true;loser.airY=0;setAnimation(loser,'death');finish(loser,winner);
    }
  }

  function animateArena(t){
    if(arenaId==='neon_city'){
      ctx.save();ctx.strokeStyle='rgba(110,220,255,.16)';ctx.lineWidth=1;
      for(let i=0;i<18;i++){const xx=(i*83+t*95)%S.w,yy=(i*127+t*220)%S.h;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx-12,yy+32);ctx.stroke()}ctx.restore();
    }else if(arenaId==='volcanic_ring'||arenaId==='mecha_forge'){
      ctx.save();
      for(let i=0;i<15;i++){const xx=(i*137+t*24)%S.w,yy=groundY()+20-((i*61+t*48)%(S.h*.42));ctx.globalAlpha=.18+(i%4)*.08;ctx.fillStyle=arenaId==='volcanic_ring'?'#ff6a2a':'#ffc15b';ctx.fillRect(xx,yy,2+(i%3),2+(i%3))}
      ctx.restore();
    }else if(arenaId==='sky_dojo'){
      ctx.save();ctx.globalAlpha=.08;ctx.fillStyle='#fff';
      for(let i=0;i<5;i++){const yy=S.h*(.18+i*.07),xx=((i*190+t*12)%(S.w+220))-110;ctx.beginPath();ctx.ellipse(xx,yy,80,13,0,0,Math.PI*2);ctx.fill()}ctx.restore();
    }
  }

  function drawBackground(t){
    ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#080511';ctx.fillRect(0,0,S.w,S.h);
    if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.86}
    if(arenaCanvas){
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(arenaCanvas,0,0,arenaCanvas.width,arenaCanvas.height,0,0,S.w,S.h);
    }
    animateArena(t);
    const g=ctx.createLinearGradient(0,0,0,S.h);g.addColorStop(0,'rgba(4,3,12,.2)');g.addColorStop(.55,'rgba(4,3,12,.02)');g.addColorStop(1,'rgba(4,2,10,.62)');
    ctx.fillStyle=g;ctx.fillRect(0,0,S.w,S.h);ctx.fillStyle='rgba(8,5,15,.26)';ctx.fillRect(0,groundY()+18,S.w,S.h-groundY());
    ctx.strokeStyle='rgba(255,214,107,.18)';ctx.beginPath();ctx.moveTo(S.w*.08,groundY()+16);ctx.lineTo(S.w*.92,groundY()+16);ctx.stroke();ctx.restore();
  }

  function fallbackPose(runtime){
    const state=runtime.state,t=runtime.time;let bob=0,leg=Math.sin(t*11)*.55,arm=-leg,attack=0,dead=0;
    if(state==='idle')bob=Math.sin(t*4)*2;
    if(state==='run')bob=Math.sin(t*12)*3;
    if(/^attack/.test(state)||state==='special'||state==='dash'){const p=clamp(t/Math.max(.24,animationDuration(runtime)),0,1);attack=Math.sin(p*Math.PI)*1.25}
    if(state==='death')dead=clamp(t/Math.max(.3,animationDuration(runtime)),0,1)*1.35;
    return{bob,leg,arm,attack,dead};
  }
  function drawFallbackFighter(runtime,fighter,targetVisible){
    const y=groundY()+(runtime.airY||0),scale=targetVisible/150,pose=fallbackPose(runtime),accent=tierColor(fighter.tier),body=runtime.viewer.color||accent;
    ctx.save();ctx.translate(runtime.x,y);if(runtime.side===1)ctx.scale(-1,1);ctx.rotate(pose.dead);ctx.translate(0,-pose.bob);
    ctx.shadowColor=accent;ctx.shadowBlur=runtime.glow>0?24:10;ctx.globalAlpha=runtime.flash>0?.72:1;
    const line=Math.max(5,8*scale),hip=-54*scale,shoulder=-103*scale,head=-127*scale;
    function limb(ax,ay,bx,by,color=body,width=line){ctx.strokeStyle='#11131a';ctx.lineWidth=width+3*scale;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke()}
    ctx.lineCap='round';ctx.lineJoin='round';
    limb(-12*scale,hip,-18*scale+Math.sin(pose.leg)*23*scale,0);limb(12*scale,hip,18*scale-Math.sin(pose.leg)*23*scale,0);
    ctx.fillStyle=body;ctx.strokeStyle='#11131a';ctx.lineWidth=3*scale;ctx.beginPath();ctx.roundRect(-25*scale,-111*scale,50*scale,62*scale,12*scale);ctx.fill();ctx.stroke();
    limb(-21*scale,shoulder,-40*scale+Math.sin(pose.arm)*18*scale,-63*scale);limb(21*scale,shoulder,42*scale+Math.sin(pose.attack)*38*scale,-82*scale+pose.attack*10*scale,accent,line*.88);
    ctx.fillStyle='#e9c6a7';ctx.beginPath();ctx.arc(0,head,17*scale,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#11131a';ctx.lineWidth=3*scale;ctx.stroke();
    ctx.fillStyle=accent;ctx.fillRect(-17*scale,-145*scale,34*scale,7*scale);
    const name=fighter.name.toLowerCase();
    if(/knight|king|samurai/.test(name)){ctx.strokeStyle='#f4e7bf';ctx.lineWidth=4*scale;ctx.beginPath();ctx.moveTo(38*scale,-82*scale);ctx.lineTo((66+28*pose.attack)*scale,(-112+8*pose.attack)*scale);ctx.stroke()}
    else if(/wizard|mage/.test(name)){limb(36*scale,-80*scale,61*scale,-116*scale,'#6d4a33',4*scale);glow(ctx,63*scale,-121*scale,7*scale,accent,.95)}
    else if(/huntress/.test(name)){ctx.strokeStyle='#e9d5a6';ctx.lineWidth=3*scale;ctx.beginPath();ctx.moveTo(38*scale,-79*scale);ctx.lineTo((78+25*pose.attack)*scale,-88*scale);ctx.stroke()}
    ctx.restore();
  }

  function drawLabels(runtime,targetVisible,headOffset=targetVisible*.78){
    const yy=groundY()+(runtime.airY||0);
    ctx.globalAlpha=.34;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(runtime.x,groundY()+7,Math.max(22,targetVisible*.18),7,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    if(runtime.shield>0){ctx.strokeStyle='rgba(86,215,255,.72)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(runtime.x,yy-targetVisible*.48,targetVisible*.28,targetVisible*.4,0,0,Math.PI*2);ctx.stroke()}
    ctx.textAlign='center';ctx.font='700 11px system-ui';ctx.fillStyle='#fff';ctx.fillText(runtime.viewer.name,runtime.x,yy-headOffset-9);
  }
  function drawFighter(runtime){
    if(!runtime)return;
    const fighter=cfg(runtime.fighterId),image=S.images.get(fighter.atlas)||S.images.get(`./${fighter.atlas.replace(/^\.\//,'')}`);
    const targetVisible=S.w<600?Math.min(156,S.h*.235):Math.min(205,S.h*.29);
    if(!image){drawFallbackFighter(runtime,fighter,targetVisible);drawLabels(runtime,targetVisible);return}
    const meta=animationMeta(runtime),a=meta.a;
    let frame=Math.floor(runtime.anim*a.fps);frame=a.loop?frame%a.frames:Math.min(a.frames-1,frame);
    const anchor=anchorFor(fighter,image,meta),visiblePx=Math.max(8,anchor.visibleH*a.frameH),scale=clamp(targetVisible/visiblePx,.62,5.2);
    const W=a.frameW*scale,H=a.frameH*scale,dx=runtime.x-anchor.x*a.frameW*scale,dy=groundY()+(runtime.airY||0)-anchor.y*a.frameH*scale;
    ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(runtime.glow>0){ctx.shadowColor=tierColor(fighter.tier);ctx.shadowBlur=16+runtime.glow*10}
    if(runtime.flash>0)ctx.globalAlpha=.64+Math.random()*.3;
    if(runtime.side===1){ctx.translate(runtime.x,0);ctx.scale(-1,1);ctx.translate(-runtime.x,0)}
    ctx.drawImage(image,(a.x||0)+frame*a.frameW,a.y||0,a.frameW,a.frameH,dx,dy,W,H);ctx.restore();
    drawLabels(runtime,targetVisible,(anchor.y-anchor.top)*a.frameH*scale);
  }

  function drawFx(dt){
    for(const p of particles){p.l-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=90*dt}
    particles=particles.filter(p=>p.l>0);
    for(const f of floats){f.l-=dt;f.y-=24*dt}
    floats=floats.filter(f=>f.l>0);
    for(const p of particles){ctx.globalAlpha=clamp(p.l/p.m,0,1);ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.z,p.z)}
    for(const f of floats){ctx.globalAlpha=clamp(f.l/f.m,0,1);ctx.fillStyle=f.c;ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.fillText(f.t,f.x,f.y)}
    ctx.globalAlpha=1;
    if(flash>0){flash=Math.max(0,flash-dt);ctx.fillStyle=`rgba(255,255,255,${Math.min(.22,flash)})`;ctx.fillRect(0,0,S.w,S.h)}
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)document.querySelector('#eventToast')?.classList.remove('show')}
  }

  function loop(now){
    const dt=Math.min(.033,(now-last)/1000||0);last=now;
    if(S.started)update(dt);
    drawBackground(now/1000);
    if(S.started){drawFighter(S.active[0]);drawFighter(S.active[1]);drawFx(dt)}
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return{tone};
}
