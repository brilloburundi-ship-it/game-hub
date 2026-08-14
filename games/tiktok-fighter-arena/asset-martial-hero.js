const r=await fetch('./assets/repair4_martial_hero.b64?v=repair4',{cache:'no-store'});
if(!r.ok)throw new Error(`Crimson Fighter repaired payload ${r.status}`);
const b64=(await r.text()).trim();
if(b64.length!==13440||!b64.startsWith('UklGR'))throw new Error(`Crimson Fighter repaired payload invalid (${b64.length})`);
export const R4_MARTIAL_HERO={"./assets/martial_hero.webp":`data:image/webp;base64,${b64}`};
