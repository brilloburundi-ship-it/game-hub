import{S,cfg}from'./core.js?v=1.4.0';

const VERSION='1.0.0';
let root=null,last='';

function install(){
  if(root)return root;
  const style=document.createElement('style');
  style.textContent=`
    .live-queue-rail{position:absolute;z-index:16;top:max(145px,calc(118px + env(safe-area-inset-top)));left:50%;transform:translateX(-50%);width:min(94vw,620px);display:grid;gap:4px;pointer-events:none}
    .live-queue-head{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border:1px solid rgba(190,139,255,.22);border-radius:8px;background:rgba(7,5,16,.76);backdrop-filter:blur(5px);font-size:7px;letter-spacing:.14em;color:#bcaed0}
    .live-queue-head b{font-size:8px;color:#ff79c2;letter-spacing:.08em}
    .live-queue-list{display:flex;justify-content:center;gap:4px;min-height:31px;overflow:hidden}
    .live-queue-item{min-width:0;flex:1 1 0;max-width:116px;display:grid;grid-template-columns:20px minmax(0,1fr);align-items:center;gap:4px;padding:4px 5px;border:1px solid rgba(255,61,168,.23);border-radius:8px;background:rgba(8,6,19,.78);backdrop-filter:blur(5px)}
    .live-queue-pos{display:grid;place-items:center;width:19px;height:19px;border-radius:6px;background:rgba(130,85,255,.28);font-size:7px;font-weight:900;color:#d9c7ff}
    .live-queue-copy{min-width:0;display:grid;line-height:1.08}.live-queue-copy b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px;color:#fff}.live-queue-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:6px;color:#a99fbd}
    .live-queue-empty{padding:6px 10px;border:1px solid rgba(190,139,255,.18);border-radius:8px;background:rgba(8,6,19,.65);font-size:7px;color:#a99fbd}
    @media(max-width:520px){.live-queue-rail{top:max(148px,calc(120px + env(safe-area-inset-top)));width:96vw}.live-queue-item{max-width:none}.live-queue-copy small{font-size:5px}}
    @media(min-width:800px) and (orientation:landscape){.live-queue-rail{top:102px;width:min(78vw,720px)}}
  `;
  document.head.append(style);
  root=document.createElement('section');
  root.id='liveQueueRail';root.className='live-queue-rail';root.setAttribute('aria-label','Battle queue');
  root.innerHTML='<div class="live-queue-head"><b>UP NEXT</b><span id="liveQueueRailCount">0 WAITING</span></div><div id="liveQueueRailList" class="live-queue-list"></div>';
  document.querySelector('#app')?.append(root);
  return root;
}

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){
  install();
  if(!root)return;
  const limit=innerWidth<520?4:6,queue=S.queue.slice(0,limit);
  const sig=`${S.queue.length}|${queue.map(v=>`${v.id}:${v.fighterId}:${v.level}`).join('|')}`;
  if(sig===last)return;last=sig;
  const count=root.querySelector('#liveQueueRailCount'),list=root.querySelector('#liveQueueRailList');
  if(count)count.textContent=`${S.queue.length} WAITING`;
  if(!list)return;
  list.innerHTML=queue.length?queue.map((v,i)=>`<div class="live-queue-item"><span class="live-queue-pos">${i+1}</span><span class="live-queue-copy"><b>${esc(v.name)}</b><small>${esc(cfg(v.fighterId)?.name||v.fighterId)} · LV ${v.level}</small></span></div>`).join('')+(S.queue.length>limit?`<div class="live-queue-item"><span class="live-queue-pos">+</span><span class="live-queue-copy"><b>${S.queue.length-limit} MORE</b><small>waiting</small></span></div>`:''):'<div class="live-queue-empty">Waiting for challengers…</div>';
}

install();setInterval(render,180);render();
window.__fighterArenaQueueOverlay={version:VERSION,render};
