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
    if (cols.length > 3) return [];
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
    if (colors.length > 4 || needN > 3000) return null;
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
            if (train[tt][1][ps[kk][0]][ps[kk][1]] !== ps[kk][2]) { ok = false; break; }
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
    function apply(g) {
      var o = copy(g), gi, as, ai, pi, ps, ki;
      for (gi = 0; gi < groups.length; gi++) {
        as = groups[gi][0](g, bg);
        for (ai = 0; ai < as.length; ai++) for (pi = 0; pi < groups[gi][1].length; pi++) {
          ps = primPaints(g, bg, as[ai], groups[gi][1][pi]);
          for (ki = 0; ki < ps.length; ki++) o[ps[ki][0]][ps[ki][1]] = ps[ki][2];
        }
      }
      return o;
    }
    for (t = 0; t < train.length; t++) if (!same(apply(train[t][0]), train[t][1])) return null;
    if (chosen.length > 10 || groups.length > 2) return null;
    return { apply: apply, np: chosen.length, ng: groups.length };
  }
  GENS.push(function anchoredGen(ctx) {
    if (!paintOnly(ctx)) return [];
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
  function nearestColor(o, os, g) {
    var best = -1, bd = 1e9, i, j, k, q;
    for (i = 0; i < os.length; i++) {
      q = os[i]; if (q === o || q.color === o.color) continue;
      var dmin = 1e9;
      for (j = 0; j < o.cells.length; j++) for (k = 0; k < q.cells.length; k++) {
        var dd = Math.max(Math.abs(o.cells[j][0] - q.cells[k][0]), Math.abs(o.cells[j][1] - q.cells[k][1]));
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
    ["nearest", function (o, os, g, bg) { return nearestColor(o, os, g); }],
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

  //@@END-MACHINES

  function gen(ctx) {
    var out = [], i, got;
    for (i = 0; i < GENS.length; i++) {
      if (ctx.timed_out()) break;
      try { got = GENS[i](ctx); } catch (e) { got = []; }
      if (got && got.length) out = out.concat(got);
    }
    return out;
  }
  defSolver("concepts", "concepts", gen, 1, 0.8);
  root.C4Concepts = { reflectAcross: reflectAcross, stampTemplates: stampTemplates, dividers: dividers, objsOf: objsOf, comps8: comps8 };
})();
