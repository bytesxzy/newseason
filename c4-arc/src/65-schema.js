/* ===== src/65-schema.js ===== */
/* Task schema posterior and failure taxonomy (demonstrations only).
 *
 * SCHEMA.of(ctx) is a soft description of the task, computed before any
 * expensive search from the demonstrations alone:
 *   size     same | crop | scale | tile | const | derived | other
 *   palette  preserved | subset | new-colour
 *   change   distribution over keep / recolor / delete / move / copy / create
 *            measured by entity correspondence in the best segmentation
 *   level    pixels | objects | panels (separator lines present)
 * and a posterior over hypothesis families (normalised weights) that the
 * schedule uses to order and size the entity-level branches. It is never a
 * hard classifier: every family still runs; the weights move time.
 *
 * TAXON.reason(ctx, res) names, for a task where no program fits, the most
 * specific reason the demonstrations support, so NO_CANDIDATE splits into
 * actionable counts:
 *   OUTPUT_SHAPE_UNKNOWN          no shape law and no entity has the output's size
 *   SEGMENTATION_FAILURE          every segmentation of the beam is too fragmented
 *   OBJECT_CORRESPONDENCE_FAILURE foreground changed and no correspondence covers it
 *   GENERATIVE_OP_MISSING         created cells no generative operator explains
 *   RELATION_NOT_EXPRESSIBLE      an operator explains them, no predicate/expression selects
 *   CONDITIONAL_REQUIRED          entity fates split into several action classes
 *   CORRECT_STRUCTURE_WRONG_PARAMETERS  a program reproduces all but one demonstration
 *   SIZE_CHANGE_UNEXPLAINED       output size law known, content rule not found
 *   TIMEOUT                       the search did not finish its schedule
 */
var SCHEMA = (function () {
  function sizeRel(ctx) {
    if (ctx.same_shape()) return "same";
    if (ctx.const_out_shape()) return "const";
    var sr = ctx.shape_ratio();
    if (sr) return (sr[0] === 1 && sr[1] === 1) ? "same" : "scale";
    if (ctx.inv_shape_ratio()) return "shrink";
    if (ctx.affine_shape()) return "derived";
    /* crop: output fits inside the input in every pair */
    var crop = ctx.train.every(function (p) { return p[1].length <= p[0].length && p[1][0].length <= p[0][0].length; });
    return crop ? "crop" : "other";
  }
  function paletteRel(ctx) {
    var sub = true, eq = true, t;
    for (t = 0; t < ctx.train.length; t++) {
      var a = G.palette(ctx.train[t][0]), b = G.palette(ctx.train[t][1]);
      if (!G.csSubset(b, a)) sub = false;
      if (a !== b) eq = false;
    }
    return eq ? "preserved" : sub ? "subset" : "new";
  }
  function panels(ctx) {
    /* a full row or column of one non-background colour in every input */
    var bg = ctx.bg();
    return ctx.train.every(function (p) {
      var g = p[0], r, c;
      for (r = 0; r < g.length; r++) { var v = g[r][0]; if (v !== bg && g[r].every(function (x) { return x === v; })) return true; }
      for (c = 0; c < g[0].length; c++) { var w = g[0][c]; if (w !== bg && g.every(function (row) { return row[c] === w; })) return true; }
      return false;
    });
  }
  /* entity change distribution in the segmentation with best coverage */
  function changes(ctx) {
    var bg = ctx.bg(), best = null, si;
    if (!ctx.same_shape()) return null;
    for (si = 0; si < SCN.SEGS.length; si++) {
      var seg = SCN.SEGS[si];
      if (seg === "cell") continue;
      var dist = { keep: 0, recolor: 0, del: 0, moved: 0, mixed: 0, create: 0 }, cov = 0, ok = true, t;
      for (t = 0; t < ctx.train.length; t++) {
        var x = ctx.train[t][0], y = ctx.train[t][1], sc = SCN.of(x, seg, bg);
        if (!sc) { ok = false; break; }
        var f = CORR.fates(sc, y), i;
        for (i = 0; i < f.length; i++) {
          var k = f[i].kind;
          if (k === "same") dist.keep++;
          else if (k === "recolor" || k === "cmap") dist.recolor++;
          else if (k === "vacated") dist.del++;
          else dist.mixed++;
        }
        var r, c;
        for (r = 0; r < x.length; r++) for (c = 0; c < x[0].length; c++) if (x[r][c] === bg && y[r][c] !== bg) dist.create++;
        cov += CORR.coverage(sc, y) || 0;
      }
      if (!ok) continue;
      cov /= ctx.train.length;
      if (!best || cov > best.cov) best = { seg: seg, cov: cov, dist: dist };
    }
    return best;
  }
  function of(ctx) {
    return ctx.memo("schema", function () {
      var s = { size: sizeRel(ctx), palette: paletteRel(ctx), panels: panels(ctx) };
      s.change = changes(ctx);
      /* posterior over the entity-level branches */
      var w = { sketch: 0.1, extract: 0.1 };
      if (s.size === "same") {
        w.sketch = 0.8;
        if (s.change && s.change.dist.create > 0) w.sketch = 0.9;
      } else if (s.size === "crop" || s.size === "shrink" || s.size === "other") w.extract = 0.7;
      s.weights = w;
      return s;
    });
  }
  return { of: of };
})();

var TAXON = (function () {
  function reason(ctx, res) {
    try {
      var s = SCHEMA.of(ctx);
      if (res && res.diagnostics && res.diagnostics.timed_out) return "TIMEOUT";
      if (s.size !== "same") {
        var anySize = s.size !== "other" && s.size !== "crop";
        if (!anySize) {
          /* does some entity (any segmentation) have the output's size? */
          var bg = ctx.bg(), hit = ctx.train.every(function (p) {
            return SCN.SEGS.some(function (seg) {
              var sc = SCN.of(p[0], seg, bg);
              return sc && sc.ents.some(function (e) { return (e.h === p[1].length && e.w === p[1][0].length) || (e.w === p[1].length && e.h === p[1][0].length); });
            });
          });
          if (!hit) return "OUTPUT_SHAPE_UNKNOWN";
        }
        return "SIZE_CHANGE_UNEXPLAINED";
      }
      if (!s.change) return "SEGMENTATION_FAILURE";
      var d = s.change.dist, fg = d.recolor + d.del + d.mixed;
      if (res && res.diagnostics && res.diagnostics.sketch_near) return "CORRECT_STRUCTURE_WRONG_PARAMETERS";
      if (d.create > 0 && fg === 0) {
        var gap = SKETCH.explainGap(ctx);
        return gap && gap.frac >= 0.999 ? "RELATION_NOT_EXPRESSIBLE" : "GENERATIVE_OP_MISSING";
      }
      if (s.change.cov < 0.9) return "OBJECT_CORRESPONDENCE_FAILURE";
      var classes = (d.recolor ? 1 : 0) + (d.del ? 1 : 0) + (d.mixed ? 1 : 0) + (d.create ? 1 : 0);
      if (classes >= 2) return "CONDITIONAL_REQUIRED";
      return "RELATION_NOT_EXPRESSIBLE";
    } catch (e) { return "UNKNOWN"; }
  }
  return { reason: reason };
})();
