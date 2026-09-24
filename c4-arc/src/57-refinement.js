/* ===== src/57-refinement.js ===== */
/* The refinement stage of the portfolio: stop throwing away near-solutions.
 *
 *   generation   every family proposes programs; the verifier keeps exact
 *                ones (unchanged). Programs that fail are no longer silently
 *                dropped: a bounded, cheap record of the most promising
 *                failures of each family is kept (_noteNear), and the typed
 *                synthesiser hands over its closest non-exact search states.
 *   refinement   the reasoning kernel (c4-reason-kernel.js) runs over those
 *                near-misses with the ARC adapter (56-repair.js): execute,
 *                measure a structured residual, diagnose, repair the
 *                program, re-execute, keep a bounded diverse frontier,
 *                backtrack when a branch stalls, stop when nothing improves.
 *   emission     only programs that reproduce EVERY demonstration exactly
 *                (and execute on every test input) leave this stage, as
 *                ordinary hypotheses of family "repair". They then face the
 *                same ranking, deduplication and voting as everything else.
 *                A near-miss is never an answer.
 *
 * Budget. The stage runs on time the schedule has not used. When no family
 * has an executable exact explanation it may also take the evaluation
 * reserve the portfolio holds back for leave-one-out refits, which have
 * nothing to refit in that case. It never extends the task deadline.
 */

var REFINEMENT = null;

