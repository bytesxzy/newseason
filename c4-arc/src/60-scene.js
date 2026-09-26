/* ===== src/60-scene.js ===== */
/* Executable scenes: entities with attributes and relations, over a small
 * BEAM of segmentations.
 *
 * Perception in ARC is ambiguous: a two-coloured shape is one thing under
 * multicolour connectivity and two things under single-colour connectivity;
 * a hole is nothing to a foreground segmenter and an object to a
 * negative-space one. Committing to one reading hides the rule whenever the
 * task was written in another, so a scene is always built for a named
 * segmentation, and synthesis (63-sketch.js) searches over the beam.
 *
 * An entity is a first-class value, not a feature row: it has cells, a mask,
 * a patch, D4-canonical shape keys, colour roles, symmetry, holes, border
 * contact, and it takes part in relations (distance, contact, containment,
 * alignment, nearest-of-a-kind) that programs can NAME. Relations are
 * computed lazily and cached per scene, scenes are cached per (grid,
 * segmentation, background) for one top-level solve.
 *
 *   seg   meaning
 *   c4/c8 same-colour 4/8-connected foreground components
 *   m4/m8 multicolour 4/8-connected foreground components
 *   col   every cell of one colour, as one entity
 *   bgin  enclosed background regions (negative space not touching the edge)
 *   bg4   every 4-connected background region
 *   cell  single foreground cells (small grids only)
 */
