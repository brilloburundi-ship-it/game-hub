const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const CACHE='./data/remote.json';
const localOrigin='http://127.0.0.1:8765';
const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
let selectedStation=null,selectedObservation=null,currentStations=[],ws=null,demo=false,audioEnabled=false,audioCtx=null,gainNode=null,nextAudioTime=0,frames=0,userActivated=false;
const scope=$('#scope'),ctx=scope.getContext('2d');
const waterfall=$('#waterfall'),wctx=waterfall.getContext('2d');

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function log(msg){const n=$('#log');if(!n)return;n.textContent+=`[${new Date().toLocaleTimeString()}] ${msg}\n`;n.scrollTop=n.scrollHeight}
function setStatus(mode,text){const dot=$('#statusDot');dot.className='dot';if(mode)dot.classList.add(mode);$('#statusText').textContent=text;$('#modeMetric').textContent=text}
function switchView(view){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));if(view==='local')prepareLocalUI()}
function setupAutoUI(){
  $('#heroScan').textContent='AUTO RX · TROVA SEGNALE';
  $('#scanRemote').textContent='RISCANSIONA AUTO';
  $('#remoteBand').value='all';
  $('#remoteNotice').className='notice ok';
  $('#remoteNotice').innerHTML='<strong>AUTO RX attivo.</strong> L’app sceglie automaticamente la ground station migliore e la ricezione pubblica più utile disponibile. Non devi selezionare nulla.';
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));
$('#heroScan').addEventListener('click',async()=>{userActivated=true;switchView('remote');await scanRemote({manual:true});tryAutoplaySelected()});
$('#switchLocal').addEventListener('click',()=>switchView('local'));

function prepareLocalUI(){
  if(!isIOS)return;
  $('#localNotice').className='notice warn';
  $('#localNotice').innerHTML='<strong>Modalità PC.</strong> Su iPhone <code>127.0.0.1</code> indica il telefono, non il tuo computer. Per usare RTL‑SDR devi aprire questa modalità sul PC dove gira il bridge. Da iPhone usa <strong>AUTO RX remoto</strong>.';
  $('#connectBtn').disabled=true;
  $('#connectBtn').textContent='RTL‑SDR richiede PC';
  $('#disconnectBtn').disabled=true;
}

