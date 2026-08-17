(() => {
  'use strict';

  const W = 1080;
  const H = 1920;
  const TAU = Math.PI * 2;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const lerp = (a,b,t) => a + (b-a)*t;
  const rand = (a,b) => a + Math.random()*(b-a);
  const pick = a => a[(Math.random()*a.length)|0];
  const norm = a => {
    while(a > Math.PI) a -= TAU;
    while(a < -Math.PI) a += TAU;
    return a;
  };

  const AIR = window.SKY_AIRCRAFT;
  if (!AIR) {
    console.error('SKY_AIRCRAFT missing');
    return;
  }

  const ALLY_IDS = AIR.byFaction('allies');
  const ALLY_FIGHTERS = AIR.byRole('allies','fighter');
  const ALLY_INTERCEPTORS = AIR.byRole('allies','interceptor');
  const ALLY_ATTACKERS = AIR.byRole('allies','attacker');
  const AXIS_FIGHTERS = AIR.byRole('axis','fighter');
  const AXIS_INTERCEPTORS = AIR.byRole('axis','interceptor');
  const AXIS_ATTACKERS = AIR.byRole('axis','attacker');
  const AXIS_BOMBERS = AIR.byRole('axis','bomber');

  class SkySurvivors {
    constructor(){
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d',{alpha:false,desynchronized:true});
      this.planes = [];
      this.bullets = [];
      this.particles = [];
      this.clouds = [];
      this.wave = 1;
      this.waveStyle = 'DOGFIGHT';
      this.totalKills = 0;
      this.nextId = 1;
      this.last = performance.now();
      this.lastEnemySpawn = 0;
      this.waveStartedAt = 0;
      this.waveTarget = 5;
      this.waveSpawned = 0;
      this.waveKilled = 0;
      this.announcementTimer = 0;
      this.demoMode = new URLSearchParams(location.search).get('demo') === '1';
      this.cameraShake = 0;
      this._hudAt = 0;

      for(let i=0;i<28;i++) this.clouds.push(this.makeCloud(true));
      this.installUI();
      this.installBridge();
      this.startWave(1);
      if(this.demoMode) this.seedDemo();
      requestAnimationFrame(t=>this.loop(t));
    }

    installUI(){
      document.getElementById('modeBadge').textContent = this.demoMode ? 'TEST' : 'LIVE';
      const panel = document.getElementById('testPanel');
      panel.hidden = !this.demoMode;
      panel.addEventListener('click',e=>{
        const action = e.target?.dataset?.test;
        if(!action) return;
        const first = this.planes.find(p=>p.team==='ally'&&!p.dead);
        if(action==='join') this.join(`pilot_${Math.floor(rand(10,99))}`);
        if(action==='like'&&first) this.like(first.name,50);
        if(action==='follow'&&first) this.follow(first.name);
        if(action==='rose'&&first) this.gift(first.name,'rose',1);
        if(action==='wave') this.startWave(this.wave+1,true);
        if(action==='reset') this.reset(true);
      });
    }

    installBridge(){
      window.skySurvivors = {
        join:user=>this.join(user),
        like:(user,count=1)=>this.like(user,count),
        follow:user=>this.follow(user),
        gift:(user,gift='rose',count=1,value=1)=>this.gift(user,gift,count,value),
        nextWave:()=>this.startWave(this.wave+1,true),
        reset:()=>this.reset(false),
        state:()=>({wave:this.wave,style:this.waveStyle,pilots:this.planes.filter(p=>p.team==='ally'&&!p.dead).length,kills:this.totalKills,aircraft:Object.keys(AIR.roster).length})
      };
      window.addEventListener('sky-survivors-event',e=>this.consumeLiveEvent(e.detail));
      window.addEventListener('message',e=>{
        if(e.data?.type==='sky-survivors-event') this.consumeLiveEvent(e.data.payload);
      });
    }

    consumeLiveEvent(ev={}){
      const type = String(ev.type||ev.event||'').toLowerCase();
      const user = ev.user||ev.uniqueId||ev.username||ev.nickname||'pilot';
      if(type==='join'||type==='chat_join') this.join(user);
      else if(type==='like') this.like(user,Number(ev.count||ev.likeCount||1));
      else if(type==='follow') this.follow(user);
      else if(type==='gift') this.gift(user,ev.gift||ev.giftName||'gift',Number(ev.count||1),Number(ev.value||ev.diamondCount||1));
    }

    seedDemo(){
      ['SkyFox','Maverick','Nova','Raptor','Comet','Blaze'].forEach((n,i)=>setTimeout(()=>this.join(n),i*180));
      this.say('FLIGHT DYNAMICS V3');
    }

    reset(reseed=false){
      this.planes.length=0;
      this.bullets.length=0;
      this.particles.length=0;
      this.totalKills=0;
      this.startWave(1,true);
      if(reseed&&this.demoMode) this.seedDemo();
    }

    startWave(n,forced=false){
      this.wave=Math.max(1,n|0);
      this.waveStartedAt=performance.now();
      this.waveTarget=Math.min(8+this.wave*3,44);
      this.waveSpawned=0;
      this.waveKilled=0;
      const styles=['DOGFIGHT','CROSSWIND','INTERCEPT','STRIKE'];
      this.waveStyle=this.wave%5===0?'ACE':styles[(this.wave-1)%styles.length];
      if(forced){
        this.planes=this.planes.filter(p=>p.team==='ally'&&!p.dead);
        this.bullets.length=0;
      }
      this.say(this.waveStyle==='ACE'?`⚠ ACE WAVE ${this.wave}`:`WAVE ${this.wave} • ${this.waveStyle}`);
      this.updateHud();
    }

    pickPlayerAirframe(level=1,current=null){
      let pool;
      if(level<=1) pool=ALLY_FIGHTERS;
      else if(level===2) pool=[...ALLY_FIGHTERS,...ALLY_INTERCEPTORS];
      else if(level===3) pool=[...ALLY_FIGHTERS,...ALLY_INTERCEPTORS,...ALLY_ATTACKERS];
      else pool=[...ALLY_IDS,...ALLY_FIGHTERS,...ALLY_INTERCEPTORS];
      const choices=pool.filter(id=>id!==current);
      return pick(choices.length?choices:pool);
    }

    join(rawName){
      const name=String(rawName||'pilot').slice(0,20);
      let p=this.planes.find(x=>x.team==='ally'&&x.name.toLowerCase()===name.toLowerCase());
      if(p){
        if(p.dead){
          p.dead=false;p.deathTimer=0;
          p.x=rand(150,W-150);p.y=rand(H*.62,H*.84);
          p.state='seek';p.stateAge=0;p.targetId=null;
        }
        p.hp=p.maxHp;
        p.burst=Math.max(p.burst,1.5);
        this.say(`${name} BACK IN THE SKY`);
        return p;
      }
      p=this.makePlane('ally',name,rand(150,W-150),rand(H*.62,H*.84),this.pickPlayerAirframe(1));
      p.heading=rand(-.35,.35)-Math.PI/2;
      this.planes.push(p);
      this.say(`${name} • ${p.role.toUpperCase()} TAKE OFF`);
      this.updateHud();
      return p;
    }

    like(user,count=1){
      const p=this.findPilot(user); if(!p)return;
      p.hp=Math.min(p.maxHp,p.hp+clamp(count*.32,1,25));
      p.repairFlash=.35;
    }

    follow(user){
      const p=this.findPilot(user); if(!p)return;
      p.level++;
      if(p.level===2||p.level===3||p.level%3===2){
        const next=this.pickPlayerAirframe(p.level,p.sprite);
        this.applyAirframe(p,next,true);
        this.say(`${p.name} • ${p.role.toUpperCase()} UPGRADE`);
      }else{
        this.recalculateLevelStats(p,true);
        this.say(`${p.name} • AIRFRAME UPGRADE`);
      }
    }

    gift(user,gift='rose',count=1,value=1){
      const p=this.findPilot(user); if(!p)return;
      const key=String(gift).toLowerCase();
      if(key.includes('rose')){
        p.burst=Math.max(p.burst,5+count*.3);
        p.shield=Math.max(p.shield,2.5);
        this.say(`${p.name} • RAPID FIRE`);
      }else{
        p.burst=Math.max(p.burst,clamp(4+value*.18,4,16));
        p.shield=Math.max(p.shield,clamp(2+value*.05,2,8));
        p.hp=Math.min(p.maxHp,p.hp+clamp(value,8,55));
        if(value>=80){
          p.level++;
          this.applyAirframe(p,this.pickPlayerAirframe(Math.max(3,p.level),p.sprite),true);
          this.say(`${p.name} • COMBAT AIRFRAME`);
        }else this.say(`${p.name} • AIR SUPPORT`);
      }
    }

    findPilot(user){
      const key=String(user||'').toLowerCase();
      return this.planes.find(p=>p.team==='ally'&&!p.dead&&p.name.toLowerCase()===key)||this.planes.find(p=>p.team==='ally'&&!p.dead);
    }

    applyAirframe(p,id,heal=false){
      const cfg=AIR.get(id);
      p.sprite=id;p.role=cfg.role;p.renderSize=cfg.render;p.radius=cfg.radius;
      p.baseSpeed=cfg.speed;p.baseTurn=cfg.turn;p.baseHp=cfg.hp;
      p.airframeDamage=cfg.damage;p.airframeFireRate=cfg.fireRate;
      this.recalculateLevelStats(p,heal);
    }

    recalculateLevelStats(p,heal=false){
      const bonus=Math.max(0,p.level-1);
      p.speed=p.baseSpeed*(1+Math.min(.14,bonus*.022));
      p.turnRate=p.baseTurn*(1+Math.min(.12,bonus*.018));
      p.maxHp=Math.round(p.baseHp+bonus*18);
      p.baseDamage=p.airframeDamage+bonus*2.5;
      p.fireRate=Math.max(.14,p.airframeFireRate-bonus*.012);
      if(heal)p.hp=p.maxHp; else p.hp=Math.min(p.hp||p.maxHp,p.maxHp);
    }

    makePlane(team,name,x,y,sprite){
      const cfg=AIR.get(sprite);
      const p={
        id:this.nextId++,team,name,x,y,vx:0,vy:0,heading:-Math.PI/2,sprite,
        role:cfg.role,renderSize:cfg.render,radius:cfg.radius,
        baseSpeed:cfg.speed,baseTurn:cfg.turn,baseHp:cfg.hp,airframeDamage:cfg.damage,airframeFireRate:cfg.fireRate,
        speed:cfg.speed,turnRate:cfg.turn,currentSpeed:cfg.speed*.92,hp:cfg.hp,maxHp:cfg.hp,baseDamage:cfg.damage,fireRate:cfg.fireRate,fireCd:rand(0,cfg.fireRate),
        targetId:null,retarget:0,lockTime:0,burst:0,shield:0,level:1,kills:0,score:0,age:0,invuln:.6,repairFlash:0,
        bank:0,dead:false,elite:false,state:'seek',stateAge:0,stateLimit:rand(.2,.5),shotsInPass:0,
        orbitSign:Math.random()<.5?-1:1,breakSign:Math.random()<.5?-1:1,breakHeading:0,maneuverSeed:Math.random()*1000,
        energy:rand(.83,.98),turnLoad:0,passCount:0,extendHeading:0
      };
      if(team==='enemy'){
        p.speed*=rand(.96,1.04);p.turnRate*=rand(.95,1.05);p.currentSpeed=p.speed*.92;
      }
      return p;
    }

    chooseEnemyAirframe(){
      if(this.waveStyle==='ACE') return pick([...AXIS_INTERCEPTORS,...AXIS_ATTACKERS,...AXIS_BOMBERS]);
      const r=Math.random();
      if(this.waveStyle==='INTERCEPT'){
        if(r<.52&&AXIS_INTERCEPTORS.length)return pick(AXIS_INTERCEPTORS);
        if(r<.88)return pick(AXIS_FIGHTERS);
        return pick(AXIS_ATTACKERS);
      }
      if(this.waveStyle==='STRIKE'){
        if(r<.42&&AXIS_ATTACKERS.length)return pick(AXIS_ATTACKERS);
        if(r<.62&&this.wave>=3&&AXIS_BOMBERS.length)return pick(AXIS_BOMBERS);
        return pick([...AXIS_FIGHTERS,...AXIS_INTERCEPTORS]);
      }
      if(r<.68)return pick(AXIS_FIGHTERS);
      if(r<.87&&AXIS_INTERCEPTORS.length)return pick(AXIS_INTERCEPTORS);
      if(r<.96&&AXIS_ATTACKERS.length)return pick(AXIS_ATTACKERS);
      return pick(AXIS_BOMBERS.length?AXIS_BOMBERS:AXIS_FIGHTERS);
    }

    spawnEnemy(){
      if(this.waveSpawned>=this.waveTarget)return;
      const isBoss=this.wave%5===0&&this.waveSpawned===this.waveTarget-1;
      const sprite=this.chooseEnemyAirframe();
      const sideBias=this.waveStyle==='CROSSWIND'?.68:.36;
      const r=Math.random(); let x,y,heading;
      if(r<sideBias*.5){x=-75;y=rand(220,H*.76);heading=rand(-.15,.38);}
      else if(r<sideBias){x=W+75;y=rand(220,H*.76);heading=Math.PI+rand(-.38,.15);}
      else{x=rand(70,W-70);y=-85;heading=Math.PI/2+rand(-.55,.55);}
      const p=this.makePlane('enemy',isBoss?'ENEMY ACE':`Bandit ${this.waveSpawned+1}`,x,y,sprite);
      p.heading=heading;
      const waveScale=1+this.wave*.055;
      p.maxHp=p.hp=Math.round(p.maxHp*waveScale*(isBoss?2.8:1));
      p.baseDamage*=1+this.wave*.035;
      if(isBoss){
        p.elite=true;p.speed*=p.role==='bomber'?.94:1.04;p.turnRate*=1.08;
        p.radius=Math.round(p.radius*1.16);p.renderSize=Math.round(p.renderSize*1.14);p.score=15;
      }else p.score=1;
      p.currentSpeed=p.speed*.90;
      this.planes.push(p);this.waveSpawned++;
      if(isBoss)this.say(`⚠ ACE • ${sprite.replaceAll('_',' ')}`);
    }

    makeCloud(initial=false){
      return {x:rand(-120,W+120),y:initial?rand(-100,H+100):rand(-280,-80),w:rand(170,430),h:rand(55,130),speed:rand(20,78),alpha:rand(.035,.13),layer:Math.random()<.45?0:1};
    }

    update(dt,now){
      for(const c of this.clouds){
        c.y+=c.speed*dt*(c.layer?1.45:.8);
        c.x+=Math.sin(now*.00015+c.y*.003)*dt*5;
        if(c.y-c.h>H+80)Object.assign(c,this.makeCloud(false));
      }
      const allies=this.planes.filter(p=>p.team==='ally'&&!p.dead);
      const enemies=this.planes.filter(p=>p.team==='enemy'&&!p.dead);
      if(allies.length&&this.waveSpawned<this.waveTarget&&now-this.lastEnemySpawn>Math.max(280,760-this.wave*22)){
        this.spawnEnemy();this.lastEnemySpawn=now;
      }
      if(allies.length&&this.waveSpawned>=this.waveTarget&&!enemies.length&&now-this.waveStartedAt>2800)this.startWave(this.wave+1);
      const snapshot=this.planes.filter(p=>!p.dead);
      for(const p of snapshot)this.updatePlane(p,dt,snapshot);
      this.updateBullets(dt);this.updateParticles(dt);
      this.planes=this.planes.filter(p=>!p.dead||p.deathTimer>0);
      for(const p of this.planes)if(p.dead)p.deathTimer-=dt;
      this.cameraShake=Math.max(0,this.cameraShake-dt*10);
      if(now-this._hudAt>220){this._hudAt=now;this.updateHud();}
    }

    setState(p,state,limit){
      p.state=state;p.stateAge=0;p.stateLimit=limit;
      if(state==='attack')p.shotsInPass=0;
      if(state==='extend'){
        p.passCount++;
        p.extendHeading=norm(p.heading + p.breakSign*rand(.08,.22));
      }
      if(state==='break'){
        p.breakSign = Math.random()<.5?-1:1;
        const amount=p.role==='fighter'?rand(.82,1.08):p.role==='interceptor'?rand(.72,.96):p.role==='attacker'?rand(.62,.84):rand(.48,.68);
        p.breakHeading=norm(p.heading+p.breakSign*amount);
      }
    }

    updatePlane(p,dt,all){
      if(p.dead)return;
      p.age+=dt;p.stateAge+=dt;p.fireCd-=dt;p.retarget-=dt;p.lockTime+=dt;
      p.invuln=Math.max(0,p.invuln-dt);p.burst=Math.max(0,p.burst-dt);p.shield=Math.max(0,p.shield-dt);p.repairFlash=Math.max(0,p.repairFlash-dt);

      let target=all.find(x=>x.id===p.targetId&&x.team!==p.team&&!x.dead);
      const canRetarget=p.state==='seek'||p.state==='reacquire';
      if(!target||this.dist2(p,target)>900*900||(canRetarget&&p.retarget<=0&&p.lockTime>2.6)){
        target=this.acquireTarget(p,all);p.targetId=target?.id||null;p.retarget=rand(1.0,1.7);p.lockTime=0;
        if(target&&p.state==='seek')this.setState(p,'intercept',rand(.55,.95));
      }

      let desired=p.heading,distance=Infinity,aimError=Math.PI,closure=0;
      if(target){
        const dx=target.x-p.x,dy=target.y-p.y;
        distance=Math.max(1,Math.hypot(dx,dy));
        const ux=dx/distance,uy=dy/distance;
        closure=(p.vx-target.vx)*ux+(p.vy-target.vy)*uy;
        const bulletSpeed=780;
        const leadTime=clamp(distance/bulletSpeed,.06,.68);
        const leadX=target.x+target.vx*leadTime;
        const leadY=target.y+target.vy*leadTime;
        const directAim=Math.atan2(leadY-p.y,leadX-p.x);
        aimError=Math.abs(norm(directAim-p.heading));
        const perpX=-uy,perpY=ux;

        if(p.state==='seek'){
          desired=directAim;
          if(distance<720)this.setState(p,'intercept',rand(.55,1.0));
        }else if(p.state==='intercept'){
          const offset=(p.role==='fighter'?110:p.role==='interceptor'?92:p.role==='attacker'?68:46)*p.orbitSign;
          desired=Math.atan2(leadY+perpY*offset-p.y,leadX+perpX*offset-p.x);
          const attackRange=p.role==='bomber'?510:p.role==='attacker'?450:410;
          const attackCone=p.role==='bomber'?.34:p.role==='fighter'?.27:.31;
          if(distance<attackRange&&aimError<attackCone&&closure>-20)this.setState(p,'attack',p.role==='fighter'?rand(.62,.92):p.role==='bomber'?rand(1.05,1.45):rand(.74,1.10));
          else if(distance<128&&closure>70)this.setState(p,'extend',p.role==='fighter'?rand(.38,.58):rand(.48,.72));
        }else if(p.state==='attack'){
          desired=directAim;
          const fired=this.tryFire(p,target);if(fired)p.shotsInPass++;
          const maxShots=p.role==='fighter'?3:p.role==='interceptor'?4:p.role==='attacker'?4:5;
          const close=p.role==='bomber'?168:138;
          if(p.shotsInPass>=maxShots||p.stateAge>p.stateLimit||distance<close||(closure< -20&&distance<250)){
            this.setState(p,'extend',p.role==='fighter'?rand(.42,.66):p.role==='bomber'?rand(.78,1.02):rand(.55,.82));
          }
        }else if(p.state==='extend'){
          const away=Math.atan2(p.y-target.y,p.x-target.x);
          desired=norm(p.extendHeading+norm(away-p.extendHeading)*.12);
          if(p.stateAge>p.stateLimit)this.setState(p,'break',p.role==='fighter'?rand(.78,1.08):p.role==='bomber'?rand(1.18,1.58):rand(.92,1.30));
        }else if(p.state==='break'){
          const rel=Math.atan2(target.y-p.y,target.x-p.x);
          const tangent=norm(rel+p.breakSign*Math.PI*.5);
          const blend=clamp(p.stateAge/Math.max(.01,p.stateLimit),0,1);
          desired=norm(p.breakHeading+norm(tangent-p.breakHeading)*(.18+.36*blend));
          if(p.stateAge>p.stateLimit)this.setState(p,'reacquire',rand(.58,.92));
        }else if(p.state==='reacquire'){
          const orbit=p.role==='fighter'?.64:p.role==='interceptor'?.55:p.role==='attacker'?.44:.34;
          desired=norm(directAim+p.orbitSign*orbit);
          if((p.stateAge>.45&&distance>240)||p.stateAge>p.stateLimit)this.setState(p,'intercept',rand(.55,.95));
        }
      }else{
        const lane=((p.id%5)-2)*130;
        const cx=W*.5+lane+Math.sin(p.maneuverSeed+p.age*.23)*180;
        const cy=H*.5+Math.cos(p.maneuverSeed*.7+p.age*.19)*520;
        desired=Math.atan2(cy-p.y,cx-p.x);
        if(p.state!=='seek')this.setState(p,'seek',rand(.45,.8));
      }

      const look=clamp(p.currentSpeed*.95,120,230);
      const px=p.x+Math.cos(p.heading)*look;
      const py=p.y+Math.sin(p.heading)*look;
      const margin=p.role==='bomber'?205:175;
      let bx=0,by=0;
      if(px<margin)bx+=(margin-px)/margin;
      if(px>W-margin)bx-=(px-(W-margin))/margin;
      if(py<margin)by+=(margin-py)/margin;
      if(py>H-margin)by-=(py-(H-margin))/margin;
      if(bx||by){
        const boundary=Math.atan2(by,bx);
        const weight=clamp(Math.hypot(bx,by)*1.15,.18,.72);
        desired=norm(desired+norm(boundary-desired)*weight);
      }

      let sx=0,sy=0,near=0;
      for(const o of all){
        if(o.id===p.id||o.dead)continue;
        const dx=p.x-o.x,dy=p.y-o.y,d2=dx*dx+dy*dy;
        const minDist=p.radius+o.radius+46;
        if(d2>0&&d2<minDist*minDist){
          const d=Math.sqrt(d2),f=(minDist-d)/minDist;
          sx+=dx/d*f;sy+=dy/d*f;near++;
        }
      }
      if(near){
        const sep=Math.atan2(sy,sx);
        desired=norm(desired+norm(sep-desired)*.24);
      }

      const delta=norm(desired-p.heading);
      const absDelta=Math.abs(delta);
      const stateTurn=p.state==='break'?1.04:p.state==='reacquire'?.96:p.state==='attack'?.92:1;
      const energyTurn=.66+p.energy*.40;
      const maxTurn=p.turnRate*stateTurn*energyTurn*dt*(p.elite?.96:1);
      const applied=clamp(delta,-maxTurn,maxTurn);
      p.heading=norm(p.heading+applied);
      p.turnLoad=lerp(p.turnLoad,clamp(Math.abs(applied)/Math.max(.0001,maxTurn),0,1),1-Math.pow(.05,dt));
      p.bank=lerp(p.bank,clamp(applied/Math.max(.0001,maxTurn),-1,1),1-Math.pow(.025,dt));

      const bleed=Math.max(0,p.turnLoad-.32)*(.18+(p.role==='bomber'?.05:0));
      const recover=(p.state==='extend'?.16:p.state==='attack'?.05:.10)*(1-p.turnLoad*.55);
      p.energy=clamp(p.energy+(recover-bleed)*dt,.48,1.04);

      let stateSpeed=1;
      if(p.state==='extend')stateSpeed=p.role==='fighter'?1.10:p.role==='interceptor'?1.08:1.04;
      else if(p.state==='break')stateSpeed=.96;
      else if(p.state==='reacquire')stateSpeed=.99;
      else if(p.state==='attack')stateSpeed=1.02;
      const energySpeed=.78+p.energy*.24;
      const turnPenalty=1-clamp(absDelta/Math.PI,0,1)*.08;
      const desiredSpeed=p.speed*stateSpeed*energySpeed*turnPenalty;
      p.currentSpeed=lerp(p.currentSpeed,desiredSpeed,1-Math.pow(.08,dt));
      p.vx=Math.cos(p.heading)*p.currentSpeed;
      p.vy=Math.sin(p.heading)*p.currentSpeed;
      p.x+=p.vx*dt;p.y+=p.vy*dt;

      if(p.x<-190||p.x>W+190||p.y<-190||p.y>H+190){
        const center=Math.atan2(H*.5-p.y,W*.5-p.x);
        p.heading=norm(p.heading+norm(center-p.heading)*clamp(dt*.8,0,.12));
      }

      if(p.hp<p.maxHp*.35&&Math.random()<dt*9)this.addSmoke(p.x,p.y,p.team==='ally'?.48:.72);
      if((p.state==='extend'||p.state==='attack')&&p.currentSpeed>p.speed*1.02&&Math.random()<dt*6)this.addTrail(p);
    }

    acquireTarget(p,all){
      const engaged=new Map();
      for(const q of all)if(q.targetId)engaged.set(q.targetId,(engaged.get(q.targetId)||0)+1);
      let best=null,bestScore=Infinity;
      for(const o of all){
        if(o.team===p.team||o.dead)continue;
        const dx=o.x-p.x,dy=o.y-p.y,d2=dx*dx+dy*dy;
        const angle=Math.abs(norm(Math.atan2(dy,dx)-p.heading));
        const crowd=Math.max(0,(engaged.get(o.id)||0)-1);
        const score=d2*(1+angle*.20)+crowd*140000-(o.elite?30000:0);
        if(score<bestScore){best=o;bestScore=score;}
      }
      return best;
    }

    tryFire(p,target){
      if(p.fireCd>0)return false;
      const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
      const maxRange=p.role==='bomber'?535:p.role==='attacker'?485:460;
      if(d>maxRange)return false;
      const aim=Math.atan2(dy,dx);
      const err=Math.abs(norm(aim-p.heading));
      const fireCone=p.elite?.20:p.role==='bomber'?.18:.13;
      if(err>fireCone)return false;
      p.fireCd=p.burst>0?p.fireRate*.34:p.fireRate;
      const spread=p.burst>0?rand(-.018,.018):rand(-.008,.008);
      const a=p.heading+spread,muzzle=Math.max(25,p.radius*1.25);
      this.bullets.push({x:p.x+Math.cos(a)*muzzle,y:p.y+Math.sin(a)*muzzle,vx:Math.cos(a)*790,vy:Math.sin(a)*790,life:.76,team:p.team,ownerId:p.id,damage:p.baseDamage*(p.burst>0?.82:1),r:p.burst>0?4:3});
      this.particles.push({type:'muzzle',x:p.x+Math.cos(a)*muzzle,y:p.y+Math.sin(a)*muzzle,vx:0,vy:0,life:.07,max:.07,size:17});
      return true;
    }

    updateBullets(dt){
      for(const b of this.bullets){
        b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0)continue;
        for(const p of this.planes){
          if(p.dead||p.team===b.team||p.invuln>0)continue;
          const dx=p.x-b.x,dy=p.y-b.y;
          if(dx*dx+dy*dy<(p.radius+5)*(p.radius+5)){
            b.life=0;const absorbed=p.shield>0;if(!absorbed)p.hp-=b.damage;
            this.spark(b.x,b.y,absorbed?7:4);if(p.hp<=0)this.killPlane(p,b.ownerId);break;
          }
        }
      }
      this.bullets=this.bullets.filter(b=>b.life>0&&b.x>-90&&b.x<W+90&&b.y>-90&&b.y<H+90);
    }

    killPlane(p,ownerId){
      if(p.dead)return;
      p.dead=true;p.deathTimer=.48;
      for(let i=0;i<(p.elite?42:19);i++){
        const a=rand(0,TAU),s=rand(45,p.elite?300:190);
        this.particles.push({type:'explosion',x:p.x,y:p.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.28,.75),max:.75,size:rand(8,p.elite?34:23)});
      }
      for(let i=0;i<(p.elite?7:3);i++){
        const a=rand(0,TAU),s=rand(55,180);
        this.particles.push({type:'debris',x:p.x,y:p.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.45,.9),max:.9,size:rand(3,7)});
      }
      this.cameraShake=Math.max(this.cameraShake,p.elite?14:5);
      if(p.team==='enemy'){
        this.totalKills++;this.waveKilled++;
        const killer=this.planes.find(x=>x.id===ownerId);
        if(killer){killer.kills++;killer.score+=p.elite?15:1;}
      }else if(this.demoMode)setTimeout(()=>this.join(p.name),2200);
    }

    spark(x,y,n){
      for(let i=0;i<n;i++){
        const a=rand(0,TAU),s=rand(40,170);
        this.particles.push({type:'spark',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.09,.28),max:.28,size:rand(2,5)});
      }
    }

    addSmoke(x,y,a=.6){
      this.particles.push({type:'smoke',x,y,vx:rand(-10,10),vy:rand(18,38),life:rand(.45,.9),max:.9,size:rand(16,30),alpha:a});
    }

    addTrail(p){
      const back=p.heading+Math.PI;
      this.particles.push({type:'trail',x:p.x+Math.cos(back)*p.radius*.6,y:p.y+Math.sin(back)*p.radius*.6,vx:Math.cos(back)*rand(15,35),vy:Math.sin(back)*rand(15,35),life:rand(.18,.34),max:.34,size:rand(3,6),alpha:.28});
    }

    updateParticles(dt){
      for(const q of this.particles){
        q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=Math.pow(.18,dt);q.vy*=Math.pow(.38,dt);q.life-=dt;
      }
      this.particles=this.particles.filter(q=>q.life>0);
    }

    draw(now){
      const c=this.ctx,shake=this.cameraShake;c.save();
      if(shake)c.translate(rand(-shake,shake),rand(-shake,shake));
      this.drawBackground(c,now);this.drawClouds(c,0);this.drawBullets(c);this.drawPlanes(c);this.drawParticles(c);this.drawClouds(c,1);this.drawBossBar(c);c.restore();
    }

    drawBackground(c,now){
      const g=c.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#071323');g.addColorStop(.36,'#123655');g.addColorStop(.72,'#1e5774');g.addColorStop(1,'#315f73');
      c.fillStyle=g;c.fillRect(-30,-30,W+60,H+60);
      const scroll=(now*.045)%180;c.globalAlpha=.07;c.strokeStyle='#b9e7f8';c.lineWidth=2;
      for(let y=-180+scroll;y<H+180;y+=180){c.beginPath();c.moveTo(0,y);c.lineTo(W,y+42);c.stroke();}
      c.globalAlpha=1;
      const sun=c.createRadialGradient(W*.52,H*.3,0,W*.52,H*.3,520);
      sun.addColorStop(0,'rgba(157,218,242,.14)');sun.addColorStop(1,'rgba(50,110,140,0)');c.fillStyle=sun;c.fillRect(0,0,W,H);
    }

    drawClouds(c,layer){
      for(const q of this.clouds){
        if(q.layer!==layer)continue;c.save();c.globalAlpha=q.alpha;c.fillStyle='#e5f3f6';c.translate(q.x,q.y);
        for(let i=-2;i<=2;i++){
          const ww=q.w*(.25+Math.abs(i)*.035),hh=q.h*(.55-Math.abs(i)*.07);
          c.beginPath();c.ellipse(i*q.w*.16,Math.sin(i*2)*q.h*.12,ww,hh,0,0,TAU);c.fill();
        }
        c.restore();
      }
      c.globalAlpha=1;
    }

    drawBullets(c){
      c.save();c.lineCap='round';
      for(const b of this.bullets){
        const a=Math.atan2(b.vy,b.vx),len=24;c.strokeStyle=b.team==='ally'?'rgba(255,235,133,.95)':'rgba(255,129,92,.95)';c.lineWidth=b.r;
        c.beginPath();c.moveTo(b.x-Math.cos(a)*len,b.y-Math.sin(a)*len);c.lineTo(b.x,b.y);c.stroke();
      }
      c.restore();
    }

    drawPlanes(c){
      const sorted=this.planes.filter(p=>!p.dead).sort((a,b)=>a.y-b.y);
      for(const p of sorted){
        const cfg=AIR.get(p.sprite),img=AIR.image(p.sprite),box=cfg.bounds;
        c.save();c.translate(p.x,p.y);c.rotate(p.heading+Math.PI/2);
        const squeeze=1-Math.abs(p.bank)*.055;c.scale(squeeze,1);
        if(p.shield>0){c.strokeStyle='rgba(118,238,255,.7)';c.lineWidth=4;c.beginPath();c.arc(0,0,p.radius*1.55,0,TAU);c.stroke();}
        if(p.repairFlash>0){c.shadowColor='#83ffb2';c.shadowBlur=22;}
        if(img?.complete&&img.naturalWidth>0){
          const [bx,by,bw,bh]=box,ratio=bw/bh,target=p.renderSize;
          const ow=ratio>=1?target:target*ratio,oh=ratio>=1?target/ratio:target;
          c.save();c.globalAlpha=.22;c.translate(5+p.bank*3,8);c.filter='brightness(0)';c.drawImage(img,bx,by,bw,bh,-ow/2,-oh/2,ow,oh);c.restore();
          c.drawImage(img,bx,by,bw,bh,-ow/2,-oh/2,ow,oh);
        }else{
          c.fillStyle=p.team==='ally'?'#9ce7ff':'#ff8e75';c.beginPath();c.moveTo(0,-28);c.lineTo(17,22);c.lineTo(0,14);c.lineTo(-17,22);c.closePath();c.fill();
        }
        c.restore();this.drawPlaneTag(c,p);
      }
    }

    drawPlaneTag(c,p){
      const y=p.y-(p.elite?62:47),w=p.elite?96:82,h=6;
      c.save();c.textAlign='center';c.font=`700 ${p.elite?17:14}px system-ui`;c.fillStyle=p.team==='ally'?'#fff':'rgba(255,224,216,.9)';c.shadowColor='rgba(0,0,0,.85)';c.shadowBlur=4;c.fillText(p.name,p.x,y-9);
      c.shadowBlur=0;c.fillStyle='rgba(1,6,14,.68)';c.fillRect(p.x-w/2,y,w,h);c.fillStyle=p.team==='ally'?'#6ff0b6':'#ff785e';c.fillRect(p.x-w/2,y,w*clamp(p.hp/p.maxHp,0,1),h);
      if(p.level>1&&p.team==='ally'){c.font='800 10px system-ui';c.fillStyle='#ffe270';c.fillText(`LV ${p.level}`,p.x,y+16);}c.restore();
    }

    drawParticles(c){
      for(const q of this.particles){
        const t=clamp(q.life/q.max,0,1);c.save();c.globalAlpha=t*(q.alpha??1);
        if(q.type==='smoke'){c.fillStyle='#1a2028';c.beginPath();c.arc(q.x,q.y,q.size*(1+(1-t)*.8),0,TAU);c.fill();}
        else if(q.type==='trail'){c.fillStyle='rgba(220,241,246,.75)';c.beginPath();c.arc(q.x,q.y,q.size*(.6+t),0,TAU);c.fill();}
        else if(q.type==='spark'){c.fillStyle='#ffe38a';c.fillRect(q.x-q.size/2,q.y-q.size/2,q.size,q.size);}
        else if(q.type==='muzzle'){c.fillStyle='#fff3a0';c.beginPath();c.arc(q.x,q.y,q.size*t,0,TAU);c.fill();}
        else if(q.type==='debris'){c.fillStyle='#d1d7dc';c.fillRect(q.x-q.size/2,q.y-q.size/2,q.size,q.size*.45);}
        else{const g=c.createRadialGradient(q.x,q.y,0,q.x,q.y,q.size);g.addColorStop(0,'rgba(255,250,192,1)');g.addColorStop(.4,'rgba(255,139,46,.9)');g.addColorStop(1,'rgba(90,30,15,0)');c.fillStyle=g;c.beginPath();c.arc(q.x,q.y,q.size,0,TAU);c.fill();}
        c.restore();
      }
      c.globalAlpha=1;
    }

    drawBossBar(c){
      const boss=this.planes.find(p=>p.team==='enemy'&&p.elite&&!p.dead);if(!boss)return;
      const w=560,h=14,x=(W-w)/2,y=130,ratio=clamp(boss.hp/boss.maxHp,0,1);
      c.save();c.fillStyle='rgba(2,7,15,.72)';c.fillRect(x-5,y-5,w+10,h+10);c.fillStyle='#53201d';c.fillRect(x,y,w,h);c.fillStyle='#ff6758';c.fillRect(x,y,w*ratio,h);c.font='800 18px system-ui';c.textAlign='center';c.fillStyle='#fff2e8';c.fillText(`ACE • ${boss.sprite.replaceAll('_',' ')}`,W/2,y-12);c.restore();
    }

    say(text){
      const el=document.getElementById('announcement');el.textContent=text;el.classList.add('show');clearTimeout(this.announcementTimer);this.announcementTimer=setTimeout(()=>el.classList.remove('show'),1300);
    }

    updateHud(){
      const allies=this.planes.filter(p=>p.team==='ally'&&!p.dead);
      document.getElementById('waveValue').textContent=this.wave;
      document.getElementById('pilotValue').textContent=allies.length;
      document.getElementById('killValue').textContent=this.totalKills;
      const top=[...allies].sort((a,b)=>(b.score+b.kills)-(a.score+a.kills)).slice(0,3);
      document.getElementById('rankingRows').innerHTML=top.map((p,i)=>`<div class="rank-row"><span>${i+1}</span><strong>${this.escapeHtml(p.name)}</strong><em>${p.kills}</em></div>`).join('');
    }

    escapeHtml(s){return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
    dist2(a,b){const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;}

    loop(now){
      const dt=clamp((now-this.last)/1000,0,.033);this.last=now;this.update(dt,now);this.draw(now);requestAnimationFrame(t=>this.loop(t));
    }
  }

  const boot = () => AIR.ready.then(()=>new SkySurvivors()).catch(err=>{
    console.error(err);
    const badge=document.getElementById('assetBadge');if(badge)badge.textContent='AIR ERROR';
  });
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
