let payload=null;
try{
  const r=await fetch('./assets/martial_hero.b64?v=1.0.7',{cache:'no-store'});
  if(r.ok){
    const b64=(await r.text()).trim();
    if(b64.length>=16&&b64.length%4===0&&b64.startsWith('UklGR'))payload=`data:image/webp;base64,${b64}`;
  }
}catch(e){console.warn('[Fighter Arena] Martial Hero payload unavailable',e)}
export const A6=payload?{"./assets/martial_hero.webp":payload}:{};
