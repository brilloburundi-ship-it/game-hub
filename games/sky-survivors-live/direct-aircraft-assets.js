(() => {
  'use strict';

  // Physical aircraft files from the user's source pack. No atlas/data URI.
  const files = {
    '0,0':'US_p40.png',
    '1,0':'US_p47.png',
    '2,0':'US_p51.png',
    '3,0':'UK_Spitfire.png',
    '4,0':'USSR_La5.png',
    '0,1':'GER_bf109.png',
    '1,1':'GER_FW190.png',
    '2,1':'JAP_a6m.png',
    '3,1':'JAP_Ki61.png',
    '4,1':'GER_He111.png'
  };
  const bounds = {
    '0,0':[30,33,41,37], '1,0':[23,32,55,42], '2,0':[30,33,41,40],
    '3,0':[29,34,43,38], '4,0':[29,33,43,39],
    '0,1':[30,35,41,35], '1,1':[30,34,41,36], '2,1':[29,37,43,34],
    '3,1':[29,35,43,35], '4,1':[17,27,67,51]
  };

  const images = {};
  let loaded = 0;
  const badge = () => document.getElementById('assetBadge');
  const setBadge = text => { const b=badge(); if (b) b.textContent=text; };

  for (const [key,file] of Object.entries(files)) {
    const img = new Image();
    images[key] = img;
    img.onload = () => { loaded++; setBadge(`AIR FILES ${loaded}/10`); };
    img.onerror = () => setBadge(`AIR FILE ERROR ${file}`);
    img.src = `./assets/${file}?v=013`;
  }

  // game.js only needs one carrier image to flip spriteReady=true. Every actual
  // aircraft draw is replaced below with the corresponding physical PNG.
  window.AIRCRAFT_ATLAS_URL = './assets/US_p51.png?v=013-carrier';

  const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
    if (args.length === 8) {
      const [sx,sy,sw,sh,dx,dy,dw,dh] = args;
      if (sw === 50 && sh === 50 && sx % 50 === 0 && sy % 50 === 0) {
        const key = `${sx/50},${sy/50}`;
        const sprite = images[key];
        const box = bounds[key];
        if (sprite && box && sprite.complete && sprite.naturalWidth > 0) {
          const [bx,by,bw,bh] = box;
          const heavy = key === '4,1';
          const target = heavy ? 235 : 175;
          const ratio = bw / bh;
          const outW = ratio >= 1 ? target : target * ratio;
          const outH = ratio >= 1 ? target / ratio : target;
          this.save();
          this.shadowColor='rgba(0,0,0,.72)';
          this.shadowBlur=12;
          nativeDrawImage.call(this, sprite, bx,by,bw,bh, -outW/2,-outH/2,outW,outH);
          this.restore();
          return;
        }

        // Never allow an invisible plane while a physical PNG is still loading.
        this.save();
        this.fillStyle = sy === 0 ? '#d9f5ff' : '#ff9f7d';
        this.strokeStyle = 'rgba(0,0,0,.75)';
        this.lineWidth = 5;
        this.beginPath();
        this.moveTo(0,-72); this.lineTo(30,48); this.lineTo(0,30); this.lineTo(-30,48); this.closePath();
        this.fill(); this.stroke();
        this.restore();
        return;
      }
    }
    return nativeDrawImage.call(this, image, ...args);
  };
})();