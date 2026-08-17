(() => {
  'use strict';

  const ROSTER = {
    GER_bf109:{faction:'axis',country:'GER',role:'fighter',bounds:[30,35,41,35],speed:178,turn:2.45,hp:95,damage:15,fireRate:.30,radius:23,render:116},
    GER_FW190:{faction:'axis',country:'GER',role:'fighter',bounds:[30,34,41,36],speed:176,turn:2.30,hp:105,damage:16,fireRate:.29,radius:24,render:118},
    GER_bf110:{faction:'axis',country:'GER',role:'interceptor',bounds:[22,29,57,44],speed:160,turn:1.72,hp:145,damage:18,fireRate:.34,radius:28,render:132},
    GER_Ju87:{faction:'axis',country:'GER',role:'attacker',bounds:[24,30,53,43],speed:135,turn:1.45,hp:150,damage:18,fireRate:.38,radius:30,render:138},
    GER_He111:{faction:'axis',country:'GER',role:'bomber',bounds:[17,27,67,51],speed:112,turn:.82,hp:320,damage:14,fireRate:.45,radius:40,render:158},

    JAP_a6m:{faction:'axis',country:'JAP',role:'fighter',bounds:[29,37,43,34],speed:180,turn:2.65,hp:82,damage:14,fireRate:.28,radius:22,render:114},
    JAP_Ki61:{faction:'axis',country:'JAP',role:'fighter',bounds:[29,35,43,35],speed:174,turn:2.35,hp:96,damage:15,fireRate:.30,radius:23,render:116},
    JAP_Ki45:{faction:'axis',country:'JAP',role:'interceptor',bounds:[21,32,59,45],speed:158,turn:1.75,hp:140,damage:18,fireRate:.35,radius:28,render:132},
    JAP_Ki51:{faction:'axis',country:'JAP',role:'attacker',bounds:[25,35,51,39],speed:140,turn:1.60,hp:135,damage:17,fireRate:.37,radius:29,render:136},
    JAP_Ki21:{faction:'axis',country:'JAP',role:'bomber',bounds:[15,29,71,54],speed:108,turn:.78,hp:300,damage:14,fireRate:.46,radius:41,render:160},

    UK_Spitfire:{faction:'allies',country:'UK',role:'fighter',bounds:[29,34,43,38],speed:180,turn:2.60,hp:90,damage:15,fireRate:.28,radius:22,render:114},
    UK_typhoon:{faction:'allies',country:'UK',role:'fighter',bounds:[27,35,47,37],speed:176,turn:2.25,hp:108,damage:17,fireRate:.30,radius:24,render:120},
    UK_Beaufighter:{faction:'allies',country:'UK',role:'interceptor',bounds:[21,35,59,42],speed:160,turn:1.75,hp:150,damage:19,fireRate:.34,radius:29,render:134},
    UK_Blenheim:{faction:'allies',country:'UK',role:'attacker',bounds:[21,31,59,49],speed:145,turn:1.45,hp:165,damage:17,fireRate:.38,radius:31,render:140},
    UK_Lancaster:{faction:'allies',country:'UK',role:'bomber',bounds:[2,19,97,72],speed:105,turn:.68,hp:390,damage:15,fireRate:.48,radius:46,render:176},
    UK_Veligton:{faction:'allies',country:'UK',role:'bomber',bounds:[13,24,75,62],speed:108,turn:.72,hp:350,damage:15,fireRate:.46,radius:44,render:168},

    USSR_La5:{faction:'allies',country:'USSR',role:'fighter',bounds:[29,33,43,39],speed:176,turn:2.45,hp:98,damage:15,fireRate:.29,radius:23,render:116},
    USSR_Lagg3:{faction:'allies',country:'USSR',role:'fighter',bounds:[30,35,41,35],speed:165,turn:2.20,hp:100,damage:14,fireRate:.31,radius:23,render:116},
    USSR_Il2:{faction:'allies',country:'USSR',role:'attacker',bounds:[24,32,53,43],speed:145,turn:1.65,hp:175,damage:20,fireRate:.36,radius:31,render:140},
    USSR_Pe3:{faction:'allies',country:'USSR',role:'interceptor',bounds:[21,30,59,45],speed:158,turn:1.78,hp:145,damage:18,fireRate:.34,radius:28,render:132},
    USSR_Tu2:{faction:'allies',country:'USSR',role:'bomber',bounds:[17,29,67,51],speed:125,turn:1.00,hp:270,damage:17,fireRate:.42,radius:38,render:154},

    US_p40:{faction:'allies',country:'US',role:'fighter',bounds:[30,33,41,37],speed:166,turn:2.18,hp:100,damage:14,fireRate:.31,radius:23,render:116},
    US_p47:{faction:'allies',country:'US',role:'fighter',bounds:[23,32,55,42],speed:174,turn:2.15,hp:120,damage:17,fireRate:.30,radius:25,render:120},
    US_p51:{faction:'allies',country:'US',role:'fighter',bounds:[30,33,41,40],speed:184,turn:2.50,hp:95,damage:16,fireRate:.27,radius:23,render:116},
    US_p38:{faction:'allies',country:'US',role:'interceptor',bounds:[24,33,53,38],speed:180,turn:1.95,hp:135,damage:18,fireRate:.32,radius:27,render:130},
    US_a26:{faction:'allies',country:'US',role:'attacker',bounds:[14,24,73,53],speed:160,turn:1.45,hp:185,damage:20,fireRate:.36,radius:32,render:142},
    US_b17:{faction:'allies',country:'US',role:'bomber',bounds:[1,18,99,73],speed:105,turn:.65,hp:430,damage:16,fireRate:.50,radius:48,render:182}
  };

  const PHYSICAL = new Set([
    'GER_bf109','GER_FW190','GER_bf110','GER_Ju87','GER_He111',
    'JAP_a6m','JAP_Ki61','JAP_Ki45','JAP_Ki51','JAP_Ki21',
    'UK_Spitfire','UK_Beaufighter','UK_Blenheim','UK_Lancaster','UK_Veligton',
    'USSR_La5','USSR_Lagg3','USSR_Il2',
    'US_p40','US_p47','US_p51'
  ]);

  const embedded = window.SKY_EMBEDDED_AIRCRAFT || {};
  const images = {};
  const objectUrls = [];
  const failures = [];
  let loaded = 0;
  const total = Object.keys(ROSTER).length;

  const setBadge = text => {
    const el = document.getElementById('assetBadge');
    if (el) el.textContent = text;
  };

  const blobUrlFromBase64 = b64 => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], {type:'image/png'}));
    objectUrls.push(url);
    return url;
  };

  const loadOne = id => new Promise(resolve => {
    const img = new Image();
    images[id] = img;
    img.onload = () => {
      loaded++;
      setBadge(`AIRCRAFT ${loaded}/${total}`);
      resolve(true);
    };
    img.onerror = () => {
      failures.push(id);
      setBadge(`AIR ERROR ${id}`);
      resolve(false);
    };
    if (PHYSICAL.has(id)) img.src = `./assets/${id}.png?v=016`;
    else if (embedded[id]) img.src = blobUrlFromBase64(embedded[id]);
    else {
      failures.push(id);
      resolve(false);
    }
  });

  const ready = Promise.all(Object.keys(ROSTER).map(loadOne)).then(() => {
    if (!failures.length) {
      setBadge(`AIRCRAFT ${total}/${total}`);
      setTimeout(() => setBadge('27 AIRCRAFT'), 1300);
    }
    return failures.length === 0;
  });

  const byFaction = faction => Object.keys(ROSTER).filter(id => ROSTER[id].faction === faction);
  const byRole = (faction, roles) => {
    const wanted = Array.isArray(roles) ? roles : [roles];
    return Object.keys(ROSTER).filter(id => ROSTER[id].faction === faction && wanted.includes(ROSTER[id].role));
  };

  window.SKY_AIRCRAFT = {
    roster: ROSTER,
    images,
    ready,
    failures,
    byFaction,
    byRole,
    get: id => ROSTER[id],
    image: id => images[id]
  };
})();
