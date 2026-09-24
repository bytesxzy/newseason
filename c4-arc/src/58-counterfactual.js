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

  /* ------------------------------------------------ active discrimination
   *
   * Instead of a fixed probe list: a pool of plausible perturbations of the
   * task's own inputs, from which the probes that make the competing
   * programs DISAGREE most are chosen. Candidate edits:
   *   recolour a role, move an object, duplicate an object, remove an object,
   *   resize an object, change spacing, change count (remove/duplicate),
   *   swap two objects, break a symmetry, keep a symmetry but move the
   *   content, recolour a distractor, change the canvas size (only when
   *   every demonstration already varies its size).
   * Plausibility: a valid grid, at least one object left, colours drawn from
   * the task's palette, the demonstrated input invariants kept (constant
   * input size, a background that stays the background). */
  function freeSpot(g, h, w, bg, avoid) {
    var H = g.length, W = g[0].length, r, c, i, j;
    for (r = 0; r + h <= H; r++) for (c = 0; c + w <= W; c++) {
      var ok = true;
      for (i = -1; i <= h && ok; i++) for (j = -1; j <= w; j++) {
        var y = r + i, x = c + j;
        if (y < 0 || y >= H || x < 0 || x >= W) continue;
        if (g[y][x] !== bg) { ok = false; break; }
      }
      if (ok && !(avoid && r === avoid[0] && c === avoid[1])) return [r, c];
    }
    return null;
  }
  function cellsOfObj(o) { var out = [], it = o.cells.values(), s = it.next(); while (!s.done) { out.push([s.value >> 6, s.value & 63]); s = it.next(); } return out; }
  function paintCells(g, cells, dr, dc, colorOf) {
    var out = G.copyGrid(g), i;
    for (i = 0; i < cells.length; i++) {
      var r = cells[i][0] + dr, c = cells[i][1] + dc;
      if (r < 0 || r >= g.length || c < 0 || c >= g[0].length) return null;
      out[r][c] = colorOf(cells[i]);
    }
    return out;
  }
  function mutationPool(ctx, g, bg) {
    var out = [], os = objs(g, bg), hist = G.histogram(g), fg = [], v, i;
    for (v = 0; v < G.NCOLORS; v++) if (v !== bg && hist[v]) fg.push(v);
    fg.sort(function (a, b) { return (hist[b] - hist[a]) || (a - b); });
    var taskPal = G.csList(G.csUnion(ctx.in_palette(), ctx.out_palette())).filter(function (c) { return c !== bg; });
    function push(kind, grid) { if (grid && G.valid(grid) && !G.gEq(grid, g)) out.push({ kind: kind, grid: grid }); }
    if (fg.length >= 2) { var m = {}; m[fg[0]] = fg[1]; m[fg[1]] = fg[0]; push("recolor_role", G.applyCmap(g, m)); }
    var unused = taskPal.filter(function (c) { return !hist[c]; });
    if (fg.length && unused.length) { var m2 = {}; m2[fg[fg.length - 1]] = unused[0]; push("recolor_distractor", G.applyCmap(g, m2)); }
    var bySize = os.slice().sort(function (a, b) { return (a.size() - b.size()) || (a.r0 - b.r0) || (a.c0 - b.c0); });
    if (os.length >= 2) {
      [bySize[0], bySize[bySize.length - 1]].forEach(function (o, k) {
        var rm = G.copyGrid(g); cellsOfObj(o).forEach(function (p) { rm[p[0]][p[1]] = bg; });
        push(k ? "remove_largest" : "remove_smallest", rm);
      });
    }
    for (i = 0; i < os.length && i < 4; i++) { var mv = nudge(g, os[i], bg); if (mv) { push("move_object", mv); if (i >= 1) break; } }
    if (os.length) {
      var o = bySize[0], cs = cellsOfObj(o), spot = freeSpot(g, o.height(), o.width(), bg, [o.r0, o.c0]);
      if (spot) push("duplicate_object", paintCells(g, cs, spot[0] - o.r0, spot[1] - o.c0, function (p) { return g[p[0]][p[1]]; }));
      if (o.is_rect && o.is_rect() && o.r1 + 1 < g.length) {
        var grow = G.copyGrid(g), ok = true;
        for (var cc = o.c0; cc <= o.c1; cc++) { if (g[o.r1 + 1][cc] !== bg) ok = false; else grow[o.r1 + 1][cc] = o.color; }
        if (ok) push("resize_object", grow);
      }
    }
    if (os.length >= 2) {
      var right = os.slice().sort(function (a, b) { return b.c1 - a.c1; })[0];
      var sp = paintCells(G.copyGrid(g), cellsOfObj(right), 0, 0, function () { return bg; });
      if (sp) { sp = paintCells(sp, cellsOfObj(right), 0, 1, function (p) { return g[p[0]][p[1]]; }); push("change_spacing", sp); }
      var a = bySize[0], b = bySize[bySize.length - 1];
      if (a.height() === b.height() && a.width() === b.width()) {
        var sw = G.paste(g, G.subgrid(g, a.r0, a.c0, a.r1, a.c1), b.r0, b.c0);
        sw = G.paste(sw, G.subgrid(g, b.r0, b.c0, b.r1, b.c1), a.r0, a.c0);
        push("swap_objects", sw);
      }
    }
    var fh = G.flipH(g);
    if (G.gEq(fh, g) && os.length) { var br = G.copyGrid(g); cellsOfObj(bySize[0]).forEach(function (p) { br[p[0]][p[1]] = bg; }); push("break_symmetry", br); }
    else if (os.length) push("move_content", G.translate(g, 0, 1, bg));
    /* canvas size: only when the demonstrations themselves vary in size */
    var dimsVary = new Set(ctx.inputs().map(function (x) { return x.length + "x" + x[0].length; })).size > 1;
    if (dimsVary && g.length < 30) push("change_canvas", G.vconcat(g, [g[0].map(function () { return bg; })]));
    return out;
  }
  function plausible(ctx, g, bg) {
    if (!g || !G.valid(g)) return false;
    if (!objs(g, bg).length) return false;
    var inPal = ctx.in_palette() | ctx.out_palette();
    if (!G.csSubset(G.palette(g), inPal)) return false;
    var shapes = new Set(ctx.inputs().map(function (x) { return x.length + "x" + x[0].length; }));
    if (shapes.size === 1 && !shapes.has(g.length + "x" + g[0].length)) return false;
    return G.background(g) === bg || !G.csHas(G.palette(g), bg);
  }
  /* fns: functions grid -> grid|null (the competing exact programs).
     Returns {probes: [kind], fragility: [per fn], disagreement, agreement,
     pool: n, behaviours: [probe outputs key per fn]} -- no labels. */
  function discriminate(ctx, fns, opts) {
    opts = opts || {};
    var end = nowMs() + (opts.budgetMs || 60), bg = ctx.bg(), inv = RESID.invariantsOf(ctx);
    var srcs = ctx.test_inputs.concat(ctx.inputs().slice(0, 1)), pool = [], i, j, k;
    for (i = 0; i < srcs.length && pool.length < 48; i++)
      pool = pool.concat(mutationPool(ctx, srcs[i], bg).filter(function (p) { return plausible(ctx, p.grid, bg); }));
    pool = pool.slice(0, 48);
    var outs = [], broken = fns.map(function () { return 0; }), evaluated = 0;
    for (i = 0; i < pool.length; i++) {
      if (nowMs() > end) break;
      var row = [];
      for (j = 0; j < fns.length; j++) {
        var y = null;
        try { y = fns[j](pool[i].grid); } catch (e) { y = null; }
        if (!y || !G.valid(y) || RESID.violations(y, pool[i].grid, inv, bg) > 0) { broken[j]++; row.push(null); }
        else row.push(G.gkey(y));
      }
      outs.push(row); evaluated++;
    }
    if (!evaluated) return { probes: [], fragility: fns.map(function () { return 0; }), disagreement: 0, pool: 0 };
    /* pairwise disagreement per probe, among programs that answered */
    var dis = outs.map(function (row) {
      var pairs = 0, differ = 0;
      for (j = 0; j < row.length; j++) for (k = j + 1; k < row.length; k++) {
        if (row[j] === null || row[k] === null) continue;
        pairs++; if (row[j] !== row[k]) differ++;
      }
      return pairs ? differ / pairs : 0;
    });
    var order = outs.map(function (_, q) { return q; }).sort(function (a, b) { return (dis[b] - dis[a]) || (a - b); });
    var chosen = [], kinds = {};
    order.forEach(function (q) { if (chosen.length < 6 && dis[q] > 0 && (kinds[pool[q].kind] || 0) < 2) { chosen.push(q); kinds[pool[q].kind] = (kinds[pool[q].kind] || 0) + 1; } });
    var agreement = fns.map(function (_, a) { return fns.map(function (__, b) {
      var same = 0, n = 0;
      outs.forEach(function (row) { if (row[a] !== null && row[b] !== null) { n++; if (row[a] === row[b]) same++; } });
      return n ? same / n : 1; }); });
    return {
      probes: chosen.map(function (q) { return pool[q].kind; }),
      fragility: broken.map(function (b) { return b / evaluated; }),
      disagreement: chosen.length ? chosen.reduce(function (s, q) { return s + dis[q]; }, 0) / chosen.length : 0,
      agreement: agreement, pool: evaluated,
      behaviours: fns.map(function (_, a) { return outs.map(function (row) { return row[a]; }).join("|"); })
    };
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
    var bg = ctx.bg();
    if (!ACTIVE) {
      /* the original fixed probe list (kept for ablation) */
      var probes = [], srcs = ctx.test_inputs.concat(ctx.inputs().slice(0, 1));
      for (i = 0; i < srcs.length && probes.length < MAX_PROBES; i++)
        probes = probes.concat(probesFor(srcs[i], bg).map(function (p) { p.src = i; return p; }));
      probes = probes.slice(0, MAX_PROBES);
      if (!probes.length) { info.reason = "no_probes"; return; }
      var inv = RESID.invariantsOf(ctx);
      var timedOut = false;
      var disc0 = K.discriminate(reps.map(function (r) { return r[2]; }), probes, function (h, p) {
        if (nowMs() > end) { timedOut = true; return null; }
        return _prediction(h, p.grid);
      }, function (out, p) { return RESID.violations(out, p.grid, inv, bg) === 0; });
      if (timedOut) { info.reason = "timed_out"; return; }
      info.ran = true; info.mode = "fixed";
      info.probes = probes.map(function (p) { return p.kind; });
      info.behaviours = groups.size;
      info.divergent_probes = disc0.divergentProbes.map(function (j) { return probes[j].kind; });
      info.hypotheses = [];
      for (i = 0; i < reps.length; i++) {
        var fr0 = 1 - disc0.robustness[i], pen0 = FRAGILITY_COST * fr0;
        reps[i][0] += pen0;
        info.hypotheses.push({ name: reps[i][2].solver + ":" + String(reps[i][2].name).slice(0, 80),
          robustness: Math.round(disc0.robustness[i] * 100) / 100, violations: disc0.violations[i], penalty: Math.round(pen0 * 100) / 100 });
      }
      return;
    }
    var disc = discriminate(ctx, reps.map(function (r) { return function (g) { return _prediction(r[2], g); }; }),
                            { budgetMs: Math.max(20, end - nowMs()) });
    if (!disc.pool) { info.reason = "no_probes"; return; }
    info.ran = true; info.mode = "active";
    info.pool = disc.pool;
    info.probes = disc.probes;
    info.behaviours = groups.size;
    info.divergent_probes = disc.probes;
    info.disagreement = Math.round(disc.disagreement * 1000) / 1000;
    info.hypotheses = [];
    /* per behaviour: its probe signature, for semantically diverse pass@2 */
    var sem = new Map();
    for (i = 0; i < reps.length; i++) {
      var fragility = disc.fragility[i];
      var pen = FRAGILITY_COST * fragility;
      reps[i][0] += pen;
      var sk = _sigKey(sigsByIdx.get(reps[i][1]));
      if (!sem.has(sk)) sem.set(sk, disc.behaviours[i]);
      info.hypotheses.push({ name: reps[i][2].solver + ":" + String(reps[i][2].name).slice(0, 80),
        robustness: Math.round((1 - fragility) * 100) / 100, penalty: Math.round(pen * 100) / 100 });
    }
    ctx._cfBehaviour = sem;
    /* pairs that never diverge on any probe yet predict differently are the
       interesting ambiguity: the counterfactuals did not reach it */
    var undecided = 0, a, b;
    for (a = 0; a < reps.length; a++) for (b = a + 1; b < reps.length; b++)
      if (disc.agreement[a][b] === 1 && _sigKey(sigsByIdx.get(reps[a][1])) !== _sigKey(sigsByIdx.get(reps[b][1]))) undecided++;
    info.undecided_pairs = undecided;
  }

  var ACTIVE = true;
  CFACT = { adjust: adjust, probesFor: probesFor, FRAGILITY_COST: FRAGILITY_COST, discriminate: discriminate,
            mutationPool: mutationPool, plausible: plausible,
            active: function (on) { if (on !== undefined) ACTIVE = !!on; return ACTIVE; } };
})();
