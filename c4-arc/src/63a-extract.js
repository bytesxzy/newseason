/* ===== src/63a-extract.js ===== */
/* Extraction sketches: the output is a rendering of ONE entity of the input.
 *
 *     out = RENDER_t( the entity e of SCN(input, seg) with PRED(e) )
 *
 * RENDER is the entity's bounding-box subgrid of the input, or its patch on
 * the background, optionally under a D4 transform t. For every demonstration
 * the correspondence is exact: the set of entities whose rendering equals the
 * output. PRED's version space is then the predicates true on (one of) those
 * targets and false on every other entity, intersected over all
 * demonstrations; conjunctions of two are tried only when no single predicate
 * separates. The same predicate language as the in-place sketches is used, so
 * "the object touching the red marker", "the only one with a hole" and "the
 * largest of the unique-coloured ones" are all reachable without a dedicated
 * selector for each.
 */
var EXTRACT = (function () {
  function render(sc, e, mode, t) {
    var g;
    if (mode === "bbox") g = G.subgrid(sc.grid, e.r0, e.c0, e.r1, e.c1);
    else g = e.patch.map(function (row) { return row.map(function (v) { return v < 0 ? sc.bg : v; }); });
    return t ? SCN.tf(g, t) : g;
  }

  function synthesize(ctx, deadline) {
    if (ctx.same_shape()) return [];
    var bg = ctx.bg(), found = [], seen = new Set(), si;
    for (si = 0; si < SCN.SEGS.length && nowMs() < deadline; si++) {
      var seg = SCN.SEGS[si];
      if (seg === "bg4" || seg === "cell") continue;
      ["bbox", "patch"].forEach(function (mode) {
        for (var t = 0; t < 8 && nowMs() < deadline; t++) {
          var targets = [], items = [], ok = true, d;
          for (d = 0; d < ctx.train.length; d++) {
            var sc = SCN.of(ctx.train[d][0], seg, bg), y = ctx.train[d][1];
            if (!sc) { ok = false; break; }
            var tg = [];
            for (var i = 0; i < sc.ents.length; i++) {
              var e = sc.ents[i];
              var hh = t === 1 || t === 3 || t === 6 || t === 7 ? e.w : e.h, ww = hh === e.h ? e.w : e.h;
              if (hh !== y.length || ww !== y[0].length) continue;
              if (G.gEq(render(sc, e, mode, t), y)) tg.push(e);
            }
            if (!tg.length) { ok = false; break; }
            targets.push(tg);
            sc.ents.forEach(function (e2) { items.push({ sc: sc, e: e2, t: d, target: tg.indexOf(e2) >= 0 }); });
          }
          if (!ok) continue;
          for (d = 0; d < ctx.test_inputs.length; d++) if (!SCN.of(ctx.test_inputs[d], seg, bg)) ok = false;
          if (!ok) continue;
          /* a demo may have several equal targets: the predicate must be
             true on all of them (the render is then unambiguous anyway) */
          var T = items.filter(function (x) { return x.target; }), F = items.filter(function (x) { return !x.target; });
          var preds = EXPR.predCatalog(items, G.csList(G.csUnion(ctx.in_palette(), ctx.out_palette())));
          var ps = SKETCH.predVS(preds, T, F, 4);
          ps.forEach(function (p) {
            var prog = { kind: "extract", seg: seg, bg: bg, mode: mode, t: t, p: p };
            var key = keyOf(prog);
            if (seen.has(key)) return;
            seen.add(key);
            if (verify(prog, ctx)) found.push(prog);
          });
        }
      });
      if (found.length >= 12) break;
    }
    return found;
  }

  function run(prog, grid) {
    var sc = SCN.of(grid, prog.seg, prog.bg);
    if (!sc) return null;
    var hit = null, i;
    for (i = 0; i < sc.ents.length; i++) if (prog.p.f(sc, sc.ents[i])) {
      var g = render(sc, sc.ents[i], prog.mode, prog.t);
      if (hit && !G.gEq(hit, g)) return null;
      hit = g;
    }
    return hit;
  }
  function verify(prog, ctx) {
    for (var d = 0; d < ctx.train.length; d++) {
      var out = run(prog, ctx.train[d][0]);
      if (!out || !G.gEq(out, ctx.train[d][1])) return false;
    }
    return true;
  }
  function keyOf(p) { return "x:" + p.seg + "|" + p.p.k + "|" + p.mode + (p.t ? "|t" + p.t : ""); }
  function bits(p) { return EMDL.segBits(p.seg) + p.p.b + 1 + (p.t ? 3 : 0.5); }

  (function () {
    function generate(ctx) {
      var progs = synthesize(ctx, ctx.deadline), out = [];
      progs.forEach(function (p) {
        var h = new Hyp(keyOf(p), function (g) { return run(p, g); }, 1.0 + bits(p) / 8.0, "sketch");
        h.eprog = p;
        out.push(h);
      });
      return out;
    }
    defSolver("extract", "sketch", generate, 1, 0.4);
  })();

  return { synthesize: synthesize, run: run, keyOf: keyOf, bits: bits };
})();
