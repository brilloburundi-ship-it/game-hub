import{S}from'./core.js?v=1.4.0';

const VERSION='1.0.0';
const root=document.querySelector('#nextQueue');
const seenWins=new Map();
const reachedAt=new Map();
let order=0,last='';

function esc(value){
  return String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
}

function installStyle(){
  if(document.querySelector('#nextScoreBarStyle'))return;
  const style=document.createElement('style');
  style.id='nextScoreBarStyle';
  style.textContent=`
    .queue-preview.next-score-bar{display:flex;align-items:stretch;justify-content:flex-start;gap:0;min-width:0;min-height:32px;padding:0;overflow:hidden;background:rgba(10,7,23,.88);border-color:rgba(255,61,168,.38)}
    .next-score-content{display:flex;align-items:stretch;width:100%;min-width:0;overflow:hidden}
    .next-score-label{display:flex;align-items:center;flex:0 0 auto;padding:6px 9px;background:rgba(255,61,168,.18);color:#ff79c2;font-size:9px;font-weight:900;letter-spacing:.08em;white-space:nowrap}
    .next-score-names{display:flex;align-items:center;flex:1 1 auto;min-width:0;gap:4px;padding:4px 6px;overflow:hidden}
    .next-score-name{display:block;flex:1 1 0;min-width:0;max-width:150px;padding:3px 6px;border:1px solid rgba(190,139,255,.18);border-radius:6px;background:rgba(255,255,255,.045);color:#f7f2ff;font-size:8px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
    .next-score-empty{display:flex;align-items:center;min-width:0;color:#a99fbd;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .best-score{display:flex;align-items:center;justify-content:flex-end;flex:0 1 34%;min-width:126px;max-width:260px;padding:5px 9px;border-left:1px solid rgba(255,61,168,.28);font-size:8px;white-space:nowrap;overflow:hidden}
    .best-score-crown{flex:0 0 auto;font-size:13px;line-height:1;filter:drop-shadow(0 0 5px rgba(255,213,107,.5))}
    .best-score-name{min-width:0;margin-left:5px;color:#fff;font-weight:800;overflow:hidden;text-overflow:ellipsis}
    .best-score-wins{flex:0 0 auto;margin-left:5px;color:#ff79c2;font-weight:900}
    @media(max-width:520px){.next-score-label{padding-inline:6px;font-size:8px}.next-score-names{gap:3px;padding-inline:4px}.next-score-name{padding-inline:4px;font-size:7px}.best-score{flex-basis:38%;min-width:108px;padding-inline:6px;font-size:7px}.best-score-crown{font-size:12px}}
    @media(max-width:380px){.next-score-label{font-size:7px}.best-score{min-width:96px}.best-score-name{margin-left:3px}.best-score-wins{margin-left:3px}}
  `;
  document.head.append(style);
}

function updateReachedOrder(){
  for(const viewer of S.viewers.values()){
    const id=String(viewer.id||viewer.name||'viewer');
    const wins=Math.max(0,Number(viewer.wins)||0);
    const previous=seenWins.get(id)??-1;
    if(wins>previous){
      for(let value=Math.max(0,previous+1);value<=wins;value++)reachedAt.set(`${id}:${value}`,++order);
      seenWins.set(id,wins);
    }
  }
}

function bestViewer(){
  updateReachedOrder();
  return [...S.viewers.values()].sort((a,b)=>{
    const aw=Math.max(0,Number(a.wins)||0),bw=Math.max(0,Number(b.wins)||0);
    if(bw!==aw)return bw-aw;
    const ak=reachedAt.get(`${String(a.id||a.name||'viewer')}:${aw}`)??Number.MAX_SAFE_INTEGER;
    const bk=reachedAt.get(`${String(b.id||b.name||'viewer')}:${bw}`)??Number.MAX_SAFE_INTEGER;
    return ak-bk;
  })[0]||null;
}

function markup(){
  const limit=innerWidth<=520?2:3;
  const queue=S.queue.slice(0,limit);
  const best=bestViewer();
  const wins=Math.max(0,Number(best?.wins)||0);
  const names=queue.length
    ?queue.map((viewer,index)=>`<span class="next-score-name" title="${esc(viewer.name)}">${index+1}. ${esc(viewer.name)}</span>`).join('')
    :'<span class="next-score-empty">WAITING FOR CHALLENGERS…</span>';
  const bestName=wins>0?esc(best?.name||'—'):'—';
  const signature=[limit,...queue.map(v=>`${v.id}:${v.name}`),best?.id||'',bestName,wins].join('|');
  return{signature,html:`<div class="next-score-content" data-next-score-content><b class="next-score-label">NEXT:</b><div class="next-score-names">${names}</div><div class="best-score" title="Best score"><span class="best-score-crown" aria-label="Best score">👑</span><span class="best-score-name">${bestName}</span><span class="best-score-wins">${wins}W</span></div></div>`};
}

function render(force=false){
  if(!root)return;
  installStyle();
  root.classList.add('next-score-bar');
  const next=markup();
  if(!force&&next.signature===last&&root.querySelector('[data-next-score-content]'))return;
  last=next.signature;
  root.innerHTML=next.html;
}

if(root){
  let applying=false;
  new MutationObserver(()=>{
    if(applying||root.querySelector('[data-next-score-content]'))return;
    applying=true;
    render(true);
    queueMicrotask(()=>{applying=false});
  }).observe(root,{childList:true,subtree:true,characterData:true});
  render(true);
  const timer=setInterval(render,120);
  addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}

window.__fighterArenaNextScoreBar={version:VERSION,render};
