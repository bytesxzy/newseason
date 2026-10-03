/* ===== src/63-psyn-effects.js ===== */
/* Object effects with INVERSE semantics.
 *
 * An effect is what a rule does to one selected object: delete it, recolour it, move it, mirror it, fill its box or its
 * holes, grow a halo, shoot a ray, stamp a copy. Each effect exposes
 *
 *   writes(o, theta, sc)        forward semantics: the cells cleared and painted (clear list, [cell,colour,...] list)
 *   infer(o, sc, I, O)          INVERSE semantics: given the demonstrated output, the parameter values this effect
 *                               MUST have to be consistent for this object (usually zero or one value), derived from
 *                               the output instead of enumerated
 *   bits(theta)                 description length of the parameter
 *   facts                       abstract properties used to prune whole classes before anything is executed
 *
 * Colour-valued parameters are `ColorRef`s: a literal colour, a scene role ("the lone marker's colour"), or a relation
 * ("the colour of the object this one touches"). Roles and relations let one rule transfer across demonstrations whose
 * literal colours differ, and the learner prefers them whenever they explain the data equally well.
 */

(function () {
  var P = PSYN;
  var D4v = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];   /* up down left right + diagonals */
  var DIRN = ["up", "down", "left", "right", "ul", "ur", "dl", "dr"];

  /* ------------------------------------------------------------------ colour references */
  function uniqueOther(sc, o, idxList) {
    /* the single colour shared by the related objects that differ in colour from `o`; -1 when none or ambiguous */
    var c = -1, i, x;
    for (i = 0; i < idxList.length; i++) {
      x = sc.objs[idxList[i]];
      if (x === o || x.color === o.color) continue;
      if (c === -1) c = x.color; else if (c !== x.color) return -1;
    }
    return c;
  }
  var REL = {
    adj: function (sc, o) { return uniqueOther(sc, o, Object.keys(sc.rel().adj[o.id]).map(Number)); },
    enclosing: function (sc, o) { var e = sc.rel().enclosedBy[o.id]; return e < 0 ? -1 : sc.objs[e].color; },
    enclosed: function (sc, o) { return uniqueOther(sc, o, Object.keys(sc.rel().inside[o.id]).map(Number)); },
    nearest: function (sc, o) { var n = sc.rel().nearest[o.id]; return n < 0 ? -1 : sc.objs[n].color; },
    panelMarker: function (sc, o) {
      var pn = sc.panelOf(o); if (pn < 0) return -1;
      var idx = [], i; for (i = 0; i < sc.n; i++) if (i !== o.id && sc.panelOf(sc.objs[i]) === pn && !sc.isSeparator(sc.objs[i])) idx.push(i);
      return uniqueOther(sc, o, idx);
    },
    rowPartner: function (sc, o) { var idx = [], i; for (i = 0; i < sc.n; i++) if (i !== o.id && sc.rowAligned(o.id, i) && !sc.isSeparator(sc.objs[i])) idx.push(i); return uniqueOther(sc, o, idx); },
    colPartner: function (sc, o) { var idx = [], i; for (i = 0; i < sc.n; i++) if (i !== o.id && sc.colAligned(o.id, i) && !sc.isSeparator(sc.objs[i])) idx.push(i); return uniqueOther(sc, o, idx); },
    self: function (sc, o) { return o.color; }
  };
  var REL_NAMES = Object.keys(REL);
  /* kind: 'lit' (value), 'role' (name), 'rel' (name) */
  function evalRef(ref, sc, o) {
    if (ref.kind === "lit") return ref.v;
    if (ref.kind === "role") { var r = sc.roles()[ref.v]; return r === undefined ? -1 : r; }
    return REL[ref.v](sc, o);
  }
  function refKey(ref) { return ref.kind + ":" + ref.v; }
  function refBits(ref) { return ref.kind === "lit" ? 3.4 : ref.kind === "role" ? 3.0 : 3.6; }
  function refStr(ref) { return ref.kind === "lit" ? String(ref.v) : ref.kind === "role" ? "role." + ref.v : "rel." + ref.v; }
  function lit(v) { return { kind: "lit", v: v }; }

  /* ------------------------------------------------------------------ cell helpers */
  function cellRC(sc, k) { var r = (k / sc.W) | 0; return [r, k - r * sc.W]; }
  function inb(sc, r, c) { return r >= 0 && c >= 0 && r < sc.H && c < sc.W; }

  /* Writes: {clr: [cells set to background], pnt: [cell, colour, cell, colour, ...]} */
  function W() { return { clr: [], pnt: [] }; }

  /* ------------------------------------------------------------------ the effect table */
  var FX = {};

  FX.delete = {
    name: "delete", param: null, own: true, facts: { shrinks: true, addsColors: false },
    writes: function (o, th, sc) { var w = W(); w.clr = o.cells.slice(); return w; },
    infer: function (o, sc, I, O) { return [null]; },
    bits: function () { return 1.0; }, str: function () { return "delete"; }
  };

  FX.recolor = {
    name: "recolor", param: "color", own: true, facts: { addsColors: true },
    writes: function (o, th, sc) { var w = W(), i; if (th < 0) return null; for (i = 0; i < o.cells.length; i++) w.pnt.push(o.cells[i], th); return w; },
    /* inverse: the colour the output shows over the whole object, if it is uniform */
    infer: function (o, sc, I, O) {
      var v = O[(o.cells[0] / sc.W) | 0][o.cells[0] % sc.W], i, r, c;
      for (i = 1; i < o.cells.length; i++) { r = (o.cells[i] / sc.W) | 0; c = o.cells[i] - r * sc.W; if (O[r][c] !== v) return []; }
      return [v];
    },
    bits: function (th, ref) { return 1.0 + (ref ? refBits(ref) : 3.4); }, str: function (th, ref) { return "recolor(" + (ref ? refStr(ref) : th) + ")"; }
  };

  /* per-colour recolouring inside multicolour objects: the map is learned from the output cell by cell */
  FX.cmap = {
    name: "cmap", param: "map", own: true, facts: { addsColors: true },
    writes: function (o, th, sc) {
      var w = W(), i, r, c, v, t;
      for (i = 0; i < o.cells.length; i++) { r = (o.cells[i] / sc.W) | 0; c = o.cells[i] - r * sc.W; v = sc.grid[r][c]; t = th[v]; if (t !== undefined && t !== v) w.pnt.push(o.cells[i], t); }
      return w;
    },
    infer: function (o, sc, I, O) {
      if (!o.mixed) return [];
      var m = {}, i, r, c, v, t, n = 0;
      for (i = 0; i < o.cells.length; i++) {
        r = (o.cells[i] / sc.W) | 0; c = o.cells[i] - r * sc.W; v = I[r][c]; t = O[r][c];
        if (m[v] === undefined) m[v] = t; else if (m[v] !== t) return [];
      }
      for (v in m) if (m[v] !== +v) n++;
      return n ? [m] : [];
    },
    bits: function (th) { return 2.0 + 3.4 * Object.keys(th).length; }, str: function (th) { return "cmap(" + Object.keys(th).map(function (k) { return k + ">" + th[k]; }).join(",") + ")"; }
  };

  function translated(o, sc, dx, dy) {
    /* [rowOffset=dy... uses (dr,dc)] returns list of [cell, colour] after translation, dropping cells off the grid */
    var out = [], i, r, c, nr, nc;
    for (i = 0; i < o.cells.length; i++) {
      r = (o.cells[i] / sc.W) | 0; c = o.cells[i] - r * sc.W; nr = r + dy; nc = c + dx;
      if (inb(sc, nr, nc)) out.push(nr * sc.W + nc, sc.grid[r][c]);
    }
    return out;
  }
  FX.move = {
    name: "move", param: "vec", own: true, facts: { preservesCount: true, preservesColors: true },
    writes: function (o, th, sc) { var w = W(); w.clr = o.cells.slice(); w.pnt = translated(o, sc, th[0], th[1]); return w; },
    infer: function (o, sc, I, O) { return vectorsFor(o, sc, I, O, true); },
    bits: function (th) { return 1.0 + 2.0 + Math.log(1 + Math.abs(th[0]) + Math.abs(th[1])) / Math.LN2; }, str: function (th) { return "move(" + th[0] + "," + th[1] + ")"; }
  };
  FX.copy = {
    name: "copy", param: "vec", own: false, facts: { addsCells: true, preservesColors: true },
    writes: function (o, th, sc) { var w = W(); w.pnt = translated(o, sc, th[0], th[1]); return w; },
    infer: function (o, sc, I, O) { return vectorsFor(o, sc, I, O, false); },
    bits: function (th) { return 1.5 + 2.0 + Math.log(1 + Math.abs(th[0]) + Math.abs(th[1])) / Math.LN2; }, str: function (th) { return "copy(" + th[0] + "," + th[1] + ")"; }
  };
  /* find translations that reproduce the object (with its colours) in the output. For `move` the old cells must be
     cleared (or covered by something else); for `copy` the old cells must stay. */
  function vectorsFor(o, sc, I, O, isMove) {
    if (o.size > 400) return [];
    var out = [], first = o.cells[0], fr = (first / sc.W) | 0, fc = first - fr * sc.W, fv = I[fr][fc], r, c, dx, dy, ok, i, k, rr, cc, nr, nc, changedOnly = true, seenV = {};
    for (r = 0; r < sc.H; r++) for (c = 0; c < sc.W; c++) {
      if (O[r][c] !== fv || (r === fr && c === fc)) continue;
      dy = r - fr; dx = c - fc;
      ok = true;
      for (i = 0; i < o.cells.length; i++) {
        k = o.cells[i]; rr = (k / sc.W) | 0; cc = k - rr * sc.W; nr = rr + dy; nc = cc + dx;
        if (!inb(sc, nr, nc)) continue;              /* clipped at the border */
        if (O[nr][nc] !== I[rr][cc]) { ok = false; break; }
      }
      if (!ok) continue;
      /* old cells: moved objects leave background (unless overlapped by the new position); copies leave the object */
      var movedOld = true, newCells = {};
      for (i = 0; i < o.cells.length; i++) { k = o.cells[i]; rr = (k / sc.W) | 0; cc = k - rr * sc.W; newCells[(rr + dy) * sc.W + (cc + dx)] = 1; }
      for (i = 0; i < o.cells.length && movedOld; i++) {
        k = o.cells[i]; rr = (k / sc.W) | 0; cc = k - rr * sc.W;
        if (isMove) { if (!(newCells[k] || O[rr][cc] === sc.bg || O[rr][cc] !== I[rr][cc])) movedOld = false; }
        else if (O[rr][cc] !== I[rr][cc]) movedOld = false;
      }
      if (!movedOld) continue;
      if (!seenV[dx + "," + dy]) { seenV[dx + "," + dy] = 1; out.push([dx, dy]); }
    }
    return out;
  }

  /* slide until the next step would leave the grid or hit another object */
  function slideDelta(o, sc, dr, dc) {
    var maxStep = Math.max(sc.H, sc.W), step = 0, i, k, rr, cc, nr, nc, own = {}, cellsLen = o.cells.length;
    for (i = 0; i < cellsLen; i++) own[o.cells[i]] = 1;
    while (step < maxStep) {
      for (i = 0; i < cellsLen; i++) {
        k = o.cells[i]; rr = (k / sc.W) | 0; cc = k - rr * sc.W; nr = rr + dr * (step + 1); nc = cc + dc * (step + 1);
        if (!inb(sc, nr, nc)) return step;
        if (sc.grid[nr][nc] !== sc.bg && !own[nr * sc.W + nc]) return step;
      }
      step++;
    }
    return step;
  }
  FX.slide = {
    name: "slide", param: "dir", own: true, facts: { preservesCount: true, preservesColors: true },
    writes: function (o, th, sc) { var d = D4v[th], s = slideDelta(o, sc, d[0], d[1]), w = W(); if (!s) return w; w.clr = o.cells.slice(); w.pnt = translated(o, sc, d[1] * s, d[0] * s); return w; },
    infer: function (o, sc, I, O) {
      var vs = vectorsFor(o, sc, I, O, true), out = [], i, d, s;
      for (i = 0; i < vs.length; i++) for (d = 0; d < 4; d++) {
        s = slideDelta(o, sc, D4v[d][0], D4v[d][1]);
        if (s > 0 && vs[i][0] === D4v[d][1] * s && vs[i][1] === D4v[d][0] * s) out.push(d);
      }
      return out;
    },
    bits: function () { return 1.0 + 2.0; }, str: function (th) { return "slide." + DIRN[th]; }
  };

  /* in-place symmetry of the object about its bounding box */
  function d4Writes(o, th, sc) {
    var w = W(), pts = [], i, k, r, c, h = o.h, wd = o.w, t, nr, nc, sq = (h === wd);
    if ((th === 1 || th === 3 || th === 5 || th === 7) && !sq) return null;
    for (i = 0; i < o.cells.length; i++) {
      k = o.cells[i]; r = ((k / sc.W) | 0) - o.r0; c = (k % sc.W) - o.c0;
      t = P.D4T[th](r, c, h, wd); nr = o.r0 + t[0]; nc = o.c0 + t[1];
      pts.push(nr * sc.W + nc, sc.grid[o.r0 + r][o.c0 + c]);
    }
    w.clr = o.cells.slice(); w.pnt = pts;
    return w;
  }
  FX.d4 = {
    name: "d4", param: "d4", own: true, facts: { preservesCount: true, preservesColors: true },
    writes: function (o, th, sc) { return d4Writes(o, th, sc); },
    infer: function (o, sc, I, O) {
      var out = [], t, w, ok, i, r, c;
      if (o.size < 2) return out;
      for (t = 1; t < 8; t++) {
        w = d4Writes(o, t, sc); if (!w) continue;
        ok = true;
        for (i = 0; i < w.pnt.length; i += 2) { r = (w.pnt[i] / sc.W) | 0; c = w.pnt[i] - r * sc.W; if (O[r][c] !== w.pnt[i + 1]) { ok = false; break; } }
        if (ok) {
          /* the cells vacated by the transform must be background in the output (or painted over) */
          var painted = {}; for (i = 0; i < w.pnt.length; i += 2) painted[w.pnt[i]] = 1;
          for (i = 0; i < o.cells.length && ok; i++) if (!painted[o.cells[i]]) { r = (o.cells[i] / sc.W) | 0; c = o.cells[i] - r * sc.W; if (O[r][c] !== sc.bg) ok = false; }
          if (ok) {
            /* an identity-looking transform (symmetric object) is not evidence */
            var same = true; for (i = 0; i < o.cells.length; i++) if (!painted[o.cells[i]]) { same = false; break; }
            if (same && w.pnt.length === o.cells.length * 2) { var diff = false; for (i = 0; i < w.pnt.length; i += 2) { r = (w.pnt[i] / sc.W) | 0; c = w.pnt[i] - r * sc.W; if (I[r][c] !== w.pnt[i + 1]) { diff = true; break; } } if (!diff) continue; }
            out.push(t);
          }
        }
      }
      return out;
    },
    bits: function () { return 1.0 + 2.5; }, str: function (th) { return "d4." + P.D4_NAMES[th]; }
  };

  /* fills: paint background cells of a region derived from the object */
  function paintBg(sc, cells, col) { var w = W(), i; for (i = 0; i < cells.length; i++) if (sc.at[cells[i]] < 0 && sc.grid[(cells[i] / sc.W) | 0][cells[i] % sc.W] === sc.bg) w.pnt.push(cells[i], col); return w; }
  function bboxCells(o, sc) { var out = [], r, c; for (r = o.r0; r <= o.r1; r++) for (c = o.c0; c <= o.c1; c++) out.push(r * sc.W + c); return out; }
  FX.fillbox = {
    name: "fillbox", param: "color", own: false, facts: { addsCells: true, addsColors: true },
    writes: function (o, th, sc) { if (th < 0) return null; return paintBg(sc, bboxCells(o, sc), th); },
    infer: function (o, sc, I, O) { return regionColor(sc, bboxCells(o, sc), O); },
    bits: function (th, ref) { return 1.5 + (ref ? refBits(ref) : 3.4); }, str: function (th, ref) { return "fillbox(" + (ref ? refStr(ref) : th) + ")"; }
  };
  FX.fillholes = {
    name: "fillholes", param: "color", own: false, facts: { addsCells: true, addsColors: true },
    writes: function (o, th, sc) { if (th < 0 || !o.holes) return null; return paintBg(sc, o.encl, th); },
    infer: function (o, sc, I, O) { return o.holes ? regionColor(sc, o.encl, O) : []; },
    bits: function (th, ref) { return 1.5 + (ref ? refBits(ref) : 3.4); }, str: function (th, ref) { return "fillholes(" + (ref ? refStr(ref) : th) + ")"; }
  };
  function haloCells(o, sc, diag) {
    var seen = {}, out = [], i, k, r, c, d, nr, nc, nk, D = diag ? D4v : D4v.slice(0, 4);
    for (i = 0; i < o.cells.length; i++) {
      k = o.cells[i]; r = (k / sc.W) | 0; c = k - r * sc.W;
      for (d = 0; d < D.length; d++) { nr = r + D[d][0]; nc = c + D[d][1]; if (!inb(sc, nr, nc)) continue; nk = nr * sc.W + nc; if (!seen[nk]) { seen[nk] = 1; out.push(nk); } }
    }
    return out;
  }
  FX.halo8 = {
    name: "halo8", param: "color", own: false, facts: { addsCells: true, addsColors: true },
    writes: function (o, th, sc) { if (th < 0) return null; return paintBg(sc, haloCells(o, sc, true), th); },
    infer: function (o, sc, I, O) { return regionColor(sc, haloCells(o, sc, true), O); },
    bits: function (th, ref) { return 1.8 + (ref ? refBits(ref) : 3.4); }, str: function (th, ref) { return "halo8(" + (ref ? refStr(ref) : th) + ")"; }
  };
  FX.halo4 = {
    name: "halo4", param: "color", own: false, facts: { addsCells: true, addsColors: true },
    writes: function (o, th, sc) { if (th < 0) return null; return paintBg(sc, haloCells(o, sc, false), th); },
    infer: function (o, sc, I, O) { return regionColor(sc, haloCells(o, sc, false), O); },
    bits: function (th, ref) { return 1.8 + (ref ? refBits(ref) : 3.4); }, str: function (th, ref) { return "halo4(" + (ref ? refStr(ref) : th) + ")"; }
  };
  /* the single colour the output shows on the (background) cells of a region, if uniform and not background */
  function regionColor(sc, cells, O) {
    var v = -1, i, k, r, c, n = 0;
    for (i = 0; i < cells.length; i++) {
      k = cells[i]; r = (k / sc.W) | 0; c = k - r * sc.W;
      if (sc.at[k] >= 0 || sc.grid[r][c] !== sc.bg) continue;
      n++;
      if (v === -1) v = O[r][c]; else if (v !== O[r][c]) return [];
    }
    return n && v !== sc.bg && v >= 0 ? [v] : [];
  }

  /* a ray from every cell of the object in one of eight directions over background, painted in a colour or the object's own */
  function rayWrites(o, sc, d, col) {
    var w = W(), i, k, r, c, nr, nc, dd = D4v[d], seen = {};
    for (i = 0; i < o.cells.length; i++) {
      k = o.cells[i]; r = (k / sc.W) | 0; c = k - r * sc.W; nr = r + dd[0]; nc = c + dd[1];
      while (inb(sc, nr, nc) && sc.grid[nr][nc] === sc.bg && sc.at[nr * sc.W + nc] < 0) {
        var nk = nr * sc.W + nc;
        if (!seen[nk]) { seen[nk] = 1; w.pnt.push(nk, col < 0 ? sc.grid[r][c] : col); }
        nr += dd[0]; nc += dd[1];
      }
    }
    return w;
  }
  FX.ray = {
    name: "ray", param: "dir+color", own: false, facts: { addsCells: true },
    writes: function (o, th, sc) { return th.col === -2 ? null : rayWrites(o, sc, th.d, th.col); },
    infer: function (o, sc, I, O) {
      var out = [], d, w, ok, i, r, c, cols = {}, col;
      for (d = 0; d < 8; d++) {
        w = rayWrites(o, sc, d, -1); if (!w.pnt.length) continue;
        /* own colour first */
        ok = true; for (i = 0; i < w.pnt.length; i += 2) { r = (w.pnt[i] / sc.W) | 0; c = w.pnt[i] - r * sc.W; if (O[r][c] !== w.pnt[i + 1]) { ok = false; break; } }
        if (ok) { out.push({ d: d, col: -1 }); continue; }
        col = -3;
        ok = true; for (i = 0; i < w.pnt.length; i += 2) { r = (w.pnt[i] / sc.W) | 0; c = w.pnt[i] - r * sc.W; if (col === -3) col = O[r][c]; else if (O[r][c] !== col) { ok = false; break; } }
        if (ok && col >= 0 && col !== sc.bg) out.push({ d: d, col: col });
      }
      return out;
    },
    bits: function (th) { return 2.5 + (th.col < 0 ? 0.5 : 3.4); }, str: function (th) { return "ray." + DIRN[th.d] + "(" + (th.col < 0 ? "self" : th.col) + ")"; }
  };

  /* Intra-object structure: the colour of a cell is a function of where it sits INSIDE its object (top/bottom half,
     left/right half, border versus interior, ring depth, number of in-object neighbours). The output fixes that function
     cell by cell; the inverse returns it as a table. */
  var PART_FEATURES = ["vhalf", "hhalf", "border", "ring", "nbrs", "rowpar", "colpar"];
  function partValue(f, o, sc, k, own) {
    var r = (k / sc.W) | 0, c = k - r * sc.W, rr = r - o.r0, cc = c - o.c0;
    switch (f) {
      case "vhalf": return 2 * rr + 1 < o.h ? 0 : (2 * rr + 1 > o.h ? 1 : 2);
      case "hhalf": return 2 * cc + 1 < o.w ? 0 : (2 * cc + 1 > o.w ? 1 : 2);
      case "rowpar": return rr & 1;
      case "colpar": return cc & 1;
      default: {
        var n = 0, d;
        for (d = 0; d < 4; d++) { var nr = r + D4v[d][0], nc = c + D4v[d][1]; if (inb(sc, nr, nc) && own[nr * sc.W + nc]) n++; }
        if (f === "nbrs") return n;
        if (f === "border") return n < 4 ? 1 : 0;
        /* ring: 0 on the boundary, 1 one step in, 2 deeper */
        if (n < 4) return 0;
        var d8 = 0; for (d = 0; d < 8; d++) { var mr = r + D4v[d][0], mc = c + D4v[d][1]; if (!inb(sc, mr, mc) || !own[mr * sc.W + mc]) d8++; }
        return d8 ? 1 : 2;
      }
    }
  }
  function ownSet(o) { var own = {}, i; for (i = 0; i < o.cells.length; i++) own[o.cells[i]] = 1; return own; }
  FX.partmap = {
    name: "partmap", param: "map", own: true, facts: { addsColors: true },
    writes: function (o, th, sc) {
      var w = W(), own = ownSet(o), i, v, t;
      for (i = 0; i < o.cells.length; i++) { v = partValue(th.f, o, sc, o.cells[i], own); t = th.map[v]; if (t !== undefined && t !== sc.grid[(o.cells[i] / sc.W) | 0][o.cells[i] % sc.W]) w.pnt.push(o.cells[i], t); }
      return w;
    },
    infer: function (o, sc, I, O) {
      if (o.size < 2) return [];
      var own = ownSet(o), out = [], fi, f, m, i, k, r, c, v, ok, changed;
      for (fi = 0; fi < PART_FEATURES.length; fi++) {
        f = PART_FEATURES[fi]; m = {}; ok = true; changed = 0;
        for (i = 0; i < o.cells.length && ok; i++) {
          k = o.cells[i]; r = (k / sc.W) | 0; c = k - r * sc.W; v = partValue(f, o, sc, k, own);
          if (m[v] === undefined) m[v] = O[r][c]; else if (m[v] !== O[r][c]) ok = false;
        }
        if (!ok) continue;
        /* keep only the values whose colour actually changes; at least two distinct values must exist (otherwise it is a plain recolour) */
        var vals = Object.keys(m), ch = {}, nCh = 0, nVals = vals.length;
        for (i = 0; i < o.cells.length; i++) { k = o.cells[i]; r = (k / sc.W) | 0; c = k - r * sc.W; v = partValue(f, o, sc, k, own); if (I[r][c] !== m[v]) { ch[v] = m[v]; } }
        nCh = Object.keys(ch).length;
        if (nCh && nVals >= 2 && nCh < nVals + 0.5) out.push({ f: f, map: ch });
      }
      return out;
    },
    bits: function (th) { return 2.5 + 3.4 * Object.keys(th.map).length; }, str: function (th) { return "partmap." + th.f + "(" + Object.keys(th.map).map(function (k) { return k + ">" + th.map[k]; }).join(",") + ")"; }
  };

  /* ------------------------------------------------------------------ consistency with the demonstrated output */
  /* A write set is consistent with the output when every painted cell shows the painted colour and every cleared cell
     shows background (or something else, which another rule may have painted). Exact verification runs afterwards. */
  function consistent(w, sc, I, O) {
    var i, k, r, c, painted = null;
    if (!w) return false;
    for (i = 0; i < w.pnt.length; i += 2) { k = w.pnt[i]; r = (k / sc.W) | 0; c = k - r * sc.W; if (O[r][c] !== w.pnt[i + 1]) return false; }
    if (w.clr.length) {
      painted = {}; for (i = 0; i < w.pnt.length; i += 2) painted[w.pnt[i]] = 1;
      for (i = 0; i < w.clr.length; i++) {
        k = w.clr[i]; if (painted[k]) continue;
        r = (k / sc.W) | 0; c = k - r * sc.W;
        if (O[r][c] !== sc.bg && O[r][c] === I[r][c]) return false;
      }
    }
    return true;
  }
  /* number of still-uncovered changed cells this write set accounts for; marks nothing */
  function coverage(w, sc, I, O, uncovered) {
    var n = 0, i, k, r, c;
    for (i = 0; i < w.pnt.length; i += 2) { k = w.pnt[i]; if (uncovered[k]) { r = (k / sc.W) | 0; c = k - r * sc.W; if (O[r][c] === w.pnt[i + 1] && I[r][c] !== O[r][c]) n++; } }
    for (i = 0; i < w.clr.length; i++) { k = w.clr[i]; if (uncovered[k]) { r = (k / sc.W) | 0; c = k - r * sc.W; if (O[r][c] === sc.bg && I[r][c] !== O[r][c]) n++; } }
    return n;
  }

  P.FX = FX; P.REL = REL; P.REL_NAMES = REL_NAMES; P.evalRef = evalRef; P.refKey = refKey; P.refBits = refBits; P.refStr = refStr; P.lit = lit;
  P.consistent = consistent; P.coverage = coverage; P.DIRN = DIRN; P.D4v = D4v; P.slideDelta = slideDelta;
})();
