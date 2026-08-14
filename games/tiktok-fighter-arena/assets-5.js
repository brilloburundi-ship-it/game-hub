const urls=[0,1,2,3].map(i=>`./assets/huntress.b64.${i}?v=1.0.6`);
const parts=await Promise.all(urls.map(async u=>{const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(`Huntress payload ${r.status}`);return (await r.text()).trim();}));
const b64=parts.join('');
if(b64.length!==11440||!b64.startsWith('UklGR'))throw new Error(`Huntress payload invalid (${b64.length})`);
export const A5={"./assets/huntress.webp":`data:image/webp;base64,${b64}`,"./assets/street_mon.webp":"./assets/street_mon.webp"};
