/* ===== src/65-psyn-learn.js ===== */
/* Constrained synthesis of object-rewriting programs.
 *
 * The program family is a pipeline of STAGES. A stage is a representation (a parse) plus an ordered decision list of
 * rules; a rule is (selector version space member, effect template). The learner never enumerates complete programs.
 * It works backwards from the demonstrated outputs:
 *
 *   1. perceive every demonstration under a parse and diff input against output (the cells that must change);
 *   2. abstract execution prunes effect kinds whose footprint cannot touch the changed cells at all;
 *   3. inverse semantics derive each effect's parameters from the output (the colour an object shows, the translation
 *      that reproduces it, the symmetry that matches it, the ray colour), per object, with colour parameters expressed
 *      as literals, scene roles or relations whenever those also witness the data;
 *   4. for each effect template, objects split into positives (the effect is consistent and explains still-unexplained
 *      cells), negatives (applying it would contradict the output) and don't-cares; the selector version space
 *      (64-psyn-select.js) returns the conjunctions that include positives and exclude every negative;
 *   5. a greedy minimum-description-length cover adds rules until every changed cell is explained; leftovers become the
 *      next stage, parsed afresh from the intermediate state.
 *
 * Every program returned has been executed on every demonstration and reproduces it exactly; nothing else is emitted.
 */