function antennas(st){return st?.antenna||st?.antennas||[]}
function bandMatch(st,band){if(band==='all')return true;const data=JSON.stringify(antennas(st)).toLowerCase();if(band==='weather')return data.includes('137')||data.includes('weather')||data.includes('qfh')||data.includes('quadrafilar')||data.includes('quadrifilar');if(band==='vhf')return data.includes('145')||data.includes('146')||data.includes('vhf');if(band==='uhf')return data.includes('435')||data.includes('436')||data.includes('437')||data.includes('438')||data.includes('uhf');return true}
function antennaLabel(st){const a=antennas(st);if(!a.length)return 'antenna non dichiarata';return a.map(x=>`${x.band||''} ${x.antenna_type_name||x.antenna_type||'antenna'}`.trim()).join(' · ')}
function stationScore(st,band='all'){let score=Number(st.score||0);if(Array.isArray(st.observations)&&st.observations.length)score+=35;if(Number(st.future_passes||0)>0)score+=Math.min(20,Number(st.future_passes));if(band!=='all'&&bandMatch(st,band))score+=25;return score}
function observationScore(o){let s=0;if(o.payload)s+=50;if(o.waterfall)s+=30;const mode=String(o.transmitter_mode||'').toLowerCase();if(/fm|apt|sstv/.test(mode))s+=15;const status=String(o.vetted_status||o.status||'').toLowerCase();if(/good|success|complete/.test(status))s+=15;const t=Date.parse(o.start||'');if(Number.isFinite(t)){const days=(Date.now()-t)/864e5;if(days<1)s+=30;else if(days<7)s+=20;else if(days<30)s+=10}return s}
function sortObservations(obs){return [...obs].sort((a,b)=>{const ds=observationScore(b)-observationScore(a);if(ds)return ds;return Date.parse(b.start||0)-Date.parse(a.start||0)})}
async function loadCache(){const r=await fetch(`${CACHE}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}

async function scanRemote({manual=false}={}){
  const box=$('#stations'),band=$('#remoteBand').value;
  if(manual)box.innerHTML='<div class="empty">AUTO RX sta cercando il segnale migliore…</div>';
  $('#scanRemote').disabled=true;
  setStatus('remote','AUTO RX · ricerca');
  try{
    const cache=await loadCache();
    let data=Array.isArray(cache.stations)?cache.stations:[];
    if(!data.length)throw new Error('nessuna ground station disponibile');
    data=data.filter(s=>bandMatch(s,band)).sort((a,b)=>stationScore(b,band)-stationScore(a,band)).slice(0,18);
    if(!data.length)throw new Error('nessuna stazione compatibile nella banda scelta');
    currentStations=data;
    renderStations(data,band);
    const best=data.find(s=>Array.isArray(s.observations)&&s.observations.length)||data[0];
    const node=$(`[data-station-id="${best.id}"]`);
    selectStation(best,node,{auto:true});
    const updated=cache.updated_at?new Date(cache.updated_at).toLocaleString():'n/d';
    $('#remoteNotice').className='notice ok';
    $('#remoteNotice').innerHTML=`<strong>AUTO RX operativo.</strong> Ho analizzato ${data.length} ground station e scelto automaticamente <strong>${escapeHtml(best.name||`Station ${best.id}`)}</strong>. Cache: ${escapeHtml(updated)}.`;
    setStatus('remote','AUTO RX · segnale scelto');
    return best;
  }catch(err){
    box.innerHTML=`<div class="empty">AUTO RX non ha trovato dati utilizzabili: ${escapeHtml(err.message)}.<br><br><a href="https://network.satnogs.org/stations/" target="_blank" rel="noreferrer">Apri SatNOGS Network</a></div>`;
    $('#remoteNotice').className='notice warn';
    $('#remoteNotice').innerHTML='<strong>AUTO RX in attesa.</strong> Riproverò automaticamente senza che tu debba fare nulla.';
    setStatus('','AUTO RX · attesa');
    return null;
  }finally{$('#scanRemote').disabled=false}
}

function renderStations(data,band){
  const box=$('#stations');box.innerHTML='';
  data.forEach((s,i)=>{
    const el=document.createElement('button');
    el.className='station';
    el.dataset.stationId=String(s.id);
    const obsCount=Array.isArray(s.observations)?s.observations.length:0;
    el.innerHTML=`<div class="station-top"><div><b>${i===0?'⭐ ':''}${escapeHtml(s.name||`Station ${s.id}`)}</b><small>#${s.id} · ${escapeHtml(antennaLabel(s))}<br>${Number(s.total_observations||0).toLocaleString()} osservazioni · ${Number(s.future_passes||0)} passaggi futuri · ${obsCount} recenti in cache</small></div><span class="score">${stationScore(s,band)}</span></div>`;
    el.addEventListener('click',()=>{userActivated=true;selectStation(s,el,{auto:false});tryAutoplaySelected()});
    box.appendChild(el);
  });
}

function selectStation(st,node,{auto=false}={}){
  selectedStation=st;selectedObservation=null;
  $$('.station').forEach(n=>{n.classList.remove('selected');const badge=n.querySelector('.selected-badge');if(badge)badge.remove()});
  if(node){node.classList.add('selected');const badge=document.createElement('div');badge.className='selected-badge';badge.style.cssText='margin-top:10px;font-size:12px;font-weight:800;color:#7ee8ff';badge.textContent=auto?'AUTO RX · SCELTA':'SELEZIONATA';node.appendChild(badge)}
  $('#stationName').textContent=st.name||`Station ${st.id}`;
  const obs=sortObservations(Array.isArray(st.observations)?st.observations:[]);
  const box=$('#observations');box.innerHTML='';
  if(obs.length){
    selectedObservation=obs[0];
    $('#remoteInfo').className='notice ok';
    $('#remoteInfo').innerHTML=`<strong>AUTO RX ha scelto questa stazione.</strong><br>${escapeHtml(antennaLabel(st))}<br>${Number(st.total_observations||0).toLocaleString()} osservazioni archiviate · ${Number(st.future_passes||0)} passaggi futuri.<br><br><strong>Ricezione automatica:</strong> ${escapeHtml(observationTitle(selectedObservation))}`;
    obs.slice(0,8).forEach((o,i)=>box.appendChild(renderObs(o,i===0)));
  }else{
    $('#remoteInfo').className='notice ok';
    $('#remoteInfo').innerHTML=`<strong>AUTO RX ha scelto questa antenna.</strong><br>${escapeHtml(antennaLabel(st))}<br>${Number(st.total_observations||0).toLocaleString()} osservazioni archiviate · ${Number(st.future_passes||0)} passaggi futuri.`;
    box.innerHTML=`<div class="obs"><div class="obs-top"><div><b>Ricezioni della ground station</b><div class="muted">Il prossimo sync aggiungerà automaticamente le osservazioni recenti dentro l’app.</div></div><span class="tag">AUTO</span></div><div class="obs-actions"><a href="${escapeHtml(st.observations_url||`https://network.satnogs.org/observations/?station=${st.id}`)}" target="_blank" rel="noreferrer">📡 Apri osservazioni</a><a href="${escapeHtml(st.station_url||`https://network.satnogs.org/stations/${st.id}/`)}" target="_blank" rel="noreferrer">🛰️ Ground station</a></div></div>`;
  }
  if(!auto&&window.innerWidth<980){const panel=$('#stationName')?.closest('.panel');if(panel)setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),80)}
}

