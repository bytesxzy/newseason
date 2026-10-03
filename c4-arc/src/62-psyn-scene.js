/* ===== src/62-psyn-scene.js ===== */
/* Multi-representation perception for partial-program synthesis.
 *
 * A grid is not parsed once. Several parses are kept alive as competing representations (4/8-connected single-colour
 * components, 4/8-connected multicolour components, one object per colour), and each carries the same relational
 * structure: adjacency, enclosure, containment, alignment, nearest neighbour, shared panel (cells split by full
 * separator lines), and a set of semantic colour ROLES computed from the scene (largest object's colour, the lone
 * marker's colour, the separator colour, ...). Selectors and effect parameters may refer to roles instead of literal
 * colours, which is what lets one rule transfer across demonstrations whose literal colours differ.
 */

(function () {
  var P = PSYN;
  var PARSES = ["c4", "c8", "m4", "m8", "col"];       /* parses used for in-place rewriting; "pnl" is added for extraction */

  function modeColor(g) {
    var cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], r, c, best = 0;
    for (r = 0; r < g.length; r++) for (c = 0; c < g[0].length; c++) cnt[g[r][c]]++;
    for (c = 1; c < 10; c++) if (cnt[c] > cnt[best]) best = c;
    return best;
  }

  /* connected components over cells accepted by `inSet`; `sameColor` restricts to equal colours */
  function components(g, bg, diag, sameColor) {
    var H = g.length, W = g[0].length, seen = new Uint8Array(H * W), out = [], r, c, stack, cells, v, i, rr, cc, k, dr, dc, nr, nc;
    var D = diag ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      i = r * W + c;
      if (seen[i] || g[r][c] === bg) continue;
      stack = [i]; seen[i] = 1; cells = []; v = g[r][c];
      while (stack.length) {
        k = stack.pop(); cells.push(k); rr = (k / W) | 0; cc = k - rr * W;
        for (dr = 0; dr < D.length; dr++) {
          nr = rr + D[dr][0]; nc = cc + D[dr][1];
          if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
          dc = nr * W + nc;
          if (seen[dc] || g[nr][nc] === bg) continue;
          if (sameColor && g[nr][nc] !== v) continue;
          seen[dc] = 1; stack.push(dc);
        }
      }
      cells.sort(function (a, b) { return a - b; });
      out.push(cells);
    }
    return out;
  }
  function byColor(g, bg) {
    var H = g.length, W = g[0].length, lists = {}, r, c, v, out = [];
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) { v = g[r][c]; if (v === bg) continue; (lists[v] = lists[v] || []).push(r * W + c); }
    for (v = 0; v < 10; v++) if (lists[v]) out.push(lists[v]);
    return out;
  }

  var D4T = [
    function (r, c, h, w) { return [r, c]; },
    function (r, c, h, w) { return [c, h - 1 - r]; },
    function (r, c, h, w) { return [h - 1 - r, w - 1 - c]; },
    function (r, c, h, w) { return [w - 1 - c, r]; },
    function (r, c, h, w) { return [r, w - 1 - c]; },
    function (r, c, h, w) { return [c, r]; },
    function (r, c, h, w) { return [h - 1 - r, c]; },
    function (r, c, h, w) { return [w - 1 - c, h - 1 - r]; }
  ];

  function mkObj(sc, id, cells) {
    var g = sc.grid, W = sc.W, o = { id: id, cells: cells, size: cells.length }, i, r, c, r0 = 1e9, c0 = 1e9, r1 = -1, c1 = -1, cnt = {}, mask = 0, v, best = -1, bn = 0;
    for (i = 0; i < cells.length; i++) {
      r = (cells[i] / W) | 0; c = cells[i] - r * W;
      if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c;
      v = g[r][c]; cnt[v] = (cnt[v] || 0) + 1; mask |= 1 << v;
    }
    for (v in cnt) if (cnt[v] > bn || (cnt[v] === bn && +v < best)) { bn = cnt[v]; best = +v; }
    o.r0 = r0; o.c0 = c0; o.r1 = r1; o.c1 = c1; o.h = r1 - r0 + 1; o.w = c1 - c0 + 1;
    o.color = best; o.colorsMask = mask; o.mixed = (mask & (mask - 1)) !== 0;
    o.border = r0 === 0 || c0 === 0 || r1 === sc.H - 1 || c1 === sc.W - 1;
    o.isRect = o.size === o.h * o.w;
    o.cr2 = r0 + r1; o.cc2 = c0 + c1;       /* doubled centre, stays integral */
    /* what the bounding box shows: the number of non-background cells and the colour pattern itself */
    var nbg = 0, rows = [], rr0, cc0;
    for (rr0 = r0; rr0 <= r1; rr0++) { rows.push(g[rr0].slice(c0, c1 + 1).join("")); for (cc0 = c0; cc0 <= c1; cc0++) if (g[rr0][cc0] !== sc.bg) nbg++; }
    o.nbg = nbg; o.contentKey = rows.join("/");
    /* shape keys: translation-normalised mask, and the minimum over the eight symmetries */
    var rel = cells.map(function (k) { var rr = (k / W) | 0; return [rr - r0, k - rr * W - c0]; });
    function keyOf(pts) { var a = pts.slice().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; }); return a.map(function (p) { return p[0] + "." + p[1]; }).join(";"); }
    o.shapeKey = o.h + "x" + o.w + ":" + keyOf(rel);
    var best4 = null, t, k4;
    for (t = 0; t < 8; t++) {
      var pts = rel.map(function (p) { return D4T[t](p[0], p[1], o.h, o.w); }), mr = 1e9, mc = 1e9;
      pts.forEach(function (p) { if (p[0] < mr) mr = p[0]; if (p[1] < mc) mc = p[1]; });
      k4 = keyOf(pts.map(function (p) { return [p[0] - mr, p[1] - mc]; }));
      if (best4 === null || k4 < best4) best4 = k4;
    }
    o.d4Key = best4;
    /* enclosed background inside the bounding box (4-connected flood from the box edge) */
    var seen = new Uint8Array(o.h * o.w), stack = [], inObj = new Uint8Array(o.h * o.w), j, rr2, cc2;
    for (i = 0; i < rel.length; i++) inObj[rel[i][0] * o.w + rel[i][1]] = 1;
    for (i = 0; i < o.h; i++) for (j = 0; j < o.w; j++) if ((i === 0 || j === 0 || i === o.h - 1 || j === o.w - 1) && !inObj[i * o.w + j]) { seen[i * o.w + j] = 1; stack.push(i * o.w + j); }
    while (stack.length) {
      var k = stack.pop(); rr2 = (k / o.w) | 0; cc2 = k - rr2 * o.w;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nr = rr2 + d[0], nc = cc2 + d[1];
        if (nr < 0 || nc < 0 || nr >= o.h || nc >= o.w) return;
        var nk = nr * o.w + nc;
        if (seen[nk] || inObj[nk]) return;
        seen[nk] = 1; stack.push(nk);
      });
    }
    o.encl = [];
    for (i = 0; i < o.h; i++) for (j = 0; j < o.w; j++) if (!seen[i * o.w + j] && !inObj[i * o.w + j]) o.encl.push((r0 + i) * W + (c0 + j));
    o.holes = o.encl.length;
    return o;
  }

  /* full-length separator lines and the panels they cut the grid into */
  function findPanels(sc) {
    var g = sc.grid, H = sc.H, W = sc.W, rowsL = [], colsL = [], r, c, v, ok;
    for (r = 0; r < H; r++) { v = g[r][0]; ok = v !== sc.bg; for (c = 1; c < W && ok; c++) if (g[r][c] !== v) ok = false; if (ok) rowsL.push([r, v]); }
    for (c = 0; c < W; c++) { v = g[0][c]; ok = v !== sc.bg; for (r = 1; r < H && ok; r++) if (g[r][c] !== v) ok = false; if (ok) colsL.push([c, v]); }
    if (!rowsL.length && !colsL.length) return null;
    /* a grid that is one solid colour has no separators; lines must leave room for at least two panels */
    var rowCut = {}, colCut = {};
    rowsL.forEach(function (x) { rowCut[x[0]] = x[1]; }); colsL.forEach(function (x) { colCut[x[0]] = x[1]; });
    var rb = [], cb = [], cur = 0;
    for (r = 0; r < H; r++) { if (rowCut[r] !== undefined) { cur++; rb.push(-1); } else rb.push(cur); }
    cur = 0;
    for (c = 0; c < W; c++) { if (colCut[c] !== undefined) { cur++; cb.push(-1); } else cb.push(cur); }
    var nR = 0, nC = 0;
    rb.forEach(function (x) { if (x + 1 > nR) nR = x + 1; }); cb.forEach(function (x) { if (x + 1 > nC) nC = x + 1; });
    if (nR * nC < 2) return null;
    var at = new Int16Array(H * W), sepColor = rowsL.length ? rowsL[0][1] : colsL[0][1];
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) at[r * W + c] = (rb[r] < 0 || cb[c] < 0) ? -1 : rb[r] * nC + cb[c];
    return { at: at, nR: nR, nC: nC, n: nR * nC, sepColor: sepColor, rowLines: rowsL.map(function (x) { return x[0]; }), colLines: colsL.map(function (x) { return x[0]; }) };
  }

  /* panels as objects: every cell of each region between separator lines, background included */
  function panelLists(sc) {
    var pn = findPanels(sc), lists = [], i, k;
    if (!pn) return [];
    for (i = 0; i < pn.n; i++) lists.push([]);
    for (k = 0; k < pn.at.length; k++) if (pn.at[k] >= 0) lists[pn.at[k]].push(k);
    return lists.filter(function (l) { return l.length; });
  }

  function Scene(g, parseId, bgMode) {
    this.grid = g; this.H = g.length; this.W = g[0].length; this.parse = parseId;
    this.bg = bgMode === "zero" ? 0 : modeColor(g);
    var lists;
    switch (parseId) {
      case "pnl": lists = panelLists(this); break;
      case "c4": lists = components(g, this.bg, false, true); break;
      case "c8": lists = components(g, this.bg, true, true); break;
      case "m4": lists = components(g, this.bg, false, false); break;
      case "m8": lists = components(g, this.bg, true, false); break;
      default: lists = byColor(g, this.bg);
    }
    this.objs = []; this.at = new Int16Array(this.H * this.W).fill(-1);
    var i, j;
    this.tooMany = lists.length > 70;
    if (this.tooMany) lists = lists.slice(0, 70);
    for (i = 0; i < lists.length; i++) {
      var o = mkObj(this, i, lists[i]);
      this.objs.push(o);
      for (j = 0; j < lists[i].length; j++) this.at[lists[i][j]] = i;
    }
    this.n = this.objs.length;
    this._rel = null; this._panels = undefined; this._roles = null; this._freq = null;
  }
  Scene.prototype.panels = function () { if (this._panels === undefined) this._panels = findPanels(this); return this._panels; };
  Scene.prototype.panelOf = function (o) {
    var p = this.panels();
    if (!p) return -1;
    var k = o.cells[0], v = p.at[k], i;
    if (v >= 0) return v;
    for (i = 1; i < o.cells.length; i++) { v = p.at[o.cells[i]]; if (v >= 0) return v; }
    return -1;
  };
  /* separator objects (lines spanning a whole row/column) are structure, not content */
  Scene.prototype.isSeparator = function (o) {
    var p = this.panels();
    if (!p) return false;
    return (o.h === 1 && o.w === this.W) || (o.w === 1 && o.h === this.H) || (o.w === this.W && o.h === 1) || (p.rowLines.length + p.colLines.length > 0 && o.color === p.sepColor && (o.h === this.H || o.w === this.W));
  };
  Scene.prototype.freq = function () {
    if (this._freq) return this._freq;
    var f = { color: {}, shape: {}, d4: {}, size: {}, cells: {}, content: {} }, i, o;
    for (i = 0; i < this.n; i++) {
      o = this.objs[i];
      f.color[o.color] = (f.color[o.color] || 0) + 1; f.shape[o.shapeKey] = (f.shape[o.shapeKey] || 0) + 1;
      f.d4[o.d4Key] = (f.d4[o.d4Key] || 0) + 1; f.size[o.size] = (f.size[o.size] || 0) + 1;
      f.cells[o.color] = (f.cells[o.color] || 0) + o.size;
      f.content[o.contentKey] = (f.content[o.contentKey] || 0) + 1;
    }
    this._freq = f;
    return f;
  };
  /* adjacency (4-neighbour touching) and the other pairwise relations, computed once per scene */
  Scene.prototype.rel = function () {
    if (this._rel) return this._rel;
    var n = this.n, H = this.H, W = this.W, at = this.at, adj = [], i, j, r, c, k, a, b, o;
    for (i = 0; i < n; i++) adj.push({});
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      a = at[r * W + c]; if (a < 0) continue;
      if (c + 1 < W) { b = at[r * W + c + 1]; if (b >= 0 && b !== a) { adj[a][b] = 1; adj[b][a] = 1; } }
      if (r + 1 < H) { b = at[(r + 1) * W + c]; if (b >= 0 && b !== a) { adj[a][b] = 1; adj[b][a] = 1; } }
    }
    /* enclosure: object j lies inside the enclosed background of object i */
    var encl = [], inside = [];
    for (i = 0; i < n; i++) { encl.push(new Set(this.objs[i].encl)); inside.push({}); }
    var enclosedBy = [];
    for (j = 0; j < n; j++) {
      enclosedBy.push(-1);
      o = this.objs[j];
      for (i = 0; i < n; i++) {
        if (i === j || !encl[i].size) continue;
        var all = true;
        for (k = 0; k < o.cells.length; k++) if (!encl[i].has(o.cells[k])) { all = false; break; }
        if (all) { if (enclosedBy[j] < 0 || this.objs[i].size < this.objs[enclosedBy[j]].size) enclosedBy[j] = i; inside[i][j] = 1; }
      }
    }
    /* chebyshev distance between bounding boxes and the nearest other object */
    var dist = [], nearest = [], d;
    for (i = 0; i < n; i++) {
      dist.push(new Int16Array(n)); nearest.push(-1);
    }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var A = this.objs[i], B = this.objs[j];
      var dr = Math.max(0, A.r0 - B.r1, B.r0 - A.r1), dc = Math.max(0, A.c0 - B.c1, B.c0 - A.c1);
      d = Math.max(dr, dc); dist[i][j] = d; dist[j][i] = d;
    }
    for (i = 0; i < n; i++) {
      var bd = 1e9, bj = -1, tie = false;
      for (j = 0; j < n; j++) if (j !== i) { if (dist[i][j] < bd) { bd = dist[i][j]; bj = j; tie = false; } else if (dist[i][j] === bd) tie = true; }
      nearest[i] = tie ? -1 : bj;
    }
    this._rel = { adj: adj, enclosedBy: enclosedBy, inside: inside, dist: dist, nearest: nearest };
    return this._rel;
  };
  Scene.prototype.rowAligned = function (a, b) { var A = this.objs[a], B = this.objs[b]; return A.r0 <= B.r1 && B.r0 <= A.r1; };
  Scene.prototype.colAligned = function (a, b) { var A = this.objs[a], B = this.objs[b]; return A.c0 <= B.c1 && B.c0 <= A.c1; };

  /* Semantic colour roles. Each maps to a colour, or -1 when the scene does not define it unambiguously. */
  var ROLE_NAMES = ["bg", "largestObj", "smallestObj", "mostObjs", "fewestObjs", "mostCells", "fewestCells", "marker", "separator", "frame", "tallest", "widest", "topmost", "bottommost", "leftmost", "rightmost"];
  Scene.prototype.roles = function () {
    if (this._roles) return this._roles;
    var R = {}, i, o, f = this.freq(), self = this;
    R.bg = this.bg;
    function uniqueBest(key, wantMax) {
      var best = null, tie = false;
      for (var k = 0; k < self.n; k++) {
        var v = key(self.objs[k]);
        if (best === null || (wantMax ? v > best.v : v < best.v)) { best = { v: v, c: self.objs[k].color }; tie = false; }
        else if (v === best.v) tie = true;
      }
      return best && !tie ? best.c : -1;
    }
    function uniqueColorBy(map, wantMax) {
      var best = null, tie = false, c;
      for (c in map) {
        if (best === null || (wantMax ? map[c] > best.v : map[c] < best.v)) { best = { v: map[c], c: +c }; tie = false; }
        else if (map[c] === best.v) tie = true;
      }
      return best && !tie ? best.c : -1;
    }
    R.largestObj = uniqueBest(function (o) { return o.size; }, true);
    R.smallestObj = uniqueBest(function (o) { return o.size; }, false);
    R.tallest = uniqueBest(function (o) { return o.h; }, true);
    R.widest = uniqueBest(function (o) { return o.w; }, true);
    R.topmost = uniqueBest(function (o) { return o.r0; }, false);
    R.bottommost = uniqueBest(function (o) { return o.r1; }, true);
    R.leftmost = uniqueBest(function (o) { return o.c0; }, false);
    R.rightmost = uniqueBest(function (o) { return o.c1; }, true);
    R.mostObjs = uniqueColorBy(f.color, true);
    R.fewestObjs = Object.keys(f.color).length > 1 ? uniqueColorBy(f.color, false) : -1;
    R.mostCells = uniqueColorBy(f.cells, true);
    R.fewestCells = Object.keys(f.cells).length > 1 ? uniqueColorBy(f.cells, false) : -1;
    /* the lone marker: exactly one colour is carried only by single-cell objects, and by exactly one object */
    var singles = {}, multi = {}, c;
    for (i = 0; i < this.n; i++) { o = this.objs[i]; if (o.size === 1) singles[o.color] = (singles[o.color] || 0) + 1; else multi[o.color] = 1; }
    var cands = [];
    for (c in singles) if (!multi[c] && singles[c] === 1) cands.push(+c);
    R.marker = cands.length === 1 ? cands[0] : -1;
    var pn = this.panels();
    R.separator = pn ? pn.sepColor : -1;
    var frames = [];
    for (i = 0; i < this.n; i++) { o = this.objs[i]; if (o.holes > 0 && o.size >= 8) frames.push(o); }
    frames.sort(function (a, b) { return b.size - a.size; });
    R.frame = frames.length && (frames.length === 1 || frames[0].size > frames[1].size) ? frames[0].color : -1;
    this._roles = R;
    return R;
  };

  var cache = new Map();
  function parse(g, parseId, bgMode) {
    var key = parseId + "|" + (bgMode || "mode");
    var perGrid = g.__sc;
    if (!perGrid) { perGrid = {}; try { Object.defineProperty(g, "__sc", { value: perGrid, enumerable: false, writable: true }); } catch (e) { g.__sc = perGrid; } }
    if (!perGrid[key]) perGrid[key] = new Scene(g, parseId, bgMode);
    return perGrid[key];
  }

  P.PARSES = PARSES; P.parse = parse; P.Scene = Scene; P.ROLE_NAMES = ROLE_NAMES; P.modeColor = modeColor; P.D4T = D4T;
})();
