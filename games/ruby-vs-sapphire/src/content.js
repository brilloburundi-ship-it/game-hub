(() => {
  const B = 1.15;
  const blocks = [];
  const V = (x,y,z,m='plank',r=null,phase=2) => ({x,y,z,m,r:r||materialResource(m),phase});
  function materialResource(m){
    if(['stone','brick','cobble','darkStone'].includes(m)) return 'stone';
    if(['iron','metal'].includes(m)) return 'iron';
    return 'wood';
  }
  function addBox(out,w,d,h,wall='plank',floor='plank',door=true){
    const ox=(w-1)/2, oz=(d-1)/2;
    for(let x=0;x<w;x++) for(let z=0;z<d;z++) out.push(V(x-ox,0,z-oz,floor,null,0));
    for(let y=1;y<=h;y++) for(let x=0;x<w;x++) for(let z=0;z<d;z++){
      const edge=x===0||z===0||x===w-1||z===d-1;
      if(!edge) continue;
      if(door && z===0 && x===Math.floor(w/2) && y<=2) continue;
      if(y===2 && ((x===0||x===w-1)&&z===Math.floor(d/2))) continue;
      out.push(V(x-ox,y,z-oz,wall,null,1));
    }
  }
  function roofFlat(out,w,d,y,m='roof'){
    const ox=(w-1)/2, oz=(d-1)/2;
    for(let x=-1;x<=w;x++) for(let z=-1;z<=d;z++) out.push(V(x-ox,y,z-oz,m,null,2));
  }
  function roofGable(out,w,d,y,m='roof'){
    const ox=(w-1)/2, oz=(d-1)/2;
    for(let z=0;z<d;z++){
      for(let x=0;x<w;x++){
        const edgeDist=Math.min(x,w-1-x);
        const ry=y+Math.min(2,edgeDist);
        if(x===0||x===w-1||edgeDist<=1) out.push(V(x-ox,ry,z-oz,m,null,2));
      }
    }
  }
  function chimney(out,x,y,z){ out.push(V(x,y,z,'brick','stone',3),V(x,y+1,z,'brick','stone',3)); }
  function windows(out, pts){ for(const p of pts) out.push(V(p[0],p[1],p[2],'glass','wood',3)); }
  function fenceRect(out,w,d,y=1,m='wood'){
    const ox=(w-1)/2, oz=(d-1)/2;
    for(let x=0;x<w;x++){ out.push(V(x-ox,y,-oz,m,'wood',3)); out.push(V(x-ox,y,oz,m,'wood',3)); }
    for(let z=1;z<d-1;z++){ out.push(V(-ox,y,z-oz,m,'wood',3)); out.push(V(ox,y,z-oz,m,'wood',3)); }
  }
  function tower(out,x,z,height=5){
    for(let y=0;y<=height;y++) for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
      if(y===0 || dx===-1||dx===1||dz===-1||dz===1) out.push(V(x+dx,y,z+dz,'stone','stone',y===0?0:1));
    }
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) if(Math.abs(dx)+Math.abs(dz)!==0) out.push(V(x+dx,height+1,z+dz,'darkStone','stone',3));
  }

  function townHallA(){ const o=[]; addBox(o,7,6,4,'plank','cobble'); roofGable(o,7,6,5,'roof');
    // bell tower
    for(let y=5;y<=8;y++) for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++) if(x===-1||x===1||z===-1||z===1) o.push(V(x,y,z,'plank','wood',2));
    o.push(V(0,7,0,'bell','iron',3)); roofFlat(o,3,3,9,'roof'); windows(o,[[-3,2,1],[3,2,1],[-2,2,2],[2,2,2]]); return o; }
  function townHallB(){ const o=[]; addBox(o,8,5,4,'plank','cobble'); roofFlat(o,8,5,5,'roof');
    for(let y=5;y<=7;y++)for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)if(x===-1||x===1||z===-1||z===1)o.push(V(x,y,z,'stone','stone',2));
    roofGable(o,3,3,8,'roof'); chimney(o,3,5,1); return o; }
  function cottageA(){const o=[];addBox(o,4,4,2,'plank','plank');roofGable(o,4,4,3);chimney(o,1.5,3,1);return o;}
  function cottageB(){const o=[];addBox(o,5,3,2,'plank','cobble');roofGable(o,5,3,3,'thatch');return o;}
  function houseA(){const o=[];addBox(o,5,5,3,'plank','cobble');roofGable(o,5,5,4);chimney(o,2,4,1);return o;}
  function houseB(){const o=[];addBox(o,6,4,3,'plank','cobble');roofFlat(o,6,4,4,'roof');for(let x=-2;x<=2;x++)o.push(V(x,5,0,'roof','wood',3));return o;}
  function granary(){const o=[];addBox(o,5,4,4,'plank','cobble');roofGable(o,5,4,5,'thatch');for(let x=-2;x<=2;x+=2)o.push(V(x,-1.0,-1.4,'wood','wood',0));return o;}
  function farmA(){const o=[];for(let x=-4;x<=4;x++)for(let z=-3;z<=3;z++)o.push(V(x,0,z,'farm','wood',0));for(let x=-3;x<=3;x+=2)for(let z=-2;z<=2;z+=2)o.push(V(x,1,z,'crop','wood',3));fenceRect(o,9,7,1,'wood');return o;}
  function farmB(){const o=[];for(let x=-5;x<=5;x++)for(let z=-2;z<=2;z++)o.push(V(x,0,z,'farm','wood',0));for(let x=-4;x<=4;x+=2)for(let z=-1;z<=1;z+=2)o.push(V(x,1,z,'crop','wood',3));return o;}
  function lumberCamp(){const o=[];addBox(o,4,3,2,'plank','plank');roofGable(o,4,3,3,'thatch');for(let i=0;i<7;i++)o.push(V(3+(i%2),0,Math.floor(i/2)-1,'log','wood',3));return o;}
  function quarry(){const o=[];for(let x=-4;x<=4;x++)for(let z=-3;z<=3;z++)if((x+z)%3===0)o.push(V(x,0,z,'cobble','stone',0));for(let y=0;y<3;y++)o.push(V(-4,y,0,'wood','wood',2),V(4,y,0,'wood','wood',2));return o;}
  function mine(){const o=[];for(let x=-2;x<=2;x++)for(let y=0;y<4;y++)if(x===-2||x===2||y===3)o.push(V(x,y,0,'log','wood',1));for(let z=1;z<=5;z++){o.push(V(-2,0,z,'rail','iron',3),V(2,0,z,'rail','iron',3));}return o;}
  function windmill(){const o=[];addBox(o,4,4,5,'stone','cobble');roofGable(o,4,4,6,'roof');o.push(V(0,4,-2.2,'wood','wood',3));for(let i=-3;i<=3;i++) if(i!==0){o.push(V(i,4,-2.35,'plank','wood',3));o.push(V(0,4+i,-2.35,'plank','wood',3));}return o;}
  function blacksmith(){const o=[];addBox(o,5,4,3,'stone','cobble');roofGable(o,5,4,4,'roof');chimney(o,1.5,4,1);o.push(V(-1,1,-2.5,'anvil','iron',3));return o;}
  function market(){const o=[];for(let x=-4;x<=4;x++)for(let z=-3;z<=3;z++)o.push(V(x,0,z,'cobble','stone',0));for(let x=-3;x<=3;x+=3)for(let z=-2;z<=2;z+=4){o.push(V(x,1,z,'wood','wood',1),V(x,2,z,'cloth','wood',3));}return o;}
  function barracks(){const o=[];addBox(o,7,5,3,'stone','cobble');roofGable(o,7,5,4,'roof');for(let x=-2;x<=2;x+=2)o.push(V(x,1,-3,'weaponRack','iron',3));return o;}
  function archeryRange(){const o=[];for(let x=-5;x<=5;x++)for(let z=-3;z<=3;z++)if(Math.abs(z)===3)o.push(V(x,0,z,'fence','wood',0));for(let x=-4;x<=4;x+=4)o.push(V(x,1,3,'target','wood',3));return o;}
  function stable(){const o=[];addBox(o,6,4,2,'plank','cobble');roofGable(o,6,4,3,'thatch');fenceRect(o,8,6,1,'wood');return o;}
  function dock(){const o=[];for(let z=0;z<9;z++)for(let x=-2;x<=2;x++)o.push(V(x,0,z,'plank','wood',0));for(let z=0;z<9;z+=2){o.push(V(-2, -1,z,'log','wood',0),V(2,-1,z,'log','wood',0));}return o;}
  function shipyard(){const o=dock();for(let y=1;y<=3;y++){o.push(V(-3,y,1,'log','wood',1),V(3,y,1,'log','wood',1));}for(let x=-3;x<=3;x++)o.push(V(x,4,1,'plank','wood',2));return o;}

  function siegeWorkshop(){const o=[];addBox(o,7,5,3,'stone','cobble');roofGable(o,7,5,4,'roof');for(let x=-3;x<=3;x+=3){o.push(V(x,1,-3,'log','wood',3),V(x,2,-3,'metal','iron',3));}for(let z=-1;z<=1;z++)o.push(V(0,1,z,'wood','wood',3));return o;}
  function watchTower(){const o=[];tower(o,0,0,6);return o;}
  function wallSegment(){const o=[];for(let x=-5;x<=5;x++)for(let y=0;y<4;y++)o.push(V(x,y,0,y===3?'darkStone':'stone','stone',y===0?0:1));for(let x=-5;x<=5;x+=2)o.push(V(x,4,0,'darkStone','stone',3));return o;}
  function gatehouse(){const o=[];for(let x=-5;x<=5;x++)for(let y=0;y<5;y++){const gate=Math.abs(x)<=1&&y<=3;if(!gate)o.push(V(x,y,0,'stone','stone',y===0?0:1));}tower(o,-5,0,6);tower(o,5,0,6);for(let x=-1;x<=1;x++)for(let y=0;y<=3;y++)o.push(V(x,y,.25,'gate','wood',3));return o;}
  function keep(){const o=[];addBox(o,9,8,6,'stone','cobble');for(const [x,z] of [[-4,-3.5],[4,-3.5],[-4,3.5],[4,3.5]])tower(o,x,z,7);roofFlat(o,9,8,7,'darkStone');return o;}
  function portWarehouse(){const o=[];addBox(o,6,5,3,'plank','cobble');roofGable(o,6,5,4,'roof');for(let i=-2;i<=2;i+=2)o.push(V(i,1,-3,'crate','wood',3));return o;}

  window.RVS_CONTENT = {
    buildBlock: B,
    stages:['Camp','Hamlet','Village','Town','Walled Town','Castle City'],
    buildings:{
      TownHall:{label:'Town Hall',era:1,zone:'civic',priority:100,capacity:2,variants:[townHallA,townHallB],requires:[],effects:{tech:1.1}},
      Cottage:{label:'Cottage',era:1,zone:'residential',priority:78,capacity:4,variants:[cottageA,cottageB],requires:['TownHall']},
      Granary:{label:'Granary',era:1,zone:'production',priority:75,capacity:0,variants:[granary],requires:['TownHall'],effects:{foodStorage:1}},
      Farm:{label:'Farm',era:2,zone:'agriculture',priority:74,capacity:0,variants:[farmA,farmB],requires:['TownHall'],effects:{food:1}},
      LumberCamp:{label:'Lumber Camp',era:2,zone:'production',priority:70,capacity:0,variants:[lumberCamp],requires:['TownHall'],effects:{wood:1}},
      Quarry:{label:'Quarry',era:2,zone:'production',priority:68,capacity:0,variants:[quarry],requires:['TownHall'],effects:{stone:1}},
      House:{label:'House',era:2,zone:'residential',priority:72,capacity:7,variants:[houseA,houseB],requires:['TownHall']},
      Windmill:{label:'Windmill',era:2,zone:'agriculture',priority:63,capacity:0,variants:[windmill],requires:['Farm'],effects:{food:1.6}},
      Market:{label:'Market',era:3,zone:'civic',priority:61,capacity:0,variants:[market],requires:['Granary'],effects:{tech:.5}},
      Mine:{label:'Mine',era:3,zone:'production',priority:60,capacity:0,variants:[mine],requires:['Quarry'],effects:{iron:1}},
      Blacksmith:{label:'Blacksmith',era:3,zone:'production',priority:58,capacity:0,variants:[blacksmith],requires:['Mine'],effects:{weapons:1,tech:.8}},
      Barracks:{label:'Barracks',era:4,zone:'military',priority:53,capacity:0,variants:[barracks],requires:['Blacksmith']},
      ArcheryRange:{label:'Archery Range',era:4,zone:'military',priority:52,capacity:0,variants:[archeryRange],requires:['Barracks']},
      Stable:{label:'Stable',era:4,zone:'military',priority:49,capacity:0,variants:[stable],requires:['Barracks']},
      Dock:{label:'Dock',era:3,zone:'coast',priority:48,capacity:0,variants:[dock],requires:['TownHall'],coastal:true,effects:{food:.5}},
      PortWarehouse:{label:'Port Warehouse',era:3,zone:'coast',priority:47,capacity:0,variants:[portWarehouse],requires:['Dock'],coastal:true},
      Shipyard:{label:'Shipyard',era:4,zone:'coast',priority:42,capacity:0,variants:[shipyard],requires:['Dock','Blacksmith'],coastal:true},
      SiegeWorkshop:{label:'Siege Workshop',era:5,zone:'military',priority:41,capacity:0,variants:[siegeWorkshop],requires:['Barracks','Blacksmith']},
      WatchTower:{label:'Watch Tower',era:4,zone:'defense',priority:39,capacity:0,variants:[watchTower],requires:['Barracks']},
      Wall:{label:'Wall',era:5,zone:'defense',priority:35,capacity:0,variants:[wallSegment],requires:['WatchTower']},
      Gatehouse:{label:'Gatehouse',era:5,zone:'defense',priority:34,capacity:0,variants:[gatehouse],requires:['Wall']},
      Keep:{label:'Castle Keep',era:5,zone:'civic',priority:30,capacity:14,variants:[keep],requires:['Gatehouse','Blacksmith']}
    }
  };
})();
