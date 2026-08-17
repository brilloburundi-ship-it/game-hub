(() => {
  'use strict';

  const LOGICAL_W = 1080;
  const LOGICAL_H = 1920;
  const TAU = Math.PI * 2;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const rand = (a,b) => a+Math.random()*(b-a);
  const pick = arr => arr[(Math.random()*arr.length)|0];
  const normalizeAngle = a => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };

  const AIR = window.SKY_AIRCRAFT;
  const ALLY_IDS = AIR.byFaction('allies');
  const AXIS_IDS = AIR.byFaction('axis');
  const ALLY_FIGHTERS = AIR.byRole('allies','fighter');
  const ALLY_INTERCEPTORS = AIR.byRole('allies','interceptor');
  const ALLY_ATTACKERS = AIR.byRole('allies','attacker');
  const ALLY_BOMBERS = AIR.byRole('allies','bomber');
  const AXIS_FIGHTERS = AIR.byRole('axis','fighter');
  const AXIS_INTERCEPTORS = AIR.byRole('axis','interceptor');
  const AXIS_ATTACKERS = AIR.byRole('axis','attacker');
  const AXIS_BOMBERS = AIR.byRole('axis','bomber');

  class SkySurvivors {
    constructor() {
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

      for(let i=0;i<26;i++) this.clouds.push(this.makeCloud(true));
      this.installUI();
      this.installBridge();
      this.startWave(1);
      if(this.demoMode) this.seedDemo();
      requestAnimationFrame(t=>this.loop(t));
    }

    installUI() {
      document.getElementById('modeBadge').textContent=this.demoMode?'TEST':'LIVE';
      const panel=document.getElementById('testPanel');
      panel.hidden=!this.demoMode;
      panel.addEventListener('click',e=>{
        const action=e.target?.dataset?.test;
        if(!action)return;
        const first=this.planes.find(p=>p.team==='ally');
        if(action==='join') this.join(`pilot_${Math.floor(rand(10,99))}`);
        if(action==='like'&&first) this.like(first.name,50);
        if(action==='follow'&&first) this.follow(first.name);
        if(action==='rose'&&first) this.gift(first.name,'rose',1);
        if(action==='wave') this.startWave(this.wave+1,true);
        if(action==='reset') this.reset(true);
      });
    }

    installBridge() {
      const api={
        join:user=>this.join(user),
        like:(user,count=1)=>this.like(user,count),
        follow:user=>this.follow(user),
        gift:(user,gift='rose',count=1,value=1)=>this.gift(user,gift,count,value),
        nextWave:()=>this.startWave(this.wave+1,true),
        reset:()=>this.reset(false),
        state:()=>({wave:this.wave,style:this.waveStyle,pilots:this.planes.filter(p=>p.team==='ally').length,kills:this.totalKills,aircraft:Object.keys(AIR.roster).length})
      };
      window.skySurvivors=api;
      window.addEventListener('sky-survivors-event',e=>this.consumeLiveEvent(e.detail));
      window.addEventListener('message',e=>{
        if(e.data?.type==='sky-survivors-event') this.consumeLiveEvent(e.data.payload);
      });
    }

    consumeLiveEvent(ev={}) {
      const type=String(ev.type||ev.event||'').toLowerCase();
      const user=ev.user||ev.uniqueId||ev.username||ev.nickname||'pilot';
      if(type==='join'||type==='chat_join') this.join(user);
      else if(type==='like') this.like(user,Number(ev.count||ev.likeCount||1));
      else if(type==='follow') this.follow(user);
      else if(type==='gift') this.gift(user,ev.gift||ev.giftName||'gift',Number(ev.count||1),Number(ev.value||ev.diamondCount||1));
    }

    seedDemo() {
      ['SkyFox','Maverick','Nova','Raptor','Comet','Blaze'].forEach((n,i)=>setTimeout(()=>this.join(n),i*180));
      this.say('DOGFIGHT V2 • 27 AIRCRAFT');
    }

    reset(reseed=false) {
      this.planes.length=0;
      this.bullets.length=0;
      this.particles.length=0;
      this.totalKills=0;
      this.startWave(1,true);
      if(reseed&&this.demoMode) this.seedDemo();
    }

    startWave(n,forced=false) {
      this.wave=Math.max(1,n|0);
      this.waveStartedAt=performance.now();
      this.waveTarget=Math.min(8+this.wave*3,44);
      this.waveSpawned=0;
      this.waveKilled=0;
      const styles=['DOGFIGHT','CROSSWIND','INTERCEPT','STRIKE'];
      this.waveStyle=this.wave%5===0?'ACE':styles[(this.wave-1)%styles.length];
      if(forced){
        this.planes=this.planes.filter(p=>p.team==='ally');
        this.bullets.length=0;
      }
      this.say(this.waveStyle==='ACE'?`⚠ ACE WAVE ${this.wave}`:`WAVE ${this.wave} • ${this.waveStyle}`);
      this.updateHud();
    }

    pickPlayerAirframe(level=1,current=null) {
      let pool;
      if(level<=1) pool=ALLY_FIGHTERS;
      else if(level===2) pool=[...ALLY_FIGHTERS,...ALLY_INTERCEPTORS];
      else if(level===3) pool=[...ALLY_INTERCEPTORS,...ALLY_ATTACKERS,...ALLY_FIGHTERS];
      else pool=[...ALLY_IDS,...ALLY_FIGHTERS,...ALLY_INTERCEPTORS];
      const choices=pool.filter(id=>id!==current);
      return pick(choices.length?choices:pool);
    }

    join(rawName) {
      const name=String(rawName||'pilot').slice(0,20);
      let p=this.planes.find(x=>x.team==='ally'&&x.name.toLowerCase()===name.toLowerCase());
      if(p){
        p.hp=p.maxHp;
        p.burst=Math.max(p.burst,1.5);
        this.say(`${name} BACK IN THE SKY`);
        return p;
      }
      const x=rand(150,LOGICAL_W-150);
      const y=rand(LOGICAL_H*.62,LOGICAL_H*.84);
      p=this.makePlane('ally',name,x,y,this.pickPlayerAirframe(1));
      p.heading=rand(-.35,.35)-Math.PI/2;
      this.planes.push(p);
      this.say(`${name} • ${AIR.get(p.sprite).role.toUpperCase()} TAKE OFF`);
      this.updateHud();
      return p;
    }

    like(user,count=1) {
      const p=this.findPilot(user);
      if(!p)return;
      const heal=clamp(count*.32,1,25);
      p.hp=Math.min(p.maxHp,p.hp+heal);
      p.repairFlash=.35;
    }

    follow(user) {
      const p=this.findPilot(user);
      if(!p)return;
      p.level++;
      if(p.level===2||p.level===3||p.level%3===2){
        const next=this.pickPlayerAirframe(p.level,p.sprite);
        this.applyAirframe(p,next,true);
        this.say(`${p.name} • ${AIR.get(next).role.toUpperCase()} UPGRADE`);
      } else {
        this.recalculateLevelStats(p,true);
        this.say(`${p.name} • AIRFRAME UPGRADE`);
      }
    }

    gift(user,gift='rose',count=1,value=1) {
      const p=this.findPilot(user);
      if(!p)return;
      const key=String(gift).toLowerCase();
      if(key.includes('rose')){
        p.burst=Math.max(p.burst,5+count*.3);
        p.shield=Math.max(p.shield,2.5);
        this.say(`${p.name} • RAPID FIRE`);
      } else {
        p.burst=Math.max(p.burst,clamp(4+value*.18,4,16));
        p.shield=Math.max(p.shield,clamp(2+value*.05,2,8));
        p.hp=Math.min(p.maxHp,p.hp+clamp(value,8,55));
        if(value>=80){
          p.level++;
          const next=this.pickPlayerAirframe(Math.max(3,p.level),p.sprite);
          this.applyAirframe(p,next,true);
          this.say(`${p.name} • COMBAT AIRFRAME`);
        } else this.say(`${p.name} • AIR SUPPORT`);
      }
    }

    findPilot(user) {
      const key=String(user||'').toLowerCase();
      return this.planes.find(p=>p.team==='ally'&&p.name.toLowerCase()===key)||this.planes.find(p=>p.team==='ally');
    }

    applyAirframe(p,id,heal=false) {
      const cfg=AIR.get(id);
      p.sprite=id;
      p.role=cfg.role;
      p.renderSize=cfg.render;
      p.radius=cfg.radius;
      p.baseSpeed=cfg.speed;
      p.baseTurn=cfg.turn;
      p.baseHp=cfg.hp;
      p.airframeDamage=cfg.damage;
      p.airframeFireRate=cfg.fireRate;
      this.recalculateLevelStats(p,heal);
    }

    recalculateLevelStats(p,heal=false) {
      const bonus=Math.max(0,p.level-1);
      p.speed=p.baseSpeed*(1+Math.min(.14,bonus*.022));
      p.turnRate=p.baseTurn*(1+Math.min(.12,bonus*.018));
      p.maxHp=Math.round(p.baseHp+bonus*18);
      p.baseDamage=p.airframeDamage+bonus*2.5;
      p.fireRate=Math.max(.14,p.airframeFireRate-bonus*.012);
      if(heal) p.hp=p.maxHp;
      else p.hp=Math.min(p.hp||p.maxHp,p.maxHp);
    }

    makePlane(team,name,x,y,sprite) {
      const cfg=AIR.get(sprite);
      const p={
        id:this.nextId++,team,name,x,y,vx:0,vy:0,heading:-Math.PI/2,sprite,
        role:cfg.role,renderSize:cfg.render,radius:cfg.radius,
        baseSpeed:cfg.speed,baseTurn:cfg.turn,baseHp:cfg.hp,airframeDamage:cfg.damage,airframeFireRate:cfg.fireRate,
        speed:cfg.speed,turnRate:cfg.turn,hp:cfg.hp,maxHp:cfg.hp,baseDamage:cfg.damage,fireRate:cfg.fireRate,fireCd:rand(0,cfg.fireRate),
        targetId:null,retarget:0,lockTime:0,burst:0,shield:0,level:1,kills:0,score:0,age:0,invuln:.6,repairFlash:0,
        bank:0,dead:false,elite:false,state:'seek',stateAge:0,stateLimit:rand(.2,.5),shotsInPass:0,
        orbitSign:Math.random()<.5?-1:1,breakSign:Math.random()<.5?-1:1,breakHeading:0,maneuverSeed:Math.random()*1000
      };
      if(team==='enemy'){
        p.speed*=rand(.96,1.04);
        p.turnRate*=rand(.95,1.05);
      }
      return p;
    }

    chooseEnemyAirframe() {
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

    spawnEnemy() {
      if(this.waveSpawned>=this.waveTarget)return;
      const isBoss=this.wave%5===0&&this.waveSpawned===this.waveTarget-1;
      const sprite=this.chooseEnemyAirframe();
      const sideBias=this.waveStyle==='CROSSWIND'?.68:.36;
      const sideChance=Math.random();
      let x,y,heading;
      if(sideChance<sideBias*.5){x=-75;y=rand(220,LOGICAL_H*.76);heading=rand(-.15,.38);}
      else if(sideChance<sideBias){x=LOGICAL_W+75;y=rand(220,LOGICAL_H*.76);heading=Math.PI+rand(-.38,.15);}
      else{x=rand(70,LOGICAL_W-70);y=-85;heading=Math.PI/2+rand(-.55,.55);}
      const p=this.makePlane('enemy',isBoss?'ENEMY ACE':`Bandit ${this.waveSpawned+1}`,x,y,sprite);
      p.heading=heading;
      const waveScale=1+this.wave*.055;
      p.maxHp=p.hp=Math.round(p.maxHp*waveScale*(isBoss?2.8:1));
      p.baseDamage*=1+this.wave*.035;
      if(isBoss){
        p.elite=true;
        p.speed*=AIR.get(sprite).role==='bomber'?.94:1.04;
        p.turnRate*=1.08;
        p.radius=Math.round(p.radius*1.16);
        p.renderSize=Math.round(p.renderSize*1.14);
        p.score=15;
      } else p.score=1;
      this.planes.push(p);
      this.waveSpawned++;
      if(isBoss)this.say(`⚠ ACE • ${sprite.replaceAll('_',' ')}`);
    }

    makeCloud(initial=false) {
      return {x:rand(-120,LOGICAL_W+120),y:initial?rand(-100,LOGICAL_H+100):rand(-280,-80),w:rand(170,430),h:rand(55,130),speed:rand(20,78),alpha:rand(.035,.13),layer:Math.random()<.45?0:1};
    }

    update(dt,now) {
      for(const c of this.clouds){
        c.y+=c.speed*dt*(c.layer?1.45:.8);
        c.x+=Math.sin(now*.00015+c.y*.003)*dt*5;
        if(c.y-c.h>LOGICAL_H+80)Object.assign(c,this.makeCloud(false));
      }
      const aliveAllies=this.planes.filter(p=>p.team==='ally'&&!p.dead);
      const aliveEnemies=this.planes.filter(p=>p.team==='enemy'&&!p.dead);
      if(aliveAllies.length&&this.waveSpawned<this.waveTarget&&now-this.lastEnemySpawn>Math.max(280,760-this.wave*22)){
        this.spawnEnemy();
        this.lastEnemySpawn=now;
      }
      if(aliveAllies.length&&this.waveSpawned>=this.waveTarget&&aliveEnemies.length===0&&now-this.waveStartedAt>2800)this.startWave(this.wave+1);

      const snapshot=this.planes.filter(p=>!p.dead);
      for(const p of snapshot)this.updatePlane(p,dt,snapshot);
      this.updateBullets(dt);
      this.updateParticles(dt);
      this.planes=this.planes.filter(p=>!p.dead||p.deathTimer>0);
      for(const p of this.planes)if(p.dead)p.deathTimer-=dt;
      this.cameraShake=Math.max(0,this.cameraShake-dt*10);
      this.updateHudThrottled(now);
    }

    setState(p,state,limit) {
      p.state=state;
      p.stateAge=0;
      p.stateLimit=limit;
      if(state==='attack')p.shotsInPass=0;
      if(state==='break'){
        p.breakSign=Math.random()<.5?-1:1;
        const amount=p.role==='fighter'?1.18:p.role==='interceptor'?1.02:p.role==='attacker'?.88:.70;
        p.breakHeading=normalizeAngle(p.heading+p.breakSign*amount);
      }
    }

    updatePlane(p,dt,all) {
      if(p.dead)return;
      p.age+=dt;
      p.stateAge+=dt;
      p.fireCd-=dt;
      p.retarget-=dt;
      p.lockTime+=dt;
      p.invuln=Math.max(0,p.invuln-dt);
      p.burst=Math.max(0,p.burst-dt);
      p.shield=Math.max(0,p.shield-dt);
      p.repairFlash=Math.max(0,p.repairFlash-dt);

      let target=all.find(x=>x.id===p.targetId&&x.team!==p.team&&!x.dead);
      const canRetarget=p.state==='seek'||p.state==='reacquire';
      if(!target||this.dist2(p,target)>820*820||(canRetarget&&p.retarget<=0&&p.lockTime>2.1)){
        target=this.acquireTarget(p,all);
        p.targetId=target?.id||null;
        p.retarget=rand(.8,1.45);
        p.lockTime=0;
        if(target&&p.state==='seek')this.setState(p,'intercept',rand(.35,.75));
      }

      let desired=p.heading;
      let distance=Infinity;
      let aimError=Math.PI;
      if(target){
        const dx=target.x-p.x,dy=target.y-p.y;
        distance=Math.max(1,Math.hypot(dx,dy));
        const bulletSpeed=760;
        const leadTime=clamp(distance/bulletSpeed,.05,.58);
        const leadX=target.x+target.vx*leadTime;
        const leadY=target.y+target.vy*leadTime;
        const directAim=Math.atan2(leadY-p.y,leadX-p.x);
        aimError=Math.abs(normalizeAngle(directAim-p.heading));
        const perpX=-dy/distance,perpY=dx/distance;

        if(p.state==='seek'){
          desired=directAim;
          if(distance<650)this.setState(p,'intercept',rand(.45,.9));
        } else if(p.state==='intercept'){
          const offset=(p.role==='fighter'?72:p.role==='interceptor'?58:p.role==='attacker'?42:24)*p.orbitSign;
          desired=Math.atan2(leadY+perpY*offset-p.y,leadX+perpX*offset-p.x);
          const attackRange=p.role==='bomber'?500:p.role==='attacker'?430:390;
          const attackCone=p.role==='bomber'?.36:p.role==='fighter'?.31:.34;
          if(distance<attackRange&&aimError<attackCone)this.setState(p,'attack',p.role==='fighter'?rand(.55,.9):p.role==='bomber'?rand(1.1,1.55):rand(.72,1.08));
          else if(distance<105)this.setState(p,'break',rand(.65,1.0));
        } else if(p.state==='attack'){
          desired=directAim;
          const fired=this.tryFire(p,target);
          if(fired)p.shotsInPass++;
          const maxShots=p.role==='fighter'?3:p.role==='interceptor'?4:p.role==='attacker'?4:5;
          const close=p.role==='bomber'?150:118;
          if(p.shotsInPass>=maxShots||p.stateAge>p.stateLimit||distance<close)this.setState(p,'break',p.role==='fighter'?rand(.65,.95):p.role==='bomber'?rand(1.2,1.7):rand(.82,1.2));
        } else if(p.state==='break'){
          const away=Math.atan2(p.y-target.y,p.x-target.x);
          desired=normalizeAngle(p.breakHeading+normalizeAngle(away-p.breakHeading)*.18);
          if(p.stateAge>p.stateLimit)this.setState(p,'reacquire',rand(.45,.85));
        } else if(p.state==='reacquire'){
          desired=normalizeAngle(directAim+p.orbitSign*(p.role==='fighter'?.48:.34));
          if((p.stateAge>.32&&distance>185)||p.stateAge>p.stateLimit)this.setState(p,'intercept',rand(.45,.85));
        }
      } else {
        const cx=LOGICAL_W*.5+Math.sin(p.maneuverSeed+p.age*.35)*260;
        const cy=LOGICAL_H*.48+Math.cos(p.maneuverSeed*.7+p.age*.27)*420;
        desired=Math.atan2(cy-p.y,cx-p.x);
        if(p.state!=='seek')this.setState(p,'seek',rand(.3,.7));
      }

      const margin=p.role==='bomber'?185:155;
      let steerX=0,steerY=0;
      if(p.x<margin)steerX+=(margin-p.x)/margin;
      if(p.x>LOGICAL_W-margin)steerX-=(p.x-(LOGICAL_W-margin))/margin;
      if(p.y<margin)steerY+=(margin-p.y)/margin;
      if(p.y>LOGICAL_H-margin)steerY-=(p.y-(LOGICAL_H-margin))/margin;
      if(steerX||steerY){
        const boundary=Math.atan2(steerY,steerX);
        const weight=clamp(Math.hypot(steerX,steerY)*1.9,.48,.96);
        desired=normalizeAngle(desired+normalizeAngle(boundary-desired)*weight);
      }

      let sepX=0,sepY=0,near=0;
      for(const o of all){
        if(o.id===p.id||o.dead)continue;
        const dx=p.x-o.x,dy=p.y-o.y,d2=dx*dx+dy*dy;
        const minDist=p.radius+o.radius+34;
        if(d2>0&&d2<minDist*minDist){
          const d=Math.sqrt(d2),force=(minDist-d)/minDist;
          sepX+=dx/d*force;sepY+=dy/d*force;near++;
        }
      }
      if(near){
        const sepAngle=Math.atan2(sepY,sepX);
        desired=normalizeAngle(desired+normalizeAngle(sepAngle-desired)*.38);
      }

      const before=p.heading;
      const delta=normalizeAngle(desired-p.heading);
      const stateTurn=p.state==='break'?1.12:p.state==='reacquire'?1.06:1;
      const maxTurn=p.turnRate*stateTurn*dt*(p.elite?.95:1);
      p.heading=normalizeAngle(p.heading+clamp(delta,-maxTurn,maxTurn));
      p.bank=lerp(p.bank,clamp(normalizeAngle(p.heading-before)/(Math.max(dt,.001)*Math.max(.1,p.turnRate)),-1,1),1-Math.pow(.03,dt));

      let speedMod=1;
      if(Math.abs(delta)>1.75)speedMod*=.91;
      if(p.state==='break')speedMod*=p.role==='fighter'?1.10:p.role==='interceptor'?1.07:1.03;
      if(p.state==='attack')speedMod*=.98;
      p.vx=Math.cos(p.heading)*p.speed*speedMod;
      p.vy=Math.sin(p.heading)*p.speed*speedMod;
      p.x+=p.vx*dt;
      p.y+=p.vy*dt;

      if(p.x<-150||p.x>LOGICAL_W+150||p.y<-150||p.y>LOGICAL_H+150){
        const centerAngle=Math.atan2(LOGICAL_H*.5-p.y,LOGICAL_W*.5-p.x);
        p.heading=normalizeAngle(p.heading+normalizeAngle(centerAngle-p.heading)*clamp(dt*2.2,0,1));
      }
      if(p.hp<p.maxHp*.35&&Math.random()<dt*9)this.addSmoke(p.x,p.y,p.team==='ally'?.48:.72);
    }

    acquireTarget(p,all) {
      const engaged=new Map();
      for(const q of all)if(q.targetId)engaged.set(q.targetId,(engaged.get(q.targetId)||0)+1);
      let best=null,bestScore=Infinity;
      for(const o of all){
        if(o.team===p.team||o.dead)continue;
        const dx=o.x-p.x,dy=o.y-p.y,d2=dx*dx+dy*dy;
        const angle=Math.abs(normalizeAngle(Math.atan2(dy,dx)-p.heading));
        const crowd=Math.max(0,(engaged.get(o.id)||0)-1);
        const score=d2*(1+angle*.22)+crowd*115000-(o.elite?26000:0);
        if(score<bestScore){best=o;bestScore=score;}
      }
      return best;
    }

    tryFire(p,target) {
      if(p.fireCd>0)return false;
      const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
      const maxRange=p.role==='bomber'?530:p.role==='attacker'?480:455;
      if(d>maxRange)return false;
      const aim=Math.atan2(dy,dx);
      const err=Math.abs(normalizeAngle(aim-p.heading));
      const fireCone=p.elite?.21:p.role==='bomber'?.18:.14;
      if(err>fireCone)return false;
      p.fireCd=p.burst>0?p.fireRate*.34:p.fireRate;
      const spread=p.burst>0?rand(-.018,.018):rand(-.009,.009);
      const a=p.heading+spread;
      const muzzle=Math.max(25,p.radius*1.25);
      this.bullets.push({x:p.x+Math.cos(a)*muzzle,y:p.y+Math.sin(a)*muzzle,vx:Math.cos(a)*780,vy:Math.sin(a)*780,life:.74,team:p.team,ownerId:p.id,damage:p.baseDamage*(p.burst>0?.82:1),r:p.burst>0?4:3});
      this.particles.push({type:'muzzle',x:p.x+Math.cos(a)*muzzle,y:p.y+Math.sin(a)*muzzle,vx:0,vy:0,life:.07,max:.07,size:17});
      return true;
    }

    updateBullets(dt) {
      for(const b of this.bullets){
        b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
        if(b.life<=0)continue;
        for(const p of this.planes){
          if(p.dead||p.team===b.team||p.invuln>0)continue;
          const dx=p.x-b.x,dy=p.y-b.y;
          if(dx*dx+dy*dy<(p.radius+5)*(p.radius+5)){
            b.life=0;
            const absorbed=p.shield>0;
            if(!absorbed)p.hp-=b.damage;
            this.spark(b.x,b.y,absorbed?7:4);
            if(p.hp<=0)this.killPlane(p,b.ownerId);
            break;
          }
        }
      }
      this.bullets=this.bullets.filter(b=>b.life>0&&b.x>-90&&b.x<LOGICAL_W+90&&b.y>-90&&b.y<LOGICAL_H+90);
    }

    killPlane(p,ownerId) {
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
      } else if(this.demoMode)setTimeout(()=>this.join(p.name),2200);
    }

    spark(x,y,n) {
      for(let i=0;i<n;i++){
        const a=rand(0,TAU),s=rand(40,170);
        this.particles.push({type:'spark',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.09,.28),max:.28,size:rand(2,5)});
      }
    }

    addSmoke(x,y,a=.6) {this.particles.push({type:'smoke',x,y,vx:rand(-10,10),vy:rand(18,38),life:rand(.45,.9),max:.9,size:rand(16,30),alpha:a});}

    updateParticles(dt) {
      for(const q of this.particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=Math.pow(.16,dt);q.vy*=Math.pow(.35,dt);q.life-=dt;}
      this.particles=this.particles.filter(q=>q.life>0);
    }

    draw(now) {
      const c=this.ctx,shake=this.cameraShake;
      c.save();
      if(shake)c.translate(rand(-shake,shake),rand(-shake,shake));
      this.drawBackground(c,now);
      this.drawClouds(c,0);
      this.drawBullets(c);
      this.drawPlanes(c);
      this.drawParticles(c);
      this.drawClouds(c,1);
      this.drawBossBar(c);
      c.restore();
    }

    drawBackground(c,now) {
      const g=c.createLinearGradient(0,0,0,LOGICAL_H);
      g.addColorStop(0,'#071323');g.addColorStop(.36,'#123655');g.addColorStop(.72,'#1e5774');g.addColorStop(1,'#315f73');
      c.fillStyle=g;c.fillRect(-30,-30,LOGICAL_W+60,LOGICAL_H+60);
      const scroll=(now*.045)%180;
      c.globalAlpha=.075;c.strokeStyle='#b9e7f8';c.lineWidth=2;
      for(let y=-180+scroll;y<LOGICAL_H+180;y+=180){c.beginPath();c.moveTo(0,y);c.lineTo(LOGICAL_W,y+42);c.stroke();}
      c.globalAlpha=1;
      const sun=c.createRadialGradient(LOGICAL_W*.52,LOGICAL_H*.3,0,LOGICAL_W*.52,LOGICAL_H*.3,520);
      sun.addColorStop(0,'rgba(157,218,242,.14)');sun.addColorStop(1,'rgba(50,110,140,0)');
      c.fillStyle=sun;c.fillRect(0,0,LOGICAL_W,LOGICAL_H);
    }

    drawClouds(c,layer) {
      for(const q of this.clouds){
        if(q.layer!==layer)continue;
        c.save();c.globalAlpha=q.alpha;c.fillStyle='#e5f3f6';c.translate(q.x,q.y);
        for(let i=-2;i<=2;i++){
          const ww=q.w*(.25+Math.abs(i)*.035),hh=q.h*(.55-Math.abs(i)*.07);
          c.beginPath();c.ellipse(i*q.w*.16,Math.sin(i*2)*q.h*.12,ww,hh,0,0,TAU);c.fill();
        }
        c.restore();
      }
      c.globalAlpha=1;
    }

    drawBullets(c) {
      c.save();c.lineCap='round';
      for(const b of this.bullets){
        const a=Math.atan2(b.vy,b.vx),len=22;
        c.strokeStyle=b.team==='ally'?'rgba(255,235,133,.95)':'rgba(255,129,92,.95)';c.lineWidth=b.r;
        c.beginPath();c.moveTo(b.x-Math.cos(a)*len,b.y-Math.sin(a)*len);c.lineTo(b.x,b.y);c.stroke();
      }
      c.restore();
    }

    drawPlanes(c) {
      const sorted=this.planes.filter(p=>!p.dead).sort((a,b)=>a.y-b.y);
      for(const p of sorted){
        const cfg=AIR.get(p.sprite),img=AIR.image(p.sprite);
        c.save();c.translate(p.x,p.y);c.rotate(p.heading+Math.PI/2);
        c.scale(1-Math.abs(p.bank)*.12,1);
        if(p.shield>0){c.strokeStyle='rgba(118,238,255,.7)';c.lineWidth=4;c.beginPath();c.arc(0,0,p.radius*1.65,0,TAU);c.stroke();}
        if(p.repairFlash>0){c.shadowColor='#83ffb2';c.shadowBlur=24;}
        if(img&&img.complete&&img.naturalWidth>0){
          const [bx,by,bw,bh]=cfg.bounds;
          const target=p.renderSize;
          const ratio=bw/bh;
          const outW=ratio>=1?target:target*ratio;
          const outH=ratio>=1?target/ratio:target;
          c.shadowColor='rgba(0,0,0,.62)';c.shadowBlur=7;c.shadowOffsetY=4;
          c.drawImage(img,bx,by,bw,bh,-outW/2,-outH/2,outW,outH);
        } else {
          c.fillStyle=p.team==='ally'?'#9ce7ff':'#ff8e75';
          c.beginPath();c.moveTo(0,-38);c.lineTo(17,27);c.lineTo(0,17);c.lineTo(-17,27);c.closePath();c.fill();
        }
        c.restore();
        this.drawPlaneTag(c,p);
      }
    }

    drawPlaneTag(c,p) {
      const y=p.y-(p.elite?62:46),w=p.elite?96:78,h=6;
      c.save();c.textAlign='center';c.font=`700 ${p.elite?17:13}px system-ui`;c.fillStyle=p.team==='ally'?'#fff':'rgba(255,224,216,.9)';c.shadowColor='rgba(0,0,0,.85)';c.shadowBlur=4;
      c.fillText(p.name,p.x,y-9);
      c.shadowBlur=0;c.fillStyle='rgba(1,6,14,.66)';c.fillRect(p.x-w/2,y,w,h);
      c.fillStyle=p.team==='ally'?'#6ff0b6':'#ff785e';c.fillRect(p.x-w/2,y,w*clamp(p.hp/p.maxHp,0,1),h);
      if(p.level>1&&p.team==='ally'){c.font='800 10px system-ui';c.fillStyle='#ffe270';c.fillText(`LV ${p.level}`,p.x,y+16);}
      c.restore();
    }

    drawBossBar(c) {
      const boss=this.planes.find(p=>p.team==='enemy'&&p.elite&&!p.dead);
      if(!boss)return;
      const w=610,h=16,x=(LOGICAL_W-w)/2,y=150;
      c.save();
      c.fillStyle='rgba(2,8,18,.72)';c.fillRect(x-8,y-26,w+16,50);
      c.textAlign='center';c.font='800 17px system-ui';c.fillStyle='#ffd0bf';c.fillText(`ACE • ${boss.sprite.replaceAll('_',' ')}`,LOGICAL_W/2,y-7);
      c.fillStyle='rgba(0,0,0,.65)';c.fillRect(x,y,w,h);
      c.fillStyle='#ff6d52';c.fillRect(x,y,w*clamp(boss.hp/boss.maxHp,0,1),h);
      c.restore();
    }

    drawParticles(c) {
      for(const q of this.particles){
        const t=clamp(q.life/q.max,0,1);
        c.save();c.globalAlpha=t*(q.alpha??1);
        if(q.type==='smoke'){c.fillStyle='#1a2028';c.beginPath();c.arc(q.x,q.y,q.size*(1+(1-t)*.8),0,TAU);c.fill();}
        else if(q.type==='spark'){c.fillStyle='#ffe38a';c.fillRect(q.x-q.size/2,q.y-q.size/2,q.size,q.size);}
        else if(q.type==='muzzle'){c.fillStyle='#fff3a0';c.beginPath();c.arc(q.x,q.y,q.size*t,0,TAU);c.fill();}
        else if(q.type==='debris'){c.fillStyle='#292d31';c.translate(q.x,q.y);c.rotate((1-t)*5);c.fillRect(-q.size,-q.size*.45,q.size*2,q.size*.9);}
        else {const g=c.createRadialGradient(q.x,q.y,0,q.x,q.y,q.size);g.addColorStop(0,'rgba(255,250,192,1)');g.addColorStop(.4,'rgba(255,139,46,.9)');g.addColorStop(1,'rgba(90,30,15,0)');c.fillStyle=g;c.beginPath();c.arc(q.x,q.y,q.size,0,TAU);c.fill();}
        c.restore();
      }
      c.globalAlpha=1;
    }

    say(text) {
      const el=document.getElementById('announcement');
      el.textContent=text;el.classList.add('show');
      clearTimeout(this.announcementTimer);
      this.announcementTimer=setTimeout(()=>el.classList.remove('show'),1450);
    }

    updateHudThrottled(now){if(!this._hudAt||now-this._hudAt>220){this._hudAt=now;this.updateHud();}}
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
      const dt=clamp((now-this.last)/1000,0,.033);this.last=now;
      this.update(dt,now);this.draw(now);
      requestAnimationFrame(t=>this.loop(t));
    }
  }

  window.addEventListener('DOMContentLoaded',async()=>{
    await AIR.ready;
    new SkySurvivors();
  });
})();