function observationTitle(o){
  const sat=o.satellite||o.satellite_name||(o.norad_cat_id?`NORAD ${o.norad_cat_id}`:'Satellite');
  const f=o.frequency_text||formatFrequency(o.observation_frequency||o.transmitter_downlink_low||o.transmitter_downlink_high);
  return `${sat}${f?' · '+f:''}${o.transmitter_mode?' · '+o.transmitter_mode:''}`;
}
function formatFrequency(v){const n=Number(v);return Number.isFinite(n)&&n>0?`${(n/1e6).toFixed(4)} MHz`:''}
function renderObs(o,isAuto=false){
  const el=document.createElement('article');el.className='obs';
  if(isAuto)el.style.borderColor='#5fd9ff';
  const when=o.start?new Date(o.start).toLocaleString():(o.timeframe_text||'data n/d');
  const status=o.status||o.vetted_status||'public';
  el.innerHTML=`<div class="obs-top"><div><b>${isAuto?'⚡ AUTO · ':''}${escapeHtml(observationTitle(o))}</b><div class="muted">${escapeHtml(when)}</div></div><span class="tag">${escapeHtml(String(status).toUpperCase())}</span></div><div class="obs-actions"></div>`;
  const a=el.querySelector('.obs-actions');
  if(o.payload){const b=document.createElement('button');b.textContent=isAuto?'▶ ASCOLTA AUTO':'▶ Ascolta';b.addEventListener('click',()=>{userActivated=true;selectedObservation=o;playRemote(o.payload)});a.appendChild(b)}
  if(o.waterfall){const w=document.createElement('a');w.href=o.waterfall;w.target='_blank';w.rel='noreferrer';w.textContent='▥ Waterfall';a.appendChild(w)}
  const d=document.createElement('a');d.href=o.observation_url||`https://network.satnogs.org/observations/${o.id}/`;d.target='_blank';d.rel='noreferrer';d.textContent=isAuto?'Apri ricezione AUTO ↗':'Dettagli ↗';a.appendChild(d);
  return el;
}
function tryAutoplaySelected(){if(userActivated&&selectedObservation?.payload)playRemote(selectedObservation.payload)}
function playRemote(url){const a=$('#remoteAudio');a.src=url;a.style.display='block';a.play().catch(()=>{});a.scrollIntoView({behavior:'smooth',block:'center'})}

