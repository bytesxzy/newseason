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
  var OPP = [1, 0, 3, 2, 7, 6, 5, 4];
  /* direction from e toward o: perpendicular when they share rows or
     columns (a line or band is approached square-on), else the snapped
     centre-to-centre direction */
  function relDir(sc, e, o) {
    var rov = sc.rowOverlap(e, o), cov = sc.colOverlap(e, o);
    if (cov && !rov) return e.r1 < o.r0 ? 1 : 0;
    if (rov && !cov) return e.c1 < o.c0 ? 3 : 2;
    return snapDir(o.cr2 - e.cr2, o.cc2 - e.cc2);
  }
  /* a bar of computed length k beside the entity, as wide as the entity:
     "under each block, a column as tall as the block has colours" */
  function barCells(sc, e, canvas, op) {
    var k = op.len.f(sc, e), out = [], r, c;
    if (!(k > 0) || k > 30) return out;
    var d = DIRS[op.d];
    if (op.d === 1 || op.d === 0) {
      for (var i = 1; i <= k; i++) {
        r = op.d === 1 ? e.r1 + i : e.r0 - i;
        for (c = e.c0; c <= e.c1; c++) if (inb(sc, r, c) && canvas[r][c] === sc.bg) out.push((r << 6) | c);
      }
    } else {
      for (var j = 1; j <= k; j++) {
        c = op.d === 3 ? e.c1 + j : e.c0 - j;
        for (r = e.r0; r <= e.r1; r++) if (inb(sc, r, c) && canvas[r][c] === sc.bg) out.push((r << 6) | c);
      }
    }
    return d ? out : out;
  }
  /* extrude(c): every cell of colour c in e is a corner the whole shape
     is pushed through -- copies of e's mask step along the direction from
     e's centre through that cell until they leave the grid */
  function extrudeCells(sc, e, canvas, op) {
    if (!(e.colors & (1 << op.c)) || e.ncol < 2) return null;
    var dirs = new Set(), i, out = [], seen = new Set();
    for (i = 0; i < e.n; i++) {
      var p = e.cells[i], r = p >> 6, c = p & 63;
      if (sc.grid[r][c] !== op.c) continue;
      var d = snapDir(2 * r - e.cr2, 2 * c - e.cc2);
      if (d >= 0) dirs.add(d);
    }
    dirs.forEach(function (d) {
      for (var k = 1; k < 62; k++) {
        var any = false;
        for (var j = 0; j < e.n; j++) {
          var R = (e.cells[j] >> 6) + DIRS[d][0] * k, C = (e.cells[j] & 63) + DIRS[d][1] * k;
          if (!inb(sc, R, C)) continue;
          any = true;
          if (canvas[R][C] === sc.bg) uniqPush(seen, out, (R << 6) | C);
        }
        if (!any) break;
      }
    });
    return out.length ? { cells: out, cols: null } : null;
  }
  /* stretch e toward R until its far end reaches R's row / column: the end
     slice is moved there and the interior slice repeated in between */
  function stretchCells(sc, e, canvas, op) {
    var o = rel(sc, op.r, e);
    if (!o || e.h < 3 && e.w < 3) return null;
    var rov = sc.rowOverlap(e, o), cov = sc.colOverlap(e, o), cells = [], cols = [], P = e.patch, i, j, r, c;
    function put(rr, cc, v) { if (v >= 0 && inb(sc, rr, cc)) { cells.push((rr << 6) | cc); cols.push(v); } }
    if (cov && !rov) {
      var down = e.r1 < o.r0, end = down ? o.r1 : o.r0;
      var edgeRow = down ? P[e.h - 1] : P[0], mid = down ? P[e.h - 2] : P[1];
      if (!mid) return null;
      for (r = down ? e.r1 : e.r0; down ? r <= end : r >= end; r += down ? 1 : -1) {
        var row = r === end ? edgeRow : mid;
        for (j = 0; j < e.w; j++) put(r, e.c0 + j, row[j]);
      }
      return { cells: cells, cols: cols };
    }
    if (rov && !cov) {
      var right = e.c1 < o.c0, endc = right ? o.c1 : o.c0;
      var edgeCol = [], midCol = [];
      for (i = 0; i < e.h; i++) { edgeCol.push(P[i][right ? e.w - 1 : 0]); midCol.push(P[i][right ? e.w - 2 : 1]); }
      for (c = right ? e.c1 : e.c0; right ? c <= endc : c >= endc; c += right ? 1 : -1) {
        var col = c === endc ? edgeCol : midCol;
        for (i = 0; i < e.h; i++) put(e.r0 + i, c, col[i]);
      }
      return { cells: cells, cols: cols };
    }
    return null;
  }
  /* the midpoint between e and its partner (a dot or a plus) */
  function midCells(sc, e, canvas, op) {
    var o = rel(sc, op.r, e), out = [];
    if (!o || e.cr2 + o.cr2 & 3 || e.cc2 + o.cc2 & 3) return out;
    var r = (e.cr2 + o.cr2) / 4, c = (e.cc2 + o.cc2) / 4, k, pts = [[0, 0]];
    if (op.shape === "plus") pts = pts.concat(DIRS.slice(0, 4));
    for (k = 0; k < pts.length; k++) {
      var R = r + pts[k][0], C = c + pts[k][1];
      if (inb(sc, R, C) && canvas[R][C] === sc.bg) out.push((R << 6) | C);
    }
    return out;
  }
  /* rays leaking out of gaps in the entity's frame: every background cell
     on the bbox boundary casts outward, perpendicular to its side */
  function leakCells(sc, e, canvas, op) {
    var out = [], seen = new Set(), r, c;
    if (e.h < 3 || e.w < 3) return out;
    function side(r0, c0, d) {
      /* a gap is a boundary cell of the frame that is not the frame: it
         leaks whatever colour the canvas has there by now */
      if (e.has((r0 << 6) | c0) || sc.grid[r0][c0] !== sc.bg) return;
      if (canvas[r0][c0] === sc.bg) uniqPush(seen, out, (r0 << 6) | c0);
      cast(sc, canvas, r0, c0, d, op.stop, seen, out, null);
    }
    for (c = e.c0; c <= e.c1; c++) { side(e.r0, c, 0); side(e.r1, c, 1); }
    for (r = e.r0 + 1; r < e.r1; r++) { side(r, e.c0, 2); side(r, e.c1, 3); }
    return out;
  }

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
      var dd = relDir(sc, e, o);
      if (dd < 0) return out;
      if (op.dir === "away") dd = OPP[dd];
      dirs = [dd];
    } else if (op.dir === "concave") {
      /* from the entity's mass through the empty part of its box */
      var dc0 = snapDir(e.cr2 / 2 - e.mr, e.cc2 / 2 - e.mc);
      if (dc0 < 0) return out;
      dirs = [dc0];
    } else dirs = RAYSETS[op.dir];
    for (j = 0; j < dirs.length; j++) {
      var d = dirs[j], dr = DIRS[d][0], dc = DIRS[d][1];
      if (op.anchor === "center") {
        if (e.cr2 & 1 || e.cc2 & 1) return out;
        if (canvas[e.cr2 / 2][e.cc2 / 2] === sc.bg) uniqPush(seen, out, ((e.cr2 / 2) << 6) | (e.cc2 / 2));
        cast(sc, canvas, e.cr2 / 2, e.cc2 / 2, d, op.stop, seen, out, op.bounce);
        continue;
      }
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
    if (!T || T === e || T.n < e.n) return null;
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
      if (P2[i2][j2] < 0 || P2[i2][j2] === sc.bg) continue;
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
      case "leak": return { cells: leakCells(sc, e, canvas, op), cols: null };
      case "mid": return { cells: midCells(sc, e, canvas, op), cols: null };
      case "bar": return { cells: barCells(sc, e, canvas, op), cols: null };
      case "stretch": return stretchCells(sc, e, canvas, op);
      case "extrude": return extrudeCells(sc, e, canvas, op);
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
    /* isotropy prior: all directions alike is the default; one axis, or
       one direction, is an extra choice that must be paid for */
    var DIRSET_BITS = { all8: 1.0, orth: 1.5, diag: 1.5, ud: 2.5, lr: 2.5 };
    Object.keys(RAYSETS).forEach(function (d) {
      var db = RAYSETS[d].length === 1 ? 3.5 : DIRSET_BITS[d];
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
      add({ kind: "ray", anchor: "corner", dir: "concave", stop: st, b: 6 });
      ["orth", "diag", "all8", "ud", "lr"].forEach(function (d) { add({ kind: "ray", anchor: "center", dir: d, stop: st, b: 5 + (st === "thru" ? 1 : 0) }); });
      add({ kind: "leak", stop: st, b: 5 });
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
    ["nearS", "near", "rowN", "colN"].forEach(function (r) {
      add({ kind: "mid", r: r, shape: "dot", b: 4 + EXPR.REL_BY[r][1] });
      add({ kind: "mid", r: r, shape: "plus", b: 5 + EXPR.REL_BY[r][1] });
    });
    [0, 1, 2, 3].forEach(function (d) {
      EXPR.INT_EXPRS.filter(function (I) { return ["ncolE", "h", "w", "n", "1", "2", "3", "#same", "holes"].indexOf(I.k) >= 0 || I.k === "ncol"; })
        .forEach(function (I) { add({ kind: "bar", d: d, len: I, b: 4 + I.b }); });
    });
    ["near", "nearP", "nearD"].forEach(function (r) { add({ kind: "stretch", r: r, b: 4 + EXPR.REL_BY[r][1], patch: true }); });
    for (var xc = 0; xc < 10; xc++) add({ kind: "extrude", c: xc, b: 5 + EXPR.LOG2_10 });
    ["allS", "all"].forEach(function (r) {
      add({ kind: "link", r: r, geo: "orth", b: r === "allS" ? 4.5 : 5 });
      add({ kind: "link", r: r, geo: "diag", b: r === "allS" ? 5.5 : 6 });
    });
    ["lr", "ud", "rot2", "both", "rot4"].forEach(function (k) {
      ["self", "touch", "near", "nearD", "cont", "inner", "big"].forEach(function (a) {
        add({ kind: "symm", sym: k, about: a, b: 4 + (a === "self" ? 0 : EXPR.REL_BY[a][1]) , patch: true });
      });
    });
    ["lr", "ud", "rot2", "both", "rot4"].forEach(function (k) {
      ["self", "near", "big"].forEach(function (a) {
        add({ kind: "symm", sym: k, about: a, rc: true, b: 5 + (a === "self" ? 0 : EXPR.REL_BY[a][1]) });
      });
    });
    ["big", "uniqS", "nearB", "near", "uniqC", "touch", "hasC", "rich"].forEach(function (t) {
      add({ kind: "stamp", tpl: t, align: "center", d4: false, b: 4 + EXPR.REL_BY[t][1], patch: true });
      add({ kind: "stamp", tpl: t, align: "match", d4: false, b: 4 + EXPR.REL_BY[t][1], patch: true });
      add({ kind: "stamp", tpl: t, align: "match", d4: true, b: 7 + EXPR.REL_BY[t][1], patch: true });
      add({ kind: "stamp", tpl: t, align: "center", d4: false, rc: true, b: 5 + EXPR.REL_BY[t][1] });
    });
    var steps = ["1", "h", "w", "h+1", "w+1", "2"];
    EXPR.VEC_EXPRS.forEach(function (V) {
      var parts = V.k.split("*");
      if (parts.length === 2 && steps.indexOf(parts[1]) >= 0) {
        add({ kind: "repeat", v: V, b: 3 + V.b, patch: true });
        add({ kind: "repeat", v: V, b: 4 + V.b, rc: true });
      }
    });
    /* extrusion toward the minority-colour corner (major -> minor), step 1 */
    ["1"].forEach(function (st) {
      var V = { k: "out*" + st, b: 4, f: function (sc, e) {
        if (e.ncol < 2) return null;
        var sr = 0, scc = 0, n = 0, mr = 0, mc = 0, m = 0, i;
        for (i = 0; i < e.n; i++) {
          var p = e.cells[i], r = p >> 6, c = p & 63;
          if (sc.grid[r][c] === e.minor) { mr += r; mc += c; m++; } else { sr += r; scc += c; n++; }
        }
        if (!m || !n) return null;
        var d = snapDir(mr / m - sr / n, mc / m - scc / n);
        return d < 0 ? null : [DIRS[d][0], DIRS[d][1]];
      } };
      add({ kind: "repeat", v: V, b: 3 + V.b, patch: true });
      add({ kind: "repeat", v: V, b: 4 + V.b, rc: true });
    });
    /* extrusion toward the cells of one colour c (a marker colour that need
       not be the minority) */
    for (var mc = 0; mc < 10; mc++) (function (cc) {
      var V = { k: "outc" + cc + "*1", b: 4 + EXPR.LOG2_10, f: function (sc, e) {
        if (e.ncol < 2 || !(e.colors & (1 << cc))) return null;
        var sr = 0, scc = 0, n = 0, mr = 0, mcc = 0, m = 0, i;
        for (i = 0; i < e.n; i++) {
          var p = e.cells[i], r = p >> 6, c = p & 63;
          if (sc.grid[r][c] === cc) { mr += r; mcc += c; m++; } else { sr += r; scc += c; n++; }
        }
        if (!m || !n) return null;
        var d = snapDir(mr / m - sr / n, mcc / m - scc / n);
        return d < 0 ? null : [DIRS[d][0], DIRS[d][1]];
      } };
      add({ kind: "repeat", v: V, b: 4 + V.b, rc: true });
    })(mc);
    /* repeats stepping away from / toward a related entity by own size+1 */
    ["near", "nearD", "big", "nearP"].forEach(function (r) {
      ["away", "toward"].forEach(function (w) {
        ["h+1", "1", "h-1"].forEach(function (st) {
          var V = { k: w + "(" + r + ")*" + st, b: 3 + EXPR.REL_BY[r][1], rel: r, f: function (sc, e) {
            var o = EXPR.rel(sc, r, e); if (!o) return null;
            var d = relDir(sc, e, o); if (d < 0) return null;
            if (w === "away") d = OPP[d];
            var sz = DIRS[d][0] ? e.h : e.w, k = st === "1" ? 1 : st === "h-1" ? sz - 1 : sz + 1;
            if (k < 1) return null;
            return [DIRS[d][0] * k, DIRS[d][1] * k];
          } };
          add({ kind: "repeat", v: V, b: 3 + V.b, patch: true });
          add({ kind: "repeat", v: V, b: 4 + V.b, rc: true });
        });
      });
    });
    return out;
  })();
  /* symm uses op.sym for its kind */
  OPS.forEach(function (o) { if (o.kind === "symm") o.symKind = o.sym; });

  function key(o) {
    switch (o.kind) {
      case "ray": return "ray:" + o.anchor + ":" + o.dir + (o.r ? "(" + o.r + ")" : "") + ":" + o.stop + (o.bounce ? ":" + o.bounce : "");
      case "link": return "link:" + o.geo + "(" + o.r + ")";
      case "symm": return "symm:" + o.sym + "@" + o.about + (o.rc ? ":rc" : "");
      case "stamp": return "stamp(" + o.tpl + "):" + o.align + (o.d4 ? ":d4" : "") + (o.rc ? ":rc" : "");
      case "repeat": return "repeat[" + o.v.k + "]" + (o.rc ? ":rc" : "");
      case "leak": return "leak:" + o.stop;
      case "mid": return "mid(" + o.r + "):" + o.shape;
      case "bar": return "bar:" + EXPR.DNAME[o.d] + "*" + o.len.k;
      case "stretch": return "stretch(" + o.r + ")";
      case "extrude": return "extrude(" + o.c + ")";
      default: return o.kind;
    }
  }

  /* Results are memoised per scene by (operator, entity, canvas): every
     growth arm and every refinement re-asks the same questions. Stamps,
     repeats and symmetries do not read the canvas at all. */
  var CANVAS_FREE = { stamp: 1, symm: 1 };
  var NEXT_IDX = 1;
  function apply(sc, e, canvas, op) {
    if (!op.idx) op.idx = NEXT_IDX++;
    var cache = sc._gen || (sc._gen = new Map());
    var ch = CANVAS_FREE[op.kind] && !op.rc ? 0 : G.ghash(canvas);
    var bucket = cache.get(ch);
    if (!bucket) { if (cache.size > 64) cache.clear(); bucket = new Map(); cache.set(ch, bucket); }
    var k = op.idx * 128 + e.id;
    var res = bucket.get(k);
    if (res !== undefined) return res;
    res = apply0(sc, e, canvas, op);
    bucket.set(k, res);
    return res;
  }
  function apply0(sc, e, canvas, op) {
    if (op.kind === "symm") {
      var sm = symmCells(sc, e, canvas, { kind: op.sym, about: op.about });
      if (sm && op.rc) {
        /* the completed part drawn in the rule's colour, only where empty */
        var cs = [];
        for (var q = 0; q < sm.cells.length; q++) if (canvas[sm.cells[q] >> 6][sm.cells[q] & 63] === sc.bg) cs.push(sm.cells[q]);
        return { cells: cs, cols: null };
      }
      return sm;
    }
    if (op.kind === "stamp" && op.rc) {
      /* the template's shape in the rule's colour, on empty cells only */
      var sp = stampCells(sc, e, canvas, op);
      return sp ? { cells: sp.cells.filter(function (p) { return canvas[p >> 6][p & 63] === sc.bg; }), cols: null } : null;
    }
    if (op.kind === "repeat" && op.rc) {
      var rp = repeatCells(sc, e, canvas, op);
      return rp ? { cells: rp.cells.filter(function (p) { return canvas[p >> 6][p & 63] === sc.bg; }), cols: null } : null;
    }
    if (op.kind === "fused") {
      /* a library concept: two operators of one rule, the second measured on
         the canvas the first left */
      var a = apply(sc, e, canvas, op.a);
      if (!a) return null;
      var cv = canvas.map(function (row) { return row.slice(); }), i, mark = op.c0 === undefined ? 1 : op.c0;
      for (i = 0; i < a.cells.length; i++) cv[a.cells[i] >> 6][a.cells[i] & 63] = a.cols ? a.cols[i] : (sc.bg === mark ? mark + 1 : mark) % 10;
      var b = apply(sc, e, cv, op.b);
      if (!b) return null;
      var seen = new Set(), cells = [], cols = (a.cols || b.cols) ? [] : null;
      [a, b].forEach(function (res) {
        for (var k = 0; k < res.cells.length; k++) if (!seen.has(res.cells[k])) {
          seen.add(res.cells[k]); cells.push(res.cells[k]);
          if (cols) cols.push(res.cols ? res.cols[k] : -1);
        }
      });
      if (cols && cols.indexOf(-1) >= 0) return null;       /* mixed colour sources */
      return { cells: cells, cols: cols };
    }
    return paint(sc, e, canvas, op);
  }
  /* register a mined concept (62b-concepts.js) as one more operator */
  function addFused(def) {
    var A = null, B = null;
    OPS.forEach(function (o) { if (o.key === def.a) A = o; if (o.key === def.b) B = o; });
    if (!A || !B || !!A.patch !== !!B.patch) return null;
    var o = { kind: "fused", a: A, b: B, patch: !!A.patch, b0: 0, concept: def };
    o.b = Math.max(A.b, B.b) + 1;
    o.key = "fuse(" + A.key + "+" + B.key + ")";
    OPS.push(o);
    return o;
  }

  return { OPS: OPS, apply: apply, addFused: addFused, RAYSETS: RAYSETS, snapDir: snapDir };
})();
