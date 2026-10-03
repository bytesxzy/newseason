/* ===== src/67-psyn-learned.js ===== */
/* Learned search policy, value function and scheduler for the partial-program synthesiser.
 *
 * Everything here PROPOSES or RANKS. Exact verification (a program must reproduce every demonstration) is untouched, and a
 * missing or stale policy file only means the defaults are used. The weights are produced offline by tools/arc-psyn-train.js
 * from search traces and written to 68-psyn-policy.js (generated); nothing is learned on the evaluation task itself except the
 * bounded per-task re-weighting in `adapt`, which reads demonstrations only and is discarded when the task ends.
 *
 *   taskFeatures(train)      cheap numeric description of a task from its demonstrations
 *   parseOrder(feat)         parses sorted by predicted usefulness (the representation proposer)
 *   kindLogit(feat, kind)    log-odds that an effect kind appears in the solution (the operator proposer)
 *   atomShift(family)        description-length shift for an atom family, from how often it occurs in verified solutions
 *   solveProb(feat)          P(the synthesiser produces a correct top-1 program | task) -- the compute scheduler's signal
 *   valueProb(progFeat)      P(this exact-fitting program is right on the test input) -- the value function
 *   macroBonus(ruleSig)      bits saved when a rule matches a learned abstraction (anti-unified from solved tasks)
 */

