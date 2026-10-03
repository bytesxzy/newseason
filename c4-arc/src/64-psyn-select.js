/* ===== src/64-psyn-select.js ===== */
/* Selector version spaces.
 *
 * A selector decides which objects a rule applies to. Instead of enumerating selector programs and executing each, the
 * learner evaluates every ATOM (a small predicate over an object in its scene) once over the whole training universe
 * and keeps the result as a bit set. A selector is a conjunction of atoms; whether it separates the objects that must
 * be affected (positives) from the ones that must not (negatives) is then a handful of bit operations. This is the
 * classical conjunctive version space: the atoms true on every positive form the specific boundary, and the negatives
 * contribute 'killer' sets that a consistent conjunction must hit. Atoms are specifications (plain data), so they can
 * be evaluated on unseen scenes, rendered, canonicalised and logged.
 *
 * Atoms come in three families: object attributes and extremes (size, shape, uniqueness, position), colour atoms that
 * refer to a literal colour or to a scene ROLE, and relational atoms ("exists y related to x with property p": touching,
 * enclosed by, enclosing, nearest, sharing a panel, aligned in a row or column).
 */

(function () {
  var P = PSYN, Bits = P.Bits;

  /* ------------------------------------------------------------------ atom evaluation */
  var BOOLS = {
    border: function (sc, o) { return o.border; },
    rect: function (sc, o) { return o.isRect; },
    line: function (sc, o) { return o.h === 1 || o.w === 1; },
    single: function (sc, o) { return o.size === 1; },
    mixed: function (sc, o) { return o.mixed; },
    hasHoles: function (sc, o) { return o.holes > 0; },
    sym: function (sc, o) { return o.shapeKey === flipKey(o); },
    separator: function (sc, o) { return sc.isSeparator(o); },
    isolated: function (sc, o) { return !Object.keys(sc.rel().adj[o.id]).length; },
    enclosed: function (sc, o) { return sc.rel().enclosedBy[o.id] >= 0; },
    encloses: function (sc, o) { return Object.keys(sc.rel().inside[o.id]).length > 0; },
    largest: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.size; }, true); },
    smallest: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.size; }, false); },
    tallest: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.h; }, true); },
    widest: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.w; }, true); },
    top: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.r0; }, false); },
    bottom: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.r1; }, true); },
    left: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.c0; }, false); },
    right: function (sc, o) { return uniqueExt(sc, o, function (x) { return x.c1; }, true); },
    mostHoles: function (sc, o) { return o.holes > 0 && uniqueExt(sc, o, function (x) { return x.holes; }, true); },
    uniqColor: function (sc, o) { return sc.freq().color[o.color] === 1; },
    uniqShape: function (sc, o) { return sc.freq().shape[o.shapeKey] === 1; },
    uniqD4: function (sc, o) { return sc.freq().d4[o.d4Key] === 1; },
    uniqSize: function (sc, o) { return sc.freq().size[o.size] === 1; },
    uniqContent: function (sc, o) { return sc.freq().content[o.contentKey] === 1; },
    commonContent: function (sc, o) { var f = sc.freq().content, m = 0, k; for (k in f) if (f[k] > m) m = f[k]; return m > 1 && f[o.contentKey] === m; },
    emptyBox: function (sc, o) { return o.nbg === 0; },
    commonColor: function (sc, o) { return o.color === sc.roles().mostObjs; },
    commonShape: function (sc, o) { var f = sc.freq().shape, m = 0, k; for (k in f) if (f[k] > m) m = f[k]; return m > 1 && f[o.shapeKey] === m; },
    centerRow: function (sc, o) { return o.cr2 === sc.H - 1; },
    centerCol: function (sc, o) { return o.cc2 === sc.W - 1; }
  };
  var GEN_BOOLS = ["border", "rect", "line", "single", "mixed", "hasHoles", "sym", "separator", "isolated", "enclosed", "encloses", "largest", "smallest", "tallest", "widest", "top", "bottom", "left", "right",
                   "mostHoles", "uniqColor", "uniqShape", "uniqD4", "uniqSize", "uniqContent", "commonColor", "commonShape", "commonContent", "emptyBox"];
  function flipKey(o) {
    /* shape key of the horizontal mirror image, to test left-right symmetry */
    var pts = o.shapeKey.split(":")[1].split(";").map(function (s) { var p = s.split("."); return [+p[0], o.w - 1 - +p[1]]; });
    pts.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    return o.h + "x" + o.w + ":" + pts.map(function (p) { return p[0] + "." + p[1]; }).join(";");
  }
  function uniqueExt(sc, o, key, wantMax) {
    var v = key(o), i, x, kv;
    if (sc.n < 2) return false;
    for (i = 0; i < sc.n; i++) { if (i === o.id) continue; x = sc.objs[i]; if (sc.isSeparator(x)) continue; kv = key(x); if (wantMax ? kv >= v : kv <= v) return false; }
    return true;
  }
  var UNARY_NUM = { size: function (o) { return o.size; }, h: function (o) { return o.h; }, w: function (o) { return o.w; }, holes: function (o) { return o.holes; },
                    nbg: function (o) { return o.nbg; }, ncol: function (o) { var m = o.colorsMask, n = 0; while (m) { n += m & 1; m >>= 1; } return n; } };

  function evalSimple(a, sc, o) {
    switch (a.t) {
      case "col": return o.color === a.v;
      case "has": return (o.colorsMask & (1 << a.v)) !== 0;
      case "colrole": { var r = sc.roles()[a.v]; return r !== undefined && r >= 0 && o.color === r; }
      case "num": { var x = UNARY_NUM[a.f](o); return a.op === "==" ? x === a.v : a.op === ">=" ? x >= a.v : x <= a.v; }
      case "bool": return !!BOOLS[a.v](sc, o);
      case "shape": return o.shapeKey === a.v;
      case "d4": return o.d4Key === a.v;
      case "freq": { var f = sc.freq()[a.f]; var key = a.f === "color" ? o.color : a.f === "shape" ? o.shapeKey : a.f === "d4" ? o.d4Key : o.size; return f[key] === a.v; }
      case "par": return ((a.axis === "r" ? o.r0 : o.c0) & 1) === a.v;
      default: return false;
    }
  }
  /* the property a related object must have in a relational atom; may refer to the subject object x */
  function evalPred(p, sc, y, x) {
    switch (p.t) {
      case "diffColor": return y.color !== x.color;
      case "sameColor": return y.color === x.color;
      case "sameShape": return y.shapeKey === x.shapeKey;
      case "sameD4": return y.d4Key === x.d4Key;
      case "bigger": return y.size > x.size;
      case "smaller": return y.size < x.size;
      case "any": return true;
      default: return evalSimple(p, sc, y);
    }
  }
  function related(sc, o, rel) {
    var R = sc.rel(), out = [], i;
    switch (rel) {
      case "adj": return Object.keys(R.adj[o.id]).map(Number);
      case "encl": return R.enclosedBy[o.id] >= 0 ? [R.enclosedBy[o.id]] : [];          /* the object enclosing o */
      case "inside": return Object.keys(R.inside[o.id]).map(Number);                    /* objects enclosed by o */
      case "near": return R.nearest[o.id] >= 0 ? [R.nearest[o.id]] : [];
      case "panel": { var pn = sc.panelOf(o); if (pn < 0) return []; for (i = 0; i < sc.n; i++) if (i !== o.id && sc.panelOf(sc.objs[i]) === pn && !sc.isSeparator(sc.objs[i])) out.push(i); return out; }
      case "row": for (i = 0; i < sc.n; i++) if (i !== o.id && sc.rowAligned(o.id, i) && !sc.isSeparator(sc.objs[i])) out.push(i); return out;
      case "col": for (i = 0; i < sc.n; i++) if (i !== o.id && sc.colAligned(o.id, i) && !sc.isSeparator(sc.objs[i])) out.push(i); return out;
      case "all": for (i = 0; i < sc.n; i++) if (i !== o.id && !sc.isSeparator(sc.objs[i])) out.push(i); return out;
      default: return out;
    }
  }
  function evalAtom(a, sc, o) {
    var v;
    switch (a.t) {
      case "not": return !evalAtom(a.a, sc, o);
      case "rel": {
        var ids = related(sc, o, a.rel), i;
        for (i = 0; i < ids.length; i++) if (evalPred(a.p, sc, sc.objs[ids[i]], o)) return true;
        return false;
      }
      case "cnt": return related(sc, o, a.rel).length === a.v;
      default: return evalSimple(a, sc, o);
    }
  }

  function atomStr(a) {
    switch (a.t) {
      case "col": return "color=" + a.v;
      case "has": return "has" + a.v;
      case "colrole": return "color=role." + a.v;
      case "num": return a.f + a.op + a.v;
      case "bool": return a.v;
      case "shape": return "shape#" + a.v.length + a.v.slice(0, 14);
      case "d4": return "d4shape#" + a.v.length;
      case "freq": return "n_" + a.f + "=" + a.v;
      case "par": return "par_" + a.axis + "=" + a.v;
      case "not": return "!" + atomStr(a.a);
      case "rel": return "∃" + a.rel + ":" + predStr(a.p);
      case "cnt": return "|" + a.rel + "|=" + a.v;
      default: return "?";
    }
  }
  function predStr(p) { return ["diffColor", "sameColor", "sameShape", "sameD4", "bigger", "smaller", "any"].indexOf(p.t) >= 0 ? p.t : atomStr(p); }
  function atomBits(a) {
    switch (a.t) {
      case "col": return 3.4;
      case "has": return 3.6;
      case "colrole": return 3.0;
      case "num": return 3.6;
      case "bool": return 2.4;
      case "shape": case "d4": return 5.0;
      case "freq": return 3.8;
      case "par": return 3.2;
      case "not": return atomBits(a.a) + 0.6;
      case "rel": return 4.2 + atomBits(["diffColor", "sameColor", "sameShape", "sameD4", "bigger", "smaller", "any"].indexOf(a.p.t) >= 0 ? { t: "bool" } : a.p) * 0.6;
      case "cnt": return 4.0;
      default: return 6;
    }
  }

  /* ------------------------------------------------------------------ the training universe */
  /* items = every object of every demonstration scene (rows of the bit sets). */
  function Universe(scenes) {
    this.scenes = scenes; this.items = []; this.off = [];
    var s, i;
    for (s = 0; s < scenes.length; s++) { this.off.push(this.items.length); for (i = 0; i < scenes[s].n; i++) this.items.push({ s: s, o: scenes[s].objs[i] }); }
    this.n = this.items.length;
  }

  /* atom generation from the values that occur in the universe */
  function generateAtoms(U) {
    var atoms = [], seen = {}, items = U.items, i, k;
    function add(a) {
      var key = atomStr(a) + (a.t === "rel" ? "" : "");
      if (a.t === "shape" || a.t === "d4") key = a.t + a.v;
      if (a.t === "rel") key = "rel" + a.rel + "|" + (a.p.t === "shape" || a.p.t === "d4" ? a.p.t + a.p.v : predStr(a.p));
      if (a.t === "not") key = "not" + (a.a.t === "shape" || a.a.t === "d4" ? a.a.t + a.a.v : atomStr(a.a));
      if (seen[key]) return;
      seen[key] = 1; atoms.push({ spec: a, bits: atomBits(a), name: atomStr(a) });
    }
    var allColors = {}, colors = {}, sizes = {}, hs = {}, ws = {}, shapes = {}, d4s = {}, holes = {}, nbgs = {}, ncols = {}, freqs = { color: {}, shape: {}, d4: {}, size: {} }, roleNames = {};
    for (i = 0; i < items.length; i++) {
      var o = items[i].o, sc = U.scenes[items[i].s];
      colors[o.color] = 1; for (k = 0; k < 10; k++) if (o.colorsMask & (1 << k)) allColors[k] = 1; sizes[o.size] = 1; hs[o.h] = 1; ws[o.w] = 1; holes[o.holes] = 1; ncols[UNARY_NUM.ncol(o)] = 1; nbgs[o.nbg] = 1;
      if (Object.keys(shapes).length < 40) shapes[o.shapeKey] = 1;
      if (Object.keys(d4s).length < 40) d4s[o.d4Key] = 1;
      var fr = sc.freq(); freqs.color[fr.color[o.color]] = 1; freqs.shape[fr.shape[o.shapeKey]] = 1; freqs.d4[fr.d4[o.d4Key]] = 1; freqs.size[fr.size[o.size]] = 1;
      var rl = sc.roles(); for (k in rl) if (rl[k] >= 0) roleNames[k] = 1;
    }
    var c;
    for (c in colors) add({ t: "col", v: +c });
    for (c in allColors) add({ t: "has", v: +c });
    for (k in roleNames) if (k !== "bg") add({ t: "colrole", v: k });
    function nums(f, set) {
      var vals = Object.keys(set).map(Number).sort(function (a, b) { return a - b; }), j;
      if (vals.length > 14) vals = vals.filter(function (v, j2) { return j2 % Math.ceil(vals.length / 14) === 0; });
      for (j = 0; j < vals.length; j++) { add({ t: "num", f: f, op: "==", v: vals[j] }); if (j > 0) add({ t: "num", f: f, op: ">=", v: vals[j] }); if (j < vals.length - 1) add({ t: "num", f: f, op: "<=", v: vals[j] }); }
    }
    nums("size", sizes); nums("nbg", nbgs); nums("h", hs); nums("w", ws); nums("holes", holes);
    for (k in shapes) add({ t: "shape", v: k });
    for (k in d4s) add({ t: "d4", v: k });
    GEN_BOOLS.forEach(function (b) { var a = { t: "bool", v: b }; add(a); add({ t: "not", a: a }); });
    /* arbitrary position/parity/count atoms are deliberately NOT generated: on a handful of demonstrations they separate
       almost any labelling, which is exactly the overfitting that makes a longer program look like a better one */
    ["color", "shape"].forEach(function (f) { Object.keys(freqs[f]).forEach(function (v) { if (+v >= 2 && +v <= 4) add({ t: "freq", f: f, v: +v }); }); });
    /* relational atoms */
    var preds = [{ t: "diffColor" }, { t: "sameColor" }, { t: "sameShape" }, { t: "sameD4" }, { t: "bigger" }, { t: "smaller" }, { t: "any" }, { t: "bool", v: "single" }, { t: "bool", v: "line" }, { t: "bool", v: "rect" }];
    for (c in colors) preds.push({ t: "col", v: +c });
    for (k in roleNames) if (k !== "bg") preds.push({ t: "colrole", v: k });
    ["adj", "encl", "inside", "near", "panel", "row", "col"].forEach(function (rel) {
      preds.forEach(function (p) {
        if (rel === "encl" && p.t === "any") return;
        add({ t: "rel", rel: rel, p: p });
        if (p.t !== "any") add({ t: "not", a: { t: "rel", rel: rel, p: p } });
      });
      add({ t: "not", a: { t: "rel", rel: rel, p: { t: "any" } } });
    });
    [0, 1, 2, 3].forEach(function (n) { add({ t: "cnt", rel: "adj", v: n }); });
    /* bit sets */
    for (i = 0; i < atoms.length; i++) {
      var b = Bits.make(U.n), j;
      for (j = 0; j < U.n; j++) if (evalAtom(atoms[i].spec, U.scenes[items[j].s], items[j].o)) Bits.set(b, j);
      atoms[i].mask = b; atoms[i].count = Bits.count(b);
    }
    /* drop atoms that are constant over the universe: they never separate anything */
    return atoms.filter(function (a) { return a.count > 0 && a.count < U.n; });
  }

  /* ------------------------------------------------------------------ selector learning */
  /* Find conjunctions (<= maxLen atoms) true on at least one positive and on NO negative, favouring coverage of the
     positives (weighted) and then description length. Returns solutions sorted best first. `stats` receives the
     version-space accounting: how many distinct consistent conjunctions exist at each level. */
  function learnSelectors(U, atoms, posMask, negMask, weights, opts) {
    opts = opts || {};
    var maxLen = opts.maxLen || 3, beamW = opts.beam || 14, maxSol = opts.maxSol || 40, nU = U.n;
    var posList = Bits.list(posMask, nU), sols = [], seenSol = {}, stats = opts.stats || {};
    stats.consistent = 0; stats.exact = 0;
    if (!posList.length) return sols;
    var allMask = Bits.full(nU), negList = Bits.list(negMask, nU), nNeg = negList.length;
    function pw(mask) { var s2 = 0, i; for (i = 0; i < posList.length; i++) if (Bits.get(mask, posList[i])) s2 += weights[posList[i]]; return s2; }
    function addSol(cand) {
      var sig = Bits.hash(cand.mask) + ":" + Bits.count(cand.mask);
      if (!seenSol[sig] || seenSol[sig].bits > cand.bits) {
        if (seenSol[sig]) sols[sols.indexOf(seenSol[sig])] = cand; else sols.push(cand);
        seenSol[sig] = cand;
      }
    }
    /* ---- phase 1: EXACT full-cover version space. S = atoms true on every positive (the specific boundary). Each negative
       contributes the set of atoms of S that exclude it; a consistent conjunction must hit every such set. Complete up to
       `maxLen` atoms; no beam, nothing missed. */
    var S = [], ai;
    for (ai = 0; ai < atoms.length; ai++) if (Bits.subset(posMask, atoms[ai].mask)) S.push(ai);
    stats.S = S.length;
    if (Bits.count(Bits.and(allMask, negMask)) === 0) {
      addSol({ ids: [], mask: allMask, bits: 0.5, neg: 0, pc: posList.length }); stats.consistent++; stats.exact++;
    } else if (S.length) {
      /* kill[a] = bit set over negatives excluded by atom a. Atoms with the same kill set are interchangeable on the
         demonstrations (keep the cheapest); an atom whose kill set is contained in a cheaper atom's is dominated. */
      var cand = S.map(function (a) { var kb = Bits.make(nNeg), j; for (j = 0; j < nNeg; j++) if (!Bits.get(atoms[a].mask, negList[j])) Bits.set(kb, j); return { a: a, kb: kb, bits: atoms[a].bits, h: Bits.hash(kb) }; });
      cand = cand.filter(function (c0) { return !Bits.isZero(c0.kb); });
      cand.sort(function (x, y) { return x.bits - y.bits; });
      var kept = [], ci, cj, dom;
      for (ci = 0; ci < cand.length; ci++) {
        dom = false;
        for (cj = 0; cj < kept.length; cj++) if (Bits.subset(cand[ci].kb, kept[cj].kb)) { dom = true; break; }
        if (!dom) kept.push(cand[ci]);
        if (kept.length >= 80) break;
      }
      stats.dominated = S.length - kept.length;
      S = kept.map(function (c0) { return c0.a; });
      var kill = kept.map(function (c0) { return c0.kb; });
      var need = Bits.full(nNeg), found = [];
      function minimal(ids) { var i, j, ok; for (i = 0; i < found.length; i++) { ok = true; for (j = 0; j < found[i].length; j++) if (ids.indexOf(found[i][j]) < 0) { ok = false; break; } if (ok) return false; } return true; }
      function record(idxs) {
        var ids = idxs.map(function (x) { return S[x]; }), mask = allMask, bits = 0, q;
        for (q = 0; q < ids.length; q++) { mask = Bits.and(mask, atoms[ids[q]].mask); bits += atoms[ids[q]].bits + (q ? 0.4 : 0); }
        found.push(ids); stats.consistent++; stats.exact++;
        addSol({ ids: ids, mask: mask, bits: bits, neg: 0, pc: posList.length });
      }
      var i1, i2, i3, acc, acc3;
      for (i1 = 0; i1 < S.length; i1++) if (Bits.equals(kill[i1], need)) record([i1]);
      if (maxLen >= 2 && !found.length) {
        for (i1 = 0; i1 < S.length; i1++) for (i2 = i1 + 1; i2 < S.length; i2++) {
          if (Bits.equals(Bits.or(kill[i1], kill[i2]), need)) record([i1, i2]);
        }
      }
      if (maxLen >= 3 && !found.length) {
        for (i1 = 0; i1 < S.length && found.length < maxSol; i1++) for (i2 = i1 + 1; i2 < S.length; i2++) {
          acc = Bits.or(kill[i1], kill[i2]);
          for (i3 = i2 + 1; i3 < S.length; i3++) if (Bits.equals(Bits.or(acc, kill[i3]), need)) record([i1, i2, i3]);
        }
      }
    }
    stats.classesExact = sols.length;
    /* ---- phase 2: partial cover (some positives cannot be separated from some negatives) -> beam search */
    if (!sols.length || opts.partial) {
      var live = [];
      for (ai = 0; ai < atoms.length; ai++) if (Bits.anyAnd(atoms[ai].mask, posMask)) live.push(ai);
      var beam = [{ ids: [], mask: allMask, bits: 0 }], level, b, a, nm, negHit, pc, cand, nxt, li;
      for (level = 1; level <= maxLen; level++) {
        nxt = [];
        for (b = 0; b < beam.length; b++) {
          for (li = 0; li < live.length; li++) {
            a = live[li];
            if (beam[b].ids.length && a <= beam[b].ids[beam[b].ids.length - 1]) continue;
            if (!Bits.anyAnd(beam[b].mask, atoms[a].mask)) continue;
            nm = Bits.and(beam[b].mask, atoms[a].mask);
            pc = Bits.andCount(nm, posMask);
            if (!pc) continue;
            negHit = Bits.andCount(nm, negMask);
            cand = { ids: beam[b].ids.concat([a]), mask: nm, bits: beam[b].bits + atoms[a].bits + (beam[b].ids.length ? 0.4 : 0), neg: negHit, pc: pc };
            if (negHit === 0) { stats.consistent++; addSol(cand); } else nxt.push(cand);
          }
        }
        if (sols.length >= maxSol) break;
        nxt.sort(function (p2, q2) { return (p2.neg - q2.neg) || (q2.pc - p2.pc) || (p2.bits - q2.bits); });
        beam = nxt.slice(0, beamW);
        if (!beam.length) break;
      }
    }
    sols.forEach(function (s3) { s3.w = pw(s3.mask); });
    sols.sort(function (p2, q2) { return (q2.w - p2.w) || (p2.bits - q2.bits); });
    stats.classes = sols.length;
    return sols.slice(0, maxSol);
  }

  function selStr(sel, atoms) { return sel.ids.length ? sel.ids.map(function (i) { return atoms[i].name; }).join(" & ") : "true"; }

  P.evalAtom = evalAtom; P.atomStr = atomStr; P.Universe = Universe; P.generateAtoms = generateAtoms; P.learnSelectors = learnSelectors; P.selStr = selStr; P.BOOLS = BOOLS;
})();
