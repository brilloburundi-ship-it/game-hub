const r=await fetch('./assets/medieval_king.b64?v=1.0.5',{cache:'no-store'});
if(!r.ok)throw new Error(`King payload ${r.status}`);
const b64=(await r.text()).trim();
if(!b64.startsWith('UklGR'))throw new Error('King payload invalid');
export const A8={"./assets/medieval_king.webp":`data:image/webp;base64,${b64}`};
