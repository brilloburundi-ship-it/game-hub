(() => {
  'use strict';

  const LOGICAL_W = 1080;
  const LOGICAL_H = 1920;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const normalizeAngle = a => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };

  const SPRITES = {
    'US_p40':[0,0], 'US_p47':[1,0], 'US_p51':[2,0], 'UK_Spitfire':[3,0], 'USSR_La5':[4,0],
    'GER_bf109':[0,1], 'GER_FW190':[1,1], 'JAP_a6m':[2,1], 'JAP_Ki61':[3,1], 'GER_He111':[4,1]
  };
  const ALLY_SPRITES = ['US_p40','US_p47','US_p51','UK_Spitfire','USSR_La5'];
  const ENEMY_SPRITES = ['GER_bf109','GER_FW190','JAP_a6m','JAP_Ki61'];
  const HEAVY_ENEMIES = ['GER_He111'];

  class SkySurvivors {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.spriteSheet = new Image();
      this.spriteSheet.src = window.AIRCRAFT_ATLAS_URL;
      this.spriteReady = false;
      this.spriteSheet.onload = () => { this.spriteReady = true; };

      this.planes = [];
      this.bullets = [];
      this.particles = [];
      this.clouds = [];
      this.wave = 1;
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

      for (let i=0;i<24;i++) this.clouds.push(this.makeCloud(true));
      this.installUI();
      this.installBridge();
      this.startWave(1);
      if (this.demoMode) this.seedDemo();
      requestAnimationFrame(t => this.loop(t));
    }

    installUI() {
      document.getElementById('modeBadge').textContent = this.demoMode ? 'TEST' : 'LIVE';
      const panel = document.getElementById('testPanel');
      panel.hidden = !this.demoMode;
      panel.addEventListener('click', e => {
        const action = e.target?.dataset?.test;
        if (!action) return;
        const first = this.planes.find(p => p.team === 'ally');
        if (action === 'join') this.join(`pilot_${Math.floor(rand(10,99))}`);
        if (action === 'like' && first) this.like(first.name, 50);
        if (action === 'follow' && first) this.follow(first.name);
        if (action === 'rose' && first) this.gift(first.name, 'rose', 1);
        if (action === 'wave') this.startWave(this.wave + 1, true);
        if (action === 'reset') this.reset(true);
      });
    }

    installBridge() {
      const api = {
        join: user => this.join(user),
        like: (user, count=1) => this.like(user, count),
        follow: user => this.follow(user),
        gift: (user, gift='rose', count=1, value=1) => this.gift(user, gift, count, value),
        nextWave: () => this.startWave(this.wave + 1, true),
        reset: () => this.reset(false),
        state: () => ({ wave:this.wave, pilots:this.planes.filter(p=>p.team==='ally').length, kills:this.totalKills })
      };
      window.skySurvivors = api;
      window.addEventListener('sky-survivors-event', e => this.consumeLiveEvent(e.detail));
      window.addEventListener('message', e => {
        if (e.data?.type === 'sky-survivors-event') this.consumeLiveEvent(e.data.payload);
      });
    }

    consumeLiveEvent(ev={}) {
      const type = String(ev.type || ev.event || '').toLowerCase();
      const user = ev.user || ev.uniqueId || ev.username || ev.nickname || 'pilot';
      if (type === 'join' || type === 'chat_join') this.join(user);
      else if (type === 'like') this.like(user, Number(ev.count || ev.likeCount || 1));
      else if (type === 'follow') this.follow(user);
      else if (type === 'gift') this.gift(user, ev.gift || ev.giftName || 'gift', Number(ev.count || 1), Number(ev.value || ev.diamondCount || 1));
    }

    seedDemo() {
      ['SkyFox','Maverick','Nova','Raptor','Comet','Blaze'].forEach((n,i) => setTimeout(() => this.join(n), i*180));
      this.say('DOGFIGHT TEST');
    }

    reset(reseed=false) {
      this.planes.length = 0;
      this.bullets.length = 0;
      this.particles.length = 0;
      this.totalKills = 0;
      this.startWave(1, true);
      if (reseed && this.demoMode) this.seedDemo();
    }

    startWave(n, forced=false) {
      this.wave = Math.max(1, n|0);
      this.waveStartedAt = performance.now();
      this.waveTarget = Math.min(8 + this.wave * 3, 44);
      this.waveSpawned = 0;
      this.waveKilled = 0;
      if (forced) {
        this.planes = this.planes.filter(p => p.team === 'ally');
        this.bullets.length = 0;
      }
      this.say(this.wave % 5 === 0 ? `ACE WAVE ${this.wave}` : `WAVE ${this.wave}`);
      this.updateHud();
    }

    join(rawName) {
      const name = String(rawName || 'pilot').slice(0, 20);
      let p = this.planes.find(x => x.team === 'ally' && x.name.toLowerCase() === name.toLowerCase());
      if (p) {
        p.hp = p.maxHp;
        p.burst = Math.max(p.burst, 1.5);
        this.say(`${name} BACK IN THE SKY`);
        return p;
      }
      const x = rand(150, LOGICAL_W - 150);
      const y = rand(LOGICAL_H * .62, LOGICAL_H * .84);
      p = this.makePlane('ally', name, x, y, pick(ALLY_SPRITES));
      p.heading = rand(-.35, .35) - Math.PI / 2;
      p.baseDamage = 15;
      p.maxHp = p.hp = 100;
      this.planes.push(p);
      this.say(`${name} • TAKE OFF`);
      this.updateHud();
      return p;
    }

    like(user, count=1) {
      const p = this.findPilot(user);
      if (!p) return;
      const heal = clamp(count * .32, 1, 25);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      p.repairFlash = .35;
    }

    follow(user) {
      const p = this.findPilot(user);
      if (!p) return;
      p.level++;
      p.maxHp += 18;
      p.hp = p.maxHp;
      p.baseDamage += 3;
      p.fireRate = Math.max(.13, p.fireRate - .018);
      p.turnRate += .08;
      this.say(`${p.name} • AIRFRAME UPGRADE`);
    }

    gift(user, gift='rose', count=1, value=1) {
      const p = this.findPilot(user);
      if (!p) return;
      const key = String(gift).toLowerCase();
      if (key.includes('rose')) {
        p.burst = Math.max(p.burst, 5 + count * .3);
        p.shield = Math.max(p.shield, 2.5);
        this.say(`${p.name} • RAPID FIRE`);
      } else {
        p.burst = Math.max(p.burst, clamp(4 + value * .18, 4, 16));
        p.shield = Math.max(p.shield, clamp(2 + value * .05, 2, 8));
        p.hp = Math.min(p.maxHp, p.hp + clamp(value, 8, 55));
        this.say(`${p.name} • AIR SUPPORT`);
      }
    }

    findPilot(user) {
      const key = String(user || '').toLowerCase();
      return this.planes.find(p => p.team === 'ally' && p.name.toLowerCase() === key) || this.planes.find(p => p.team === 'ally');
    }

    makePlane(team, name, x, y, sprite) {
      const isEnemy = team === 'enemy';
      return {
        id: this.nextId++, team, name, x, y, vx:0, vy:0, heading: -Math.PI/2,
        sprite, speed: isEnemy ? rand(122,165) : rand(138,178),
        turnRate: isEnemy ? rand(1.65,2.2) : rand(1.85,2.55),
        radius: 31, hp: 70, maxHp:70, fireRate: rand(.30,.42), fireCd:rand(0,.35),
        baseDamage: isEnemy ? 8 : 13, targetId:null, retarget:0, burst:0, shield:0,
        level:1, kills:0, score:0, age:0, invuln:.6, repairFlash:0, smokeSeed:Math.random()*1000,
        bank:0, dead:false, elite:false
      };
    }

    spawnEnemy() {
      if (this.waveSpawned >= this.waveTarget) return;
      const sideChance = Math.random();
      let x, y, heading;
      if (sideChance < .18) { x = -65; y = rand(240, LOGICAL_H*.7); heading = rand(-.2,.45); }
      else if (sideChance < .36) { x = LOGICAL_W+65; y = rand(240, LOGICAL_H*.7); heading = Math.PI + rand(-.45,.2); }
      else { x = rand(80, LOGICAL_W-80); y = -75; heading = Math.PI/2 + rand(-.55,.55); }
      const heavy = this.wave % 5 === 0 && this.waveSpawned === this.waveTarget - 1;
      const p = this.makePlane('enemy', heavy ? 'ENEMY ACE' : `Bandit ${this.waveSpawned+1}`, x, y, heavy ? pick(HEAVY_ENEMIES) : pick(ENEMY_SPRITES));
      p.heading = heading;
      p.maxHp = p.hp = heavy ? 360 + this.wave*18 : 54 + this.wave*7;
      p.baseDamage = heavy ? 16 : 7 + this.wave*.45;
      p.speed *= heavy ? .82 : 1;
      p.turnRate *= heavy ? .72 : 1;
      p.radius = heavy ? 48 : 30;
      p.elite = heavy;
      p.score = heavy ? 12 : 1;
      this.planes.push(p);
      this.waveSpawned++;
      if (heavy) this.say('⚠ ENEMY ACE INCOMING');
    }

    makeCloud(initial=false) {
      return {
        x: rand(-120, LOGICAL_W+120), y: initial ? rand(-100, LOGICAL_H+100) : rand(-280,-80),
        w: rand(170,430), h: rand(55,130), speed:rand(20,78), alpha:rand(.035,.13), layer:Math.random() < .45 ? 0 : 1
      };
    }

    update(dt, now) {
      for (const c of this.clouds) {
        c.y += c.speed * dt * (c.layer ? 1.45 : .8);
        c.x += Math.sin((now*.00015)+(c.y*.003))*dt*5;
        if (c.y - c.h > LOGICAL_H + 80) Object.assign(c, this.makeCloud(false));
      }

      const aliveAllies = this.planes.filter(p => p.team === 'ally' && !p.dead);
      const aliveEnemies = this.planes.filter(p => p.team === 'enemy' && !p.dead);
      if (aliveAllies.length && this.waveSpawned < this.waveTarget && now - this.lastEnemySpawn > Math.max(280, 760 - this.wave*22)) {
        this.spawnEnemy();
        this.lastEnemySpawn = now;
      }
      if (aliveAllies.length && this.waveSpawned >= this.waveTarget && aliveEnemies.length === 0 && now - this.waveStartedAt > 2800) {
        this.startWave(this.wave + 1);
      }

      const planeSnapshot = this.planes.filter(p => !p.dead);
      for (const p of planeSnapshot) this.updatePlane(p, dt, planeSnapshot);
      this.updateBullets(dt);
      this.updateParticles(dt);
      this.planes = this.planes.filter(p => !p.dead || p.deathTimer > 0);
      for (const p of this.planes) if (p.dead) p.deathTimer -= dt;
      this.cameraShake = Math.max(0, this.cameraShake - dt*10);
      this.updateHudThrottled(now);
    }

    updatePlane(p, dt, all) {
      if (p.dead) return;
      p.age += dt;
      p.fireCd -= dt;
      p.retarget -= dt;
      p.invuln = Math.max(0, p.invuln-dt);
      p.burst = Math.max(0, p.burst-dt);
      p.shield = Math.max(0, p.shield-dt);
      p.repairFlash = Math.max(0, p.repairFlash-dt);

      let target = all.find(x => x.id === p.targetId && x.team !== p.team && !x.dead);
      if (!target || p.retarget <= 0 || this.dist2(p,target) > 620*620) {
        target = this.acquireTarget(p, all);
        p.targetId = target?.id || null;
        p.retarget = rand(.45,.9);
      }

      let desired = p.heading;
      if (target) {
        const dx = target.x-p.x, dy = target.y-p.y;
        const d = Math.max(1, Math.hypot(dx,dy));
        const bulletSpeed = 720;
        const leadTime = clamp(d / bulletSpeed, .05, .55);
        let aimX = target.x + target.vx*leadTime;
        let aimY = target.y + target.vy*leadTime;

        if (d < 150) {
          const side = ((p.id + target.id) & 1) ? 1 : -1;
          aimX += (-dy/d) * 115 * side;
          aimY += ( dx/d) * 115 * side;
        }
        desired = Math.atan2(aimY-p.y, aimX-p.x);
      }

      const margin = 105;
      let steerX = 0, steerY = 0;
      if (p.x < margin) steerX += (margin-p.x) / margin;
      if (p.x > LOGICAL_W-margin) steerX -= (p.x-(LOGICAL_W-margin)) / margin;
      if (p.y < margin) steerY += (margin-p.y) / margin;
      if (p.y > LOGICAL_H-margin) steerY -= (p.y-(LOGICAL_H-margin)) / margin;
      if (steerX || steerY) {
        const boundary = Math.atan2(steerY, steerX);
        const weight = clamp(Math.hypot(steerX,steerY)*1.8, .55, 1);
        const d = normalizeAngle(boundary-desired);
        desired = normalizeAngle(desired + d*weight);
      }

      let sepX=0, sepY=0, near=0;
      for (const o of all) {
        if (o.id===p.id || o.dead) continue;
        const dx=p.x-o.x, dy=p.y-o.y, d2=dx*dx+dy*dy;
        if (d2>0 && d2<92*92) {
          const d=Math.sqrt(d2); const force=(92-d)/92;
          sepX += dx/d*force; sepY += dy/d*force; near++;
        }
      }
      if (near) {
        const sepAngle=Math.atan2(sepY,sepX);
        desired=normalizeAngle(desired + normalizeAngle(sepAngle-desired)*.32);
      }

      const before = p.heading;
      const delta = normalizeAngle(desired - p.heading);
      const maxTurn = p.turnRate * dt * (p.elite ? .9 : 1);
      p.heading = normalizeAngle(p.heading + clamp(delta,-maxTurn,maxTurn));
      p.bank = lerp(p.bank, clamp(normalizeAngle(p.heading-before)/(Math.max(dt,.001)*p.turnRate),-1,1), 1-Math.pow(.03,dt));

      const speedMod = target && Math.abs(delta) > 1.8 ? .91 : 1;
      p.vx = Math.cos(p.heading) * p.speed * speedMod;
      p.vy = Math.sin(p.heading) * p.speed * speedMod;
      p.x += p.vx*dt;
      p.y += p.vy*dt;

      if (p.x < -130 || p.x > LOGICAL_W+130 || p.y < -130 || p.y > LOGICAL_H+130) {
        const centerAngle = Math.atan2(LOGICAL_H*.5-p.y, LOGICAL_W*.5-p.x);
        p.heading = normalizeAngle(p.heading + normalizeAngle(centerAngle-p.heading)*clamp(dt*1.6,0,1));
      }

      if (target) this.tryFire(p,target);
      if (p.hp < p.maxHp*.35 && Math.random() < dt*10) this.addSmoke(p.x,p.y,p.team === 'ally' ? .5 : .75);
    }

    acquireTarget(p, all) {
      let best=null, bestScore=Infinity;
      for (const o of all) {
        if (o.team===p.team || o.dead) continue;
        const dx=o.x-p.x, dy=o.y-p.y, d2=dx*dx+dy*dy;
        const angle=Math.abs(normalizeAngle(Math.atan2(dy,dx)-p.heading));
        const score=d2*(1+angle*.33) - (o.elite ? 18000 : 0);
        if (score<bestScore) { best=o; bestScore=score; }
      }
      return best;
    }

    tryFire(p,target) {
      if (p.fireCd>0) return;
      const dx=target.x-p.x, dy=target.y-p.y, d=Math.hypot(dx,dy);
      if (d>470) return;
      const aim=Math.atan2(dy,dx);
      const err=Math.abs(normalizeAngle(aim-p.heading));
      const fireCone=p.elite ? .20 : .14;
      if (err>fireCone) return;
      p.fireCd = p.burst>0 ? p.fireRate*.34 : p.fireRate;
      const spread=p.burst>0 ? rand(-.018,.018) : rand(-.009,.009);
      const a=p.heading+spread;
      const muzzle=38;
      this.bullets.push({
        x:p.x+Math.cos(a)*muzzle, y:p.y+Math.sin(a)*muzzle,
        vx:Math.cos(a)*760, vy:Math.sin(a)*760, life:.72,
        team:p.team, ownerId:p.id, damage:p.baseDamage*(p.burst>0?.82:1), r:p.burst>0?4:3
      });
      this.particles.push({type:'muzzle',x:p.x+Math.cos(a)*muzzle,y:p.y+Math.sin(a)*muzzle,vx:0,vy:0,life:.07,max:.07,size:20});
    }

    updateBullets(dt) {
      for (const b of this.bullets) {
        b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
        if (b.life<=0) continue;
        for (const p of this.planes) {
          if (p.dead || p.team===b.team || p.invuln>0) continue;
          const dx=p.x-b.x, dy=p.y-b.y;
          if (dx*dx+dy*dy < (p.radius+5)*(p.radius+5)) {
            b.life=0;
            const absorbed = p.shield>0;
            if (!absorbed) p.hp-=b.damage;
            this.spark(b.x,b.y, absorbed ? 7 : 4);
            if (p.hp<=0) this.killPlane(p,b.ownerId);
            break;
          }
        }
      }
      this.bullets=this.bullets.filter(b=>b.life>0 && b.x>-80 && b.x<LOGICAL_W+80 && b.y>-80 && b.y<LOGICAL_H+80);
    }

    killPlane(p, ownerId) {
      if (p.dead) return;
      p.dead=true; p.deathTimer=.42;
      for (let i=0;i<(p.elite?42:19);i++) {
        const a=rand(0,TAU), s=rand(45,p.elite?300:190);
        this.particles.push({type:'explosion',x:p.x,y:p.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.28,.75),max:.75,size:rand(8,p.elite?34:23)});
      }
      this.cameraShake=Math.max(this.cameraShake,p.elite?16:6);
      if (p.team==='enemy') {
        this.totalKills++; this.waveKilled++;
        const killer=this.planes.find(x=>x.id===ownerId);
        if (killer) { killer.kills++; killer.score+=p.elite?12:1; }
      } else if (this.demoMode) {
        setTimeout(()=>this.join(p.name),2200);
      }
    }

    spark(x,y,n) {
      for(let i=0;i<n;i++) {
        const a=rand(0,TAU),s=rand(40,170);
        this.particles.push({type:'spark',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.09,.28),max:.28,size:rand(2,5)});
      }
    }
    addSmoke(x,y,a=.6) { this.particles.push({type:'smoke',x,y,vx:rand(-10,10),vy:rand(18,38),life:rand(.45,.9),max:.9,size:rand(18,34),alpha:a}); }
    updateParticles(dt) {
      for(const q of this.particles){ q.x+=q.vx*dt; q.y+=q.vy*dt; q.vx*=Math.pow(.16,dt); q.vy*=Math.pow(.35,dt); q.life-=dt; }
      this.particles=this.particles.filter(q=>q.life>0);
    }

    draw(now) {
      const c=this.ctx;
      const shake=this.cameraShake;
      c.save();
      if (shake) c.translate(rand(-shake,shake),rand(-shake,shake));
      this.drawBackground(c,now);
      this.drawClouds(c,0);
      this.drawBullets(c);
      this.drawPlanes(c);
      this.drawParticles(c);
      this.drawClouds(c,1);
      c.restore();
    }

    drawBackground(c,now) {
      const g=c.createLinearGradient(0,0,0,LOGICAL_H);
      g.addColorStop(0,'#071323'); g.addColorStop(.36,'#123655'); g.addColorStop(.72,'#1e5774'); g.addColorStop(1,'#315f73');
      c.fillStyle=g; c.fillRect(-30,-30,LOGICAL_W+60,LOGICAL_H+60);
      const scroll=(now*.045)%180;
      c.globalAlpha=.08; c.strokeStyle='#b9e7f8'; c.lineWidth=2;
      for(let y=-180+scroll;y<LOGICAL_H+180;y+=180){ c.beginPath(); c.moveTo(0,y); c.lineTo(LOGICAL_W,y+42); c.stroke(); }
      c.globalAlpha=1;
      const sun=c.createRadialGradient(LOGICAL_W*.52,LOGICAL_H*.3,0,LOGICAL_W*.52,LOGICAL_H*.3,520);
      sun.addColorStop(0,'rgba(157,218,242,.14)'); sun.addColorStop(1,'rgba(50,110,140,0)');
      c.fillStyle=sun; c.fillRect(0,0,LOGICAL_W,LOGICAL_H);
    }

    drawClouds(c,layer) {
      for(const q of this.clouds){
        if(q.layer!==layer)continue;
        c.save(); c.globalAlpha=q.alpha; c.fillStyle='#e5f3f6';
        c.translate(q.x,q.y);
        for(let i=-2;i<=2;i++){
          const ww=q.w*(.25+Math.abs(i)*.035); const hh=q.h*(.55-Math.abs(i)*.07);
          c.beginPath(); c.ellipse(i*q.w*.16,Math.sin(i*2)*q.h*.12,ww,hh,0,0,TAU); c.fill();
        }
        c.restore();
      }
      c.globalAlpha=1;
    }

    drawBullets(c) {
      c.save(); c.lineCap='round';
      for(const b of this.bullets){
        const a=Math.atan2(b.vy,b.vx); const len=25;
        c.strokeStyle=b.team==='ally'?'rgba(255,235,133,.95)':'rgba(255,129,92,.95)'; c.lineWidth=b.r;
        c.beginPath(); c.moveTo(b.x-Math.cos(a)*len,b.y-Math.sin(a)*len); c.lineTo(b.x,b.y); c.stroke();
      }
      c.restore();
    }

    drawPlanes(c) {
      const sorted=this.planes.filter(p=>!p.dead).sort((a,b)=>a.y-b.y);
      for(const p of sorted){
        c.save(); c.translate(p.x,p.y); c.rotate(p.heading+Math.PI/2);
        const scale=p.elite?1.15:.72;
        if (p.shield>0){
          c.strokeStyle='rgba(118,238,255,.7)'; c.lineWidth=5; c.beginPath(); c.arc(0,0,p.radius*1.55,0,TAU); c.stroke();
        }
        if (p.repairFlash>0){ c.shadowColor='#83ffb2'; c.shadowBlur=28; }
        if (this.spriteReady){
          const [sx,sy]=SPRITES[p.sprite]||[0,0];
          c.drawImage(this.spriteSheet,sx*50,sy*50,50,50,-50*scale,-50*scale,100*scale,100*scale);
        } else {
          c.fillStyle=p.team==='ally'?'#9ce7ff':'#ff8e75'; c.beginPath(); c.moveTo(0,-33); c.lineTo(20,26); c.lineTo(0,17); c.lineTo(-20,26); c.closePath(); c.fill();
        }
        c.restore();
        this.drawPlaneTag(c,p);
      }
    }

    drawPlaneTag(c,p) {
      const y=p.y-(p.elite?67:52);
      const w=86, h=7;
      c.save(); c.textAlign='center'; c.font=`700 ${p.elite?18:15}px system-ui`; c.fillStyle=p.team==='ally'?'#ffffff':'rgba(255,224,216,.88)'; c.shadowColor='rgba(0,0,0,.85)'; c.shadowBlur=5;
      c.fillText(p.name,p.x,y-10);
      c.shadowBlur=0; c.fillStyle='rgba(1,6,14,.68)'; c.fillRect(p.x-w/2,y,w,h);
      c.fillStyle=p.team==='ally'?'#6ff0b6':'#ff785e'; c.fillRect(p.x-w/2,y,w*clamp(p.hp/p.maxHp,0,1),h);
      if(p.level>1 && p.team==='ally'){ c.font='800 11px system-ui'; c.fillStyle='#ffe270'; c.fillText(`LV ${p.level}`,p.x,y+18); }
      c.restore();
    }

    drawParticles(c) {
      for(const q of this.particles){
        const t=clamp(q.life/q.max,0,1);
        c.save(); c.globalAlpha=t*(q.alpha??1);
        if(q.type==='smoke'){ c.fillStyle='#1a2028'; c.beginPath(); c.arc(q.x,q.y,q.size*(1+(1-t)*.8),0,TAU); c.fill(); }
        else if(q.type==='spark'){ c.fillStyle='#ffe38a'; c.fillRect(q.x-q.size/2,q.y-q.size/2,q.size,q.size); }
        else if(q.type==='muzzle'){ c.fillStyle='#fff3a0'; c.beginPath(); c.arc(q.x,q.y,q.size*t,0,TAU); c.fill(); }
        else { const g=c.createRadialGradient(q.x,q.y,0,q.x,q.y,q.size); g.addColorStop(0,'rgba(255,250,192,1)'); g.addColorStop(.4,'rgba(255,139,46,.9)'); g.addColorStop(1,'rgba(90,30,15,0)'); c.fillStyle=g; c.beginPath(); c.arc(q.x,q.y,q.size,0,TAU); c.fill(); }
        c.restore();
      }
      c.globalAlpha=1;
    }

    say(text) {
      const el=document.getElementById('announcement');
      el.textContent=text; el.classList.add('show');
      clearTimeout(this.announcementTimer);
      this.announcementTimer=setTimeout(()=>el.classList.remove('show'),1300);
    }

    updateHudThrottled(now) { if(!this._hudAt || now-this._hudAt>220){ this._hudAt=now; this.updateHud(); } }
    updateHud() {
      const allies=this.planes.filter(p=>p.team==='ally'&&!p.dead);
      document.getElementById('waveValue').textContent=this.wave;
      document.getElementById('pilotValue').textContent=allies.length;
      document.getElementById('killValue').textContent=this.totalKills;
      const top=[...allies].sort((a,b)=>(b.score+b.kills)-(a.score+a.kills)).slice(0,3);
      document.getElementById('rankingRows').innerHTML=top.map((p,i)=>`<div class="rank-row"><span>${i+1}</span><strong>${this.escapeHtml(p.name)}</strong><em>${p.kills}</em></div>`).join('');
    }
    escapeHtml(s){ return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    dist2(a,b){ const dx=a.x-b.x,dy=a.y-b.y; return dx*dx+dy*dy; }

    loop(now) {
      const dt=clamp((now-this.last)/1000,0,.033); this.last=now;
      this.update(dt,now); this.draw(now);
      requestAnimationFrame(t=>this.loop(t));
    }
  }

  window.addEventListener('DOMContentLoaded', () => new SkySurvivors());
})();
