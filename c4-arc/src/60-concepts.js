/* ===== src/60-concepts.js ===== */
/* General concept machines, each a small parameter space searched exactly.
 *
 * None of them names a task. A machine exposes a few discrete choices (which
 * cells are sources, which directions, what stops a line, which colour), the
 * choices are enumerated, and a hypothesis survives only if it reproduces every
 * demonstration cell for cell (the portfolio checks that again). What makes a
 * machine general is that its parameters are read from the demonstrations, not
 * from a file name or a coordinate.
 *
 * Machines live in one module so the portfolio gives them a single short
 * slice; each one rejects cheaply (shape, paint-only, changed-cell counts)
 * before it enumerates anything.
 */
(function () {
  var _h = mkHyp("concepts");
  var GENS = [];
  var D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var D8 = D4.concat(DD);

  function inb(g, r, c) { return r >= 0 && c >= 0 && r < g.length && c < g[0].length; }
  function copy(g) { return G.copyGrid(g); }
  function sgn(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
  function same(a, b) { return G.gEq(a, b); }

  /* every pair keeps its shape and only ever paints over background cells */
  function paintOnly(ctx) {
    if (!ctx.same_shape()) return false;
    var bg = ctx.bg(), t, r, c, a, b, changed = 0;
    for (t = 0; t < ctx.train.length; t++) {
      a = ctx.train[t][0]; b = ctx.train[t][1];
      for (r = 0; r < a.length; r++) for (c = 0; c < a[0].length; c++)
        if (a[r][c] !== b[r][c]) { changed++; if (a[r][c] !== bg) return false; }
    }
    return changed > 0;
  }

  /* how many cells the demonstrations changed: few changes make any fit weak evidence */
  function changedCells(ctx) {
    var n = 0, t, r, c, a, b;
    for (t = 0; t < ctx.train.length; t++) {
      a = ctx.train[t][0]; b = ctx.train[t][1];
      if (a.length !== b.length || a[0].length !== b[0].length) return 1e9;
      for (r = 0; r < a.length; r++) for (c = 0; c < a[0].length; c++) if (a[r][c] !== b[r][c]) n++;
    }
    return n;
  }

  /* 8-connected multicolour components of non-background cells */
  function comps8(g, bg) {
    var h = g.length, w = g[0].length, id = [], out = [], r, c, k, st, cur, d, nr, nc;
    for (r = 0; r < h; r++) { id.push(new Array(w)); for (c = 0; c < w; c++) id[r][c] = -1; }
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (g[r][c] === bg || id[r][c] >= 0) continue;
      k = out.length; st = [[r, c]]; id[r][c] = k; cur = [];
      while (st.length) {
        var p = st.pop(); cur.push(p);
        for (d = 0; d < 8; d++) {
          nr = p[0] + D8[d][0]; nc = p[1] + D8[d][1];
          if (inb(g, nr, nc) && g[nr][nc] !== bg && id[nr][nc] < 0) { id[nr][nc] = k; st.push([nr, nc]); }
        }
      }
      out.push(cur);
    }
    return { list: out, id: id };
  }

  /* ---------------------------------------------------------------- rays */

  /* source selectors: each returns [{r, c, v, cr, cc}] where (cr, cc) is the
     centroid of the multicolour component the source belongs to */
  var RAY_SOURCES = [];
  (function () {
    function withComp(g, bg, pick) {
      var C = comps8(g, bg), out = [], i, j, cells, sr, sc, cr, cc, p;
      for (i = 0; i < C.list.length; i++) {
        cells = C.list[i]; sr = 0; sc = 0;
        for (j = 0; j < cells.length; j++) { sr += cells[j][0]; sc += cells[j][1]; }
        cr = sr / cells.length; cc = sc / cells.length;
        var got = pick(cells, g);
        for (j = 0; j < got.length; j++) { p = got[j]; out.push({ r: p[0], c: p[1], v: g[p[0]][p[1]], cr: cr, cc: cc, n: cells.length }); }
      }
      return out;
    }
    RAY_SOURCES.push(["all", function (g, bg) { return withComp(g, bg, function (cells) { return cells; }); }]);
    RAY_SOURCES.push(["single", function (g, bg) {
      return withComp(g, bg, function (cells) { return cells.length === 1 ? cells : []; });
    }]);
    RAY_SOURCES.push(["odd", function (g, bg) {
      return withComp(g, bg, function (cells, gg) {
        var cnt = {}, j, v, best = -1, bn = -1;
        for (j = 0; j < cells.length; j++) { v = gg[cells[j][0]][cells[j][1]]; cnt[v] = (cnt[v] || 0) + 1; }
        var keys = Object.keys(cnt);
        if (keys.length < 2) return [];
        for (j = 0; j < keys.length; j++) if (cnt[keys[j]] > bn) { bn = cnt[keys[j]]; best = +keys[j]; }
        var out = [];
        for (j = 0; j < cells.length; j++) if (gg[cells[j][0]][cells[j][1]] !== best && cnt[gg[cells[j][0]][cells[j][1]]] <= bn) out.push(cells[j]);
        return out;
      });
    }]);
    RAY_SOURCES.push(["rare", function (g, bg) {
      /* the cells of the least frequent non-background colour */
      var h = G.histogram(g), v, best = -1, bn = 1e9;
      for (v = 0; v < 10; v++) if (v !== bg && h[v] > 0 && h[v] < bn) { bn = h[v]; best = v; }
      if (best < 0) return [];
      return withComp(g, bg, function (cells, gg) {
        var o = [], j; for (j = 0; j < cells.length; j++) if (gg[cells[j][0]][cells[j][1]] === best) o.push(cells[j]); return o;
      });
    }]);
    RAY_SOURCES.push(["common", function (g, bg) {
      var h = G.histogram(g), v, best = -1, bn = 0;
      for (v = 0; v < 10; v++) if (v !== bg && h[v] > bn) { bn = h[v]; best = v; }
      if (best < 0) return [];
      return withComp(g, bg, function (cells, gg) {
        var o = [], j; for (j = 0; j < cells.length; j++) if (gg[cells[j][0]][cells[j][1]] === best) o.push(cells[j]); return o;
      });
    }]);
    RAY_SOURCES.push(["corner", function (g, bg) {
      var C = comps8(g, bg), out = [], i, j, cells, r0, c0, r1, c1, sr, sc;
      for (i = 0; i < C.list.length; i++) {
        cells = C.list[i]; if (cells.length < 2) continue;
        r0 = 99; c0 = 99; r1 = -1; c1 = -1; sr = 0; sc = 0;
        for (j = 0; j < cells.length; j++) {
          r0 = Math.min(r0, cells[j][0]); r1 = Math.max(r1, cells[j][0]); c0 = Math.min(c0, cells[j][1]); c1 = Math.max(c1, cells[j][1]);
          sr += cells[j][0]; sc += cells[j][1];
        }
        var cr = sr / cells.length, cc = sc / cells.length, cs = [[r0 - 1, c0 - 1], [r0 - 1, c1 + 1], [r1 + 1, c0 - 1], [r1 + 1, c1 + 1]];
        for (j = 0; j < 4; j++) if (inb(g, cs[j][0], cs[j][1]) && g[cs[j][0]][cs[j][1]] === bg)
          out.push({ r: cs[j][0], c: cs[j][1], v: g[cells[0][0]][cells[0][1]], cr: (r0 + r1) / 2, cc: (c0 + c1) / 2, n: cells.length });
      }
      return out;
    }]);
    RAY_SOURCES.push(["boxcentre", function (g, bg) {
      var C = comps8(g, bg), out = [], i, j, cells, r0, c0, r1, c1;
      for (i = 0; i < C.list.length; i++) {
        cells = C.list[i]; if (cells.length < 2) continue;
        r0 = 99; c0 = 99; r1 = -1; c1 = -1;
        for (j = 0; j < cells.length; j++) { r0 = Math.min(r0, cells[j][0]); r1 = Math.max(r1, cells[j][0]); c0 = Math.min(c0, cells[j][1]); c1 = Math.max(c1, cells[j][1]); }
        if ((r0 + r1) % 2 || (c0 + c1) % 2) continue;
        var rr = (r0 + r1) / 2, ccx = (c0 + c1) / 2;
        out.push({ r: rr, c: ccx, v: g[rr][ccx], cr: rr, cc: ccx, n: cells.length });
      }
      return out;
    }]);
    var c;
    for (c = 1; c < 10; c++) (function (col) {
      RAY_SOURCES.push(["color" + col, function (g, bg) {
        return withComp(g, bg, function (cells, gg) {
          var o = [], j; for (j = 0; j < cells.length; j++) if (gg[cells[j][0]][cells[j][1]] === col) o.push(cells[j]); return o;
        });
      }]);
    })(c);
  })();

  /* direction rules: return the list of [dr, dc] a source shoots along */
  var RAY_DIRS = [];
  (function () {
    var sets = [["v", [[-1, 0], [1, 0]]], ["h", [[0, -1], [0, 1]]], ["4", D4], ["x", DD], ["8", D8]];
    var i;
    for (i = 0; i < 8; i++) sets.push(["d" + i, [D8[i]]]);
    sets.push(["up+down+h", [[-1, 0], [1, 0], [0, -1], [0, 1]]]);
    sets.forEach(function (s) { RAY_DIRS.push([s[0], function () { return s[1]; }]); });
    function snap(dr, dc) {
      var ar = Math.abs(dr), ac = Math.abs(dc);
      if (ar === 0 && ac === 0) return null;
      if (ar >= 2 * ac) return [sgn(dr), 0];
      if (ac >= 2 * ar) return [0, sgn(dc)];
      return [sgn(dr), sgn(dc)];
    }
    RAY_DIRS.push(["away", function (s) { var d = snap(s.r - s.cr, s.c - s.cc); return d ? [d] : []; }]);
    RAY_DIRS.push(["toward", function (s) { var d = snap(s.cr - s.r, s.cc - s.c); return d ? [d] : []; }]);
  })();

  function shoot(g, bg, srcs, dirFn, stop, colorMode, fixedColor) {
    var out = copy(g), i, j, s, ds, d, r, c, col, cell;
    for (i = 0; i < srcs.length; i++) {
      s = srcs[i]; ds = dirFn(s);
      col = colorMode === "src" ? s.v : fixedColor;
      for (j = 0; j < ds.length; j++) {
        d = ds[j]; r = s.r + d[0]; c = s.c + d[1];
        while (inb(g, r, c)) {
          cell = g[r][c];
          if (cell !== bg) { if (stop === "block") break; if (stop === "over") { out[r][c] = col; } }
          else out[r][c] = col;
          r += d[0]; c += d[1];
        }
      }
    }
    return out;
  }

  GENS.push(function raysGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), out = [], si, di, st, ci, t, ok, cols = [], v;
    var stops = ["pass", "block", "over"];
    /* the colours painted by the demonstrations */
    var seen = 0;
    for (t = 0; t < ctx.train.length; t++) {
      var a = ctx.train[t][0], b = ctx.train[t][1], r, c;
      for (r = 0; r < a.length; r++) for (c = 0; c < a[0].length; c++) if (a[r][c] !== b[r][c]) seen |= 1 << b[r][c];
    }
    cols = G.csList(seen);
    if (cols.length > 3) cols = [];   /* many colours: only the mark's own colour makes sense */
    var cacheSrc = [];
    for (si = 0; si < RAY_SOURCES.length; si++) {
      var perTrain = [], any = false;
      for (t = 0; t < ctx.train.length; t++) {
        var s = RAY_SOURCES[si][1](ctx.train[t][0], bg);
        perTrain.push(s); if (s.length) any = true;
      }
      if (!any) continue;
      cacheSrc.push([si, perTrain]);
    }
    for (var k = 0; k < cacheSrc.length; k++) {
      si = cacheSrc[k][0];
      var srcTrain = cacheSrc[k][1];
      for (di = 0; di < RAY_DIRS.length; di++) for (st = 0; st < stops.length; st++) {
        var modes = [["src", 0]];
        for (ci = 0; ci < cols.length; ci++) modes.push(["fix", cols[ci]]);
        for (ci = 0; ci < modes.length; ci++) {
          ok = true;
          for (t = 0; t < ctx.train.length; t++) {
            var p = shoot(ctx.train[t][0], bg, srcTrain[t], RAY_DIRS[di][1], stops[st], modes[ci][0], modes[ci][1]);
            if (!same(p, ctx.train[t][1])) { ok = false; break; }
          }
          if (ok) out.push(_h("rays_" + RAY_SOURCES[si][0] + "_" + RAY_DIRS[di][0] + "_" + stops[st] + "_" + modes[ci][0] + modes[ci][1],
            (function (sf, df, sp, cm, fc) {
              return function (g) { var bb = bg; return shoot(g, bb, sf(g, bb), df, sp, cm, fc); };
            })(RAY_SOURCES[si][1], RAY_DIRS[di][1], stops[st], modes[ci][0], modes[ci][1]), 3.0 + (di > 12 ? 1 : 0) + (changedCells(ctx) < 3 * ctx.train.length ? 2 : 0)));
        }
      }
      if (ctx.timed_out()) break;
    }
    return out;
  });

  /* ------------------------------------------------------------- objects */

  function objsOf(g, bg, mode) {
    var key = "__oc" + mode + bg, hit = g[key];
    if (hit) return hit;
    var diag = mode.charAt(1) === "8", sameC = mode.charAt(0) === "c", nb = diag ? D8 : D4;
    var h = g.length, w = g[0].length, seen = new Uint8Array(h * w), out = [], r, c, d, nr, nc, p, cells, col, cnt, v, i;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (seen[r * w + c] || g[r][c] === bg) continue;
      col = g[r][c]; cells = []; cnt = {};
      var st = [[r, c]]; seen[r * w + c] = 1;
      while (st.length) {
        p = st.pop(); cells.push(p); v = g[p[0]][p[1]]; cnt[v] = (cnt[v] || 0) + 1;
        for (d = 0; d < nb.length; d++) {
          nr = p[0] + nb[d][0]; nc = p[1] + nb[d][1];
          if (nr < 0 || nc < 0 || nr >= h || nc >= w || seen[nr * w + nc]) continue;
          if (g[nr][nc] === bg) continue;
          if (sameC && g[nr][nc] !== col) continue;
          seen[nr * w + nc] = 1; st.push([nr, nc]);
        }
      }
      var r0 = 99, c0 = 99, r1 = -1, c1 = -1, best = -1, bn = -1, nk = 0;
      for (i = 0; i < cells.length; i++) {
        if (cells[i][0] < r0) r0 = cells[i][0]; if (cells[i][0] > r1) r1 = cells[i][0];
        if (cells[i][1] < c0) c0 = cells[i][1]; if (cells[i][1] > c1) c1 = cells[i][1];
      }
      for (v in cnt) { nk++; if (cnt[v] > bn || (cnt[v] === bn && +v < best)) { bn = cnt[v]; best = +v; } }
      cells.sort(function (a, b) { return (a[0] - b[0]) || (a[1] - b[1]); });
      out.push({ cells: cells, n: cells.length, r0: r0, c0: c0, r1: r1, c1: c1, color: best, multi: nk > 1, id: out.length,
        _shape: null, _holes: null });
    }
    g[key] = out;
    return out;
  }
  function shapeKey(o) {
    if (o._shape === null) {
      var s = [], i;
      for (i = 0; i < o.cells.length; i++) s.push((o.cells[i][0] - o.r0) + "." + (o.cells[i][1] - o.c0));
      o._shape = s.join(",");
    }
    return o._shape;
  }
  /* background cells inside the object's bounding box that cannot reach the box
     edge through background cells of the grid */
  function holeCells(o, g, bg) {
    if (o._holes !== null) return o._holes;
    var h = o.r1 - o.r0 + 1, w = o.c1 - o.c0 + 1, occ = [], r, c, i, d, nr, nc;
    for (r = 0; r < h; r++) { occ.push(new Uint8Array(w)); }
    for (i = 0; i < o.cells.length; i++) occ[o.cells[i][0] - o.r0][o.cells[i][1] - o.c0] = 1;
    var reach = [], st = [];
    for (r = 0; r < h; r++) reach.push(new Uint8Array(w));
    for (r = 0; r < h; r++) for (c = 0; c < w; c++)
      if ((r === 0 || c === 0 || r === h - 1 || c === w - 1) && !occ[r][c]) { reach[r][c] = 1; st.push([r, c]); }
    while (st.length) {
      var p = st.pop();
      for (d = 0; d < 4; d++) {
        nr = p[0] + D4[d][0]; nc = p[1] + D4[d][1];
        if (nr >= 0 && nc >= 0 && nr < h && nc < w && !occ[nr][nc] && !reach[nr][nc]) { reach[nr][nc] = 1; st.push([nr, nc]); }
      }
    }
    var out = [];
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) if (!occ[r][c] && !reach[r][c]) out.push([r + o.r0, c + o.c0]);
    o._holes = out;
    return out;
  }
  function touchesBorder(o, g) { return o.r0 === 0 || o.c0 === 0 || o.r1 === g.length - 1 || o.c1 === g[0].length - 1; }

  /* ------------------------------------------------------------ selectors */
  function countBy(objs, f) { var m = {}, i, k; for (i = 0; i < objs.length; i++) { k = f(objs[i]); m[k] = (m[k] || 0) + 1; } return m; }
  var SELECTORS = [];
  (function () {
    function S(name, f) { SELECTORS.push([name, f]); }
    S("all", function (os) { return os.map(function () { return true; }); });
    var k;
    for (k = 0; k < 10; k++) (function (col) { S("color" + col, function (os) { return os.map(function (o) { return o.color === col; }); }); })(k);
    function ext(name, key, wantMax) {
      S(name, function (os) {
        if (!os.length) return [];
        var t = key(os[0]), i;
        for (i = 1; i < os.length; i++) { var v = key(os[i]); if (wantMax ? v > t : v < t) t = v; }
        return os.map(function (o) { return key(o) === t; });
      });
    }
    ext("largest", function (o) { return o.n; }, true); ext("smallest", function (o) { return o.n; }, false);
    ext("tallest", function (o) { return o.r1 - o.r0; }, true); ext("widest", function (o) { return o.c1 - o.c0; }, true);
    ext("topmost", function (o) { return o.r0; }, false); ext("bottommost", function (o) { return o.r1; }, true);
    ext("leftmost", function (o) { return o.c0; }, false); ext("rightmost", function (o) { return o.c1; }, true);
    ext("bigbox", function (o) { return (o.r1 - o.r0 + 1) * (o.c1 - o.c0 + 1); }, true);
    ext("smallbox", function (o) { return (o.r1 - o.r0 + 1) * (o.c1 - o.c0 + 1); }, false);
    S("border", function (os, g) { return os.map(function (o) { return touchesBorder(o, g); }); });
    S("hashole", function (os, g, bg) { return os.map(function (o) { return holeCells(o, g, bg).length > 0; }); });
    S("rect", function (os) { return os.map(function (o) { return o.n === (o.r1 - o.r0 + 1) * (o.c1 - o.c0 + 1); }); });
    S("single", function (os) { return os.map(function (o) { return o.n === 1; }); });
    S("small2", function (os) { return os.map(function (o) { return o.n <= 2; }); });
    S("small4", function (os) { return os.map(function (o) { return o.n <= 4; }); });
    S("multi", function (os) { return os.map(function (o) { return o.multi; }); });
    S("shape_unique", function (os) { var m = countBy(os, shapeKey); return os.map(function (o) { return m[shapeKey(o)] === 1; }); });
    S("shape_dup", function (os) { var m = countBy(os, shapeKey); return os.map(function (o) { return m[shapeKey(o)] > 1; }); });
    S("color_unique", function (os) { var m = countBy(os, function (o) { return o.color; }); return os.map(function (o) { return m[o.color] === 1; }); });
    S("color_dup", function (os) { var m = countBy(os, function (o) { return o.color; }); return os.map(function (o) { return m[o.color] > 1; }); });
    S("size_unique", function (os) { var m = countBy(os, function (o) { return o.n; }); return os.map(function (o) { return m[o.n] === 1; }); });
    S("size_dup", function (os) { var m = countBy(os, function (o) { return o.n; }); return os.map(function (o) { return m[o.n] > 1; }); });
    S("symh", function (os) { return os.map(function (o) { return symOf(o, "h"); }); });
    S("symv", function (os) { return os.map(function (o) { return symOf(o, "v"); }); });
    S("inside", function (os) {
      return os.map(function (o) { var j; for (j = 0; j < os.length; j++) { var q = os[j]; if (q !== o && q.r0 < o.r0 && q.c0 < o.c0 && q.r1 > o.r1 && q.c1 > o.c1) return true; } return false; });
    });
    S("contains", function (os) {
      return os.map(function (o) { var j; for (j = 0; j < os.length; j++) { var q = os[j]; if (q !== o && o.r0 < q.r0 && o.c0 < q.c0 && o.r1 > q.r1 && o.c1 > q.c1) return true; } return false; });
    });
    S("evensize", function (os) { return os.map(function (o) { return o.n % 2 === 0; }); });
    S("n_le_median", function (os) {
      var s = os.map(function (o) { return o.n; }).sort(function (a, b) { return a - b; }), m = s[Math.floor(s.length / 2)];
      return os.map(function (o) { return o.n < m; });
    });
  })();
  function symOf(o, ax) {
    var set = {}, i, c, r;
    for (i = 0; i < o.cells.length; i++) set[o.cells[i][0] + "," + o.cells[i][1]] = 1;
    for (i = 0; i < o.cells.length; i++) {
      r = o.cells[i][0]; c = o.cells[i][1];
      if (ax === "h") { if (!set[r + "," + (o.c0 + o.c1 - c)]) return false; }
      else if (!set[(o.r0 + o.r1 - r) + "," + c]) return false;
    }
    return true;
  }


  /* --------------------------------------------------- count -> rendering */

  /* extra shape predicates used as things to count */
  (function () {
    function S(name, f) { SELECTORS.push([name, f]); }
    function full(o) { return o.n === (o.r1 - o.r0 + 1) * (o.c1 - o.c0 + 1); }
    S("sq", function (os) { return os.map(function (o) { return full(o) && o.r1 - o.r0 === o.c1 - o.c0 && o.n > 1; }); });
    S("sq2", function (os) { return os.map(function (o) { return full(o) && o.r1 - o.r0 === 1 && o.c1 - o.c0 === 1; }); });
    S("sq3", function (os) { return os.map(function (o) { return full(o) && o.r1 - o.r0 === 2 && o.c1 - o.c0 === 2; }); });
    S("hline", function (os) { return os.map(function (o) { return o.r0 === o.r1 && o.n > 1; }); });
    S("vline", function (os) { return os.map(function (o) { return o.c0 === o.c1 && o.n > 1; }); });
    S("ring", function (os, g, bg) { return os.map(function (o) { return holeCells(o, g, bg).length > 0; }); });
    S("notrect", function (os) { return os.map(function (o) { return !full(o); }); });
    S("n2", function (os) { return os.map(function (o) { return o.n === 2; }); });
    S("n3", function (os) { return os.map(function (o) { return o.n === 3; }); });
    S("n4", function (os) { return os.map(function (o) { return o.n === 4; }); });
  })();

  /* the order in which a counter fills a fixed canvas */
  function fillOrder(kind, h, w) {
    var o = [], r, c, i;
    if (kind === "row") { for (r = 0; r < h; r++) for (c = 0; c < w; c++) o.push([r, c]); }
    else if (kind === "col") { for (c = 0; c < w; c++) for (r = 0; r < h; r++) o.push([r, c]); }
    else if (kind === "diag") { for (i = 0; i < Math.min(h, w); i++) o.push([i, i]); }
    else if (kind === "adiag") { for (i = 0; i < Math.min(h, w); i++) o.push([i, w - 1 - i]); }
    else if (kind === "snake") { for (r = 0; r < h; r++) for (i = 0; i < w; i++) o.push([r, r % 2 ? w - 1 - i : i]); }
    else if (kind === "rowrev") { for (r = h - 1; r >= 0; r--) for (c = w - 1; c >= 0; c--) o.push([r, c]); }
    else if (kind === "colrev") { for (c = w - 1; c >= 0; c--) for (r = h - 1; r >= 0; r--) o.push([r, c]); }
    else if (kind === "rowr") { for (r = 0; r < h; r++) for (c = w - 1; c >= 0; c--) o.push([r, c]); }
    return o;
  }

  GENS.push(function countRenderGen(ctx) {
    var train = ctx.train, bg = ctx.bg(), t, out = [], i;
    var cs = ctx.const_out_shape();
    /* outputs are simple: a base colour plus at most one other colour */
    var pal = ctx.out_palette();
    if (G.csSize(pal) > 2) return [];
    var modes = ["c8", "c4", "m8"], feats = [];
    var mi, si, seenVec = {};
    /* conjunctions: a colour together with a shape predicate */
    var conj = SELECTORS.slice(), shapeNames = ["sq", "sq2", "sq3", "hline", "vline", "ring", "notrect", "single", "n2", "n3", "n4", "rect", "border", "multi"], cc, sn;
    for (sn = 0; sn < shapeNames.length; sn++) {
      var shp = null; for (i = 0; i < SELECTORS.length; i++) if (SELECTORS[i][0] === shapeNames[sn]) shp = SELECTORS[i][1];
      if (!shp) continue;
      for (cc = 1; cc < 10; cc++) (function (c2, sf, nm) {
        conj.push([nm + "&color" + c2, function (os, g, b) { var a = sf(os, g, b); return os.map(function (o, ix) { return a[ix] && o.color === c2; }); }]);
      })(cc, shp, shapeNames[sn]);
    }
    for (mi = 0; mi < modes.length; mi++) for (si = 0; si < conj.length; si++) {
      var ks = [], vec;
      for (t = 0; t < train.length; t++) {
        var os = objsOf(train[t][0], bg, modes[mi]), fl = conj[si][1](os, train[t][0], bg), n = 0, q;
        for (q = 0; q < fl.length; q++) if (fl[q]) n++;
        ks.push(n);
      }
      vec = ks.join(",");
      if (seenVec[vec]) continue; seenVec[vec] = 1;
      feats.push([modes[mi] + ":" + conj[si][0], modes[mi], conj[si][1], ks]);
    }
    /* colour counts and plain counts of cells */
    var col;
    for (col = 0; col < 10; col++) {
      var kc = [];
      for (t = 0; t < train.length; t++) kc.push(G.countColor(train[t][0], col));
      var v2 = kc.join(",");
      if (kc.some(function (x) { return x > 0; }) && !seenVec[v2]) { seenVec[v2] = 1; (function (cc) { feats.push(["cells" + cc, null, function (g) { return G.countColor(g, cc); }, kc]); })(col); }
    }
    var ndist = [];
    for (t = 0; t < train.length; t++) ndist.push(G.csSize(G.palette(train[t][0]) & ~(1 << bg)));
    feats.push(["ncolors", null, function (g) { return G.csSize(G.palette(g) & ~(1 << bg)); }, ndist]);
    function countOf(f, g) {
      if (f[1] === null) return f[2](g);
      var os = objsOf(g, bg, f[1]), fl = f[2](os, g, bg), n = 0, q;
      for (q = 0; q < fl.length; q++) if (fl[q]) n++;
      return n;
    }
    var colors = G.csList(pal), kinds = ["row", "col", "diag", "adiag", "snake", "rowrev", "colrev", "rowr"], fi, ci, ki, bi, ok;
    for (fi = 0; fi < feats.length; fi++) {
      var ks2 = feats[fi][3];
      /* style A: fixed canvas, first k cells in some order get the colour */
      if (cs) {
        for (bi = 0; bi < colors.length; bi++) for (ci = 0; ci < colors.length; ci++) {
          if (bi === ci) continue;
          for (ki = 0; ki < kinds.length; ki++) {
            ok = true;
            for (t = 0; t < train.length && ok; t++) {
              var ord = fillOrder(kinds[ki], cs[0], cs[1]), o2 = G.constGrid(cs[0], cs[1], colors[bi]), j;
              for (j = 0; j < Math.min(ks2[t], ord.length); j++) o2[ord[j][0]][ord[j][1]] = colors[ci];
              if (!same(o2, train[t][1])) ok = false;
            }
            if (ok) out.push(_h("count_fill_" + feats[fi][0] + "_" + kinds[ki], (function (f, kd, b, c) {
              return function (g) {
                var k = countOf(f, g), ord2 = fillOrder(kd, cs[0], cs[1]), o3 = G.constGrid(cs[0], cs[1], b), j2;
                for (j2 = 0; j2 < Math.min(k, ord2.length); j2++) o3[ord2[j2][0]][ord2[j2][1]] = c;
                return o3;
              };
            })(feats[fi], kinds[ki], colors[bi], colors[ci]), 4.0 + (cs[0] * cs[1] <= 4 ? 1.5 : 0)));
          }
        }
      }
      /* style B: a bar or block whose size is k */
      var shapes = ["1xk", "kx1", "kxk"];
      for (ci = 0; ci < colors.length; ci++) for (ki = 0; ki < shapes.length; ki++) {
        ok = true;
        for (t = 0; t < train.length && ok; t++) {
          var k = ks2[t]; if (k < 1 || k > 30) { ok = false; break; }
          var hh = shapes[ki] === "1xk" ? 1 : k, ww = shapes[ki] === "kx1" ? 1 : k;
          if (!same(G.constGrid(hh, ww, colors[ci]), train[t][1])) ok = false;
        }
        if (ok) out.push(_h("count_bar_" + feats[fi][0] + "_" + shapes[ki], (function (f, sh, c) {
          return function (g) { var k = countOf(f, g); if (k < 1 || k > 30) return null; return G.constGrid(sh === "1xk" ? 1 : k, sh === "kx1" ? 1 : k, c); };
        })(feats[fi], shapes[ki], colors[ci]), 4.0));
      }
    }
    return out;
  });


  /* ------------------------------------------- reflection across a divider */

  /* rows or columns that are one solid non-background colour */
  function dividers(g, bg) {
    var h = g.length, w = g[0].length, rows = [], cols = [], r, c, ok;
    for (r = 0; r < h; r++) {
      ok = g[r][0] !== bg; for (c = 1; c < w && ok; c++) if (g[r][c] !== g[r][0]) ok = false;
      if (ok) rows.push(r);
    }
    for (c = 0; c < w; c++) {
      ok = g[0][c] !== bg; for (r = 1; r < h && ok; r++) if (g[r][c] !== g[0][c]) ok = false;
      if (ok) cols.push(c);
    }
    return { rows: rows, cols: cols };
  }
  function reflectAcross(g, bg, side, mode, target, M) {
    var dv = dividers(g, bg), h = g.length, w = g[0].length, horiz;
    if (dv.rows.length === 1 && dv.cols.length === 0) horiz = true;
    else if (dv.cols.length === 1 && dv.rows.length === 0) horiz = false;
    else return null;
    var L = horiz ? dv.rows[0] : dv.cols[0], out = copy(g), r, c, pr, pc, v, src, onSide;
    if (M === "swap") {
      /* exchange the two colours of the moving content (the divider keeps its own) */
      var seenC = {}, ks = [];
      for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
        v = g[r][c]; src = horiz ? r : c;
        if (v !== bg && src !== L && !seenC[v]) { seenC[v] = 1; ks.push(v); }
      }
      M = ks.length === 2 ? (function () { var m = {}; m[ks[0]] = ks[1]; m[ks[1]] = ks[0]; return m; })() : null;
    }
    var map = function (v2) { return M && M[v2] !== undefined ? M[v2] : v2; };
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      v = g[r][c];
      if (v === bg) continue;
      src = horiz ? r : c;
      if (src === L) continue;
      onSide = src < L ? "lo" : "hi";
      if (side !== "both" && side !== onSide) continue;
      pr = horiz ? 2 * L - r : r; pc = horiz ? c : 2 * L - c;
      if (mode === "move" || target === "orig") out[r][c] = (target === "orig") ? map(v) : bg;
      if (inb(g, pr, pc)) {
        if (target === "refl") { if (mode === "move" || out[pr][pc] === bg || true) out[pr][pc] = map(v); }
        else out[pr][pc] = v;
      }
    }
    return out;
  }
  GENS.push(function reflectGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t;
    for (t = 0; t < train.length; t++) {
      var dv = dividers(train[t][0], bg);
      if (!((dv.rows.length === 1) !== (dv.cols.length === 1))) return [];
    }
    var sides = ["lo", "hi", "both"], modes = ["copy", "move"], targets = ["refl", "orig"], si, mi, ti;
    for (si = 0; si < sides.length; si++) for (mi = 0; mi < modes.length; mi++) for (ti = 0; ti < targets.length; ti++) {
      /* learn the colour map from pair 0 */
      var maps = [null];
      var g0 = train[0][0], o0 = train[0][1], base = reflectAcross(g0, bg, sides[si], modes[mi], targets[ti], null);
      if (base) {
        var M = {}, bad = false, r, c;
        for (r = 0; r < g0.length && !bad; r++) for (c = 0; c < g0[0].length; c++) {
          if (base[r][c] !== o0[r][c] && g0[r][c] !== bg && o0[r][c] !== bg) {
            if (M[g0[r][c]] !== undefined && M[g0[r][c]] !== o0[r][c]) { bad = true; break; }
            M[g0[r][c]] = o0[r][c];
          }
        }
        /* colour swap learned from the reflected cells' sources */
        if (!bad) {
          var M2 = {}, any = false, g2 = g0;
          var dv0 = dividers(g0, bg), horiz = dv0.rows.length === 1, L = horiz ? dv0.rows[0] : dv0.cols[0];
          for (r = 0; r < g2.length && !bad; r++) for (c = 0; c < g2[0].length; c++) {
            var v = g2[r][c]; if (v === bg) continue;
            var pr = horiz ? 2 * L - r : r, pc = horiz ? c : 2 * L - c, srcI = horiz ? r : c;
            if (srcI === L || !inb(g2, pr, pc)) continue;
            var tgt = targets[ti] === "refl" ? o0[pr][pc] : o0[r][c];
            if (tgt === bg) continue;
            if (M2[v] !== undefined && M2[v] !== tgt) { bad = true; break; }
            M2[v] = tgt; any = true;
          }
          if (!bad && any) maps.push(M2);
        }
      }
      maps.push("swap");
      var mk;
      for (mk = 0; mk < maps.length; mk++) {
        var ok = true;
        for (t = 0; t < train.length; t++) {
          var p = reflectAcross(train[t][0], bg, sides[si], modes[mi], targets[ti], maps[mk]);
          if (!p || !same(p, train[t][1])) { ok = false; break; }
        }
        if (ok) out.push(_h("reflect_" + sides[si] + "_" + modes[mi] + "_" + targets[ti] + (mk ? "_map" : ""),
          (function (sd, md, tg, mm) { return function (g) { return reflectAcross(g, bg, sd, md, tg, mm); }; })(sides[si], modes[mi], targets[ti], maps[mk]), 4.0 + (mk ? 1 : 0)));
      }
    }
    return out;
  });

  /* ------------------------------------ template copied onto marker pixels */

  function stampTemplates(g, bg, c, anchor, keep, which, drop) {
    var C = comps8(g, bg), out = copy(g), i, j, k, cells, tmpl = [], targets = [], p;
    for (i = 0; i < C.list.length; i++) {
      cells = C.list[i];
      if (cells.length === 1 && g[cells[0][0]][cells[0][1]] === c) targets.push(cells[0]);
      else if (cells.length > 1) {
        var hasC = 0;
        for (j = 0; j < cells.length; j++) if (g[cells[j][0]][cells[j][1]] === c) hasC++;
        if (anchor === "cell" && hasC === 1) tmpl.push(cells);
        else if (anchor !== "cell" && hasC === 0) tmpl.push(cells);
      }
    }
    if (!tmpl.length || !targets.length) return null;
    if (which === "largest") {
      tmpl.sort(function (a, b) { return b.length - a.length; }); tmpl = [tmpl[0]];
    } else if (tmpl.length !== 1) return null;
    var T = tmpl[0], ar, ac, r0 = 99, c0 = 99, r1 = -1, c1 = -1;
    for (j = 0; j < T.length; j++) {
      if (T[j][0] < r0) r0 = T[j][0]; if (T[j][0] > r1) r1 = T[j][0];
      if (T[j][1] < c0) c0 = T[j][1]; if (T[j][1] > c1) c1 = T[j][1];
    }
    if (anchor === "cell") { for (j = 0; j < T.length; j++) if (g[T[j][0]][T[j][1]] === c) { ar = T[j][0]; ac = T[j][1]; } }
    else if (anchor === "center") { if ((r1 - r0) % 2 || (c1 - c0) % 2) return null; ar = (r0 + r1) / 2; ac = (c0 + c1) / 2; }
    else { ar = r0; ac = c0; }
    if (!keep) for (j = 0; j < T.length; j++) out[T[j][0]][T[j][1]] = bg;
    for (k = 0; k < targets.length; k++) {
      p = targets[k];
      if (drop) out[p[0]][p[1]] = bg;
      for (j = 0; j < T.length; j++) {
        if (drop && g[T[j][0]][T[j][1]] === c) continue;
        var rr = T[j][0] - ar + p[0], cc = T[j][1] - ac + p[1];
        if (inb(g, rr, cc)) out[rr][cc] = g[T[j][0]][T[j][1]];
      }
    }
    return out;
  }
  GENS.push(function templateStampGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, c, ai, ki, wi;
    var anchors = ["cell", "center", "corner"], whichs = ["only", "largest"];
    for (c = 0; c < 10; c++) {
      if (c === bg) continue;
      for (ai = 0; ai < anchors.length; ai++) for (ki = 0; ki < 2; ki++) for (wi = 0; wi < whichs.length; wi++) for (var dr = 0; dr < 2; dr++) {
        var ok = true;
        for (t = 0; t < train.length; t++) {
          var p = stampTemplates(train[t][0], bg, c, anchors[ai], ki === 1, whichs[wi], dr === 1);
          if (!p || !same(p, train[t][1])) { ok = false; break; }
        }
        if (ok) out.push(_h("tstamp_c" + c + "_" + anchors[ai] + (ki ? "_keep" : "_move") + "_" + whichs[wi] + (dr ? "_drop" : ""),
          (function (cc, an, kp, wh, dd) { return function (g) { return stampTemplates(g, bg, cc, an, kp, wh, dd); }; })(c, anchors[ai], ki === 1, whichs[wi], dr === 1), 4.0));
      }
    }
    return out;
  });


  /* ------------------------------------------ anchored primitives, covered */

  /* Paint-only tasks draw extra cells around or out of marks. Each mark class
     (a colour, the isolated pixels, the odd cell of an object...) gets every
     primitive that is consistent with ALL its occurrences in ALL demonstrations
     -- a stencil cell at an offset, or a ray in a direction -- and a greedy
     cover keeps the fewest primitives whose union is exactly what was drawn. */

  /* directions defined by where the mark sits rather than by a compass point:
     -1 toward / -2 away from the divider line, -3 toward / -4 away from the
     nearest grid edge, -5 toward / -6 away from the centre of its component */
  function relDir(g, bg, a, code) {
    var h = g.length, w = g[0].length, dv, L, horiz, d;
    if (code === -1 || code === -2) {
      dv = g.__dv || (g.__dv = dividers(g, bg));
      if (dv.rows.length + dv.cols.length !== 1) return null;
      horiz = dv.rows.length === 1; L = horiz ? dv.rows[0] : dv.cols[0];
      var pos = horiz ? a.r : a.c;
      if (pos === L) return null;
      var sgnTo = pos < L ? 1 : -1;
      if (code === -2) sgnTo = -sgnTo;
      return horiz ? [sgnTo, 0] : [0, sgnTo];
    }
    if (code === -3 || code === -4) {
      var dists = [a.r, h - 1 - a.r, a.c, w - 1 - a.c], best = 0, i;
      for (i = 1; i < 4; i++) if (dists[i] < dists[best]) best = i;
      for (i = 0; i < 4; i++) if (i !== best && dists[i] === dists[best]) return null;
      d = [[-1, 0], [1, 0], [0, -1], [0, 1]][best];
      return code === -3 ? d : [-d[0], -d[1]];
    }
    if (code === -7 || code === -8) {
      var horizAxis = code === -7, near = horizAxis ? (a.c * 2 < w - 1 ? -1 : (a.c * 2 > w - 1 ? 1 : 0)) : (a.r * 2 < h - 1 ? -1 : (a.r * 2 > h - 1 ? 1 : 0));
      if (!near) return null;
      return horizAxis ? [0, near] : [near, 0];
    }
    var dr = a.cr - a.r, dc = a.cc - a.c;
    if (code === -6) { dr = -dr; dc = -dc; }
    var ar = Math.abs(dr), ac = Math.abs(dc);
    if (ar < 1e-9 && ac < 1e-9) return null;
    if (ar >= 2 * ac) return [sgn(dr), 0];
    if (ac >= 2 * ar) return [0, sgn(dc)];
    return [sgn(dr), sgn(dc)];
  }
  function primPaints(g, bg, a, prim) {
    var out = [], r, c, d;
    if (prim.kind === "st") {
      r = a.r + prim.dr; c = a.c + prim.dc;
      if (inb(g, r, c) && g[r][c] === bg) out.push([r, c, prim.mode === "src" ? a.v : prim.color]);
    } else if (prim.kind === "hit") {
      /* dir 100: look along all four axes, tag the first thing seen in each */
      var dl = prim.dir === 100 ? D4 : [prim.dir >= 0 ? D8[prim.dir] : relDir(g, bg, a, prim.dir)], di2;
      for (di2 = 0; di2 < dl.length; di2++) {
        d = dl[di2]; if (!d) continue;
        r = a.r + d[0]; c = a.c + d[1];
        while (inb(g, r, c) && g[r][c] === bg) { r += d[0]; c += d[1]; }
        if (inb(g, r, c)) out.push([r, c, prim.mode === "src" ? a.v : prim.color]);
      }
    } else if (prim.kind === "bounce") {
      d = D8[prim.dir]; r = a.r; c = a.c; var dr2 = d[0], dc2 = d[1], steps = 0, hh = g.length, ww = g[0].length;
      while (steps++ < 200) {
        var nr2 = r + dr2, nc2 = c + dc2;
        if (prim.wall === "v") { if (nc2 < 0 || nc2 >= ww) { dc2 = -dc2; nc2 = c + dc2; if (nc2 < 0 || nc2 >= ww) break; } if (nr2 < 0 || nr2 >= hh) break; }
        else { if (nr2 < 0 || nr2 >= hh) { dr2 = -dr2; nr2 = r + dr2; if (nr2 < 0 || nr2 >= hh) break; } if (nc2 < 0 || nc2 >= ww) break; }
        r = nr2; c = nc2;
        if (g[r][c] !== bg) { if (prim.stop === "block") break; }
        else out.push([r, c, prim.mode === "src" ? a.v : prim.color]);
      }
    } else {
      d = prim.dir >= 0 ? D8[prim.dir] : relDir(g, bg, a, prim.dir);
      if (!d) return out;
      r = a.r + d[0]; c = a.c + d[1];
      while (inb(g, r, c)) {
        if (g[r][c] !== bg) { if (prim.stop === "block") break; }
        else out.push([r, c, prim.mode === "src" ? a.v : prim.color]);
        r += d[0]; c += d[1];
      }
    }
    return out;
  }
  function anchoredPaint(g, bg, srcFn, prims) {
    var out = copy(g), as = srcFn(g, bg), i, j, k, ps;
    for (i = 0; i < as.length; i++) for (j = 0; j < prims.length; j++) {
      ps = primPaints(g, bg, as[i], prims[j]);
      for (k = 0; k < ps.length; k++) out[ps[k][0]][ps[k][1]] = ps[k][2];
    }
    return out;
  }
  function learnAnchored(train, bg, ctx) {
    var out = [], t, si, r, c, i, dirCodes = [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7, -8];
    var need = {}, needN = 0, seenCols = 0;
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++)
      if (train[t][0][r][c] !== train[t][1][r][c]) { need[t * 4096 + r * 64 + c] = 1; needN++; seenCols |= 1 << train[t][1][r][c]; }
    var colors = G.csList(seenCols);
    if (needN > 3000) return null;
    if (colors.length > 4) colors = [];   /* many colours: only 'the mark's own colour' is a sensible choice */
    var R = 3, cands = [], classes = [];
    for (si = 0; si < RAY_SOURCES.length; si++) {
      if (ctx.timed_out()) return null;
      var anchors = [], n = 0;
      for (t = 0; t < train.length; t++) { var a = RAY_SOURCES[si][1](train[t][0], bg); anchors.push(a); n += a.length; }
      if (n === 0 || n > 400) continue;
      classes.push(si);
      var modes = [["src", 0]].concat(colors.map(function (k) { return ["fix", k]; }));
      var tryPrim = function (prim) {
        var covers = [], ok = true, tt, aa, ps, kk;
        for (tt = 0; tt < train.length && ok; tt++) for (aa = 0; aa < anchors[tt].length && ok; aa++) {
          ps = primPaints(train[tt][0], bg, anchors[tt][aa], prim);
          for (kk = 0; kk < ps.length; kk++) {
            var want = train[tt][1][ps[kk][0]][ps[kk][1]];
            if (want !== ps[kk][2]) {
              /* another mark may have drawn over this cell: tolerated, but it explains nothing */
              if (want !== bg && prim.kind !== "hit") continue;
              ok = false; break;
            }
            covers.push(tt * 4096 + ps[kk][0] * 64 + ps[kk][1]);
          }
        }
        if (ok && covers.length) { prim.covers = covers; prim.cls = si; cands.push(prim); }
      };
      var dr, dc, mi, st;
      for (dr = -R; dr <= R; dr++) for (dc = -R; dc <= R; dc++) {
        if (!dr && !dc) continue;
        for (mi = 0; mi < modes.length; mi++) tryPrim({ kind: "st", dr: dr, dc: dc, mode: modes[mi][0], color: modes[mi][1] });
      }
      for (i = 0; i < dirCodes.length; i++) for (st = 0; st < 2; st++) for (mi = 0; mi < modes.length; mi++)
        tryPrim({ kind: "ray", dir: dirCodes[i], stop: st ? "block" : "pass", mode: modes[mi][0], color: modes[mi][1] });
      for (i = 0; i < dirCodes.length; i++) for (mi = 0; mi < modes.length; mi++)
        tryPrim({ kind: "hit", dir: dirCodes[i], mode: modes[mi][0], color: modes[mi][1] });
      for (mi = 0; mi < modes.length; mi++) tryPrim({ kind: "hit", dir: 100, mode: modes[mi][0], color: modes[mi][1] });
      for (i = 4; i < 8; i++) for (mi = 0; mi < modes.length; mi++) {
        tryPrim({ kind: "bounce", dir: i, wall: "v", stop: "pass", mode: modes[mi][0], color: modes[mi][1] });
        tryPrim({ kind: "bounce", dir: i, wall: "h", stop: "pass", mode: modes[mi][0], color: modes[mi][1] });
      }
    }
    if (!cands.length) return null;
    /* greedy cover over every (class, primitive) pair; rays before stencils */
    var chosen = [], left = needN, pool = need;
    while (left > 0 && chosen.length < 16) {
      var best = null, bestScore = 0, cc;
      for (cc = 0; cc < cands.length; cc++) {
        var gain = 0, seen = {}, q;
        for (q = 0; q < cands[cc].covers.length; q++) { var kq = cands[cc].covers[q]; if (pool[kq] && !seen[kq]) { seen[kq] = 1; gain++; } }
        var score = gain + (cands[cc].kind === "ray" ? 0.5 : 0) + (cands[cc].mode === "src" ? 0.25 : 0) - (cands[cc].dir < 0 ? 0.1 : 0);
        if (gain > 0 && (best === null || score > bestScore)) { best = cands[cc]; bestScore = score; }
      }
      if (!best) break;
      chosen.push(best);
      for (var q2 = 0; q2 < best.covers.length; q2++) if (pool[best.covers[q2]]) { delete pool[best.covers[q2]]; left--; }
    }
    if (left > 0) return null;
    var byClass = {}, k2;
    for (k2 = 0; k2 < chosen.length; k2++) (byClass[chosen[k2].cls] = byClass[chosen[k2].cls] || []).push(chosen[k2]);
    var groups = Object.keys(byClass).map(function (k) { return [RAY_SOURCES[+k][1], byClass[k]]; });
    if (chosen.length > 10 || groups.length > 2) return null;
    /* where two classes draw over one another the later one wins: try both orders */
    var orders = groups.length === 2 ? [[0, 1], [1, 0]] : [[0]], oi;
    for (oi = 0; oi < orders.length; oi++) {
      var apply = (function (ord) {
        return function (g) {
          var o = copy(g), gi, as, ai, pi, ps, ki, grp;
          for (gi = 0; gi < ord.length; gi++) {
            grp = groups[ord[gi]]; as = grp[0](g, bg);
            for (ai = 0; ai < as.length; ai++) for (pi = 0; pi < grp[1].length; pi++) {
              ps = primPaints(g, bg, as[ai], grp[1][pi]);
              for (ki = 0; ki < ps.length; ki++) o[ps[ki][0]][ps[ki][1]] = ps[ki][2];
            }
          }
          return o;
        };
      })(orders[oi]);
      var good = true;
      for (t = 0; t < train.length; t++) if (!same(apply(train[t][0]), train[t][1])) { good = false; break; }
      if (good) return { apply: apply, np: chosen.length, ng: groups.length };
    }
    return null;
  }
  GENS.push(function anchoredGen(ctx) {
    if (!ctx.same_shape() || changedCells(ctx) === 0) return [];
    var bg = ctx.bg(), train = ctx.train, h = learnAnchored(train, bg, ctx), i, sub;
    if (!h) return [];
    /* the learning procedure itself must generalise: leave one pair out */
    if (train.length >= 3) for (i = 0; i < train.length; i++) {
      sub = train.slice(0, i).concat(train.slice(i + 1));
      var hs = learnAnchored(sub, bg, ctx);
      if (!hs || !same(hs.apply(train[i][0]), train[i][1])) return [];
    }
    return [_h("anchored_" + h.ng + "c_" + h.np + "p", h.apply, 4.5 + 0.2 * h.np + 0.3 * h.ng + (changedCells(ctx) < 3 * train.length ? 2 : 0))];
  });

  /* --------------------------------------------- fill between mark pairs */

  var LINE_DIRS = { h: [0, 1], v: [1, 0], d1: [1, 1], d2: [1, -1] };
  function fillBetween(g, bg, dirNames, eq, colorMode, fixed, maxGap) {
    var out = copy(g), h = g.length, w = g[0].length, di, r, c, d, nr, nc, k, cells, steps;
    for (di = 0; di < dirNames.length; di++) {
      d = LINE_DIRS[dirNames[di]];
      for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
        if (g[r][c] === bg) continue;
        /* walk forward to the next non-background cell */
        nr = r + d[0]; nc = c + d[1]; steps = 0;
        while (inb(g, nr, nc) && g[nr][nc] === bg) { nr += d[0]; nc += d[1]; steps++; }
        if (!steps || !inb(g, nr, nc)) continue;
        if (maxGap && steps > maxGap) continue;
        if (eq && g[nr][nc] !== g[r][c]) continue;
        var col = colorMode === "fix" ? fixed : g[r][c];
        for (k = 1; k <= steps; k++) out[r + d[0] * k][c + d[1] * k] = col;
      }
    }
    return out;
  }
  GENS.push(function betweenGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, seen = 0, r, c;
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++)
      if (train[t][0][r][c] !== train[t][1][r][c]) seen |= 1 << train[t][1][r][c];
    var cols = G.csList(seen);
    var names = ["h", "v", "d1", "d2"], subset, i, eq, ci, mg;
    for (subset = 1; subset < 16; subset++) {
      var dn = []; for (i = 0; i < 4; i++) if (subset & (1 << i)) dn.push(names[i]);
      for (eq = 0; eq < 2; eq++) for (mg = 0; mg < 3; mg++) {
        var gapMax = mg === 0 ? 0 : mg === 1 ? 3 : 6;
        var modes = [["src", 0]]; for (ci = 0; ci < cols.length; ci++) modes.push(["fix", cols[ci]]);
        for (ci = 0; ci < modes.length; ci++) {
          var ok = true;
          for (t = 0; t < train.length; t++) if (!same(fillBetween(train[t][0], bg, dn, eq === 1, modes[ci][0], modes[ci][1], gapMax), train[t][1])) { ok = false; break; }
          if (ok) out.push(_h("between_" + dn.join("") + (eq ? "_eq" : "_any") + "_g" + gapMax + "_" + modes[ci][0] + modes[ci][1],
            (function (dd, e, cm, fx, gm) { return function (g) { return fillBetween(g, bg, dd, e, cm, fx, gm); }; })(dn, eq === 1, modes[ci][0], modes[ci][1], gapMax), 3.4 + (eq ? 0 : 0.8) + 0.1 * dn.length + (gapMax ? 0.2 : 0)));
        }
      }
    }
    return out;
  });


  /* ------------------------------------------- recolour by a relation */

  function touchingColor(o, g, bg, all) {
    var seen = {}, n = 0, i, d, nr, nc, v, last = -1, mine = {}, cs;
    for (i = 0; i < o.cells.length; i++) mine[o.cells[i][0] * 64 + o.cells[i][1]] = 1;
    for (i = 0; i < o.cells.length; i++) for (d = 0; d < (all ? 8 : 4); d++) {
      nr = o.cells[i][0] + D8[d][0]; nc = o.cells[i][1] + D8[d][1];
      if (!inb(g, nr, nc) || mine[nr * 64 + nc]) continue;
      v = g[nr][nc];
      if (v !== bg && v !== o.color && !seen[v]) { seen[v] = 1; n++; last = v; }
    }
    return n === 1 ? last : -1;
  }
  function nearestColor(o, os, g, metric) {
    var best = -1, bd = 1e9, i, j, k, q;
    for (i = 0; i < os.length; i++) {
      q = os[i]; if (q === o || q.color === o.color) continue;
      var dmin = 1e9;
      for (j = 0; j < o.cells.length; j++) for (k = 0; k < q.cells.length; k++) {
        var ddr = Math.abs(o.cells[j][0] - q.cells[k][0]), ddc = Math.abs(o.cells[j][1] - q.cells[k][1]);
        var dd = metric === "l1" ? ddr + ddc : metric === "l2" ? ddr * ddr + ddc * ddc : Math.max(ddr, ddc);
        if (dd < dmin) dmin = dd;
      }
      if (dmin < bd) { bd = dmin; best = q.color; } else if (dmin === bd && q.color !== best) best = -2;
    }
    return best < 0 ? -1 : best;
  }
  function markerInside(o, g, bg) {
    /* the single differently coloured cell inside the object's bounding box */
    var r, c, seen = {}, n = 0, last = -1, mine = {}, i;
    for (i = 0; i < o.cells.length; i++) mine[o.cells[i][0] * 64 + o.cells[i][1]] = 1;
    for (r = o.r0; r <= o.r1; r++) for (c = o.c0; c <= o.c1; c++) {
      if (mine[r * 64 + c]) continue;
      var v = g[r][c]; if (v !== bg && v !== o.color && !seen[v]) { seen[v] = 1; n++; last = v; }
    }
    return n === 1 ? last : -1;
  }
  var RELATIONS = [
    ["touch4", function (o, os, g, bg) { return touchingColor(o, g, bg, false); }],
    ["touch8", function (o, os, g, bg) { return touchingColor(o, g, bg, true); }],
    ["nearest", function (o, os, g, bg) { return nearestColor(o, os, g, "linf"); }],
    ["nearest_l1", function (o, os, g, bg) { return nearestColor(o, os, g, "l1"); }],
    ["nearest_l2", function (o, os, g, bg) { return nearestColor(o, os, g, "l2"); }],
    ["inside", function (o, os, g, bg) { return markerInside(o, g, bg); }]
  ];
  function relRecolor(g, bg, mode, rel, target, removeSrc) {
    var os = objsOf(g, bg, mode), out = copy(g), i, j, col, o, marks = [];
    for (i = 0; i < os.length; i++) {
      o = os[i];
      if (target >= 0 && o.color !== target) continue;
      col = rel(o, os, g, bg);
      if (col < 0) continue;
      for (j = 0; j < o.cells.length; j++) out[o.cells[j][0]][o.cells[j][1]] = col;
    }
    return out;
  }
  GENS.push(function relRecolorGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, mi, ri, ci;
    var modes = ["c8", "c4"], targets = [-1], cs = G.csList(ctx.in_palette() & ~(1 << bg));
    for (ci = 0; ci < cs.length; ci++) targets.push(cs[ci]);
    for (mi = 0; mi < modes.length; mi++) for (ri = 0; ri < RELATIONS.length; ri++) for (ci = 0; ci < targets.length; ci++) {
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(relRecolor(train[t][0], bg, modes[mi], RELATIONS[ri][1], targets[ci]), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("relrecolor_" + modes[mi] + "_" + RELATIONS[ri][0] + "_t" + targets[ci],
        (function (m, rf, tg) { return function (g) { return relRecolor(g, bg, m, rf, tg); }; })(modes[mi], RELATIONS[ri][1], targets[ci]), 4.0));
    }
    return out;
  });


  /* --------------------- keep one selection, colour it by what was dropped */

  function keepRecolor(g, bg, mode, selF, rel) {
    var os = objsOf(g, bg, mode), fl = selF(os, g, bg), i, j, n = 0, hist = {}, v;
    for (i = 0; i < os.length; i++) {
      if (fl[i]) { n++; continue; }
      for (j = 0; j < os[i].cells.length; j++) { v = g[os[i].cells[j][0]][os[i].cells[j][1]]; hist[v] = (hist[v] || 0) + 1; }
    }
    if (!n) return null;
    var col = -1, keys = Object.keys(hist).map(Number).sort(function (a, b) { return a - b; });
    if (rel !== "self") {
      if (!keys.length) return null;
      var best = keys[0];
      for (i = 1; i < keys.length; i++) {
        if (rel === "major" ? hist[keys[i]] > hist[best] : hist[keys[i]] < hist[best]) best = keys[i];
      }
      /* ties make the colour ambiguous */
      for (i = 0; i < keys.length; i++) if (keys[i] !== best && hist[keys[i]] === hist[best]) return null;
      col = best;
    }
    var out = G.constGrid(g.length, g[0].length, bg);
    for (i = 0; i < os.length; i++) if (fl[i]) for (j = 0; j < os[i].cells.length; j++) {
      var p = os[i].cells[j]; out[p[0]][p[1]] = rel === "self" ? g[p[0]][p[1]] : col;
    }
    return out;
  }
  GENS.push(function keepRecolorGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, mi, si, ri, rels = ["major", "minor", "self"], modes = ["c8", "m8"];
    for (t = 0; t < train.length; t++) if (objsOf(train[t][0], bg, "c8").length > 40) return [];
    for (mi = 0; mi < modes.length; mi++) {
      var seenVec = {};
      for (si = 0; si < SELECTORS.length; si++) {
        var vec = "", nz = 0;
        for (t = 0; t < train.length; t++) {
          var os = objsOf(train[t][0], bg, modes[mi]), fl = SELECTORS[si][1](os, train[t][0], bg), q;
          for (q = 0; q < fl.length; q++) { vec += fl[q] ? "1" : "0"; if (fl[q]) nz++; }
          vec += "|";
        }
        if (!nz || seenVec[vec]) continue; seenVec[vec] = 1;
        for (ri = 0; ri < rels.length; ri++) {
          var ok = true;
          for (t = 0; t < train.length; t++) {
            var p = keepRecolor(train[t][0], bg, modes[mi], SELECTORS[si][1], rels[ri]);
            if (!p || !same(p, train[t][1])) { ok = false; break; }
          }
          if (ok) out.push(_h("keep_" + modes[mi] + "_" + SELECTORS[si][0] + "_" + rels[ri],
            (function (m, sf, rl) { return function (g) { return keepRecolor(g, bg, m, sf, rl); }; })(modes[mi], SELECTORS[si][1], rels[ri]), 4.0));
        }
      }
    }
    return out;
  });


  /* --------------------------------------------- flood, symmetrise, settle */

  /* seeds spread through the background region they touch */
  function floodSeeds(g, bg, srcFn, conn8, colorMode, fixed, stopAtBorder) {
    var as = srcFn(g, bg), out = copy(g), h = g.length, w = g[0].length, i, d, nb = conn8 ? D8 : D4, filled = new Uint8Array(h * w), st, p, nr, nc;
    for (i = 0; i < as.length; i++) {
      var col = colorMode === "src" ? as[i].v : fixed;
      st = [];
      for (d = 0; d < 4; d++) {
        nr = as[i].r + D4[d][0]; nc = as[i].c + D4[d][1];
        if (inb(g, nr, nc) && g[nr][nc] === bg && !filled[nr * w + nc]) { filled[nr * w + nc] = 1; st.push([nr, nc]); }
      }
      var region = [], escapes = false;
      while (st.length) {
        p = st.pop(); region.push(p);
        if (p[0] === 0 || p[1] === 0 || p[0] === h - 1 || p[1] === w - 1) escapes = true;
        for (d = 0; d < nb.length; d++) {
          nr = p[0] + nb[d][0]; nc = p[1] + nb[d][1];
          if (inb(g, nr, nc) && g[nr][nc] === bg && !filled[nr * w + nc]) { filled[nr * w + nc] = 1; st.push([nr, nc]); }
        }
      }
      if (stopAtBorder && escapes) continue;
      for (d = 0; d < region.length; d++) out[region[d][0]][region[d][1]] = col;
    }
    return out;
  }
  GENS.push(function floodGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, r, c, seen = 0, si, cn, sb, ci;
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++)
      if (train[t][0][r][c] !== train[t][1][r][c]) seen |= 1 << train[t][1][r][c];
    var cols = G.csList(seen), modes = [["src", 0]].concat(cols.map(function (k) { return ["fix", k]; }));
    for (si = 0; si < RAY_SOURCES.length; si++) for (cn = 0; cn < 2; cn++) for (sb = 0; sb < 2; sb++) for (ci = 0; ci < modes.length; ci++) {
      if (ctx.timed_out()) return out;
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(floodSeeds(train[t][0], bg, RAY_SOURCES[si][1], cn === 1, modes[ci][0], modes[ci][1], sb === 1), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("flood_" + RAY_SOURCES[si][0] + (cn ? "_8" : "_4") + (sb ? "_enclosed" : "") + "_" + modes[ci][0] + modes[ci][1],
        (function (sf, c8, e, cm, fx) { return function (g) { return floodSeeds(g, bg, sf, c8, cm, fx, e); }; })(RAY_SOURCES[si][1], cn === 1, sb === 1, modes[ci][0], modes[ci][1]), 4.0));
    }
    return out;
  });

  /* every object becomes symmetric about its own bounding box */
  function symmetriseObjects(g, bg, mode, axes, mask) {
    var os = objsOf(g, bg, mode), out = copy(g), i, j, o, p, cand, k;
    for (i = 0; i < os.length; i++) {
      o = os[i]; if (o.n < 2) continue;
      for (j = 0; j < o.cells.length; j++) {
        p = o.cells[j]; cand = [];
        if (axes.indexOf("h") >= 0) cand.push([p[0], o.c0 + o.c1 - p[1]]);
        if (axes.indexOf("v") >= 0) cand.push([o.r0 + o.r1 - p[0], p[1]]);
        if (axes.indexOf("b") >= 0) cand.push([o.r0 + o.r1 - p[0], o.c0 + o.c1 - p[1]]);
        if (axes.indexOf("t") >= 0 && o.r1 - o.r0 === o.c1 - o.c0) cand.push([o.r0 + (p[1] - o.c0), o.c0 + (p[0] - o.r0)]);
        for (k = 0; k < cand.length; k++) if (inb(g, cand[k][0], cand[k][1]) && g[cand[k][0]][cand[k][1]] === bg) out[cand[k][0]][cand[k][1]] = g[p[0]][p[1]];
      }
    }
    return out;
  }
  GENS.push(function symObjGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, mi, ai, modes = ["c8", "m8", "c4"], axesList = ["h", "v", "hv", "hvb", "b", "hvbt"];
    for (mi = 0; mi < modes.length; mi++) for (ai = 0; ai < axesList.length; ai++) {
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(symmetriseObjects(train[t][0], bg, modes[mi], axesList[ai]), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("symobj_" + modes[mi] + "_" + axesList[ai], (function (m, a) { return function (g) { return symmetriseObjects(g, bg, m, a); }; })(modes[mi], axesList[ai]), 3.5));
    }
    return out;
  });

  /* cells settle against a wall, optionally only one colour moving */
  function settleCells(g, bg, dir, mover) {
    var h = g.length, w = g[0].length, out = copy(g), r, c, i, line, vals, k;
    var vertical = dir === 0 || dir === 1, n = vertical ? w : h, len = vertical ? h : w;
    for (i = 0; i < n; i++) {
      line = []; for (k = 0; k < len; k++) line.push(vertical ? g[k][i] : g[i][k]);
      /* split into segments separated by immovable cells, settle each */
      var res = line.slice(), segStart = 0;
      for (k = 0; k <= len; k++) {
        var fixedHere = k === len || (line[k] !== bg && (mover >= 10 ? line[k] === mover - 10 : (mover >= 0 && line[k] !== mover)));
        if (fixedHere) {
          var seg = []; for (var q = segStart; q < k; q++) seg.push(line[q]);
          var movers = seg.filter(function (v) { return v !== bg; }), pad = seg.length - movers.length, arr = [];
          var before = dir === 0 || dir === 2;
          for (var z = 0; z < pad; z++) arr.push(bg);
          arr = before ? movers.concat(arr) : arr.concat(movers);
          for (q = 0; q < seg.length; q++) res[segStart + q] = arr[q];
          segStart = k + 1;
        }
      }
      for (k = 0; k < len; k++) { if (vertical) out[k][i] = res[k]; else out[i][k] = res[k]; }
    }
    return out;
  }
  GENS.push(function settleGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, di, mv, movers = [-1];
    var cs = G.csList(ctx.in_palette() & ~(1 << bg)); cs.forEach(function (k) { movers.push(k); }); cs.forEach(function (k) { movers.push(10 + k); });
    for (di = 0; di < 4; di++) for (mv = 0; mv < movers.length; mv++) {
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(settleCells(train[t][0], bg, di, movers[mv]), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("settle_" + di + "_m" + movers[mv], (function (d, m) { return function (g) { return settleCells(g, bg, d, m); }; })(di, movers[mv]), 3.0 + (movers[mv] >= 0 ? 0.5 : 0)));
    }
    return out;
  });

  /* isolated pixels are noise */
  function denoise(g, bg, minSize, conn8, how) {
    var os = objsOf(g, bg, conn8 ? "c8" : "c4"), out = copy(g), i, j, o, cnt, d, nr, nc, v, best, bn;
    for (i = 0; i < os.length; i++) {
      o = os[i]; if (o.n > minSize) continue;
      if (how === "bg") { for (j = 0; j < o.cells.length; j++) out[o.cells[j][0]][o.cells[j][1]] = bg; continue; }
      for (j = 0; j < o.cells.length; j++) {
        cnt = {}; best = bg; bn = 0;
        for (d = 0; d < 8; d++) {
          nr = o.cells[j][0] + D8[d][0]; nc = o.cells[j][1] + D8[d][1];
          if (!inb(g, nr, nc)) continue;
          v = g[nr][nc]; if (v === g[o.cells[j][0]][o.cells[j][1]]) continue;
          cnt[v] = (cnt[v] || 0) + 1; if (cnt[v] > bn) { bn = cnt[v]; best = v; }
        }
        out[o.cells[j][0]][o.cells[j][1]] = best;
      }
    }
    return out;
  }
  GENS.push(function denoiseGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, ms, cn, hw;
    for (ms = 1; ms <= 4; ms++) for (cn = 0; cn < 2; cn++) for (hw = 0; hw < 2; hw++) {
      var ok = true, hows = ["bg", "majority"];
      for (t = 0; t < train.length; t++) if (!same(denoise(train[t][0], bg, ms, cn === 1, hows[hw]), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("denoise_" + ms + (cn ? "_8_" : "_4_") + hows[hw], (function (m, c, h2) { return function (g) { return denoise(g, bg, m, c, h2); }; })(ms, cn === 1, hows[hw]), 3.0));
    }
    return out;
  });


  /* --------------------------------- objects move by a rule of their class */

  function moveObjects(g, bg, mode, table, keyFn, slide) {
    var os = objsOf(g, bg, mode), out = copy(g), i, j, o, mv, moved = [], key;
    addRanks(os);
    for (i = 0; i < os.length; i++) {
      o = os[i]; key = keyFn(o);
      mv = table[key];
      if (!mv) continue;
      moved.push([o, mv]);
    }
    if (!moved.length) return out;
    /* lift every mover, then place them one by one */
    for (i = 0; i < moved.length; i++) for (j = 0; j < moved[i][0].cells.length; j++) out[moved[i][0].cells[j][0]][moved[i][0].cells[j][1]] = bg;
    if (slide) {
      /* nearest to the destination wall first so a stack keeps its order */
      moved.sort(function (a, b) {
        var da = a[1], db = b[1], pa = (da[0] > 0 ? a[0].r1 : da[0] < 0 ? -a[0].r0 : 0) + (da[1] > 0 ? a[0].c1 : da[1] < 0 ? -a[0].c0 : 0);
        var pb = (db[0] > 0 ? b[0].r1 : db[0] < 0 ? -b[0].r0 : 0) + (db[1] > 0 ? b[0].c1 : db[1] < 0 ? -b[0].c0 : 0);
        return pb - pa;
      });
    }
    for (i = 0; i < moved.length; i++) {
      o = moved[i][0]; mv = moved[i][1];
      var cells = o.cells.map(function (p) { return [p[0], p[1], g[p[0]][p[1]]]; });
      if (slide) {
        var step = 0, ok = true;
        while (step++ < 60) {
          for (j = 0; j < cells.length; j++) {
            var r = cells[j][0] + mv[0], c = cells[j][1] + mv[1];
            if (!inb(g, r, c) || out[r][c] !== bg) { ok = false; break; }
          }
          if (!ok) break;
          for (j = 0; j < cells.length; j++) { cells[j][0] += mv[0]; cells[j][1] += mv[1]; }
        }
      } else for (j = 0; j < cells.length; j++) { cells[j][0] += mv[0]; cells[j][1] += mv[1]; }
      for (j = 0; j < cells.length; j++) if (inb(g, cells[j][0], cells[j][1])) out[cells[j][0]][cells[j][1]] = cells[j][2];
    }
    return out;
  }
  var OBJ_KEYS = [
    ["color", function (o) { return o.color; }],
    ["shape", function (o) { return shapeKey(o); }],
    ["size", function (o) { return o.n; }],
    ["toprank", function (o) { return o.rank_r; }],
    ["leftrank", function (o) { return o.rank_c; }]
  ];
  /* ordinal position among the objects of the grid (ties share a rank) */
  function addRanks(os) {
    if (os.length && os[0].rank_r !== undefined) return;
    var rs = os.map(function (o) { return o.r0; }).sort(function (a, b) { return a - b; });
    var cs = os.map(function (o) { return o.c0; }).sort(function (a, b) { return a - b; });
    os.forEach(function (o) { o.rank_r = rs.indexOf(o.r0); o.rank_c = cs.indexOf(o.c0); });
  }
  GENS.push(function objMoveGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, mi, ki, slideMode, modes = ["c8", "m8", "c4"];
    /* an object cannot have moved if the input and output differ nowhere */
    if (changedCells(ctx) === 0) return [];
    for (t = 0; t < train.length; t++) if (objsOf(train[t][0], bg, "m8").length > 14) return [];
    var R = 3, dirs = [];
    var dr, dc;
    for (dr = -R; dr <= R; dr++) for (dc = -R; dc <= R; dc++) dirs.push([dr, dc]);
    for (mi = 0; mi < modes.length; mi++) for (ki = 0; ki < OBJ_KEYS.length; ki++) for (slideMode = 0; slideMode < 2; slideMode++) {
      if (ctx.timed_out()) return out;
      var keyFn = OBJ_KEYS[ki][1];
      /* candidate movement per class: intersect what each object of the class can explain */
      var cand = {};     /* key -> array of feasible moves (as strings) */
      var bad = false;
      var moves = slideMode ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : dirs;
      var o1, j, q;
      for (t = 0; t < train.length && !bad; t++) {
        var os = objsOf(train[t][0], bg, modes[mi]), gin = train[t][0], gout = train[t][1];
        addRanks(os);
        for (var oi = 0; oi < os.length; oi++) {
          o1 = os[oi]; var k = keyFn(o1), feas = [];
          /* 'stay' */
          var stays = true;
          for (j = 0; j < o1.cells.length; j++) if (gout[o1.cells[j][0]][o1.cells[j][1]] !== gin[o1.cells[j][0]][o1.cells[j][1]]) { stays = false; break; }
          if (stays) feas.push("0,0");
          if (!slideMode) {
            for (q = 0; q < moves.length; q++) {
              if (!moves[q][0] && !moves[q][1]) continue;
              var good = true;
              for (j = 0; j < o1.cells.length; j++) {
                var rr = o1.cells[j][0] + moves[q][0], cc = o1.cells[j][1] + moves[q][1];
                if (!inb(gin, rr, cc) || gout[rr][cc] !== gin[o1.cells[j][0]][o1.cells[j][1]]) { good = false; break; }
              }
              if (good) feas.push(moves[q][0] + "," + moves[q][1]);
            }
          } else {
            /* a slide's length is decided by the world; accept a direction if the object left its cell */
            for (q = 0; q < moves.length; q++) feas.push(moves[q][0] + "," + moves[q][1]);
          }
          if (!feas.length) { bad = true; break; }
          if (!cand[k]) cand[k] = feas;
          else cand[k] = cand[k].filter(function (x) { return feas.indexOf(x) >= 0; });
          if (!cand[k].length) { bad = true; break; }
        }
      }
      if (bad) continue;
      /* build tables from the first feasible move per class, preferring 'stay' last */
      var keys = Object.keys(cand), table = {}, anyMove = false;
      var variants = [0, 1];
      var ok = true;
      /* enumerate choices for classes with several candidates (bounded) */
      var combos = [{}], ki2;
      for (ki2 = 0; ki2 < keys.length; ki2++) {
        var nxt = [], opts = cand[keys[ki2]].slice(0, 6);
        for (var ci = 0; ci < combos.length; ci++) for (var oo = 0; oo < opts.length; oo++) {
          var cp = {}; for (var kk in combos[ci]) cp[kk] = combos[ci][kk];
          cp[keys[ki2]] = opts[oo]; nxt.push(cp);
        }
        combos = nxt.slice(0, 64);
      }
      for (var cb = 0; cb < combos.length; cb++) {
        table = {}; anyMove = false;
        for (var kk2 in combos[cb]) { var sv = combos[cb][kk2].split(",").map(Number); if (sv[0] || sv[1]) { table[kk2] = sv; anyMove = true; } }
        if (!anyMove) continue;
        ok = true;
        for (t = 0; t < train.length; t++) if (!same(moveObjects(train[t][0], bg, modes[mi], table, keyFn, slideMode === 1), train[t][1])) { ok = false; break; }
        if (ok) {
          out.push(_h("objmove_" + modes[mi] + "_" + OBJ_KEYS[ki][0] + (slideMode ? "_slide" : "_shift"),
            (function (m, tb, kf, sl) { return function (g) { return moveObjects(g, bg, m, tb, kf, sl); }; })(modes[mi], table, keyFn, slideMode === 1), 4.0 + (Object.keys(table).length > 3 ? 1 : 0) + 1.5));
          break;
        }
      }
    }
    return out;
  });

  /* ------------------------------------ marks joined by lines, with overlay */

  function connectMarks(g, bg, c, dirNames, table) {
    var C = comps8(g, bg), marks = [], i, out = copy(g), d, di, k;
    for (i = 0; i < C.list.length; i++) if (C.list[i].length === 1 && g[C.list[i][0][0]][C.list[i][0][1]] === c) marks.push(C.list[i][0]);
    if (marks.length < 2) return null;
    for (di = 0; di < dirNames.length; di++) {
      d = LINE_DIRS[dirNames[di]];
      for (i = 0; i < marks.length; i++) {
        /* the next mark along this direction */
        var r = marks[i][0] + d[0], cc = marks[i][1] + d[1], path = [];
        while (inb(g, r, cc)) {
          if (g[r][cc] === c && C.id[r][cc] >= 0 && C.list[C.id[r][cc]].length === 1) {
            for (k = 0; k < path.length; k++) {
              var old = g[path[k][0]][path[k][1]], nv = table[old];
              out[path[k][0]][path[k][1]] = nv === undefined ? old : nv;
            }
            break;
          }
          path.push([r, cc]); r += d[0]; cc += d[1];
        }
      }
    }
    return out;
  }
  GENS.push(function connectGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, c, subset, i, names = ["h", "v", "d1", "d2"];
    if (changedCells(ctx) === 0) return [];
    for (c = 0; c < 10; c++) {
      if (c === bg) continue;
      /* learn old -> new on the cells the demonstrations changed under a line between marks */
      for (subset = 1; subset < 16; subset++) {
        var dn = []; for (i = 0; i < 4; i++) if (subset & (1 << i)) dn.push(names[i]);
        var base = connectMarks(train[0][0], bg, c, dn, {});
        if (!base) continue;
        var table = {}, bad = false, r, cc;
        for (t = 0; t < train.length && !bad; t++) {
          var b2 = connectMarks(train[t][0], bg, c, dn, { __all: 0 });
          /* cells a line would cover: mark them with a sentinel table that changes everything */
          var probe = connectMarks(train[t][0], bg, c, dn, (function () { var m = {}, v; for (v = 0; v < 10; v++) m[v] = 10; return m; })());
          if (!probe) { bad = true; break; }
          for (r = 0; r < probe.length && !bad; r++) for (cc = 0; cc < probe[0].length; cc++) {
            if (probe[r][cc] === 10) {
              var old = train[t][0][r][cc], nv = train[t][1][r][cc];
              if (table[old] !== undefined && table[old] !== nv) { bad = true; break; }
              table[old] = nv;
            }
          }
        }
        if (bad) continue;
        var ok = true;
        for (t = 0; t < train.length; t++) { var p = connectMarks(train[t][0], bg, c, dn, table); if (!p || !same(p, train[t][1])) { ok = false; break; } }
        if (ok) out.push(_h("connect_c" + c + "_" + dn.join(""), (function (cc2, dd, tb) { return function (g) { return connectMarks(g, bg, cc2, dd, tb); }; })(c, dn, table), 4.0));
      }
    }
    return out;
  });


  /* ----------------------------------------- a grid built from its own cells */

  var DIH = G.DIHEDRAL;
  function tileKron(g, bg, sel, opIdx, colorMode, fgInvert) {
    var h = g.length, w = g[0].length;
    if (h * h > 60 || w * w > 60) return null;
    var T = DIH[opIdx][1](g);
    if (T.length !== h || T[0].length !== w) return null;
    var out = G.constGrid(h * h, w * w, bg), i, j, r, c, v, col;
    /* the two colours of the pattern, for inversion */
    var cs = G.csList(G.palette(g)), other = -1;
    if (fgInvert) { if (cs.length !== 2) return null; }
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) {
      v = g[i][j];
      var on = sel === "fg" ? v !== bg : v === bg;
      if (!on) continue;
      for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
        col = T[r][c];
        if (fgInvert) col = col === cs[0] ? cs[1] : cs[0];
        if (colorMode === "cell" && col !== bg) col = v;
        out[i * h + r][j * w + c] = col;
      }
    }
    return out;
  }
  GENS.push(function kronGen(ctx) {
    var ratio = ctx.shape_ratio();
    if (!ratio) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, si, oi, cm, inv, sels = ["fg", "bg"];
    for (si = 0; si < 2; si++) for (oi = 0; oi < 8; oi++) for (cm = 0; cm < 2; cm++) for (inv = 0; inv < 2; inv++) {
      var ok = true;
      for (t = 0; t < train.length; t++) {
        var p = tileKron(train[t][0], bg, sels[si], oi, cm ? "cell" : "keep", inv === 1);
        if (!p || !same(p, train[t][1])) { ok = false; break; }
      }
      if (ok) out.push(_h("kron_" + sels[si] + "_" + DIH[oi][0] + (cm ? "_cellcolor" : "") + (inv ? "_inv" : ""),
        (function (s2, o2, c2, i2) { return function (g) { return tileKron(g, bg, s2, o2, c2 ? "cell" : "keep", i2 === 1); }; })(sels[si], oi, cm, inv), 3.5));
    }
    return out;
  });

  /* the grid next to a transformed, recoloured copy of itself */
  function selfConcat(g, arr, opIdx, cmap) {
    var T = DIH[opIdx][1](g);
    if (cmap) T = G.applyCmap(T, cmap);
    var horiz = arr.charAt(0) === "h", first = arr.charAt(1) === "a";
    var A = first ? g : T, B = first ? T : g;
    if (horiz) { if (A.length !== B.length) return null; return A.map(function (row, i) { return row.concat(B[i]); }); }
    if (A[0].length !== B[0].length) return null;
    return A.concat(B);
  }
  GENS.push(function selfConcatGen(ctx) {
    var train = ctx.train, out = [], t, ai, oi, arrs = ["ha", "hb", "va", "vb"], ok;
    for (t = 0; t < train.length; t++) {
      var a = train[t][0], b = train[t][1];
      if (!((b.length === a.length && b[0].length === 2 * a[0].length) || (b.length === 2 * a.length && b[0].length === a[0].length))) return [];
    }
    for (ai = 0; ai < arrs.length; ai++) for (oi = 0; oi < 8; oi++) {
      var geo = selfConcat(train[0][0], arrs[ai], oi, null);
      if (!geo || geo.length !== train[0][1].length || geo[0].length !== train[0][1][0].length) continue;
      /* derive the colour map from every pair, on the transformed half only */
      var cmap = {}, bad = false, r, c;
      for (t = 0; t < train.length && !bad; t++) {
        var g0 = train[t][0], o0 = train[t][1], Tg = DIH[oi][1](g0), h = g0.length, w = g0[0].length, horiz = arrs[ai].charAt(0) === "h", firstA = arrs[ai].charAt(1) === "a";
        var r0 = horiz ? 0 : (firstA ? h : 0), c0 = horiz ? (firstA ? w : 0) : 0;
        if (Tg.length !== h || Tg[0].length !== w) { bad = true; break; }
        for (r = 0; r < h && !bad; r++) for (c = 0; c < w; c++) {
          var src = Tg[r][c], dst = o0[r0 + r][c0 + c];
          if (cmap[src] !== undefined && cmap[src] !== dst) { bad = true; break; }
          cmap[src] = dst;
        }
      }
      if (bad) continue;
      ok = true;
      for (t = 0; t < train.length; t++) { var p = selfConcat(train[t][0], arrs[ai], oi, cmap); if (!p || !same(p, train[t][1])) { ok = false; break; } }
      if (ok) out.push(_h("selfconcat_" + arrs[ai] + "_" + DIH[oi][0], (function (a2, o2, m2) { return function (g) { return selfConcat(g, a2, o2, m2); }; })(arrs[ai], oi, cmap), 3.5));
    }
    return out;
  });


  /* ------------------------------ mirror copies, walls, empty rectangles */

  function mirrorObjects(g, bg, mode, sides) {
    var os = objsOf(g, bg, mode), out = copy(g), i, j, o, s, p, hasH, hasV, nr, nc;
    for (i = 0; i < os.length; i++) {
      o = os[i];
      for (j = 0; j < o.cells.length; j++) {
        p = o.cells[j];
        var v = g[p[0]][p[1]];
        var rr = {}, list = [];
        if (sides.indexOf("r") >= 0) list.push([p[0], 2 * o.c1 + 1 - p[1]]);
        if (sides.indexOf("l") >= 0) list.push([p[0], 2 * o.c0 - 1 - p[1]]);
        if (sides.indexOf("d") >= 0) list.push([2 * o.r1 + 1 - p[0], p[1]]);
        if (sides.indexOf("u") >= 0) list.push([2 * o.r0 - 1 - p[0], p[1]]);
        var hs = sides.indexOf("r") >= 0 ? 2 * o.c1 + 1 - p[1] : sides.indexOf("l") >= 0 ? 2 * o.c0 - 1 - p[1] : null;
        var vs = sides.indexOf("d") >= 0 ? 2 * o.r1 + 1 - p[0] : sides.indexOf("u") >= 0 ? 2 * o.r0 - 1 - p[0] : null;
        if (hs !== null && vs !== null && sides.length > 2) list.push([vs, hs]);
        for (s = 0; s < list.length; s++) if (inb(g, list[s][0], list[s][1]) && out[list[s][0]][list[s][1]] === bg) out[list[s][0]][list[s][1]] = v;
      }
    }
    return out;
  }
  GENS.push(function mirrorBesideGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, mi, sub, modes = ["c8", "m8"], i;
    var names = ["r", "l", "d", "u"];
    for (mi = 0; mi < modes.length; mi++) for (sub = 1; sub < 16; sub++) {
      var sd = ""; for (i = 0; i < 4; i++) if (sub & (1 << i)) sd += names[i];
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(mirrorObjects(train[t][0], bg, modes[mi], sd), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("mirror_" + modes[mi] + "_" + sd, (function (m, sdd) { return function (g) { return mirrorObjects(g, bg, m, sdd); }; })(modes[mi], sd), 3.5 + 0.2 * sd.length));
    }
    return out;
  });

  /* objects travel to a wall (or corner) of the grid */
  function toWalls(g, bg, mode, dirs) {
    var os = objsOf(g, bg, mode), out = G.constGrid(g.length, g[0].length, bg), i, j, o, dr, dc, h = g.length, w = g[0].length;
    for (i = 0; i < os.length; i++) {
      o = os[i]; dr = 0; dc = 0;
      if (dirs.indexOf("u") >= 0) dr = -o.r0;
      if (dirs.indexOf("d") >= 0) dr = h - 1 - o.r1;
      if (dirs.indexOf("l") >= 0) dc = -o.c0;
      if (dirs.indexOf("r") >= 0) dc = w - 1 - o.c1;
      for (j = 0; j < o.cells.length; j++) out[o.cells[j][0] + dr][o.cells[j][1] + dc] = g[o.cells[j][0]][o.cells[j][1]];
    }
    return out;
  }
  GENS.push(function wallsGen(ctx) {
    if (!ctx.same_shape() || changedCells(ctx) === 0) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, mi, dsl = ["u", "d", "l", "r", "ul", "ur", "dl", "dr"], di, modes = ["c8", "m8"];
    for (t = 0; t < train.length; t++) if (objsOf(train[t][0], bg, "m8").length > 6) return [];
    for (mi = 0; mi < modes.length; mi++) for (di = 0; di < dsl.length; di++) {
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(toWalls(train[t][0], bg, modes[mi], dsl[di]), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("walls_" + modes[mi] + "_" + dsl[di], (function (m, d) { return function (g) { return toWalls(g, bg, m, d); }; })(modes[mi], dsl[di]), 4.0));
    }
    return out;
  });

  /* the biggest rectangle (or square) of background */
  function biggestEmpty(g, bg, square, color, allTies, shrink, minSide) {
    shrink = shrink || 0; minSide = minSide || 1;
    var h = g.length, w = g[0].length;
    if (h * w > 900) return null;
    var P = [], r, c;
    for (r = 0; r <= h; r++) P.push(new Int32Array(w + 1));
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) P[r + 1][c + 1] = P[r][c + 1] + P[r + 1][c] - P[r][c] + (g[r][c] !== bg ? 1 : 0);
    var best = 0, rects = [], r1, c1, r2, c2;
    for (r1 = 0; r1 < h; r1++) for (c1 = 0; c1 < w; c1++) {
      if (g[r1][c1] !== bg) continue;
      for (r2 = r1; r2 < h; r2++) {
        if (g[r2][c1] !== bg) break;
        for (c2 = c1; c2 < w; c2++) {
          if (P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1] !== 0) break;
          if (square && r2 - r1 !== c2 - c1) continue;
          if (Math.min(r2 - r1, c2 - c1) + 1 < minSide) continue;
          var ar = (r2 - r1 + 1) * (c2 - c1 + 1);
          if (ar > best) { best = ar; rects = [[r1, c1, r2, c2]]; } else if (ar === best) rects.push([r1, c1, r2, c2]);
        }
      }
    }
    if (!best || (rects.length > 1 && !allTies)) return null;
    var out = copy(g), k;
    for (k = 0; k < rects.length; k++) {
      if (rects[k][0] + shrink > rects[k][2] - shrink || rects[k][1] + shrink > rects[k][3] - shrink) return null;
      for (r = rects[k][0] + shrink; r <= rects[k][2] - shrink; r++) for (c = rects[k][1] + shrink; c <= rects[k][3] - shrink; c++) out[r][c] = color;
    }
    return out;
  }
  /* the colour a region is "empty" in need not be the grid background: learn it
     from what the demonstrations painted over */
  function paintedOver(ctx) {
    var train = ctx.train, t, r, c, from = -1, to = -1;
    if (!ctx.same_shape()) return null;
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++)
      if (train[t][0][r][c] !== train[t][1][r][c]) {
        if (from < 0) { from = train[t][0][r][c]; to = train[t][1][r][c]; }
        else if (from !== train[t][0][r][c] || to !== train[t][1][r][c]) return null;
      }
    return from < 0 ? null : { from: from, to: to };
  }
  GENS.push(function emptyRectGen(ctx) {
    var po = paintedOver(ctx);
    if (!po) return [];
    var train = ctx.train, out = [], t, sq;
    for (sq = 0; sq < 2; sq++) for (var sh = 0; sh < 2; sh++) for (var ms = 1; ms <= 2; ms++) {
      var ok = true;
      for (t = 0; t < train.length; t++) { var p = biggestEmpty(train[t][0], po.from, sq === 1, po.to, false, sh, ms); if (!p || !same(p, train[t][1])) { ok = false; break; } }
      if (ok) out.push(_h("emptyrect_" + (sq ? "square" : "rect") + (sh ? "_inner" : "") + (ms > 1 ? "_min" + ms : ""), (function (s2, h2, m2) { return function (g) { return biggestEmpty(g, po.from, s2 === 1, po.to, false, h2, m2); }; })(sq, sh, ms), 4.0 + sh * 0.3 + (ms > 1 ? 0.3 : 0)));
    }
    return out;
  });

  /* every empty cell lying in an all-empty block of at least kh x kw */
  function blockCells(g, e, kh, kw, color) {
    var h = g.length, w = g[0].length, out = copy(g), r, c, i, j, ok;
    for (r = 0; r + kh <= h; r++) for (c = 0; c + kw <= w; c++) {
      ok = true;
      for (i = 0; i < kh && ok; i++) for (j = 0; j < kw; j++) if (g[r + i][c + j] !== e) { ok = false; break; }
      if (ok) for (i = 0; i < kh; i++) for (j = 0; j < kw; j++) out[r + i][c + j] = color;
    }
    return out;
  }
  GENS.push(function blockFillGen(ctx) {
    var po = paintedOver(ctx);
    if (!po) return [];
    var train = ctx.train, out = [], t, kh, kw;
    for (kh = 2; kh <= 4; kh++) for (kw = kh; kw <= 4; kw++) {
      if (ctx.timed_out()) return out;
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(blockCells(train[t][0], po.from, kh, kw, po.to), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("blocks_" + kh + "x" + kw, (function (a, b2) { return function (g) { return blockCells(g, po.from, a, b2, po.to); }; })(kh, kw), 4.0));
      if (kw !== kh) {
        ok = true;
        for (t = 0; t < train.length; t++) if (!same(blockCells(train[t][0], po.from, kw, kh, po.to), train[t][1])) { ok = false; break; }
        if (ok) out.push(_h("blocks_" + kw + "x" + kh, (function (a, b2) { return function (g) { return blockCells(g, po.from, a, b2, po.to); }; })(kw, kh), 4.0));
      }
    }
    return out;
  });

  /* rows / columns that are empty from wall to wall */
  function emptyLines(g, bg, rows, cols, color) {
    var h = g.length, w = g[0].length, out = copy(g), r, c, ok, n;
    if (rows) for (r = 0; r < h; r++) {
      ok = true; n = 0;
      for (c = 1; c < w - 1; c++) if (g[r][c] !== bg) { ok = false; break; }
      if (ok && g[r][0] !== bg && g[r][w - 1] !== bg) for (c = 1; c < w - 1; c++) out[r][c] = color;
    }
    if (cols) for (c = 0; c < w; c++) {
      ok = true;
      for (r = 1; r < h - 1; r++) if (g[r][c] !== bg) { ok = false; break; }
      if (ok && g[0][c] !== bg && g[h - 1][c] !== bg) for (r = 1; r < h - 1; r++) if (out[r][c] === bg) out[r][c] = color;
    }
    return out;
  }
  GENS.push(function emptyLinesGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, r, c, seen = 0, mode;
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++) if (train[t][0][r][c] !== train[t][1][r][c]) seen |= 1 << train[t][1][r][c];
    var cols = G.csList(seen); if (cols.length !== 1) return [];
    for (mode = 1; mode < 4; mode++) {
      var ok = true;
      for (t = 0; t < train.length; t++) if (!same(emptyLines(train[t][0], bg, (mode & 1) === 1, (mode & 2) === 2, cols[0]), train[t][1])) { ok = false; break; }
      if (ok) out.push(_h("emptylines_" + mode, (function (m) { return function (g) { return emptyLines(g, bg, (m & 1) === 1, (m & 2) === 2, cols[0]); }; })(mode), 4.0));
    }
    return out;
  });


  /* ------------------------------------ stripes and lattices */

  /* marks fix a period; the pattern of their colours repeats across the grid */
  function stripes(g, bg, axis, dirSign, full) {
    var h = g.length, w = g[0].length, marks = [], r, c, out = copy(g), i, k;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) if (g[r][c] !== bg) marks.push([r, c, g[r][c]]);
    if (marks.length < 2 || marks.length > 6) return null;
    var key = axis === "col" ? 1 : 0, ortho = 1 - key;
    marks.sort(function (a, b) { return a[key] - b[key]; });
    for (i = 1; i < marks.length; i++) if (marks[i][key] === marks[i - 1][key]) return null;
    var d = marks[1][key] - marks[0][key], n = marks.length, size = axis === "col" ? w : h;
    for (i = 1; i < n; i++) if (marks[i][key] - marks[i - 1][key] !== d) return null;
    var start = dirSign > 0 ? marks[0][key] : marks[n - 1][key];
    for (k = 0; ; k++) {
      var pos = start + dirSign * d * k;
      if (pos < 0 || pos >= size) break;
      var col = marks[dirSign > 0 ? k % n : (n - 1 - (k % n))][2];
      if (axis === "col") { for (r = 0; r < h; r++) if (full || g[r][pos] === bg) out[r][pos] = col; }
      else { for (c = 0; c < w; c++) if (full || g[pos][c] === bg) out[pos][c] = col; }
    }
    return out;
  }
  GENS.push(function stripesGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, ai, di, axes = ["col", "row"], dirs = [1, -1];
    for (ai = 0; ai < 2; ai++) for (di = 0; di < 2; di++) {
      var ok = true;
      for (t = 0; t < train.length; t++) { var p = stripes(train[t][0], bg, axes[ai], dirs[di], true); if (!p || !same(p, train[t][1])) { ok = false; break; } }
      if (ok) out.push(_h("stripes_" + axes[ai] + (dirs[di] > 0 ? "_fwd" : "_back"), (function (a, d) { return function (g) { return stripes(g, bg, a, d, true); }; })(axes[ai], dirs[di]), 4.0));
    }
    return out;
  });

  /* cells of a separator-ruled lattice, recoloured by where they sit (first, middle, last) */
  function latticeCells(g, bg) {
    var dv = dividers(g, bg), h = g.length, w = g[0].length, rowsAt = dv.rows, colsAt = dv.cols;
    if (!rowsAt.length && !colsAt.length) return null;
    function spans(seps, n) {
      var out = [], start = 0, i;
      for (i = 0; i <= seps.length; i++) { var end = i < seps.length ? seps[i] - 1 : n - 1; if (end >= start) out.push([start, end]); start = (i < seps.length ? seps[i] + 1 : n); }
      return out;
    }
    var rs = spans(rowsAt, h), cs = spans(colsAt, w);
    if (rs.length * cs.length < 4 || rs.length * cs.length > 120) return null;
    return { rs: rs, cs: cs };
  }
  function posClass(i, n) { return i === 0 ? (n === 1 ? "o" : "f") : i === n - 1 ? "l" : (n % 2 === 1 && i === (n - 1) / 2 ? "m" : "x"); }
  function latticePaint(g, bg, table, onlyEmpty) {
    var L = latticeCells(g, bg);
    if (!L) return null;
    var out = copy(g), i, j, r, c;
    for (i = 0; i < L.rs.length; i++) for (j = 0; j < L.cs.length; j++) {
      var col = table[posClass(i, L.rs.length) + posClass(j, L.cs.length)];
      if (col === undefined) continue;
      for (r = L.rs[i][0]; r <= L.rs[i][1]; r++) for (c = L.cs[j][0]; c <= L.cs[j][1]; c++) if (!onlyEmpty || g[r][c] === bg) out[r][c] = col;
    }
    return out;
  }
  GENS.push(function latticeClassGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, i, j, r, c, table = {}, bad = false;
    for (t = 0; t < train.length && !bad; t++) {
      var L = latticeCells(train[t][0], bg);
      if (!L) return [];
      for (i = 0; i < L.rs.length && !bad; i++) for (j = 0; j < L.cs.length && !bad; j++) {
        var key = posClass(i, L.rs.length) + posClass(j, L.cs.length), col = null;
        for (r = L.rs[i][0]; r <= L.rs[i][1] && !bad; r++) for (c = L.cs[j][0]; c <= L.cs[j][1]; c++) {
          if (train[t][0][r][c] !== bg) continue;
          var v = train[t][1][r][c];
          if (col === null) col = v; else if (col !== v) { bad = true; break; }
        }
        if (col === null) continue;
        if (table[key] !== undefined && table[key] !== col) bad = true; else table[key] = col;
      }
    }
    if (bad) return [];
    var any = false, k; for (k in table) if (table[k] !== bg) any = true;
    if (!any) return [];
    for (t = 0; t < train.length; t++) { var p = latticePaint(train[t][0], bg, table, true); if (!p || !same(p, train[t][1])) return []; }
    return [_h("lattice_class", function (g) { return latticePaint(g, bg, table, true); }, 4.5)];
  });


  /* ------------------------------ regions, ranks and centres */

  (function () {
    function S(name, f) { SELECTORS.push([name, f]); }
    function rankSel(name, keyFn, wantFromEnd, parity) {
      S(name, function (os) {
        var idx = os.map(function (o, i) { return i; }).sort(function (a, b) { return keyFn(os[a]) - keyFn(os[b]) || a - b; });
        var rank = new Array(os.length), i;
        for (i = 0; i < idx.length; i++) rank[idx[i]] = wantFromEnd ? idx.length - 1 - i : i;
        return os.map(function (o, k) { return rank[k] % 2 === parity; });
      });
    }
    rankSel("col_even", function (o) { return o.c0; }, false, 0); rankSel("col_odd", function (o) { return o.c0; }, false, 1);
    rankSel("colr_even", function (o) { return o.c0; }, true, 0); rankSel("colr_odd", function (o) { return o.c0; }, true, 1);
    rankSel("row_even", function (o) { return o.r0; }, false, 0); rankSel("row_odd", function (o) { return o.r0; }, false, 1);
    rankSel("rowr_even", function (o) { return o.r0; }, true, 0); rankSel("rowr_odd", function (o) { return o.r0; }, true, 1);
  })();
  GENS.push(function recolorSelectedGen(ctx) {
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, mi, si, k, cols = [], modes = ["c8", "m8", "c4"], seen = 0, r, c;
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++)
      if (train[t][0][r][c] !== train[t][1][r][c]) { if (train[t][0][r][c] === bg) return []; seen |= 1 << train[t][1][r][c]; }
    cols = G.csList(seen); if (cols.length !== 1 || cols[0] === bg) return [];
    function paintSel(g, m, sf) {
      var os = objsOf(g, bg, m), fl = sf(os, g, bg), o = copy(g), i, j;
      for (i = 0; i < os.length; i++) if (fl[i]) for (j = 0; j < os[i].cells.length; j++) o[os[i].cells[j][0]][os[i].cells[j][1]] = cols[0];
      return o;
    }
    for (mi = 0; mi < modes.length; mi++) {
      var seenVec = {};
      for (si = 0; si < SELECTORS.length; si++) {
        if (ctx.timed_out()) return out;
        var vec = "", nz = 0;
        for (t = 0; t < train.length; t++) { var os = objsOf(train[t][0], bg, modes[mi]), fl = SELECTORS[si][1](os, train[t][0], bg), q; for (q = 0; q < fl.length; q++) { vec += fl[q] ? "1" : "0"; if (fl[q]) nz++; } vec += "|"; }
        if (!nz || seenVec[vec]) continue; seenVec[vec] = 1;
        var ok = true;
        for (t = 0; t < train.length; t++) if (!same(paintSel(train[t][0], modes[mi], SELECTORS[si][1]), train[t][1])) { ok = false; break; }
        if (ok) out.push(_h("recolorsel_" + modes[mi] + "_" + SELECTORS[si][0], (function (m, sf) { return function (g) { return paintSel(g, m, sf); }; })(modes[mi], SELECTORS[si][1]), 4.0));
      }
    }
    return out;
  });

  /* background regions coloured by a property of the region */
  function bgRegions(g, bg, conn8) {
    var h = g.length, w = g[0].length, id = [], regs = [], r, c, d, nb = conn8 ? D8 : D4, p, nr, nc;
    for (r = 0; r < h; r++) { id.push(new Int32Array(w).fill(-1)); }
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (g[r][c] !== bg || id[r][c] >= 0) continue;
      var st = [[r, c]], cells = [], border = false; id[r][c] = regs.length;
      while (st.length) {
        p = st.pop(); cells.push(p);
        if (p[0] === 0 || p[1] === 0 || p[0] === h - 1 || p[1] === w - 1) border = true;
        for (d = 0; d < nb.length; d++) {
          nr = p[0] + nb[d][0]; nc = p[1] + nb[d][1];
          if (inb(g, nr, nc) && g[nr][nc] === bg && id[nr][nc] < 0) { id[nr][nc] = regs.length; st.push([nr, nc]); }
        }
      }
      regs.push({ cells: cells, n: cells.length, border: border });
    }
    return regs;
  }
  var REGION_KEYS = [
    ["sizerank", function (rg, all) { var mx = 0, mn = 1e9, i; for (i = 0; i < all.length; i++) { mx = Math.max(mx, all[i].n); mn = Math.min(mn, all[i].n); } return rg.n === mx && rg.n !== mn ? "max" : rg.n === mn && rg.n !== mx ? "min" : "mid"; }],
    ["size", function (rg) { return rg.n; }],
    ["border", function (rg) { return rg.border ? 1 : 0; }],
    ["sizerank_enclosed", function (rg, all) { if (rg.border) return "b"; var mx = 0, mn = 1e9, i; for (i = 0; i < all.length; i++) if (!all[i].border) { mx = Math.max(mx, all[i].n); mn = Math.min(mn, all[i].n); } return rg.n === mx && rg.n !== mn ? "max" : rg.n === mn && rg.n !== mx ? "min" : "mid"; }],
    ["evensize", function (rg) { return rg.n % 2; }],
    ["rect", function (rg) { var r0 = 99, r1 = -1, c0 = 99, c1 = -1, i; for (i = 0; i < rg.cells.length; i++) { r0 = Math.min(r0, rg.cells[i][0]); r1 = Math.max(r1, rg.cells[i][0]); c0 = Math.min(c0, rg.cells[i][1]); c1 = Math.max(c1, rg.cells[i][1]); } return (r1 - r0 + 1) * (c1 - c0 + 1) === rg.n ? 1 : 0; }]
  ];
  GENS.push(function regionTableGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, ki, c8, i, j;
    for (c8 = 0; c8 < 2; c8++) for (ki = 0; ki < REGION_KEYS.length; ki++) {
      var table = {}, bad = false;
      for (t = 0; t < train.length && !bad; t++) {
        var regs = bgRegions(train[t][0], bg, c8 === 1);
        for (i = 0; i < regs.length && !bad; i++) {
          var key = REGION_KEYS[ki][1](regs[i], regs), cells = regs[i].cells, col = train[t][1][cells[0][0]][cells[0][1]];
          for (j = 1; j < cells.length; j++) if (train[t][1][cells[j][0]][cells[j][1]] !== col) { bad = true; break; }
          if (bad) break;
          if (table[key] !== undefined && table[key] !== col) { bad = true; break; }
          table[key] = col;
        }
      }
      if (bad) continue;
      var any = false, kk; for (kk in table) if (table[kk] !== bg) any = true;
      if (!any) continue;
      out.push(_h("regions_" + (c8 ? "8_" : "4_") + REGION_KEYS[ki][0], (function (tb, kf, c88) {
        return function (g) {
          var o = copy(g), regs = bgRegions(g, bg, c88), a, b, col2;
          for (a = 0; a < regs.length; a++) {
            col2 = tb[kf(regs[a], regs)];
            if (col2 === undefined) continue;
            for (b = 0; b < regs[a].cells.length; b++) o[regs[a].cells[b][0]][regs[a].cells[b][1]] = col2;
          }
          return o;
        };
      })(table, REGION_KEYS[ki][1], c8 === 1), 4.0 + (REGION_KEYS[ki][0] === "size" ? 1.0 : 0)));
    }
    return out;
  });

  /* line between the centres of aligned objects */
  function connectCenters(g, bg, mode, dirNames, color, sameColor) {
    var os = objsOf(g, bg, mode), cs = [], i, j, o, out = copy(g), di, d;
    for (i = 0; i < os.length; i++) { o = os[i]; if ((o.r0 + o.r1) % 2 || (o.c0 + o.c1) % 2 || o.n < 2) continue; cs.push({ r: (o.r0 + o.r1) / 2, c: (o.c0 + o.c1) / 2, col: o.color }); }
    if (cs.length < 2) return null;
    for (i = 0; i < cs.length; i++) for (j = 0; j < cs.length; j++) {
      if (i === j) continue;
      for (di = 0; di < dirNames.length; di++) {
        d = LINE_DIRS[dirNames[di]];
        var dr = cs[j].r - cs[i].r, dc = cs[j].c - cs[i].c;
        var steps = d[0] ? dr / d[0] : (d[1] ? dc / d[1] : 0);
        if (steps <= 1 || dr !== d[0] * steps || dc !== d[1] * steps) continue;
        if (sameColor && cs[i].col !== cs[j].col) continue;
        var k;
        for (k = 1; k < steps; k++) if (g[cs[i].r + d[0] * k][cs[i].c + d[1] * k] === bg) out[cs[i].r + d[0] * k][cs[i].c + d[1] * k] = color;
      }
    }
    return out;
  }
  GENS.push(function connectCentersGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, seen = 0, r, c, subset, i, names = ["h", "v", "d1", "d2"], mi, sc, modes = ["c8", "m8"];
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++) if (train[t][0][r][c] !== train[t][1][r][c]) seen |= 1 << train[t][1][r][c];
    var cols = G.csList(seen); if (cols.length !== 1) return [];
    for (mi = 0; mi < modes.length; mi++) for (subset = 1; subset < 16; subset++) for (sc = 0; sc < 2; sc++) {
      var dn = []; for (i = 0; i < 4; i++) if (subset & (1 << i)) dn.push(names[i]);
      var ok = true;
      for (t = 0; t < train.length; t++) { var p = connectCenters(train[t][0], bg, modes[mi], dn, cols[0], sc === 1); if (!p || !same(p, train[t][1])) { ok = false; break; } }
      if (ok) out.push(_h("centres_" + modes[mi] + "_" + dn.join("") + (sc ? "_same" : ""), (function (m, dd, s2) { return function (g) { return connectCenters(g, bg, m, dd, cols[0], s2 === 1) || copy(g); }; })(modes[mi], dn, sc), 4.0));
    }
    return out;
  });


  /* ------------------------------------------ frames, rings and legends */

  /* hollow rectangles: an 8-connected object whose bounding box border is all its own */
  function frames(g, bg) {
    var os = objsOf(g, bg, "c8"), out = [], i, o, r, c, ok;
    for (i = 0; i < os.length; i++) {
      o = os[i]; if (o.r1 - o.r0 < 2 || o.c1 - o.c0 < 2) continue;
      ok = true;
      for (r = o.r0; r <= o.r1 && ok; r++) for (c = o.c0; c <= o.c1; c++) {
        var edge = r === o.r0 || r === o.r1 || c === o.c0 || c === o.c1;
        if (edge && g[r][c] !== o.color) { ok = false; break; }
      }
      if (ok) out.push(o);
    }
    return out;
  }
  function ringFill(g, bg, cycle) {
    var fs = frames(g, bg), out = copy(g), i, f, r, c, d;
    if (!fs.length) return null;
    for (i = 0; i < fs.length; i++) {
      f = fs[i];
      for (r = f.r0 + 1; r < f.r1; r++) for (c = f.c0 + 1; c < f.c1; c++) {
        if (g[r][c] !== bg) continue;
        d = Math.min(r - f.r0, f.r1 - r, c - f.c0, f.c1 - c);
        var col = cycle[(d - 1) % cycle.length];
        if (col === -1) col = f.color;
        out[r][c] = col;
      }
    }
    return out;
  }
  GENS.push(function ringFillGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, p, L, r, c;
    var fs0 = frames(train[0][0], bg);
    if (!fs0.length) return [];
    /* read the layer colours off the first demonstration, innermost last */
    var f = fs0[0], layers = [], maxD = Math.floor((Math.min(f.r1 - f.r0, f.c1 - f.c0)) / 2);
    for (var d = 1; d <= maxD; d++) {
      var v = train[0][1][f.r0 + d][f.c0 + d];
      layers.push(v === f.color ? -1 : v);
    }
    for (p = 1; p <= Math.min(4, layers.length); p++) {
      var cyc = layers.slice(0, p), ok = true;
      for (t = 0; t < train.length && ok; t++) { var q = ringFill(train[t][0], bg, cyc); if (!q || !same(q, train[t][1])) ok = false; }
      if (ok) { out.push(_h("rings_p" + p, (function (cy) { return function (g) { return ringFill(g, bg, cy); }; })(cyc), 4.0 + 0.2 * p)); break; }
    }
    return out;
  });

  function fillFrame(g, bg, color, skipBox) {
    var fs = frames(g, bg), out = copy(g), i, f, r, c, rr, cc;
    if (!fs.length) return null;
    for (i = 0; i < fs.length; i++) {
      f = fs[i];
      var br0 = 99, bc0 = 99, br1 = -1, bc1 = -1;
      if (skipBox) for (r = f.r0 + 1; r < f.r1; r++) for (c = f.c0 + 1; c < f.c1; c++) if (g[r][c] !== bg) { br0 = Math.min(br0, r); br1 = Math.max(br1, r); bc0 = Math.min(bc0, c); bc1 = Math.max(bc1, c); }
      for (r = f.r0 + 1; r < f.r1; r++) for (c = f.c0 + 1; c < f.c1; c++) {
        if (g[r][c] !== bg) continue;
        if (skipBox && r >= br0 && r <= br1 && c >= bc0 && c <= bc1) continue;
        out[r][c] = color;
      }
    }
    return out;
  }
  GENS.push(function fillFrameGen(ctx) {
    if (!paintOnly(ctx)) return [];
    var bg = ctx.bg(), train = ctx.train, out = [], t, r, c, seen = 0, sb;
    for (t = 0; t < train.length; t++) for (r = 0; r < train[t][0].length; r++) for (c = 0; c < train[t][0][0].length; c++) if (train[t][0][r][c] !== train[t][1][r][c]) seen |= 1 << train[t][1][r][c];
    var cols = G.csList(seen); if (cols.length !== 1) return [];
    for (sb = 0; sb < 2; sb++) {
      var ok = true;
      for (t = 0; t < train.length; t++) { var p = fillFrame(train[t][0], bg, cols[0], sb === 1); if (!p || !same(p, train[t][1])) { ok = false; break; } }
      if (ok) out.push(_h("fillframe" + (sb ? "_skipbox" : ""), (function (b2) { return function (g) { return fillFrame(g, bg, cols[0], b2 === 1) || copy(g); }; })(sb), 4.0));
    }
    return out;
  });

  /* colour pairs written out as a key, applied to the main object */
  function legendPairs(g, bg) {
    var os = objsOf(g, bg, "m8"), pairs = [], main = null, i, o;
    for (i = 0; i < os.length; i++) {
      o = os[i];
      if (o.n === 2 && o.multi) {
        var a = o.cells[0], b = o.cells[1];
        pairs.push({ a: g[a[0]][a[1]], b: g[b[0]][b[1]], cells: o.cells });
      } else if (!main || o.n > main.n) main = o;
    }
    return { pairs: pairs, main: main, os: os };
  }
  function legendApply(g, bg, dir, crop, dropKey) {
    var L = legendPairs(g, bg);
    if (!L.pairs.length || !L.main) return null;
    var map = {}, i;
    for (i = 0; i < L.pairs.length; i++) { var pr = L.pairs[i]; if (dir === 0) map[pr.b] = pr.a; else map[pr.a] = pr.b; }
    var out = copy(g), m = L.main, j;
    for (j = 0; j < m.cells.length; j++) { var v = g[m.cells[j][0]][m.cells[j][1]]; if (map[v] !== undefined) out[m.cells[j][0]][m.cells[j][1]] = map[v]; }
    if (dropKey) for (i = 0; i < L.pairs.length; i++) for (j = 0; j < L.pairs[i].cells.length; j++) out[L.pairs[i].cells[j][0]][L.pairs[i].cells[j][1]] = bg;
    if (crop) return G.subgrid(out, m.r0, m.c0, m.r1, m.c1);
    return out;
  }
  GENS.push(function legendGen(ctx) {
    var bg = ctx.bg(), train = ctx.train, out = [], t, dir, crop, dk;
    if (!legendPairs(train[0][0], bg).pairs.length) return [];
    for (dir = 0; dir < 2; dir++) for (crop = 0; crop < 2; crop++) for (dk = 0; dk < 2; dk++) {
      if (crop && dk) continue;
      var ok = true;
      for (t = 0; t < train.length; t++) { var p = legendApply(train[t][0], bg, dir, crop === 1, dk === 1); if (!p || !same(p, train[t][1])) { ok = false; break; } }
      if (ok) out.push(_h("legend_" + dir + (crop ? "_crop" : "") + (dk ? "_drop" : ""), (function (d2, c2, k2) { return function (g) { return legendApply(g, bg, d2, c2 === 1, k2 === 1); }; })(dir, crop, dk), 4.0));
    }
    return out;
  });

  //@@END-MACHINES

  /* exchange two colours throughout a grid */
  function swapColors(g, a, b) {
    if (a === b) return g;
    var out = [], r, c, row, v;
    for (r = 0; r < g.length; r++) {
      row = g[r].slice();
      for (c = 0; c < row.length; c++) { v = row[c]; row[c] = v === a ? b : v === b ? a : v; }
      out.push(row);
    }
    return out;
  }
  var ORDER = ["raysGen", "betweenGen", "anchoredGen", "countRenderGen", "reflectGen", "templateStampGen", "floodGen", "symObjGen",
    "settleGen", "denoiseGen", "kronGen", "selfConcatGen", "connectGen", "mirrorBesideGen", "wallsGen", "emptyRectGen", "blockFillGen", "emptyLinesGen", "regionTableGen", "connectCentersGen", "recolorSelectedGen", "stripesGen", "latticeClassGen", "ringFillGen", "fillFrameGen", "legendGen", "relRecolorGen", "keepRecolorGen", "objMoveGen"];
  GENS.sort(function (a, b) {
    var ia = ORDER.indexOf(a.name), ib = ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  function runAll(ctx) {
    var out = [], i, got;
    for (i = 0; i < GENS.length; i++) {
      if (ctx.timed_out()) break;
      var t0 = nowMs();
      try { got = GENS[i](ctx); } catch (e) { got = []; if (root.C4ConceptsErrors) { var ek = (GENS[i].name || i) + ": " + String(e && e.message || e).slice(0, 80); root.C4ConceptsErrors[ek] = (root.C4ConceptsErrors[ek] || 0) + 1; } }
      if (root.C4ConceptsProfile) { var nm = GENS[i].name || ("g" + i); root.C4ConceptsProfile[nm] = (root.C4ConceptsProfile[nm] || 0) + (nowMs() - t0); }
      if (got && got.length) out = out.concat(got);
    }
    return out;
  }
  function learn(ctx) {
    if (!ctx.bg_varies()) return runAll(ctx);
    /* the background changes from grid to grid: learn in a frame where it is
       one fixed colour, and map each grid into and out of that frame */
    var canon = ctx.bg(), train = [], tests = [], i, b;
    for (i = 0; i < ctx.train.length; i++) {
      b = G.background(ctx.train[i][0]);
      train.push([swapColors(ctx.train[i][0], b, canon), swapColors(ctx.train[i][1], b, canon)]);
    }
    for (i = 0; i < ctx.test_inputs.length; i++) tests.push(swapColors(ctx.test_inputs[i], G.background(ctx.test_inputs[i]), canon));
    var sub = new Ctx(train, tests, ctx.deadline), hyps = runAll(sub);
    return hyps.map(function (h) {
      var f = h.fn;
      return _h(h.name + "@bgframe", function (g) {
        var bb = G.background(g), r = f(swapColors(g, bb, canon));
        return r ? swapColors(r, bb, canon) : r;
      }, h.cost + 0.3);
    });
  }
  /* A rule that can be recovered from all but one demonstration and still
     predict the one left out has generalised; one that cannot is likely a
     coincidence of the examples. That evidence moves the cost. */
  function gen(ctx) {
    var hyps = learn(ctx);
    if (!hyps.length || ctx.train.length < 3) return hyps;
    var start = nowMs(), pass = [], i, k, n = ctx.train.length;
    for (k = 0; k < hyps.length; k++) pass.push(true);
    for (i = 0; i < n; i++) {
      if (ctx.timed_out() || nowMs() - start > 250) return hyps;
      var sub = ctx.train.slice(0, i).concat(ctx.train.slice(i + 1)), sh;
      try { sh = learn(new Ctx(sub, [ctx.train[i][0]], ctx.deadline)); } catch (e) { sh = []; }
      var okNames = {}, j, p;
      for (j = 0; j < sh.length; j++) { p = sh[j].apply(ctx.train[i][0]); if (p && same(p, ctx.train[i][1])) okNames[sh[j].name] = 1; }
      for (k = 0; k < hyps.length; k++) if (!okNames[hyps[k].name]) pass[k] = false;
    }
    return hyps.map(function (h, idx) {
      return _h(h.name + (pass[idx] ? "+loo" : "-loo"), h.fn, Math.max(1.0, h.cost + (pass[idx] ? -1.0 : 1.0)));
    });
  }
  var conceptsModule = defSolver("concepts", "concepts", gen, 1, 0.4);
  conceptsModule.PRE = true;
  root.C4Concepts = { blockCells: blockCells, paintedOver: paintedOver, moveObjects: moveObjects, OBJ_KEYS: OBJ_KEYS, reflectAcross: reflectAcross, stampTemplates: stampTemplates, dividers: dividers, objsOf: objsOf, comps8: comps8 };
})();
