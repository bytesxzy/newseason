/* ===== src/55-residual.js ===== */
/* Structured residuals: HOW a candidate program fails, not just whether.
 *
 * The portfolio's verifier answers one bit per demonstration. That bit is the
 * right thing to SELECT on and the wrong thing to SEARCH on: a program that
 * is right except for a one-cell displacement and a program that outputs
 * noise both read "does not fit". This module measures the failure along
 * reusable geometric, chromatic, object and relational axes, and turns the
 * pixel error into semantic diagnoses that name their own repair:
 *
 *   dims       wrong size; is it a crop, a scale, a transpose, an extension?
 *   palette    missing / extra colours; is the error a consistent recolouring?
 *   geometry   is the target the prediction rotated, reflected, translated?
 *   change     relative to the INPUT: did the program fail to change cells
 *              that should change (under), or change cells that should stay
 *              (excess), or change them wrongly?
 *   objects    matched / moved / recoloured / reoriented / missing / extra
 *              objects, count and topology (holes) mismatches, relation flips
 *   classes    which INPUT objects were mishandled, and is there one object
 *              feature (colour, size, shape, enclosure, border contact, holes,
 *              extremality) that separates them from those handled correctly,
 *              consistently in every demonstration? "Correct on exposed
 *              objects, misses enclosed ones" is found this way.
 *
 * Nothing here knows a task. Every diagnosis must hold consistently across
 * the demonstrations it is drawn from before it is marked ``strong``.
 * Residuals are computed on training pairs only; test outputs never exist
 * in the context this module receives.
 */

var RESID = null;

