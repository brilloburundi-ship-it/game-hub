(() => {
'use strict';
const KEY='kw2-royal-art-source-v1';
const crops={
 logo:[0,0,941,243],
 resources:[0,238,941,103],
 ranking:[0,335,235,558],
 chronicle:[663,349,278,545],
 war:[0,1057,941,314],
 gifts:[0,1367,941,302]
};
const root=document.documentElement;
async function load(source){
 const im=new Image();im.src=source;await im.decode();
 const sx=im.naturalWidth/941,sy=im.naturalHeight/1672;
 for(const [name,[x,y,w,h]] of Object.entries(crops)){
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const ctx=cv.getContext('2d');ctx.drawImage(im,x*sx,y*sy,w*sx,h*sy,0,0,w,h);
  if(name==='resources'){
   const src=document.createElement('canvas');src.width=w;src.height=h;src.getContext('2d').drawImage(cv,0,0);
   cv.height=131;const c=cv.getContext('2d');
   c.drawImage(src,0,0,w,69,0,0,w,69);
   c.drawImage(src,0,69,w,7,0,69,w,35);
   c.drawImage(src,0,76,w,h-76,0,104,w,h-76);
   // The existing economy has wood, not iron: replace the last label only.
   c.fillStyle='#161919';c.fillRect(842,23,65,40);c.fillStyle='#f5e8c4';c.font='bold 25px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText('Wood',874,43);
  }
  root.style.setProperty('--kw2-art-'+name,'url("'+cv.toDataURL('image/webp',.93)+'")');
 }
 document.body.classList.add('royal-art','royal-art-ready');root.dataset.royalArt='original-image';document.getElementById('royalArtRequired')?.setAttribute('hidden','');
}
async function start(){
 const input=document.getElementById('royalArtFile'),button=document.getElementById('royalArtImport'),status=document.getElementById('royalArtStatus');
 button.onclick=()=>input.click();document.getElementById('royalArtRequiredButton').onclick=()=>input.click();
 input.onchange=async()=>{
  const file=input.files?.[0];if(!file)return;
  const url=URL.createObjectURL(file);
  try{
   await load(url);
   const im=new Image();im.src=url;await im.decode();
   const cv=document.createElement('canvas');cv.width=941;cv.height=1672;cv.getContext('2d').drawImage(im,0,0,941,1672);
   try{localStorage.setItem(KEY,cv.toDataURL('image/webp',.96));status.textContent='Original HUD imported and saved on this browser.';}catch{status.textContent='Original HUD loaded for this session.';}
  }catch{status.textContent='Could not load HUD image. Choose the original PNG.';}finally{URL.revokeObjectURL(url);input.value='';}
 };
 const portrait=document.getElementById('royalPortrait');
 portrait.onclick=()=>{const on=document.body.classList.toggle('royal-portrait');portrait.setAttribute('aria-pressed',String(on));};
 try{await load('assets/ui/royal-hud.png');status.textContent='Original HUD loaded from game assets.';return;}catch{}
 try{const saved=localStorage.getItem(KEY);if(saved){await load(saved);status.textContent='Original HUD loaded from browser storage.';return;}}catch{}
 document.getElementById('royalArtRequired').hidden=false;status.textContent='Import the original HUD PNG to enable the interface.';
}
start().catch(console.warn);
})();