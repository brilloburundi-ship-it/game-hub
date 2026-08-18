const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const CACHE='./data/remote.json';
const localOrigin='http://127.0.0.1:8765';
const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
let selectedStation=null, selectedObservation=null, currentStations=[];
let ws=null, demo=false, audioEnabled=false, audioCtx=null, gainNode=null, nextAudioTime=0, frames=0, userActivated=false;
const scope=$('#scope'), ctx=scope.getContext('2d');
const waterfall=$('#waterfall'), wctx=waterfall.getContext('2d');

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function log(msg){const n=$('#log');if(!n)return;n.textContent+=`[${new Date().toLocaleTimeString()}] ${msg}\n`;n.scrollTop=n.scrollHeight}
function setStatus(mode,text){const dot=$('#statusDot');dot.className='dot';if(mode)dot.classList.add(mode);$('#statusText').textContent=text;const mm=$('#modeMetric');if(mm)mm.textContent=text}
function switchView(view){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));if(view==='local')prepareLocalUI()}
function setupAutoUI(){
  $('#heroScan').textContent='AUTO RX · TROVA RICEZIONE PRONTA';
  $('#scanRemote').textContent='RISCANSIONA AUTO';
  $('#remoteBand').value='all';
  $('#remoteNotice').className='notice ok';
  $('#remoteNotice').innerHTML='<strong>AUTO RX attivo.</strong> Scelgo solo passaggi già conclusi con audio, waterfall o dati realmente disponibili. Nessun passaggio futuro e nessuna pagina “Waiting”.';
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));
$('#heroScan').addEventListener('click',async()=>{userActivated=true;switchView('remote');await scanRemote({manual:true});tryPlaySelected()});
$('#switchLocal').addEventListener('click',()=>switchView('local'));

function prepareLocalUI(){
  if(!isIOS)return;
  $('#localNotice').className='notice warn';
  $('#localNotice').innerHTML='<strong>Modalità PC.</strong> Su iPhone il bridge RTL‑SDR locale non è raggiungibile tramite <code>127.0.0.1</code>. Usa AUTO RX remoto; RTL‑SDR resta disponibile dal PC.';
  $('#connectBtn').disabled=true;$('#connectBtn').textContent='RTL‑SDR richiede PC';$('#disconnectBtn').disabled=true;
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
function observationTimes(o){
  const raw=String(o.timeframe_text||'');
  const matches=raw.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g)||[];
  const start=Date.parse(o.start||'')||(matches[0]?Date.parse(matches[0].replace(' ','T')+'Z'):NaN);
  const end=Date.parse(o.end||'')||(matches[1]?Date.parse(matches[1].replace(' ','T')+'Z'):NaN);
  return {start,end};
}
function hasArtifact(o){return Boolean(o?.payload||o?.waterfall||(Array.isArray(o?.demoddata)&&o.demoddata.length))}
function isPastObservation(o){
  const {start,end}=observationTimes(o);
  const now=Date.now();
  if(Number.isFinite(end))return end<=now+120000;
  if(Number.isFinite(start))return start<=now-120000;
  return hasArtifact(o);
}
function isUsableObservation(o){return hasArtifact(o)&&isPastObservation(o)}
function observationScore(o){
  if(!isUsableObservation(o))return -10000;
  let s=100;
  if(o.payload)s+=55;
  if(o.waterfall)s+=35;
  if(Array.isArray(o.demoddata)&&o.demoddata.length)s+=25;
  const mode=String(o.transmitter_mode||'').toLowerCase();
  if(/fm|apt|sstv/.test(mode))s+=20;
  const status=String(o.vetted_status||o.status||'').toLowerCase();
  if(/good|success|complete/.test(status))s+=20;
  if(/bad|failed/.test(status))s-=30;
  const {start}=observationTimes(o);
  if(Number.isFinite(start)){
    const hours=(Date.now()-start)/36e5;
    if(hours<2)s+=35;else if(hours<24)s+=25;else if(hours<168)s+=15;else if(hours<720)s+=5;
  }
  return s;
}
function usableObservations(st){return (Array.isArray(st?.observations)?st.observations:[]).filter(isUsableObservation).sort((a,b)=>observationScore(b)-observationScore(a)||(observationTimes(b).start||0)-(observationTimes(a).start||0))}
function stationScore(st,band='all'){
  let score=Number(st.score||0);
  const ready=usableObservations(st);
  if(ready.length)score+=80+Math.min(40,observationScore(ready[0])/5);
  if(band!=='all'&&bandMatch(st,band))score+=25;
  return score;
}
async function loadCache(){const r=await fetch(`${CACHE}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}

async function scanRemote({manual=false}={}){
  const box=$('#stations'),band=$('#remoteBand').value;
  if(manual)box.innerHTML='<div class="empty">AUTO RX cerca una ricezione già pronta…</div>';
  $('#scanRemote').disabled=true;setStatus('remote','AUTO RX · ricerca');
  try{
    const cache=await loadCache();
    const all=(Array.isArray(cache.stations)?cache.stations:[]).filter(s=>bandMatch(s,band));
    if(!all.length)throw new Error('nessuna ground station disponibile');
    const ready=all.filter(s=>usableObservations(s).length).sort((a,b)=>stationScore(b,band)-stationScore(a,band));
    if(!ready.length)throw new Error('nessuna ricezione conclusa con audio/waterfall disponibile');
    const display=ready.slice(0,14);
    currentStations=display;renderStations(display,band);
    const best=display[0];
    selectStation(best,$(`[data-station-id="${best.id}"]`),{auto:true});
    const updated=cache.updated_at?new Date(cache.updated_at).toLocaleString():'n/d';
    $('#remoteNotice').className='notice ok';
    $('#remoteNotice').innerHTML=`<strong>AUTO RX operativo.</strong> Trovate ${ready.length} ground station con ricezioni già pronte. Scelta: <strong>${escapeHtml(best.name||`Station ${best.id}`)}</strong>. Ultimo sync: ${escapeHtml(updated)}.`;
    setStatus('remote','AUTO RX · ricezione pronta');
    return best;
  }catch(err){
    box.innerHTML=`<div class="empty">${escapeHtml(err.message)}. AUTO RX riproverà da solo.</div>`;
    $('#remoteNotice').className='notice warn';$('#remoteNotice').innerHTML='<strong>AUTO RX in attesa.</strong> Non apro passaggi futuri o senza artefatti.';setStatus('','AUTO RX · attesa');return null;
  }finally{$('#scanRemote').disabled=false}
}

function renderStations(data,band){
  const box=$('#stations');box.innerHTML='';
  data.forEach((s,i)=>{
    const ready=usableObservations(s);
    const el=document.createElement('button');el.className='station';el.dataset.stationId=String(s.id);
    el.innerHTML=`<div class="station-top"><div><b>${i===0?'⚡ ':''}${escapeHtml(s.name||`Station ${s.id}`)}</b><small>#${s.id} · ${escapeHtml(antennaLabel(s))}<br>${ready.length} ricezioni pronte · ${Number(s.total_observations||0).toLocaleString()} archiviate</small></div><span class="score">${Math.round(stationScore(s,band))}</span></div>`;
    el.addEventListener('click',()=>{userActivated=true;selectStation(s,el,{auto:false});tryPlaySelected()});box.appendChild(el);
  });
}

