/*
 * Photo + paper size model and the sheet grid solver.
 *
 * Replaces what used to be hardcoded constants (COLS=5, ROWS=6, OUT_W=1920,
 * A4 210x297, grid offsets 9.5+col*39 / 3.5+row*49). One `solve()` result feeds
 * all three consumers -- the CSS sheet, the slot grid, and the PDF writer -- so
 * preview and print can never disagree about geometry.
 *
 * The defaults (A4, 35x45mm, margin 3mm, gap 4mm) reproduce the original
 * hardcoded layout exactly: 5 cols x 6 rows, origin 9.5mm / 3.5mm.
 */
(function (PS) {
  "use strict";

  var MM_PER_IN = 25.4;

  /* ---------- presets ---------- */

  PS.PHOTO_SIZES = [
    { id: 'p35x45', label: '35 × 45 mm', w: 35, h: 45, note: 'India, EU, UK, AU passport' },
    { id: 'p51x51', label: '2 × 2 in', w: 50.8, h: 50.8, note: 'US passport & visa' },
    { id: 'p35x35', label: '35 × 35 mm', w: 35, h: 35, note: 'PAN card, some visas' },
    { id: 'p33x48', label: '33 × 48 mm', w: 33, h: 48, note: 'China visa' },
    { id: 'p25x35', label: '25 × 35 mm', w: 25, h: 35, note: 'Stamp size' },
    { id: 'p45x35', label: '45 × 35 mm', w: 45, h: 35, note: 'Landscape ID' },
    { id: 'p50x70', label: '50 × 70 mm', w: 50, h: 70, note: 'Large ID / CV photo' },
    { id: 'custom', label: 'Custom…', w: 35, h: 45, custom: true }
  ];

  PS.PAPER_SIZES = [
    { id: 'a4', label: 'A4', w: 210, h: 297, note: '210 × 297 mm' },
    { id: 'a5', label: 'A5', w: 148, h: 210, note: '148 × 210 mm' },
    { id: 'in4x6', label: '4 × 6 in', w: 101.6, h: 152.4, note: 'Photo paper' },
    { id: 'in5x7', label: '5 × 7 in', w: 127, h: 177.8, note: 'Photo paper' },
    { id: 'letter', label: 'Letter', w: 215.9, h: 279.4, note: '8.5 × 11 in' }
  ];

  /*
   * Export resolution. `max` keeps the original 1920px-wide export (~1390 DPI at
   * 35mm) which is what the app has always produced; the DPI options exist for
   * users who want a smaller PDF and are printing at a known device resolution.
   */
  PS.DPI_MODES = [
    { id: 'max', label: 'Maximum', widthPx: 1920, note: 'Sharpest, largest file' },
    { id: 'd600', label: '600 DPI', dpi: 600, note: 'Photo-lab quality' },
    { id: 'd300', label: '300 DPI', dpi: 300, note: 'Standard print, smallest file' }
  ];

  /* ---------- state ---------- */

  var state = {
    photoId: 'p35x45',
    paperId: 'a4',
    portrait: true,
    marginMM: 3,
    gapMM: 4,
    dpiMode: 'max',
    autoRotate: false,     /* rotate photos 90° on the sheet if it fits more */
    customW: 35,
    customH: 45
  };

  var listeners = [];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  /* ---------- queries ---------- */

  /** Current photo size in mm. Honours the custom entry's editable dimensions. */
  function photo() {
    var p = byId(PS.PHOTO_SIZES, state.photoId);
    if (p.custom) {
      return { id: p.id, label: fmtMM(state.customW) + ' × ' + fmtMM(state.customH) + ' mm',
               w: state.customW, h: state.customH, note: 'Custom size' };
    }
    return p;
  }

  /** Current paper size in mm, with orientation applied. */
  function paper() {
    var p = byId(PS.PAPER_SIZES, state.paperId);
    return state.portrait
      ? { id: p.id, label: p.label, w: p.w, h: p.h }
      : { id: p.id, label: p.label + ' landscape', w: p.h, h: p.w };
  }

  function fmtMM(n) {
    return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  }

  /* ---------- the solver ---------- */

  /*
   * How many boxW x boxH boxes fit inside pw x ph, given an outer margin and an
   * inter-photo gap. The margin is a *minimum*: leftover space is redistributed
   * by centring the block, which is what makes A4/35x45 land on the original
   * 9.5mm / 3.5mm origins.
   */
  function packCount(pw, ph, boxW, boxH, margin, gap) {
    var cols = Math.floor((pw - 2 * margin + gap) / (boxW + gap));
    var rows = Math.floor((ph - 2 * margin + gap) / (boxH + gap));
    return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
  }

  /**
   * Resolves the full sheet geometry. All values are millimetres, with the
   * origin at the paper's top-left (the PDF writer flips Y itself).
   *
   * @returns {{cols:number, rows:number, total:number, boxW:number, boxH:number,
   *            gap:number, originX:number, originY:number, rotated:boolean,
   *            paper:object, photo:object}}
   */
  function solve() {
    var pa = paper(), ph = photo();
    var gap = state.gapMM, margin = state.marginMM;

    var upright = packCount(pa.w, pa.h, ph.w, ph.h, margin, gap);
    var best = { cols: upright.cols, rows: upright.rows, boxW: ph.w, boxH: ph.h, rotated: false };

    if (state.autoRotate) {
      /* Same photo, laid on its side. Sideways on the paper is fine -- the user
         cuts it out and the print itself is still correctly oriented. */
      var turned = packCount(pa.w, pa.h, ph.h, ph.w, margin, gap);
      if (turned.cols * turned.rows > best.cols * best.rows) {
        best = { cols: turned.cols, rows: turned.rows, boxW: ph.h, boxH: ph.w, rotated: true };
      }
    }

    var blockW = best.cols * best.boxW + Math.max(0, best.cols - 1) * gap;
    var blockH = best.rows * best.boxH + Math.max(0, best.rows - 1) * gap;

    return {
      cols: best.cols,
      rows: best.rows,
      total: best.cols * best.rows,
      boxW: best.boxW,
      boxH: best.boxH,
      gap: gap,
      originX: (pa.w - blockW) / 2,
      originY: (pa.h - blockH) / 2,
      rotated: best.rotated,
      paper: pa,
      photo: ph
    };
  }

  /** Top-left corner of one cell, in mm from the paper's top-left. */
  function cellOrigin(g, index) {
    var col = index % g.cols, row = Math.floor(index / g.cols);
    return {
      x: g.originX + col * (g.boxW + g.gap),
      y: g.originY + row * (g.boxH + g.gap)
    };
  }

  /**
   * Pixel dimensions each cropped photo is exported at. Always the *upright*
   * photo -- sheet rotation is applied at placement time, not at export time,
   * so one exported image can serve both orientations.
   */
  function outPx() {
    var ph = photo();
    var mode = byId(PS.DPI_MODES, state.dpiMode);
    var w, h;
    if (mode.widthPx) {
      /* Width-anchored, matching the original export ("1920 px wide"), so the
         default photo size keeps exactly the resolution it always had. */
      w = mode.widthPx;
      h = Math.round(w * ph.h / ph.w);
    } else {
      w = Math.round(ph.w / MM_PER_IN * mode.dpi);
      h = Math.round(ph.h / MM_PER_IN * mode.dpi);
    }
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  /** Aspect ratio (w/h) the crop rectangle is locked to. */
  function ratio() {
    var ph = photo();
    return ph.w / ph.h;
  }

  /** Effective DPI of the current export size, for display purposes. */
  function effectiveDpi() {
    var ph = photo(), px = outPx();
    return Math.round(px.w / (ph.w / MM_PER_IN));
  }

  /* ---------- mutation ---------- */

  /**
   * Applies a partial state patch and notifies listeners.
   * `reason` lets listeners skip expensive work: 'photo' means every stored crop
   * has to be re-derived, 'grid' only reflows the sheet.
   */
  function set(patch) {
    var photoChanged = false, gridChanged = false;
    Object.keys(patch).forEach(function (k) {
      if (!(k in state) || state[k] === patch[k]) return;
      if (k === 'photoId' || k === 'customW' || k === 'customH' || k === 'dpiMode') photoChanged = true;
      else gridChanged = true;
      state[k] = patch[k];
    });
    if (!photoChanged && !gridChanged) return;
    var reason = photoChanged ? 'photo' : 'grid';
    listeners.forEach(function (cb) { cb(reason); });
  }

  function onChange(cb) { listeners.push(cb); }

  /** Human-readable summary for the preview toolbar. */
  function describe() {
    var g = solve();
    return {
      paper: g.paper.label + ': ' + fmtMM(g.paper.w) + ' × ' + fmtMM(g.paper.h) + ' mm',
      grid: g.cols + '×' + g.rows + ' Grid',
      photo: g.photo.label
    };
  }

  PS.layout = {
    state: state,
    photo: photo,
    paper: paper,
    solve: solve,
    cellOrigin: cellOrigin,
    outPx: outPx,
    ratio: ratio,
    effectiveDpi: effectiveDpi,
    set: set,
    onChange: onChange,
    describe: describe,
    fmtMM: fmtMM,
    MM_PER_IN: MM_PER_IN
  };
}(window.PS));
