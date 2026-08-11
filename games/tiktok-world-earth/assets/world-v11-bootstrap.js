import { patchWorldV11Source } from './world-v11-patch.js?build=8';
import { patchCivilizationAssetMappings } from './world-asset-fix.js?build=9';

const originalUrl = new URL('./index-V104FantasyRTS.js?build=7', import.meta.url);
const assetBase = new URL('./', originalUrl).href;

async function start(){
  const response=await fetch(originalUrl,{cache:'no-store'});
  if(!response.ok)throw new Error(`Unable to load game bundle (${response.status})`);
  let source=patchWorldV11Source(await response.text(),assetBase);
  source=patchCivilizationAssetMappings(source);
  const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{await import(blobUrl);}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),15000);}
}

start().catch(async error=>{
  console.error('Readable World V11 bootstrap failed',error);
  const label=document.querySelector('#bridge-label');if(label)label.textContent='MAP FALLBACK';
  await import(originalUrl.href);
});
