/*
 * Photosheet shared namespace.
 *
 * Loaded before every other script. The app runs from file:///android_asset
 * inside a WebView, where Chromium refuses ES modules over file:// (CORS), so
 * modules are plain classic scripts that hang their public surface off `PS`.
 */
window.PS = window.PS || {};

(function (PS) {
  "use strict";

  /*
   * The native bridge only exists inside the APK. In a plain browser (the
   * preview server used for development) it is absent, so every caller must go
   * through these helpers rather than touching window.PPSBridge directly.
   */
  PS.bridge = {
    available: function () {
      return typeof window.PPSBridge !== 'undefined' && window.PPSBridge !== null;
    },
    /** Returns the bridge, or null when running outside the APK. */
    get: function () {
      return PS.bridge.available() ? window.PPSBridge : null;
    },
    /** True when a native method is present, so callers can degrade per feature. */
    has: function (method) {
      var b = PS.bridge.get();
      return !!(b && typeof b[method] === 'function');
    }
  };

  /** Downloads a blob. Browser fallback for the native save/print methods. */
  PS.downloadBlob = function (blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke late: Safari/WebView can still be reading the blob synchronously.
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };

  /** Decodes a base64 payload into raw bytes. */
  PS.base64ToBytes = function (b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  /** Strips the `data:<mime>;base64,` prefix from a data URL. */
  PS.stripDataUrl = function (dataUrl) {
    var comma = dataUrl.indexOf(',');
    return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  };

  /** Loads a data URL / object URL into a decoded HTMLImageElement. */
  PS.loadImage = function (src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('image decode failed')); };
      im.src = src;
    });
  };

  PS.clamp = function (n, lo, hi) {
    return n < lo ? lo : (n > hi ? hi : n);
  };
}(window.PS));
