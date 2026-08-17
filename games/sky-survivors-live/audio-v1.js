(() => {
  'use strict';

  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => a + Math.random()*(b-a);

  class SkyCombatAudio {
    constructor(){
      this.ctx = null;
      this.master = null;
      this.engineGain = null;
      this.windGain = null;
      this.engineA = null;
      this.engineB = null;
      this.wind = null;
      this.noiseBuffer = null;
      this.enabled = true;
      this.unlocked = false;
      this.lastState = null;
      this.lastGunAt = 0;
      this.lastHitAt = 0;
      this.lastRepairAt = 0;
      this.nextBurstAt = performance.now()+900;
      this.pollTimer = 0;
      this.button = null;
      this.apiWrapped = false;
      this.installUnlock();
      this.installButton();
      this.startPolling();
    }

    ensure(){
      if(this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return false;
      this.ctx = new AC({latencyHint:'interactive'});
      this.master = this.ctx.createGain();
      this.master.gain.value = .58;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(1.5);
      this.buildAmbience();
      return true;
    }

    makeNoise(seconds){
      const frames = Math.max(1,Math.floor((this.ctx?.sampleRate||44100)*seconds));
      const b = this.ctx.createBuffer(1,frames,this.ctx.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for(let i=0;i<frames;i++){
        const white = Math.random()*2-1;
        last = last*.86 + white*.14;
        d[i] = last;
      }
      return b;
    }

    buildAmbience(){
      const c=this.ctx;
      this.engineGain=c.createGain();this.engineGain.gain.value=0;
      const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=520;lp.Q.value=.7;
      this.engineA=c.createOscillator();this.engineA.type='sawtooth';this.engineA.frequency.value=56;
      this.engineB=c.createOscillator();this.engineB.type='triangle';this.engineB.frequency.value=88;
      const gA=c.createGain();gA.gain.value=.42;
      const gB=c.createGain();gB.gain.value=.24;
      this.engineA.connect(gA).connect(lp);this.engineB.connect(gB).connect(lp);lp.connect(this.engineGain).connect(this.master);
      this.engineA.start();this.engineB.start();

      this.windGain=c.createGain();this.windGain.gain.value=0;
      const windFilter=c.createBiquadFilter();windFilter.type='bandpass';windFilter.frequency.value=980;windFilter.Q.value=.42;
      this.wind=c.createBufferSource();this.wind.buffer=this.noiseBuffer;this.wind.loop=true;
      this.wind.connect(windFilter).connect(this.windGain).connect(this.master);this.wind.start();
    }

    async unlock(){
      if(!this.enabled || !this.ensure()) return;
      const firstUnlock = !this.unlocked;
      try{if(this.ctx.state!=='running')await this.ctx.resume();}catch{}
      this.unlocked=this.ctx.state==='running';
      this.updateButton();
      if(this.unlocked && firstUnlock) this.flyby(.5);
    }

    installUnlock(){
      const unlock=()=>this.unlock();
      window.addEventListener('pointerdown',unlock,{passive:true});
      window.addEventListener('touchstart',unlock,{passive:true});
      window.addEventListener('keydown',unlock,{passive:true});
    }

    installButton(){
      const make=()=>{
        if(this.button||!document.body)return;
        const b=document.createElement('button');
        b.id='skySoundToggle';b.type='button';b.setAttribute('aria-label','Audio Sky Survivors');
        Object.assign(b.style,{position:'fixed',right:'10px',top:'82px',zIndex:'40',border:'1px solid rgba(255,255,255,.2)',borderRadius:'999px',padding:'6px 9px',background:'rgba(3,11,24,.58)',color:'#eaf8ff',font:'800 11px system-ui',letterSpacing:'.04em',backdropFilter:'blur(5px)',webkitBackdropFilter:'blur(5px)',cursor:'pointer'});
        b.addEventListener('click',e=>{e.stopPropagation();this.enabled=!this.enabled;if(this.enabled)this.unlock();this.updateButton();this.setMaster(this.enabled ? .58 : 0);});
        document.body.appendChild(b);this.button=b;this.updateButton();
      };
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',make,{once:true});else make();
    }

    updateButton(){
      if(!this.button)return;
      this.button.textContent=!this.enabled?'🔇 OFF':this.unlocked?'🔊 SOUND':'🔈 TAP';
      this.button.style.opacity=this.enabled?'1':'.65';
    }

    setMaster(value){
      if(!this.master||!this.ctx)return;
      this.master.gain.setTargetAtTime(value,this.ctx.currentTime,.04);
    }

    panNode(x=.5){
      if(!this.ctx.createStereoPanner)return this.ctx.createGain();
      const p=this.ctx.createStereoPanner();p.pan.value=clamp((x-.5)*1.35,-.8,.8);return p;
    }

    oneShotNoise({duration=.08,volume=.12,frequency=1700,q=.8,type='bandpass',x=.5}={}){
      if(!this.unlocked||!this.enabled)return;
      const c=this.ctx,src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),pan=this.panNode(x);
      src.buffer=this.noiseBuffer;f.type=type;f.frequency.value=frequency;f.Q.value=q;
      const t=c.currentTime;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
      src.connect(f).connect(g).connect(pan).connect(this.master);src.start(t,rand(0,.8));src.stop(t+duration+.02);
    }

    gun(x=.5,heavy=false,burst=false){
      const now=performance.now();if(now-this.lastGunAt<32)return;this.lastGunAt=now;
      this.oneShotNoise({duration:heavy?.12:.072,volume:heavy?.22:.135,frequency:heavy?900:1550,q:.65,x});
      if(!this.unlocked)return;
      const c=this.ctx,o=c.createOscillator(),g=c.createGain(),pan=this.panNode(x),t=c.currentTime;
      o.type='square';o.frequency.setValueAtTime(heavy?145:220,t);o.frequency.exponentialRampToValueAtTime(heavy?72:105,t+(heavy?.11:.065));
      g.gain.setValueAtTime(heavy?.065:.038,t);g.gain.exponentialRampToValueAtTime(.0001,t+(heavy?.12:.075));
      o.connect(g).connect(pan).connect(this.master);o.start(t);o.stop(t+(heavy?.13:.085));
      if(burst&&Math.random()<.55)setTimeout(()=>this.oneShotNoise({duration:.055,volume:.09,frequency:1900,x}),42);
    }

    hit(x=.5,shield=false){
      const now=performance.now();if(now-this.lastHitAt<90)return;this.lastHitAt=now;
      this.oneShotNoise({duration:shield?.12:.06,volume:shield?.08:.075,frequency:shield?3100:2400,q:1.2,x});
    }

    explosion(x=.5,big=false){
      this.oneShotNoise({duration:big?.85:.48,volume:big?.42:.29,frequency:big?180:260,q:.48,type:'lowpass',x});
      if(!this.unlocked||!this.enabled)return;
      const c=this.ctx,o=c.createOscillator(),g=c.createGain(),pan=this.panNode(x),t=c.currentTime;
      o.type='sine';o.frequency.setValueAtTime(big?92:118,t);o.frequency.exponentialRampToValueAtTime(34,t+(big?.7:.4));
      g.gain.setValueAtTime(big?.20:.12,t);g.gain.exponentialRampToValueAtTime(.0001,t+(big?.75:.45));
      o.connect(g).connect(pan).connect(this.master);o.start(t);o.stop(t+(big?.8:.5));
    }

    flyby(x=.5){
      if(!this.unlocked||!this.enabled)return;
      const c=this.ctx,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain(),pan=this.panNode(x),t=c.currentTime;
      o.type='sawtooth';o.frequency.setValueAtTime(76,t);o.frequency.exponentialRampToValueAtTime(118,t+.28);o.frequency.exponentialRampToValueAtTime(64,t+.82);
      f.type='lowpass';f.frequency.value=620;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.095,t+.18);g.gain.exponentialRampToValueAtTime(.0001,t+.9);
      o.connect(f).connect(g).connect(pan).connect(this.master);o.start(t);o.stop(t+.95);
    }

    ace(){
      if(!this.unlocked||!this.enabled)return;
      const c=this.ctx,t=c.currentTime;
      [146,196].forEach((base,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sawtooth';o.frequency.setValueAtTime(base,t+i*.08);o.frequency.linearRampToValueAtTime(base*1.58,t+.72+i*.08);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.075,t+.08);g.gain.exponentialRampToValueAtTime(.0001,t+.92);o.connect(g).connect(this.master);o.start(t+i*.08);o.stop(t+1);});
    }

    chime(kind='upgrade'){
      if(!this.unlocked||!this.enabled)return;
      const c=this.ctx,t=c.currentTime,notes=kind==='gift'?[440,660,880]:kind==='repair'?[520,660]:[330,494,659];
      notes.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;const st=t+i*.055;g.gain.setValueAtTime(.0001,st);g.gain.exponentialRampToValueAtTime(.045,st+.018);g.gain.exponentialRampToValueAtTime(.0001,st+.22);o.connect(g).connect(this.master);o.start(st);o.stop(st+.24);});
    }

    repair(){
      const now=performance.now();if(now-this.lastRepairAt<500)return;this.lastRepairAt=now;
      this.chime('repair');
    }

    updateAmbience(state){
      if(!this.ctx||!this.unlocked||!this.enabled||!state)return;
      const c=this.ctx,t=c.currentTime,pilots=Number(state.pilots||0),wave=Number(state.wave||1);
      const active=pilots>0;
      const engine=active?clamp(.034+pilots*.006,.035,.10):.008;
      const wind=active?clamp(.012+wave*.0012,.012,.032):.004;
      this.engineGain.gain.setTargetAtTime(engine,t,.28);this.windGain.gain.setTargetAtTime(wind,t,.35);
      const rpm=active?clamp(54+wave*1.6+pilots*1.2,54,82):48;
      this.engineA.frequency.setTargetAtTime(rpm,t,.3);this.engineB.frequency.setTargetAtTime(rpm*1.56,t,.3);
    }

    wrapApi(){
      if(this.apiWrapped||!window.skySurvivors)return;
      const api=window.skySurvivors;
      const wrap=(name,after)=>{const original=api[name];if(typeof original!=='function')return;api[name]=(...args)=>{const out=original(...args);after?.(...args);return out;};};
      wrap('join',()=>this.flyby(Math.random()));
      wrap('like',(_,count=1)=>{if(Number(count)>=10)this.repair();});
      wrap('follow',()=>this.chime('upgrade'));
      wrap('gift',()=>this.chime('gift'));
      wrap('nextWave',()=>this.flyby(Math.random()));
      this.apiWrapped=true;
    }

    startPolling(){
      this.pollTimer=window.setInterval(()=>{
        this.wrapApi();
        const api=window.skySurvivors;if(!api?.state)return;
        let s;try{s=api.state();}catch{return;}
        this.updateAmbience(s);
        const prev=this.lastState;
        if(prev){
          const dk=Math.max(0,Number(s.kills||0)-Number(prev.kills||0));
          if(dk>0){for(let i=0;i<Math.min(3,dk);i++)setTimeout(()=>this.explosion(rand(.18,.82),dk>1||s.style==='ACE'),i*85);}
          if(s.wave!==prev.wave){this.flyby(Math.random());if(s.style==='ACE')setTimeout(()=>this.ace(),120);}
          else if(s.style==='ACE'&&prev.style!=='ACE')this.ace();
          if(Number(s.pilots||0)>Number(prev.pilots||0))this.flyby(Math.random());
        }
        this.lastState={...s};

        const now=performance.now();
        if(this.unlocked&&this.enabled&&Number(s.pilots||0)>0&&now>=this.nextBurstAt){
          const intensity=clamp(.55+Number(s.pilots||0)*.08+Number(s.wave||1)*.025,.55,1.8);
          const rounds=Math.random()<.26?3:Math.random()<.58?2:1;
          for(let i=0;i<rounds;i++)setTimeout(()=>this.gun(rand(.08,.92),Math.random()<.15,s.style==='ACE'),i*rand(48,92));
          this.nextBurstAt=now+rand(260,720)/intensity;
        }
      },110);
    }
  }

  window.SKY_AUDIO = new SkyCombatAudio();
})();
