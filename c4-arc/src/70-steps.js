/* ===== src/70-steps.js ===== */
/* The step language of execution-guided synthesis.
 *
 * A program here is a SEQUENCE of whole-grid steps, each executed on every
 * demonstration input and on the test input, so after every step the search
 * holds the executed intermediate state S_i = P(x_i) next to the target y_i.
 * The steps are not new transformations: they are the legacy enumerator's
 * primitives (04-enum.js and the hooks registered by 12-16) with their
 * arguments made explicit, so a learned policy can name them. What is new is
 * how they are chosen: from the executed state and the residual to the
 * target, one step at a time (72-policy.js, 73-egsearch.js).
 *
 * A step type has an id, a group, whether it takes a colour argument, and
 * run(g, bg, c) -> grid | null. Terminal "finishers" close the remaining gap
 * with an exact solver instead of a fixed step:
 *   FIN_SKETCH  entity-level synthesis (63-sketch.js) on S_i -> y_i
 * (identity and the colour-map finisher are checked at every state for free,
 * 73-egsearch.js).
 */
var STEPS = (function () {
  var T = [], BY = {};
  function add(name, group, colorArg, run) {
    var t = { id: T.length, name: name, group: group, colorArg: colorArg, run: run };
    T.push(t); BY[name] = t; return t;
  }
  function keepColor(g, c, bg) {
    return g.map(function (row) { return row.map(function (v) { return v === c ? c : bg; }); });
  }
  function paintAll(g, c, bg) {
    return g.map(function (row) { return row.map(function (v) { return v !== bg ? c : bg; }); });
  }
  /* split in two equal halves (a middle separator line is dropped);
     G.subgrid takes INCLUSIVE end indices */
  function halves(g, axis) {
    var H = g.length, W = g[0].length, a, b, n;
    if (axis === "v") {
      if (W < 2) return null;
      n = W % 2 === 0 ? W / 2 : (W - 1) / 2;
      a = G.subgrid(g, 0, 0, H - 1, n - 1); b = G.subgrid(g, 0, W - n, H - 1, W - 1);
    } else {
      if (H < 2) return null;
      n = H % 2 === 0 ? H / 2 : (H - 1) / 2;
      a = G.subgrid(g, 0, 0, n - 1, W - 1); b = G.subgrid(g, H - n, 0, H - 1, W - 1);
    }
    return a && b && a.length && a[0].length ? [a, b] : null;
  }

  /* geometry */
  add("rot90", "geom", false, function (g) { return G.rot90(g); });
  add("rot180", "geom", false, function (g) { return G.rot180(g); });
  add("rot270", "geom", false, function (g) { return G.rot270(g); });
  add("flipH", "geom", false, function (g) { return G.flipH(g); });
  add("flipV", "geom", false, function (g) { return G.flipV(g); });
  add("transpose", "geom", false, function (g) { return G.transpose(g); });
  add("antitranspose", "geom", false, function (g) { return G.antiTranspose(g); });
  /* crops and selections */
  add("crop", "crop", false, function (g, bg) { return G.cropToContent(g, bg); });
  add("crop_c", "crop", true, function (g, bg, c) { return G.cropToContent(g, c); });
  add("trim", "crop", false, function (g) { return G.trimBorder(g, 1); });
  ["top", "bottom", "left", "right"].forEach(function (w) {
    add("half_" + w, "crop", false, function (g) { return G.half(g, w); });
  });
  [0, 1, 2, 3].forEach(function (q) { add("quad" + q, "crop", false, function (g) { return G.quadrant(g, q); }); });
  add("largest8", "select", false, function (g, bg) { return _enExtreme(g, "c8", bg, true); });
  add("smallest8", "select", false, function (g, bg) { return _enExtreme(g, "c8", bg, false); });
  add("largest4", "select", false, function (g, bg) { return _enExtreme(g, "c4", bg, true); });
  add("uniq_shape", "select", false, function (g, bg) { return _enUniq(g, "c8", bg); });
  add("keep_big", "select", false, function (g, bg) { return _enKeepBig(g, bg, true); });
  add("drop_big", "select", false, function (g, bg) { return _enKeepBig(g, bg, false); });
  add("denoise", "select", false, function (g, bg) { return _enDenoise(g, bg); });
  /* compressions */
  add("compress", "compress", false, function (g, bg) { return _enCompress(g, bg); });
  add("dedup", "compress", false, function (g) { return G.dedup(g); });
  add("dedup_r", "compress", false, function (g) { return G.dedupRows(g); });
  add("dedup_c", "compress", false, function (g) { return G.dedupCols(g); });
  add("motif", "compress", false, function (g) { return HOOKS.motif ? HOOKS.motif(g) : null; });
  add("dnx2", "compress", false, function (g) { return G.downscale(g, 2, 2); });
  add("dnx3", "compress", false, function (g) { return G.downscale(g, 3, 3); });
  add("nzx2", "compress", false, function (g, bg) { return G.blockReduceNonbg(g, 2, 2, bg); });
  add("nzx3", "compress", false, function (g, bg) { return G.blockReduceNonbg(g, 3, 3, bg); });
  /* colour edits (colour argument) */
  add("del_c", "color", true, function (g, bg, c) { return c === bg ? null : G.replaceColor(g, c, bg); });
  add("keep_c", "color", true, function (g, bg, c) { return c === bg ? null : keepColor(g, c, bg); });
  add("paint_c", "color", true, function (g, bg, c) { return c === bg ? null : paintAll(g, c, bg); });
  add("fill_c", "color", true, function (g, bg, c) { return G.fillHoles(g, c, bg); });
  add("halo_c", "draw", true, function (g, bg, c) { return HOOKS.halo ? HOOKS.halo(g, bg, c, false, false) : null; });
  add("rect_c", "draw", true, function (g, bg, c) { return HOOKS.markedRect ? HOOKS.markedRect(g, bg, c, false) : null; });
  /* drawing / repair */
  add("outline", "draw", false, function (g, bg) { return HOOKS.halo ? HOOKS.halo(g, bg, null, false, false) : null; });
  add("connect", "draw", false, function (g, bg) { return HOOKS.connect ? HOOKS.connect(g, bg, null, false) : null; });
  add("bbox_fill", "draw", false, function (g, bg) { return _enBboxFill(g, bg); });
  add("sym_repair", "draw", false, function (g, bg) { return HOOKS.repair ? HOOKS.repair(g, bg, true) : null; });
  add("sym_complete", "draw", false, function (g, bg) { return HOOKS.repairBounded ? HOOKS.repairBounded(g, bg, false, 0.0, 2, 0) : null; });
  add("frame_in", "crop", false, function (g, bg) { return HOOKS.frameInterior ? HOOKS.frameInterior(g, bg, "largest") : null; });
  add("frame_all", "crop", false, function (g, bg) { return HOOKS.frameContent ? HOOKS.frameContent(g, bg, "largest") : null; });
  /* scaling and tiling */
  add("upx2", "scale", false, function (g) { return G.upscale(g, 2, 2); });
  add("upx3", "scale", false, function (g) { return G.upscale(g, 3, 3); });
  add("tile2", "scale", false, function (g) { return G.tile(g, 2, 2); });
  add("tile_h", "scale", false, function (g) { return G.hconcat(g, g); });
  add("tile_v", "scale", false, function (g) { return G.vconcat(g, g); });
  add("mirror_h", "scale", false, function (g) { return G.hconcat(g, G.flipH(g)); });
  add("mirror_v", "scale", false, function (g) { return G.vconcat(g, G.flipV(g)); });
  add("mirror_4", "scale", false, function (g) { var t = G.hconcat(g, G.flipH(g)); return G.vconcat(t, G.flipV(t)); });
  add("pad1", "scale", false, function (g, bg) { return G.pad(g, 1, bg); });
  /* motion */
  ["down", "up", "left", "right"].forEach(function (d) {
    add("grav_" + d, "move", false, function (g, bg) { return G.gravity(g, bg, d); });
  });
  [[0, 1, "r"], [0, -1, "l"], [1, 0, "d"], [-1, 0, "u"]].forEach(function (s) {
    add("shift_" + s[2], "move", false, function (g, bg) { return G.translate(g, s[0], s[1], bg); });
    add("wrap_" + s[2], "move", false, function (g) { return G.wrapTranslate(g, s[0], s[1]); });
  });
  add("sortrows", "move", false, function (g) { return sortGridRows(g); });
  add("sortcols", "move", false, function (g) { return G.transpose(sortGridRows(G.transpose(g))); });
  /* split in halves and combine (panel logic) */
  ["v", "h"].forEach(function (ax) {
    ["and", "or", "xor", "diff"].forEach(function (op) {
      add("halves_" + op + "_" + ax, "combine", false, function (g, bg) {
        var p = halves(g, ax); return p ? _logOp(p[0], p[1], op, bg) : null;
      });
    });
  });
  /* finishers: an exact solver closes the remaining gap */
  var FIN_SKETCH = add("FIN_SKETCH", "finish", false, null);

  var NAMES = T.map(function (t) { return t.name; });
  var COLOR_TYPES = T.filter(function (t) { return t.colorArg; }).map(function (t) { return t.id; });
  /* execute one step on a grid; null when invalid or oversized */
  function apply(t, g, bg, c) {
    var r;
    try { r = t.run(g, bg, c); } catch (e) { return null; }
    if (!r || !r.length || !r[0] || !r[0].length || r.length > 30 || r[0].length > 30 || !G.valid(r)) return null;
    return r;
  }
  return { TYPES: T, BY: BY, NAMES: NAMES, COLOR_TYPES: COLOR_TYPES, FIN_SKETCH: FIN_SKETCH.id, apply: apply, N: T.length };
})();
