const RELEASE='1.4.0-r18c';
const base=new URL('./',location.href);
const abs=p=>new URL(p,base).href;
const core=abs(`core-r18.js?v=${RELEASE}`);
const arena=abs(`arena-hd.js?v=${RELEASE}`);
const fx=abs(`asset-effects.js?v=${RELEASE}`);
const read=async path=>{const r=await fetch(abs(path),{cache:'no-store'});if(!r.ok)throw new Error(`Runtime source ${path} ${r.status}`);return r.text()};
const moduleUrl=src=>URL.createObjectURL(new Blob([src],{type:'text/javascript'}));

let combatSrc=await read(`combat-v13.js?v=${RELEASE}`);
combatSrc=combatSrc
 .replace(/from'\.\/core\.js\?v=[^']+'/,`from'${core}'`)
 .replace(/from'\.\/arena-hd\.js\?v=[^']+'/,`from'${arena}'`);
const combat=moduleUrl(combatSrc);

let idleSrc=await read(`idle-wait.js?v=${RELEASE}`);
idleSrc=idleSrc.replace(/from'\.\/core\.js\?v=[^']+'/,`from'${core}'`);
const idle=moduleUrl(idleSrc);

let gameSrc=await read(`game.js?v=${RELEASE}`);
gameSrc=gameSrc
 .replace(/from'\.\/core\.js\?v=[^']+'/,`from'${core}'`)
 .replace(/from'\.\/combat-v13\.js\?v=[^']+'/,`from'${combat}'`)
 .replace(/from'\.\/asset-effects\.js\?v=[^']+'/,`from'${fx}'`)
 .replace("const VERSION='1.3.0';",`const VERSION='${RELEASE}';`)
 .replace(/const MODULES=Array\.from\(\{length:9\},\(_,i\)=>`\.\/assets-\$\{i\}\.js\?v=\$\{VERSION\}[^`]*`\);/,`const MODULES=Array.from({length:9},(_,i)=>new URL(\`./assets-\${i}.js?v=\${VERSION}\`,'${base.href}').href);`)
 .replace(/const mod=await import\(`\.\/\$\{file\}\?v=\$\{VERSION\}[^`]*`\);/,`const mod=await import(new URL(\`./\${file}?v=\${VERSION}\`,'${base.href}').href);`)
 .replace('if(loadedIds.size<2){','if(loadedIds.size<Object.keys(S.manifest.fighters).length){')
 .replace('Fighter retry required · ${loadedIds.size}/${Object.keys(S.manifest.fighters).length} ready','Fighter validation required · ${loadedIds.size}/${Object.keys(S.manifest.fighters).length} ready');

const oldDecoder=gameSrc.match(/async function decodeAtlas\(src,fighters\)\{.*?throw last\|\|Error\(`Asset unavailable: \$\{src\}`\)\}/s);
if(!oldDecoder)throw new Error('R18 decoder patch point not found');
const decoder=`async function decodeAtlas(src,fighters){let last=null;const embedded=ASSETS[key(src)]||ASSETS[src];if(typeof embedded==='string'&&embedded.startsWith('data:image/')){let url=null;try{url=dataUriToBlobUrl(embedded);if(url){const im=await imageFrom(url,\`${'${src}'} R18 embedded\`,11000);if(!atlasFits(im,fighters))throw Error(\`Embedded atlas geometry mismatch ${'${im.naturalWidth}'}x${'${im.naturalHeight}'}\`);HELD_URLS.add(url);return im}}catch(e){last=e;if(url)try{URL.revokeObjectURL(url)}catch{}}}try{const im=await imageFrom(\`${'${key(src)}'}?v=${RELEASE}\`,\`${'${src}'} direct\`,6500);if(atlasFits(im,fighters))return im;last=Error(\`Direct atlas geometry mismatch ${'${src}'}\`)}catch(e){last=e}throw last||Error(\`Asset unavailable: ${'${src}'}\`)}`;
gameSrc=gameSrc.replace(oldDecoder[0],decoder);
const game=moduleUrl(gameSrc);

window.__fighterArenaRelease=RELEASE;
try{await Promise.all([import(idle),import(game)])}
finally{setTimeout(()=>{URL.revokeObjectURL(idle);URL.revokeObjectURL(game);URL.revokeObjectURL(combat)},30000)}
