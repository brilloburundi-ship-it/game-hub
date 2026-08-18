const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const CACHE='./data/remote.json';
const localOrigin='http://127.0.0.1:8765';
const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
let selectedStation=null,currentStations=[],ws=null,demo=false,audioEnabled=false,audioCtx=null,gainNode=null,nextAudioTime=0,frames=0;
const scope=$('#scope'),ctx=scope.getContext('2d');
const waterfall=$('#waterfall'),wctx=waterfall.getContext('2d');

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function log(msg){const n=$('#log');if(!n)return;n.textContent+=`[${new Date().toLocaleTimeString()}] ${msg}\n`;n.scrollTop=n.scrollHeight}
function setStatus(mode,text){const dot=$('#statusDot');dot.className='dot';if(mode)dot.classList.add(mode);$('#statusText').textContent=text;$('#modeMetric').textContent=text}
function switchView(view){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));if(view==='local')prepareLocalUI()}
$$('.tab').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));
$('#heroScan').addEventListener('click',()=>{switchView('remote');scanRemote()});
$('#switchLocal').addEventListener('click',()=>switchView('local'));

function prepareLocalUI(){
  if(!isIOS)return;
  $('#localNotice').className='notice warn';
  $('#localNotice').innerHTML='<strong>Modalità PC.</strong> Su iPhone <code>127.0.0.1</code> indica il telefono, non il tuo computer. Per usare RTL‑SDR devi aprire questa modalità sul PC dove gira il bridge. Da iPhone usa <strong>Remote antennas</strong>.';
  $('#connectBtn').disabled=true;
  $('#connectBtn').textContent='RTL‑SDR richiede PC';
  $('#disconnectBtn').disabled=true;
}

