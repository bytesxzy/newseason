/* ===== src/59-equivariant.js ===== */
/* Equivariant re-framing.
 *
 * A solver family is written in one frame of reference: "down" is gravity,
 * colour 0 is background, rows come before columns. A task posed in another
 * frame -- the same rule with the grid transposed, or with a background of
 * colour 7 -- is the same task, and a program that explains it exists in the
 * right frame even when none exists in the given one.
 *
 * So when the portfolio finds NO program consistent with the demonstrations,
 * the whole task (every demonstration input and output, and the test inputs)
 * is re-posed in other frames: a canonical colour frame (background -> 0,
 * then colours by frequency) and the dihedral frames. Each frame is solved
 * by the unchanged portfolio under its usual validation -- a program must
 * still reproduce every demonstration exactly -- and its predictions are
 * mapped back through the inverse transform. The first frame that yields a
 * consistent program is used. No task identity is read, test outputs are
 * never seen, and nothing is enumerated beyond the portfolio's own search.
 */
var REFRAME = (function () {
  function gridOk(g) { return g && g.length && g[0] && g[0].length; }

  /* canonical colour frame: a bijection on 0..9 */
  function colourFrame(train, testInputs) {
    var count = new Array(10).fill(0), i, r, c;
    function tally(g) { for (r = 0; r < g.length; r++) for (c = 0; c < g[r].length; c++) count[g[r][c]]++; }
    for (i = 0; i < train.length; i++) { tally(train[i][0]); tally(train[i][1]); }
    for (i = 0; i < testInputs.length; i++) tally(testInputs[i]);
    var order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(function (a, b) { return (count[b] - count[a]) || (a - b); });
    var fwd = new Array(10), inv = new Array(10);
    for (i = 0; i < 10; i++) { fwd[order[i]] = i; inv[i] = order[i]; }
    var identity = true;
    for (i = 0; i < 10; i++) if (fwd[i] !== i && count[i] > 0) { identity = false; break; }
    if (identity) return null;
    function map(p) { return function (g) { return g.map(function (row) { return row.map(function (v) { return p[v]; }); }); }; }
    return { name: "colour-canonical", fwd: map(fwd), inv: map(inv) };
  }

  var GEOMETRIC = [
    { name: "transpose", fwd: transpose, inv: transpose },
    { name: "rot90", fwd: rot90, inv: rot270 },
    { name: "flip_v", fwd: flipV, inv: flipV },
    { name: "flip_h", fwd: flipH, inv: flipH },
    { name: "rot270", fwd: rot270, inv: rot90 }
  ];

  function hasCandidate(res) {
    if (!res || !res.predictions) return false;
    return res.n_fit > 0 && res.predictions.some(function (p) { return p && p.length; });
  }

  /* Frames as REPRESENTATIONS (17-representation.js): the colour-role and
     canonical-palette frames and all seven non-trivial symmetries, ordered
     by the evidence that each simplifies the demonstrations. Decoding is
     given the frame's input, so a per-grid frame (colour roles) inverts
     correctly. Falls back to the fixed list when the registry is absent. */
  function evidenceFrames(train, testInputs, maxFrames) {
    if (typeof REPRESENT === "undefined" || !REPRESENT) return null;
    var ctx;
    try { ctx = new Ctx(train, testInputs); } catch (e) { return null; }
    var ranked = REPRESENT.rank(ctx, { kinds: ["frame"] }).filter(function (o) { return o.name !== "raw"; });
    return { ctx: ctx, frames: ranked.slice(0, maxFrames).map(function (o) {
      var p = REPRESENT.prepared(ctx, o.name);
      return { name: o.name, gain: o.gain,
               fwdPair: function (x, y) { return [REPRESENT.encIn(p, x), y ? REPRESENT.encOut(p, y, x) : null]; },
               invFor: function (x) { return function (g) { return REPRESENT.decode(p, g, x); }; } };
    }) };
  }

  /* ONE time budget for the whole task. Frames with positive evidence
     (the demonstrations compress better in them) make the base solve
     anytime: if nothing fits by 2/3 of the budget it wraps up by 5/6 and the
     frames get the rest. Without frame evidence the base solve keeps the
     whole budget and frames only use time it left unused.
     opts.reframe: false disables; opts.reframe_budget: an EXPLICIT extra
     budget in seconds (the old behaviour: frames after the base budget);
     opts.reframe_frames: max frames. A frame also runs, time permitting,
     when a frame shows strong evidence (gain > 1) while the raw top
     prediction violates a demonstrated shape or palette law. */
  function solveReframed(solveFn, train, testInputs, opts) {
    opts = opts || {};
    if (opts.reframe === false) return solveFn(train, testInputs, opts);
    var tStart = nowMs();
    var base = opts.time_budget === undefined ? 30.0 : opts.time_budget;
    var maxFrames = opts.reframe_frames === undefined ? 3 : opts.reframe_frames;
    var ev = evidenceFrames(train, testInputs, maxFrames), weak = false;
    var extra = opts.reframe_budget !== undefined;
    var positive = !!(ev && ev.frames.length && ev.frames[0].gain > 0);
    var sub0 = {}, k0;
    for (k0 in opts) sub0[k0] = opts[k0];
    if (!extra && positive) sub0._anytime = { checkAt: 2 / 3, wrapAt: 5 / 6 };
    var res = solveFn(train, testInputs, sub0);
    if (hasCandidate(res)) {
      var viol = res.diagnostics && res.diagnostics.predictions && res.diagnostics.predictions.some(function (p) { return p.top_violations > 0; });
      weak = !!(viol && ev && ev.frames.length && ev.frames[0].gain > 1.0);
      if (!weak) return res;
    }
    var budget = extra ? opts.reframe_budget : base - (nowMs() - tStart) / 1000 - 0.03;
    if (!(budget > 0.05)) return res;
    var frames = [];
    if (positive) frames = ev.frames.filter(function (fr) { return fr.gain > 0; });
    else if (ev && ev.frames.length) frames = ev.frames;
    else {
      var cf = colourFrame(train, testInputs);
      if (cf) frames.push(cf);
      for (var g = 0; g < GEOMETRIC.length; g++) frames.push(GEOMETRIC[g]);
    }
    frames = frames.slice(0, weak ? 1 : maxFrames);
    var t0 = nowMs(), tried = [];
    for (var f = 0; f < frames.length; f++) {
      var left = budget - (nowMs() - t0) / 1000;
      if (left <= 0.05) break;
      var fr = frames[f], per = left / (frames.length - f);
      var tTrain = [], tTest = [], ok = true, i;
      try {
        for (i = 0; i < train.length; i++) {
          var pr = fr.fwdPair ? fr.fwdPair(train[i][0], train[i][1]) : [fr.fwd(train[i][0]), fr.fwd(train[i][1])];
          if (!pr[0] || !pr[1]) { ok = false; break; }
          tTrain.push(pr);
        }
        for (i = 0; i < testInputs.length && ok; i++) {
          var tx = fr.fwdPair ? fr.fwdPair(testInputs[i], null)[0] : fr.fwd(testInputs[i]);
          if (!tx) { ok = false; break; }
          tTest.push(tx);
        }
      } catch (e) { ok = false; }
      if (!ok) continue;
      var sub = {}, k;
      for (k in opts) sub[k] = opts[k];
      sub.time_budget = per; sub.reframe = false;
      var r2 = null;
      try { r2 = solveFn(tTrain, tTest, sub); } catch (e) { r2 = null; }
      tried.push(fr.name);
      if (!hasCandidate(r2)) continue;
      /* back to the task's own frame */
      var preds = r2.predictions.map(function (list, ti) {
        var inv = fr.invFor ? fr.invFor(testInputs[ti]) : fr.inv;
        return (list || []).map(function (gr) { try { return gridOk(gr) ? inv(gr) : gr; } catch (e) { return gr; } })
          .filter(function (gr) { return gridOk(gr); });
      });
      if (weak) {
        /* the raw answer broke a demonstrated law; the frame's answers go
           first, the raw ones stay as later guesses */
        var r2top = r2.diagnostics && r2.diagnostics.predictions ? r2.diagnostics.predictions.every(function (p) { return !p.top_violations; }) : false;
        if (!r2top) { res.diagnostics.reframe = { frame: fr.name, tried: tried.slice(), weak: true, used: false }; continue; }
        preds = preds.map(function (list, ti) {
          var seenK = new Set(list.map(function (gr) { return G.gkey(gr); }));
          return list.concat((res.predictions[ti] || []).filter(function (gr) { return !seenK.has(G.gkey(gr)); }));
        });
      }
      res.predictions = preds;
      res.chosen = (r2.chosen || []).map(function (c) { return c ? [c[0] + "@" + fr.name, c[1]] : c; });
      res.solver = r2.solver ? r2.solver + "@" + fr.name : null;
      res.hyps = (r2.hyps || []).map(function (h) { return [h[0] + "@" + fr.name, h[1]]; });
      res.n_fit = r2.n_fit; res.n_hyps = (res.n_hyps || 0) + (r2.n_hyps || 0);
      res.diagnostics = res.diagnostics || {};
      res.diagnostics.reframe = { frame: fr.name, tried: tried.slice(), seconds: (nowMs() - t0) / 1000, weak: weak,
                                  evidence: fr.gain === undefined ? null : fr.gain };
      res.elapsed = (res.elapsed || 0) + (nowMs() - t0) / 1000;
      return res;
    }
    res.diagnostics = res.diagnostics || {};
    res.diagnostics.reframe = { frame: null, tried: tried, seconds: (nowMs() - t0) / 1000 };
    res.elapsed = (res.elapsed || 0) + (nowMs() - t0) / 1000;
    return res;
  }

  return { solveReframed: solveReframed, colourFrame: colourFrame, GEOMETRIC: GEOMETRIC, evidenceFrames: evidenceFrames };
})();