(function () {
  var K = root.C4ReasonKernel;
  var PER_MODULE = 6, MAX_SEEDS = 40, PER_FAMILY = 8, TYPED_NEAR = 10;

  /* Learned repair ordering; filled by 56a-repair-policy.js when present. */
  var POLICY = { weights: {}, table: null };
  function setPolicy(p) { POLICY = p || { weights: {}, table: null }; }

  var LOG = null;                     /* repair-policy training log, when enabled */
  /* stage switches (ablations): population search, the learned meta
     controller, allowed kernel actions, repair depth */
  var OPTS = { pop: true, meta: true, actions: null, maxDepth: 4, tta: true };
  function setOptions(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) OPTS[k] = o[k]; return OPTS; }
  function enableLog(on) { LOG = on ? [] : null; return LOG; }
  function takeLog() { var l = LOG; LOG = LOG ? [] : null; return l; }

  /* Near-misses are CandidateTraces in a CandidateSink (55a-candidate.js).
     These three entry points are kept for callers written against the
     original record lists; they route there. */
  function noteNear(ctx, mod, hyp, t, p) {
    var sink = ctx._nearSink;
    if (!sink || p === null) return;
    if (typeof sink.noteNear === "function") { sink.noteNear(ctx, mod, hyp, t, p); return; }
  }

  function noteTyped(ctx, struct, theta, dist, meta) {
    var sink = ctx._nearSink;
    if (!sink) return;
    if (typeof sink.noteTyped === "function") sink.noteTyped(ctx, struct, theta, dist, meta);
  }

  function newSink(ctx, opts) { return CANDIDATES.newSink(ctx || null, opts); }

  function seedsFrom(adapter, sink) {
    if (!sink.ctx) sink.ctx = adapter.ctx;
    return sink.seeds(adapter, { max: MAX_SEEDS, perFamily: PER_FAMILY, typed: TYPED_NEAR });
  }

  /* Leave-one-out for a repaired program: refit the parameters the repair
     introduced (the whole program when it is fully typed) on all but one
     demonstration and ask whether the refitted version space predicts the
     held-out one. A repair that only works when it has seen every example is
     distinguished from one that reconstructs examples it did not see. */
  var ENUMERABLE = { C: 1, I: 1, D: 1, A: 1, S: 1, K: 1, Y: 1, O: 1, R: 1 };
  function repairLOO(adapter, h, deadline) {
    var ctx = adapter.ctx, n = adapter.nTr;
    if (n < 2) return null;
    var tree = h.program.tree, base = h.program.base, slots = [], list = REPAIR.nodesOf(tree), i, j;
    for (i = 0; i < list.length; i++) {
      var node = list[i][0];
      if (node.op === "in" || !node.params) continue;
      if (base && !node.rep) continue;
      var kinds = REPAIR.paramKinds(node.op);
      for (j = 0; j < kinds.length; j++) {
        if (ENUMERABLE[kinds[j]]) slots.push({ path: list[i][1], j: j, kind: kinds[j] });
        else if ((kinds[j] === "M" || kinds[j] === "T") && list[i][1].length === 0) slots.push({ path: [], j: j, kind: kinds[j] });
      }
    }
    if (!slots.length) return null;
    var dom = PROG.domains(ctx), spaces = [], total = 1;
    slots.forEach(function (s) {
      var d = (s.kind === "M" || s.kind === "T") ? [null] : (s.kind === "K" ? [0, 1, 2] : dom[s.kind]);
      spaces.push(d); total *= d.length;
    });
    if (total > 1200) return null;
    var combos = PROG.product(spaces), bo = adapter.baseOutputs(base), env = { bg: adapter.bg };
    var wins = 0, trials = 0, f;
    for (f = 0; f < n; f++) {
      if (nowMs() > deadline) break;
      var mass = 0, good = 0, c;
      for (c = 0; c < combos.length; c++) {
        var t2 = REPAIR.clone(tree), ok = true, s2;
        for (s2 = 0; s2 < slots.length; s2++) {
          if (slots[s2].kind === "M" || slots[s2].kind === "T") continue;
          var nd = t2, p;
          for (p = 0; p < slots[s2].path.length; p++) nd = nd.kids[slots[s2].path[p]];
          nd.params[slots[s2].j] = combos[c][s2];
        }
        var mslot = slots.filter(function (s) { return s.kind === "M" || s.kind === "T"; })[0];
        if (mslot) {
          /* a table is solved from the held-in pairs, not enumerated */
          var kidF = REPAIR.fromTree(t2.kids[0]), pairs = [], q;
          for (q = 0; q < n; q++) {
            if (q === f) continue;
            var y0 = REPAIR.runTree(kidF, bo[q], adapter.grids[q], adapter.bg);
            if (!y0) { ok = false; break; }
            pairs.push([y0, ctx.train[q][1]]);
          }
          if (!ok) continue;
          var fixed = t2.params.slice(0, mslot.j), tab;
          if (mslot.kind === "T") {
            var xs = [];
            for (q = 0; q < n; q++) if (q !== f) xs.push(adapter.grids[q]);
            tab = REPAIR.fitCtxTable(t2.op === "cmap_n" ? 1 : 0, pairs, xs, adapter.bg);
          } else tab = PROG.fitTable(t2.op === "cmap" ? "cmap" : t2.op, fixed, pairs, env);
          if (!tab) continue;
          t2.params[mslot.j] = tab;
        }
        var fx = REPAIR.fromTree(t2);
        for (q = 0; q < n && ok; q++) {
          if (q === f) continue;
          var y = REPAIR.runTree(fx, bo[q], adapter.grids[q], adapter.bg);
          if (!y || !G.gEq(y, ctx.train[q][1])) ok = false;
        }
        if (!ok) continue;
        var w = Math.pow(2, -PROG.thetaBits(fx.struct, fx.theta));
        mass += w;
        var yh = REPAIR.runTree(fx, bo[f], adapter.grids[f], adapter.bg);
        if (yh && G.gEq(yh, ctx.train[f][1])) good += w;
      }
      trials++;
      if (mass > 0) wins += good / mass;
    }
    return trials ? { wins: wins, trials: trials } : null;
  }

  var REPAIR_MODULE = { __name__: "repair", SOLVER: "repair", PHASE: 3, NO_LOO: true,
                        generate: function () { return []; } };
  /* programs found by the adapted synthesis pass are ordinary typed
     programs; their module is typed synthesis (so leave-one-out applies) */
  var TTA_MODULE = { __name__: "typed_adapted", SOLVER: "typed", PHASE: 3,
                     generate: function (c) { return typeof moduleByName === "function" && moduleByName("typed") ? moduleByName("typed").generate(c) : []; } };

  function hasExecutable(ctx, reservoir) {
    return reservoir.a.some(function (item) {
      return ctx.test_inputs.length > 0 && ctx.test_inputs.every(function (g) { return _prediction(item[2], g) !== null; });
    });
  }

  /* Run the stage; returns the updated insertion order. */
  function stage(ctx, res, reservoir, order, bias, generationEnd, deadline, budgetMs) {
    var sink = ctx._nearSink;
    ctx._nearSink = null;
    var diag = { ran: false };
    res.diagnostics.refinement = diag;
    if (!sink || !K) return order;
    if (OPTS.off) { diag.skipped = "disabled"; return order; }
    var now = nowMs(), exec = hasExecutable(ctx, reservoir);
    /* time: what the schedule left unused; plus the evaluation reserve when
       nothing executable exists, keeping a small margin for voting */
    var end = exec ? generationEnd : deadline - Math.max(80, budgetMs * 0.05);
    diag.has_exact = exec;
    if (end - now < 40) { diag.skipped = "no_budget"; return order; }
    var adapter = new REPAIR.ArcAdapter(ctx);
    adapter.sink = sink;
    /* Nothing executable yet: adapt to THIS task before searching deeper
       (57b-testtime.js) -- temporary priors from its own demonstrations,
       then one synthesis pass under them. Exact programs found go straight
       to the reservoir; near states join the sink before seeding. */
    if (!exec && OPTS.tta && typeof TESTTIME !== "undefined" && end - now > 80) {
      try {
        var tta = TESTTIME.adapt(ctx, sink, { budgetMs: Math.min(150, (end - now) * 0.18) });
        diag.tta = tta.report;
        var synEnd = nowMs() + (end - nowMs()) * 0.3;
        ctx._nearSink = sink; ctx.deadline = synEnd;
        var progs = TESTTIME.adaptedSearch(ctx, synEnd, 200);
        ctx._nearSink = null;
        diag.tta.adapted_found = progs.length;
        progs.forEach(function (p) {
          var hy = new Hyp(p.name(), (function (q) { return function (g) { return q.run(g); }; })(p), 2.0 + p.codeLength() / 8.0, "typed");
          hy.prog = p;
          if (!ctx.test_inputs.every(function (g) { return _prediction(hy, g) !== null; })) return;
          var sc = hy.cost + Number(SOLVER_PRIOR.typed) + Number(bias.typed || 0);
          var it = [-sc, -order, hy, TTA_MODULE];
          order += 1;
          if (reservoir.a.length < 600) reservoir.push(it); else if (_itemCmp(it, reservoir.a[0]) > 0) reservoir.replaceRoot(it);
        });
        if (progs.length) exec = hasExecutable(ctx, reservoir);
      } catch (e) { ctx._nearSink = null; diag.tta_error = String(e && e.message).slice(0, 120); }
    }
    var sd = seedsFrom(adapter, sink);
    adapter.usedSeeds = sd.seeds.slice();
    diag.seed_families = sd.families;
    try { diag.candidates = sink.report(); } catch (e) { diag.candidates = null; }
    if (!sd.seeds.length) { diag.skipped = "no_near_misses"; return order; }
    diag.ran = true;
    ctx.deadline = end;
    var stats = new K.RepairStats(POLICY.table ? { table: POLICY.table } : null);
    var M = root.C4ReasonMeta, metaModel = OPTS.meta && M && M.hub.active() ? M.hub.active() : null;
    /* With an exact explanation in hand, refinement is a short search for
       alternatives. Without one it is the only remaining search, so a stall
       is tolerated for longer before giving up (the deadline still binds).
       Without one, it also shares the stage with population search
       (56a-popsearch.js): the kernel's best-first repair first, on half the
       time, then a population seeded from its frontier. */
    var refineEnd = (exec || !OPTS.pop) ? end : now + (end - now) * 0.5;
    var traj = [];
    var out = K.refine(adapter, sd.seeds, {
      deadline: refineEnd, maxSteps: exec ? 40 : 200, frontierCap: 48, clusterCap: 6, childCap: 12,
      maxDepth: OPTS.maxDepth, stallLimit: 3, maxStall: exec ? 12 : 40, exactCap: 12, afterExact: exec ? 0 : 4,
      weights: POLICY.weights, stats: stats, log: LOG, metaModel: metaModel, domain: "arc",
      actions: OPTS.actions || null, trajectory: traj, episodic: M && root.C4ReasonMemory ? root.C4ReasonMemory.shared.episodic : null
    });
    if (M && M.hub) M.hub.log(traj);
    var pop = null;
    if (OPTS.pop && !exec && !out.exact.length && end - nowMs() > 60 && typeof POPSEARCH !== "undefined") {
      var popSeeds = out.frontier.sorted().slice(0, 16);
      if (!popSeeds.length) popSeeds = sd.seeds;
      try { pop = POPSEARCH.search(adapter, popSeeds, { deadline: end, afterExact: 40 }); } catch (e) { pop = null; diag.popsearch_error = String(e && e.message).slice(0, 120); }
      if (pop) {
        var ps = pop.stats;
        diag.popsearch = { seeds: ps.seeds, generated: ps.generated, evaluated: ps.evaluated, struct_dup: ps.struct_dup,
          behavior_dup: ps.behavior_dup, exact: ps.exact, niches: ps.niches, archive: ps.archive, max_depth: ps.maxDepth,
          exact_depths: ps.exactDepths, best_start: ps.bestStart, best_end: ps.bestEnd, ms: ps.ms, by_class: ps.byClass,
          multi_edits: ps.multiEdits };
      }
    }
    var st = out.stats;
    diag.stats = { seeds: st.seeds, evaluated: st.evaluated, kept: st.kept, duplicates: st.duplicates,
      wasted: st.wasted, steps: st.steps, exact: st.exact, made_exact: st.madeExact,
      mean_depth: st.madeExact ? st.depthSum / st.madeExact : null, backtracks: st.backtracks,
      representation_switches: st.repsSwitched, best_start: st.bestStart, best_end: st.bestEnd,
      frontier: st.frontier, clusters: st.clusters, evicted: st.evicted, ms: st.ms,
      by_mutation: st.byMutation, by_diag: st.byDiag, survival: st.survival, plan: st.plan,
      struct_duplicates: st.structDuplicates, migrations: st.migrations, migration_kept: st.migrationKept,
      migration_exact: st.migrationExact, discriminations: st.discriminations, inventions: st.inventions,
      deep_verified: st.deepVerified, deep_failed: st.deepFailed, restarts: st.restarts, max_depth: st.maxDepthReached,
      by_action: st.byAction, memory: st.memory || null };
    diag.base_runs = adapter.stats.baseRuns;
    diag.exact = [];
    var i, looEnd = Math.min(deadline - Math.max(60, budgetMs * 0.03), nowMs() + budgetMs * 0.05);
    var exacts = out.exact.concat(pop ? pop.exact : []);
    for (i = 0; i < exacts.length; i++) {
      var h = exacts[i], base = h.program.base, fromPop = pop && pop.exact.indexOf(h) >= 0;
      var tb = REPAIR.treeBits(h.program.tree);
      var cost = base ? Number(base.cost) + (tb + h.repairBits) / 8 : 2.0 + (tb + h.repairBits) / 8;
      var fam = base ? base.solver : "typed";
      var prior = Number(SOLVER_PRIOR[fam] === undefined ? 2.0 : SOLVER_PRIOR[fam]) + Number(bias[fam] || 0);
      var loo = null;
      try { loo = repairLOO(adapter, h, looEnd); } catch (e) { loo = null; }
      var adj = loo && loo.trials ? (1.5 - 4.5 * loo.wins / loo.trials) * loo.trials / ctx.train.length : 0;
      var score = cost + prior + adj;
      if (!isFinite(score)) continue;
      var name = (fromPop ? "pop:" : "repair:") + (base ? base.solver + ":" + base.name + " >> " : "") + REPAIR.render(h.program.tree) +
                 (h.program.rep ? "@" + h.program.rep : "");
      var hyp = new Hyp(name, adapter.closure(h.program), cost, fromPop ? "popsearch" : "repair");
      hyp.lineage = lineageOf(h);
      hyp.representation = h.program.rep || "raw";
      if (!base && !h.program.rep && !REPAIR.usesInput(h.program.tree)) {
        var f = REPAIR.fromTree(h.program.tree);
        hyp.prog = new PROG.Prog(f.struct, f.theta, PROG.makeEnv(ctx));
      }
      var item = [-score, -order, hyp, REPAIR_MODULE];
      order += 1;
      if (reservoir.a.length < 600) reservoir.push(item);
      else if (_itemCmp(item, reservoir.a[0]) > 0) reservoir.replaceRoot(item);
      diag.exact.push({ name: name, score: Math.round(score * 100) / 100, loo: loo, lineage: hyp.lineage });
    }
    return order;
  }

  function lineageOf(h) {
    var chain = [], cur = h;
    while (cur && cur.lineage && cur.lineage.mutation) {
      chain.push({ mutation: cur.lineage.mutation.kind, detail: cur.lineage.mutation.detail,
                   why: cur.lineage.why, before: cur.lineage.residualBefore, after: cur.lineage.residualAfter });
      cur = cur.lineage.parentRef;
    }
    return chain.reverse();
  }

  REFINEMENT = { noteNear: noteNear, noteTyped: noteTyped, newSink: newSink, stage: stage,
                 seedsFrom: seedsFrom, repairLOO: repairLOO, setPolicy: setPolicy,
                 policy: function () { return POLICY; }, enableLog: enableLog, takeLog: takeLog,
                 options: setOptions,
                 MODULE: REPAIR_MODULE };
})();
