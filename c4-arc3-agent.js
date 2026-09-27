/* CELL4 ARC-AGI-3 agent: active discovery of an unknown interactive program.
 *
 * The previous agent (c4-arc3-world.js) assumes an avatar moved by
 * direction actions through walls towards a goal. It is kept, unchanged, as
 * the baseline and as a navigation specialist. This agent makes no such
 * assumption. Its central representation is
 *
 *   OBJECTS (perceived, tracked)  +  LATENT STATE (selection, modes, counts)
 *   +  CAUSAL RULES (trigger x selector x precondition x operator)
 *   +  GOAL PROGRAM (hypotheses over states)
 *
 * and its loop is the one the brief asks for:
 *
 *   PERCEIVE      detect the render lattice, parse objects, track identity
 *                 across frames, turn frame differences into EVENTS
 *   INDUCE        every observed transition constrains a VERSION SPACE of
 *                 rules per interaction context; conflicting observations
 *                 of one context are explained by latent variables
 *   BELIEVE       competing explanations per context, weighted by
 *                 description length (2-16 live models)
 *   GOALS         goal hypotheses from a small grammar, refuted when
 *                 satisfied without progress, confirmed at level completion
 *   EXPERIMENT    expected information gain over actions and SEMANTIC click
 *                 targets (object classes, never raw pixels)
 *   PLAN          search through the learned program to a state satisfying
 *                 the most probable goal
 *   ACT, COMPARE  predict before acting; a failed prediction is classified
 *                 and repaired at the rule level
 *   REMEMBER      rules, roles and goal beliefs survive level changes;
 *                 layouts do not
 *
 * Nothing here names a game, a colour's meaning, or a shape's meaning.
 */
