/* ===== src/62a-genops.js ===== */
/* Generative operators: how an entity CREATES cells.
 *
 * Most unsolved same-shape tasks do not recolour or move what is there; they
 * add structure relative to it -- a ray until something is hit, a line to a
 * partner, a completed symmetry, a copy of a template on every marker, a
 * motif repeated to the edge. Each operator here is one such mechanism with
 * typed parameters, and the parameter grid is enumerated so the inducer
 * (63-sketch.js) can keep, per entity, exactly the instances whose paint
 * agrees with the demonstration (a version space), then intersect over the
 * entities a rule selects.
 *
 * An operator paints a list of cells. Single-colour operators (halo, fills,
 * rays, links) are coloured by the rule's COLOR expression; patch operators
 * (symmetry, stamp, repeat) carry the colours of the entity or template they
 * copy. Paint is computed relative to the INPUT's entities on the canvas the
 * object rules left, so a ray stops at what is actually there.
 *
 *   op        parameters
 *   halo      4 | 8 neighbourhood
 *   bbox      fill background inside the bounding box
 *   holes     fill enclosed holes
 *   ray       anchor (edge cells | minority-colour cells | bbox corner)
 *             x direction set (8 single, orth, diag, all, pairs; outward from
 *             the minority colour; away from / toward REL(e)) x stop (hit |
 *             through), and diagonal rays that bounce off the side walls
 *   link      straight or diagonal segment to REL(e)
 *   symm      mirror / rotate the entity about its own centre or REL(e)'s
 *   stamp     REL(e)'s patch (any D4 image) placed on e by centre or by
 *             pattern match
 *   repeat    the entity's patch copied every VEC until it leaves the grid
 */
