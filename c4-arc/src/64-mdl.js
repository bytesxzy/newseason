/* ===== src/64-mdl.js ===== */
/* Description length of entity programs, and the solver family that emits
 * them.
 *
 * Several programs usually reproduce every demonstration exactly; the one to
 * trust is the one that explains them most compactly (CompressARC's lesson,
 * applied to programs rather than to a network). The code is a real prefix
 * code over the program's parts, not a renamed cost:
 *
 *   segmentation       log2 |beam|
 *   each rule          1 (continue bit) + predicate + action kind + holes
 *   default action     1
 *   each growth rule   1 + predicate + growth kind + colour
 *   canvas recolour    1 + log2 10 when used
 *
 * Expressions carry their own bits (63-sketch.js): a literal colour costs
 * log2 10, a literal offset 2 + L(dr) + L(dc) with L(v) = 1 + 2 log2(|v|+1),
 * while a relational expression costs the bits of the relation it names. So
 * a literal that happens to agree across every demonstration is cheap only
 * when it is one small value; three demonstrations moving by 2, 5 and 3 can
 * never share a literal, and "down by own height" (5 bits) or "until contact
 * with the nearest marker" (4.5 bits) is what compresses them. Predicates
 * pay for literal thresholds the same way.
 */
var EMDL = (function () {
  var KIND_BITS = { recolor: 1.0, del: 1.0, move: 1.6, copy: 2.0, moverc: 2.6, copyrc: 3.0, fall: 3.0 };
  /* representation choice: -log2 of a prior that prefers readings with
     fewer, larger entities (objectness); single cells are the last resort */
  var SEG_BITS = { c8: 2.0, c4: 2.2, m8: 2.6, m4: 2.8, col: 3.2, bgin: 3.2, bg4: 3.6, panel: 3.0, rects: 4.5, cell: 5.0 };
  function bits(p) {
    var b = (SEG_BITS[p.seg] || 4) + 1, i;
    for (i = 0; i < p.rules.length; i++) {
      var r = p.rules[i];
      b += 1 + r.p.b + (KIND_BITS[r.a.kind] || 2) + (r.a.v ? r.a.v.b : 0) + (r.a.c ? r.a.c.b : 0) +
        (r.a.d !== undefined ? (typeof r.a.d === "number" ? 2 : 2 + EXPR.REL_BY[r.a.d][1]) : 0);
    }
    if (p.grow) for (i = 0; i < p.grow.length; i++) {
      var g = p.grow[i];
      b += 1 + g.p.b + (g.g.b || 3) + (g.g.c ? g.g.c.b : 0);
    }
    if (p.canvas >= 0) b += 1 + Math.log(10) / Math.LN2;
    return b;
  }
  /* portfolio cost units (typed programs pay 2 + bits/8) */
  function cost(p) { return 1.0 + bits(p) / 8.0; }

  /* Referent consistency. Every property that held for ALL entities a rule
     selected (or ALL entities its relations referred to) across the
     demonstrations is part of what the demonstrations taught about that
     role. When the test input fills the role with an entity violating such a
     property, the rule is extrapolating through a coincidence: "the nearest
     different-coloured entity" was always a long border line in training and
     is a stray pixel on the test grid. The count of violated invariants is
     returned; nothing here reads a test output. */
  var PROPS = [
    ["pix", function (e) { return e.n === 1; }], ["line", function (e) { return e.line && e.n > 1; }],
    ["rect", function (e) { return e.rect; }], ["border", function (e) { return e.border; }],
    ["mono", function (e) { return e.ncol === 1; }], ["holes", function (e) { return e.holes() > 0; }],
    ["sq", function (e) { return e.square; }]
  ];
  function sig(e) {
    var s = {}, i;
    for (i = 0; i < PROPS.length; i++) s[PROPS[i][0]] = !!PROPS[i][1](e);
    s["c" + e.color] = true;
    return s;
  }
  function shift(p, ctx) {
    if (!SKETCH.roles) return 0;
    var inv = null, t, i;
    for (t = 0; t < ctx.train.length; t++) {
      var R = SKETCH.roles(p, ctx.train[t][0]);
      if (!R) return 0;
      if (!inv) inv = R.map(function () { return { sel: null, ref: null }; });
      R.forEach(function (slot, k) {
        ["sel", "ref"].forEach(function (w) {
          slot[w].forEach(function (e) {
            var s = sig(e);
            if (inv[k][w] === null) { inv[k][w] = {}; for (var key in s) inv[k][w][key] = s[key]; PROPS.forEach(function (q) { if (!s[q[0]]) inv[k][w]["!" + q[0]] = true; }); }
            else {
              for (var a in inv[k][w]) {
                var neg = a.charAt(0) === "!", name = neg ? a.slice(1) : a;
                if ((neg ? !s[name] : !!s[name]) === false) delete inv[k][w][a];
              }
            }
          });
        });
      });
    }
    if (!inv) return 0;
    /* a role no training entity ever filled has no demonstrated behaviour:
       filling it on the test grid is extrapolation (one violation per role) */
    var everFilled = inv.map(function (x) { return !!(x.sel || x.ref); });
    var viol = 0;
    for (t = 0; t < ctx.test_inputs.length; t++) {
      var RT = SKETCH.roles(p, ctx.test_inputs[t]);
      if (!RT) continue;
      RT.forEach(function (slot, k) {
        if (!everFilled[k] && (slot.sel.length || slot.ref.length)) { viol++; return; }
        ["sel", "ref"].forEach(function (w) {
          var I = inv[k] && inv[k][w];
          if (!I) return;
          slot[w].forEach(function (e) {
            var s = sig(e);
            for (var a in I) {
              if (a.charAt(0) === "c") continue;          /* colours may legitimately change */
              var neg = a.charAt(0) === "!", name = neg ? a.slice(1) : a;
              if ((neg ? !s[name] : !!s[name]) === false) { viol++; break; }
            }
          });
        });
      });
    }
    return viol;
  }
  /* Equivariance as a consistency test. When exact programs disagree about
     a test output, the task is re-posed in D4 views (every demonstration
     and test input transformed) and synthesis runs again there. Each raw
     prediction is scored by the number of views whose own exact programs
     predict the same grid after the inverse transform. The DSL is closed
     under D4, so a rule that survives re-induction in every frame is not
     leaning on reading order or tie-breaks; a prediction no other frame
     reproduces is. The SAME views are used for every competing candidate. */
  var VIEWS = [
    { name: "transpose", f: G.transpose, inv: G.transpose },
    { name: "rot180", f: G.rot180, inv: G.rot180 },
    { name: "flip_h", f: G.flipH, inv: G.flipH }
  ];
  function viewSupport(ctx, progs, deadline) {
    var byPred = new Map(), i, t;
    progs.forEach(function (p) {
      var ks = [];
      for (t = 0; t < ctx.test_inputs.length; t++) { var o = SKETCH.run(p, ctx.test_inputs[t]); ks.push(o ? G.gkey(o) : "-"); }
      p._pk = ks.join("~");
      if (!byPred.has(p._pk)) byPred.set(p._pk, 0);
    });
    if (byPred.size < 2) return null;
    var used = 0;
    for (i = 0; i < VIEWS.length; i++) {
      if (nowMs() > deadline) break;
      var V = VIEWS[i], tr = ctx.train.map(function (pr) { return [V.f(pr[0]), V.f(pr[1])]; });
      var sub = new Ctx(tr, ctx.test_inputs.map(V.f), null), found = [];
      var left = deadline - nowMs();
      try { found = SKETCH.synthesize(sub, nowMs() + left / (VIEWS.length - i), {}); } catch (e) { found = []; }
      if (!found.length) continue;
      used++;
      var seen = new Set();
      found.forEach(function (q) {
        var ks = [];
        for (t = 0; t < ctx.test_inputs.length; t++) { var o = SKETCH.run(q, sub.test_inputs[t]); ks.push(o ? G.gkey(V.inv(o)) : "-"); }
        var k = ks.join("~");
        if (byPred.has(k) && !seen.has(k)) { seen.add(k); byPred.set(k, byPred.get(k) + 1); }
      });
    }
    return used ? { views: used, support: byPred } : null;
  }
  var FLAGS = { mode: "sls", views: true, shift: true };
  function flags(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) FLAGS[k] = o[k]; return FLAGS; }
  return { bits: bits, cost: cost, shift: shift, viewSupport: viewSupport, flags: flags, FLAGS: FLAGS,
           segBits: function (seg) { return SEG_BITS[seg] || 4; } };
})();

