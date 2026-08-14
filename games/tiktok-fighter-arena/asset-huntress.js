const r=await fetch('./assets/repair4_huntress.b64?v=repair4',{cache:'no-store'});
if(!r.ok)throw new Error(`Huntress repaired payload ${r.status}`);
const b64=(await r.text()).trim();
if(b64.length!==11440||!b64.startsWith('UklGR'))throw new Error(`Huntress repaired payload invalid (${b64.length})`);
export const R4_HUNTRESS={"./assets/huntress.webp":`data:image/webp;base64,${b64}`};