async function api(path,body){const r=await fetch(localOrigin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'bridge error');return data}
function drawSpectrum(bins){const W=scope.width,H=scope.height;ctx.fillStyle='#040a10';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#102533';ctx.lineWidth=1;for(let i=1;i<8;i++){const y=i*H/8;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.strokeStyle='#5fd9ff';ctx.lineWidth=2;ctx.beginPath();bins.forEach((v,i)=>{const x=i/(bins.length-1)*W,y=H-Math.max(0,Math.min(1,(v+110)/70))*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();const img=wctx.getImageData(0,0,waterfall.width,waterfall.height-2);wctx.putImageData(img,0,2);const grad=wctx.createLinearGradient(0,0,waterfall.width,0);bins.forEach((v,i)=>{const p=i/(bins.length-1),t=Math.max(0,Math.min(1,(v+100)/55)),h=220-t*180;grad.addColorStop(p,`hsl(${h} 95% ${14+t*48}%)`)});wctx.fillStyle=grad;wctx.fillRect(0,0,waterfall.width,2);frames++}
function updateMetrics(m){$('#peak').textContent=`${m.power_db.toFixed(1)} dB`;$('#noise').textContent=`${m.noise_db.toFixed(1)} dB`;$('#snr').textContent=`${(m.power_db-m.noise_db).toFixed(1)} dB`;$('#freqDisplay').textContent=(m.frequency/1e6).toFixed(3);$('#freqCaption').textContent=`${(m.frequency/1e6).toFixed(3)} MHz`}
function initAudio(){if(audioCtx)return;audioCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:48000});gainNode=audioCtx.createGain();gainNode.gain.value=+$('#volume').value;gainNode.connect(audioCtx.destination);nextAudioTime=audioCtx.currentTime}
function playPCM(buf){if(!audioEnabled)return;const u8=new Uint8Array(buf);if(u8[0]!==65)return;initAudio();const dv=new DataView(buf,1),n=Math.floor((buf.byteLength-1)/2),ab=audioCtx.createBuffer(1,n,48000),ch=ab.getChannelData(0);for(let i=0;i<n;i++)ch[i]=dv.getInt16(i*2,true)/32768;const src=audioCtx.createBufferSource();src.buffer=ab;src.connect(gainNode);const when=Math.max(audioCtx.currentTime+0.02,nextAudioTime);src.start(when);nextAudioTime=when+ab.duration}
function openWS(){if(ws)ws.close();ws=new WebSocket('ws://127.0.0.1:8765/ws');ws.binaryType='arraybuffer';ws.onopen=()=>log('Stream locale aperto');ws.onerror=()=>log('Errore WebSocket locale');ws.onclose=()=>{if(!demo)setStatus('','Bridge locale offline')};ws.onmessage=ev=>{if(typeof ev.data==='string'){const m=JSON.parse(ev.data);if(m.type==='spectrum'){drawSpectrum(m.bins);updateMetrics(m)}}else playPCM(ev.data)}}
async function connectLocal(){demo=false;if(isIOS){prepareLocalUI();return}try{await api('/api/connect');setStatus('local','RTL‑SDR connesso');$('#localNotice').className='notice ok';$('#localNotice').innerHTML='<strong>Ricevitore locale attivo.</strong> Lo spettro e l’audio arrivano dal dongle RTL‑SDR collegato al PC.';openWS();log('RTL‑SDR connected')}catch(err){setStatus('','Errore RTL‑SDR');$('#localNotice').className='notice warn';$('#localNotice').innerHTML=`<strong>Connessione fallita.</strong> ${escapeHtml(err.message)}`;log('Connect error: '+err.message)}}
async function disconnectLocal(){try{await api('/api/disconnect')}catch{}if(ws)ws.close();setStatus('','Bridge locale disconnesso');log('Receiver disconnected')}
async function tune(freq){if(isIOS){prepareLocalUI();return}try{await api('/api/tune',{frequency:Math.round(freq*1e6)});$('#freqDisplay').textContent=freq.toFixed(3);$('#freqCaption').textContent=`${freq.toFixed(3)} MHz`;$('#freqInput').value=freq.toFixed(3);log('Sintonizzato su '+freq.toFixed(3)+' MHz')}catch(err){log('Tune rejected: '+err.message)}}
function startDemo(){demo=true;if(ws)ws.close();setStatus('demo','Demo locale');$('#localNotice').className='notice';$('#localNotice').innerHTML='<strong>Modalità demo.</strong> Lo spettro è sintetico. Per segnali veri usa AUTO RX remoto oppure il bridge locale con RTL‑SDR.';function tick(){if(!demo)return;const bins=[],t=performance.now()/1000,n=512;for(let i=0;i<n;i++){let v=-94+Math.random()*5;v+=30*Math.exp(-Math.pow((i-256-28*Math.sin(t*.45))/10,2));v+=18*Math.exp(-Math.pow((i-350)/6,2));bins.push(v)}drawSpectrum(bins);updateMetrics({power_db:Math.max(...bins),noise_db:-93,frequency:+$('#freqInput').value*1e6});requestAnimationFrame(tick)}tick();log('Demo started')}

$('#scanRemote').addEventListener('click',async()=>{userActivated=true;await scanRemote({manual:true});tryAutoplaySelected()});
$('#remoteBand').addEventListener('change',()=>scanRemote({manual:true}));
$('#connectBtn').addEventListener('click',connectLocal);$('#disconnectBtn').addEventListener('click',disconnectLocal);$('#tuneBtn').addEventListener('click',()=>tune(+$('#freqInput').value));$('#demoBtn').addEventListener('click',startDemo);$('#localBtn').addEventListener('click',()=>{if(isIOS){prepareLocalUI();return}window.open(localOrigin,'_blank')});$$('.preset').forEach(b=>b.addEventListener('click',()=>tune(+b.dataset.f)));
$('#audioBtn').addEventListener('click',async()=>{audioEnabled=!audioEnabled;if(audioEnabled){initAudio();await audioCtx.resume();$('#audioBtn').textContent='Disattiva audio';$('#audioState').textContent='Audio acceso'}else{$('#audioBtn').textContent='Attiva audio';$('#audioState').textContent='Audio spento'}});$('#volume').addEventListener('input',e=>{if(gainNode)gainNode.gain.value=+e.target.value});setInterval(()=>{$('#fps').textContent=`${frames} fps`;frames=0},1000);

setupAutoUI();switchView('remote');setStatus('remote','AUTO RX · avvio');log('AUTO RX UI pronta');scanRemote({manual:false});setInterval(()=>scanRemote({manual:false}),180000);
