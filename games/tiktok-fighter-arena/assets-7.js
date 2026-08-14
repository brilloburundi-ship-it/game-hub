const urls=[0,1,2,3,4,5].map(i=>`./assets/martial_champion.b64.${i}?v=1.0.6`);
const parts=await Promise.all(urls.map(async u=>{const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(`Champion payload ${r.status}`);return (await r.text()).trim();}));
const b64=parts.join('');
if(b64.length!==15656||!b64.startsWith('UklGR'))throw new Error(`Champion payload invalid (${b64.length})`);
export const A7={"./assets/martial_champion.webp":`data:image/webp;base64,${b64}`};
