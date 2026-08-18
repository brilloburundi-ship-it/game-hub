const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const CACHE='./data/remote.json';
const localOrigin='http://127.0.0.1:8765';
const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
let selectedStation=null, selectedObservation=null, currentStations=[];
let ws=null,demo=false,audioEnabled=false,audioCtx=null,gainNode=null,nextAudioTime=0,frames=0,userActivated=false;
const scope=$('#scope'),ctx=scope.getContext('2d');
const waterfall=$('#waterfall'),wctx=waterfall.getContext('2d');

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function log(msg){const n=$('#log');if(!n)return;n.textContent+=`[${new Date().toLocaleTimeString()}] ${msg}\n`;n.scrollTop=n.scrollHeight}
function setStatus(mode,text){const d=$('#statusDot');if(d){d.className='dot';if(mode)d.classList.add(mode)}if($('#statusText'))$('#statusText').textContent=text;if($('#modeMetric'))$('#modeMetric').textContent=text}
function switchView(view){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));if(view==='local')prepareLocalUI()}
function setupAutoUI(){
  if($('#heroScan'))$('#heroScan').textContent='AUTO RX · TROVA CONTENUTO UTILE';
  if($('#scanRemote'))$('#scanRemote').textContent='RISCANSIONA AUTO';
  if($('#remoteBand'))$('#remoteBand').value='all';
  if($('#remoteNotice')){
    $('#remoteNotice').className='notice ok';
    $('#remoteNotice').innerHTML='<strong>AUTO RX intelligente.</strong> Classifico automaticamente ogni ricezione come <strong>VOCE</strong>, <strong>IMMAGINE</strong> o <strong>DATI</strong>. I segnali digitali non vengono più riprodotti come audio.';
  }
}
function prepareLocalUI(){if(!isIOS)return;$('#localNotice').className='notice warn';$('#localNotice').innerHTML='<strong>Modalità PC.</strong> Su iPhone usa AUTO RX remoto. RTL‑SDR locale richiede il PC dove gira il bridge.';$('#connectBtn').disabled=true;$('#connectBtn').textContent='RTL‑SDR richiede PC';$('#disconnectBtn').disabled=true}

