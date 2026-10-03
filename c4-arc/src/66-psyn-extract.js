/* ===== src/66-psyn-extract.js ===== */
/* Extraction by inverse witness: the output is a piece of the input.
 *
 * Forward search would try "crop to the largest object", "crop to the rarest colour" ... and execute each. Here the output
 * itself names the answer. For every parse (objects of several kinds, and panels between separator lines) the objects whose
 * crop equals the demonstrated output, optionally after one of the eight symmetries, with the other cells masked to
 * background, or under a colour map, are the POSITIVES; every other object in that demonstration is a NEGATIVE. The selector
 * version space (64-psyn-select.js) then returns the conjunctions of atoms that pick exactly the witnessed objects, which
 * is the only thing left to decide. Nothing is enumerated at the program level.
 */

(function () {
  var P = PSYN, Bits = P.Bits, G_ = G;
  var PARSES_X = ["c4", "c8", "m4", "m8", "col", "pnl"];

  function crop(sc, o, masked) {
    var g = sc.grid, out = [], r, c, k;
    for (r = o.r0; r <= o.r1; r++) { var row = []; for (c = o.c0; c <= o.c1; c++) row.push(g[r][c]); out.push(row); }
    if (masked) {
      var own = {}; for (k = 0; k < o.cells.length; k++) own[o.cells[k]] = 1;
      for (r = o.r0; r <= o.r1; r++) for (c = o.c0; c <= o.c1; c++) if (!own[r * sc.W + c]) out[r - o.r0][c - o.c0] = sc.bg;
    }
    return out;
  }
  function colorMapBetween(a, b) {
    var m = {}, r, c, x, y;
    if (a.length !== b.length || a[0].length !== b[0].length) return null;
    for (r = 0; r < a.length; r++) for (c = 0; c < a[0].length; c++) {
      x = a[r][c]; y = b[r][c];
      if (m[x] === undefined) m[x] = y; else if (m[x] !== y) return null;
    }
    return m;
  }
  function mapKey(m) { var ks = Object.keys(m).filter(function (k) { return m[k] !== +k; }).sort(); return ks.map(function (k) { return k + ">" + m[k]; }).join(","); }
  function applyMap(g, m) { return g.map(function (row) { return row.map(function (v) { return m[v] === undefined ? v : m[v]; }); }); }

  /* combos a crop can be turned into the output by: [kind, d4 element, colour map string] */
  function matchesFor(sc, o, O) {
    var out = [], mk, t, base, tg, m, key;
    for (mk = 0; mk < 2; mk++) {
      base = crop(sc, o, mk === 1);
      if (mk === 1 && o.isRect) continue;                          /* masked == raw for a solid rectangle */
      for (t = 0; t < 8; t++) {
        tg = P.d4Apply(t, base);
        if (tg.length !== O.length || tg[0].length !== O[0].length) continue;
        if (G.gEq(tg, O)) { out.push((mk ? "masked" : "raw") + "|" + t + "|"); continue; }
        m = colorMapBetween(tg, O);
        if (m) { key = mapKey(m); if (key) out.push((mk ? "masked" : "raw") + "|" + t + "|" + key); }
      }
    }
    return out;
  }
  function parseMap(s) { var m = {}; if (!s) return m; s.split(",").forEach(function (p) { var q = p.split(">"); m[+q[0]] = +q[1]; }); return m; }

  function apply(prog, g) {
    var sc = P.parse(g, prog.parse, "mode");
    if (sc.tooMany || !sc.n) return null;
    var picked = [], i, o;
    for (i = 0; i < sc.n; i++) {
      o = sc.objs[i];
      var ok = true, j;
      for (j = 0; j < prog.atoms.length; j++) if (!P.evalAtom(prog.atoms[j], sc, o)) { ok = false; break; }
      if (ok) picked.push(o);
    }
    if (!picked.length) return null;
    var parts = prog.combo.split("|"), outs = picked.map(function (p) {
      var c = crop(sc, p, parts[0] === "masked"), t = P.d4Apply(+parts[1], c);
      return parts[2] ? applyMap(t, parseMap(parts[2])) : t;
    });
    /* several objects selected: acceptable only when they give the same output (identical copies) */
    for (i = 1; i < outs.length; i++) if (!G.gEq(outs[0], outs[i])) return null;
    return outs[0];
  }
  function progStr(p) { return "extract." + p.parse + "{" + (p.atoms.map(P.atomStr).join(" & ") || "true") + "}>" + p.combo; }

  function search(train, testInputs, ctx, acct) {
    var out = [], pi, d, o;
    for (pi = 0; pi < PARSES_X.length; pi++) {
      if (ctx && ctx.timed_out()) break;
      var parse = PARSES_X[pi], scenes = train.map(function (p) { return P.parse(p[0], parse, "mode"); }), total = 0, skip = false;
      scenes.forEach(function (sc) { total += sc.n; if (sc.tooMany || !sc.n) skip = true; });
      if (skip || total > 400) continue;
      acct.parses_tried++;
      var U = new P.Universe(scenes), perObj = new Array(U.n), comboCount = {}, u, item;
      for (u = 0; u < U.n; u++) {
        item = U.items[u];
        perObj[u] = matchesFor(scenes[item.s], item.o, train[item.s][1]);
        perObj[u].forEach(function (k) { comboCount[k] = comboCount[k] || {}; comboCount[k][item.s] = 1; });
      }
      var combos = Object.keys(comboCount).filter(function (k) { return Object.keys(comboCount[k]).length === train.length; });
      if (!combos.length) { acct.parses_pruned++; continue; }
      acct.inverse_applied += combos.length;
      var atoms = null;
      combos.sort(function (a, b) { return (a.split("|")[2] ? 1 : 0) - (b.split("|")[2] ? 1 : 0); });
      combos.slice(0, 6).forEach(function (combo) {
        if (ctx && ctx.timed_out()) return;
        if (!atoms) atoms = P.generateAtoms(U);
        var pos = Bits.make(U.n), neg = Bits.make(U.n), wts = new Array(U.n), any = false;
        for (u = 0; u < U.n; u++) { wts[u] = 1; if (perObj[u].indexOf(combo) >= 0) Bits.set(pos, u); else Bits.set(neg, u); }
        var st = {}, sols = P.learnSelectors(U, atoms, pos, neg, wts, { stats: st, maxSol: 12 });
        acct.vs_member_estimate += st.consistent || 0; acct.vs_collapsed += st.classes || 0;
        sols.forEach(function (sol) {
          /* a selector must pick a witnessed object in EVERY demonstration (coverage of the positives is not enough) */
          var perScene = {}, ok = true;
          for (u = 0; u < U.n; u++) if (Bits.get(sol.mask, u) && Bits.get(pos, u)) perScene[U.items[u].s] = 1;
          if (Object.keys(perScene).length !== train.length) return;
          var prog = { parse: parse, atoms: sol.ids.map(function (i) { return atoms[i].spec; }), combo: combo, bits: 2.5 + sol.bits + (combo.split("|")[1] !== "0" ? 2.5 : 0) + (combo.split("|")[2] ? 3.5 : 0) + (combo.split("|")[0] === "masked" ? 1.0 : 0) };
          for (d = 0; d < train.length && ok; d++) { var g = apply(prog, train[d][0]); if (!g || !G.gEq(g, train[d][1])) ok = false; }
          if (ok) out.push(prog);
        });
      });
      if (out.length >= 10) break;
    }
    return { programs: out, near: [] };
  }

  /* unified entry: every program is {kind, bits, run(grid), str} so the solver family and the tools treat them alike */
  function synthesize(train, testInputs, ctx, acct, trace) {
    var out = [], near = [], sameShape = train.every(function (p) { return p[0].length === p[1].length && p[0][0].length === p[1][0].length; });
    if (sameShape) {
      var r = P.ObjFX.search(train, testInputs, ctx, acct, trace);
      near = r.near;
      var loo = null;
      if (r.programs.length && train.length >= 3) {
        var until = Math.min(ctx && ctx.deadline ? ctx.deadline : Infinity, Date.now() + 2500);
        loo = P.ObjFX.looScore(train, ctx, acct, until);
      }
      r.programs.forEach(function (pg) { out.push({ kind: "objfx", bits: pg.bits, loo: loo, rank: pg.bits - (loo === null ? 0 : 14 * (loo - 0.5)), run: function (g) { return P.ObjFX.runProgram(pg, g); }, str: P.ObjFX.progStr(pg), raw: pg }); });
    }
    if (!(ctx && ctx.timed_out())) {
      var e = search(train, testInputs, ctx, acct);
      e.programs.forEach(function (pg) { out.push({ kind: "extract", bits: pg.bits, rank: pg.bits, run: function (g) { return apply(pg, g); }, str: progStr(pg), raw: pg }); });
    }
    return { programs: out, near: near };
  }

  P.Extract = { search: search, apply: apply, progStr: progStr };
  P.synthesize = synthesize;
})();