(function () {
  var P = PSYN;

  /* ------------------------------------------------------------------ features */
  function mean(xs) { var s = 0, i; for (i = 0; i < xs.length; i++) s += xs[i]; return xs.length ? s / xs.length : 0; }
  function taskFeatures(train) {
    var f = { nTrain: train.length }, i, r, c, same = 1, dims = 0, dfr = [], bgOnly = 1, delOnly = 1, recOnly = 1, newCol = 0, nObj4 = [], nObj8 = [], ncol = [], area = [], bgFrac = [], panels = 0, anyChange = 0;
    for (i = 0; i < train.length; i++) {
      var I = train[i][0], O = train[i][1], H = I.length, W = I[0].length;
      if (O.length !== H || O[0].length !== W) {
        same = 0;
        if (O.length >= H && O[0].length >= W) dims = Math.max(dims, 1); else if (O.length <= H && O[0].length <= W) dims = Math.max(dims, 2); else dims = 3;
      }
      area.push(H * W);
      var bg = P.modeColor(I), pal = {}, ch = 0;
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) pal[I[r][c]] = 1;
      ncol.push(Object.keys(pal).length);
      var nb = 0; for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (I[r][c] === bg) nb++;
      bgFrac.push(nb / (H * W));
      if (O.length === H && O[0].length === W) {
        for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (I[r][c] !== O[r][c]) { ch++; if (I[r][c] !== bg) bgOnly = 0; if (O[r][c] !== bg) delOnly = 0; if (I[r][c] === bg || O[r][c] === bg) recOnly = 0; if (!pal[O[r][c]]) newCol = 1; }
        dfr.push(ch / (H * W)); if (ch) anyChange = 1;
      }
      var s4 = P.parse(I, "c4", "mode"), s8 = P.parse(I, "m8", "mode");
      nObj4.push(s4.tooMany ? 70 : s4.n); nObj8.push(s8.tooMany ? 70 : s8.n);
      if (s4.panels()) panels = 1;
    }
    f.same = same; f.dims = dims; f.dfrac = mean(dfr); f.bgOnly = same && anyChange ? bgOnly : 0; f.delOnly = same && anyChange ? delOnly : 0; f.recOnly = same && anyChange ? recOnly : 0;
    f.newColor = newCol; f.nObj4 = Math.log(1 + mean(nObj4)); f.nObjM8 = Math.log(1 + mean(nObj8)); f.ncol = mean(ncol) / 10; f.area = Math.log(mean(area)) / 7; f.bgFrac = mean(bgFrac); f.panels = panels;
    return f;
  }
  var FEAT_KEYS = ["nTrain", "same", "dims", "dfrac", "bgOnly", "delOnly", "recOnly", "newColor", "nObj4", "nObjM8", "ncol", "area", "bgFrac", "panels"];
  function vec(f) { return FEAT_KEYS.map(function (k) { return f[k] || 0; }); }

  /* ------------------------------------------------------------------ atom/rule families (for traces and priors) */
  function atomFamily(a) {
    switch (a.t) {
      case "not": return "!" + atomFamily(a.a);
      case "rel": return "rel:" + a.rel + ":" + (a.p.t === "col" || a.p.t === "colrole" ? "color" : a.p.t === "bool" ? a.p.v : a.p.t);
      case "bool": return "b:" + a.v;
      case "num": return "n:" + a.f + a.op;
      case "col": return "col";
      case "colrole": return "role:" + a.v;
      case "has": return "has";
      case "cnt": return "cnt:" + a.rel;
      case "freq": return "freq:" + a.f;
      default: return a.t;
    }
  }
  function ruleSig(rule) {
    var par = rule.ref ? "ref." + rule.ref.kind : (rule.th !== undefined && rule.th !== null ? "th" : "none");
    return rule.kind + "/" + par + "/" + rule.atoms.map(atomFamily).sort().join("+");
  }
  function programFeatures(prog, info) {
    var stages = prog.stages || [], rules = [], i, j;
    stages.forEach(function (st) { st.rules.forEach(function (r) { rules.push(r); }); });
    var f = { bits: (prog.bits || 0) / 40, nRules: rules.length, nStages: stages.length, loo: info && info.loo !== null && info.loo !== undefined ? info.loo : 0.5, looKnown: info && info.loo !== null && info.loo !== undefined ? 1 : 0,
              nTrain: info ? info.nTrain / 5 : 0, lit: 0, role: 0, rel: 0, num: 0, shape: 0, neg: 0, effOwn: 0, effAdd: 0, selTrue: 0, relColor: 0, maxAtoms: 0, extract: 0 };
    rules.forEach(function (r) {
      f.maxAtoms = Math.max(f.maxAtoms, r.atoms.length); if (!r.atoms.length) f.selTrue++;
      r.atoms.forEach(function (a) { var t = a.t === "not" ? a.a.t : a.t; if (a.t === "not") f.neg++; if (t === "col" || t === "has") f.lit++; else if (t === "colrole") f.role++; else if (t === "rel" || t === "cnt") f.rel++; else if (t === "num" || t === "freq") f.num++; else if (t === "shape" || t === "d4") f.shape++; });
      if (r.ref && r.ref.kind === "rel") f.relColor++;
      if (r.kind === "delete" || r.kind === "recolor" || r.kind === "move" || r.kind === "slide" || r.kind === "d4" || r.kind === "cmap" || r.kind === "partmap") f.effOwn++; else f.effAdd++;
    });
    rules.forEach(function (r) { f["k_" + r.kind] = (f["k_" + r.kind] || 0) + 1; });
    if (info && info.extract) { f.extract = 1; f.nRules = 1; }
    return f;
  }
  var PROG_KEYS = ["bits", "nRules", "nStages", "loo", "looKnown", "nTrain", "lit", "role", "rel", "num", "shape", "neg", "effOwn", "effAdd", "selTrue", "relColor", "maxAtoms", "extract",
                   "k_delete", "k_recolor", "k_cmap", "k_move", "k_copy", "k_slide", "k_d4", "k_fillbox", "k_fillholes", "k_halo8", "k_halo4", "k_ray", "k_partmap"];

  /* ------------------------------------------------------------------ the policy object */
  var Policy = {
    loaded: false, enabled: true, parseW: {}, kindW: {}, famPrior: {}, solveW: null, valueW: null, macros: {}, stats: { parseReorders: 0, kindPruned: 0, kindKept: 0, skippedTasks: 0 },
    load: function (d) { var k; for (k in d) if (d.hasOwnProperty(k)) this[k] = d[k]; this.loaded = true; },
    dot: function (w, x) { var s = w.b || 0, i; for (i = 0; i < x.length; i++) s += (w.w[i] || 0) * x[i]; return s; },
    sig: function (z) { return 1 / (1 + Math.exp(-z)); },
    parseOrder: function (feat, parses) {
      if (P.off("multiparse")) return ["c8"];
      if (!this.loaded || !this.enabled || P.off("parseorder") || !this.parseW || !Object.keys(this.parseW).length) return parses;
      var x = vec(feat), self = this, sc = parses.map(function (p) { return [p, self.parseW[p] ? self.dot(self.parseW[p], x) : 0]; });
      sc.sort(function (a, b) { return b[1] - a[1]; });
      this.stats.parseReorders++;
      return sc.map(function (a) { return a[0]; });
    },
    kindLogit: function (feat, kind) { if (!this.loaded || !this.enabled || !this.kindW[kind]) return 0; return this.dot(this.kindW[kind], vec(feat)); },
    /* keep a kind when its predicted probability clears the floor chosen at training time to retain >= 97% of the kinds that solved */
    keepKind: function (feat, kind) {
      if (P.off(kind)) return false;
      /* OPT-IN (PSYN_ON=kindprune). Ablation: pruning removed 13% of the search nodes but cost one held-out solve on each of
         two dev splits (the recall floor, set from few training solves, did not transfer), so by default it only RANKS. */
      if (!P.on("kindprune") || !this.loaded || !this.enabled || P.off("kind") || !this.kindW[kind]) return true;
      var p = this.sig(this.dot(this.kindW[kind], vec(feat))), keep = p >= (this.kindW[kind].floor || 0);
      if (keep) this.stats.kindKept++; else this.stats.kindPruned++;
      return keep;
    },
    atomShift: function (fam) { if (!this.loaded || !this.enabled || P.off("fam")) return 0; var v = this.famPrior[fam]; return v === undefined ? 0 : v; },
    solveProb: function (feat) { if (!this.loaded || !this.solveW || P.off("sched")) return null; return this.sig(this.dot(this.solveW, vec(feat))); },
    valueProb: function (pf) { if (!this.loaded || !this.enabled || !this.valueW || P.off("value")) return null; return this.sig(this.dot(this.valueW, PROG_KEYS.map(function (k) { return pf[k] || 0; }))); },
    macroBonus: function (sig) { if (!this.loaded || !this.enabled || P.off("macro")) return 0; var m = this.macros[sig]; return m ? m.bonus : 0; }
  };

  P.taskFeatures = taskFeatures; P.FEAT_KEYS = FEAT_KEYS; P.PROG_KEYS = PROG_KEYS; P.featVec = vec; P.atomFamily = atomFamily; P.ruleSig = ruleSig; P.programFeatures = programFeatures; P.Policy = Policy;
})();