function antennas(st){return st?.antenna||st?.antennas||[]}
function bandMatch(st,band){
  if(band==='all')return true;
  const data=JSON.stringify(antennas(st)).toLowerCase();
  if(band==='weather')return data.includes('137')||data.includes('weather')||data.includes('qfh')||data.includes('quadrafilar')||data.includes('quadrifilar');
  if(band==='vhf')return data.includes('145')||data.includes('146')||data.includes('vhf');
  if(band==='uhf')return data.includes('435')||data.includes('436')||data.includes('437')||data.includes('438')||data.includes('uhf');
  return true;
}
function antennaLabel(st){const a=antennas(st);if(!a.length)return 'antenna non dichiarata';return a.map(x=>`${x.band||''} ${x.antenna_type_name||x.antenna_type||'antenna'}`.trim()).join(' · ')}
function stationScore(st,band){let score=Number(st.score||0);if(band!=='all'&&bandMatch(st,band))score+=25;return score}
async function loadCache(){const r=await fetch(CACHE+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}

async function scanRemote(){
  const box=$('#stations'),band=$('#remoteBand').value;
  box.innerHTML='<div class="empty">Carico le ground station reali…</div>';
  $('#scanRemote').disabled=true;
  setStatus('remote','Caricamento remoto');
  try{
    const cache=await loadCache();
    let data=Array.isArray(cache.stations)?cache.stations:[];
    if(!data.length)throw new Error('Nessuna stazione nella cache remota');
    data=data.filter(s=>bandMatch(s,band)).sort((a,b)=>stationScore(b,band)-stationScore(a,band)).slice(0,20);
    if(!data.length)throw new Error('Nessuna stazione compatibile trovata nella banda scelta');
    currentStations=data;
    selectedStation=null;
    box.innerHTML='';
    data.forEach((s,i)=>{
      const el=document.createElement('button');
      el.type='button';
      el.className='station';
      el.dataset.index=String(i);
      el.style.touchAction='manipulation';
      el.style.webkitTapHighlightColor='transparent';
      const activity=[];
      if(s.total_observations)activity.push(`${Number(s.total_observations).toLocaleString('it-IT')} osservazioni`);
      if(s.future_passes)activity.push(`${s.future_passes} passaggi futuri`);
      if(s.location)activity.push(s.location);
      el.innerHTML=`<div class="station-top"><div><b>${escapeHtml(s.name||`Station ${s.id}`)}</b><small>#${escapeHtml(s.id)} · ${escapeHtml(antennaLabel(s))}${activity.length?'<br>'+escapeHtml(activity.join(' · ')):''}</small></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px"><span class="score">${stationScore(s,band)}</span><span class="tag">SELEZIONA</span></div></div>`;
      box.appendChild(el);
    });
    box.onclick=e=>{
      const card=e.target.closest('.station[data-index]');
      if(!card)return;
      const st=currentStations[Number(card.dataset.index)];
      if(st)selectStation(st,card,true);
    };
    const updated=cache.updated_at?new Date(cache.updated_at).toLocaleString('it-IT'):'aggiornamento disponibile';
    $('#remoteNotice').className='notice ok';
    $('#remoteNotice').innerHTML=`<strong>${data.length} ground station pronte.</strong> Tocca una card per selezionarla. Ultimo aggiornamento: ${escapeHtml(updated)}.`;
    $('#stationName').textContent='Seleziona una stazione';
    $('#remoteInfo').className='notice';
    $('#remoteInfo').innerHTML='<strong>Scegli una ground station.</strong> Su iPhone, dopo il tap ti porto automaticamente alla scheda della stazione.';
    $('#observations').innerHTML='<div class="empty">Tocca una delle stazioni trovate.</div>';
    setStatus('remote','Stazioni remote disponibili');
  }catch(err){
    box.innerHTML=`<div class="empty">${escapeHtml(err.message)}.<br><br><a href="https://network.satnogs.org/stations/" target="_blank" rel="noreferrer">Apri SatNOGS Network</a></div>`;
    $('#remoteNotice').className='notice warn';
    $('#remoteNotice').innerHTML='<strong>Dati remoti non disponibili.</strong> Riprova tra poco oppure apri la directory SatNOGS.';
    setStatus('','Errore dati remoti');
  }finally{$('#scanRemote').disabled=false}
}

function selectStation(st,node,scrollToDetails=false){
  selectedStation=st;
  $$('.station').forEach(n=>n.classList.remove('selected'));
  if(node){node.classList.add('selected');const badge=node.querySelector('.tag');if(badge)badge.textContent='SELEZIONATA'}
  $('#stationName').textContent=st.name||`Station ${st.id}`;
  const details=[];
  if(st.location)details.push(`Località ${st.location}`);
  if(st.total_observations)details.push(`${Number(st.total_observations).toLocaleString('it-IT')} osservazioni`);
  if(st.future_passes)details.push(`${st.future_passes} passaggi futuri`);
  $('#remoteInfo').className='notice ok';
  $('#remoteInfo').innerHTML=`<strong>Stazione selezionata.</strong> ${escapeHtml(antennaLabel(st))}${details.length?'<br>'+escapeHtml(details.join(' · ')):''}`;
  const box=$('#observations');
  box.innerHTML='';

  const summary=document.createElement('article');
  summary.className='obs';
  const stationUrl=st.station_url||`https://network.satnogs.org/stations/${encodeURIComponent(st.id)}/`;
  const observationsUrl=st.observations_url||`https://network.satnogs.org/observations/?station=${encodeURIComponent(st.id)}`;
  summary.innerHTML=`<div class="obs-top"><div><b>${escapeHtml(st.name||`Station ${st.id}`)}</b><div class="muted">${escapeHtml(antennaLabel(st))}</div></div><span class="tag">GROUND STATION</span></div><div class="tags" style="margin-top:10px">${st.location?`<span class="tag">${escapeHtml(st.location)}</span>`:''}${st.total_observations?`<span class="tag">${Number(st.total_observations).toLocaleString('it-IT')} RX</span>`:''}${st.future_passes?`<span class="tag">${st.future_passes} PASSAGGI</span>`:''}</div><div class="obs-actions"><a href="${escapeHtml(observationsUrl)}" target="_blank" rel="noreferrer">📡 Apri osservazioni</a><a href="${escapeHtml(stationUrl)}" target="_blank" rel="noreferrer">🛰️ Apri stazione</a></div>`;
  box.appendChild(summary);

  const obs=Array.isArray(st.observations)?st.observations.filter(o=>o.payload||o.waterfall||(o.demoddata&&o.demoddata.length)).slice(0,12):[];
  if(obs.length){
    obs.forEach(o=>box.appendChild(renderObs(o)));
    $('#remoteInfo').innerHTML+=`<br><strong>${obs.length} registrazioni incorporate disponibili.</strong>`;
  }else{
    const empty=document.createElement('div');
    empty.className='empty';
    empty.innerHTML='La cache rapida non contiene ancora audio/waterfall incorporati per questa stazione. Usa <strong>Apri osservazioni</strong> per vedere subito le ricezioni pubbliche SatNOGS della stazione.';
    box.appendChild(empty);
  }
  setStatus('remote','Stazione selezionata');
  if(scrollToDetails&&window.matchMedia('(max-width:980px)').matches){
    setTimeout(()=>$('#stationName').closest('.panel').scrollIntoView({behavior:'smooth',block:'start'}),80);
  }
}

function renderObs(o){
  const el=document.createElement('article');el.className='obs';
  const freq=o.transmitter_downlink_low||o.transmitter_downlink_high||o.observation_frequency;
  const mhz=freq?(Number(freq)/1e6).toFixed(3)+' MHz':'frequenza n/d';
  const when=o.start?new Date(o.start).toLocaleString('it-IT'):'data n/d';
  const status=o.status||o.vetted_status||'unknown';
  el.innerHTML=`<div class="obs-top"><div><b>NORAD ${escapeHtml(o.norad_cat_id||'—')}</b><div class="muted">${escapeHtml(o.transmitter_description||o.transmitter_mode||'Satellite downlink')}</div></div><span class="tag">${escapeHtml(String(status).toUpperCase())}</span></div><div class="tags" style="margin-top:10px"><span class="tag">${escapeHtml(mhz)}</span><span class="tag">${escapeHtml(o.transmitter_mode||'mode n/d')}</span><span class="tag">MAX EL ${Math.round(o.max_altitude||0)}°</span></div><div class="muted" style="margin-top:10px">${escapeHtml(when)}</div><div class="obs-actions"></div>`;
  const a=el.querySelector('.obs-actions');
  if(o.payload){const b=document.createElement('button');b.textContent='▶ Ascolta audio';b.addEventListener('click',()=>playRemote(o.payload));a.appendChild(b)}
  if(o.waterfall){const w=document.createElement('a');w.href=o.waterfall;w.target='_blank';w.rel='noreferrer';w.textContent='▥ Waterfall';a.appendChild(w)}
  const d=document.createElement('a');d.href=`https://network.satnogs.org/observations/${o.id}/`;d.target='_blank';d.rel='noreferrer';d.textContent='Dettagli ↗';a.appendChild(d);
  return el;
}
function playRemote(url){const a=$('#remoteAudio');a.src=url;a.style.display='block';a.play().catch(()=>{});a.scrollIntoView({behavior:'smooth',block:'center'})}

async function api(path,body){const r=await fetch(localOrigin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'bridge error');return data}
function drawSpectrum(bins){const W=scope.width,H=scope.height;ctx.fillStyle='#040a10';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#102533';ctx.lineWidth=1;for(let i=1;i<8;i++){const y=i*H/8;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.strokeStyle='#5fd9ff';ctx.lineWidth=2;ctx.beginPath();bins.forEach((v,i)=>{const x=i/(bins.length-1)*W,y=H-Math.max(0,Math.min(1,(v+110)/70))*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();const img=wctx.getImageData(0,0,waterfall.width,waterfall.height-2);wctx.putImageData(img,0,2);const grad=wctx.createLinearGradient(0,0,waterfall.width,0);bins.forEach((v,i)=>{const p=i/(bins.length-1),t=Math.max(0,Math.min(1,(v+100)/55)),h=220-t*180;grad.addColorStop(p,`hsl(${h} 95% ${14+t*48}%)`)});wctx.fillStyle=grad;wctx.fillRect(0,0,waterfall.width,2);frames++}
function updateMetrics(m){$('#peak').textContent=`${m.power_db.toFixed(1)} dB`;$('#noise').textContent=`${m.noise_db.toFixed(1)} dB`;$('#snr').textContent=`${(m.power_db-m.noise_db).toFixed(1)} dB`;$('#freqDisplay').textContent=(m.frequency/1e6).toFixed(3);$('#freqCaption').textContent=`${(m.frequency/1e6).toFixed(3)} MHz`}
function initAudio(){if(audioCtx)return;audioCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:48000});gainNode=audioCtx.createGain();gainNode.gain.value=+$('#volume').value;gainNode.connect(audioCtx.destination);nextAudioTime=audioCtx.currentTime}
function playPCM(buf){if(!audioEnabled)return;const u8=new Uint8Array(buf);if(u8[0]!==65)return;initAudio();const dv=new DataView(buf,1),n=Math.floor((buf.byteLength-1)/2),ab=audioCtx.createBuffer(1,n,48000),ch=ab.getChannelData(0);for(let i=0;i<n;i++)ch[i]=dv.getInt16(i*2,true)/32768;const src=audioCtx.createBufferSource();src.buffer=ab;src.connect(gainNode);const when=Math.max(audioCtx.currentTime+0.02,nextAudioTime);src.start(when);nextAudioTime=when+ab.duration}
function openWS(){if(ws)ws.close();ws=new WebSocket('ws://127.0.0.1:8765/ws');ws.binaryType='arraybuffer';ws.onopen=()=>log('Stream locale aperto');ws.onerror=()=>log('Errore WebSocket locale');ws.onclose=()=>{if(!demo)setStatus('','Bridge locale offline')};ws.onmessage=ev=>{if(typeof ev.data==='string'){const m=JSON.parse(ev.data);if(m.type==='spectrum'){drawSpectrum(m.bins);updateMetrics(m)}}else playPCM(ev.data)}}

