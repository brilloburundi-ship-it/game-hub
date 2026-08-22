import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const port = Number(process.env.WKL_PORT || 8795);
const tikfinityUrl = process.env.TIKFINITY_URL || 'ws://127.0.0.1:21213/';
const token = process.env.WKL_TOKEN || randomBytes(18).toString('hex');
const clients = new Set();
let socket;

const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.mp3':'audio/mpeg','.webmanifest':'application/manifest+json' };
const sendEvent = payload => { const line=`data: ${JSON.stringify(payload)}\n\n`; for(const res of clients)res.write(line); };
function connectTikFinity(){
  try{
    socket?.close();
    socket=new WebSocket(tikfinityUrl);
    socket.onopen=()=>sendEvent({__bridgeStatus:'connected'});
    socket.onmessage=message=>{try{sendEvent(JSON.parse(String(message.data)));}catch{}}
    socket.onclose=()=>setTimeout(connectTikFinity,2500);
    socket.onerror=()=>socket.close();
  }catch{setTimeout(connectTikFinity,2500);}
}
function localAddress(){for(const list of Object.values(networkInterfaces()))for(const item of list||[])if(item.family==='IPv4'&&!item.internal)return item.address;return'127.0.0.1';}

const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(url.pathname==='/bridge/health'){if(url.searchParams.get('token')!==token){res.writeHead(403);return res.end('Forbidden');}res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,app:'world-kingdoms-live',port,tikFinityConnected:socket?.readyState===1}));}
  if(url.pathname==='/bridge/events'){if(url.searchParams.get('token')!==token){res.writeHead(403);return res.end('Forbidden');}res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify({__bridgeStatus:socket?.readyState===1?'connected':'waiting'})}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return;}
  let path=url.pathname==='/'?'/games/world-kingdoms-live/index.html':url.pathname;
  path=normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  const file=resolve(repoRoot,`.${path}`);
  if(!file.startsWith(repoRoot)){res.writeHead(403);return res.end('Forbidden');}
  try{const info=await stat(file);if(!info.isFile())throw new Error('not file');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}
});

server.listen(port,'0.0.0.0',()=>{
  const host=localAddress();
  console.log(`World Kingdoms LIVE bridge: http://127.0.0.1:${port}/games/world-kingdoms-live/?mode=live&token=${token}`);
  console.log(`Safari / remote: http://${host}:${port}/games/world-kingdoms-live/?mode=live&token=${token}`);
  connectTikFinity();
});
