(() => {
  'use strict';

  // The MVP atlas uses 50x50 cells, but each aircraft occupies only the
  // central portion of its cell. Draw just the opaque aircraft bounds and
  // scale that tight crop to a readable size on a 9:16 phone canvas.
  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  const bounds = {
    '0,0':[15,17,21,19],
    '1,0':[12,16,27,21],
    '2,0':[15,17,21,20],
    '3,0':[15,17,21,19],
    '4,0':[15,17,21,20],
    '0,1':[15,18,21,17],
    '1,1':[15,17,21,18],
    '2,1':[15,19,21,17],
    '3,1':[15,18,21,17],
    '4,1':[9,14,33,25]
  };

  CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
    if (
      image && image.width === 250 && image.height === 100 &&
      args.length === 8
    ) {
      const [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      if (sw === 50 && sh === 50 && sx % 50 === 0 && sy % 50 === 0) {
        const key = `${sx / 50},${sy / 50}`;
        const crop = bounds[key];
        if (crop) {
          const [bx, by, bw, bh] = crop;
          const cx = dx + dw / 2;
          const cy = dy + dh / 2;
          const target = Math.max(Math.abs(dw), Math.abs(dh)) * 1.28;
          const ratio = bw / bh;
          const outW = ratio >= 1 ? target : target * ratio;
          const outH = ratio >= 1 ? target / ratio : target;
          return originalDrawImage.call(
            this,
            image,
            sx + bx, sy + by, bw, bh,
            cx - outW / 2, cy - outH / 2, outW, outH
          );
        }
      }
    }
    return originalDrawImage.call(this, image, ...args);
  };
})();
