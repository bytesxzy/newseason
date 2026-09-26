/* ===== src/69-transduce.js ===== */
/* Transduction: predict the output cells directly, without a program.
 *
 * Program induction fails when the rule is texture-like, when no DSL
 * composition states it, or when the output's regularity is easier to see
 * than the rule; direct prediction fails in the opposite places. The two
 * have complementary errors, so this branch is independent of the others.
 *
 * Model. A backoff context model over cells, trained per task on the
 * demonstrations and their D4 images (augmentation). Each training cell
 * contributes its contexts at several levels of detail -- own colour plus
 * the 8 neighbours plus what the four orthogonal rays hit, down to own colour
 * alone -- and its TARGET, which is relational when it can be: "unchanged",
 * "the colour the ray to the left hits", or a literal colour. A test cell is
 * predicted from its most specific context whose training evidence is
 * unanimous (PPM-style backoff). Nothing is enumerated; nothing is verified
 * by construction.
 *
 * Validation. The model reproduces its own training cells trivially, so the
 * portfolio's demonstration check proves nothing about it. It is admitted
 * only by LEAVE-ONE-DEMONSTRATION-OUT: trained without demonstration i it
 * must reconstruct demonstration i exactly, for every i. It then enters the
 * portfolio as family "transduce" at a cost above any short program, and
 * 64-mdl.js uses its prediction as consensus evidence among competing
 * programs.
 */
var TRANSDUCE = (function () {
  var D4F = [function (g) { return g; }, G.rot90, G.rot180, G.rot270, G.flipH, G.flipV, G.transpose, G.antiTranspose];
  var ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var N8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  function rayHit(g, r, c, d, bg) {
    var H = g.length, W = g[0].length, k = 1;
    for (;;) {
      var rr = r + d[0] * k, cc = c + d[1] * k;
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) return [-1, 0];
      if (g[rr][cc] !== bg) return [g[rr][cc], Math.min(k, 4)];
      k++;
    }
  }
  /* contexts from most to least specific */
  function contexts(g, r, c, bg) {
    var v = g[r][c], H = g.length, W = g[0].length, nb = [], rays = [], i;
    for (i = 0; i < 8; i++) {
      var rr = r + N8[i][0], cc = c + N8[i][1];
      nb.push(rr < 0 || rr >= H || cc < 0 || cc >= W ? "x" : g[rr][cc] === bg ? "." : g[rr][cc] === v ? "=" : g[rr][cc]);
    }
    for (i = 0; i < 4; i++) rays.push(rayHit(g, r, c, ORTH[i], bg));
    var rayC = rays.map(function (h) { return h[0]; }).join(","), rayD = rays.map(function (h) { return h[1]; }).join(",");
    var nbs = nb.join("");
    return [
      "A" + v + "|" + nbs + "|" + rayC + "|" + rayD,
      "B" + v + "|" + nbs + "|" + rayC,
      "C" + v + "|" + nbs,
      "D" + v + "|" + rayC,
      "E" + v + "|" + nb.map(function (x) { return x === "." || x === "x" ? x : "o"; }).join(""),
      "F" + v
    ].concat([rays]);
  }
  /* targets a training cell supports (relational first) */
  function targets(x, y, r, c, rays) {
    var out = [], v = y[r][c];
    if (v === x[r][c]) out.push("same");
    for (var i = 0; i < 4; i++) if (rays[i][0] === v) out.push("ray" + i);
    out.push("c" + v);
    return out;
  }

  function train(pairs, bg, aug) {
    var M = new Map(), t, k;
    pairs.forEach(function (pr) {
      var views = aug ? D4F : [D4F[0]];
      for (k = 0; k < views.length; k++) {
        var x = views[k](pr[0]), y = views[k](pr[1]), r, c;
        for (r = 0; r < x.length; r++) for (c = 0; c < x[0].length; c++) {
          var ctx = contexts(x, r, c, bg), rays = ctx[ctx.length - 1];
          var ts = targets(x, y, r, c, rays);
          for (t = 0; t < ctx.length - 1; t++) {
            var e = M.get(ctx[t]);
            if (!e) { e = { n: 0, T: new Map() }; M.set(ctx[t], e); }
            e.n++;
            ts.forEach(function (q) { e.T.set(q, (e.T.get(q) || 0) + 1); });
          }
        }
      }
    });
    return M;
  }
  function predict(M, g, bg) {
    var out = [], r, c, t;
    for (r = 0; r < g.length; r++) {
      var row = new Array(g[0].length);
      for (c = 0; c < g[0].length; c++) {
        var ctx = contexts(g, r, c, bg), rays = ctx[ctx.length - 1], val = null;
        for (t = 0; t < ctx.length - 1 && val === null; t++) {
          var e = M.get(ctx[t]);
          if (!e) continue;
          /* a target every training cell of this context supports */
          var best = null;
          e.T.forEach(function (n, q) { if (n === e.n && (best === null || rank(q) < rank(best))) best = q; });
          if (best === null) continue;
          if (best === "same") val = g[r][c];
          else if (best.charAt(0) === "r") { var h = rays[+best.slice(3)][0]; val = h < 0 ? null : h; }
          else val = +best.slice(1);
        }
        if (val === null) return null;
        row[c] = val;
      }
      out.push(row);
    }
    return out;
  }
  function rank(q) { return q === "same" ? 0 : q.charAt(0) === "r" ? 1 : 2; }

  /* leave-one-demonstration-out: every held-out demo reconstructed exactly */
  function lodo(ctx, bg, aug, deadline) {
    var n = ctx.train.length, i, ok = 0;
    if (n < 2) return 0;
    for (i = 0; i < n; i++) {
      if (nowMs() > deadline) return -1;
      var M = train(ctx.train.filter(function (_, j) { return j !== i; }), bg, aug);
      var p = predict(M, ctx.train[i][0], bg);
      if (p && G.gEq(p, ctx.train[i][1])) ok++;
    }
    return ok;
  }

  function model(ctx, deadline) {
    if (!ctx.same_shape()) return null;
    return ctx.memo("transduce", function () {
      var bg = ctx.bg(), cells = 0;
      ctx.train.forEach(function (p) { cells += p[0].length * p[0][0].length; });
      if (cells > 3000) return null;
      var n = ctx.train.length;
      for (var aug = 1; aug >= 0; aug--) {
        var ok = lodo(ctx, bg, !!aug, deadline);
        if (ok < 0) return null;
        if (ok === n) {
          var M = train(ctx.train, bg, !!aug);
          return { M: M, bg: bg, aug: !!aug, lodo: ok };
        }
      }
      return null;
    });
  }
  function run(m, g) { return predict(m.M, g, m.bg); }

  (function () {
    function generate(ctx) {
      var m = model(ctx, ctx.deadline);
      if (!m) return [];
      var h = new Hyp("transduce:" + (m.aug ? "d4" : "raw"), function (g) { return run(m, g); }, 7.0, "transduce");
      h.NO_LOO = true;
      return [h];
    }
    var mod = defSolver("transduce", "transduce", generate, 2, 0.5);
    mod.NO_LOO = true;
  })();

  return { model: model, run: run, lodo: lodo, train: train, predict: predict };
})();
