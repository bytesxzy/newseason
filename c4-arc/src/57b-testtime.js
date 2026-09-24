/* ===== src/57b-testtime.js ===== */
/* Task-local test-time adaptation.
 *
 * Before spending the rest of a task's budget on deeper search, look at what
 * the task's OWN demonstrations say about which operations matter. Nothing
 * here reads a test output (there is none in the context), and nothing
 * survives the task: the priors live on the context object and are
 * discarded with it.
 *
 *   folds        for m >= 3 demonstrations: hold one out, run a small typed
 *                synthesis on the other m-1, and check each program found
 *                on the held-out one. Operators in programs that
 *                reconstruct the held-out demonstration gain prior; those
 *                in programs that only fit what they saw lose it (they are
 *                what overfitting is made of here).
 *   near-misses  candidate traces (55a-candidate.js) that reproduce some
 *                demonstrations but not others are fold results the
 *                generators already paid for: their operators, their
 *                representation and their residual class are read the same
 *                way, at no extra execution cost.
 *
 * Output: ctx._tta = {
 *   opPrior     operator -> bias (bits) for typed synthesis ordering
 *   repPrior    representation -> score bonus (17-representation.js)
 *   mutPrior    population-search mutation class -> weight multiplier
 *   families    solver family -> best near-miss closeness (seed ordering)
 *   report      what was learned, for diagnostics
 * }
 * All of it temporary. A literal mapping learned here is never persisted.
 */

var TESTTIME = null;

(function () {
  var MAX_BIAS = 2.0;

  function opsOf(struct) {
    var out = [];
    (function walk(n) {
      if (!n || PROG.isVar(n)) return;
      if (typeof n[0] === "string") out.push(n[0]);
      for (var i = 1; i < n.length; i++) if (Array.isArray(n[i]) && !PROG.isHole(n[i])) walk(n[i]);
    })(struct);
    return out;
  }
  function treeOps(t) { return PROG.treeNodes(t).map(function (p) { return p[0].op; }).filter(function (o) { return o !== "in"; }); }

  /* Residual class of the near-misses -> which mutation classes to favour. */
  var MUT_BY_SIG = {
    dims: { insert: 1.6, "delete": 1.3, frame: 1.4, decompose: 1.3, compose: 1.2 },
    under: { insert: 1.4, generalize: 1.5, role: 1.1, compose: 1.2 },
    excess: { specialize: 1.7, "delete": 1.4, decompose: 1.2 },
    mixed: { param: 1.3, opsub: 1.3, targeted: 1.3, role: 1.2 },
    cells: { param: 1.3, targeted: 1.4 }
  };

  function adapt(ctx, sink, opts) {
    opts = opts || {};
    var t0 = nowMs(), end = t0 + (opts.budgetMs || 120), m = ctx.train.length;
    var gain = {}, loss = {}, reps = {}, fams = {}, sigs = {}, rep = { folds: 0, fold_programs: 0, validated: 0, overfit: 0, traces: 0 };
    function add(map, k, v) { map[k] = (map[k] || 0) + v; }

    /* near-miss traces as free folds */
    if (sink) {
      try { sink.materialize(); } catch (e) { /* advisory */ }
      (sink.traces || []).forEach(function (tr) {
        rep.traces++;
        var frac = tr.satisfied.length / Math.max(1, m);
        fams[tr.family] = Math.max(fams[tr.family] || 0, tr.score || 0);
        if (tr.residual && tr.residual.sig) add(sigs, tr.residual.sig.split("/")[0].split("+")[0], 1);
        if (tr.representation && tr.representation !== "raw" && frac >= 0.5) add(reps, tr.representation, 0.25 * frac);
        var ops = tr.tree ? treeOps(tr.tree) : tr.struct ? opsOf(tr.struct) : [];
        ops.forEach(function (o) { add(gain, o, 0.4 * frac); });
      });
      (sink.typed || []).forEach(function (tp) {
        if (tp.representation && tp.representation !== "raw") add(reps, tp.representation, 0.2 * tp.score);
        opsOf(tp.struct).forEach(function (o) { add(gain, o, 0.25 * tp.score); });
        if (tp.sig) add(sigs, tp.sig.split("/").slice(-1)[0].slice(-1) === "u" ? "under" : tp.sig.slice(-1) === "e" ? "excess" : "mixed", 0.5);
      });
    }

    /* pseudo-held-out folds */
    if (m >= 3 && opts.folds !== false) {
      var per = Math.max(15, (end - nowMs()) / m);
      for (var f = 0; f < m; f++) {
        if (nowMs() > end - 10) break;
        var sub = new Ctx(ctx.train.slice(0, f).concat(ctx.train.slice(f + 1)), [ctx.train[f][0]], nowMs() + per);
        sub.op_prior = ctx.op_prior;
        var progs = [];
        try { progs = SYN.search(sub, 2, 60, sub.deadline, 6, ctx.op_prior); } catch (e) { progs = []; }
        rep.folds++;
        progs.forEach(function (p) {
          rep.fold_programs++;
          var y = p.run(ctx.train[f][0]), ok = !!(y && G.gEq(y, ctx.train[f][1]));
          var ops = opsOf(p.struct);
          if (ok) { rep.validated++; ops.forEach(function (o) { add(gain, o, 1.0); }); }
          else { rep.overfit++; ops.forEach(function (o) { add(loss, o, 0.6); }); }
        });
      }
    }

    var opPrior = {};
    Object.keys(gain).concat(Object.keys(loss)).forEach(function (o) {
      if (opPrior.hasOwnProperty(o) || !PROG.OPS[o]) return;
      var v = (gain[o] || 0) - (loss[o] || 0);
      if (Math.abs(v) >= 0.2) opPrior[o] = Math.max(-MAX_BIAS, Math.min(MAX_BIAS, Math.round(v * 100) / 100));
    });
    var mutPrior = {}, top = null, tn = 0;
    Object.keys(sigs).forEach(function (k) { if (sigs[k] > tn) { tn = sigs[k]; top = k; } });
    if (top && MUT_BY_SIG[top]) mutPrior = MUT_BY_SIG[top];
    var repPrior = {};
    Object.keys(reps).forEach(function (k) { repPrior[k] = Math.min(1.5, Math.round(reps[k] * 100) / 100); });
    rep.ms = nowMs() - t0;
    rep.top_residual = top;
    rep.op_prior = opPrior;
    rep.rep_prior = repPrior;
    ctx._tta = { opPrior: opPrior, repPrior: repPrior, mutPrior: mutPrior, families: fams, report: rep };
    return ctx._tta;
  }

  /* A short synthesis pass under the adapted priors: the same search, a
     different order -- which is all a prior may change. */
  function adaptedSearch(ctx, deadline, width) {
    if (!ctx._tta || !Object.keys(ctx._tta.opPrior).length) return [];
    var progs = [];
    try { progs = SYN.search(ctx, 3, width || 200, deadline, 8, ctx.op_prior); } catch (e) { progs = []; }
    return progs;
  }

  function discard(ctx) { ctx._tta = null; }

  TESTTIME = { adapt: adapt, adaptedSearch: adaptedSearch, discard: discard, MUT_BY_SIG: MUT_BY_SIG };
})();
