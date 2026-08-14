const r=await fetch('./assets/repair4_medieval_king.b64?v=repair4',{cache:'no-store'});
if(!r.ok)throw new Error(`Battle King repaired payload ${r.status}`);
const b64=(await r.text()).trim();
if(!b64.startsWith('UklGR'))throw new Error('Battle King repaired payload invalid');
export const R4_BATTLE_KING={"./assets/medieval_king.webp":`data:image/webp;base64,${b64}`};