function selectStation(st,node,{auto=false}={}){
  selectedStation=st;selectedObservation=null;
  $$('.station').forEach(n=>{n.classList.remove('selected');const b=n.querySelector('.selected-badge');if(b)b.remove()});
  if(node){node.classList.add('selected');const badge=document.createElement('div');badge.className='selected-badge';badge.style.cssText='margin-top:10px;font-size:12px;font-weight:800;color:#7ee8ff';badge.textContent=auto?'AUTO RX · SCELTA':'SELEZIONATA';node.appendChild(badge)}
  $('#stationName').textContent=st.name||`Station ${st.id}`;
  const obs=usableObservations(st);const box=$('#observations');box.innerHTML='';
  if(!obs.length){$('#remoteInfo').className='notice warn';$('#remoteInfo').innerHTML='<strong>Nessun file pronto.</strong> AUTO RX passerà automaticamente a un’altra stazione.';return}
  selectedObservation=obs[0];prepareSelectedMedia(selectedObservation);
  $('#remoteInfo').className='notice ok';
  $('#remoteInfo').innerHTML=`<strong>Ricezione reale pronta.</strong><br>${escapeHtml(antennaLabel(st))}<br><br><strong>${escapeHtml(observationTitle(selectedObservation))}</strong><br>Audio e waterfall vengono caricati direttamente qui: non serve aprire SatNOGS e aspettare.`;
  obs.slice(0,6).forEach((o,i)=>box.appendChild(renderObs(o,i===0)));
  if(!auto&&window.innerWidth<980){const panel=$('#stationName')?.closest('.panel');if(panel)setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),80)}
}

