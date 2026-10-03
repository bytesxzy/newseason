/* ===== src/69-psyn-transduce.js ===== */
/* A task-adapted TRANSDUCTIVE branch, independent of explicit programs.
 *
 * Induction asks for a program. Transduction asks for the output directly: a small model is fitted to THIS task's
 * demonstrations only, predicts a cell's output colour from rich per-cell evidence, and is applied to the test input. Here the
 * model is a decision tree over ~90 features per cell (neighbourhood and distance-2 colours, absolute and parity position, the
 * cell's object under an 8-connected parse with its size, rank, shape class, position inside the object, relations to its
 * nearest/adjacent/enclosing objects, scene roles, row/column colour inventory, first colour seen along each ray, mirror colours)
 * and it is applied ITERATIVELY: the prediction of one round is the context of the next, up to a few rounds, which is the
 * bounded task-conditioned refinement loop (candidate output -> re-read -> refine).
 *
 * Because it is not a program, nothing certifies it except its fit and its leave-one-demonstration-out behaviour; it therefore
 * joins the portfolio only when it reproduces every demonstration AND at least two thirds of the held-out demonstrations
 * exactly, and it carries that LOO score as its cost. It is a soft, diverse voter beside the symbolic families.
 */

(function () {
  var P = PSYN;
  var NF = 90;

  function build(I, Z, ctxInfo) {
    var H = I.length, W = I[0].length, n = H * W, F = new Array(n), r, c, d, k, i;
    var sc = P.parse(I, "c8", "mode"), bg = sc.bg, roles = sc.roles(), rel = sc.n ? sc.rel() : null;
    var rowHas = [], colHas = [];
    for (r = 0; r < H; r++) { var m = 0; for (c = 0; c < W; c++) m |= 1 << Z[r][c]; rowHas.push(m); }
    for (c = 0; c < W; c++) { var m2 = 0; for (r = 0; r < H; r++) m2 |= 1 << Z[r][c]; colHas.push(m2); }
    function at(rr, cc) { return rr < 0 || cc < 0 || rr >= H || cc >= W ? -1 : Z[rr][cc]; }
    var D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]], dist = [];
    var shapeIds = ctxInfo.shapeIds, d4Ids = ctxInfo.d4Ids;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      var f = new Array(NF).fill(-1), q = 0;
      f[q++] = Z[r][c];
      f[q++] = at(r - 1, c - 1); f[q++] = at(r - 1, c); f[q++] = at(r - 1, c + 1); f[q++] = at(r, c - 1); f[q++] = at(r, c + 1); f[q++] = at(r + 1, c - 1); f[q++] = at(r + 1, c); f[q++] = at(r + 1, c + 1);
      f[q++] = at(r - 2, c); f[q++] = at(r + 2, c); f[q++] = at(r, c - 2); f[q++] = at(r, c + 2);
      f[q++] = r; f[q++] = c; f[q++] = H - 1 - r; f[q++] = W - 1 - c; f[q++] = r & 1; f[q++] = c & 1; f[q++] = r % 3; f[q++] = c % 3;
      f[q++] = I[r][c]; f[q++] = I[r][c] === bg ? 1 : 0;
      var oi = sc.at[r * W + c], o = oi >= 0 ? sc.objs[oi] : null;
      if (o) {
        var fr = sc.freq();
        f[q++] = o.size; f[q++] = o.h; f[q++] = o.w; f[q++] = o.color; f[q++] = o.holes; f[q++] = o.border ? 1 : 0;
        var rs = 0, rsu = 0; for (i = 0; i < sc.n; i++) { if (sc.objs[i].size > o.size) rs++; if (sc.objs[i].size < o.size) rsu++; }
        f[q++] = rs; f[q++] = rsu;
        var rr = r - o.r0, cc = c - o.c0;
        f[q++] = rr; f[q++] = cc; f[q++] = 2 * rr + 1 < o.h ? 0 : (2 * rr + 1 > o.h ? 1 : 2); f[q++] = 2 * cc + 1 < o.w ? 0 : (2 * cc + 1 > o.w ? 1 : 2);
        var nb = 0; for (d = 0; d < 4; d++) { var nr = r + D4[d][0], nc = c + D4[d][1]; if (nr >= 0 && nc >= 0 && nr < H && nc < W && sc.at[nr * W + nc] === oi) nb++; }
        f[q++] = nb < 4 ? 1 : 0; f[q++] = nb; f[q++] = 0;
        f[q++] = shapeIds[o.shapeKey] === undefined ? -1 : shapeIds[o.shapeKey]; f[q++] = d4Ids[o.d4Key] === undefined ? -1 : d4Ids[o.d4Key];
        f[q++] = fr.color[o.color] === 1 ? 1 : 0; f[q++] = fr.shape[o.shapeKey] === 1 ? 1 : 0; f[q++] = rs === 0 ? 1 : 0; f[q++] = rsu === 0 ? 1 : 0; f[q++] = sc.n;
        f[q++] = o.cr2 - 2 * r; f[q++] = o.cc2 - 2 * c;
        var nr0 = rel.nearest[oi]; f[q++] = nr0 >= 0 ? sc.objs[nr0].color : -1;
        var ac = -1, ks = Object.keys(rel.adj[oi]); for (i = 0; i < ks.length; i++) { var cl = sc.objs[+ks[i]].color; if (cl !== o.color) { ac = ac === -1 ? cl : (ac === cl ? ac : -2); } } f[q++] = ac;
        f[q++] = rel.enclosedBy[oi] >= 0 ? sc.objs[rel.enclosedBy[oi]].color : -1;
      } else { q += 27; }
      f[q++] = roles.marker; f[q++] = roles.largestObj;
      var pn = sc.panels(); f[q++] = pn ? pn.at[r * W + c] : -1;
      for (k = 0; k < 10; k++) f[q++] = (rowHas[r] >> k) & 1;
      for (k = 0; k < 10; k++) f[q++] = (colHas[c] >> k) & 1;
      for (d = 0; d < 4; d++) {
        var nr2 = r + D4[d][0], nc2 = c + D4[d][1], steps = 1, col = -1;
        while (nr2 >= 0 && nc2 >= 0 && nr2 < H && nc2 < W) { if (Z[nr2][nc2] !== bg) { col = Z[nr2][nc2]; break; } nr2 += D4[d][0]; nc2 += D4[d][1]; steps++; }
        f[q++] = col; f[q++] = col < 0 ? 0 : steps;
      }
      f[q++] = at(r, W - 1 - c); f[q++] = at(H - 1 - r, c); f[q++] = H === W ? at(c, r) : -1;
      var cnt = 0, same = 0; for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) { var v = at(r + a, c + b); if (v >= 0 && v !== bg) cnt++; if (v === Z[r][c]) same++; }
      f[q++] = cnt; f[q++] = same;
      F[r * W + c] = f;
    }
    return F;
  }

  /* ---- a compact CART classifier */
  function gini(counts, n) { var s = 0, k; if (!n) return 0; for (k in counts) s += counts[k] * counts[k]; return 1 - s / (n * n); }
  function fitTree(X, y, depth, minLeaf) {
    var n = y.length, counts = {}, i, best = null;
    for (i = 0; i < n; i++) counts[y[i]] = (counts[y[i]] || 0) + 1;
    var maj = null, mc = -1, k; for (k in counts) if (counts[k] > mc) { mc = counts[k]; maj = +k; }
    if (mc === n || depth <= 0 || n < 2 * minLeaf) return { leaf: maj };
    var parent = gini(counts, n), f, vals, v, j, left, right;
    for (f = 0; f < NF; f++) {
      var seen = {}, distinct = [];
      for (i = 0; i < n; i++) { v = X[i][f]; if (!seen[v]) { seen[v] = 1; distinct.push(v); } }
      if (distinct.length < 2) continue;
      distinct.sort(function (a, b) { return a - b; });
      var cands = [];
      if (distinct.length <= 12) { distinct.forEach(function (v2) { cands.push(["eq", v2]); }); for (j = 0; j + 1 < distinct.length; j++) cands.push(["le", (distinct[j] + distinct[j + 1]) / 2]); }
      else { for (j = 1; j < 9; j++) { var idx = Math.floor(distinct.length * j / 9); cands.push(["le", (distinct[idx - 1] + distinct[idx]) / 2]); } }
      for (j = 0; j < cands.length; j++) {
        var lc = {}, rc = {}, ln = 0, rn = 0, cd = cands[j];
        for (i = 0; i < n; i++) { var goL = cd[0] === "eq" ? X[i][f] === cd[1] : X[i][f] <= cd[1]; if (goL) { lc[y[i]] = (lc[y[i]] || 0) + 1; ln++; } else { rc[y[i]] = (rc[y[i]] || 0) + 1; rn++; } }
        if (ln < minLeaf || rn < minLeaf) continue;
        var gain = parent - (ln * gini(lc, ln) + rn * gini(rc, rn)) / n;
        /* prefer simpler/earlier features on ties: a tiny index penalty keeps the tree from chasing absolute position */
        gain -= f * 1e-5 + (f >= 13 && f <= 20 ? 0.002 : 0);
        if (!best || gain > best.gain) best = { gain: gain, f: f, cd: cd };
      }
    }
    if (!best || best.gain <= 1e-9) return { leaf: maj };
    var XL = [], yL = [], XR = [], yR = [];
    for (i = 0; i < n; i++) { var gl = best.cd[0] === "eq" ? X[i][best.f] === best.cd[1] : X[i][best.f] <= best.cd[1]; if (gl) { XL.push(X[i]); yL.push(y[i]); } else { XR.push(X[i]); yR.push(y[i]); } }
    return { f: best.f, t: best.cd[0], v: best.cd[1], l: fitTree(XL, yL, depth - 1, minLeaf), r: fitTree(XR, yR, depth - 1, minLeaf) };
  }
  function predict(tree, x) { while (tree.leaf === undefined) { var go = tree.t === "eq" ? x[tree.f] === tree.v : x[tree.f] <= tree.v; tree = go ? tree.l : tree.r; } return tree.leaf; }

  function makeInfo(pairs) {
    var shapeIds = {}, d4Ids = {}, ns = 0, nd = 0;
    pairs.forEach(function (p) { var sc = P.parse(p[0], "c8", "mode"); sc.objs.forEach(function (o) { if (shapeIds[o.shapeKey] === undefined) shapeIds[o.shapeKey] = ns++; if (d4Ids[o.d4Key] === undefined) d4Ids[o.d4Key] = nd++; }); });
    return { shapeIds: shapeIds, d4Ids: d4Ids };
  }
  function apply(models, info, I) {
    var Z = I, t, F, H = I.length, W = I[0].length, out, r, c;
    for (t = 0; t < models.length; t++) {
      F = build(I, Z, info); out = [];
      for (r = 0; r < H; r++) { var row = []; for (c = 0; c < W; c++) row.push(predict(models[t], F[r * W + c])); out.push(row); }
      Z = out;
    }
    return Z;
  }
  /* fit up to `rounds` trees; stop when the training pairs are reproduced exactly */
  function fit(pairs, rounds, deadlineMs) {
    var info = makeInfo(pairs), models = [], Zs = pairs.map(function (p) { return p[0]; }), t, i, r, c, X, y, F, W0 = pairs[0][0][0].length;
    for (t = 0; t < rounds; t++) {
      if (Date.now() > deadlineMs) break;
      X = []; y = [];
      for (i = 0; i < pairs.length; i++) {
        F = build(pairs[i][0], Zs[i], info);
        var w = pairs[i][0][0].length;
        for (r = 0; r < pairs[i][0].length; r++) for (c = 0; c < w; c++) { X.push(F[r * w + c]); y.push(pairs[i][1][r][c]); }
      }
      if (X.length > 9000) { var step = Math.ceil(X.length / 9000), X2 = [], y2 = []; for (i = 0; i < X.length; i += step) { X2.push(X[i]); y2.push(y[i]); } X = X2; y = y2; }
      models.push(fitTree(X, y, 14, 1));
      /* the next round's context is what the model chain now predicts for each demonstration input */
      var exact = true;
      Zs = pairs.map(function (p) { return apply(models, info, p[0]); });
      for (i = 0; i < pairs.length; i++) if (!G.gEq(Zs[i], pairs[i][1])) { exact = false; break; }
      if (exact) return { models: models, info: info, exact: true };
    }
    return { models: models, info: info, exact: false };
  }

  var _h = mkHyp("transduce");
  function generate(ctx) {
    if (!ctx.same_shape() || P.off("transduce")) return [];
    var pairs = ctx.train, t0 = Date.now(), cap = t0 + 900, M = fit(pairs, 3, cap);
    if (!M.exact) return [];
    /* leave-one-demonstration-out: refit on the others and predict the held-out pair */
    var pass = 0, n = pairs.length, i;
    if (n >= 3) {
      for (i = 0; i < n; i++) {
        if (Date.now() > cap + 700) return [];
        var rest = pairs.slice(0, i).concat(pairs.slice(i + 1)), m = fit(rest, 3, cap + 700);
        if (m.exact && G.gEq(apply(m.models, m.info, pairs[i][0]), pairs[i][1])) pass++;
      }
      if (pass / n < 0.66) return [];
    }
    var conf = n >= 3 ? pass / n : 0.5;
    var h = _h("transduce:tree" + M.models.length, (function (mm) { return function (g) { return apply(mm.models, mm.info, g); }; })(M), 4.0 + 6.0 * (1 - conf));
    return [h];
  }
  var mod = defSolver("transduce", "transduce", generate, 2, 1.6);
  mod.EXTRA = true; mod.ONLY_IF_UNSOLVED = true;
  P.Transduce = { fit: fit, apply: apply, module: mod };
})();