(function (root) {
  "use strict";

  /* ============================================================ PERCEPTION */

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
  /* The render lattice: games draw logical cells as s x s pixel blocks.
     Edges (colour changes between neighbouring pixels) of every frame seen
     in the level fix the period and offset; more frames can only refine it. */
  function Lattice() { this.ex = new Uint8Array(65); this.ey = new Uint8Array(65); this.s = 0; this.ox = 0; this.oy = 0; }
  Lattice.prototype.add = function (f) {
    var H = f.length, W = f[0].length, y, x, changed = false;
    for (y = 0; y < H; y++) for (x = 1; x < W; x++) if (f[y][x] !== f[y][x - 1] && !this.ex[x]) { this.ex[x] = 1; changed = true; }
    for (y = 1; y < H; y++) for (x = 0; x < W; x++) if (f[y][x] !== f[y - 1][x] && !this.ey[y]) { this.ey[y] = 1; changed = true; }
    if (changed || !this.s) this.solve(H, W);
    return changed;
  };
  Lattice.prototype.solve = function (H, W) {
    var xs = [], ys = [], i, g = 0;
    for (i = 1; i < 65; i++) { if (this.ex[i]) xs.push(i); if (this.ey[i]) ys.push(i); }
    var all = xs.concat(ys);
    [xs, ys].forEach(function (v) { for (var j = 1; j < v.length; j++) g = gcd(g, v[j] - v[0]); });
    if (!g) g = all.length ? Math.max(1, gcd(xs.length ? xs[0] : 0, ys.length ? ys[0] : 0)) : 1;
    /* offsets must be common to both axes' edge sets */
    var s = Math.max(1, Math.min(g, 16));
    while (s > 1 && (xs.some(function (v) { return (v - (xs[0] || 0)) % s; }) || ys.some(function (v) { return (v - (ys[0] || 0)) % s; }))) s--;
    this.s = s; this.ox = xs.length ? xs[0] % s : 0; this.oy = ys.length ? ys[0] % s : 0;
    this.W = Math.ceil((W - this.ox) / s) + (this.ox ? 1 : 0); this.H = Math.ceil((H - this.oy) / s) + (this.oy ? 1 : 0);
  };
  /* pixel -> logical cell and back */
  Lattice.prototype.cellOf = function (px, py) { return { r: Math.floor((py - this.oy) / this.s) + (this.oy ? 1 : 0), c: Math.floor((px - this.ox) / this.s) + (this.ox ? 1 : 0) }; };
  Lattice.prototype.pixelOf = function (r, c) {
    var y0 = this.oy ? (r - 1) * this.s + this.oy : r * this.s, x0 = this.ox ? (c - 1) * this.s + this.ox : c * this.s;
    return { x: Math.max(0, Math.min(63, x0 + Math.floor(this.s / 2))), y: Math.max(0, Math.min(63, y0 + Math.floor(this.s / 2))) };
  };
  Lattice.prototype.logical = function (f) {
    var g = [], r, c;
    for (r = 0; r < this.H; r++) {
      var row = [];
      for (c = 0; c < this.W; c++) { var p = this.pixelOf(r, c); row.push(f[p.y][p.x]); }
      g.push(row);
    }
    return g;
  };

  /* background = the commonest colour inside the playing area (a uniform
     frame around the playing area does not vote) */
  /* Uniform border rows and columns (a frame around the playing area, the
     walls around a maze) are peeled off first, so a thick frame or a walled
     border cannot outvote the floor. */
  function background(g) {
    var H = g.length, W = g[0].length, r, c, cnt = {};
    var r0 = 0, r1 = H - 1, c0 = 0, c1 = W - 1, peeled = true, guard = 0;
    function uniformRow(r, a, b) { for (var x = a + 1; x <= b; x++) if (g[r][x] !== g[r][a]) return false; return true; }
    function uniformCol(c, a, b) { for (var y = a + 1; y <= b; y++) if (g[y][c] !== g[a][c]) return false; return true; }
    while (peeled && guard++ < 64 && r1 - r0 >= 2 && c1 - c0 >= 2) {
      peeled = false;
      if (uniformRow(r0, c0, c1)) { r0++; peeled = true; }
      if (r1 > r0 && uniformRow(r1, c0, c1)) { r1--; peeled = true; }
      if (uniformCol(c0, r0, r1)) { c0++; peeled = true; }
      if (c1 > c0 && uniformCol(c1, r0, r1)) { c1--; peeled = true; }
    }
    for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) cnt[g[r][c]] = (cnt[g[r][c]] || 0) + 1;
    var best = -1, bn = -1;
    for (var k in cnt) if (cnt[k] > bn || (cnt[k] === bn && +k < best)) { bn = cnt[k]; best = +k; }
    return { bg: best, frame: -1, box: [r0, c0, r1, c1] };
  }

  function shapeKey(cells, W) {
    var r0 = Infinity, c0 = Infinity;
    cells.forEach(function (i) { var r = (i / W) | 0, c = i % W; if (r < r0) r0 = r; if (c < c0) c0 = c; });
    return cells.map(function (i) { return (((i / W) | 0) - r0) + "," + (i % W - c0); }).sort().join(";");
  }
  function rotKey(key, k) {
    var pts = key.split(";").map(function (s) { var p = s.split(","); return [+p[0], +p[1]]; });
    for (var i = 0; i < k; i++) pts = pts.map(function (p) { return [p[1], -p[0]]; });
    var r0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })), c0 = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
    return pts.map(function (p) { return (p[0] - r0) + "," + (p[1] - c0); }).sort().join(";");
  }
  function canonKey(key) { var ks = [0, 1, 2, 3].map(function (k) { return rotKey(key, k); }).sort(); return ks[0]; }

  /* A parsed state: logical grid, objects (4-connected, one colour, not
     background), composite groups (8-connected, any colours), and indexes. */
  function parse(g, bgInfo) {
    var H = g.length, W = g[0].length, bg = bgInfo.bg, seen = new Int32Array(H * W).fill(-1), objs = [], r, c;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      var i0 = r * W + c;
      if (seen[i0] >= 0 || g[r][c] === bg || g[r][c] === bgInfo.frame) continue;
      var col = g[r][c], st = [i0], cells = [], id = objs.length;
      seen[i0] = id;
      while (st.length) {
        var i = st.pop(), y = (i / W) | 0, x = i % W; cells.push(i);
        if (y > 0 && seen[i - W] < 0 && g[y - 1][x] === col) { seen[i - W] = id; st.push(i - W); }
        if (y < H - 1 && seen[i + W] < 0 && g[y + 1][x] === col) { seen[i + W] = id; st.push(i + W); }
        if (x > 0 && seen[i - 1] < 0 && g[y][x - 1] === col) { seen[i - 1] = id; st.push(i - 1); }
        if (x < W - 1 && seen[i + 1] < 0 && g[y][x + 1] === col) { seen[i + 1] = id; st.push(i + 1); }
      }
      cells.sort(function (a, b) { return a - b; });
      var rs = cells.map(function (i) { return (i / W) | 0; }), cs = cells.map(function (i) { return i % W; });
      var sk = shapeKey(cells, W);
      objs.push({ id: id, color: col, cells: cells, n: cells.length, r0: Math.min.apply(null, rs), r1: Math.max.apply(null, rs), c0: Math.min.apply(null, cs), c1: Math.max.apply(null, cs),
                  cr: rs.reduce(function (a, b) { return a + b; }, 0) / cells.length, cc: cs.reduce(function (a, b) { return a + b; }, 0) / cells.length,
                  shape: sk, canon: canonKey(sk) });
    }
    objs.forEach(function (o) { o.cls = o.color + "/" + o.canon; });
    return { g: g, H: H, W: W, bg: bg, frame: bgInfo.frame, objs: objs, at: seen };
  }
  function gkey(g) { var s = ""; for (var r = 0; r < g.length; r++) s += g[r].join(",") + "|"; return s; }

  /* ================================================================ EVENTS */
  /* What became of each object: moved, recoloured, rotated, reshaped,
     deleted; what appeared. Identity is by colour + shape first (moves),
     then by place (recolours, reshapes), then by canonical shape near the
     old place (rotations). */
  function events(P, N) {
    var ev = [], usedN = new Uint8Array(N.objs.length), matched = new Int32Array(P.objs.length).fill(-1), i, j;
    function cellSet(o) { var s = {}; o.cells.forEach(function (x) { s[x] = 1; }); return s; }
    /* unchanged */
    for (i = 0; i < P.objs.length; i++) {
      var a = P.objs[i];
      for (j = 0; j < N.objs.length; j++) {
        var b = N.objs[j];
        if (!usedN[j] && b.color === a.color && b.shape === a.shape && b.r0 === a.r0 && b.c0 === a.c0) { usedN[j] = 1; matched[i] = j; break; }
      }
    }
    /* moved: same colour and shape, nearest */
    for (i = 0; i < P.objs.length; i++) {
      if (matched[i] >= 0) continue;
      var a2 = P.objs[i], best = -1, bd = Infinity;
      for (j = 0; j < N.objs.length; j++) {
        var b2 = N.objs[j];
        if (usedN[j] || b2.color !== a2.color || b2.shape !== a2.shape) continue;
        var d = Math.abs(b2.r0 - a2.r0) + Math.abs(b2.c0 - a2.c0);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0 && bd <= Math.max(P.H, P.W)) { usedN[best] = 1; matched[i] = best; ev.push({ t: "move", p: a2, n: N.objs[best], dr: N.objs[best].r0 - a2.r0, dc: N.objs[best].c0 - a2.c0 }); }
    }
    /* recoloured: same cells */
    for (i = 0; i < P.objs.length; i++) {
      if (matched[i] >= 0) continue;
      var a3 = P.objs[i];
      for (j = 0; j < N.objs.length; j++) {
        var b3 = N.objs[j];
        if (!usedN[j] && b3.shape === a3.shape && b3.r0 === a3.r0 && b3.c0 === a3.c0 && b3.color !== a3.color) { usedN[j] = 1; matched[i] = j; ev.push({ t: "recolor", p: a3, n: b3, from: a3.color, to: b3.color }); break; }
      }
    }
    /* rotated: same colour and canonical shape, centroid close */
    for (i = 0; i < P.objs.length; i++) {
      if (matched[i] >= 0) continue;
      var a4 = P.objs[i];
      for (j = 0; j < N.objs.length; j++) {
        var b4 = N.objs[j];
        if (usedN[j] || b4.color !== a4.color || b4.canon !== a4.canon || b4.shape === a4.shape) continue;
        if (Math.abs(b4.cr - a4.cr) + Math.abs(b4.cc - a4.cc) > 2.5) continue;
        var k = [1, 2, 3].find(function (q) { return rotKey(a4.shape, q) === b4.shape; });
        usedN[j] = 1; matched[i] = j; ev.push({ t: "rotate", p: a4, n: b4, k: k || 1 }); break;
      }
    }
    /* reshaped: overlapping, same colour */
    for (i = 0; i < P.objs.length; i++) {
      if (matched[i] >= 0) continue;
      var a5 = P.objs[i], cs5 = cellSet(a5);
      for (j = 0; j < N.objs.length; j++) {
        var b5 = N.objs[j];
        if (usedN[j] || b5.color !== a5.color) continue;
        var ov = b5.cells.filter(function (x) { return cs5[x]; }).length;
        if (ov * 2 >= Math.min(a5.n, b5.n) && ov > 0) { usedN[j] = 1; matched[i] = j; ev.push({ t: "reshape", p: a5, n: b5, grow: b5.n - a5.n }); break; }
      }
    }
    for (i = 0; i < P.objs.length; i++) if (matched[i] < 0) ev.push({ t: "delete", p: P.objs[i] });
    for (j = 0; j < N.objs.length; j++) if (!usedN[j]) ev.push({ t: "spawn", n: N.objs[j] });
    return ev;
  }
  function evKey(e) {
    if (e.t === "move") return "m" + e.p.r0 + "," + e.p.c0 + ">" + e.dr + "," + e.dc;
    if (e.t === "recolor") return "c" + e.p.r0 + "," + e.p.c0 + ">" + e.to;
    if (e.t === "rotate") return "r" + e.p.r0 + "," + e.p.c0 + ">" + e.n.shape;
    if (e.t === "reshape") return "s" + e.p.r0 + "," + e.p.c0 + ">" + e.n.shape;
    if (e.t === "delete") return "d" + e.p.r0 + "," + e.p.c0;
    return "n" + e.n.r0 + "," + e.n.c0 + ":" + e.n.color + ":" + e.n.shape;
  }

  root.C4Arc3AgentParts = { Lattice: Lattice, background: background, parse: parse, events: events, evKey: evKey, gkey: gkey, rotKey: rotKey, canonKey: canonKey, shapeKey: shapeKey };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ======================================================= GAME PROGRAM MODEL */
