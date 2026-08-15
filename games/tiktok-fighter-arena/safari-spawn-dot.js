import './live-member-fastpath.js?v=1.0.0';

const ua=navigator.userAgent||'';
const vendor=navigator.vendor||'';
const ios=/iPhone|iPad|iPod/i.test(ua);
const appleWebKit=/AppleWebKit/i.test(ua);
const safariToken=/Safari/i.test(ua);
const alternateIOS=/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
const desktopChromium=/Chrome|Chromium|Edg\//i.test(ua);
const isSafari=appleWebKit&&safariToken&&!alternateIOS&&!desktopChromium&&(ios||/Apple/i.test(vendor));

if(isSafari){
  const style=document.createElement('style');
  style.textContent=`
    #safariSpawnDot{
      position:fixed;
      left:max(7px,env(safe-area-inset-left));
      top:30%;
      width:19px;
      height:19px;
      min-width:19px;
      min-height:19px;
      padding:0;
      margin:0;
      border:1px solid rgba(255,255,255,.42);
      border-radius:50%;
      background:rgba(255,213,107,.76);
      box-shadow:0 1px 6px rgba(0,0,0,.45);
      opacity:.72;
      z-index:70;
      -webkit-appearance:none;
      appearance:none;
      touch-action:manipulation;
    }
    #safariSpawnDot:active{transform:scale(.82);opacity:1}
    #safariSpawnDot[disabled]{opacity:.24}
    #safariSpawnDot.spawned{animation:safariSpawnPulse .28s ease-out}
    @keyframes safariSpawnPulse{50%{transform:scale(1.35);opacity:1}}
  `;
  document.head.append(style);

  const dot=document.createElement('button');
  dot.id='safariSpawnDot';
  dot.type='button';
  dot.setAttribute('aria-label','Spawn viewer');
  dot.title='';
  dot.disabled=true;
  document.body.append(dot);

  let serial=0;
  const bridgeReady=()=>!!window.FighterArenaBridge?.emit&&window.__fighterArenaReady!==false;
  const refresh=()=>{dot.disabled=!bridgeReady()};
  refresh();
  const readyTimer=setInterval(()=>{
    refresh();
    if(bridgeReady())clearInterval(readyTimer);
  },350);

  dot.addEventListener('click',()=>{
    const bridge=window.FighterArenaBridge;
    if(!bridge?.emit)return;
    serial++;
    const stamp=Date.now().toString(36);
    const name=`Player${String(serial).padStart(2,'0')}`;
    bridge.emit('join',{
      userId:`safari-manual:${stamp}:${serial}`,
      username:name,
      source:'safari-manual'
    });
    dot.classList.remove('spawned');
    void dot.offsetWidth;
    dot.classList.add('spawned');
    setTimeout(()=>dot.classList.remove('spawned'),320);
  });

  window.__fighterArenaSafariSpawnDot={enabled:true,get count(){return serial}};
}
