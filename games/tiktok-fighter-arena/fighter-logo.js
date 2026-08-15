import p0 from './fighter-logo-0.js';
import p1 from './fighter-logo-1.js';
import p2 from './fighter-logo-2.js';
import p3 from './fighter-logo-3.js';
import p4 from './fighter-logo-4.js';
import p5 from './fighter-logo-5.js';

const VERSION='1.0.0';
const src='data:image/webp;base64,'+[p0,p1,p2,p3,p4,p5].join('');
const logo=document.querySelector('#fighterArenaLogo');
if(logo){
  logo.src=src;
  logo.decoding='async';
  logo.draggable=false;
}
window.__fighterArenaLogo={version:VERSION,embedded:true,width:300,height:90};