/* The sketch family inside the portfolio. */
(function () {
  function generate(ctx) {
    var F = EMDL.FLAGS, t0 = nowMs();
    var progs = SKETCH.synthesize(ctx, t0 + (ctx.deadline - t0) * (F.views ? 0.85 : 1.0), { mode: F.mode }), out = [], i;
    /* view consistency, only when exact programs disagree about the test
       and time is left for at least one re-induction */
    var vs = null;
    if (F.views && progs.length > 1 && ctx.deadline - nowMs() > 150) { try { vs = EMDL.viewSupport(ctx, progs, ctx.deadline); } catch (e) { vs = null; } }
    for (i = 0; i < progs.length; i++) (function (p) {
      var sh = 0, vpen = 0;
      if (F.shift) { try { sh = EMDL.shift(p, ctx); } catch (e) { sh = 0; } }
      p.shift = sh;
      if (vs) { p.views = vs.support.get(p._pk) || 0; vpen = 0.8 * (vs.views - p.views); }
      var h = new Hyp("sk:" + SKETCH.progKey(p), function (g) { return SKETCH.run(p, g); }, EMDL.cost(p) + Math.min(3, sh) * 1.0 + vpen, "sketch");
      h.eprog = p;
      out.push(h);
    })(progs[i]);
    return out;
  }
  /* the family with the most unique correct answers per second on the
     development split gets a guaranteed slice (it returns at once on tasks
     it does not apply to) */
  defSolver("sketch", "sketch", generate, 1, 1.2).MIN_SLICE = 1.0;
})();