function observationTitle(o){
  const sat=String(o.satellite||o.satellite_name||(o.norad_cat_id?`NORAD ${o.norad_cat_id}`:'Satellite')).replace(/^0\s+/,'');
  const f=o.frequency_text||formatFrequency(o.observation_frequency||o.transmitter_downlink_low||o.transmitter_downlink_high);
  return `${sat}${f?' · '+f:''}${o.transmitter_mode?' · '+o.transmitter_mode:''}`;
}
function formatFrequency(v){const n=Number(v);return Number.isFinite(n)&&n>0?`${(n/1e6).toFixed(4)} MHz`:''}
function prepareSelectedMedia(o){
  const a=$('#remoteAudio');
  if(o.payload){a.src=o.payload;a.style.display='block';a.preload='metadata'}else{a.pause();a.removeAttribute('src');a.style.display='none'}
}
function renderObs(o,isAuto=false){
  const el=document.createElement('article');el.className='obs';if(isAuto)el.style.borderColor='#5fd9ff';
  const when=observationTimes(o).start?new Date(observationTimes(o).start).toLocaleString():(o.timeframe_text||'data n/d');
  el.innerHTML=`<div class="obs-top"><div><b>${isAuto?'⚡ AUTO · ':''}${escapeHtml(observationTitle(o))}</b><div class="muted">${escapeHtml(when)}</div></div><span class="tag">PRONTA</span></div><div class="obs-actions"></div>`;
  const actions=el.querySelector('.obs-actions');
  if(o.payload){const b=document.createElement('button');b.textContent=isAuto?'▶ ASCOLTA SEGNALE':'▶ Ascolta';b.addEventListener('click',()=>{userActivated=true;selectedObservation=o;prepareSelectedMedia(o);playRemote(o.payload)});actions.appendChild(b)}
  if(o.waterfall){
    const img=document.createElement('img');img.src=o.waterfall;img.alt='Waterfall reale della ricezione';img.loading=isAuto?'eager':'lazy';img.style.cssText='display:block;width:100%;margin-top:12px;border-radius:14px;border:1px solid #244153;background:#050b10';el.appendChild(img);
    const a=document.createElement('a');a.href=o.waterfall;a.target='_blank';a.rel='noreferrer';a.textContent='▥ Apri waterfall';actions.appendChild(a);
  }
  const d=document.createElement('a');d.href=o.observation_url||`https://network.satnogs.org/observations/${o.id}/`;d.target='_blank';d.rel='noreferrer';d.textContent='Dettagli SatNOGS ↗';actions.appendChild(d);
  return el;
}
function tryPlaySelected(){if(userActivated&&selectedObservation?.payload)playRemote(selectedObservation.payload)}
function playRemote(url){const a=$('#remoteAudio');if(a.src!==url)a.src=url;a.style.display='block';a.play().catch(()=>{});a.scrollIntoView({behavior:'smooth',block:'center'})}

