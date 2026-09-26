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
  var SEG_BITS = Math.log(SCN.SEGS.length) / Math.LN2;
  function bits(p) {
    var b = SEG_BITS + 1, i;
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
    var viol = 0;
    for (t = 0; t < ctx.test_inputs.length; t++) {
      var RT = SKETCH.roles(p, ctx.test_inputs[t]);
      if (!RT) continue;
      RT.forEach(function (slot, k) {
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
  return { bits: bits, cost: cost, shift: shift };
})();

/* The sketch family inside the portfolio. */
(function () {
  function generate(ctx) {
    var progs = SKETCH.synthesize(ctx, ctx.deadline), out = [], i;
    for (i = 0; i < progs.length; i++) (function (p) {
      var sh = 0;
      try { sh = EMDL.shift(p, ctx); } catch (e) { sh = 0; }
      p.shift = sh;
      var h = new Hyp("sk:" + SKETCH.progKey(p), function (g) { return SKETCH.run(p, g); }, EMDL.cost(p) + Math.min(3, sh) * 1.0, "sketch");
      h.eprog = p;
      out.push(h);
    })(progs[i]);
    return out;
  }
  defSolver("sketch", "sketch", generate, 1, 0.9);
})();
