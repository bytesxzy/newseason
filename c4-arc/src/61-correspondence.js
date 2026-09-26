/* ===== src/61-correspondence.js ===== */
/* Object correspondence: what became of each input entity in the output.
 *
 * Synthesis over entities needs, for every demonstration, a statement of the
 * form "input entity A went to output region A' by transformation T" before
 * it can ask which RULE produced T. This module states it, per segmentation,
 * without committing: an entity can have several candidate fates (two equal
 * shapes that both moved each have both destinations as candidates) and the
 * rule inducer (63-sketch.js) resolves the ambiguity by intersecting what
 * every entity of every demonstration allows.
 *
 * In place, the output over an entity's cells is one of
 *   same     untouched
 *   vacated  all background (deleted, or moved away)
 *   recolor  one uniform colour c (a recolour, or overwritten by one colour)
 *   cmap     a consistent colour-to-colour map (multicolour recolour)
 *   mixed    anything else (partly overwritten, partly grown over)
 * Elsewhere, placements: offsets (and D4 transforms) where the entity's
 * patch appears in the output on cells the output CHANGED -- a move when the
 * source was vacated, a copy when it stayed. Placements are exact (same
 * colours) or uniform-recoloured (the shape in one colour). One-to-many
 * (copies), many-to-one (merges show as several sources with overlapping
 * placements), deletion and creation (changed cells no entity explains) all
 * fall out of the same record.
 */
var CORR = (function () {
  var MAX_PLACE = 16;

  function inPlace(e, x, y, bg) {
    var same = true, allBg = true, single = -1, map = {}, mapOk = true, i, p, xv, yv;
    for (i = 0; i < e.n; i++) {
      p = e.cells[i]; xv = x[p >> 6][p & 63]; yv = y[p >> 6][p & 63];
      if (yv !== xv) same = false;
      if (yv !== bg) allBg = false;
      if (single === -1) single = yv; else if (single !== yv) single = -2;
      if (map[xv] === undefined) map[xv] = yv; else if (map[xv] !== yv) mapOk = false;
    }
    if (same) return { kind: "same" };
    if (allBg) return { kind: "vacated" };
    if (single >= 0) return { kind: "recolor", c: single };
    if (mapOk) return { kind: "cmap", map: map };
    return { kind: "mixed" };
  }

  /* patch of the entity under D4 transform t (-1 = not a cell) */
  function tpatch(e, t) {
    if (!e._tp) e._tp = [];
    if (!e._tp[t]) e._tp[t] = t === 0 ? e.patch : SCN.tf(e.patch, t);
    return e._tp[t];
  }

  /* Placements of the entity's (transformed) patch in y on changed cells.
     mode "exact": colours equal; "recolor": one uniform non-background colour.
     Returns [{dr, dc, t, c}] with dr/dc the shift of the bbox corner. */
  function placements(e, x, y, bg, mode, t) {
    var key = mode + t, cache = e._pl || (e._pl = new Map());
    var ck = G.ghash(y) + "#" + key;
    if (cache.has(ck)) return cache.get(ck);
    var P = tpatch(e, t), ph = P.length, pw = P[0].length, H = y.length, W = y[0].length;
    var out = [], ar = -1, ac = -1, av = -1, r, c, i, j;
    /* anchor: first cell of the (transformed) patch in reading order */
    for (i = 0; i < ph && ar < 0; i++) for (j = 0; j < pw; j++) if (P[i][j] >= 0) { ar = i; ac = j; av = P[i][j]; break; }
    var over = false;
    for (r = 0; r + ph <= H && !over; r++) for (c = 0; c + pw <= W; c++) {
      var a = y[r + ar][c + ac];
      if (mode === "exact" ? a !== av : a === bg) continue;
      if (t === 0 && r === e.r0 && c === e.c0) continue;
      var ok = true, changed = false, col = a;
      for (i = 0; i < ph && ok; i++) for (j = 0; j < pw; j++) {
        var pv = P[i][j];
        if (pv < 0) continue;
        var yv = y[r + i][c + j];
        if (mode === "exact" ? yv !== pv : yv !== col) { ok = false; break; }
        if (yv !== x[r + i][c + j]) changed = true;
      }
      if (!ok || !changed) continue;
      if (mode === "recolor" && e.ncol === 1 && col === e.color && t === 0) continue;
      out.push({ dr: r - e.r0, dc: c - e.c0, t: t, c: mode === "exact" ? -1 : col });
      if (out.length > MAX_PLACE) { over = true; break; }
    }
    var res = over ? null : out;           /* null = too ambiguous to use */
    cache.set(ck, res);
    return res;
  }

  /* Fate summary of every entity of scene sc against output y. */
  function fates(sc, y) {
    var key = "fates#" + G.ghash(y);
    return sc.memo(key, function () {
      var x = sc.grid, bg = sc.bg, out = [], i;
      if (x.length !== y.length || x[0].length !== y[0].length) return null;
      for (i = 0; i < sc.ents.length; i++) out.push(inPlace(sc.ents[i], x, y, bg));
      return out;
    });
  }

  /* Cells the output changed. */
  function diff(x, y) {
    var out = [], r, c;
    for (r = 0; r < x.length; r++) for (c = 0; c < x[0].length; c++) if (x[r][c] !== y[r][c]) out.push((r << 6) | c);
    return out;
  }

  /* Coverage statistic for Stage-B measurement: the fraction of changed
     cells lying on entities whose in-place fate is determined (same,
     vacated, recolor, cmap) or on a placement of some entity. */
  function coverage(sc, y) {
    var f = fates(sc, y);
    if (!f) return null;
    var x = sc.grid, d = diff(x, y);
    if (!d.length) return 1;
    var covered = new Set(), i, j;
    for (i = 0; i < sc.ents.length; i++) {
      var e = sc.ents[i];
      if (f[i].kind !== "mixed" && f[i].kind !== "same") for (j = 0; j < e.n; j++) covered.add(e.cells[j]);
      if (e.n > 60) continue;
      var pl = placements(e, x, y, sc.bg, "exact", 0) || [];
      for (var k = 0; k < pl.length; k++) for (j = 0; j < e.n; j++) {
        var p = e.cells[j];
        covered.add((((p >> 6) + pl[k].dr) << 6) | ((p & 63) + pl[k].dc));
      }
    }
    var n = 0;
    for (i = 0; i < d.length; i++) if (covered.has(d[i])) n++;
    return n / d.length;
  }

  return { inPlace: inPlace, fates: fates, placements: placements, tpatch: tpatch, diff: diff, coverage: coverage };
})();