// Local RTL-SDR mode (PC only)
async function api(path,body){const r=await fetch(localOrigin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'bridge error');return data}
function drawSpectrum(bins){const W=scope.width,H=scope.height;ctx.fillStyle='#040a10';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#102533';ctx.lineWidth=1;for(let i=1;i<8;i++){const y=i*H/8;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.strokeStyle='#5fd9ff';ctx.lineWidth=2;ctx.beginPath();bins.forEach((v,i)=>{const x=i/(bins.length-1)*W,y=H-Math.max(0,Math.min(1,(v+110)/70))*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();const img=wctx.getImageData(0,0,waterfall.width,waterfall.height-2);wctx.putImageData(img,0,2);const grad=wctx.createLinearGradient(0,0,waterfall.width,0);bins.forEach((v,i)=>{const p=i/(bins.length-1),t=Math.max(0,Math.min(1,(v+100)/55)),h=220-t*180;grad.addColorStop(p,`hsl(${h} 95% ${14+t*48}%)`)});wctx.fillStyle=grad;wctx.fillRect(0,0,waterfall.width,2);frames++}
function updateMetrics(m){$('#peak').textContent=`${m.power_db.toFixed(1)} dB`;$('#noise').textContent=`${m.noise_db.toFixed(1)} dB`;$('#snr').textContent=`${(m.power_db-m.noise_db).toFixed(1)} dB`;$('#freqDisplay').textContent=(m.frequency/1e6).toFixed(3);$('#freqCaption').textContent=`${(m.frequency/1e6).toFixed(3)} MHz`}
function initAudio(){if(audioCtx)return;audioCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:48000});gainNode=audioCtx.createGain();gainNode.gain.value=+$('#volume').value;gainNode.connect(audioCtx.destination);nextAudioTime=audioCtx.currentTime}
function playPCM(buf){if(!audioEnabled)return;const u8=new Uint8Array(buf);if(u8[0]!==65)return;initAudio();const dv=new DataView(buf,1),n=Math.floor((buf.byteLength-1)/2),ab=audioCtx.createBuffer(1,n,48000),ch=ab.getChannelData(0);for(let i=0;i<n;i++)ch[i]=dv.getInt16(i*2,true)/32768;const src=audioCtx.createBufferSource();src.buffer=ab;src.connect(gainNode);const when=Math.max(audioCtx.currentTime+0.02,nextAudioTime);src.start(when);nextAudioTime=when+ab.duration}
function openWS(){if(ws)ws.close();ws=new WebSocket('ws://127.0.0.1:8765/ws');ws.binaryType='arraybuffer';ws.onopen=()=>log('Stream locale aperto');ws.onerror=()=>log('Errore WebSocket locale');ws.onclose=()=>{if(!demo)setStatus('','Bridge locale offline')};ws.onmessage=ev=>{if(typeof ev.data==='string'){const m=JSON.parse(ev.data);if(m.type==='spectrum'){drawSpectrum(m.bins);updateMetrics(m)}}else playPCM(ev.data)}}
async function connectLocal(){demo=false;if(isIOS){prepareLocalUI();return}try{await api('/api/connect');setStatus('local','RTL‑SDR connesso');$('#localNotice').className='notice ok';$('#localNotice').innerHTML='<strong>Ricevitore locale attivo.</strong> Lo spettro e l’audio arrivano dal dongle RTL‑SDR collegato al PC.';openWS();log('RTL‑SDR connected')}catch(err){setStatus('','Errore RTL‑SDR');$('#localNotice').className='notice warn';$('#localNotice').innerHTML=`<strong>Connessione fallita.</strong> ${escapeHtml(err.message)}`;log('Connect error: '+err.message)}}
async function disconnectLocal(){try{await api('/api/disconnect')}catch{}if(ws)ws.close();setStatus('','Bridge locale disconnesso');log('Receiver disconnected')}
async function tune(freq){if(isIOS){prepareLocalUI();return}try{await api('/api/tune',{frequency:Math.round(freq*1e6)});$('#freqDisplay').textContent=freq.toFixed(3);$('#freqCaption').textContent=`${freq.toFixed(3)} MHz`;$('#freqInput').value=freq.toFixed(3);log('Sintonizzato su '+freq.toFixed(3)+' MHz')}catch(err){log('Tune rejected: '+err.message)}}
function startDemo(){demo=true;if(ws)ws.close();setStatus('demo','Demo locale');$('#localNotice').className='notice';$('#localNotice').innerHTML='<strong>Modalità demo.</strong> Lo spettro è sintetico.';function tick(){if(!demo)return;const bins=[],t=performance.now()/1000,n=512;for(let i=0;i<n;i++){let v=-94+Math.random()*5;v+=30*Math.exp(-Math.pow((i-256-28*Math.sin(t*.45))/10,2));v+=18*Math.exp(-Math.pow((i-350)/6,2));bins.push(v)}drawSpectrum(bins);updateMetrics({power_db:Math.max(...bins),noise_db:-93,frequency:+$('#freqInput').value*1e6});requestAnimationFrame(tick)}tick();log('Demo started')}

$('#scanRemote').addEventListener('click',async()=>{userActivated=true;await scanRemote({manual:true});tryPlaySelected()});
$('#remoteBand').addEventListener('change',()=>scanRemote({manual:true}));
$('#connectBtn').addEventListener('click',connectLocal);$('#disconnectBtn').addEventListener('click',disconnectLocal);$('#tuneBtn').addEventListener('click',()=>tune(+$('#freqInput').value));$('#demoBtn').addEventListener('click',startDemo);$('#localBtn').addEventListener('click',()=>{if(isIOS){prepareLocalUI();return}window.open(localOrigin,'_blank')});$$('.preset').forEach(b=>b.addEventListener('click',()=>tune(+b.dataset.f)));
$('#audioBtn').addEventListener('click',async()=>{audioEnabled=!audioEnabled;if(audioEnabled){initAudio();await audioCtx.resume();$('#audioBtn').textContent='Disattiva audio';$('#audioState').textContent='Audio acceso'}else{$('#audioBtn').textContent='Attiva audio';$('#audioState').textContent='Audio spento'}});$('#volume').addEventListener('input',e=>{if(gainNode)gainNode.gain.value=+e.target.value});setInterval(()=>{$('#fps').textContent=`${frames} fps`;frames=0},1000);

setupAutoUI();switchView('remote');setStatus('remote','AUTO RX · avvio');log('AUTO RX UI pronta');scanRemote({manual:false});setInterval(()=>scanRemote({manual:false}),180000);
