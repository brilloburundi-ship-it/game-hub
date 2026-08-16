(() => {
  'use strict';

  // Sky Survivors uses a data-URI aircraft atlas. On some WebKit/Safari builds
  // assigning img.src before img.onload is registered can make the runtime
  // miss the ready signal. Defer the native src assignment by one microtask so
  // game.js always has time to install its onload handler first.
  const NativeImage = window.Image;
  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!srcDescriptor?.get || !srcDescriptor?.set) return;

  const defer = window.queueMicrotask
    ? window.queueMicrotask.bind(window)
    : (fn) => Promise.resolve().then(fn);

  function setBadge(text, ok) {
    const badge = document.getElementById('assetBadge');
    if (!badge) return;
    badge.textContent = text;
    badge.dataset.ok = ok ? '1' : '0';
  }

  function DeferredImage(width, height) {
    const img = new NativeImage(width, height);
    let token = 0;

    Object.defineProperty(img, 'src', {
      configurable: true,
      enumerable: true,
      get() {
        return srcDescriptor.get.call(img);
      },
      set(value) {
        const ownToken = ++token;
        img.addEventListener('load', () => {
          setBadge(`AIR ${img.naturalWidth}×${img.naturalHeight}`, true);
        }, { once: true });
        img.addEventListener('error', () => {
          setBadge('AIR ERROR', false);
        }, { once: true });
        defer(() => {
          if (ownToken !== token) return;
          srcDescriptor.set.call(img, value);
        });
      }
    });

    return img;
  }

  DeferredImage.prototype = NativeImage.prototype;
  Object.setPrototypeOf(DeferredImage, NativeImage);
  window.Image = DeferredImage;
  setBadge('AIR LOAD…', false);
})();
