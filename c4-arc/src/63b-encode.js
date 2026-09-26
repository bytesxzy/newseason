/* ===== src/63b-encode.js ===== */
/* Encoding sketches: the output ENCODES numbers read off the scene.
 *
 *     out = PATTERN_C( canvas of H(scene) x W(scene) )
 *
 * H and W are integer expressions over the whole input scene -- entity
 * counts per segmentation, pixel counts, colour counts, per-colour cell and
 * entity counts, the largest entity, or a literal when every demonstration
 * agrees -- and each is solved as a version space: the expressions whose
 * value equals the output's height (width) in EVERY demonstration. PATTERN
 * paints the canvas (filled, main or anti diagonal, the first K cells in
 * reading order, a histogram of colours by count as columns or rows), in a
 * colour given by a COLOR expression over the scene. Every combination is
 * executed on every demonstration; only exact ones are kept.
 */
var ENCODE = (function () {
  var SEGS = ["c8", "c4", "m8", "col"];

  function features(g, bg) {
    var f = {}, i, c, hist = G.histogram(g), colors = [];
    for (c = 0; c < 10; c++) if (c !== bg && hist[c]) { colors.push(c); f["cells:" + c] = hist[c]; }
    f.colors = colors.length;
    f.fg = colors.reduce(function (a, c2) { return a + hist[c2]; }, 0);
    SEGS.forEach(function (seg) {
      var sc = SCN.of(g, seg, bg);
      if (!sc) return;
      f["ents:" + seg] = sc.ents.length;
      f["pix:" + seg] = sc.ents.filter(function (e) { return e.n === 1; }).length;
      f["big:" + seg] = sc.ents.reduce(function (a, e) { return Math.max(a, e.n); }, 0);
      f["multi:" + seg] = sc.ents.filter(function (e) { return e.n > 1; }).length;
      if (seg === "c8") colors.forEach(function (c3) { f["ents:c8:" + c3] = sc.ents.filter(function (e) { return e.color === c3; }).length; });
    });
    var byCount = colors.slice().sort(function (a, b) { return (hist[b] - hist[a]) || (a - b); });
    f._byCount = byCount; f._hist = hist;
    f.maxcnt = byCount.length ? hist[byCount[0]] : 0;
    /* the same counts with NO background (grids that are all foreground) */
    var all = [];
    for (c = 0; c < 10; c++) if (hist[c]) all.push(c);
    f["all:colors"] = all.length;
    var allBy = all.slice().sort(function (a, b) { return (hist[b] - hist[a]) || (a - b); });
    f["all:maxcnt"] = allBy.length ? hist[allBy[0]] : 0;
    f._allBy = allBy;
    /* shape of the whole foreground, raw and up to D4 (classification keys) */
    var r0 = 99, r1 = -1, c0 = 99, c1 = -1, r, cc;
    for (r = 0; r < g.length; r++) for (cc = 0; cc < g[0].length; cc++) if (g[r][cc] !== bg) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); }
    if (r1 >= 0) {
      var m = [];
      for (r = r0; r <= r1; r++) { var row = []; for (cc = c0; cc <= c1; cc++) row.push(g[r][cc] !== bg ? 1 : 0); m.push(row); }
      f._mask = SCN.maskKey(m); f._d4 = SCN.d4Key(m);
    }
    return f;
  }

  function colorExprs() {
    return [
      { k: "most", b: 2, f: function (F) { return F._byCount.length ? F._byCount[0] : null; } },
      { k: "least", b: 2.5, f: function (F) { return F._byCount.length ? F._byCount[F._byCount.length - 1] : null; } }
    ].concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (c) { return { k: "c" + c, b: EXPR.LOG2_10, f: function () { return c; } }; }));
  }

  function paint(pat, H, W, C, F, bg, K) {
    if (!(H > 0 && W > 0 && H <= 30 && W <= 30)) return null;
    var out = G.constGrid(H, W, bg), r, c, i;
    if (pat === "fill") { for (r = 0; r < H; r++) for (c = 0; c < W; c++) out[r][c] = C; }
    else if (pat === "diag") { if (H !== W) return null; for (i = 0; i < H; i++) out[i][i] = C; }
    else if (pat === "adiag") { if (H !== W) return null; for (i = 0; i < H; i++) out[i][W - 1 - i] = C; }
    else if (pat === "firstk") { if (!(K >= 0) || K > H * W) return null; for (i = 0; i < K; i++) out[(i / W) | 0][i % W] = C; }
    else if (pat === "hcol" || pat === "hrow" || pat === "acol" || pat === "arow") {
      var cols = pat.charAt(0) === "a" ? F._allBy : F._byCount;
      pat = pat === "acol" ? "hcol" : pat === "arow" ? "hrow" : pat;
      if (pat === "hcol") { if (W !== cols.length) return null; for (c = 0; c < W; c++) for (r = 0; r < Math.min(H, F._hist[cols[c]]); r++) out[r][c] = cols[c]; }
      else { if (H !== cols.length) return null; for (r = 0; r < H; r++) for (c = 0; c < Math.min(W, F._hist[cols[r]]); c++) out[r][c] = cols[r]; }
    } else return null;
    return out;
  }

  function synthesize(ctx, deadline) {
    if (ctx.same_shape()) return [];
    var bg = ctx.bg(), feats = [], t;
    for (t = 0; t < ctx.train.length; t++) feats.push(features(ctx.train[t][0], bg));
    var testF = ctx.test_inputs.map(function (g) { return features(g, bg); });
    var outBg = G.background(ctx.train[0][1]);
    /* dimension version spaces */
    function dimVS(which) {
      var names = Object.keys(feats[0]).filter(function (k) { return k.charAt(0) !== "_"; }), out = [];
      names.forEach(function (k) {
        for (var d = 0; d < feats.length; d++) {
          var v = feats[d][k], want = which === "h" ? ctx.train[d][1].length : ctx.train[d][1][0].length;
          if (v !== want) return;
        }
        if (testF.every(function (F) { return F[k] > 0; })) out.push({ k: k, b: 3 + (k.indexOf(":") >= 0 ? 2 : 0), f: function (F) { return F[k]; } });
      });
      var lit = which === "h" ? ctx.const_out_shape() && ctx.const_out_shape()[0] : ctx.const_out_shape() && ctx.const_out_shape()[1];
      if (lit) out.push({ k: "" + lit, b: EXPR.litBits(lit) + 1, f: function () { return lit; } });
      out.sort(function (a, b) { return a.b - b.b; });
      return out.slice(0, 4);
    }
    var found0 = lookups(ctx, feats, testF, bg);
    var HS = dimVS("h"), WS = dimVS("w");
    if (!HS.length || !WS.length) return found0;
    var found = [], seen = new Set(), CS = colorExprs(), kNames = Object.keys(feats[0]).filter(function (k) { return k.charAt(0) !== "_"; });
    ["fill", "diag", "adiag", "hcol", "hrow", "acol", "arow", "firstk"].forEach(function (pat) {
      HS.forEach(function (Hx) { WS.forEach(function (Wx) {
        (/^[ha](col|row)$/.test(pat) ? [null] : CS).forEach(function (Cx) {
          (pat === "firstk" ? kNames : [null]).forEach(function (Kn) {
            if (nowMs() > deadline) return;
            var prog = { pat: pat, H: Hx, W: Wx, C: Cx, K: Kn, bg: outBg, segBg: bg };
            var key = keyOf(prog);
            if (seen.has(key)) return;
            seen.add(key);
            for (var d = 0; d < feats.length; d++) {
              var o = runF(prog, feats[d]);
              if (!o || !G.gEq(o, ctx.train[d][1])) return;
            }
            found.push(prog);
          });
        });
      }); });
    });
    return found0.concat(found.slice(0, 12));
  }

  /* classification: out = TABLE[key(input)], the table fitted from the
     demonstrations; it must compress (fewer entries than demonstrations)
     and know the key of every test input */
  function lookups(ctx, feats, testF, bg) {
    var keys = ["_d4", "_mask", "colors", "ents:c8", "ents:m8", "fg", "maxcnt"], out = [];
    keys.forEach(function (k) {
      var T = new Map(), N = new Map(), ok = true, d;
      for (d = 0; d < feats.length && ok; d++) {
        var v = feats[d][k], y = ctx.train[d][1];
        if (v === undefined) { ok = false; break; }
        if (T.has(v)) { if (!G.gEq(T.get(v), y)) ok = false; } else T.set(v, y);
        N.set(v, (N.get(v) || 0) + 1);
      }
      if (!ok || T.size < 2 || T.size >= feats.length) return;
      var thin = false;
      N.forEach(function (n) { if (n < 2) thin = true; });
      if (thin) return;
      if (!testF.every(function (F) { return T.has(F[k]); })) return;
      out.push({ pat: "lookup", key: k, table: T, segBg: bg, H: { k: k, b: 0 }, W: { k: "", b: 0 }, C: null, K: null, bg: 0,
                 b0: 3 + T.size * 4 });
    });
    return out;
  }
  function runF(p, F) {
    if (p.pat === "lookup") { var y = p.table.get(F[p.key]); return y ? y.map(function (row) { return row.slice(); }) : null; }
    var C = p.C ? p.C.f(F) : 0;
    if (C === null || C === undefined) return null;
    return paint(p.pat, p.H.f(F), p.W.f(F), C, F, p.bg, p.K ? F[p.K] : 0);
  }
  function run(p, g) { return runF(p, features(g, p.segBg)); }
  function keyOf(p) { if (p.pat === "lookup") return "enc:lookup[" + p.key + "]"; return "enc:" + p.pat + "[" + p.H.k + "x" + p.W.k + "]" + (p.C ? "{" + p.C.k + "}" : "") + (p.K ? "#" + p.K : ""); }
  function bits(p) { if (p.pat === "lookup") return p.b0; return 2 + p.H.b + p.W.b + (p.C ? p.C.b : 0) + (p.K ? 4 : 0) + (p.H.k === p.W.k ? -1 : 0); }

  (function () {
    function generate(ctx) {
      return synthesize(ctx, ctx.deadline).map(function (p) {
        var h = new Hyp(keyOf(p), function (g) { return run(p, g); }, 1.0 + bits(p) / 8.0, "sketch");
        h.eprog = p;
        return h;
      });
    }
    defSolver("encode", "sketch", generate, 1, 0.2);
  })();
  return { synthesize: synthesize, run: run, keyOf: keyOf, bits: bits, features: features };
})();