(function () {
  var P = PSYN, FX = P.FX, Bits = P.Bits;
  var COLOR_KINDS = ["recolor", "fillbox", "fillholes", "halo8", "halo4"];
  var OWN_KINDS = { delete: 1, recolor: 1, cmap: 1, d4: 1, move: 1, slide: 1 };       /* touch the object's own cells */
  var MAX_RULES = 4, MAX_STAGES = 3, MAX_OBJ_TOTAL = 360, RULE_PENALTY = 3.0, LAMBDA = 0.6;

  function deltaOf(I, O) {
    var H = I.length, W = I[0].length, d = new Uint8Array(H * W), n = 0, r, c;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (I[r][c] !== O[r][c]) { d[r * W + c] = 1; n++; }
    return { d: d, n: n };
  }

  /* ------------------------------------------------------------------ execution of a learned stage */
  function matches(rule, sc, o) {
    var i;
    for (i = 0; i < rule.atoms.length; i++) if (!P.evalAtom(rule.atoms[i], sc, o)) return false;
    return true;
  }
  function thetaOf(rule, sc, o) {
    var f = FX[rule.kind];
    if (f.param === "color") return P.evalRef(rule.ref, sc, o);
    return rule.th;
  }
  function runStage(stage, g, acct) {
    var sc = P.parse(g, stage.parse, stage.bgMode);
    if (sc.tooMany) return null;
    var out = G.copyGrid(g), clr = [], pnt = [], i, j, o, rule, th, w, k;
    for (i = 0; i < sc.n; i++) {
      o = sc.objs[i];
      /* union semantics: EVERY rule whose selector matches applies. Each learned rule is consistent with the output on its
         own, so the union of their writes is consistent too and there is nothing to arbitrate between rules. */
      for (j = 0; j < stage.rules.length; j++) {
        rule = stage.rules[j];
        if (!matches(rule, sc, o)) continue;
        th = thetaOf(rule, sc, o);
        if (FX[rule.kind].param === "color" && th < 0) return null;
        w = FX[rule.kind].writes(o, th, sc);
        if (!w) return null;
        for (k = 0; k < w.clr.length; k++) clr.push(w.clr[k]);
        for (k = 0; k < w.pnt.length; k++) pnt.push(w.pnt[k]);
      }
    }
    for (k = 0; k < clr.length; k++) out[(clr[k] / sc.W) | 0][clr[k] % sc.W] = sc.bg;
    for (k = 0; k < pnt.length; k += 2) out[(pnt[k] / sc.W) | 0][pnt[k] % sc.W] = pnt[k + 1];
    return out;
  }
  function runProgram(prog, g) {
    var cur = g, i;
    for (i = 0; i < prog.stages.length; i++) { cur = runStage(prog.stages[i], cur); if (cur === null) return null; }
    return cur;
  }

  function ruleStr(rule, atomsDesc) {
    var f = FX[rule.kind];
    return "[" + (atomsDesc || rule.atoms.map(P.atomStr).join(" & ") || "true") + "] -> " + f.str(rule.th, rule.ref);
  }
  function stageStr(st) { return st.parse + "{" + st.rules.map(function (r) { return ruleStr(r); }).join("; ") + "}"; }
  function progStr(p) { return p.stages.map(stageStr).join(" >> "); }

  /* ------------------------------------------------------------------ one stage */
  /* pairs: [[I, O], ...] with I,O of equal shape. Returns a list of {stage, uncoveredCells, bits, accounts}. */
  function learnStage(pairs, parseId, ctx, acct, trace) {
    var scenes = pairs.map(function (p) { return P.parse(p[0], parseId, "mode"); }), d, s, total = 0;
    for (d = 0; d < scenes.length; d++) { if (scenes[d].tooMany) return null; total += scenes[d].n; }
    if (!total || total > MAX_OBJ_TOTAL) return null;
    /* identical partitions under different parse names are the same representation: perceive once */
    if (acct._partSeen) {
      var pk = scenes.map(function (sc9) { return sc9.objs.map(function (o9) { return o9.cells.join(","); }).join(";"); }).join("|") + "#" + pairs.map(function (p9) { return G.gkey(p9[0]); }).join("~");
      if (acct._partSeen[pk]) { acct.parses_duplicate = (acct.parses_duplicate || 0) + 1; return null; }
      acct._partSeen[pk] = 1;
    }
    var deltas = pairs.map(function (p) { return deltaOf(p[0], p[1]); }), nDelta = 0;
    deltas.forEach(function (x) { nDelta += x.n; });
    if (!nDelta) return null;
    acct.parses_tried++;

    /* ---- abstract execution: which effect kinds can touch the changed cells at all? */
    var outsideObj = 0, onBgOnly = true, onObjCells = 0, delOnly = true, cell, r, c, kinds;
    for (d = 0; d < scenes.length; d++) {
      var sc0 = scenes[d], I = pairs[d][0], O = pairs[d][1];
      for (r = 0; r < sc0.H; r++) for (c = 0; c < sc0.W; c++) {
        if (!deltas[d].d[r * sc0.W + c]) continue;
        if (sc0.at[r * sc0.W + c] < 0) outsideObj++; else onObjCells++;
        if (I[r][c] !== sc0.bg) onBgOnly = false;
        if (O[r][c] !== sc0.bg) delOnly = false;
      }
    }
    kinds = Object.keys(FX);
    var allowed = [];
    kinds.forEach(function (k) {
      var drop = false;
      if (onBgOnly && OWN_KINDS[k] && k !== "move" && k !== "slide") drop = true;          /* only background changes: own-cell effects can't matter */
      if (!outsideObj && !OWN_KINDS[k] && k !== "copy") drop = true;                         /* nothing changes outside objects: bg-writing effects are moot */
      if (delOnly && k !== "delete" && k !== "move" && k !== "slide") drop = true;          /* only removals */
      if (drop) acct.pruned_abstract++; else allowed.push(k);
    });
    if (!allowed.length) { acct.parses_pruned++; return null; }

    /* ---- universe and atoms */
    var U = new P.Universe(scenes), atoms = P.generateAtoms(U);
    if (atoms.length > 1400) atoms = atoms.slice(0, 1400);

    var uncovered = deltas.map(function (x) { return new Uint8Array(x.d); });
    /* ---- inverse semantics: effect templates witnessed by the output */
    var templates = [], tkeys = {};
    function addT(t) {
      var key = t.kind + "|" + (t.ref ? P.refKey(t.ref) : JSON.stringify(t.th === undefined ? null : t.th));
      if (!tkeys[key]) { tkeys[key] = t; t.n = 0; templates.push(t); }
      tkeys[key].n++;
    }
    var refsFor = function (sc, o, col) {
      var out = [P.lit(col)], k;
      P.ROLE_NAMES.forEach(function (rn) { if (sc.roles()[rn] === col) out.push({ kind: "role", v: rn }); });
      P.REL_NAMES.forEach(function (rn) { if (P.REL[rn](sc, o) === col) out.push({ kind: "rel", v: rn }); });
      return out;
    };
    var u, item, fxk, inf, j;
    for (u = 0; u < U.n; u++) {
      item = U.items[u]; var scU = scenes[item.s], IU = pairs[item.s][0], OU = pairs[item.s][1];
      for (j = 0; j < allowed.length; j++) {
        fxk = allowed[j];
        if (fxk === "delete") { if (u === 0) addT({ kind: "delete", th: null }); continue; }
        inf = FX[fxk].infer(item.o, scU, IU, OU);
        inf.forEach(function (v) {
          if (FX[fxk].param === "color") {
            if (v === item.o.color && (fxk === "recolor")) return;               /* no-op recolour is not evidence */
            refsFor(scU, item.o, v).forEach(function (ref) { addT({ kind: fxk, ref: ref }); });
            acct.inverse_applied++;
          } else { addT({ kind: fxk, th: v }); acct.inverse_applied++; }
        });
      }
    }
    if (!templates.length) return null;
    /* keep the best-witnessed templates per kind: a vector seen on one object only is a coincidence far more often than a rule */
    var perKind = {}, kept = [];
    templates.sort(function (x, y) { return y.n - x.n; });
    templates.forEach(function (t0) { perKind[t0.kind] = (perKind[t0.kind] || 0) + 1; if (perKind[t0.kind] <= 14) kept.push(t0); });
    templates = kept;
    acct.nodes += templates.length;

    /* ---- per-template write sets (cached), then greedy MDL cover */
    var wcache = templates.map(function () { return new Array(U.n); }), ccache = templates.map(function () { return new Uint8Array(U.n); });
    templates.forEach(function (t, ti) {
      for (u = 0; u < U.n; u++) {
        item = U.items[u]; var sc = scenes[item.s];
        var th = FX[t.kind].param === "color" ? P.evalRef(t.ref, sc, item.o) : t.th, w = null;
        if (!(FX[t.kind].param === "color" && th < 0)) w = FX[t.kind].writes(item.o, th, sc);
        wcache[ti][u] = w;
        ccache[ti][u] = w && P.consistent(w, sc, pairs[item.s][0], pairs[item.s][1]) ? 1 : 0;
      }
    });
    var handled = new Uint8Array(U.n), rules = [], iter, covTotal = nDelta;
    var uncoveredCount = function () { var n = 0; uncovered.forEach(function (x) { for (var i = 0; i < x.length; i++) n += x[i]; }); return n; };
    var vsInfo = [];
    for (iter = 0; iter < MAX_RULES; iter++) {
      if (ctx && ctx.timed_out()) break;
      if (!uncoveredCount()) break;
      var best = null, ti2;
      for (ti2 = 0; ti2 < templates.length; ti2++) {
        var pos = Bits.make(U.n), neg = Bits.make(U.n), wts = new Array(U.n), any = false, tot = 0;
        for (u = 0; u < U.n; u++) {
          if (ccache[ti2][u]) {
            var cv = P.coverage(wcache[ti2][u], scenes[U.items[u].s], pairs[U.items[u].s][0], pairs[U.items[u].s][1], uncovered[U.items[u].s]);
            if (cv > 0) { Bits.set(pos, u); wts[u] = cv; any = true; tot += cv; } else wts[u] = 0;
          } else { Bits.set(neg, u); wts[u] = 0; }
        }
        if (!any) continue;
        var st = {}, sols = P.learnSelectors(U, atoms, pos, neg, wts, { stats: st });
        if (acct.diag) acct.diag.push({ parse: parseId, iter: iter, kind: templates[ti2].kind, ref: templates[ti2].ref ? P.refStr(templates[ti2].ref) : JSON.stringify(templates[ti2].th), pos: Bits.count(pos), neg: Bits.count(neg), tot: tot, sols: sols.length, S: st.S, exact: st.exact });
        acct.vs_member_estimate += st.consistent || 0; acct.vs_collapsed += st.classes || 0;
        if (!sols.length) continue;
        /* a rule must be SUPPORTED: seen on at least two objects, in at least two demonstrations when there are two */
        var sol2 = null, sj;
        for (sj = 0; sj < sols.length && !sol2; sj++) {
          var demosHit = {}, nHit = 0;
          for (u = 0; u < U.n; u++) if (Bits.get(sols[sj].mask, u) && Bits.get(pos, u)) { demosHit[U.items[u].s] = 1; nHit++; }
          if (nHit >= Math.min(2, total) && Object.keys(demosHit).length >= Math.min(2, pairs.length)) sol2 = sols[sj];
        }
        if (!sol2) { if (acct.diag) acct.diag.push({ parse: parseId, iter: iter, kind: templates[ti2].kind, why: "support" }); continue; }
        var s0 = sol2, tb = FX[templates[ti2].kind].bits(templates[ti2].th, templates[ti2].ref);
        var gain = s0.w - LAMBDA * (s0.bits + tb + RULE_PENALTY);
        if (s0.w < 1) continue;
        if (!best || gain > best.gain) best = { ti: ti2, sol: s0, sols: sols, gain: gain, w: s0.w, tb: tb, st: st };
      }
      if (!best) break;
      var t = templates[best.ti];
      var rule = { kind: t.kind, th: t.th, ref: t.ref, atoms: best.sol.ids.map(function (i) { return atoms[i].spec; }), bits: best.sol.bits + best.tb + RULE_PENALTY,
                   alt: best.sols.slice(1, 4).map(function (s2) { return { atoms: s2.ids.map(function (i) { return atoms[i].spec; }), bits: s2.bits }; }) };
      rules.push(rule);
      vsInfo.push({ vs: best.st.classes || 0, estimate: best.st.consistent || 0 });
      /* mark selected objects handled and their covered cells explained */
      for (u = 0; u < U.n; u++) {
        if (!Bits.get(best.sol.mask, u)) continue;
        if (!ccache[best.ti][u]) continue;
        var wr = wcache[best.ti][u], scu = scenes[U.items[u].s], Ou = pairs[U.items[u].s][1], k2, cell2;
        for (k2 = 0; k2 < wr.pnt.length; k2 += 2) { cell2 = wr.pnt[k2]; if (Ou[(cell2 / scu.W) | 0][cell2 % scu.W] === wr.pnt[k2 + 1]) uncovered[U.items[u].s][cell2] = 0; }
        for (k2 = 0; k2 < wr.clr.length; k2++) { cell2 = wr.clr[k2]; if (Ou[(cell2 / scu.W) | 0][cell2 % scu.W] === scu.bg) uncovered[U.items[u].s][cell2] = 0; }
      }
    }
    if (!rules.length) return null;
    var stage = { parse: parseId, bgMode: "mode", rules: rules, bits: 2.0 + rules.reduce(function (a, r2) { return a + r2.bits; }, 0), vs: vsInfo };
    return { stage: stage, left: uncoveredCount() };
  }

  /* ------------------------------------------------------------------ the pipeline search */
  function exactOn(prog, pairs) {
    var i, p;
    for (i = 0; i < pairs.length; i++) { p = runProgram(prog, pairs[i][0]); if (!p || !G.gEq(p, pairs[i][1])) return false; }
    return true;
  }

  function search(train, testInputs, ctx, acct, trace) {
    var out = [], near = [], parses = P.PARSES;
    if (!train.every(function (p) { return p[0].length === p[1].length && p[0][0].length === p[1][0].length; })) return { programs: out, near: near };
    acct._partSeen = {};
    function residualCells(inter, pairs) {
      var after = 0, i2, r2, c2;
      for (i2 = 0; i2 < pairs.length; i2++) for (r2 = 0; r2 < pairs[i2][0].length; r2++) for (c2 = 0; c2 < pairs[i2][0][0].length; c2++) if (inter[i2][r2][c2] !== pairs[i2][1][r2][c2]) after++;
      return after;
    }
    function before(pairs) {
      var n = 0, i2, r2, c2;
      for (i2 = 0; i2 < pairs.length; i2++) for (r2 = 0; r2 < pairs[i2][0].length; r2++) for (c2 = 0; c2 < pairs[i2][0][0].length; c2++) if (pairs[i2][0][r2][c2] !== pairs[i2][1][r2][c2]) n++;
      return n;
    }
    /* depth-first over representations. Every stage tries each parse; stages that leave a residual are ranked by how much
       they explained and only the best two continue, so the stage tree stays small instead of 5^depth. */
    function rec(pairs, prefix, depth, bitsSoFar) {
      var pi, res, prog, inter, cont = [], b0 = before(pairs);
      for (pi = 0; pi < parses.length; pi++) {
        if (ctx && ctx.timed_out()) return;
        res = learnStage(pairs, parses[pi], ctx, acct, trace);
        if (!res) continue;
        prog = { stages: prefix.concat([res.stage]), bits: bitsSoFar + res.stage.bits };
        if (trace) trace.add({ a: "stage", parse: parses[pi], depth: depth, rules: res.stage.rules.length, left: res.left });
        inter = pairs.map(function (p) { return runStage(res.stage, p[0]); });
        if (inter.some(function (x) { return x === null; })) continue;
        var after = residualCells(inter, pairs);
        if (after === 0) { out.push(prog); continue; }
        if (after < b0) cont.push({ prog: prog, inter: inter, after: after });
        else near.push({ prog: prog, residual: after / Math.max(1, b0) });
      }
      if (depth + 1 >= MAX_STAGES) { cont.forEach(function (c) { near.push({ prog: c.prog, residual: c.after / Math.max(1, b0) }); }); return; }
      cont.sort(function (a, b) { return a.after - b.after; });
      cont.slice(0, 2).forEach(function (c) {
        if (ctx && ctx.timed_out()) return;
        acct.stage_chains++;
        rec(c.inter.map(function (g2, k2) { return [g2, pairs[k2][1]]; }), c.prog.stages, depth + 1, c.prog.bits);
      });
      cont.slice(2).forEach(function (c) { near.push({ prog: c.prog, residual: c.after / Math.max(1, b0) }); });
    }
    rec(train, [], 0, 0);
    return { programs: out, near: near };
  }

  /* Leave-one-demonstration-out generalisation: relearn from the other demonstrations and ask whether the held-out one is
     reproduced exactly. A program that merely memorises its demonstrations cannot pass. Returns the fraction passed. */
  function looScore(train, ctx, acct, deadlineMs) {
    if (train.length < 3) return null;
    var pass = 0, i, held, rest, sub, res, ok, j, p, k;
    for (i = 0; i < train.length; i++) {
      if (Date.now() > deadlineMs || (ctx && ctx.timed_out && false)) return pass / train.length * (train.length) / train.length;
      held = train[i]; rest = train.slice(0, i).concat(train.slice(i + 1));
      var subCtx = { timed_out: function () { return Date.now() > deadlineMs; } };
      res = search(rest, [held[0]], subCtx, new P.Accounts(), null);
      ok = false;
      res.programs.sort(function (a, b) { return a.bits - b.bits; });
      for (j = 0; j < Math.min(4, res.programs.length); j++) { p = runProgram(res.programs[j], held[0]); if (p && G.gEq(p, held[1])) { ok = true; break; } }
      if (ok) pass++;
    }
    return pass / train.length;
  }

  /* ------------------------------------------------------------------ solver family */
  var _h = mkHyp("psyn");
  var MODE = { value: "ensemble" };            /* 'off' | 'shadow' | 'ensemble' */
  var LAST = { acct: null, near: [], trace: null, programs: [] };

  function generate(ctx) {
    if (MODE.value === "off") return [];
    var acct = new P.Accounts(), trace = new P.Trace({ ntrain: ctx.train.length });
    LAST = { acct: acct, near: [], trace: trace, programs: [] };
    var found;
    try { found = P.synthesize(ctx.train, ctx.test_inputs, ctx, acct, trace); } catch (e) { LAST.error = String(e && e.stack || e).slice(0, 400); return []; }
    var store = new P.EStore(acct), hyps = [];
    found.programs.sort(function (a, b) { return a.rank - b.rank; });
    found.programs.slice(0, 24).forEach(function (prog) {
      var key = prog.str;
      var adm = store.admit(key, function () {
        var fp = [], i, g;
        for (i = 0; i < ctx.train.length; i++) { g = prog.run(ctx.train[i][0]); if (!g) return null; fp.push(G.gkey(g)); }
        for (i = 0; i < ctx.test_inputs.length; i++) { g = prog.run(ctx.test_inputs[i]); fp.push(g ? G.gkey(g) : "x"); }
        return fp.join("|");
      }, prog);
      if (adm.status !== "new") return;
      var h = _h("psyn:" + key, prog.run, 2.0 + prog.rank / 8.0);
      h.psyn = { kind: prog.kind, bits: prog.bits };
      hyps.push(h);
    });
    LAST.programs = found.programs; LAST.near = found.near;
    return hyps;
  }
  var mod = defSolver("psyn", "psyn", generate, 1, 1.2);
  mod.EXTRA = true;                                     /* runs on its own time, added to the task deadline (50-portfolio.js) */
  mod.DIAG = function () { return LAST.acct ? { accounts: LAST.acct.toJSON(), near: LAST.near.length, error: LAST.error || null } : null; };

  P.ObjFX = { runProgram: runProgram, progStr: progStr, search: search, looScore: looScore, learnStage: learnStage, mode: MODE, last: function () { return LAST; }, module: mod };
})();
