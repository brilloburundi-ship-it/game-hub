(() => {
  'use strict';

  // The runtime atlas is 250x100: 5 columns x 2 rows, 50x50 per cell.
  // Each original aircraft occupies only the opaque central part of its cell.
  // Crop to that real silhouette and render it large enough to remain readable
  // after the 1080x1920 canvas is scaled down to a phone viewport.
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
    if (image && image.width === 250 && image.height === 100 && args.length === 8) {
      const [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      if (sw === 50 && sh === 50 && sx % 50 === 0 && sy % 50 === 0) {
        const key = `${sx / 50},${sy / 50}`;
        const crop = bounds[key];
        if (crop) {
          const [bx, by, bw, bh] = crop;
          const cx = dx + dw / 2;
          const cy = dy + dh / 2;
          const target = Math.max(Math.abs(dw), Math.abs(dh)) * 1.70;
          const ratio = bw / bh;
          const outW = ratio >= 1 ? target : target * ratio;
          const outH = ratio >= 1 ? target / ratio : target;

          // Soft contrast shadow behind the real transparent aircraft sprite.
          this.save();
          this.shadowColor = 'rgba(0,0,0,.78)';
          this.shadowBlur = 10;
          originalDrawImage.call(
            this,
            image,
            sx + bx, sy + by, bw, bh,
            cx - outW / 2, cy - outH / 2, outW, outH
          );
          this.restore();
          return;
        }
      }
    }
    return originalDrawImage.call(this, image, ...args);
  };
})();