async function connectLocal(){
  if(isIOS){prepareLocalUI();setStatus('','RTL‑SDR disponibile su PC');return}
  demo=false;
  try{await api('/api/connect');setStatus('local','RTL‑SDR connesso');$('#localNotice').className='notice ok';$('#localNotice').innerHTML='<strong>Ricevitore locale attivo.</strong> Lo spettro e l’audio arrivano dal dongle RTL‑SDR collegato al PC.';openWS();log('RTL‑SDR connected')}catch(err){setStatus('','Errore RTL‑SDR');$('#localNotice').className='notice warn';$('#localNotice').innerHTML=`<strong>Connessione fallita.</strong> ${escapeHtml(err.message)}`;log('Connect error: '+err.message)}
}
async function disconnectLocal(){if(isIOS){prepareLocalUI();return}try{await api('/api/disconnect')}catch{}if(ws)ws.close();setStatus('','Bridge locale disconnesso');log('Receiver disconnected')}
async function tune(freq){if(isIOS){prepareLocalUI();return}try{await api('/api/tune',{frequency:Math.round(freq*1e6)});$('#freqDisplay').textContent=freq.toFixed(3);$('#freqCaption').textContent=`${freq.toFixed(3)} MHz`;$('#freqInput').value=freq.toFixed(3);log('Sintonizzato su '+freq.toFixed(3)+' MHz')}catch(err){log('Tune rejected: '+err.message)}}
function startDemo(){demo=true;if(ws)ws.close();setStatus('demo','Demo locale');$('#localNotice').className='notice';$('#localNotice').innerHTML='<strong>Modalità demo.</strong> Lo spettro è sintetico. Per segnali veri usa il bridge locale con RTL‑SDR sul PC.';function tick(){if(!demo)return;const bins=[],t=performance.now()/1000,n=512;for(let i=0;i<n;i++){let v=-94+Math.random()*5;v+=30*Math.exp(-Math.pow((i-256-28*Math.sin(t*.45))/10,2));v+=18*Math.exp(-Math.pow((i-350)/6,2));bins.push(v)}drawSpectrum(bins);updateMetrics({power_db:Math.max(...bins),noise_db:-93,frequency:+$('#freqInput').value*1e6});requestAnimationFrame(tick)}tick();log('Demo started')}

