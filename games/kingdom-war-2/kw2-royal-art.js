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
  root.style.setProperty('--kw2-art-'+name,'url("'+cv.toDataURL('image/webp',.93)+'")');
 }
 document.body.classList.add('royal-art');root.dataset.royalArt='original-image';
}
async function start(){
 const input=document.getElementById('royalArtFile'),button=document.getElementById('royalArtImport'),status=document.getElementById('royalArtStatus');
 button.onclick=()=>input.click();
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
 try{const saved=localStorage.getItem(KEY);if(saved){await load(saved);status.textContent='Original HUD loaded from browser storage.';return;}}catch{}
 try{await load('assets/ui/royal-hud.png');status.textContent='Original HUD loaded from game assets.';}catch{status.textContent='Import the original HUD PNG in TEST to enable the artwork.';}
}
start().catch(console.warn);
})();