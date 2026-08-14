const r=await fetch('./assets/repair4_martial_champion.b64?v=repair4',{cache:'no-store'});
if(!r.ok)throw new Error(`Arena Champion repaired payload ${r.status}`);
const b64=(await r.text()).trim();
if(b64.length!==15656||!b64.startsWith('UklGR'))throw new Error(`Arena Champion repaired payload invalid (${b64.length})`);
export const R4_CHAMPION={"./assets/martial_champion.webp":`data:image/webp;base64,${b64}`};