(function (root) {
  "use strict";
  var P = root.C4Arc3AgentParts;

  /* ------------------------------------------------------------ selectors
     Which objects a rule acts on, given the state and the interaction:
     the clicked object k, the object clicked BEFORE (lc: selection-like
     latent), or classes of objects. Relational selectors reach the nearest
     object along each ray, so spaced layouts (buttons, lamps) work. */
  function adjacent(S, a, b, diag) {
    var W = S.W, set = {};
    a.cells.forEach(function (i) { set[i] = 1; });
    return b.cells.some(function (i) {
      var r = (i / W) | 0, c = i % W;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; if (!diag && dr && dc) continue;
        var y = r + dr, x = c + dc; if (y < 0 || x < 0 || y >= S.H || x >= S.W) continue;
        if (set[y * W + x]) return true;
      }
      return false;
    });
  }
  function rayNbrs(S, o) {
    var out = [], W = S.W, cells = {}, dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    o.cells.forEach(function (i) { cells[i] = 1; });
    dirs.forEach(function (d) {
      var best = -1, bd = Infinity;
      o.cells.forEach(function (i) {
        var r = (i / W) | 0, c = i % W;
        for (var s = 1; s < Math.max(S.H, S.W); s++) {
          var y = r + d[0] * s, x = c + d[1] * s;
          if (y < 0 || x < 0 || y >= S.H || x >= S.W) break;
          var id = S.at[y * W + x];
          if (id >= 0 && id !== o.id) { if (s < bd) { bd = s; best = id; } break; }
        }
      });
      if (best >= 0 && out.indexOf(best) < 0) out.push(best);
    });
    return out;
  }
  function select(S, sel, cx) {
    var k = cx.k, o = k >= 0 ? S.objs[k] : null, lc = cx.lc >= 0 ? S.objs[cx.lc] : null;
    switch (sel.t) {
      case "clicked": return o ? [k] : [];
      case "lastClicked": return lc ? [cx.lc] : [];
      case "nbr4": return o ? S.objs.filter(function (b) { return b.id !== k && adjacent(S, o, b, false); }).map(function (b) { return b.id; }) : [];
      case "ray4": return o ? rayNbrs(S, o) : [];
      case "clickedRay4": return o ? [k].concat(rayNbrs(S, o)) : [];
      case "row": return o ? S.objs.filter(function (b) { return b.r0 <= o.r1 && b.r1 >= o.r0 && b.cls.split("/")[1] === o.cls.split("/")[1]; }).map(function (b) { return b.id; }) : [];
      case "col": return o ? S.objs.filter(function (b) { return b.c0 <= o.c1 && b.c1 >= o.c0 && b.cls.split("/")[1] === o.cls.split("/")[1]; }).map(function (b) { return b.id; }) : [];
      case "sameColor": return o ? S.objs.filter(function (b) { return b.color === o.color; }).map(function (b) { return b.id; }) : [];
      case "sameClass": return o ? S.objs.filter(function (b) { return b.cls === o.cls; }).map(function (b) { return b.id; }) : [];
      case "color": return S.objs.filter(function (b) { return b.color === sel.c; }).map(function (b) { return b.id; });
      case "cls": return S.objs.filter(function (b) { return b.cls === sel.k; }).map(function (b) { return b.id; });
    }
    return [];
  }
  var SEL_BITS = { clicked: 1, lastClicked: 2, nbr4: 3, ray4: 3, clickedRay4: 2.5, row: 3, col: 3, sameColor: 3, sameClass: 3.5, color: 4, cls: 5 };
  function selKey(s) { return s.t + (s.c !== undefined ? ":" + s.c : "") + (s.k !== undefined ? ":" + s.k : ""); }

  /* ------------------------------------------------------------ operators */
  function rotateCells(o, W, k, anchor) {
    var key = P.rotKey(o.shape, k), pts = key.split(";").map(function (s) { var p = s.split(","); return [+p[0], +p[1]]; });
    var h = Math.max.apply(null, pts.map(function (p) { return p[0]; })) + 1, w = Math.max.apply(null, pts.map(function (p) { return p[1]; })) + 1;
    var r0 = o.r0, c0 = o.c0;
    if (anchor === "center") { r0 = Math.round(o.r0 + (o.r1 - o.r0 + 1 - h) / 2); c0 = Math.round(o.c0 + (o.c1 - o.c0 + 1 - w) / 2); }
    return pts.map(function (p) { return (r0 + p[0]) * W + (c0 + p[1]); });
  }
  /* apply one operator to object o; returns {cells, color} | null (deleted)
     | undefined (no change). Moves are resolved later, against collisions. */
  function applyOp(S, o, op, cx) {
    switch (op.o) {
      case "recolor": return o.color === op.to ? undefined : { cells: o.cells, color: op.to };
      case "swapcol": return o.color === op.a ? { cells: o.cells, color: op.b } : o.color === op.b ? { cells: o.cells, color: op.a } : undefined;
      case "cycle": { var i = op.seq.indexOf(o.color); return i < 0 ? undefined : { cells: o.cells, color: op.seq[(i + 1) % op.seq.length] }; }
      case "map": { var to = op.m[o.color]; return to === undefined || to === o.color ? undefined : { cells: o.cells, color: to }; }
      case "delete": return null;
      case "rotate": return { cells: rotateCells(o, S.W, op.k, op.anchor), color: o.color };
      case "move": case "slide": case "patrol": case "moveTo": return { move: op, cells: o.cells, color: o.color };
    }
    return undefined;
  }
  var OP_BITS = { recolor: 3, swapcol: 3.5, cycle: 5, map: 4, delete: 1.5, rotate: 3, move: 3, slide: 3.5, patrol: 3, moveTo: 3, select: 1, togglevar: 2 };
  function opKey(op) { return op.o + (op.to !== undefined ? ":" + op.to : "") + (op.a !== undefined ? ":" + op.a + "/" + op.b : "") + (op.seq ? ":" + op.seq.join("") : "") + (op.k !== undefined ? ":" + op.k + (op.anchor || "") : "") + (op.dr !== undefined ? ":" + op.dr + "," + op.dc : "") + (op.ref ? ":" + op.ref : "") + (op.m ? ":" + Object.keys(op.m).sort().map(function (k) { return k + ">" + op.m[k]; }).join(",") : ""); }

  /* ------------------------------------------------------------ simulate
     Next grid from a state and a set of (rule, selected objects): colour and
     shape changes first, then moves resolved against every cell that is not
     background and not moving (a blocked move leaves the object in place). */
  function simulate(S, applied, cx) {
    var H = S.H, W = S.W, g = S.g.map(function (row) { return row.slice(); }), changes = {}, moves = [], i;
    applied.forEach(function (ap) {
      ap.objs.forEach(function (id) {
        var o = S.objs[id], r = applyOp(S, o, ap.rule.op, cx);
        if (r === undefined || changes[id] !== undefined) return;
        changes[id] = r;
        if (r && r.move) moves.push(id);
      });
    });
    /* erase every changed object */
    Object.keys(changes).forEach(function (id) { S.objs[id].cells.forEach(function (c) { g[(c / W) | 0][c % W] = S.bg; }); });
    /* paint recolours / rotations */
    Object.keys(changes).forEach(function (id) {
      var r = changes[id]; if (!r || r.move) return;
      r.cells.forEach(function (c) { var y = (c / W) | 0, x = c % W; if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = r.color; });
    });
    /* moves: shift until blocked (slides), else one step */
    var moving = {}, pushed = {}; moves.forEach(function (id) { S.objs[id].cells.forEach(function (c) { moving[c] = 1; }); });
    moves.forEach(function (id) {
      var o = S.objs[id], op = changes[id].move, dr = op.dr, dc = op.dc, steps = op.o === "slide" ? Math.max(H, W) : 1;
      if (op.o === "patrol") { var v = cx.vel && cx.vel[o.r0 + "," + o.c0 + ":" + o.color]; if (!v) { dr = 0; dc = 0; } else { dr = v[0]; dc = v[1]; } }
      if (op.o === "moveTo") { var ref = op.ref === "clicked" ? cx.k : cx.lc; if (ref < 0) { dr = 0; dc = 0; } else { dr = S.objs[ref].r0 - o.r0; dc = S.objs[ref].c0 - o.c0; } }
      var phys = cx.phys || {}, pass = phys.pass || {}, opt = cx.optimistic || {};
      function free(ddr, ddc) {
        return o.cells.every(function (c) {
          var y = ((c / W) | 0) + ddr, x = c % W + ddc;
          if (y < 0 || x < 0 || y >= H || x >= W) return false;
          if (op.o === "moveTo") return true;
          var v2 = g[y][x];
          if (v2 === S.bg || moving[y * W + x] || v2 === o.color && o.cells.indexOf(y * W + x) >= 0) return true;
          if (pass[v2] === "push") {
            var j = S.at[y * W + x]; if (j < 0) return false;
            var pb = S.objs[j];
            return pb.cells.every(function (q) { var yy = ((q / W) | 0) + ddr, xx = q % W + ddc; if (yy < 0 || xx < 0 || yy >= H || xx >= W) return false; var w2 = g[yy][xx]; return w2 === S.bg || S.at[yy * W + xx] === j || (pass[w2] && pass[w2] !== "push"); });
          }
          return !!pass[v2] || !!opt[v2];
        });
      }
      var tr = 0, tc = 0;
      for (var s = 0; s < steps; s++) { if (free(tr + dr, tc + dc)) { tr += dr; tc += dc; } else break; }
      if (op.o === "patrol" && !tr && !tc && (dr || dc) && free(-dr, -dc)) { tr = -dr; tc = -dc; }
      var under = cx.under || {};
      o.cells.forEach(function (c) { if (g[(c / W) | 0][c % W] === o.color && moving[c]) g[(c / W) | 0][c % W] = under[c] !== undefined ? under[c] : S.bg; });
      /* what the mover enters: pushed objects move on, collected ones vanish,
         deadly ones end the game */
      if (tr || tc) o.cells.forEach(function (c) {
        var y = ((c / W) | 0) + tr, x = c % W + tc; if (y < 0 || x < 0 || y >= H || x >= W) return;
        var v3 = g[y][x], j = S.at[y * W + x];
        if (v3 === S.bg || v3 === o.color) return;
        if ((cx.phys || {}).deadly && cx.phys.deadly[v3]) cx.dead = true;
        if (pass[v3] === "push" && j >= 0 && !pushed[j]) {
          pushed[j] = 1;
          var pb = S.objs[j];
          pb.cells.forEach(function (q) { g[(q / W) | 0][q % W] = S.bg; });
          pb.cells.forEach(function (q) { var yy = ((q / W) | 0) + tr, xx = q % W + tc; if (yy >= 0 && xx >= 0 && yy < H && xx < W) g[yy][xx] = pb.color; });
        } else if (pass[v3] === "collect" && j >= 0) {
          S.objs[j].cells.forEach(function (q) { if (q !== y * W + x) g[(q / W) | 0][q % W] = S.bg; });
        }
      });
      o.cells.forEach(function (c) { var y = ((c / W) | 0) + tr, x = c % W + tc; if (y >= 0 && x >= 0 && y < H && x < W) g[y][x] = o.color; });
    });
    return g;
  }

  /* ============================================================ INDUCTION */
  /* candidate (selector, operator) pairs that turn object e.p into what the
     event shows, under the transition's context */
  function selectorsFor(S, id, cx) {
    var out = [], o = S.objs[id], ck = cx.k >= 0 ? S.objs[cx.k] : null;
    function add(s) { if (select(S, s, cx).indexOf(id) >= 0) out.push(s); }
    if (ck) {
      add({ t: "clicked" }); add({ t: "ray4" }); add({ t: "clickedRay4" }); add({ t: "nbr4" });
      add({ t: "row" }); add({ t: "col" }); add({ t: "sameColor" }); add({ t: "sameClass" });
    }
    if (cx.lc >= 0) add({ t: "lastClicked" });
    add({ t: "color", c: o.color }); add({ t: "cls", k: o.cls });
    return out;
  }
  function opsFor(e, S) {
    var ops = [];
    if (e.t === "move") {
      ops.push({ o: "move", dr: e.dr, dc: e.dc });
      var sr = Math.sign(e.dr), sc = Math.sign(e.dc);
      if ((!e.dr || !e.dc) && (Math.abs(e.dr) + Math.abs(e.dc) >= 1)) ops.push({ o: "slide", dr: sr, dc: sc });
      ops.push({ o: "moveTo", ref: "clicked" }); ops.push({ o: "moveTo", ref: "lastClicked" });
      ops.push({ o: "patrol" });
    } else if (e.t === "recolor") {
      ops.push({ o: "recolor", to: e.to }); ops.push({ o: "swapcol", a: e.from, b: e.to });
    } else if (e.t === "rotate") {
      ops.push({ o: "rotate", k: e.k, anchor: "tl" }); ops.push({ o: "rotate", k: e.k, anchor: "center" });
    } else if (e.t === "delete") ops.push({ o: "delete" });
    return ops;
  }
  /* the events a single rule predicts on a transition's start state */
  function predictedEvents(t, rule) {
    var rk = rule.key || (selKey(rule.sel) + "|" + opKey(rule.op));
    if (t._pe && t._pe.has(rk)) return t._pe.get(rk);
    var res = predictedEventsRaw(t, rule);
    if (!t._pe) t._pe = new Map();
    t._pe.set(rk, res);
    return res;
  }
  function predictedEventsRaw(t, rule) {
    var ids = select(t.S0, rule.sel, t.cx);
    if (!ids.length) return [];
    var g = simulate(t.S0, [{ rule: rule, objs: ids }], t.cx);
    var S1 = P.parse(g, { bg: t.S0.bg, frame: t.S0.frame });
    return P.events(t.S0, S1).map(P.evKey);
  }
  function ruleBits(r) { return (SEL_BITS[r.sel.t] || 4) + (OP_BITS[r.op.o] || 4) + (r.pre ? 3 : 0); }

  /* One transition: the rules consistent with it (they predict only events
     that happened) and which of its events each explains. */
  function explainTransition(t) {
    if (t._ex) return t._ex;
    var keys = t.ev.map(P.evKey), keySet = new Set(keys), cands = new Map();
    t.ev.forEach(function (e) {
      if (!e.p) return;
      selectorsFor(t.S0, e.p.id, t.cx).forEach(function (sel) {
        opsFor(e, t.S0).forEach(function (op) {
          var rule = { sel: sel, op: op }, rk = selKey(sel) + "|" + opKey(op);
          if (cands.has(rk)) return;
          var pe = predictedEvents(t, rule);
          if (!pe.length || !pe.every(function (k) { return keySet.has(k); })) return;
          rule.key = rk; rule.bits = ruleBits(rule); rule.covers = pe;
          cands.set(rk, rule);
        });
      });
    });
    t._ex = { keys: keys, cands: cands };
    return t._ex;
  }

  /* A context's version space: rules consistent with EVERY transition of
     the context (explaining something in at least one, never predicting a
     non-event), then the cheapest covers of all events. */
  function induceContext(trs) {
    if (!trs.length) return { covers: [[]], complete: true };
    var ex = trs.map(explainTransition), pool = new Map();
    ex.forEach(function (x) { x.cands.forEach(function (r, k) { if (!pool.has(k)) pool.set(k, r); }); });
    /* merged colour maps: for every selector that explains a recolour
       somewhere, the union of all from->to pairs its objects showed; kept
       only when it is a function */
    var bySel = {};
    trs.forEach(function (t, i) {
      t.ev.forEach(function (e) {
        if (e.t !== "recolor") return;
        ex[i].cands.forEach(function (r) {
          if (r.op.o !== "recolor" && r.op.o !== "swapcol") return;
          if (select(t.S0, r.sel, t.cx).indexOf(e.p.id) < 0) return;
          var sk = selKey(r.sel), m = bySel[sk] || (bySel[sk] = { sel: r.sel, m: {}, bad: false });
          if (m.m[e.from] !== undefined && m.m[e.from] !== e.to) m.bad = true; else m.m[e.from] = e.to;
        });
      });
    });
    Object.keys(bySel).forEach(function (sk) {
      var b = bySel[sk]; if (b.bad || Object.keys(b.m).length < 2) return;
      var rule = { sel: b.sel, op: { o: "map", m: b.m } }; rule.key = selKey(rule.sel) + "|" + opKey(rule.op); rule.bits = ruleBits(rule);
      if (!pool.has(rule.key)) pool.set(rule.key, rule);
    });
    var rules = [];
    pool.forEach(function (r) {
      var ok = true, covers = [];
      for (var i = 0; i < trs.length && ok; i++) {
        var keySet = new Set(ex[i].keys), pe = ex[i].cands.has(r.key) ? ex[i].cands.get(r.key).covers : predictedEvents(trs[i], r);
        if (!pe.every(function (k) { return keySet.has(k); })) ok = false; else covers.push(pe);
      }
      if (ok) rules.push({ rule: r, covers: covers });
    });
    /* greedy covers: most new events per bit; up to 3 alternatives by
       excluding the first pick of the previous cover */
    var need = ex.map(function (x) { return x.keys; }), out = [], banned = new Set();
    for (var alt = 0; alt < 3; alt++) {
      var left = need.map(function (k) { return new Set(k); }), chosen = [];
      for (;;) {
        var best = null, bs = 0;
        rules.forEach(function (rc) {
          if (banned.has(rc.rule.key) || chosen.indexOf(rc) >= 0) return;
          var gain = 0; rc.covers.forEach(function (pe, i) { pe.forEach(function (k) { if (left[i].has(k)) gain++; }); });
          var sc = gain / rc.rule.bits;
          if (gain && sc > bs) { bs = sc; best = rc; }
        });
        if (!best) break;
        chosen.push(best); best.covers.forEach(function (pe, i) { pe.forEach(function (k) { left[i].delete(k); }); });
      }
      var complete = left.every(function (s) { return !s.size; });
      if (!chosen.length && !complete) break;
      var key = chosen.map(function (c) { return c.rule.key; }).sort().join("&");
      if (!out.some(function (o) { return o.key === key; })) out.push({ key: key, rules: chosen.map(function (c) { return c.rule; }), complete: complete, bits: chosen.reduce(function (a, c) { return a + c.rule.bits; }, 0) });
      if (!chosen.length) break;
      banned.add(chosen[0].rule.key);
    }
    if (!out.length) out.push({ key: "", rules: [], complete: need.every(function (k) { return !k.length; }), bits: 0 });
    out.sort(function (a, b) { return (b.complete - a.complete) || (a.bits - b.bits); });
    return { covers: out, complete: out[0].complete };
  }

  root.C4Arc3AgentModel = { select: select, simulate: simulate, applyOp: applyOp, explainTransition: explainTransition, induceContext: induceContext,
    predictedEvents: predictedEvents, selKey: selKey, opKey: opKey, rayNbrs: rayNbrs };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ================================================================== AGENT */
(function (root) {
  "use strict";
  var P = root.C4Arc3AgentParts, M = root.C4Arc3AgentModel;

  /* ------------------------------------------------------- goal grammar
     Hypotheses about the level's win condition, instantiated on the state:
       clear(c)          no cell of colour c remains (collect, cover, erase,
                         reach: an avatar standing on the goal hides it)
       match(A,B,mode)   panel B reproduces panel A: exactly, or as the mask
                         of one colour (templates, targets, patterns)
     Panels come from separator lines (a full row/column of one colour). */
  function panels(S) {
    var H = S.H, W = S.W, g = S.g, out = [], r, c, seps = { rows: [], cols: [] };
    for (r = 0; r < H; r++) { var v = g[r][0]; if (v !== S.bg && v !== S.frame && g[r].every(function (x) { return x === v; })) seps.rows.push(r); }
    for (c = 0; c < W; c++) { var u = g[0][c]; if (u !== S.bg && u !== S.frame && g.every(function (row) { return row[c] === u; })) seps.cols.push(c); }
    function bands(list, n) { var b = [], s = 0; list.concat([n]).forEach(function (x) { if (x - s >= 1) b.push([s, x - 1]); s = x + 1; }); return b; }
    if (seps.rows.length) { var br = bands(seps.rows, H); for (var i = 0; i < br.length; i++) for (var j = 0; j < br.length; j++) if (i !== j && br[i][1] - br[i][0] === br[j][1] - br[j][0]) out.push({ A: [br[i][0], 0, br[i][1], W - 1], B: [br[j][0], 0, br[j][1], W - 1] }); }
    if (seps.cols.length) { var bc = bands(seps.cols, W); for (var i2 = 0; i2 < bc.length; i2++) for (var j2 = 0; j2 < bc.length; j2++) if (i2 !== j2 && bc[i2][1] - bc[i2][0] === bc[j2][1] - bc[j2][0]) out.push({ A: [0, bc[i2][0], H - 1, bc[i2][1]], B: [0, bc[j2][0], H - 1, bc[j2][1]] }); }
    return out;
  }
  function regionDiff(S, A, B, mode, col) {
    var d = 0, h = A[2] - A[0], w = A[3] - A[1];
    for (var r = 0; r <= h; r++) for (var c = 0; c <= w; c++) {
      var a = S.g[A[0] + r][A[1] + c], b = S.g[B[0] + r][B[1] + c];
      if (mode === "exact") { if (a !== b) d++; }
      else { var am = a !== S.bg, bm = b === col; if (am !== bm) d++; }
    }
    return d;
  }
  function colorsOf(S) { var s = {}; S.objs.forEach(function (o) { s[o.color] = (s[o.color] || 0) + o.n; }); return s; }
  function goalHyps(S) {
    var hs = [], cols = colorsOf(S);
    Object.keys(cols).forEach(function (c) { hs.push({ key: "clear:" + c, type: "clear", c: +c, prior: 1 }); });
    panels(S).forEach(function (pp, i) {
      hs.push({ key: "match:exact:" + pp.A + ">" + pp.B, tkey: "match:exact", type: "match", mode: "exact", A: pp.A, B: pp.B, prior: 3 });
      Object.keys(cols).forEach(function (c) { hs.push({ key: "match:mask:" + c + ":" + pp.A + ">" + pp.B, tkey: "match:mask:" + c, type: "match", mode: "mask", col: +c, A: pp.A, B: pp.B, prior: 2 }); });
    });
    hs.forEach(function (h) { if (!h.tkey) h.tkey = h.key; });
    return hs;
  }
  function goalDist(S, h) {
    if (h.type === "clear") { var n = 0; S.objs.forEach(function (o) { if (o.color === h.c) n += o.n; }); return n; }
    if (h.type === "match") return regionDiff(S, h.A, h.B, h.mode, h.col);
    return Infinity;
  }

  /* ------------------------------------------------------------- agent */
  function Agent(opts) {
    this.opts = opts || {};
    this.cfg = {
      ig: this.opts.ig !== false, goals: this.opts.goals !== false, memory: this.opts.memory !== false,
      plan: this.opts.plan !== false, latent: this.opts.latent !== false, ticks: this.opts.ticks !== false,
      maxNodes: this.opts.maxNodes || 1500
    };
    this.stats = { predicted: 0, correct: 0, byK: {}, contextsTried: 0, goalConfirmedAt: null, modeLog: [] };
  }
  Agent.prototype.start = function (info) {
    this.avail = (info.available_actions || [1, 2, 3, 4, 5, 6]).slice();
    this.simple = this.avail.filter(function (a) { return a !== 6 && a !== 0; });
    this.canClick = this.avail.indexOf(6) >= 0;
    this.trs = [];            /* all transitions of the game (every level) */
    this.death = {};          /* context -> game-over count */
    this.goalW = {};          /* goal template -> weight (persists across levels) */
    this.goalConfirmed = {};  /* template -> times it held at a level completion */
    this.level = 0; this.nInLevel = 0;
    this.newLevel();
  };
  Agent.prototype.newLevel = function () {
    this.L = new P.Lattice(); this.S = null; this.last = null; this.plan = null;
    this.counts = {}; this.lc = null; this.vel = {}; this.levelSteps = 0;
    this.refuted = {};
    this.cache = {};
    if (!this.cfg.memory) { this.trs = []; this.goalW = {}; this.goalConfirmed = {}; this.death = {}; }
  };
  Agent.prototype.perceive = function (f) {
    var lg = this.L.logical(f), bi = P.background(lg);
    return P.parse(lg, bi);
  };
  /* ---------------------------------------------------- contexts */
  Agent.prototype.ctxKeys = function (S, a, k) {
    if (a !== 6) return ["a:" + a];
    if (k < 0) return ["kbg"];
    var o = S.objs[k]; return ["k:" + o.cls, "kc:" + o.color, "k*"];
  };
  Agent.prototype.features = function (key) {
    var f = { occ: (this.counts[key] || 0) % 2, sel: this.lc ? 1 : 0 };
    var self = this; this.simple.forEach(function (a) { f["par:" + a] = (self.counts["a:" + a] || 0) % 2; });
    return f;
  };
  /* follow the last-clicked object through moves / rotations / recolours */
  Agent.prototype.lcIndex = function (S) {
    if (!this.lc) return -1;
    var lc = this.lc, best = -1, bd = Infinity;
    S.objs.forEach(function (o) {
      if (o.cls.split("/")[1] !== lc.canon && o.color !== lc.color) return;
      var d = Math.abs(o.cr - lc.cr) + Math.abs(o.cc - lc.cc);
      if (d < bd) { bd = d; best = o.id; }
    });
    return bd <= 3 ? best : -1;
  };
  Agent.prototype.velocities = function (ev) {
    var v = {};
    ev.forEach(function (e) { if (e.t === "move") v[e.n.r0 + "," + e.n.c0 + ":" + e.n.color] = [Math.sign(e.dr), Math.sign(e.dc)]; });
    return v;
  };

  /* ---------------------------------------------------- induction */
  Agent.prototype.ticks = function () {
    if (this.cache.ticks) return this.cache.ticks;
    var trs = this.trs, rules = [];
    if (this.cfg.ticks && trs.length >= 2) {
      var cands = {};
      trs.forEach(function (t) { t.ev.forEach(function (e) { if (e.t === "move") { cands["color:" + e.p.color] = { t: "color", c: e.p.color }; } }); });
      Object.keys(cands).forEach(function (k) {
        var rule = { sel: cands[k], op: { o: "patrol" } }, hits = 0, ok = true, acts = {};
        trs.forEach(function (t) {
          if (!ok) return;
          var keys = new Set(t.ev.map(P.evKey)), pe = M.predictedEvents(t, rule);
          if (!pe.every(function (x) { return keys.has(x); })) ok = false; else if (pe.length) { hits++; acts[t.a] = 1; }
        });
        if (ok && hits >= 2 && Object.keys(acts).length >= 2) rules.push(rule);
      });
    }
    this.cache.ticks = rules;
    return rules;
  };
  Agent.prototype.residual = function (t) {
    var ticks = this.ticks();
    if (!ticks.length) return t;
    var tk = new Set();
    ticks.forEach(function (r) { M.predictedEvents(t, r).forEach(function (k) { tk.add(k); }); });
    if (!tk.size) return t;
    if (!t._res || t._resN !== ticks.length) { t._res = { S0: t.S0, a: t.a, cx: t.cx, ev: t.ev.filter(function (e) { return !tk.has(P.evKey(e)); }), f: t.f, keys: t.keys, _pe: t._pe }; t._resN = ticks.length; }
    return t._res;
  };
  /* a context's model: plain covers, or a latent split when the plain
     version space cannot explain every observation */
  Agent.prototype.model = function (key) {
    if (this.cache[key]) return this.cache[key];
    var self = this, trs = this.trs.filter(function (t) { return t.keys.indexOf(key) >= 0; }).map(function (t) { return self.residual(t); });
    var res = { n: trs.length, plain: trs.length ? M.induceContext(trs) : null, split: null };
    if (trs.length && !res.plain.complete && this.cfg.latent) {
      var feats = Object.keys(trs[0].f), best = null;
      feats.forEach(function (fk) {
        var parts = {}; trs.forEach(function (t) { var v = t.f[fk]; (parts[v] = parts[v] || []).push(t); });
        var vals = Object.keys(parts); if (vals.length < 2) return;
        var ind = {}, bits = 3, ok = true;
        vals.forEach(function (v) { ind[v] = M.induceContext(parts[v]); if (!ind[v].complete) ok = false; bits += ind[v].covers[0].bits; });
        if (ok && (!best || bits < best.bits)) best = { f: fk, parts: ind, bits: bits };
      });
      res.split = best;
    }
    this.cache[key] = res;
    return res;
  };
  /* rules for acting in state S with action a on object k: from the most
     specific observed context; null = unknown */
  Agent.prototype.rulesFor = function (S, a, k, alt) {
    var keys = this.ctxKeys(S, a, k), self = this;
    for (var i = 0; i < keys.length; i++) {
      var m = this.model(keys[i]);
      if (!m.n) continue;
      if (m.split) { var fv = this.features(keys[i])[m.split.f], part = m.split.parts[fv]; if (part) return { key: keys[i], rules: part.covers[Math.min(alt || 0, part.covers.length - 1)].rules, complete: true, split: m.split.f, alts: part.covers.length }; continue; }
      if (m.plain.complete || i === keys.length - 1) return { key: keys[i], rules: m.plain.covers[Math.min(alt || 0, m.plain.covers.length - 1)].rules, complete: m.plain.complete, alts: m.plain.covers.length };
    }
    return null;
  };
  /* predicted next state (grid) of one action, or null when unknown */
  Agent.prototype.predictState = function (S, a, k, alt, ctxOverride) {
    var rs = this.rulesFor(S, a, k, alt);
    if (!rs) return null;
    var cx = ctxOverride || { k: k, lc: this.lcIndex(S), vel: this.vel }, applied = [];
    rs.rules.forEach(function (r) { var ids = M.select(S, r.sel, cx); if (ids.length) applied.push({ rule: r, objs: ids }); });
    this.ticks().forEach(function (r) { var ids = M.select(S, r.sel, cx); if (ids.length) applied.push({ rule: r, objs: ids }); });
    return { g: M.simulate(S, applied, cx), known: rs.complete, key: rs.key, alts: rs.alts };
  };

  /* ---------------------------------------------------- observe */
  Agent.prototype.observe = function (obs) {
    var frames = obs.frames || [];
    this.state = obs.state;
    if (!frames.length) return;
    var levelUp = (obs.levels_completed || 0) > this.level;
    if (levelUp) {
      /* the frame before the new level shows the winning configuration */
      var winF = frames.length >= 2 ? frames[frames.length - 2] : null;
      if (winF && this.S) { this.L.add(winF); this.confirmGoals(this.perceive(winF)); }
      this.level = obs.levels_completed; this.newLevel();
    }
    var f = frames[frames.length - 1];
    var relattice = this.L.add(f);
    var S = this.perceive(f);
    if (this.last && this.S && !levelUp && this.last.a !== 0) {
      if (relattice) { this.S = this.perceive(this.last.frame); }
      var t = { S0: this.S, a: this.last.a, cx: { k: this.last.k, lc: this.last.lc, vel: this.last.vel }, ev: P.events(this.S, S), f: this.last.f, keys: this.last.keys };
      this.trs.push(t);
      var cache = this.cache; t.keys.forEach(function (k) { delete cache[k]; }); delete cache.ticks;
      if (t.ev.some(function (e) { return e.t === "move"; })) this.cache = {};
      this.version = (this.version || 0) + 1;
      /* prediction check */
      if (this.last.pred) {
        var ok = P.gkey(this.last.pred.g) === P.gkey(S.g), K = Math.min(16, this.trs.length);
        this.stats.predicted++; if (ok) this.stats.correct++;
        var b = this.stats.byK[K] || (this.stats.byK[K] = [0, 0]); b[1]++; if (ok) b[0]++;
        this.lastPredOk = ok;
      } else this.lastPredOk = null;
      this.vel = this.velocities(t.ev);
      /* follow the selection */
      if (this.last.a === 6 && this.last.k >= 0) { var o = this.S.objs[this.last.k]; this.lc = { canon: o.canon, color: o.color, cr: o.cr, cc: o.cc }; }
      var li = this.lcIndex(S); if (this.lc && li >= 0) { var lo = S.objs[li]; this.lc = { canon: lo.canon, color: lo.color, cr: lo.cr, cc: lo.cc }; }
      if (obs.state === "GAME_OVER") this.last.keys.forEach(function (k) { this.death[k] = (this.death[k] || 0) + 1; }, this);
      else this.refuteGoals(S);
    }
    if (obs.state === "GAME_OVER") { this.plan = null; }
    this.S = S; this.frame = f;
  };

  /* ---------------------------------------------------- goals */
  Agent.prototype.hyps = function (S) {
    var hs = goalHyps(S), self = this;
    hs.forEach(function (h) {
      var w = self.goalW[h.tkey]; h.w = (w === undefined ? h.prior : w) * (self.refuted[h.key] ? 0.01 : 1);
      if (self.goalConfirmed[h.tkey]) h.w *= 20 * self.goalConfirmed[h.tkey];
      /* a hypothesis already true that has not ended the level is not it */
      if (goalDist(S, h) === 0) h.w *= 0.01;
    });
    return hs.sort(function (a, b) { return b.w - a.w; });
  };
  Agent.prototype.refuteGoals = function (S) {
    var self = this;
    goalHyps(S).forEach(function (h) { if (goalDist(S, h) === 0) self.refuted[h.key] = 1; });
  };
  Agent.prototype.confirmGoals = function (Wst) {
    var self = this, hs = goalHyps(Wst), held = hs.filter(function (h) { return goalDist(Wst, h) === 0; });
    if (!this.cfg.goals) return;
    hs.forEach(function (h) { self.goalW[h.tkey] = (self.goalW[h.tkey] === undefined ? h.prior : self.goalW[h.tkey]) * (goalDist(Wst, h) === 0 ? 5 : 0.05); });
    held.forEach(function (h) { self.goalConfirmed[h.tkey] = (self.goalConfirmed[h.tkey] || 0) + 1; });
    if (this.stats.goalConfirmedAt === null && held.length) this.stats.goalConfirmedAt = this.trs.length;
  };

  /* ---------------------------------------------------- candidate actions */
  Agent.prototype.candidates = function (S) {
    var out = [], self = this;
    this.simple.forEach(function (a) { out.push({ a: a, k: -1 }); });
    if (this.canClick) {
      var byCls = {};
      S.objs.forEach(function (o) { if (o.n > S.H * S.W / 3) return; (byCls[o.cls] = byCls[o.cls] || []).push(o.id); });
      Object.keys(byCls).forEach(function (c) { byCls[c].forEach(function (id) { out.push({ a: 6, k: id }); }); });
    }
    return out;
  };
  Agent.prototype.toAction = function (S, c) {
    if (c.a !== 6) return { id: c.a };
    var o = S.objs[c.k], cell = o.cells[Math.floor(o.cells.length / 2)], p = this.L.pixelOf((cell / S.W) | 0, cell % S.W);
    return { id: 6, x: p.x, y: p.y };
  };
  /* expected information: unknown contexts are worth most; known contexts
     with competing explanations that disagree here are worth the entropy
     of their predictions; risky contexts are penalised */
  Agent.prototype.infoGain = function (S, c) {
    var keys = this.ctxKeys(S, c.a, c.k), m0 = this.model(keys[0]);
    var risk = 0, self = this; keys.forEach(function (k) { if (self.death[k]) risk += 2 * self.death[k]; });
    if (!m0.n) {
      var generic = c.a === 6 ? this.rulesFor(S, c.a, c.k) : null;
      return { ig: generic && generic.complete ? 0.4 : 1.0, risk: risk + 0.05 };
    }
    var rs = this.rulesFor(S, c.a, c.k);
    if (!rs || rs.alts < 2) return { ig: rs && !rs.complete ? 0.3 : 0, risk: risk };
    var preds = {};
    for (var alt = 0; alt < Math.min(3, rs.alts); alt++) { var p = this.predictState(S, c.a, c.k, alt); if (p) preds[P.gkey(p.g)] = 1; }
    var n = Object.keys(preds).length;
    return { ig: n > 1 ? Math.log2(n) * 0.6 : 0, risk: risk };
  };

  /* ---------------------------------------------------- planning */
  function stateFromGrid(S, g) { return P.parse(g, { bg: S.bg, frame: S.frame }); }
  Agent.prototype.planTo = function (S0, h) {
    var self = this, cap = this.cfg.maxNodes, seen = new Set([P.gkey(S0.g)]), open = [{ S: S0, path: [], g: 0, f: goalDist(S0, h) }], n = 0;
    var saveLc = this.lc, saveVel = this.vel, saveCounts = this.counts;
    try {
      while (open.length && n < cap) {
        var bi = 0; for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        var cur = open[bi]; open.splice(bi, 1); n++;
        var cands = this.candidates(cur.S);
        for (var j = 0; j < cands.length; j++) {
          var c = cands[j], keys = this.ctxKeys(cur.S, c.a, c.k);
          if (keys.some(function (k) { return self.death[k]; })) continue;
          var pr = this.predictState(cur.S, c.a, c.k, 0, { k: c.k, lc: -1, vel: {} });
          if (!pr || !pr.known) continue;
          var gk = P.gkey(pr.g); if (seen.has(gk)) continue; seen.add(gk);
          var S2 = stateFromGrid(cur.S, pr.g), d = goalDist(S2, h), path = cur.path.concat([c]);
          if (d === 0) return path;
          if (path.length < 40) open.push({ S: S2, path: path, g: path.length, f: path.length + 2 * d });
        }
      }
    } finally { this.lc = saveLc; this.vel = saveVel; this.counts = saveCounts; }
    return null;
  };

  /* ---------------------------------------------------- act */
  Agent.prototype.act = function () {
    var S = this.S;
    if (this.state === "GAME_OVER" || !S) { this.last = { a: 0 }; return { id: 0 }; }
    var choice = null, mode = "explore";
    /* continue a plan while its predictions hold */
    if (this.plan && this.plan.length && this.lastPredOk !== false) { choice = this.plan.shift(); mode = "execute"; }
    else this.plan = null;
    if (!choice) {
      var cands = this.candidates(S), self = this, scored = [];
      cands.forEach(function (c) { var v = self.infoGain(S, c); scored.push({ c: c, ig: v.ig, risk: v.risk }); });
      var unknown = scored.filter(function (x) { return x.ig >= 0.99 && x.risk < 1; });
      /* one representative per unknown class: the rarest classes first */
      var hs = this.cfg.goals ? this.hyps(S) : [], confirmed = hs.length && this.goalConfirmed[hs[0].tkey];
      var planned = null;
      if (this.cfg.plan && (confirmed || !unknown.length || !this.cfg.ig)) {
        var sk = (this.version || 0) + "|" + P.gkey(S.g);
        this.noPlan = this.noPlan || {};
        for (var i = 0; i < Math.min(hs.length, 4) && !planned; i++) {
          if (hs[i].w < 1e-3) break;
          var mk = sk + "|" + hs[i].key; if (this.noPlan[mk]) continue;
          var pl = this.planTo(S, hs[i]); if (pl && pl.length) planned = pl; else this.noPlan[mk] = 1;
        }
      }
      if (planned) { this.plan = planned; choice = this.plan.shift(); mode = "execute"; }
      else if (this.cfg.ig && scored.length) {
        scored.sort(function (a, b) { return (b.ig - b.risk) - (a.ig - a.risk) || ((a.c.k >= 0 ? S.objs[a.c.k].n : 0) - (b.c.k >= 0 ? S.objs[b.c.k].n : 0)); });
        var top = scored[0];
        if (top.ig - top.risk <= 0) {
          /* nothing informative left and no plan: a safe action not yet
             repeated in this exact state */
          var safe = scored.filter(function (x) { return x.risk < 1; });
          top = safe[(this.levelSteps + this.trs.length) % Math.max(1, safe.length)] || scored[0];
          mode = "fallback";
        }
        choice = top.c;
      } else {
        var cs = this.candidates(S); choice = cs[(this.levelSteps * 7) % cs.length]; mode = "random";
      }
    }
    /* keep the chosen object valid in the current state */
    if (choice.a === 6 && (choice.k < 0 || choice.k >= S.objs.length)) { this.plan = null; choice = { a: this.simple[0] || 6, k: this.simple.length ? -1 : 0 }; }
    var keys = this.ctxKeys(S, choice.a, choice.k), self2 = this;
    var pred = this.predictState(S, choice.a, choice.k, 0);
    this.last = { a: choice.a, k: choice.k, lc: this.lcIndex(S), vel: this.vel, keys: keys, f: {}, pred: pred && pred.known ? pred : null, frame: this.frame };
    keys.forEach(function (k) { self2.last.f = self2.features(k); });
    keys.forEach(function (k) { self2.counts[k] = (self2.counts[k] || 0) + 1; });
    if (choice.a !== 6) this.counts["a:" + choice.a] = (this.counts["a:" + choice.a] || 0);
    this.levelSteps++;
    this.stats.modeLog.push({ explore: "x", execute: "p", fallback: "f", random: "r" }[mode] || "?");
    return this.toAction(S, choice);
  };
  Agent.prototype.predictLast = function () { return this.last && this.last.pred ? this.last.pred : null; };

  root.C4Arc3Agent = { Agent: Agent, goalHyps: goalHyps, goalDist: goalDist, panels: panels };
  if (typeof module !== "undefined" && module.exports) module.exports = { Agent: Agent, parts: P, model: M, goalHyps: goalHyps, goalDist: goalDist, panels: panels };
})(typeof globalThis !== "undefined" ? globalThis : this);