$('#scanRemote').addEventListener('click',scanRemote);
$('#remoteBand').addEventListener('change',scanRemote);
$('#connectBtn').addEventListener('click',connectLocal);
$('#disconnectBtn').addEventListener('click',disconnectLocal);
$('#tuneBtn').addEventListener('click',()=>tune(+$('#freqInput').value));
$('#demoBtn').addEventListener('click',startDemo);
$('#localBtn').addEventListener('click',()=>{if(isIOS){prepareLocalUI();return}window.open(localOrigin,'_blank')});
$$('.preset').forEach(b=>b.addEventListener('click',()=>tune(+b.dataset.f)));
$('#audioBtn').addEventListener('click',async()=>{audioEnabled=!audioEnabled;if(audioEnabled){initAudio();await audioCtx.resume();$('#audioBtn').textContent='Disattiva audio';$('#audioState').textContent='Audio acceso'}else{$('#audioBtn').textContent='Attiva audio';$('#audioState').textContent='Audio spento'}});
$('#volume').addEventListener('input',e=>{if(gainNode)gainNode.gain.value=+e.target.value});
setInterval(()=>{$('#fps').textContent=`${frames} fps`;frames=0},1000);
log('UI pronta');
switchView('remote');
setStatus('remote','Remote ready');
scanRemote();