(function () {
  var D4 = [["rot90", G.rot90], ["rot180", G.rot180], ["rot270", G.rot270],
            ["flip_h", G.flipH], ["flip_v", G.flipV],
            ["transpose", G.transpose], ["anti_transpose", G.antiTranspose]];
  var COLOR_BITS = Math.log(10) / Math.LN2;

  function sameDims(a, b) { return a.length === b.length && a[0].length === b[0].length; }

  /* ------------------------------------------------------------ quick pass
     O(area) per pair; enough to score, deduplicate and cluster. */
  function quickPair(pred, target, input, bg) {
    var q = { valid: pred !== null && pred !== undefined, exact: false, dims: false, errors: 0,
              area: target.length * target[0].length, norm: 1, under: 0, excess: 0, wrongChange: 0,
              missing: 0, extra: 0, bits: 0 };
    if (!q.valid) { q.bits = q.area * COLOR_BITS + 8; return q; }
    if (G.gEq(pred, target)) { q.exact = true; q.dims = true; q.norm = 0; return q; }
    var pt = G.palette(target), pp = G.palette(pred);
    q.missing = G.csSize(G.csDiff(pt, pp)); q.extra = G.csSize(G.csDiff(pp, pt));
    if (!sameDims(pred, target)) {
      q.errors = Math.max(q.area, pred.length * pred[0].length);
      q.bits = q.area * COLOR_BITS + 8;
      q.norm = 1;
      return q;
    }
    q.dims = true;
    var io = input && sameDims(input, target), r, c, n = 0;
    for (r = 0; r < target.length; r++) for (c = 0; c < target[0].length; c++) {
      var p = pred[r][c], t = target[r][c];
      if (p === t) continue;
      n++;
      if (io) {
        var x = input[r][c];
        if (p === x) q.under++; else if (t === x) q.excess++; else q.wrongChange++;
      }
    }
    q.errors = n;
    /* the smallest nonzero residual is still a failure, so norm never reaches 0 */
    q.norm = Math.max(1e-4, n / q.area);
    /* exceptions list: which cell (log2 area) and what it should be (colour) */
    q.bits = n * (Math.log(q.area) / Math.LN2 + COLOR_BITS);
    return q;
  }

  /* Demonstrated invariants a prediction should respect. Learned from the
     training pairs, so a task whose outputs change size or palette imposes no
     such constraint. */
  function invariantsOf(ctx) {
    return ctx.memo("resid_inv", function () {
      var inv = { sameShape: ctx.same_shape(), paletteSubset: true, countPreserved: true,
                  constShape: ctx.const_out_shape() }, i;
      for (i = 0; i < ctx.train.length; i++) {
        var a = ctx.train[i][0], b = ctx.train[i][1];
        if (!G.csSubset(G.palette(b), G.palette(a))) inv.paletteSubset = false;
        if (sameDims(a, b)) {
          var na = objCount(a, ctx.bg()), nb = objCount(b, ctx.bg());
          if (na !== nb) inv.countPreserved = false;
        } else inv.countPreserved = false;
      }
      inv.newColors = ctx.new_colors();
      return inv;
    });
  }

  function objCount(g, bg) {
    try { var o = O.segment(g, "c8", bg); return o.length; } catch (e) { return -1; }
  }

  /* Violations of demonstrated invariants by ``pred`` for ``input``. */
  function violations(pred, input, inv, bg) {
    if (!pred) return 0;
    var v = 0;
    if (inv.sameShape && !sameDims(pred, input)) v++;
    if (inv.constShape && (pred.length !== inv.constShape[0] || pred[0].length !== inv.constShape[1])) v++;
    if (inv.paletteSubset && !G.csSubset(G.palette(pred), G.csUnion(G.palette(input), inv.newColors))) v++;
    if (inv.countPreserved && sameDims(pred, input) && objCount(pred, bg) !== objCount(input, bg)) v++;
    return v;
  }

  /* Task-level quick residual over all training pairs. */
  function quick(preds, ctx) {
    var bg = ctx.bg(), inv = invariantsOf(ctx), out = { pairs: [], exact: true, pairErrors: 0,
      cellErrors: 0, norm: 0, bits: 0, invariants: 0, under: 0, excess: 0, wrongChange: 0,
      dimsBad: 0, paletteBad: 0, sig: "" }, i;
    for (i = 0; i < ctx.train.length; i++) {
      var q = quickPair(preds[i], ctx.train[i][1], ctx.train[i][0], bg);
      out.pairs.push(q);
      if (!q.exact) { out.exact = false; out.pairErrors++; }
      out.cellErrors += q.errors; out.norm += q.norm; out.bits += q.bits;
      out.under += q.under; out.excess += q.excess; out.wrongChange += q.wrongChange;
      if (q.valid && !q.dims) out.dimsBad++;
      if (q.missing || q.extra) out.paletteBad++;
      out.invariants += violations(preds[i], ctx.train[i][0], inv, bg);
    }
    out.norm /= Math.max(1, ctx.train.length);
    if (out.exact) out.norm = 0;
    /* coarse signature: the axis the failure lies on, for clustering */
    var tag;
    if (out.exact) tag = "exact";
    else if (out.dimsBad) tag = "dims";
    else {
      var tot = out.under + out.excess + out.wrongChange;
      tag = !tot ? "cells" : out.under >= 0.6 * tot ? "under" : out.excess >= 0.6 * tot ? "excess" : "mixed";
      if (out.paletteBad) tag += "+pal";
    }
    out.sig = tag + "/" + (out.norm < 0.02 ? "t" : out.norm < 0.1 ? "l" : out.norm < 0.35 ? "m" : "h");
    return out;
  }

  /* ------------------------------------------------------------- full pass */

  function findSub(big, small) {
    var H = big.length, W = big[0].length, h = small.length, w = small[0].length, r, c, i, j, ok;
    if (h > H || w > W || (H - h + 1) * (W - w + 1) * h * w > 400000) return null;
    for (r = 0; r + h <= H; r++) for (c = 0; c + w <= W; c++) {
      ok = true;
      for (i = 0; i < h && ok; i++) for (j = 0; j < w; j++) if (big[r + i][c + j] !== small[i][j]) { ok = false; break; }
      if (ok) return [r, c];
    }
    return null;
  }

  /* How a wrongly-sized prediction relates to the target. */
  function dimsRelation(pred, target, bg) {
    var i, g;
    for (i = 0; i < D4.length; i++) {
      g = D4[i][1](pred);
      if (G.gEq(g, target)) return { kind: "orientation", op: D4[i][0] };
    }
    var ph = pred.length, pw = pred[0].length, th = target.length, tw = target[0].length;
    if (th % ph === 0 && tw % pw === 0) {
      var ky = th / ph, kx = tw / pw;
      if (ky <= 6 && kx <= 6) {
        if (G.gEq(G.upscale(pred, ky, kx), target)) return { kind: "scale_up", ky: ky, kx: kx };
        if (G.gEq(G.tile(pred, ky, kx), target)) return { kind: "tile", ky: ky, kx: kx };
      }
    }
    if (ph % th === 0 && pw % tw === 0) {
      var dy = ph / th, dx = pw / tw;
      if (dy <= 6 && dx <= 6) {
        try { if (G.gEq(G.downscale(pred, dy, dx), target)) return { kind: "scale_down", ky: dy, kx: dx }; } catch (e) {}
      }
    }
    try { if (G.gEq(G.cropToContent(pred, bg), target)) return { kind: "crop_content" }; } catch (e) {}
    var at = findSub(pred, target);
    if (at) return { kind: "crop", r: at[0], c: at[1] };
    at = findSub(target, pred);
    if (at) return { kind: "extend", r: at[0], c: at[1] };
    return { kind: "other", dh: th - ph, dw: tw - pw };
  }

  /* Consistent colour substitution on the wrong cells, if one exists. */
  function substitution(pred, target) {
    var tab = {}, r, c, any = false;
    for (r = 0; r < target.length; r++) for (c = 0; c < target[0].length; c++) {
      var p = pred[r][c], t = target[r][c];
      if (tab.hasOwnProperty(p)) { if (tab[p] !== t) return null; }
      else tab[p] = t;
      if (p !== t) any = true;
    }
    if (!any) return null;
    var out = {}, k;
    for (k in tab) if (tab.hasOwnProperty(k) && +k !== tab[k]) out[k] = tab[k];
    return out;
  }

  /* Whole-grid geometric relation between a same-sized prediction and target. */
  function geometric(pred, target, bg) {
    var i, dr, dc;
    for (i = 0; i < D4.length; i++) {
      var g = D4[i][1](pred);
      if (sameDims(g, target) && G.gEq(g, target)) return { kind: "orientation", op: D4[i][0] };
    }
    for (dr = -3; dr <= 3; dr++) for (dc = -3; dc <= 3; dc++) {
      if (!dr && !dc) continue;
      if (G.gEq(G.translate(pred, dr, dc, bg), target)) return { kind: "translation", dr: dr, dc: dc };
    }
    return null;
  }

  /* Connected regions of the wrong-cell mask (8-connected). */
  function errorRegions(pred, target) {
    var h = target.length, w = target[0].length, seen = new Uint8Array(h * w), regs = [], r, c;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (seen[r * w + c] || pred[r][c] === target[r][c]) continue;
      var st = [[r, c]], cells = 0, r0 = r, r1 = r, c0 = c, c1 = c;
      seen[r * w + c] = 1;
      while (st.length) {
        var p = st.pop(); cells++;
        if (p[0] < r0) r0 = p[0]; if (p[0] > r1) r1 = p[0]; if (p[1] < c0) c0 = p[1]; if (p[1] > c1) c1 = p[1];
        for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
          var y = p[0] + a, x = p[1] + b;
          if (y < 0 || y >= h || x < 0 || x >= w || seen[y * w + x] || pred[y][x] === target[y][x]) continue;
          seen[y * w + x] = 1; st.push([y, x]);
        }
      }
      regs.push({ cells: cells, r0: r0, c0: c0, r1: r1, c1: c1, shape: (r1 - r0 + 1) + "x" + (c1 - c0 + 1) });
    }
    return regs;
  }

  function segSafe(g, bg) {
    try { var o = O.segment(g, "c8", bg); return o.length <= 60 ? o : null; } catch (e) { return null; }
  }

  function canonShape(o) {
    var m = o.mask(), best = null, i;
    var forms = [m, G.rot90(m), G.rot180(m), G.rot270(m), G.flipH(m), G.flipV(m), G.transpose(m), G.antiTranspose(m)];
    for (i = 0; i < forms.length; i++) { var k = G.gkey(forms[i]); if (best === null || k < best) best = k; }
    return best;
  }

  /* Object correspondence between prediction and target. */
  function objectResidual(pred, target, bg) {
    var po = segSafe(pred, bg), to = segSafe(target, bg);
    if (!po || !to) return null;
    var used = new Uint8Array(po.length), res = { correct: 0, moved: [], recolored: [], reoriented: 0,
      missing: [], extra: [], countDiff: po.length - to.length, holesDiff: 0, relationFlips: 0 }, i, j;
    var pairs = [];
    function take(pred) { for (j = 0; j < po.length; j++) if (!used[j] && pred(po[j])) { used[j] = 1; return po[j]; } return null; }
    for (i = 0; i < to.length; i++) {
      var t = to[i], tk = t.norm_key(), m;
      m = take(function (p) { return p.color === t.color && p.r0 === t.r0 && p.c0 === t.c0 && p.norm_key() === tk; });
      if (m) { res.correct++; pairs.push([m, t]); continue; }
      m = take(function (p) { return p.color === t.color && p.norm_key() === tk; });
      if (m) { res.moved.push([t.r0 - m.r0, t.c0 - m.c0]); pairs.push([m, t]); continue; }
      m = take(function (p) { return p.r0 === t.r0 && p.c0 === t.c0 && p.norm_key() === tk; });
      if (m) { res.recolored.push([m.color, t.color]); pairs.push([m, t]); continue; }
      var cs = canonShape(t);
      m = take(function (p) { return p.color === t.color && p.size() === t.size() && canonShape(p) === cs; });
      if (m) { res.reoriented++; pairs.push([m, t]); continue; }
      res.missing.push({ color: t.color, size: t.size(), r0: t.r0, c0: t.c0, shape: tk });
    }
    for (j = 0; j < po.length; j++) if (!used[j]) res.extra.push({ color: po[j].color, size: po[j].size(), r0: po[j].r0, c0: po[j].c0 });
    for (i = 0; i < po.length; i++) res.holesDiff += po[i].holes_count();
    for (i = 0; i < to.length; i++) res.holesDiff -= to[i].holes_count();
    /* relative placement of corresponding objects: a flip of above/left order */
    for (i = 0; i < pairs.length && i < 12; i++) for (j = i + 1; j < pairs.length && j < 12; j++) {
      var a = pairs[i], b = pairs[j];
      var sp = Math.sign(a[0].r0 - b[0].r0) * 2 + Math.sign(a[0].c0 - b[0].c0);
      var st = Math.sign(a[1].r0 - b[1].r0) * 2 + Math.sign(a[1].c0 - b[1].c0);
      if (sp !== st) res.relationFlips++;
    }
    return res;
  }

  /* Features of INPUT objects over which a mishandled class is sought. Kept
     small and generic; every one is a property an ARC rule commonly keys on. */
  function objFeatures(o, objs) {
    var f = { color: o.color, size: o.size(), shape: o.norm_key(), holes: o.holes_count() > 0 ? 1 : 0,
              border: o.touches_border() ? 1 : 0, rect: o.is_rect() ? 1 : 0, single: o.size() === 1 ? 1 : 0,
              enclosed: 0, largest: 1, smallest: 1 }, i;
    for (i = 0; i < objs.length; i++) {
      var p = objs[i];
      if (p === o) continue;
      if (p.size() > o.size()) f.largest = 0;
      if (p.size() < o.size()) f.smallest = 0;
      if (p.r0 < o.r0 && p.c0 < o.c0 && p.r1 > o.r1 && p.c1 > o.c1) f.enclosed = 1;
    }
    return f;
  }
  var CLASS_FEATURES = ["enclosed", "border", "holes", "single", "rect", "largest", "smallest", "color", "size", "shape"];

  /* Per pair: input objects touched by an error vs. not. */
  function classPair(pred, target, input, bg) {
    if (!input || !sameDims(input, target) || !sameDims(pred, target)) return null;
    var objs = segSafe(input, bg);
    if (!objs || objs.length < 2) return null;
    var rows = [], i, bad = 0, under = 0, excess = 0;
    for (i = 0; i < objs.length; i++) {
      var it = objs[i].cells.values(), s = it.next(), wrong = 0, u = 0, x = 0;
      while (!s.done) {
        var r = s.value >> 6, c = s.value & 63;
        if (pred[r][c] !== target[r][c]) {
          wrong++;
          if (pred[r][c] === input[r][c]) u++; else if (target[r][c] === input[r][c]) x++;
        }
        s = it.next();
      }
      rows.push({ f: objFeatures(objs[i], objs), bad: wrong > 0 });
      if (wrong) { bad++; under += u; excess += x; }
    }
    return { rows: rows, bad: bad, under: under, excess: excess };
  }

  /* One (feature, value) that is true of exactly the mishandled input objects
     in every pair that has any, and of none of the correctly handled ones in
     any pair. Consistency across demonstrations is the whole test. */
  function separatingClass(perPair) {
    var usable = perPair.filter(function (p) { return p; });
    if (!usable.length || !usable.some(function (p) { return p.bad; })) return null;
    var fi, cand, pi, ri;
    for (fi = 0; fi < CLASS_FEATURES.length; fi++) {
      var fk = CLASS_FEATURES[fi], values = null;
      for (pi = 0; pi < usable.length; pi++) {
        var vs = new Set();
        for (ri = 0; ri < usable[pi].rows.length; ri++) if (usable[pi].rows[ri].bad) vs.add(usable[pi].rows[ri].f[fk]);
        if (!vs.size) continue;
        if (vs.size > 1) { values = null; break; }
        var v = Array.from(vs)[0];
        if (values === null) values = v; else if (values !== v) { values = null; break; }
      }
      if (values === null) continue;
      cand = values;
      var clean = true;
      for (pi = 0; pi < usable.length && clean; pi++)
        for (ri = 0; ri < usable[pi].rows.length; ri++) {
          var row = usable[pi].rows[ri];
          if (!row.bad && row.f[fk] === cand) { clean = false; break; }
        }
      if (clean) return { feature: fk, value: cand };
    }
    return null;
  }

  /* ---------------------------------------------------- change-set objects
     The changes a program makes to its input, segmented into 4-connected
     components (a diagonal touch is not a shared edge), are objects in their
     own right. When a program makes the
     right kind of change in too many places, the residual is a CLASS of
     change components that should not have been made. */
  function changeComponents(pred, input) {
    if (!pred || !input || !sameDims(pred, input)) return null;
    var h = input.length, w = input[0].length, seen = new Uint8Array(h * w), comps = [], r, c;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (seen[r * w + c] || pred[r][c] === input[r][c]) continue;
      var st = [[r, c]], cells = [], r0 = r, r1 = r, c0 = c, c1 = c, cc = {};
      seen[r * w + c] = 1;
      while (st.length) {
        var p = st.pop(); cells.push(p);
        cc[pred[p[0]][p[1]]] = (cc[pred[p[0]][p[1]]] || 0) + 1;
        if (p[0] < r0) r0 = p[0]; if (p[0] > r1) r1 = p[0]; if (p[1] < c0) c0 = p[1]; if (p[1] > c1) c1 = p[1];
        for (var a = 0; a < 4; a++) {
          var y = p[0] + [1, -1, 0, 0][a], x = p[1] + [0, 0, 1, -1][a];
          if (y < 0 || y >= h || x < 0 || x >= w || seen[y * w + x] || pred[y][x] === input[y][x]) continue;
          seen[y * w + x] = 1; st.push([y, x]);
        }
      }
      var col = null, cn = -1;
      for (var k in cc) if (cc[k] > cn) { cn = cc[k]; col = +k; }
      comps.push({ cells: cells, size: cells.length, r0: r0, c0: c0, r1: r1, c1: c1, color: col,
                   border: (r0 === 0 || c0 === 0 || r1 === h - 1 || c1 === w - 1) ? 1 : 0,
                   rect: cells.length === (r1 - r0 + 1) * (c1 - c0 + 1) ? 1 : 0,
                   horiz: (c1 - c0) > (r1 - r0) ? 1 : 0, vert: (r1 - r0) > (c1 - c0) ? 1 : 0,
                   span: ((c0 === 0 && c1 === w - 1) || (r0 === 0 && r1 === h - 1)) ? 1 : 0 });
    }
    var i;
    for (i = 0; i < comps.length; i++) {
      comps[i].largest = 1; comps[i].smallest = 1;
      for (var j = 0; j < comps.length; j++) {
        if (comps[j].size > comps[i].size) comps[i].largest = 0;
        if (comps[j].size < comps[i].size) comps[i].smallest = 0;
      }
    }
    return comps;
  }
  var CHANGE_FEATURES = ["largest", "smallest", "span", "rect", "border", "horiz", "vert", "color", "size"];

  /* Is there one feature separating correct change components from excessive
     ones, consistently in every pair? (A component is excessive when every
     one of its cells should have stayed as in the input.) */
  function changeClass(preds, ctx) {
    var per = [], i;
    for (i = 0; i < ctx.train.length; i++) {
      var p = preds[i], x = ctx.train[i][0], t = ctx.train[i][1];
      if (!p || !sameDims(p, t) || !sameDims(x, t)) return null;
      var comps = changeComponents(p, x);
      if (!comps || comps.length > 60) return null;
      var rows = [];
      for (var k = 0; k < comps.length; k++) {
        var cs = comps[k].cells, good = 0, excess = 0;
        for (var q = 0; q < cs.length; q++) {
          var v = p[cs[q][0]][cs[q][1]], tv = t[cs[q][0]][cs[q][1]], xv = x[cs[q][0]][cs[q][1]];
          if (v === tv) good++; else if (tv === xv) excess++;
        }
        if (good === cs.length) rows.push({ f: comps[k], bad: false });
        else if (excess === cs.length) rows.push({ f: comps[k], bad: true });
        else return null;                       /* a component both right and wrong: not a filtering problem */
      }
      per.push(rows);
    }
    if (!per.some(function (rows) { return rows.some(function (r) { return r.bad; }); })) return null;
    if (!per.some(function (rows) { return rows.some(function (r) { return !r.bad; }); })) return null;
    for (var fi = 0; fi < CHANGE_FEATURES.length; fi++) {
      var fk = CHANGE_FEATURES[fi], goodVal = null, ok = true;
      per.forEach(function (rows) { rows.forEach(function (r) {
        if (!ok || r.bad) return;
        if (goodVal === null) goodVal = r.f[fk]; else if (goodVal !== r.f[fk]) ok = false;
      }); });
      if (!ok || goodVal === null) continue;
      per.forEach(function (rows) { rows.forEach(function (r) { if (r.bad && r.f[fk] === goodVal) ok = false; }); });
      if (ok) return { feature: fk, value: goodVal };
    }
    return null;
  }

  /* Full diagnosis over all training pairs. Returns diagnoses ordered by
     strength (consistent across pairs first), then by the fraction of the
     error each accounts for. */
  function diagnose(preds, ctx) {
    var bg = ctx.bg(), n = ctx.train.length, i, per = [], diags = [];
    var failing = 0, dimsRel = [], subs = [], geos = [], objs = [], classes = [];
    var quickR = quick(preds, ctx);
    for (i = 0; i < n; i++) {
      var p = preds[i], t = ctx.train[i][1], x = ctx.train[i][0], q = quickR.pairs[i];
      var d = { q: q };
      if (!q.valid) { per.push(d); failing++; classes.push(null); continue; }
      if (q.exact) {
        per.push(d);
        classes.push(sameDims(p, t) ? classPair(p, t, x, bg) : null);
        continue;
      }
      failing++;
      if (!q.dims) { d.dims = dimsRelation(p, t, bg); dimsRel.push(d.dims); per.push(d); classes.push(null); continue; }
      d.sub = substitution(p, t); subs.push(d.sub);
      d.geo = geometric(p, t, bg); geos.push(d.geo);
      d.regions = errorRegions(p, t);
      d.obj = objectResidual(p, t, bg); objs.push(d.obj);
      classes.push(classPair(p, t, x, bg));
      per.push(d);
    }
    var totalErr = Math.max(1, quickR.cellErrors);
    function allSame(list, key) {
      if (!list.length || list.some(function (v) { return !v; })) return null;
      var k0 = key(list[0]);
      for (var j = 1; j < list.length; j++) if (key(list[j]) !== k0) return null;
      return list[0];
    }
    if (!failing) return { residual: quickR, diagnoses: [], per: per };
    var invalid = quickR.pairs.filter(function (q) { return !q.valid; }).length;
    if (invalid) diags.push({ kind: "no_output", weight: invalid / n, strong: invalid === failing, pairs: invalid });
    if (dimsRel.length) {
      var dr = allSame(dimsRel, function (v) { return JSON.stringify(v); });
      var kinds = allSame(dimsRel, function (v) { return v.kind; });
      diags.push({ kind: "wrong_dims", sub: kinds ? kinds.kind : "mixed", detail: dr || (kinds ? kinds : null),
                   weight: dimsRel.length / failing, strong: !!(kinds && kinds.kind !== "other") && dimsRel.length === failing });
    }
    if (subs.length) {
      var merged = {}, ok = subs.every(function (s) { return s; });
      if (ok) subs.forEach(function (s) { for (var k in s) if (s.hasOwnProperty(k)) {
        if (merged.hasOwnProperty(k) && merged[k] !== s[k]) ok = false; merged[k] = s[k]; } });
      if (ok && Object.keys(merged).length)
        diags.push({ kind: "color_substitution", table: merged, weight: 1, strong: subs.length === failing - dimsRel.length - invalid });
    }
    if (geos.length) {
      var g0 = allSame(geos, function (v) { return JSON.stringify(v); });
      if (g0) diags.push({ kind: g0.kind === "orientation" ? "wrong_orientation" : "consistent_translation",
                           op: g0.op, dr: g0.dr, dc: g0.dc, weight: 1, strong: true });
    }
    var cls = separatingClass(classes);
    if (cls) {
      var u = 0, xs = 0;
      classes.forEach(function (c) { if (c) { u += c.under; xs += c.excess; } });
      diags.push({ kind: "unhandled_object_class", feature: cls.feature, value: cls.value,
                   polarity: u > xs ? "under" : xs > u ? "excess" : "wrong", weight: 0.9, strong: true });
    }
    if (quickR.excess && quickR.under + quickR.wrongChange === 0) {
      var chc = changeClass(preds, ctx);
      if (chc) diags.push({ kind: "excess_change_class", feature: chc.feature, value: chc.value, weight: 1, strong: true });
    }
    var tot = quickR.under + quickR.excess + quickR.wrongChange;
    if (tot) {
      if (quickR.under / tot >= 0.6) diags.push({ kind: "missed_change", weight: quickR.under / tot, strong: quickR.under === tot });
      else if (quickR.excess / tot >= 0.6) diags.push({ kind: "excessive_change", weight: quickR.excess / tot, strong: quickR.excess === tot });
      else diags.push({ kind: "wrong_change", weight: quickR.wrongChange / tot, strong: false });
    }
    var okObjs = objs.filter(function (o) { return o; });
    if (okObjs.length) {
      var moved = [], rec = [], miss = 0, extra = 0, cd = 0, hd = 0, flips = 0, reor = 0;
      okObjs.forEach(function (o) { moved = moved.concat(o.moved); rec = rec.concat(o.recolored);
        miss += o.missing.length; extra += o.extra.length; cd += Math.abs(o.countDiff); hd += Math.abs(o.holesDiff);
        flips += o.relationFlips; reor += o.reoriented; });
      if (moved.length) {
        var mk = allSame(moved, function (v) { return v.join(","); });
        diags.push({ kind: "object_moved", dr: mk ? mk[0] : null, dc: mk ? mk[1] : null,
                     consistent: !!mk, weight: Math.min(1, moved.length / (moved.length + miss + 1)), strong: !!mk });
      }
      if (rec.length) {
        var map = {}, cons = true;
        rec.forEach(function (p) { if (map.hasOwnProperty(p[0]) && map[p[0]] !== p[1]) cons = false; map[p[0]] = p[1]; });
        diags.push({ kind: "object_recolored", table: cons ? map : null, weight: 0.6, strong: cons });
      }
      if (reor) diags.push({ kind: "object_reoriented", weight: 0.5, strong: false });
      if (miss && !extra) diags.push({ kind: "missing_objects", count: miss, weight: 0.5, strong: false });
      if (extra && !miss) diags.push({ kind: "extra_objects", count: extra, weight: 0.5, strong: false });
      if (cd) diags.push({ kind: "count_mismatch", diff: cd, weight: 0.3, strong: false });
      if (hd) diags.push({ kind: "topology_changed", diff: hd, weight: 0.4, strong: false });
      if (flips) diags.push({ kind: "relation_mismatch", flips: flips, weight: 0.3, strong: false });
    }
    if (quickR.paletteBad) {
      var missC = 0, extraC = 0;
      quickR.pairs.forEach(function (q) { missC += q.missing; extraC += q.extra; });
      diags.push({ kind: "palette_mismatch", missing: missC, extra: extraC, weight: 0.4, strong: false,
                   colors: G.csList(G.csDiff(ctx.out_palette(), 0)) });
    }
    /* few scattered wrong cells: a local defect, not a wrong rule */
    var regs = [];
    per.forEach(function (d) { if (d.regions) regs = regs.concat(d.regions); });
    if (regs.length && regs.every(function (r) { return r.cells <= 2; }) && quickR.norm < 0.05)
      diags.push({ kind: "local_cells", regions: regs.length, weight: 0.3, strong: false });
    if (quickR.invariants) diags.push({ kind: "invariant_violation", count: quickR.invariants, weight: 0.2, strong: false });
    representationDiagnoses(preds, ctx, quickR, per, objs, geos, subs, dimsRel, diags);
    diags.sort(function (a, b) { return (b.strong - a.strong) || (b.weight - a.weight); });
    return { residual: quickR, diagnoses: diags, per: per };
  }

  /* --------------------------------------------- representation vs program
   *
   * The diagnoses above say WHAT is wrong. These say whether the failure is
   * the PROGRAM's (a parameter, a step, a predicate) or the REPRESENTATION's
   * (the substrate the program is written in cannot express the rule
   * simply). Each carries ``level`` ("representation" | "program") and,
   * where a registered representation (17-representation.js) or repair mode
   * addresses it, ``suggest`` / ``repair``. Weights are kept below the
   * semantic diagnoses' so the established repair ordering is not displaced
   * unless the evidence is consistent (strong). */
  function representationDiagnoses(preds, ctx, q, per, objs, geos, subs, dimsRel, diags) {
    var n = ctx.train.length, bg = ctx.bg(), i;
    var failing = q.pairs.filter(function (p) { return !p.exact; }).length;
    if (!failing) return;
    /* colours: per-pair substitutions that disagree with each other while
       each is itself consistent -> the colours are roles, not literals */
    var okSubs = subs.filter(function (s) { return s; });
    if (okSubs.length >= 2) {
      var clash = false, merged = {};
      okSubs.forEach(function (s) { for (var k in s) if (s.hasOwnProperty(k)) { if (merged.hasOwnProperty(k) && merged[k] !== s[k]) clash = true; merged[k] = s[k]; } });
      if (clash) diags.push({ kind: "wrong_representation", level: "representation", detail: "colour_roles",
                              suggest: ["roles", "canon"], weight: 0.55, strong: okSubs.length === failing });
    }
    var inPals = new Set(ctx.inputs().map(function (g) { return G.palette(g); }));
    if (q.paletteBad && inPals.size > 1)
      diags.push({ kind: "wrong_object_correspondence", level: "representation", suggest: ["roles"], weight: 0.35, strong: false });
    /* geometry: each failing pair is an exact symmetry of its target, but
       not the same symmetry -> the coordinate frame differs per pair */
    var geoOk = geos.filter(function (g) { return g && g.kind === "orientation"; });
    if (geoOk.length >= 2 && new Set(geoOk.map(function (g) { return g.op; })).size > 1)
      diags.push({ kind: "wrong_coordinate_frame", level: "representation", suggest: ["dih:transpose", "dih:rot90", "dih:flip_h"],
                   weight: 0.5, strong: geoOk.length === failing });
    /* symmetry: every target is invariant under a symmetry the prediction breaks */
    var symOps = ["flip_h", "flip_v", "transpose", "rot180"], si;
    for (si = 0; si < symOps.length; si++) {
      var f = { flip_h: G.flipH, flip_v: G.flipV, transpose: G.transpose, rot180: G.rot180 }[symOps[si]];
      var tSym = 0, pBreak = 0;
      for (i = 0; i < n; i++) {
        var t = ctx.train[i][1], p = preds[i];
        var ft = f(t);
        if (sameDims(ft, t) && G.gEq(ft, t)) {
          tSym++;
          if (p && !q.pairs[i].exact) { var fp = f(p); if (!(sameDims(fp, p) && G.gEq(fp, p))) pBreak++; }
        }
      }
      if (tSym === n && pBreak) {
        diags.push({ kind: "wrong_symmetry_frame", level: "representation", op: symOps[si], suggest: ["dih:" + symOps[si]],
                     repair: "expand", weight: 0.45, strong: pBreak === failing });
        break;
      }
    }
    /* objects: low cell error but chaotic object correspondence -> the
       segmentation or grouping is wrong, not the rule */
    var okObjs = objs.filter(function (o) { return o; });
    if (okObjs.length && q.norm < 0.15) {
      var miss = 0, extra = 0, correct = 0, moved = [];
      okObjs.forEach(function (o) { miss += o.missing.length; extra += o.extra.length; correct += o.correct; moved = moved.concat(o.moved); });
      if (miss && extra && miss + extra > correct)
        diags.push({ kind: "wrong_segmentation", level: "representation", repair: "param:K", weight: 0.4, strong: false });
      var cd = okObjs.reduce(function (s, o) { return s + o.countDiff; }, 0);
      if (cd && miss && extra)
        diags.push({ kind: "wrong_grouping", level: "representation", merged: cd < 0 ? "split" : "merged", repair: "param:K", weight: 0.3, strong: false });
      /* moved objects whose displacement differs by pair: the anchor, not the
         offset, is wrong */
      if (moved.length >= 2 && new Set(moved.map(function (m) { return m.join(","); })).size > 1)
        diags.push({ kind: "wrong_anchor", level: "program", repair: "anchor", weight: 0.35, strong: false });
      var flips = okObjs.reduce(function (s, o) { return s + o.relationFlips; }, 0);
      if (flips && correct)
        diags.push({ kind: "wrong_relation_graph", level: "representation", suggest: [], repair: "relations", weight: 0.3, strong: false });
    }
    /* panels: separator lines in the inputs and the error confined to part
       of the grid -> the panel decomposition is wrong */
    if (ctx.same_shape() && REPRESENT && REPRESENT.stripLines) {
      var sep = ctx.inputs().every(function (g) { return !!REPRESENT.stripLines(g); });
      if (sep) {
        var confined = 0;
        per.forEach(function (d) {
          if (!d.regions || !d.regions.length) return;
          var cells = d.regions.reduce(function (s, r) { return s + r.cells; }, 0);
          var box = d.regions.reduce(function (b, r) { return [Math.min(b[0], r.r0), Math.min(b[1], r.c0), Math.max(b[2], r.r1), Math.max(b[3], r.c1)]; }, [99, 99, -1, -1]);
          if (cells && (box[2] - box[0] + 1) * (box[3] - box[1] + 1) < 0.5 * d.q.area) confined++;
        });
        if (confined) diags.push({ kind: "wrong_panel_decomposition", level: "representation", suggest: ["strip"], weight: 0.35, strong: confined === failing });
      }
    }
    /* one consistent extra transform explains the residual: a missing step */
    var dimsStrong = dimsRel.length && dimsRel.every(function (d) { return d && d.kind !== "other"; });
    var geoStrong = geos.length && geos.every(function (g) { return g; }) && new Set(geos.map(function (g) { return JSON.stringify(g); })).size === 1;
    if (dimsStrong || geoStrong)
      diags.push({ kind: "missing_composition", level: "program", repair: "expand", weight: 0.4, strong: !!(dimsStrong || geoStrong) && failing === n });
    /* predicate scope: too many / too few objects handled, by a separable class */
    diags.forEach(function (d) {
      if (d.kind === "excess_change_class") d.alias = "overgeneralized_predicate";
      if (d.kind === "unhandled_object_class" && d.polarity === "under") d.alias = "undergeneralized_predicate";
    });
    var over = diags.filter(function (d) { return d.alias === "overgeneralized_predicate"; })[0];
    if (over) diags.push({ kind: "overgeneralized_predicate", level: "program", feature: over.feature, value: over.value, repair: "specialize", weight: 0.3, strong: false });
    var under = diags.filter(function (d) { return d.alias === "undergeneralized_predicate"; })[0];
    if (under) diags.push({ kind: "undergeneralized_predicate", level: "program", feature: under.feature, value: under.value, repair: "generalize", weight: 0.3, strong: false });
    /* representation failure overall: several representation-level signals
       and no strong program-level repair */
    var repN = diags.filter(function (d) { return d.level === "representation"; }).length;
    var strongProg = diags.some(function (d) { return d.strong && d.level !== "representation" && d.kind !== "missing_composition"; });
    if (repN >= 2 && !strongProg) {
      var sugg = [];
      diags.forEach(function (d) { (d.suggest || []).forEach(function (s) { if (sugg.indexOf(s) < 0) sugg.push(s); }); });
      diags.push({ kind: "wrong_representation", level: "representation", detail: "multiple_signals", suggest: sugg,
                   weight: 0.45, strong: false });
    }
  }

  /* Is a failure the representation's or the program's? */
  function failureLevel(diags) {
    var rep = 0, prog = 0;
    (diags || []).forEach(function (d) {
      var w = (d.strong ? 2 : 1) * (d.weight || 0.1);
      if (d.level === "representation") rep += w; else prog += w;
    });
    return { level: rep > prog ? "representation" : "program", representation: rep, program: prog };
  }

  RESID = { quick: quick, quickPair: quickPair, diagnose: diagnose, invariantsOf: invariantsOf, failureLevel: failureLevel,
            violations: violations, dimsRelation: dimsRelation, substitution: substitution,
            geometric: geometric, errorRegions: errorRegions, objectResidual: objectResidual,
            classPair: classPair, separatingClass: separatingClass, objFeatures: objFeatures,
            changeComponents: changeComponents, changeClass: changeClass, CHANGE_FEATURES: CHANGE_FEATURES,
            CLASS_FEATURES: CLASS_FEATURES };
})();