var GEN = (function () {
  var DIRS = EXPR.DIRS, rel = EXPR.rel;
  var RAYSETS = { u: [0], d: [1], l: [2], r: [3], ul: [4], ur: [5], dl: [6], dr: [7],
                  orth: [0, 1, 2, 3], diag: [4, 5, 6, 7], all8: [0, 1, 2, 3, 4, 5, 6, 7], ud: [0, 1], lr: [2, 3] };

  function inb(sc, r, c) { return r >= 0 && r < sc.H && c >= 0 && c < sc.W; }
  function snapDir(dr, dc) {
    if (!dr && !dc) return -1;
    var a = Math.atan2(dr, dc), best = -1, bd = 9, i;
    for (i = 0; i < 8; i++) {
      var d = Math.abs(Math.atan2(DIRS[i][0], DIRS[i][1]) - a);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bd) { bd = d; best = i; }
    }
    return bd < 0.4 ? best : -1;
  }
  function uniqPush(set, list, p) { if (!set.has(p)) { set.add(p); list.push(p); } }

  /* cast a ray from (r,c) (exclusive) in direction d on canvas */
  function cast(sc, canvas, r, c, d, stop, seen, out, bounce) {
    var dr = DIRS[d][0], dc = DIRS[d][1], steps = 0;
    r += dr; c += dc;
    for (;;) {
      if (!inb(sc, r, c)) {
        if (!bounce || steps > 200) break;
        /* reflect the component that left the grid (side walls only for
           "bh", top/bottom only for "bv") */
        var rr = r, cc = c;
        if (bounce === "bh" && (c < 0 || c >= sc.W) && r >= 0 && r < sc.H) { dc = -dc; cc = c + 2 * dc; }
        else if (bounce === "bv" && (r < 0 || r >= sc.H) && c >= 0 && c < sc.W) { dr = -dr; rr = r + 2 * dr; }
        else break;
        r = rr; c = cc;
        if (!inb(sc, r, c)) break;
      }
      if (canvas[r][c] !== sc.bg) { if (stop === "hit") break; }
      else uniqPush(seen, out, (r << 6) | c);
      r += dr; c += dc; steps++;
    }
  }

  function rayCells(sc, e, canvas, op) {
    var out = [], seen = new Set(), i, j, p, r, c, dirs;
    if (op.dir === "out") {
      if (e.ncol < 2) return out;
      var sr = 0, scc = 0, n = 0, mr = 0, mc = 0, m = 0;
      for (i = 0; i < e.n; i++) {
        p = e.cells[i]; r = p >> 6; c = p & 63;
        if (sc.grid[r][c] === e.minor) { mr += r; mc += c; m++; } else { sr += r; scc += c; n++; }
      }
      if (!m || !n) return out;
      var d0 = snapDir(mr / m - sr / n, mc / m - scc / n);
      if (d0 < 0) return out;
      dirs = [d0];
    } else if (op.dir === "away" || op.dir === "toward") {
      var o = rel(sc, op.r, e);
      if (!o) return out;
      var dd = snapDir((e.cr2 - o.cr2) * (op.dir === "away" ? 1 : -1), (e.cc2 - o.cc2) * (op.dir === "away" ? 1 : -1));
      if (dd < 0) return out;
      dirs = [dd];
    } else dirs = RAYSETS[op.dir];
    for (j = 0; j < dirs.length; j++) {
      var d = dirs[j], dr = DIRS[d][0], dc = DIRS[d][1];
      if (op.anchor === "corner") {
        r = dr < 0 ? e.r0 : dr > 0 ? e.r1 : -1; c = dc < 0 ? e.c0 : dc > 0 ? e.c1 : -1;
        if (r < 0 || c < 0) continue;
        cast(sc, canvas, r, c, d, op.stop, seen, out, op.bounce);
        continue;
      }
      for (i = 0; i < e.n; i++) {
        p = e.cells[i]; r = p >> 6; c = p & 63;
        if (op.anchor === "minor" && sc.grid[r][c] !== e.minor) continue;
        if (inb(sc, r + dr, c + dc) && e.has(((r + dr) << 6) | (c + dc))) continue;
        cast(sc, canvas, r, c, d, op.stop, seen, out, op.bounce);
      }
    }
    return out;
  }

  function linkCells(sc, e, canvas, op) {
    var out = [], o, r, c;
    if (op.r === "allS" || op.r === "all") {
      /* every aligned partner (same colour for allS): the union of segments */
      var seen = new Set(), i, k;
      for (i = 0; i < sc.ents.length; i++) {
        var q = sc.ents[i];
        if (q === e || (op.r === "allS" && q.color !== e.color)) continue;
        var seg = linkCells(sc, e, canvas, { r: q, geo: op.geo });
        for (k = 0; k < seg.length; k++) uniqPush(seen, out, seg[k]);
      }
      return out;
    }
    o = typeof op.r === "object" ? op.r : rel(sc, op.r, e);
    if (!o) return out;
    if (op.geo === "orth") {
      if (sc.rowOverlap(e, o) && !sc.colOverlap(e, o)) {
        var ra = Math.max(e.r0, o.r0), rb = Math.min(e.r1, o.r1), ca = Math.min(e.c1, o.c1) + 1, cb = Math.max(e.c0, o.c0) - 1;
        for (r = ra; r <= rb; r++) for (c = ca; c <= cb; c++) if (canvas[r][c] === sc.bg) out.push((r << 6) | c);
      } else if (sc.colOverlap(e, o) && !sc.rowOverlap(e, o)) {
        var cA = Math.max(e.c0, o.c0), cB = Math.min(e.c1, o.c1), rA = Math.min(e.r1, o.r1) + 1, rB = Math.max(e.r0, o.r0) - 1;
        for (r = rA; r <= rB; r++) for (c = cA; c <= cB; c++) if (canvas[r][c] === sc.bg) out.push((r << 6) | c);
      }
      return out;
    }
    /* diagonal: between single cells (or bbox centres) on a 45 degree line */
    if (e.cr2 & 1 || e.cc2 & 1 || o.cr2 & 1 || o.cc2 & 1) return out;
    var r0 = e.cr2 / 2, c0 = e.cc2 / 2, r1 = o.cr2 / 2, c1 = o.cc2 / 2;
    if (Math.abs(r1 - r0) !== Math.abs(c1 - c0) || r0 === r1) return out;
    var sr = r1 > r0 ? 1 : -1, sc2 = c1 > c0 ? 1 : -1;
    for (r = r0 + sr, c = c0 + sc2; r !== r1; r += sr, c += sc2) if (canvas[r][c] === sc.bg && !e.has((r << 6) | c) && !o.has((r << 6) | c)) out.push((r << 6) | c);
    return out;
  }

  /* mirror images of e about a centre (doubled coordinates) */
  function symmCells(sc, e, canvas, op) {
    var cr2, cc2, o;
    if (op.about === "self") { cr2 = e.cr2; cc2 = e.cc2; }
    else { o = rel(sc, op.about, e); if (!o) return null; cr2 = o.cr2; cc2 = o.cc2; }
    var cells = [], cols = [], seen = new Set(), i, k;
    var maps = op.kind === "lr" ? [[1, -1]] : op.kind === "ud" ? [[-1, 1]] : op.kind === "rot2" ? [[-1, -1]] :
      op.kind === "both" ? [[1, -1], [-1, 1], [-1, -1]] : null;
    for (i = 0; i < e.n; i++) {
      var p = e.cells[i], r = p >> 6, c = p & 63, v = sc.grid[r][c];
      var imgs = [];
      if (maps) for (k = 0; k < maps.length; k++) {
        var rr = maps[k][0] === 1 ? r : cr2 - r, cc = maps[k][1] === 1 ? c : cc2 - c;
        imgs.push([rr, cc]);
      } else {
        /* rot4: quarter turns about the centre (needs cr2, cc2 of equal parity) */
        if ((cr2 & 1) !== (cc2 & 1)) return null;
        var y = 2 * r - cr2, x = 2 * c - cc2;
        imgs.push([(cr2 + x) / 2, (cc2 - y) / 2], [(cr2 - y) / 2, (cc2 - x) / 2], [(cr2 - x) / 2, (cc2 + y) / 2]);
      }
      for (k = 0; k < imgs.length; k++) {
        var R = imgs[k][0], C = imgs[k][1];
        if (!inb(sc, R, C)) continue;
        var q = (R << 6) | C;
        if (e.has(q) || (o && o.has(q)) || seen.has(q)) continue;
        seen.add(q); cells.push(q); cols.push(v);
      }
    }
    return { cells: cells, cols: cols };
  }

  /* template T = REL(e) painted onto e: by centre, or so that e's cells
     coincide with T's cells of the same colours (any D4 image of T) */
  function stampCells(sc, e, canvas, op) {
    var T = rel(sc, op.tpl, e);
    if (!T || T === e || T.n <= e.n) return null;
    var best = null, t, cnt = 0;
    for (t = 0; t < (op.d4 ? 8 : 1); t++) {
      var P = CORR.tpatch(T, t), ph = P.length, pw = P[0].length, offs = [];
      if (op.align === "center") {
        var dr2 = e.cr2 - (ph - 1), dc2 = e.cc2 - (pw - 1);
        if (dr2 & 1 || dc2 & 1) continue;
        offs.push([dr2 / 2, dc2 / 2]);
      } else {
        /* anchor e's first cell on each same-coloured template cell */
        var p0 = e.cells[0], v0 = sc.grid[p0 >> 6][p0 & 63], i, j;
        for (i = 0; i < ph; i++) for (j = 0; j < pw; j++) if (P[i][j] === v0) offs.push([(p0 >> 6) - i, (p0 & 63) - j]);
      }
      for (var k = 0; k < offs.length; k++) {
        var R0 = offs[k][0], C0 = offs[k][1], ok = true, q;
        if (op.align !== "center") {
          for (q = 0; q < e.n && ok; q++) {
            var pr = (e.cells[q] >> 6) - R0, pc = (e.cells[q] & 63) - C0;
            if (pr < 0 || pr >= ph || pc < 0 || pc >= pw || P[pr][pc] !== sc.grid[e.cells[q] >> 6][e.cells[q] & 63]) ok = false;
          }
          /* the template's cells of e's colours must be exactly e's cells */
          if (ok) for (var a = 0; a < ph && ok; a++) for (var b = 0; b < pw; b++) {
            if (P[a][b] < 0 || !(e.colors & (1 << P[a][b]))) continue;
            var rr = R0 + a, cc = C0 + b;
            if (!inb(sc, rr, cc) || !e.has((rr << 6) | cc)) { ok = false; break; }
          }
        }
        if (!ok) continue;
        cnt++;
        if (!best) best = { R0: R0, C0: C0, P: P };
      }
    }
    if (!best || cnt !== 1 && op.align !== "center") return null;
    var cells = [], cols = [], P2 = best.P;
    for (var i2 = 0; i2 < P2.length; i2++) for (var j2 = 0; j2 < P2[0].length; j2++) {
      if (P2[i2][j2] < 0) continue;
      var R = best.R0 + i2, C = best.C0 + j2;
      if (!inb(sc, R, C) || e.has((R << 6) | C)) continue;
      cells.push((R << 6) | C); cols.push(P2[i2][j2]);
    }
    return { cells: cells, cols: cols };
  }

  function repeatCells(sc, e, canvas, op) {
    var v = op.v.f(sc, e);
    if (!v || (!v[0] && !v[1])) return null;
    var cells = [], cols = [], k, i;
    for (k = 1; k < 62; k++) {
      var any = false;
      for (i = 0; i < e.n; i++) {
        var p = e.cells[i], R = (p >> 6) + v[0] * k, C = (p & 63) + v[1] * k;
        if (!inb(sc, R, C)) continue;
        any = true;
        cells.push((R << 6) | C); cols.push(sc.grid[p >> 6][p & 63]);
      }
      if (!any) break;
    }
    return { cells: cells, cols: cols };
  }

  function simpleCells(sc, e, canvas, op) {
    var out = [], i, j, r, c, seen = new Set();
    if (op.kind === "halo4" || op.kind === "halo8") {
      var nb = op.kind === "halo4" ? DIRS.slice(0, 4) : DIRS;
      for (i = 0; i < e.n; i++) for (j = 0; j < nb.length; j++) {
        r = (e.cells[i] >> 6) + nb[j][0]; c = (e.cells[i] & 63) + nb[j][1];
        if (!inb(sc, r, c) || canvas[r][c] !== sc.bg || e.has((r << 6) | c)) continue;
        uniqPush(seen, out, (r << 6) | c);
      }
      return out;
    }
    if (op.kind === "bbox") {
      for (r = e.r0; r <= e.r1; r++) for (c = e.c0; c <= e.c1; c++) if (canvas[r][c] === sc.bg) out.push((r << 6) | c);
      return out;
    }
    if (op.kind === "holes") return e.holeCells().filter(function (q) { return canvas[q >> 6][q & 63] === sc.bg; });
    return out;
  }

  /* paint(sc, e, canvas) -> {cells, cols|null} or null (undefined here) */
  function paint(sc, e, canvas, op) {
    switch (op.kind) {
      case "halo4": case "halo8": case "bbox": case "holes": return { cells: simpleCells(sc, e, canvas, op), cols: null };
      case "ray": return { cells: rayCells(sc, e, canvas, op), cols: null };
      case "link": return { cells: linkCells(sc, e, canvas, op), cols: null };
      case "symm": return symmCells(sc, e, canvas, op);
      case "stamp": return stampCells(sc, e, canvas, op);
      case "repeat": return repeatCells(sc, e, canvas, op);
    }
    return null;
  }

  /* the enumerated operator grid, each with its code length */
  var OPS = (function () {
    var out = [];
    function add(o) { o.key = key(o); out.push(o); }
    add({ kind: "halo4", b: 3 }); add({ kind: "halo8", b: 3 });
    add({ kind: "bbox", b: 3 }); add({ kind: "holes", b: 3 });
    Object.keys(RAYSETS).forEach(function (d) {
      var db = RAYSETS[d].length === 1 ? 3 : 1.5;
      ["hit", "thru"].forEach(function (st) {
        add({ kind: "ray", anchor: "edge", dir: d, stop: st, b: 3 + db + (st === "thru" ? 1 : 0) });
        add({ kind: "ray", anchor: "minor", dir: d, stop: st, b: 4.5 + db + (st === "thru" ? 1 : 0) });
      });
    });
    ["ul", "ur", "dl", "dr"].forEach(function (d) {
      ["hit", "thru"].forEach(function (st) {
        add({ kind: "ray", anchor: "corner", dir: d, stop: st, b: 7 + (st === "thru" ? 1 : 0) });
        add({ kind: "ray", anchor: "edge", dir: d, stop: st, bounce: "bh", b: 8 + (st === "thru" ? 1 : 0) });
        add({ kind: "ray", anchor: "edge", dir: d, stop: st, bounce: "bv", b: 8 + (st === "thru" ? 1 : 0) });
      });
    });
    ["hit", "thru"].forEach(function (st) {
      add({ kind: "ray", anchor: "minor", dir: "out", stop: st, b: 5 });
      add({ kind: "ray", anchor: "edge", dir: "out", stop: st, b: 5.5 });
      ["near", "nearD", "big", "cont"].forEach(function (r) {
        add({ kind: "ray", anchor: "edge", dir: "away", r: r, stop: st, b: 4 + EXPR.REL_BY[r][1] });
        add({ kind: "ray", anchor: "edge", dir: "toward", r: r, stop: st, b: 4 + EXPR.REL_BY[r][1] });
      });
    });
    ["near", "nearS", "nearD", "rowN", "colN", "nearP"].forEach(function (r) {
      add({ kind: "link", r: r, geo: "orth", b: 3 + EXPR.REL_BY[r][1] });
      add({ kind: "link", r: r, geo: "diag", b: 4 + EXPR.REL_BY[r][1] });
    });
    ["allS", "all"].forEach(function (r) {
      add({ kind: "link", r: r, geo: "orth", b: r === "allS" ? 4.5 : 5 });
      add({ kind: "link", r: r, geo: "diag", b: r === "allS" ? 5.5 : 6 });
    });
    ["lr", "ud", "rot2", "both", "rot4"].forEach(function (k) {
      ["self", "touch", "near", "nearD", "cont", "inner", "big"].forEach(function (a) {
        add({ kind: "symm", sym: k, about: a, b: 4 + (a === "self" ? 0 : EXPR.REL_BY[a][1]) , patch: true });
      });
    });
    ["big", "uniqS", "nearB", "near", "uniqC", "touch"].forEach(function (t) {
      add({ kind: "stamp", tpl: t, align: "center", d4: false, b: 4 + EXPR.REL_BY[t][1], patch: true });
      add({ kind: "stamp", tpl: t, align: "match", d4: false, b: 4 + EXPR.REL_BY[t][1], patch: true });
      add({ kind: "stamp", tpl: t, align: "match", d4: true, b: 7 + EXPR.REL_BY[t][1], patch: true });
    });
    var steps = ["1", "h", "w", "h+1", "w+1", "2"];
    EXPR.VEC_EXPRS.forEach(function (V) {
      var parts = V.k.split("*");
      if (parts.length === 2 && steps.indexOf(parts[1]) >= 0) add({ kind: "repeat", v: V, b: 3 + V.b, patch: true });
    });
    return out;
  })();
  /* symm uses op.sym for its kind */
  OPS.forEach(function (o) { if (o.kind === "symm") o.symKind = o.sym; });

  function key(o) {
    switch (o.kind) {
      case "ray": return "ray:" + o.anchor + ":" + o.dir + (o.r ? "(" + o.r + ")" : "") + ":" + o.stop + (o.bounce ? ":" + o.bounce : "");
      case "link": return "link:" + o.geo + "(" + o.r + ")";
      case "symm": return "symm:" + o.sym + "@" + o.about;
      case "stamp": return "stamp(" + o.tpl + "):" + o.align + (o.d4 ? ":d4" : "");
      case "repeat": return "repeat[" + o.v.k + "]";
      default: return o.kind;
    }
  }

  function apply(sc, e, canvas, op) {
    if (op.kind === "symm") return symmCells(sc, e, canvas, { kind: op.sym, about: op.about });
    return paint(sc, e, canvas, op);
  }

  return { OPS: OPS, apply: apply, RAYSETS: RAYSETS, snapDir: snapDir };
})();