function antennas(st){return st?.antenna||st?.antennas||[]}
function antennaLabel(st){const a=antennas(st);if(!a.length)return 'antenna non dichiarata';return a.map(x=>`${x.band||''} ${x.antenna_type_name||x.antenna_type||'antenna'}`.trim()).join(' · ')}
function bandMatch(st,band){if(band==='all')return true;const d=JSON.stringify(antennas(st)).toLowerCase();if(band==='weather')return /137|weather|qfh|quadrafilar|quadrifilar/.test(d);if(band==='vhf')return /145|146|vhf/.test(d);if(band==='uhf')return /435|436|437|438|uhf/.test(d);return true}
function observationTimes(o){const raw=String(o.timeframe_text||'');const m=raw.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g)||[];const start=Date.parse(o.start||'')||(m[0]?Date.parse(m[0].replace(' ','T')+'Z'):NaN);const end=Date.parse(o.end||'')||(m[1]?Date.parse(m[1].replace(' ','T')+'Z'):NaN);return {start,end}}
function hasArtifact(o){return Boolean(o?.payload||o?.waterfall||(Array.isArray(o?.demoddata)&&o.demoddata.length))}
function isPast(o){const {start,end}=observationTimes(o),now=Date.now();if(Number.isFinite(end))return end<=now+120000;if(Number.isFinite(start))return start<=now-120000;return hasArtifact(o)}
function contentKind(o){
  const mode=String(o.transmitter_mode||o.mode||'').toLowerCase();
  const desc=String(o.transmitter_description||'').toLowerCase();
  const text=`${mode} ${desc}`;
  if(/sstv|apt|lrpt|hrpt|image|imaging/.test(text))return 'image';
  if(/voice|repeater|phone|speech/.test(text))return 'voice';
  if(/telemetry|beacon|packet|ax\.25|digipeater|gmsk|gfsk|fsk|bpsk|qpsk|afsk|cw|morse|data|9600|1200/.test(text))return 'data';
  if(/^fm$/.test(mode.trim())&&!/telemetry|beacon|data/.test(desc))return 'voice';
  return 'raw';
}
function kindLabel(k){return ({voice:'🎙️ VOCE',image:'🖼️ IMMAGINE',data:'📟 DATI',raw:'📡 RADIO'})[k]||'📡 RADIO'}
function kindHasUsefulArtifact(o){const k=contentKind(o);if(!isPast(o))return false;if(k==='voice')return Boolean(o.payload);if(k==='image')return Boolean(o.waterfall||o.payload);if(k==='data')return Boolean((Array.isArray(o.demoddata)&&o.demoddata.length)||o.waterfall);return Boolean(o.waterfall)}
function observationScore(o){
  if(!kindHasUsefulArtifact(o))return -100000;
  const k=contentKind(o);let s={voice:420,image:300,data:190,raw:80}[k]||0;
  const status=String(o.vetted_status||o.status||'').toLowerCase();
  if(/good|success|complete/.test(status))s+=45;if(/bad|failed/.test(status))s-=100;
  const alt=Number(o.max_altitude||0);s+=Math.min(80,Math.max(0,alt));
  if(k==='voice'&&alt<15)s-=90;
  if(k==='voice'&&o.payload)s+=50;
  if(k==='image'&&o.waterfall)s+=45;
  if(k==='data'&&Array.isArray(o.demoddata)&&o.demoddata.length)s+=80;
  const {start}=observationTimes(o);if(Number.isFinite(start)){const h=(Date.now()-start)/36e5;if(h<2)s+=50;else if(h<24)s+=35;else if(h<168)s+=20;else if(h<720)s+=8}
  return s;
}
function usefulObservations(st){return (Array.isArray(st?.observations)?st.observations:[]).filter(kindHasUsefulArtifact).sort((a,b)=>observationScore(b)-observationScore(a)||(observationTimes(b).start||0)-(observationTimes(a).start||0))}
function stationScore(st,band='all'){let s=Number(st.score||0);const obs=usefulObservations(st);if(obs.length)s+=Math.min(160,observationScore(obs[0])/3);if(band!=='all'&&bandMatch(st,band))s+=25;return s}
async function loadCache(){const r=await fetch(`${CACHE}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}

async function scanRemote({manual=false}={}){
  const band=$('#remoteBand').value,box=$('#stations');if(manual)box.innerHTML='<div class="empty">AUTO RX cerca voce, immagini o dati utili…</div>';$('#scanRemote').disabled=true;setStatus('remote','AUTO RX · analisi');
  try{
    const cache=await loadCache();const all=(cache.stations||[]).filter(s=>bandMatch(s,band));
    const ready=all.filter(s=>usefulObservations(s).length).sort((a,b)=>stationScore(b,band)-stationScore(a,band));
    if(!ready.length)throw new Error('nessun contenuto interpretabile disponibile');
    currentStations=ready.slice(0,14);renderStations(currentStations,band);
    const best=currentStations[0];selectStation(best,$(`[data-station-id="${best.id}"]`),{auto:true});
    const k=contentKind(selectedObservation||{});$('#remoteNotice').className='notice ok';$('#remoteNotice').innerHTML=`<strong>AUTO RX operativo.</strong> Ho trovato ${ready.length} stazioni con contenuti utili. Scelta automatica: <strong>${escapeHtml(best.name)}</strong> · ${kindLabel(k)}.`;setStatus('remote',`AUTO RX · ${kindLabel(k).replace(/^[^ ]+ /,'')}`);return best;
  }catch(e){box.innerHTML=`<div class="empty">${escapeHtml(e.message)}. Riproverò automaticamente.</div>`;$('#remoteNotice').className='notice warn';$('#remoteNotice').innerHTML='<strong>AUTO RX in attesa.</strong> Evito di riprodurre rumore digitale come se fosse voce.';setStatus('','AUTO RX · attesa');return null}
  finally{$('#scanRemote').disabled=false}
}
function renderStations(data,band){const box=$('#stations');box.innerHTML='';data.forEach((s,i)=>{const u=usefulObservations(s),k=u[0]?contentKind(u[0]):'raw';const el=document.createElement('button');el.className='station';el.dataset.stationId=String(s.id);el.innerHTML=`<div class="station-top"><div><b>${i===0?'⚡ ':''}${escapeHtml(s.name||`Station ${s.id}`)}</b><small>${kindLabel(k)} · ${escapeHtml(antennaLabel(s))}<br>${u.length} contenuti utili · ${Number(s.total_observations||0).toLocaleString()} osservazioni</small></div><span class="score">${Math.round(stationScore(s,band))}</span></div>`;el.addEventListener('click',()=>{userActivated=true;selectStation(s,el,{auto:false});tryPlaySelected()});box.appendChild(el)})}
function selectStation(st,node,{auto=false}={}){selectedStation=st;selectedObservation=null;$$('.station').forEach(n=>{n.classList.remove('selected');n.querySelector('.selected-badge')?.remove()});if(node){node.classList.add('selected');const b=document.createElement('div');b.className='selected-badge';b.style.cssText='margin-top:10px;font-size:12px;font-weight:800;color:#7ee8ff';b.textContent=auto?'AUTO RX · SCELTA':'SELEZIONATA';node.appendChild(b)}$('#stationName').textContent=st.name||`Station ${st.id}`;const obs=usefulObservations(st),box=$('#observations');box.innerHTML='';if(!obs.length){$('#remoteInfo').className='notice warn';$('#remoteInfo').innerHTML='<strong>Nessun contenuto utile.</strong> AUTO RX passerà a un’altra stazione.';return}selectedObservation=obs[0];prepareSelectedMedia(selectedObservation);const k=contentKind(selectedObservation);$('#remoteInfo').className='notice ok';$('#remoteInfo').innerHTML=`<strong>${kindLabel(k)} selezionata automaticamente.</strong><br>${escapeHtml(observationTitle(selectedObservation))}<br><br>${kindExplanation(k)}`;obs.slice(0,6).forEach((o,i)=>box.appendChild(renderObs(o,i===0)));if(!auto&&innerWidth<980)setTimeout(()=>$('#stationName').closest('.panel').scrollIntoView({behavior:'smooth',block:'start'}),80)}
function kindExplanation(k){if(k==='voice')return 'Riproduco l’audio perché i metadati indicano una trasmissione vocale. Se nessuno stava parlando in quel momento potresti comunque sentire fruscio/portante.';if(k==='image')return 'Non riproduco il segnale codificato come audio: mostro direttamente il waterfall/immagine disponibile.';if(k==='data')return 'È telemetria digitale: non la riproduco come audio. Mostro dati e waterfall disponibili.';return 'Segnale radio non classificato: niente autoplay del rumore grezzo.'}
function observationTitle(o){const sat=String(o.satellite||o.satellite_name||(o.norad_cat_id?`NORAD ${o.norad_cat_id}`:'Satellite')).replace(/^0\s+/,'');const f=o.frequency_text||formatFrequency(o.observation_frequency||o.transmitter_downlink_low||o.transmitter_downlink_high);return `${sat}${f?' · '+f:''}${o.transmitter_mode?' · '+o.transmitter_mode:''}`}
function formatFrequency(v){const n=Number(v);return Number.isFinite(n)&&n>0?`${(n/1e6).toFixed(4)} MHz`:''}
function prepareSelectedMedia(o){const a=$('#remoteAudio'),k=contentKind(o);if(k==='voice'&&o.payload){a.src=o.payload;a.style.display='block';a.preload='metadata'}else{a.pause();a.removeAttribute('src');a.style.display='none'}}
function renderObs(o,isAuto=false){const k=contentKind(o),el=document.createElement('article');el.className='obs';if(isAuto)el.style.borderColor='#5fd9ff';const t=observationTimes(o).start?new Date(observationTimes(o).start).toLocaleString():(o.timeframe_text||'data n/d');el.innerHTML=`<div class="obs-top"><div><b>${isAuto?'⚡ AUTO · ':''}${escapeHtml(observationTitle(o))}</b><div class="muted">${escapeHtml(t)} · ${kindLabel(k)}</div></div><span class="tag">PRONTA</span></div><div class="obs-actions"></div>`;const actions=el.querySelector('.obs-actions');if(k==='voice'&&o.payload){const b=document.createElement('button');b.textContent='▶ ASCOLTA VOCE';b.addEventListener('click',()=>{userActivated=true;selectedObservation=o;prepareSelectedMedia(o);playRemote(o.payload)});actions.appendChild(b)}if(o.waterfall){const img=document.createElement('img');img.src=o.waterfall;img.alt='Waterfall reale';img.loading=isAuto?'eager':'lazy';img.style.cssText='display:block;width:100%;margin-top:12px;border-radius:14px;border:1px solid #244153;background:#050b10';el.appendChild(img);const a=document.createElement('a');a.href=o.waterfall;a.target='_blank';a.rel='noreferrer';a.textContent='▥ Waterfall';actions.appendChild(a)}if(k==='data'&&Array.isArray(o.demoddata)&&o.demoddata.length){const pre=document.createElement('pre');pre.className='log';pre.style.height='auto';pre.textContent=JSON.stringify(o.demoddata.slice(0,8),null,2);el.appendChild(pre)}const d=document.createElement('a');d.href=o.observation_url||`https://network.satnogs.org/observations/${o.id}/`;d.target='_blank';d.rel='noreferrer';d.textContent='Dettagli ↗';actions.appendChild(d);return el}
function tryPlaySelected(){if(userActivated&&selectedObservation&&contentKind(selectedObservation)==='voice'&&selectedObservation.payload)playRemote(selectedObservation.payload)}
function playRemote(url){const a=$('#remoteAudio');if(a.src!==url)a.src=url;a.style.display='block';a.play().catch(()=>{});a.scrollIntoView({behavior:'smooth',block:'center'})}

// Local RTL-SDR mode (PC only)
async function api(path,body){const r=await fetch(localOrigin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error||'bridge error');return d}
function drawSpectrum(bins){const W=scope.width,H=scope.height;ctx.fillStyle='#040a10';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#102533';for(let i=1;i<8;i++){const y=i*H/8;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.strokeStyle='#5fd9ff';ctx.lineWidth=2;ctx.beginPath();bins.forEach((v,i)=>{const x=i/(bins.length-1)*W,y=H-Math.max(0,Math.min(1,(v+110)/70))*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();const img=wctx.getImageData(0,0,waterfall.width,waterfall.height-2);wctx.putImageData(img,0,2);const g=wctx.createLinearGradient(0,0,waterfall.width,0);bins.forEach((v,i)=>{const p=i/(bins.length-1),t=Math.max(0,Math.min(1,(v+100)/55)),h=220-t*180;g.addColorStop(p,`hsl(${h} 95% ${14+t*48}%)`)});wctx.fillStyle=g;wctx.fillRect(0,0,waterfall.width,2);frames++}
function updateMetrics(m){$('#peak').textContent=`${m.power_db.toFixed(1)} dB`;$('#noise').textContent=`${m.noise_db.toFixed(1)} dB`;$('#snr').textContent=`${(m.power_db-m.noise_db).toFixed(1)} dB`;$('#freqDisplay').textContent=(m.frequency/1e6).toFixed(3);$('#freqCaption').textContent=`${(m.frequency/1e6).toFixed(3)} MHz`}
function initAudio(){if(audioCtx)return;audioCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:48000});gainNode=audioCtx.createGain();gainNode.gain.value=+$('#volume').value;gainNode.connect(audioCtx.destination);nextAudioTime=audioCtx.currentTime}
function playPCM(buf){if(!audioEnabled)return;const u8=new Uint8Array(buf);if(u8[0]!==65)return;initAudio();const dv=new DataView(buf,1),n=Math.floor((buf.byteLength-1)/2),ab=audioCtx.createBuffer(1,n,48000),ch=ab.getChannelData(0);for(let i=0;i<n;i++)ch[i]=dv.getInt16(i*2,true)/32768;const src=audioCtx.createBufferSource();src.buffer=ab;src.connect(gainNode);const when=Math.max(audioCtx.currentTime+.02,nextAudioTime);src.start(when);nextAudioTime=when+ab.duration}
function openWS(){if(ws)ws.close();ws=new WebSocket('ws://127.0.0.1:8765/ws');ws.binaryType='arraybuffer';ws.onmessage=e=>{if(typeof e.data==='string'){const m=JSON.parse(e.data);if(m.type==='spectrum'){drawSpectrum(m.bins);updateMetrics(m)}}else playPCM(e.data)}}
async function connectLocal(){if(isIOS){prepareLocalUI();return}try{await api('/api/connect');setStatus('local','RTL-SDR connesso');openWS()}catch(e){$('#localNotice').className='notice warn';$('#localNotice').innerHTML=`<strong>Connessione fallita.</strong> ${escapeHtml(e.message)}`}}
async function disconnectLocal(){try{await api('/api/disconnect')}catch{}if(ws)ws.close();setStatus('','Bridge locale disconnesso')}
async function tune(freq){if(isIOS){prepareLocalUI();return}try{await api('/api/tune',{frequency:Math.round(freq*1e6)});$('#freqDisplay').textContent=freq.toFixed(3);$('#freqCaption').textContent=`${freq.toFixed(3)} MHz`;$('#freqInput').value=freq.toFixed(3)}catch(e){log('Tune: '+e.message)}}
function startDemo(){demo=true;if(ws)ws.close();setStatus('demo','Demo locale');function tick(){if(!demo)return;const bins=[],t=performance.now()/1000;for(let i=0;i<512;i++){let v=-94+Math.random()*5;v+=30*Math.exp(-Math.pow((i-256-28*Math.sin(t*.45))/10,2));bins.push(v)}drawSpectrum(bins);updateMetrics({power_db:Math.max(...bins),noise_db:-93,frequency:+$('#freqInput').value*1e6});requestAnimationFrame(tick)}tick()}

$$('.tab').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));
$('#heroScan').addEventListener('click',async()=>{userActivated=true;switchView('remote');await scanRemote({manual:true});tryPlaySelected()});
$('#switchLocal').addEventListener('click',()=>switchView('local'));
$('#scanRemote').addEventListener('click',async()=>{userActivated=true;await scanRemote({manual:true});tryPlaySelected()});
$('#remoteBand').addEventListener('change',()=>scanRemote({manual:true}));
$('#connectBtn').addEventListener('click',connectLocal);$('#disconnectBtn').addEventListener('click',disconnectLocal);$('#tuneBtn').addEventListener('click',()=>tune(+$('#freqInput').value));$('#demoBtn').addEventListener('click',startDemo);$('#localBtn').addEventListener('click',()=>{if(isIOS)return prepareLocalUI();window.open(localOrigin,'_blank')});$$('.preset').forEach(b=>b.addEventListener('click',()=>tune(+b.dataset.f)));
$('#audioBtn').addEventListener('click',async()=>{audioEnabled=!audioEnabled;if(audioEnabled){initAudio();await audioCtx.resume();$('#audioBtn').textContent='Disattiva audio';$('#audioState').textContent='Audio acceso'}else{$('#audioBtn').textContent='Attiva audio';$('#audioState').textContent='Audio spento'}});$('#volume').addEventListener('input',e=>{if(gainNode)gainNode.gain.value=+e.target.value});setInterval(()=>{$('#fps').textContent=`${frames} fps`;frames=0},1000);
setupAutoUI();switchView('remote');setStatus('remote','AUTO RX · avvio');scanRemote({manual:false});setInterval(()=>scanRemote({manual:false}),180000);
