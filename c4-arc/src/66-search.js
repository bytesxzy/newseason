/* ===== src/66-search.js ===== */
/* Scheduling the entity-program search: pure search vs search-learn-search.
 *
 * The sketch engine exposes its search as ARMS (63-sketch.js): lazy streams
 * of candidate programs of one kind in one segmentation. Every pull is ONE
 * candidate execution, so compute is counted in executions and two
 * schedules can be compared at exactly the same count.
 *
 *   pure   arms are pulled by a fixed prior (the learned controller's, when
 *          one is installed, 67-controller.js); what the executed candidates
 *          reveal is never used.
 *   sls    search -> learn -> search. The execution budget is split into
 *          rounds (default 1/4, 1/4, 1/2). After each round the executed
 *          candidates -- failures included -- are relabelled in hindsight
 *          as evidence about their COMPONENTS (segmentation, candidate kind,
 *          operator family): each component's value is the best dense reward
 *          (exact demonstrations + agreement on the cells that matter) any of
 *          its candidates reached. Arm priorities are re-derived from those
 *          values, and the best near misses spawn REFINEMENT arms that
 *          search for a growth rule explaining exactly their residual. Arms
 *          whose candidates stay at zero reward decay; arms that produce
 *          new information are expanded.
 *
 * In production the schedule is sls with no execution cap (the wall clock
 * bounds it). The ablation tool (tools/arc-sls.js) runs both at matched
 * execution counts.
 */
