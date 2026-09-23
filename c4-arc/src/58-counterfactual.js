/* ===== src/58-counterfactual.js ===== */
/* Counterfactual discrimination between exact explanations.
 *
 * When several programs reproduce every demonstration but predict different
 * test outputs, the demonstrations did not decide between them -- "move the
 * red object" and "move the leftmost object" agree whenever the red object
 * is leftmost. This module builds small synthetic situations from the test
 * (and training) INPUTS by edits that keep the task's surface constraints --
 * recolour two foreground colours, nudge one object, remove one object, swap
 * two same-sized objects -- runs the competing programs on them, and records
 * where they diverge and which of them break.
 *
 * What it does NOT do: there is no label for a counterfactual, so it cannot
 * say which program is right. It measures fragility (a program that returns
 * nothing, or violates an invariant every demonstration obeyed, on a
 * plausible variation of its input is less likely to be the general rule)
 * and reports the disagreement. The only effect on ranking is a bounded
 * fragility cost; description length and leave-one-out evidence still do the
 * rest.
 */

var CFACT = null;

(function () {
  var K = root.C4ReasonKernel;
  /* 0.5 cost units = 4 bits (8 bits per unit, as in 49-typed): a program that
     breaks on every probe pays the price of four extra bits of description,
     enough to separate near-ties, not enough to overturn strong evidence. */
  var FRAGILITY_COST = 0.5, MAX_REPS = 10, MAX_PROBES = 8;

  function objs(g, bg) {
    try { var o = O.segment(g, "c8", bg); return o.length <= 40 ? o : []; } catch (e) { return []; }
  }

  function probesFor(g, bg) {
    var out = [], os = objs(g, bg), hist = G.histogram(g), fg = [], v, i;
    for (v = 0; v < G.NCOLORS; v++) if (v !== bg && hist[v]) fg.push(v);
    fg.sort(function (a, b) { return (hist[b] - hist[a]) || (a - b); });
    if (fg.length >= 2) {
      var m = {}; m[fg[0]] = fg[1]; m[fg[1]] = fg[0];
      out.push({ kind: "swap_colors", grid: G.applyCmap(g, m) });
    }
    if (os.length >= 2) {
      var small = os.slice().sort(function (a, b) { return (a.size() - b.size()) || (a.r0 - b.r0) || (a.c0 - b.c0); })[0];
      var rm = G.copyGrid(g), it = small.cells.values(), s = it.next();
      while (!s.done) { rm[s.value >> 6][s.value & 63] = bg; s = it.next(); }
      out.push({ kind: "remove_object", grid: rm });
    }
    for (i = 0; i < os.length && i < 6; i++) {
      var moved = nudge(g, os[i], bg);
      if (moved) { out.push({ kind: "move_object", grid: moved }); break; }
    }
    for (i = 0; i < os.length; i++) {
      for (var j = i + 1; j < os.length; j++) {
        var a = os[i], b = os[j];
        var sameBox = a.height() === b.height() && a.width() === b.width();
        if (sameBox && (a.norm_key() !== b.norm_key() || a.color !== b.color)) {
          var sw = G.paste(g, G.subgrid(g, a.r0, a.c0, a.r1, a.c1), b.r0, b.c0);
          sw = G.paste(sw, G.subgrid(g, b.r0, b.c0, b.r1, b.c1), a.r0, a.c0);
          out.push({ kind: "swap_objects", grid: sw });
          i = os.length; break;
        }
      }
    }
    return out;
  }

  function nudge(g, o, bg) {
    var h = g.length, w = g[0].length, dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]], d;
    for (d = 0; d < dirs.length; d++) {
      var ok = true, out = G.copyGrid(g), it = o.cells.values(), s = it.next(), cells = [];
      while (!s.done) { cells.push(s.value); s = it.next(); }
      var own = new Set(cells), k;
      for (k = 0; k < cells.length && ok; k++) {
        var r = (cells[k] >> 6) + dirs[d][0], c = (cells[k] & 63) + dirs[d][1];
        if (r < 0 || r >= h || c < 0 || c >= w) ok = false;
        else if (!own.has(r * 64 + c) && g[r][c] !== bg) ok = false;
        /* keep a one-cell margin so the nudge does not merge objects */
      }
      if (!ok) continue;
      for (k = 0; k < cells.length; k++) out[cells[k] >> 6][cells[k] & 63] = bg;
      for (k = 0; k < cells.length; k++) {
        var r2 = cells[k] >> 6, c2 = cells[k] & 63;
        out[r2 + dirs[d][0]][c2 + dirs[d][1]] = g[r2][c2];
      }
      return out;
    }
    return null;
  }

  function adjust(ctx, fitted, sigsByIdx, res, deadline, budgetMs) {
    var info = { ran: false };
    res.diagnostics.counterfactual = info;
    if (!K || fitted.length < 2) { info.reason = "fewer_than_two"; return; }
    var groups = new Map(), reps = [], i;
    for (i = 0; i < fitted.length && i < 60; i++) {
      var sig = sigsByIdx.get(fitted[i][1]);
      if (!sig || sig.every(function (g) { return g === null; })) continue;
      var k = _sigKey(sig);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(fitted[i]);
    }
    if (groups.size < 2) { info.reason = "no_disagreement"; return; }
    /* representatives: every distinct behaviour's best program first, then
       runners-up, bounded */
    var lists = Array.from(groups.values()), round = 0;
    while (reps.length < MAX_REPS) {
      var added = false;
      for (i = 0; i < lists.length && reps.length < MAX_REPS; i++)
        if (lists[i][round]) { reps.push(lists[i][round]); added = true; }
      if (!added) break;
      round++;
    }
    var end = Math.min(deadline - 40, nowMs() + budgetMs * 0.06);
    if (end - nowMs() < 25) { info.reason = "no_budget"; return; }
    var bg = ctx.bg(), probes = [], srcs = ctx.test_inputs.concat(ctx.inputs().slice(0, 1));
    for (i = 0; i < srcs.length && probes.length < MAX_PROBES; i++)
      probes = probes.concat(probesFor(srcs[i], bg).map(function (p) { p.src = i; return p; }));
    probes = probes.slice(0, MAX_PROBES);
    if (!probes.length) { info.reason = "no_probes"; return; }
    var inv = RESID.invariantsOf(ctx);
    var timedOut = false;
    var disc = K.discriminate(reps.map(function (r) { return r[2]; }), probes, function (h, p) {
      if (nowMs() > end) { timedOut = true; return null; }
      return _prediction(h, p.grid);
    }, function (out, p) { return RESID.violations(out, p.grid, inv, bg) === 0; });
    if (timedOut) { info.reason = "timed_out"; return; }
    info.ran = true;
    info.probes = probes.map(function (p) { return p.kind; });
    info.behaviours = groups.size;
    info.divergent_probes = disc.divergentProbes.map(function (j) { return probes[j].kind; });
    info.hypotheses = [];
    for (i = 0; i < reps.length; i++) {
      var fragility = 1 - disc.robustness[i];
      var pen = FRAGILITY_COST * fragility;
      reps[i][0] += pen;
      info.hypotheses.push({ name: reps[i][2].solver + ":" + String(reps[i][2].name).slice(0, 80),
        robustness: Math.round(disc.robustness[i] * 100) / 100, violations: disc.violations[i],
        penalty: Math.round(pen * 100) / 100 });
    }
    /* pairs that never diverge on any probe yet predict differently are the
       interesting ambiguity: the counterfactuals did not reach it */
    var undecided = 0, a, b;
    for (a = 0; a < reps.length; a++) for (b = a + 1; b < reps.length; b++)
      if (disc.agreement[a][b] === 1 && _sigKey(sigsByIdx.get(reps[a][1])) !== _sigKey(sigsByIdx.get(reps[b][1]))) undecided++;
    info.undecided_pairs = undecided;
  }

  CFACT = { adjust: adjust, probesFor: probesFor, FRAGILITY_COST: FRAGILITY_COST };
})();
