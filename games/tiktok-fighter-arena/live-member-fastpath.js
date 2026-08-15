const isObj=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const cleanName=value=>String(value||'').replace(/^@/,'').trim().slice(0,32);
const normalized=value=>String(value||'').toLowerCase().replace(/[\s_-]+/g,'');
const nestedKeys=['data','eventData','payload','detail','body','message'];
const eventKeys=['type','event','eventType','event_name','eventName','action','actionName','name','displayType','label'];
const userKeys=['user','userInfo','userData','author','sender','from','member','profile','owner'];
const joinNames=['member','viewerenter','viewerjoin','memberenter','memberjoin','userjoin','roomenter','enterroom'];
const leaveNames=['viewerleave','memberleave','viewerexit','memberexit','leave','exit'];
const pending=new Map();
const recentlySeen=new Map();
let streamBound=null;
let socketBound=null;

function objectGraph(raw){
  const out=[];
  const queue=isObj(raw)?[raw]:[];
  const seen=new Set();
  while(queue.length&&out.length<48){
    const current=queue.shift();
    if(!isObj(current)||seen.has(current))continue;
    seen.add(current);out.push(current);
    for(const key of [...nestedKeys,...userKeys]){
      const child=current[key];
      if(isObj(child)&&!seen.has(child))queue.push(child);
    }
  }
  return out;
}

function eventCandidates(objects){
  const result=[];
  for(const obj of objects){
    for(const key of eventKeys){
      const value=obj[key];
      if(value===undefined||value===null||isObj(value))continue;
      const text=normalized(value);
      if(text&&!result.includes(text))result.push(text);
    }
  }
  return result;
}

function firstText(objects,keys){
  for(const obj of objects){
    for(const key of keys){
      const value=obj?.[key];
      if(value===undefined||value===null||isObj(value))continue;
      const text=String(value).trim();
      if(text)return text;
    }
  }
  return '';
}

function identityFrom(objects){
  const username=cleanName(firstText(objects,[
    'uniqueId','unique_id','username','userName','user_name','nickname','displayName','display_name','handle'
  ]));
  const userId=firstText(objects,[
    'secUid','sec_uid','userId','user_id','senderUserId','sender_user_id','uid','id'
  ]);
  if(!username&&!userId)return null;
  const name=username||(userId?`Viewer-${String(userId).slice(-8)}`:'Viewer');
  return {userId:String(userId||`viewer:${name.toLowerCase()}`),username:name,uniqueId:name};
}

function isMemberEnter(raw){
  const objects=objectGraph(raw);
  if(!objects.length)return null;
  const names=eventCandidates(objects);
  if(names.some(name=>name.includes('roomuser')))return null;
  if(names.some(name=>leaveNames.some(leave=>name===leave||name.endsWith(leave))))return null;

  const explicit=names.some(name=>joinNames.some(join=>name===join||name.endsWith(join)||name.includes(join)));
  const action=normalized(firstText(objects,['memberAction','action','actionName']));
  const display=normalized(firstText(objects,['displayType']));
  const label=normalized(firstText(objects,['label']));
  const actionId=Number(firstText(objects,['actionId','actionCode'])||0);
  const payloadEnter=action==='join'||action==='enter'||action==='joined'||actionId===1||
    display.includes('enter')||display.includes('joined')||label.includes('joined');
  if(!explicit&&!payloadEnter)return null;
  return identityFrom(objects);
}

function emitNow(identity){
  if(!identity)return;
  const key=identity.userId||identity.username;
  const bridge=window.FighterArenaBridge;
  if(window.__fighterArenaReady!==true||!bridge?.emit){
    pending.set(key,identity);
    return;
  }

  const now=Date.now();
  const last=recentlySeen.get(key)||0;
  if(now-last<1500)return;
  recentlySeen.set(key,now);
  if(recentlySeen.size>500){
    const cutoff=now-120000;
    for(const [id,stamp] of recentlySeen)if(stamp<cutoff)recentlySeen.delete(id);
  }
  bridge.emit('join',{...identity,source:'tikfinity-member-fastpath'});
}

function consume(raw){
  if(Array.isArray(raw)){for(const item of raw)consume(item);return;}
  emitNow(isMemberEnter(raw));
}

function parsePayload(data){
  if(typeof data==='string'){
    try{consume(JSON.parse(data));}catch{}
    return;
  }
  if(typeof Blob!=='undefined'&&data instanceof Blob){
    data.text().then(parsePayload).catch(()=>{});
    return;
  }
  if(isObj(data)||Array.isArray(data))consume(data);
}

function bind(){
  const live=window.FighterArenaLiveBridge||window.FighterArenaLanBridge;
  const stream=live?.stream;
  const socket=live?.socket;
  if(stream&&stream!==streamBound){
    streamBound=stream;
    stream.addEventListener('message',event=>parsePayload(event.data));
  }
  if(socket&&socket!==socketBound){
    socketBound=socket;
    socket.addEventListener('message',event=>parsePayload(event.data));
  }
}

const pump=setInterval(()=>{
  bind();
  if(window.__fighterArenaReady===true&&window.FighterArenaBridge?.emit&&pending.size){
    const batch=[...pending.values()];
    pending.clear();
    for(const identity of batch)emitNow(identity);
  }
},50);

window.addEventListener('pagehide',()=>clearInterval(pump),{once:true});
window.__fighterArenaMemberFastPath={consume,isMemberEnter,pending};
