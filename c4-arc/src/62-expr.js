/* ===== src/62-expr.js ===== */
/* The typed expression language of entity programs.
 *
 * Holes of an entity program are filled by EXPRESSIONS over a scene and an
 * entity, never by bare literals alone:
 *
 *   REL    entity -> entity   nearest (of a kind), touching, container,
 *                             contained, largest, smallest, unique-colour,
 *                             unique-shape, nearest in the same rows/columns
 *   COLOR  entity -> colour   literal, own colour, minority colour, background,
 *                             grid colour ranks, colour of REL(e)
 *   INT    entity -> int > 0  literal, height, width, size (+/-1), entity and
 *                             colour counts, holes, gap to REL(e), size of REL(e)
 *   VEC    entity -> offset   literal, direction x INT, slide until blocked,
 *                             to the border, toward / onto / mirrored about REL(e)
 *   PRED   entity -> bool     colour tests, extremes, uniqueness, topology,
 *                             contact, containment, symmetry, size thresholds
 *
 * Every expression carries its code length in bits (64-mdl.js sums them);
 * relations are memoised per scene.
 */
var EXPR = (function () {
  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  var DNAME = ["u", "d", "l", "r", "ul", "ur", "dl", "dr"];
  var LOG2_10 = Math.log(10) / Math.LN2;

  /* ------------------------------------------------------- relations */
  /* Each relation maps an entity to one other entity of the same scene (or
     none); results are memoised per scene as an Int16Array of ids. */
  function uniqueMin(sc, e, ok) {
    var best = 1e9, id = -1, tie = false, i, o, d;
    for (i = 0; i < sc.ents.length; i++) {
      o = sc.ents[i];
      if (o === e || !ok(o)) continue;
      d = sc.dist(e, o);
      if (d < best) { best = d; id = i; tie = false; } else if (d === best) tie = true;
    }
    return tie ? -1 : id;
  }
  var RELS = [
    ["near", 2.0, function (sc, e) { return uniqueMin(sc, e, function () { return true; }); }],
    ["nearD", 2.5, function (sc, e) { return uniqueMin(sc, e, function (o) { return o.color !== e.color; }); }],
    ["nearS", 2.5, function (sc, e) { return uniqueMin(sc, e, function (o) { return o.color === e.color; }); }],
    ["nearP", 3.0, function (sc, e) { return uniqueMin(sc, e, function (o) { return o.n === 1; }); }],
    ["nearB", 3.0, function (sc, e) { return uniqueMin(sc, e, function (o) { return o.n > 1; }); }],
    ["nearSh", 3.0, function (sc, e) { return uniqueMin(sc, e, function (o) { return o.d4() === e.d4(); }); }],
    ["touch", 2.5, function (sc, e) {
      var id = -1, i;
      for (i = 0; i < sc.ents.length; i++) if (sc.touch(e, sc.ents[i])) { if (id >= 0) return -1; id = i; }
      return id;
    }],
    ["cont", 2.5, function (sc, e) {
      var id = -1, ba = 1e9, i, o;
      for (i = 0; i < sc.ents.length; i++) {
        o = sc.ents[i];
        if (sc.inside(e, o) && o.h * o.w < ba) { ba = o.h * o.w; id = i; }
      }
      return id;
    }],
    ["inner", 2.5, function (sc, e) {
      var id = -1, i;
      for (i = 0; i < sc.ents.length; i++) if (sc.inside(sc.ents[i], e)) { if (id >= 0) return -1; id = i; }
      return id;
    }],
    ["big", 2.5, function (sc, e) { var id = sc.extreme("n", true); return id === e.id ? -1 : id; }],
    ["small", 2.5, function (sc, e) { var id = sc.extreme("n", false); return id === e.id ? -1 : id; }],
    ["uniqC", 3.0, function (sc, e) {
      var m = sc.countOf("color"), id = -1, i;
      for (i = 0; i < sc.ents.length; i++) if (m.get(sc.ents[i].color) === 1) { if (id >= 0) return -1; id = i; }
      return id === e.id ? -1 : id;
    }],
    ["uniqS", 3.0, function (sc, e) {
      var m = sc.countOf("d4"), id = -1, i;
      for (i = 0; i < sc.ents.length; i++) if (m.get(sc.ents[i].d4()) === 1) { if (id >= 0) return -1; id = i; }
      return id === e.id ? -1 : id;
    }],
    ["rowN", 3.0, function (sc, e) { return uniqueMin(sc, e, function (o) { return sc.rowOverlap(e, o); }); }],
    ["colN", 3.0, function (sc, e) { return uniqueMin(sc, e, function (o) { return sc.colOverlap(e, o); }); }]
  ];
  var REL_BY = {};
  RELS.forEach(function (r) { REL_BY[r[0]] = r; });
  function rel(sc, key, e) {
    var arr = sc.memo("rel:" + key, function () {
      var a = new Int16Array(this.ents.length), i, f = REL_BY[key][2];
      for (i = 0; i < this.ents.length; i++) a[i] = f(this, this.ents[i]);
      return a;
    });
    var id = arr[e.id];
    return id < 0 ? null : sc.ents[id];
  }

  /* ------------------------------------------------------ expressions */
  /* An expression is {k: canonical key, b: bits, f: (sc, e) -> value|null}. */
  var COLOR_EXPRS = [];
  (function () {
    var c;
    for (c = 0; c < 10; c++) COLOR_EXPRS.push({ k: "c" + c, b: LOG2_10, lit: true,
      f: (function (v) { return function () { return v; }; })(c) });
    COLOR_EXPRS.push({ k: "self", b: 1.0, f: function (sc, e) { return e.color; } });
    COLOR_EXPRS.push({ k: "minor", b: 2.5, f: function (sc, e) { return e.minor >= 0 ? e.minor : null; } });
    COLOR_EXPRS.push({ k: "bg", b: 2.0, f: function (sc) { return sc.bg; } });
    COLOR_EXPRS.push({ k: "gmaj", b: 3.0, f: function (sc) { var v = sc.colorRank(true); return v < 0 ? null : v; } });
    COLOR_EXPRS.push({ k: "gmin", b: 3.0, f: function (sc) { var v = sc.colorRank(false); return v < 0 ? null : v; } });
    RELS.forEach(function (R) {
      COLOR_EXPRS.push({ k: "col(" + R[0] + ")", rel: R[0], b: 1.5 + R[1], f: function (sc, e) { var o = rel(sc, R[0], e); return o ? o.color : null; } });
    });
    RELS.slice(0, 3).forEach(function (R) {
      COLOR_EXPRS.push({ k: "minor(" + R[0] + ")", rel: R[0], b: 3.0 + R[1], f: function (sc, e) { var o = rel(sc, R[0], e); return o && o.minor >= 0 ? o.minor : null; } });
    });
  })();

  function countColor(sc, c) { return sc.hist[c]; }
  function countEntsColor(sc, c) {
    var m = sc.countOf("color"); return m.get(c) || 0;
  }
  /* positive integers for scaling a direction */
  var INT_EXPRS = [];
  (function () {
    var k;
    for (k = 1; k <= 9; k++) INT_EXPRS.push({ k: "" + k, b: 1 + 2 * Math.log(k + 1) / Math.LN2, lit: true,
      f: (function (v) { return function () { return v; }; })(k) });
    INT_EXPRS.push({ k: "h", b: 2.0, f: function (sc, e) { return e.h; } });
    INT_EXPRS.push({ k: "w", b: 2.0, f: function (sc, e) { return e.w; } });
    INT_EXPRS.push({ k: "n", b: 2.5, f: function (sc, e) { return e.n; } });
    INT_EXPRS.push({ k: "h+1", b: 3.0, f: function (sc, e) { return e.h + 1; } });
    INT_EXPRS.push({ k: "w+1", b: 3.0, f: function (sc, e) { return e.w + 1; } });
    INT_EXPRS.push({ k: "h-1", b: 3.0, f: function (sc, e) { return e.h - 1; } });
    INT_EXPRS.push({ k: "w-1", b: 3.0, f: function (sc, e) { return e.w - 1; } });
    INT_EXPRS.push({ k: "#ents", b: 3.0, f: function (sc) { return sc.ents.length; } });
    INT_EXPRS.push({ k: "#same", b: 3.5, f: function (sc, e) { return countEntsColor(sc, e.color); } });
    INT_EXPRS.push({ k: "holes", b: 3.0, f: function (sc, e) { return e.holes(); } });
    for (k = 0; k < 10; k++) INT_EXPRS.push({ k: "#c" + k, b: 2.0 + LOG2_10, cref: k,
      f: (function (v) { return function (sc) { return countColor(sc, v); }; })(k) });
    RELS.slice(0, 5).forEach(function (R) {
      INT_EXPRS.push({ k: "gap(" + R[0] + ")", rel: R[0], b: 2.0 + R[1], f: function (sc, e) { var o = rel(sc, R[0], e); return o ? sc.dist(e, o) - 1 : null; } });
      INT_EXPRS.push({ k: "n(" + R[0] + ")", rel: R[0], b: 2.5 + R[1], f: function (sc, e) { var o = rel(sc, R[0], e); return o ? o.n : null; } });
    });
  })();

  function litBits(v) { return 1 + 2 * Math.log(Math.abs(v) + 1) / Math.LN2; }

  /* Learned lookup COLOR expressions: colour = T[attr(e)], where the table
     T is FITTED to the observations (never enumerated). Accepted only when
     it compresses: fewer entries than observations and at least two keys.
     Its code length pays for every entry, so a table never beats a single
     relation that explains the same data. */
  var TAB_ATTRS = ["n", "h", "w", "holes", "ncol", "color", "d4", "shape", "odd:n", "odd:h", "border", "rect"];
  function tabKey(e, a, sc) {
    if (a === "odd:n") return e.n & 1;
    if (a === "odd:h") return e.h & 1;
    if (a === "d4") return e.d4();
    if (a === "shape") return e.shape;
    if (a === "holes") return e.holes();
    if (a === "border") return e.border ? 1 : 0;
    if (a === "rect") return e.rect ? 1 : 0;
    return e[a];
  }
  /* obs: [{sc, e, c}] -> list of fitted table expressions */
  function fitTables(obs) {
    var out = [], i, j;
    if (obs.length < 3) return out;
    for (i = 0; i < TAB_ATTRS.length; i++) {
      var a = TAB_ATTRS[i], T = new Map(), N = new Map(), ok = true;
      for (j = 0; j < obs.length && ok; j++) {
        var k = tabKey(obs[j].e, a, obs[j].sc);
        if (T.has(k)) { if (T.get(k) !== obs[j].c) ok = false; } else T.set(k, obs[j].c);
        N.set(k, (N.get(k) || 0) + 1);
      }
      if (!ok || T.size < 2 || T.size >= obs.length) continue;
      /* every entry seen at least twice: one row per observation is a
         transcript, not a rule */
      var thin = false;
      N.forEach(function (n) { if (n < 2) thin = true; });
      if (thin) continue;
      (function (attrName, table) {
        var keyStr = "tab(" + attrName + ":" + Array.from(table.entries()).map(function (x) { return String(x[0]).length > 12 ? "#" + x[1] : x[0] + ">" + x[1]; }).join(",") + ")";
        out.push({ k: keyStr, b: 2 + table.size * (LOG2_10 + 2), tab: true,
                   f: function (sc, e) { var v = table.get(tabKey(e, attrName, sc)); return v === undefined ? null : v; } });
      })(a, T);
    }
    return out;
  }
  /* slide in direction d until the next step would hit a foreground cell
     that is not the entity itself, or leave the grid */
  function slide(sc, e, d, toBorderOnly) {
    var g = sc.grid, bg = sc.bg, H = sc.H, W = sc.W, dr = DIRS[d][0], dc = DIRS[d][1], k = 0, i;
    for (;;) {
      var nk = k + 1, ok = true;
      for (i = 0; i < e.n; i++) {
        var r = (e.cells[i] >> 6) + dr * nk, c = (e.cells[i] & 63) + dc * nk;
        if (r < 0 || r >= H || c < 0 || c >= W) { ok = false; break; }
        if (!toBorderOnly && g[r][c] !== bg && !e.has((r << 6) | c)) { ok = false; break; }
      }
      if (!ok) break;
      k = nk;
      if (k > 60) return null;
    }
    return [dr * k, dc * k];
  }
  /* move toward R until the bboxes touch (4-adjacent along one axis) */
  function toward(sc, e, o) {
    if (!o) return null;
    var rov = sc.rowOverlap(e, o), cov = sc.colOverlap(e, o);
    if (cov && !rov) return e.r1 < o.r0 ? [o.r0 - e.r1 - 1, 0] : [o.r1 - e.r0 + 1, 0];
    if (rov && !cov) return e.c1 < o.c0 ? [0, o.c0 - e.c1 - 1] : [0, o.c1 - e.c0 + 1];
    return null;
  }
  function onto(e, o) {
    if (!o) return null;
    var dr2 = o.cr2 - e.cr2, dc2 = o.cc2 - e.cc2;
    if (dr2 & 1 || dc2 & 1) return null;
    return [dr2 / 2, dc2 / 2];
  }
  /* reflect e's bbox to the other side of o (the axis on which they are
     separated) */
  function mirrorAbout(sc, e, o) {
    if (!o) return null;
    var rov = sc.rowOverlap(e, o), cov = sc.colOverlap(e, o);
    if (cov && !rov) return [o.cr2 - e.cr2, 0];
    if (rov && !cov) return [0, o.cc2 - e.cc2];
    return null;
  }
  var VEC_EXPRS = [];
  (function () {
    var d, i;
    for (d = 0; d < 8; d++) for (i = 0; i < INT_EXPRS.length; i++) (function (dd, I) {
      VEC_EXPRS.push({ k: DNAME[dd] + "*" + I.k, b: 3.0 + I.b, lit: !!I.lit, cref: I.cref, rel: I.rel,
        f: function (sc, e) { var v = I.f(sc, e); return (v === null || v === undefined || v <= 0) ? null : [DIRS[dd][0] * v, DIRS[dd][1] * v]; } });
    })(d, INT_EXPRS[i]);
    for (d = 0; d < 8; d++) (function (dd) {
      VEC_EXPRS.push({ k: "slide:" + DNAME[dd], b: 3.5, f: function (sc, e) { return slide(sc, e, dd, false); } });
      VEC_EXPRS.push({ k: "edge:" + DNAME[dd], b: 4.0, f: function (sc, e) { return slide(sc, e, dd, true); } });
    })(d);
    RELS.forEach(function (R) {
      VEC_EXPRS.push({ k: "to(" + R[0] + ")", rel: R[0], b: 2.0 + R[1], f: function (sc, e) { return toward(sc, e, rel(sc, R[0], e)); } });
      VEC_EXPRS.push({ k: "onto(" + R[0] + ")", rel: R[0], b: 2.5 + R[1], f: function (sc, e) { return onto(e, rel(sc, R[0], e)); } });
      VEC_EXPRS.push({ k: "mirror(" + R[0] + ")", rel: R[0], b: 3.0 + R[1], f: function (sc, e) { return mirrorAbout(sc, e, rel(sc, R[0], e)); } });
    });
  })();
  function litVec(v) {
    return { k: "(" + v[0] + "," + v[1] + ")", b: 2 + litBits(v[0]) + litBits(v[1]), lit: true,
             f: function () { return v; } };
  }

  /* ------------------------------------------------------- predicates */
  /* A predicate is {k, b, f: (sc, e) -> bool}. The catalogue is built per
     task from the colours and values that occur. */
  function predCatalog(allEnts, palette) {
    var P = [], c, seen = {};
    function add(k, b, f) { if (!seen[k]) { seen[k] = 1; P.push({ k: k, b: b, f: f }); } }
    add("all", 0.5, function () { return true; });
    for (var i = 0; i < palette.length; i++) (function (cc) {
      add("col=" + cc, 1 + LOG2_10, function (sc, e) { return e.color === cc; });
      add("col!=" + cc, 2 + LOG2_10, function (sc, e) { return e.color !== cc; });
      add("has:" + cc, 2 + LOG2_10, function (sc, e) { return (e.colors & (1 << cc)) !== 0; });
      add("!has:" + cc, 3 + LOG2_10, function (sc, e) { return (e.colors & (1 << cc)) === 0; });
      add("touchC:" + cc, 3 + LOG2_10, function (sc, e) {
        for (var j = 0; j < sc.ents.length; j++) if (sc.ents[j].color === cc && sc.touch(e, sc.ents[j])) return true;
        return false;
      });
    })(palette[i]);
    [["n", "size"], ["h", "height"], ["w", "width"], ["area", "area"]].forEach(function (a) {
      add("max:" + a[0], 2.5, function (sc, e) { return sc.extreme(a[0], true) === e.id; });
      add("min:" + a[0], 2.5, function (sc, e) { return sc.extreme(a[0], false) === e.id; });
    });
    add("uShape", 2.5, function (sc, e) { return sc.countOf("d4").get(e.d4()) === 1; });
    add("rShape", 2.5, function (sc, e) { return sc.countOf("d4").get(e.d4()) > 1; });
    add("uColor", 2.5, function (sc, e) { return sc.countOf("color").get(e.color) === 1; });
    add("rColor", 2.5, function (sc, e) { return sc.countOf("color").get(e.color) > 1; });
    add("border", 2.0, function (sc, e) { return e.border; });
    add("!border", 2.0, function (sc, e) { return !e.border; });
    add("holes", 2.0, function (sc, e) { return e.holes() > 0; });
    add("!holes", 2.0, function (sc, e) { return e.holes() === 0; });
    add("rect", 2.0, function (sc, e) { return e.rect; });
    add("!rect", 2.0, function (sc, e) { return !e.rect; });
    add("line", 2.5, function (sc, e) { return e.line && e.n > 1; });
    add("square", 2.5, function (sc, e) { return e.square; });
    add("pix", 2.0, function (sc, e) { return e.n === 1; });
    add("!pix", 2.0, function (sc, e) { return e.n > 1; });
    add("multi", 2.0, function (sc, e) { return e.ncol > 1; });
    add("mono", 2.0, function (sc, e) { return e.ncol === 1; });
    add("inside", 2.5, function (sc, e) { return !!rel(sc, "cont", e); });
    add("!inside", 2.5, function (sc, e) { return !rel(sc, "cont", e); });
    add("contains", 2.5, function (sc, e) {
      for (var j = 0; j < sc.ents.length; j++) if (sc.inside(sc.ents[j], e)) return true;
      return false;
    });
    add("touches", 2.5, function (sc, e) { return !!(function () { for (var j = 0; j < sc.ents.length; j++) if (sc.touch(e, sc.ents[j])) return true; return false; })(); });
    add("alone", 2.5, function (sc, e) { for (var j = 0; j < sc.ents.length; j++) if (sc.touch(e, sc.ents[j])) return false; return true; });
    add("first", 3.0, function (sc, e) { return e.id === 0; });
    add("last", 3.0, function (sc, e) { return e.id === sc.ents.length - 1; });
    add("mid", 3.5, function (sc, e) {
      var r2 = sc.H - 1, c2 = sc.W - 1;
      return e.r0 * 2 <= r2 && e.r1 * 2 >= r2 && e.c0 * 2 <= c2 && e.c1 * 2 >= c2;
    });
    add("odd:h", 3.0, function (sc, e) { return (e.h & 1) === 1; });
    add("odd:w", 3.0, function (sc, e) { return (e.w & 1) === 1; });
    add("symLR", 3.0, function (sc, e) { return e.sym().lr; });
    add("symUD", 3.0, function (sc, e) { return e.sym().ud; });
    add("!sym", 3.0, function (sc, e) { var s = e.sym(); return !s.lr && !s.ud && !s.r2; });
    /* thresholds at observed sizes (literal integers cost bits) */
    var sizes = {};
    allEnts.forEach(function (x) { sizes[x.e.n] = 1; });
    Object.keys(sizes).map(Number).sort(function (a, b) { return a - b; }).slice(0, 12).forEach(function (v) {
      add("n=" + v, 2 + litBits(v), function (sc, e) { return e.n === v; });
      add("n>=" + v, 2.5 + litBits(v), function (sc, e) { return e.n >= v; });
      add("n<=" + v, 2.5 + litBits(v), function (sc, e) { return e.n <= v; });
    });
    return P;
  }

  return { DIRS: DIRS, DNAME: DNAME, LOG2_10: LOG2_10, RELS: RELS, REL_BY: REL_BY, rel: rel,
           COLOR_EXPRS: COLOR_EXPRS, INT_EXPRS: INT_EXPRS, VEC_EXPRS: VEC_EXPRS, litVec: litVec, litBits: litBits,
           slide: slide, toward: toward, onto: onto, mirrorAbout: mirrorAbout, predCatalog: predCatalog,
           fitTables: fitTables };
})();