var SCN = (function () {
  var SEGS = ["c8", "c4", "m8", "m4", "col", "bgin", "bg4", "cell"];
  var MAX_ENTS = 64;

  /* ---------------------------------------------------------- masks / D4 */
  function maskKey(m) {
    var parts = [], r;
    for (r = 0; r < m.length; r++) parts.push(m[r].join(""));
    return parts.join("|");
  }
  function tf(m, k) {
    /* 0 id, 1 rot90, 2 rot180, 3 rot270, 4 flipH, 5 flipV, 6 transpose, 7 anti */
    switch (k) {
      case 0: return m;
      case 1: return G.rot90(m);
      case 2: return G.rot180(m);
      case 3: return G.rot270(m);
      case 4: return G.flipH(m);
      case 5: return G.flipV(m);
      case 6: return G.transpose(m);
      default: return G.antiTranspose(m);
    }
  }
  var TF_INV = [0, 3, 2, 1, 4, 5, 6, 7];
  function d4Key(m) {
    var best = null, k, s;
    for (k = 0; k < 8; k++) { s = maskKey(tf(m, k)); if (best === null || s < best) best = s; }
    return best;
  }

  /* ------------------------------------------------------------ entities */
  function Ent(cells, grid, bg, seg, id) {
    var H = grid.length, W = grid[0].length, i, p, r, c, v;
    this.id = id;
    this.seg = seg;
    this.cells = cells;                       /* packed r*64+c, reading order */
    this.n = cells.length;
    var r0 = 99, c0 = 99, r1 = -1, c1 = -1, cnt = new Int32Array(10), sr = 0, sc = 0;
    for (i = 0; i < cells.length; i++) {
      p = cells[i]; r = p >> 6; c = p & 63;
      if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c;
      cnt[grid[r][c]]++; sr += r; sc += c;
    }
    this.r0 = r0; this.c0 = c0; this.r1 = r1; this.c1 = c1;
    this.h = r1 - r0 + 1; this.w = c1 - c0 + 1;
    this.cr2 = r0 + r1; this.cc2 = c0 + c1;          /* doubled bbox centre */
    this.mr = sr / cells.length; this.mc = sc / cells.length;
    var best = -1, bn = -1, colors = 0, minor = -1, mn = 1e9;
    for (v = 0; v < 10; v++) if (cnt[v]) {
      colors |= 1 << v;
      if (cnt[v] > bn) { bn = cnt[v]; best = v; }
      if (cnt[v] < mn) { mn = cnt[v]; minor = v; }
    }
    this.color = best;
    this.colors = colors;
    this.ncol = G.csSize(colors);
    this.minor = this.ncol > 1 ? minor : -1;
    this.counts = cnt;
    var patch = [], mask = [], row, mrow;
    for (r = 0; r < this.h; r++) {
      row = new Array(this.w); mrow = new Array(this.w);
      for (c = 0; c < this.w; c++) { row[c] = -1; mrow[c] = 0; }
      patch.push(row); mask.push(mrow);
    }
    for (i = 0; i < cells.length; i++) {
      p = cells[i]; r = (p >> 6) - r0; c = (p & 63) - c0;
      patch[r][c] = grid[p >> 6][p & 63]; mask[r][c] = 1;
    }
    this.patch = patch;
    this.mask = mask;
    this.shape = maskKey(mask);
    this.pkey = maskKey(patch);
    this.border = r0 === 0 || c0 === 0 || r1 === H - 1 || c1 === W - 1;
    this.rect = this.n === this.h * this.w;
    this.line = this.h === 1 || this.w === 1;
    this.square = this.h === this.w;
    this._d4 = null; this._d4p = null; this._holes = -1; this._sym = null;
    this._holeCells = null;
  }
  Ent.prototype.d4 = function () { if (this._d4 === null) this._d4 = d4Key(this.mask); return this._d4; };
  Ent.prototype.d4p = function () { if (this._d4p === null) this._d4p = d4Key(this.patch); return this._d4p; };
  /* enclosed background inside the entity's own bbox (4-connectivity) */
  Ent.prototype.holeCells = function () {
    if (this._holeCells !== null) return this._holeCells;
    var h = this.h, w = this.w, m = this.mask, seen = new Uint8Array(h * w), q = [], qi = 0, r, c, i, d;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++)
      if ((r === 0 || c === 0 || r === h - 1 || c === w - 1) && !m[r][c] && !seen[r * w + c]) { seen[r * w + c] = 1; q.push(r * w + c); }
    var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (qi < q.length) {
      var p = q[qi++], pr = (p / w) | 0, pc = p % w;
      for (d = 0; d < 4; d++) {
        var nr = pr + D[d][0], nc = pc + D[d][1];
        if (nr >= 0 && nr < h && nc >= 0 && nc < w && !m[nr][nc] && !seen[nr * w + nc]) { seen[nr * w + nc] = 1; q.push(nr * w + nc); }
      }
    }
    var out = [];
    for (i = 0; i < h * w; i++) if (!seen[i] && !m[(i / w) | 0][i % w]) out.push(((this.r0 + ((i / w) | 0)) << 6) | (this.c0 + i % w));
    this._holeCells = out;
    return out;
  };
  Ent.prototype.holes = function () {
    if (this._holes >= 0) return this._holes;
    var hc = this.holeCells(), set = new Set(hc), seen = new Set(), n = 0, i;
    for (i = 0; i < hc.length; i++) {
      if (seen.has(hc[i])) continue;
      n++;
      var st = [hc[i]]; seen.add(hc[i]);
      while (st.length) {
        var p = st.pop(), nb = [p - 64, p + 64, p - 1, p + 1], j;
        for (j = 0; j < 4; j++) if (set.has(nb[j]) && !seen.has(nb[j])) { seen.add(nb[j]); st.push(nb[j]); }
      }
    }
    this._holes = n;
    return n;
  };
  /* symmetry of the patch: lr, ud, rot180, transpose */
  Ent.prototype.sym = function () {
    if (this._sym) return this._sym;
    var k = this.pkey;
    this._sym = {
      lr: maskKey(G.flipH(this.patch)) === k,
      ud: maskKey(G.flipV(this.patch)) === k,
      r2: maskKey(G.rot180(this.patch)) === k,
      tr: this.square && maskKey(G.transpose(this.patch)) === k
    };
    return this._sym;
  };
  Ent.prototype.has = function (p) {
    var lo = 0, hi = this.cells.length - 1, cs = this.cells;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (cs[m] === p) return true; if (cs[m] < p) lo = m + 1; else hi = m - 1; }
    return false;
  };

  /* ------------------------------------------------------- segmentations */
  function bgRegions(g, bg, enclosedOnly) {
    var H = g.length, W = g[0].length, seen = new Uint8Array(H * W), out = [], r, c;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      if (seen[r * W + c] || g[r][c] !== bg) continue;
      var q = [r * 64 + c], qi = 0, edge = false;
      seen[r * W + c] = 1;
      while (qi < q.length) {
        var p = q[qi++], pr = p >> 6, pc = p & 63;
        if (pr === 0 || pc === 0 || pr === H - 1 || pc === W - 1) edge = true;
        if (pr > 0 && !seen[(pr - 1) * W + pc] && g[pr - 1][pc] === bg) { seen[(pr - 1) * W + pc] = 1; q.push(p - 64); }
        if (pr < H - 1 && !seen[(pr + 1) * W + pc] && g[pr + 1][pc] === bg) { seen[(pr + 1) * W + pc] = 1; q.push(p + 64); }
        if (pc > 0 && !seen[pr * W + pc - 1] && g[pr][pc - 1] === bg) { seen[pr * W + pc - 1] = 1; q.push(p - 1); }
        if (pc < W - 1 && !seen[pr * W + pc + 1] && g[pr][pc + 1] === bg) { seen[pr * W + pc + 1] = 1; q.push(p + 1); }
      }
      if (enclosedOnly && edge) continue;
      q.sort(function (a, b) { return a - b; });
      out.push(q);
    }
    return out;
  }

  function cellLists(g, seg, bg) {
    var i, objs, out = [];
    if (seg === "bgin") return bgRegions(g, bg, true);
    if (seg === "bg4") return bgRegions(g, bg, false);
    var mode = seg === "col" ? "color" : seg === "cell" ? "cells" : seg;
    if (seg === "cell" && g.length * g[0].length > 400) return null;
    try { objs = O.segment(g, mode, bg); } catch (e) { return null; }
    for (i = 0; i < objs.length; i++) {
      var arr = Array.from(objs[i].cells);
      arr.sort(function (a, b) { return a - b; });
      out.push(arr);
    }
    return out;
  }

  /* --------------------------------------------------------------- scenes */
  function Scene(g, seg, bg, lists) {
    var i;
    this.grid = g; this.seg = seg; this.bg = bg;
    this.H = g.length; this.W = g[0].length;
    this.hist = G.histogram(g);
    this.ents = [];
    for (i = 0; i < lists.length; i++) this.ents.push(new Ent(lists[i], g, bg, seg, i));
    /* reading order: top-left corner, then row-major */
    this.ents.sort(function (a, b) { return (a.r0 - b.r0) || (a.c0 - b.c0) || (a.cells[0] - b.cells[0]); });
    for (i = 0; i < this.ents.length; i++) this.ents[i].id = i;
    var n = this.ents.length;
    this._dist = new Int16Array(n * n).fill(-1);
    this._cache = {};
    this.owner = null;                       /* cell -> entity id, lazily */
  }
  Scene.prototype.memo = function (k, fn) {
    if (!(k in this._cache)) this._cache[k] = fn.call(this);
    return this._cache[k];
  };
  Scene.prototype.ownerMap = function () {
    if (this.owner) return this.owner;
    var m = new Int16Array(this.H * 64).fill(-1), i, j, e;
    for (i = 0; i < this.ents.length; i++) { e = this.ents[i]; for (j = 0; j < e.n; j++) m[e.cells[j]] = i; }
    this.owner = m;
    return m;
  };
  /* exact Chebyshev distance between cell sets (0 = overlap, 1 = touching) */
  Scene.prototype.dist = function (a, b) {
    if (a === b) return 0;
    var n = this.ents.length, k = a.id * n + b.id, v = this._dist[k];
    if (v >= 0) return v;
    var dr = Math.max(0, b.r0 - a.r1, a.r0 - b.r1), dc = Math.max(0, b.c0 - a.c1, a.c0 - b.c1);
    var lo = Math.max(dr, dc), best = 1000, i, j;
    if (a.n * b.n > 4000) best = lo;
    else {
      for (i = 0; i < a.n && best > lo; i++) {
        var ar = a.cells[i] >> 6, ac = a.cells[i] & 63;
        for (j = 0; j < b.n; j++) {
          var d = Math.max(Math.abs(ar - (b.cells[j] >> 6)), Math.abs(ac - (b.cells[j] & 63)));
          if (d < best) { best = d; if (best <= lo) break; }
        }
      }
    }
    this._dist[k] = best; this._dist[b.id * n + a.id] = best;
    return best;
  };
  Scene.prototype.touch = function (a, b) { return a !== b && this.dist(a, b) === 1; };
  /* bbox containment, strict */
  Scene.prototype.inside = function (a, b) {
    return a !== b && b.r0 <= a.r0 && b.c0 <= a.c0 && b.r1 >= a.r1 && b.c1 >= a.c1 &&
      (b.h > a.h || b.w > a.w);
  };
  Scene.prototype.rowOverlap = function (a, b) { return a.r0 <= b.r1 && b.r0 <= a.r1; };
  Scene.prototype.colOverlap = function (a, b) { return a.c0 <= b.c1 && b.c0 <= a.c1; };

  /* counts of equal keys across entities */
  Scene.prototype.countOf = function (key) {
    return this.memo("cnt:" + key, function () {
      var m = new Map(), i, k;
      for (i = 0; i < this.ents.length; i++) {
        k = attr(this.ents[i], key, this);
        m.set(k, (m.get(k) || 0) + 1);
      }
      return m;
    });
  };
  /* unique extreme of a numeric attribute: the entity id, or -1 */
  Scene.prototype.extreme = function (key, wantMax) {
    return this.memo("ext:" + key + ":" + (wantMax ? 1 : 0), function () {
      var best = null, id = -1, tie = false, i, v;
      for (i = 0; i < this.ents.length; i++) {
        v = attr(this.ents[i], key, this);
        if (best === null || (wantMax ? v > best : v < best)) { best = v; id = i; tie = false; }
        else if (v === best) tie = true;
      }
      return tie ? -1 : id;
    });
  };
  Scene.prototype.fgColors = function () {
    return this.memo("fg", function () {
      var out = [], v;
      for (v = 0; v < 10; v++) if (v !== this.bg && this.hist[v]) out.push(v);
      return out;
    });
  };
  /* most / least frequent non-background colour of the grid (unique only) */
  Scene.prototype.colorRank = function (most) {
    return this.memo("crank:" + (most ? 1 : 0), function () {
      var fg = this.fgColors(), best = -1, bv = null, tie = false, i;
      for (i = 0; i < fg.length; i++) {
        var n = this.hist[fg[i]];
        if (bv === null || (most ? n > bv : n < bv)) { bv = n; best = fg[i]; tie = false; }
        else if (n === bv) tie = true;
      }
      return tie ? -1 : best;
    });
  };

  /* attributes by name (selection predicates and expressions use these) */
  function attr(e, key, sc) {
    switch (key) {
      case "color": return e.color;
      case "n": return e.n;
      case "h": return e.h;
      case "w": return e.w;
      case "area": return e.h * e.w;
      case "shape": return e.shape;
      case "d4": return e.d4();
      case "pkey": return e.pkey;
      case "holes": return e.holes();
      case "ncol": return e.ncol;
      case "r0": return e.r0;
      case "c0": return e.c0;
      case "r1": return e.r1;
      case "c1": return e.c1;
      case "border": return e.border ? 1 : 0;
      case "rect": return e.rect ? 1 : 0;
      case "line": return e.line ? 1 : 0;
      case "square": return e.square ? 1 : 0;
      case "density": return e.n / (e.h * e.w);
      default: return null;
    }
  }

  /* ---------------------------------------------------------------- cache */
  var CACHE = new Map(), CACHE_CAP = 600;
  function reset() { CACHE.clear(); }
  function of(g, seg, bg) {
    if (bg === undefined || bg === null) bg = G.background(g);
    var key = G.ghash(g) + "#" + seg + "#" + bg, bucket = CACHE.get(key), j;
    if (bucket) for (j = 0; j < bucket.length; j++) if (G.gEq(bucket[j][0], g)) return bucket[j][1];
    var lists = cellLists(g, seg, bg), sc = null;
    if (lists && lists.length && lists.length <= MAX_ENTS) sc = new Scene(g, seg, bg, lists);
    if (CACHE.size > CACHE_CAP) CACHE.clear();
    bucket = CACHE.get(key);
    if (bucket) bucket.push([g, sc]); else CACHE.set(key, [[g, sc]]);
    return sc;
  }

  return { SEGS: SEGS, MAX_ENTS: MAX_ENTS, Ent: Ent, Scene: Scene, of: of, reset: reset, attr: attr,
           maskKey: maskKey, tf: tf, TF_INV: TF_INV, d4Key: d4Key, bgRegions: bgRegions };
})();