var SEARCH = (function () {
  var SEG_PRIOR = { c8: 1.0, c4: 0.9, m8: 0.8, m4: 0.7, col: 0.6, bgin: 0.6, bg4: 0.5, panel: 0.6, rects: 0.45, cell: 0.45 };
  var TYPE_PRIOR = { rules: 1.0, relaxed: 0.55, fall: 0.5, grow: 0.8, refine: 0.9 };
  var CONTROLLER = null;         /* (ctx) -> {seg:{}, type:{}, fam:{}} log-prior bonuses */

  function staticPrior(arm, bonus) {
    var p = (SEG_PRIOR[arm.seg] || 0.5) + (TYPE_PRIOR[arm.type] || 0.5);
    if (arm.key.indexOf("+bg") >= 0) p += 0.05;
    if (bonus) p += (bonus.seg[arm.seg] || 0) + (bonus.type[arm.type] || 0) + (bonus.fam[arm.fam] || 0);
    return p;
  }

  /* Schema evidence per segmentation (correspondence fates, no search):
     which KINDS of candidate the demonstrations can support. */
  function segEvidence(ctx, seg) {
    return ctx.memo("segev:" + seg, function () {
      var bg = ctx.bg(), ev = { vacated: 0, recolor: 0, mixed: 0, same: 0, created: 0 }, t;
      for (t = 0; t < ctx.train.length; t++) {
        var x = ctx.train[t][0], y = ctx.train[t][1], sc = SCN.of(x, seg, bg);
        if (!sc) return null;
        (CORR.fates(sc, y) || []).forEach(function (f) {
          if (f.kind === "vacated") ev.vacated++;
          else if (f.kind === "recolor" || f.kind === "cmap") ev.recolor++;
          else if (f.kind === "mixed") ev.mixed++;
          else ev.same++;
        });
      }
      ev.created = ctx.memo("creates", function () { return true; }) ? 1 : 0;
      return ev;
    });
  }
  function schemaBonus(ctx, arm) {
    var ev = segEvidence(ctx, arm.seg);
    if (!ev) return 0;
    switch (arm.type) {
      case "rules": return ev.recolor + ev.vacated + ev.mixed > 0 ? 0.3 : -0.5;
      case "relaxed": return (ev.recolor + ev.mixed > 0) && ev.created ? 0.2 : -0.5;
      case "fall": return ev.vacated > 0 ? 0.3 : -0.8;
      case "grow": return ev.created ? 0.1 : -0.8;
      default: return 0;
    }
  }

  function run(ctx, arms, S, opts) {
    var mode = opts.mode || "sls", maxExec = opts.maxExec || Infinity;
    var bonus = null;
    if (CONTROLLER && opts.controller !== false) { try { bonus = CONTROLLER(ctx); } catch (e) { bonus = null; } }
    arms.forEach(function (a) { a.prior = staticPrior(a, bonus) + (opts.schema === false ? 0 : schemaBonus(ctx, a)); a.value = a.prior; });
    var comp = { seg: {}, type: {}, fam: {} }, spawned = new Set();
    S.wantReward = mode === "sls";
    /* pureref: the control for the ablation -- the same rounds and the same
       refinement arms, but spawned from the FIRST candidates of each niche
       in execution order, blind to how well they did */
    var blind = mode === "pureref";
    if (blind) mode = "sls";
    var rounds = mode === "sls" ? (opts.rounds || [0.25, 0.25, 0.5]) : [1];
    /* without an execution cap (production) the rounds end at absolute
       counts, so learning happens early and the clock bounds the rest */
    var PROD = [48, 160, 400, Infinity];
    if (mode === "sls" && maxExec === Infinity) rounds = PROD.map(function () { return 0; });
    var start = S.exec;
    for (var ri = 0; ri < rounds.length; ri++) {
      var cap;
      if (maxExec === Infinity) cap = mode === "sls" ? start + PROD[ri] : Infinity;
      else cap = start + Math.round(maxExec * rounds.slice(0, ri + 1).reduce(function (a, b) { return a + b; }, 0));
      if (ri === rounds.length - 1 && maxExec !== Infinity) cap = start + maxExec;
      var progressRound = [];
      /* one round: pull the best-valued arm, one candidate at a time */
      while (S.exec < cap && nowMs() < S.deadline) {
        var best = null, i;
        for (i = 0; i < arms.length; i++) {
          var a = arms[i];
          if (a.exhausted) continue;
          var v = a.value - 0.15 * Math.log(1 + a.pulls);
          if (!best || v > best.v) best = { a: a, v: v };
        }
        if (!best) break;
        var arm = best.a, prog = arm.next();
        if (!prog) continue;
        arm.pulls++;
        var res = SKETCH.execute(ctx, prog, arm, S);
        if (!res) continue;
        if (blind) { progressRound.push({ prog: prog, arm: arm, r: { score: 1, exact: 0 } }); continue; }
        if (res.reward) {
          progressRound.push({ prog: prog, arm: arm, r: res.reward });
          if (res.reward.score > arm.best) arm.best = res.reward.score;
        }
        if (opts.stopAt && S.found.length >= opts.stopAt) return;
      }
      if (mode !== "sls" || ri === rounds.length - 1) break;
      /* learn: hindsight credit to components, then re-prioritise and spawn
         refinement arms from the best near misses */
      if (!blind) progressRound.forEach(function (x) {
        [["seg", x.arm.seg], ["type", x.arm.type], ["fam", x.arm.fam]].forEach(function (kv) {
          var m = comp[kv[0]];
          if (!(kv[1] in m) || x.r.score > m[kv[1]]) m[kv[1]] = x.r.score;
        });
      });
      /* learning re-orders, it does not prune: a family whose first
         candidates miss may still hold the answer further down */
      if (!blind) arms.forEach(function (a) {
        var learned = (comp.seg[a.seg] || 0) + (comp.fam[a.fam] || 0) + a.best;
        a.value = a.prior + 0.8 * learned;
        if (a.pulls >= 8 && a.best === 0) a.value -= 0.3;          /* long plateau */
      });
      /* niches (MAP-Elites style): the elite of each (segmentation,
         family) cell is refined, so one cheap near-fit lineage cannot take
         every refinement slot */
      if (!blind) progressRound.sort(function (x, y) { return y.r.score - x.r.score; });
      var elites = [], niche = new Set();
      progressRound.forEach(function (x) {
        var nk = x.arm.seg + "/" + x.arm.fam + "/" + x.arm.type;
        if (niche.has(nk) || (!blind && x.r.score <= 0)) return;
        niche.add(nk); elites.push(x);
      });
      var made = 0;
      for (var k = 0; k < elites.length && made < 16; k++) {
        var near = elites[k];
        var key = SKETCH.progKey(near.prog);
        if (spawned.has(key)) continue;
        spawned.add(key);
        var ra = SKETCH.refineArm(ctx, near.prog, near.arm, S);
        ra.prior = staticPrior(ra, bonus);
        ra.value = ra.prior + 1.0 + (blind ? 0 : 1.0 * near.r.score);
        arms.push(ra);
        made++;
      }
    }
  }

  SKETCH.setSearch(run);
  return { run: run, SEG_PRIOR: SEG_PRIOR, TYPE_PRIOR: TYPE_PRIOR,
           setController: function (f) { CONTROLLER = f; } };
})();
