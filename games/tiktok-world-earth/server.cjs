const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = __dirname;
const HTTP_PORT = 4187;
const BRIDGE_PORT = 21347;
const TIKFINITY_PORT = 21213;
const MIME = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
  '.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2',
  '.opus':'audio/ogg','.ogg':'audio/ogg','.mp3':'audio/mpeg'
};

function lanAddress(){
  const rows=[];
  for(const [name,items] of Object.entries(os.networkInterfaces())) for(const item of items||[]){
    if(item.family==='IPv4'&&!item.internal&&!item.address.startsWith('169.254.')) rows.push({name,address:item.address});
  }
  rows.sort((a,b)=>Number(!/wi-?fi|wireless|wlan/i.test(a.name))-Number(!/wi-?fi|wireless|wlan/i.test(b.name)));
  return rows[0]?.address||'127.0.0.1';
}

const ip=lanAddress();
const gameUrl=`http://${ip}:${HTTP_PORT}/?build=6`;
fs.writeFileSync(path.join(ROOT,'URL TELEFONO.txt'),`TIKTOK WORLD - URL UNICO TELEFONO\r\n\r\n${gameUrl}\r\n\r\n1. PC e telefono devono essere sullo stesso Wi-Fi.\r\n2. Il bridge parte automaticamente dopo l'accesso a Windows.\r\n3. Apri questo indirizzo sul telefono e scegli Aggiungi alla schermata Home.\r\n4. Se Windows cambia indirizzo IP, riapri questo file e aggiorna l'icona Safari.\r\n`,'utf8');

const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Connection':'close'});return res.end();}
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{return res.writeHead(400).end();}
  if(pathname==='/')pathname='/index.html';
  const file=path.resolve(ROOT,'.'+pathname);
  const rootPrefix=path.resolve(ROOT)+path.sep;
  if(!file.startsWith(rootPrefix))return res.writeHead(403,{'Connection':'close'}).end();
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile())return res.writeHead(404,{'Content-Type':'text/plain','Connection':'close'}).end('404 Not Found');
    let start=0,end=stat.size-1,status=200;
    const match=/^bytes=(\d+)-(\d*)$/i.exec(req.headers.range||'');
    if(match){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);if(start>=stat.size||end<start){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}status=206;}
    const headers={
      'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream',
      'Content-Length':end-start+1,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff',
      'Cache-Control':['index.html','service-worker.js'].includes(path.basename(file))?'no-cache':'public, max-age=3600'
    };
    if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    res.writeHead(status,headers);if(req.method==='HEAD')return res.end();
    const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
  });
});

const relay=net.createServer(phone=>{
  const tikfinity=net.createConnection({host:'127.0.0.1',port:TIKFINITY_PORT});
  phone.setNoDelay(true);tikfinity.setNoDelay(true);phone.pipe(tikfinity);tikfinity.pipe(phone);
  const close=()=>{phone.destroy();tikfinity.destroy();};phone.on('error',close);tikfinity.on('error',close);
});

function fail(label,error){console.error(`\n${label}: ${error.message}`);console.error('Chiudi eventuali vecchie finestre del gioco e riprova.');process.exitCode=1;}
server.on('error',error=>fail('Server web non avviato',error));
relay.on('error',error=>fail('Bridge TikFinity non avviato',error));
relay.listen(BRIDGE_PORT,'0.0.0.0');
server.listen(HTTP_PORT,'0.0.0.0',()=>{
  console.clear();
  console.log('==============================================');
  console.log(' TIKTOK WORLD - BRIDGE WIFI ATTIVO');
  console.log('==============================================');
  console.log(`\n URL UNICO: ${gameUrl}`);
  console.log(` TikFinity: porta ${BRIDGE_PORT} -> PC:${TIKFINITY_PORT}`);
  console.log('\n Lascia aperta questa finestra. Ctrl+C chiude il bridge.\n');
  if(!process.argv.includes('--no-open'))spawn('cmd.exe',['/c','start','',gameUrl],{detached:true,stdio:'ignore',windowsHide:true}).unref();
});

function shutdown(){relay.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
