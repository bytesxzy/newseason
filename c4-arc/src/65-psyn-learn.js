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
  var OWN_KINDS = { delete: 1, recolor: 1, cmap: 1, d4: 1, move: 1, slide: 1, partmap: 1 };       /* touch the object's own cells */
  var MAX_RULES = 4, MAX_STAGES_DEFAULT = 3, MAX_OBJ_TOTAL = 360, RULE_PENALTY = 3.0, LAMBDA = 0.6, BEAM_PARSES = 2, BEAM_ALT = 2, IDLE_COST = 2.5, CELL_BITS = 1 / 0.6, CONT_N = +(typeof process !== "undefined" && process.env && process.env.PSYN_CONT_N || 2), MARGINAL = +(typeof process !== "undefined" && process.env && process.env.PSYN_MARGINAL || 0.5), RULE_GROW = +(typeof process !== "undefined" && process.env && process.env.PSYN_RULE_GROW || 0);

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
      var ownDone = false;
      for (j = 0; j < stage.rules.length; j++) {
        rule = stage.rules[j];
        if (!matches(rule, sc, o)) continue;
        /* an object has one fate: at most one effect that rewrites its own cells (first rule wins); effects that only add
           cells elsewhere (halo, fill, ray, copy) stack freely */
        if (OWN_KINDS[rule.kind]) { if (ownDone) continue; ownDone = true; }
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

  /* ABLATION ONLY (PSYN_OFF=inverse): the forward alternative to inverse semantics for the effects whose parameter domains are
     small enough to sweep -- every colour, direction and axis -- leaving consistency checking to do the filtering. Effects with
     unbounded domains (move/copy vectors, stamp patterns, position tables) cannot be swept and keep their inferred values. */
  var NAIVE = (function () {
    function colors() { var o = [], c; for (c = 0; c < 10; c++) o.push(c); return o; }
    var nv = {};
    ["recolor", "fillbox", "fillholes", "halo8", "halo4"].forEach(function (k) { nv[k] = colors; });
    nv.ray = function () { var o = [], d, c; for (d = 0; d < 8; d++) { o.push({ d: d, col: -1 }); for (c = 0; c < 10; c++) o.push({ d: d, col: c }); } return o; };
    nv.between = function () { var o = [], a, sm, c; for (a = 0; a < 5; a++) for (sm = 0; sm < 2; sm++) { o.push({ ax: a, same: sm, col: -1 }); for (c = 0; c < 10; c++) o.push({ ax: a, same: sm, col: c }); } return o; };
    return nv;
  })();

  /* size of the parameter domain a forward enumerator would sweep for one (object, effect) pair; 1e6 stands for 'effectively unbounded' */
  function naiveDomain(kind, H, W) {
    switch (kind) {
      case "delete": return 1;
      case "recolor": case "fillbox": case "fillholes": case "halo8": case "halo4": return 10;
      case "ray": return 8 * 11;
      case "between": return 5 * 2 * 11;
      case "move": case "copy": return (2 * H - 1) * (2 * W - 1) - 1;
      case "slide": return 4;
      case "d4": return 8;
      case "cmap": return 100;
      case "partmap": case "stamp": return 1000000;
      default: return 10;
    }
  }

  /* ------------------------------------------------------------------ one stage */
  /* pairs: [[I, O], ...] with I,O of equal shape. Returns a list of {stage, uncoveredCells, bits, accounts}. */
  function learnStage(pairs, parseId, ctx, acct, trace, forbid) {
    var scenes = pairs.map(function (p) { return P.parse(p[0], parseId, "mode"); }), d, s, total = 0;
    for (d = 0; d < scenes.length; d++) { if (scenes[d].tooMany) return null; total += scenes[d].n; }
    if (!total || total > MAX_OBJ_TOTAL) return null;
    /* identical partitions under different parse names are the same representation: perceive once */
    if (acct._partSeen && !forbid) {
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
    var allowed = [], feat = acct._feat || null;
    kinds.forEach(function (k) {
      var drop = false;
      /* the learned operator proposer: kinds that essentially never appear in correct programs for tasks like this one */
      if (feat && P.Policy && !P.Policy.keepKind(feat, k)) { acct.pruned_learned = (acct.pruned_learned || 0) + 1; return; }
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
      acct.tmpl_raw = (acct.tmpl_raw || 0) + 1;
      if (!tkeys[key]) { tkeys[key] = t; t.n = 0; t.key = key; templates.push(t); }
      tkeys[key].n++;
    }
    var refsFor = function (sc, o, col) {
      var out = [P.lit(col)], k;
      if (!P.off("roles")) P.ROLE_NAMES.forEach(function (rn) { if (sc.roles()[rn] === col) out.push({ kind: "role", v: rn }); });
      if (!P.off("relations")) P.REL_NAMES.forEach(function (rn) { if (P.REL[rn](sc, o) === col) out.push({ kind: "rel", v: rn }); });
      return out;
    };
    var u, item, fxk, inf, j;
    for (u = 0; u < U.n; u++) {
      item = U.items[u]; var scU = scenes[item.s], IU = pairs[item.s][0], OU = pairs[item.s][1];
      for (j = 0; j < allowed.length; j++) {
        fxk = allowed[j];
        if (fxk === "delete") { if (u === 0) addT({ kind: "delete", th: null }); continue; }
        inf = P.off("inverse") && NAIVE[fxk] ? NAIVE[fxk]() : FX[fxk].infer(item.o, scU, IU, OU);
        /* what the forward direction would have had to enumerate for this (object, effect) pair, against what the output dictated */
        acct.naive_params = (acct.naive_params || 0) + naiveDomain(fxk, scU.H, scU.W);
        acct.inferred_params = (acct.inferred_params || 0) + inf.length;
        if (!inf.length) acct.pruned_inverse++;
        inf.forEach(function (v) {
          if (FX[fxk].param === "color") {
            if (v === item.o.color && (fxk === "recolor")) return;               /* no-op recolour is not evidence */
            refsFor(scU, item.o, v).forEach(function (ref) { addT({ kind: fxk, ref: ref }); });
            acct.inverse_applied++;
          } else { addT({ kind: fxk, th: v }); acct.inverse_applied++; }
        });
      }
    }
    /* objects of different sizes witness different parts of one position table: merge non-conflicting tables per feature */
    (function () {
      var byF = {}, merged;
      templates.forEach(function (t0) { if (t0.kind === "partmap") (byF[t0.th.f] = byF[t0.th.f] || []).push(t0); });
      Object.keys(byF).forEach(function (f) {
        var union = {}, ok = true, n = 0;
        byF[f].forEach(function (t0) { Object.keys(t0.th.map).forEach(function (v) { if (union[v] === undefined) union[v] = t0.th.map[v]; else if (union[v] !== t0.th.map[v]) ok = false; }); n += t0.n; });
        if (ok && byF[f].length > 1) { merged = { kind: "partmap", th: { f: f, map: union } }; var before = templates.length; addT(merged); if (templates.length > before) merged.n = n; }
      });
    })();
    if (!templates.length) return null;
    /* keep the best-witnessed templates per kind: a vector seen on one object only is a coincidence far more often than a rule */
    var perKind = {}, kept = [];
    templates.sort(function (x, y) { return y.n - x.n; });
    templates.forEach(function (t0) { if (t0.kind === "stamp" && t0.n < Math.min(3, Math.ceil(U.n / 2))) return;   /* a pattern seen on one or two objects is memorised, not learned */
      perKind[t0.kind] = (perKind[t0.kind] || 0) + 1; if (perKind[t0.kind] <= 14 || (P.off("inverse") && NAIVE[t0.kind])) kept.push(t0); });
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
    (function () {
      var fps = {}, ti3, u3, fp, w3, nc = 0;
      for (ti3 = 0; ti3 < templates.length; ti3++) {
        fp = [];
        for (u3 = 0; u3 < U.n; u3++) { w3 = wcache[ti3][u3]; fp.push(w3 && ccache[ti3][u3] ? w3.pnt.join(",") + "/" + w3.clr.join(",") : "x"); }
        fp = fp.join("|");
        if (!fps[fp]) { fps[fp] = 1; nc++; }
      }
      acct.tmpl_syntactic = (acct.tmpl_syntactic || 0) + templates.length; acct.tmpl_classes = (acct.tmpl_classes || 0) + nc;
    })();
    var ownHandled = new Uint8Array(U.n), rules = [], iter, covTotal = nDelta, firstKey = null;
    var uncoveredCount = function () { var n = 0; uncovered.forEach(function (x) { for (var i = 0; i < x.length; i++) n += x[i]; }); return n; };
    var vsInfo = [];
    for (iter = 0; iter < MAX_RULES; iter++) {
      if (ctx && ctx.timed_out()) break;
      if (!uncoveredCount()) break;
      var best = null, ti2;
      for (ti2 = 0; ti2 < templates.length; ti2++) {
        if (iter === 0 && forbid && forbid[templates[ti2].key]) continue;      /* alternative-first-pick branch of the cover */
        var pos = Bits.make(U.n), neg = Bits.make(U.n), wts = new Array(U.n), any = false, tot = 0;
        var ownKind = !!OWN_KINDS[templates[ti2].kind];
        for (u = 0; u < U.n; u++) {
          if (ownKind && ownHandled[u]) { Bits.set(neg, u); wts[u] = 0; continue; }
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
        var gain = s0.w - LAMBDA * (s0.bits + tb + RULE_PENALTY + RULE_GROW * iter);       /* each further rule in a stage must pay more: cells it explains may be cheaper for the next stage */
        if (s0.w < 1) continue;
        if (!best || gain > best.gain) best = { ti: ti2, sol: s0, sols: sols, gain: gain, w: s0.w, tb: tb, st: st };
      }
      if (!best) break;
      var t = templates[best.ti];
      var rule = { kind: t.kind, th: t.th, ref: t.ref, atoms: best.sol.ids.map(function (i) { return atoms[i].spec; }), bits: Math.max(1, best.sol.bits + best.tb + RULE_PENALTY - (P.Policy ? P.Policy.macroBonus(P.ruleSig({ kind: t.kind, ref: t.ref, th: t.th, atoms: best.sol.ids.map(function (i) { return atoms[i].spec; }) })) : 0)),
                   alt: best.sols.slice(1, 4).map(function (s2) { return { atoms: s2.ids.map(function (i) { return atoms[i].spec; }), bits: s2.bits }; }) };
      rule.gain = best.gain;
      rules.push(rule);
      if (rules.length === 1) firstKey = t.key;
      vsInfo.push({ vs: best.st.classes || 0, estimate: best.st.consistent || 0 });
      /* mark selected objects handled and their covered cells explained */
      for (u = 0; u < U.n; u++) {
        if (!Bits.get(best.sol.mask, u)) continue;
        if (OWN_KINDS[t.kind]) ownHandled[u] = 1;
        if (!ccache[best.ti][u]) continue;
        var wr = wcache[best.ti][u], scu = scenes[U.items[u].s], Ou = pairs[U.items[u].s][1], k2, cell2;
        for (k2 = 0; k2 < wr.pnt.length; k2 += 2) { cell2 = wr.pnt[k2]; if (Ou[(cell2 / scu.W) | 0][cell2 % scu.W] === wr.pnt[k2 + 1]) uncovered[U.items[u].s][cell2] = 0; }
        for (k2 = 0; k2 < wr.clr.length; k2++) { cell2 = wr.clr[k2]; if (Ou[(cell2 / scu.W) | 0][cell2 % scu.W] === scu.bg) uncovered[U.items[u].s][cell2] = 0; }
      }
    }
    if (!rules.length) return null;
    var stage = { parse: parseId, bgMode: "mode", rules: rules, bits: 2.0 + rules.reduce(function (a, r2) { return a + r2.bits; }, 0), vs: vsInfo };
    /* every PREFIX of the rule list is itself a candidate stage: a later stage may explain the remaining cells more cheaply than
       one more rule would (greedy per-stage cover cannot see that) */
    var prefixes = [];
    if (P.on("prefix") && rules.length > 1) for (var kk = 1; kk < rules.length; kk++) if (rules[kk].gain < MARGINAL * rules[kk].bits) prefixes.push({ parse: parseId, bgMode: "mode", rules: rules.slice(0, kk), bits: 2.0 + rules.slice(0, kk).reduce(function (a, r2) { return a + r2.bits; }, 0), vs: vsInfo.slice(0, kk) });
    return { stage: stage, left: uncoveredCount(), first: firstKey, prefixes: prefixes };
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
    acct._feat = acct._feat || P.taskFeatures(train);
    if (P.Policy) parses = P.Policy.parseOrder(acct._feat, parses);
    var pseen = {}, pfp = {};
    function emit(prog) {
      acct.prog_raw = (acct.prog_raw || 0) + 1;
      var key = progStr(prog);
      if (pseen[key]) { acct.prog_syntactic = (acct.prog_syntactic || 0) + 1; return; }
      pseen[key] = 1;
      var fp = [], i4, g4, ok = true;
      for (i4 = 0; i4 < train.length && ok; i4++) { g4 = runProgram(prog, train[i4][0]); if (!g4) ok = false; else fp.push(G.gkey(g4)); }
      for (i4 = 0; i4 < testInputs.length && ok; i4++) { g4 = runProgram(prog, testInputs[i4]); fp.push(g4 ? G.gkey(g4) : "x"); }
      var fk = fp.join("|");
      if (pfp[fk]) acct.prog_semantic = (acct.prog_semantic || 0) + 1; else { pfp[fk] = 1; acct.prog_classes = (acct.prog_classes || 0) + 1; }
      out.push(prog);
    }
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
      var tried = [];
      function consider(res, pName) {
        var prog = { stages: prefix.concat([res.stage]), bits: bitsSoFar + res.stage.bits };
        if (trace) trace.add({ a: "stage", parse: pName, depth: depth, rules: res.stage.rules.length, left: res.left });
        var inter = pairs.map(function (p) { return runStage(res.stage, p[0]); });
        if (inter.some(function (x) { return x === null; })) return -1;
        var after = residualCells(inter, pairs);
        if (after === 0) { emit(prog); return 0; }
        if (after < b0) cont.push({ prog: prog, inter: inter, after: after });
        else near.push({ prog: prog, residual: after / Math.max(1, b0) });
        return after;
      }
      for (pi = 0; pi < parses.length; pi++) {
        if (ctx && ctx.timed_out()) return;
        res = learnStage(pairs, parses[pi], ctx, acct, trace);
        if (!res) continue;
        var aft = consider(res, parses[pi]);
        if (aft > 0 && res.first) tried.push({ parse: parses[pi], after: aft, first: res.first });
        (res.prefixes || []).forEach(function (pst) {
          var pprog = { stages: prefix.concat([pst]), bits: bitsSoFar + pst.bits };
          var pinter = pairs.map(function (p) { return runStage(pst, p[0]); });
          if (pinter.some(function (x) { return x === null; })) return;
          var paft = residualCells(pinter, pairs);
          if (paft === 0) emit(pprog); else if (paft < b0) { cont.push({ prog: pprog, inter: pinter, after: paft }); acct.prefix_branches = (acct.prefix_branches || 0) + 1; }
        });
      }
      /* GREEDY COVER IS NOT EXHAUSTIVE: the best first rule by gain can be a distraction (a many-cell pattern that explains a lot
         but not the right thing). For the two most promising incomplete parses, branch on the second and third best FIRST rule. */
      if (P.on("beam")) {   /* opt-in: no gain on the learning splits, +45% nodes */
        tried.sort(function (a, b) { return a.after - b.after; });
        tried.slice(0, BEAM_PARSES).forEach(function (tr) {
          var forbid = {}, k3, alt;
          forbid[tr.first] = 1;
          for (k3 = 0; k3 < BEAM_ALT; k3++) {
            if (ctx && ctx.timed_out()) return;
            alt = learnStage(pairs, tr.parse, ctx, acct, trace, forbid);
            if (!alt) break;
            acct.beam_branches = (acct.beam_branches || 0) + 1;
            consider(alt, tr.parse);
            if (!alt.first) break;
            forbid[alt.first] = 1;
          }
        });
      }
      if (depth + 1 >= (P.off("stages") ? 1 : MAX_STAGES_DEFAULT)) { cont.forEach(function (c) { near.push({ prog: c.prog, residual: c.after / Math.max(1, b0) }); }); return; }
      cont.sort(function (a, b) { return (a.prog.bits + CELL_BITS * a.after) - (b.prog.bits + CELL_BITS * b.after); });
      cont.slice(0, CONT_N).forEach(function (c) {
        if (ctx && ctx.timed_out()) return;
        acct.stage_chains++;
        rec(c.inter.map(function (g2, k2) { return [g2, pairs[k2][1]]; }), c.prog.stages, depth + 1, c.prog.bits);
      });
      cont.slice(CONT_N).forEach(function (c) { near.push({ prog: c.prog, residual: c.after / Math.max(1, b0) }); });
    }
    rec(train, [], 0, 0);
    return { programs: out, near: near };
  }

  /* NOVELTY OF THE TEST INPUT relative to what each rule was fitted on. A program can be exact and simple and still be asked to
     act on objects unlike any it has seen (a ragged region where every demonstration had a rectangle). For every first-stage
     rule: the distance, in a small normalised object-feature space, from each test object the rule fires on to the nearest
     TRAINING object it fired on; the program's novelty is the worst such distance. Rules that fire in the demonstrations but
     nowhere on the test input are counted as idle. */
  var NOV_SCALE = [1.0, 3, 3, 0.25, 1, 1];
  function objFeat(o) { return [Math.log(1 + o.size), o.h, o.w, o.size / (o.h * o.w), o.holes ? 1 : 0, o.border ? 1 : 0]; }
  function noveltyOf(prog, train, tests) {
    var st = prog.stages[0], worst = 0, idle = 0, nr = 0;
    var trSc = train.map(function (p) { return P.parse(p[0], st.parse, st.bgMode); }), teSc = tests.map(function (g) { return P.parse(g, st.parse, st.bgMode); });
    st.rules.forEach(function (rule) {
      var trF = [], teF = [];
      trSc.forEach(function (sc) { if (!sc.tooMany) sc.objs.forEach(function (o) { if (matches(rule, sc, o)) trF.push(objFeat(o)); }); });
      teSc.forEach(function (sc) { if (!sc.tooMany) sc.objs.forEach(function (o) { if (matches(rule, sc, o)) teF.push(objFeat(o)); }); });
      if (!trF.length) return;
      nr++;
      if (!teF.length) { idle++; return; }
      teF.forEach(function (f) {
        var best = Infinity;
        trF.forEach(function (g) { var d = 0, k; for (k = 0; k < f.length; k++) d += Math.pow((f[k] - g[k]) / NOV_SCALE[k], 2); d = Math.sqrt(d); if (d < best) best = d; });
        if (best > worst) worst = best;
      });
    });
    return { novelty: worst, idle: idle, rules: nr };
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
  var MODE = { value: "ensemble" };            /* 'off' | 'ensemble' (Node: PSYN_MODE=off disables the family for ablations) */
  if (typeof process !== "undefined" && process.env && process.env.PSYN_MODE) MODE.value = process.env.PSYN_MODE;
  var LAST = { acct: null, near: [], trace: null, programs: [] };

  function generate(ctx) {
    if (MODE.value === "off") return [];
    var acct = new P.Accounts(), trace = new P.Trace({ ntrain: ctx.train.length });
    LAST = { acct: acct, near: [], trace: trace, programs: [] };
    /* compute scheduler: skip the synthesiser on tasks where, per the trained scheduler, it essentially never produces a right program */
    if (P.Policy && P.Policy.loaded && P.Policy.enabled && P.Policy.solveW && !P.off("sched")) {
      var pf0 = P.taskFeatures(ctx.train), ps0 = P.Policy.solveProb(pf0);
      LAST.sched = { p: ps0 };
      /* the floor is calibrated on training traces and did not transfer (it silenced five held-out solves), so a low score now
         only SHORTENS the budget (cheap exact search still runs) instead of skipping the family */
      if (ps0 < (P.Policy.solveFloor || 0)) { LAST.sched.capped = true; P.Policy.stats.skippedTasks++; if (ctx.deadline) ctx.deadline = Math.min(ctx.deadline, Date.now() + 700); }
      acct._feat = pf0;
    }
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
      /* a rule that fires in the demonstrations but on NOTHING in the test input is a loose end of the fit: on the learning and dev
         splits such programs were right 2 times in 12 (against 60 of 79 otherwise), so they carry a fixed cost */
      var idle = 0;
      if (prog.kind === "objfx" && !P.off("idle")) { try { idle = noveltyOf(prog.raw, ctx.train, ctx.test_inputs).idle; } catch (e) { idle = 0; } }
      var h = _h("psyn:" + key, prog.run, 2.0 + prog.rank / 8.0 + (idle ? IDLE_COST : 0));
      h.psyn = { idle: idle, kind: prog.kind, bits: prog.bits, rank: prog.rank, loo: prog.loo === undefined ? null : prog.loo, pf: P.programFeatures(prog.raw, { loo: prog.loo === undefined ? null : prog.loo, nTrain: ctx.train.length, extract: prog.kind === "extract" }) };
      hyps.push(h);
    });
    LAST.programs = found.programs; LAST.near = found.near;
    /* NearMiss protocol: the closest non-exact partial programs are handed to the portfolio as ordinary hypotheses. They fail
       validation by construction (residual > 0), which is exactly what routes them to the residual-driven refinement stage as
       seeds -- a near-miss is never an answer, but it is a structured starting point for repair. */
    if (P.on("nearseed")) {   /* opt-in: on dev it traded one regression (crowded the refinement stage) for one solve */
      var seen = {}, k;
      found.near.filter(function (n) { return n.prog && n.residual > 0 && n.residual < 0.6; }).sort(function (a, b) { return a.residual - b.residual; }).slice(0, 3).forEach(function (n) {
        var key = "near:" + progStr(n.prog);
        if (seen[key]) return; seen[key] = 1;
        var h = _h("psyn:" + key, (function (pr) { return function (g) { return runProgram(pr, g); }; })(n.prog), 14.0);
        h.psyn = { kind: "near", bits: n.prog.bits, rank: 99, loo: null, pf: { nRules: 0 } };
        hyps.push(h);
      });
    }
    return hyps;
  }
  var mod = defSolver("psyn", "psyn", generate, 1, 1.2);
  mod.EXTRA = true;                                     /* runs on its own time, added to the task deadline (50-portfolio.js) */
  mod.DIAG = function () { return LAST.acct ? { accounts: LAST.acct.toJSON(), near: LAST.near.length, error: LAST.error || null, sched: LAST.sched || null } : null; };

  P.ObjFX = { noveltyOf: noveltyOf, runProgram: runProgram, progStr: progStr, search: search, looScore: looScore, learnStage: learnStage, mode: MODE, last: function () { return LAST; }, module: mod };
})();
