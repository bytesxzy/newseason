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
     Each edge position (a colour change between neighbouring pixels) is
     weighted by its length: how many rows / columns show it, at most over
     the frames seen in the level. A period s with offset o is scored by the
     share of edge weight on its lattice lines plus a coarseness prior
     (lambda * ln s): a status line's few pixels cannot force a finer lattice
     than the game's cells, and a multiple of the true period loses the
     edges between its lines. An offset leaves partial cells at the screen
     borders, allowed only when those margins are (mostly) one colour, a
     frame, which rules out periods fitting a few edges by coincidence. */
  function Lattice() { this.ex = new Float64Array(65); this.ey = new Float64Array(65); this.frames = []; this.s = 0; this.ox = 0; this.oy = 0; }
  Lattice.LAMBDA = 0.2;
  Lattice.prototype.add = function (f) {
    var H = f.length, W = f[0].length, y, x, changed = false, cx = new Float64Array(65), cy = new Float64Array(65);
    for (y = 0; y < H; y++) for (x = 1; x < W; x++) if (f[y][x] !== f[y][x - 1]) cx[x]++;
    for (y = 1; y < H; y++) for (x = 0; x < W; x++) if (f[y][x] !== f[y - 1][x]) cy[y]++;
    for (x = 0; x < 65; x++) { if (cx[x] > this.ex[x]) { if (!this.ex[x]) changed = true; this.ex[x] = cx[x]; } if (cy[x] > this.ey[x]) { if (!this.ey[x]) changed = true; this.ey[x] = cy[x]; } }
    if (changed || !this.s) {
      this.frames.push(f); if (this.frames.length > 8) this.frames.splice(1, 1);
      this.solve(H, W);
    }
    return changed;
  };
  /* is the strip [a, b) of columns (or rows) a frame: at least 80% one
     colour in every stored frame (status indicators may sit in it)? */
  Lattice.prototype.uniformStrip = function (a, b, rowsAxis) {
    if (b <= a) return true;
    return this.frames.every(function (f) {
      var H = f.length, W = f[0].length, cnt = {}, n = 0, mx = 0;
      for (var i = a; i < b; i++) for (var j = 0; j < (rowsAxis ? W : H); j++) { var v = rowsAxis ? f[i][j] : f[j][i]; cnt[v] = (cnt[v] || 0) + 1; n++; if (cnt[v] > mx) mx = cnt[v]; }
      return mx >= 0.8 * n;
    });
  };
  Lattice.prototype.solve = function (H, W) {
    var self = this;
    function best(w, s, n, rowsAxis) {
      var tot = 0, by = new Float64Array(s), i;
      for (i = 1; i < 65; i++) { tot += w[i]; by[i % s] += w[i]; }
      if (!tot) return { o: 0, f: 1 };
      var order = []; for (i = 0; i < s; i++) order.push(i);
      order.sort(function (a, b) { return by[b] - by[a]; });
      for (var q = 0; q < order.length; q++) {
        var o = order[q], end = o + s * Math.floor((n - o) / s);
        if (by[o] / tot < 0.6) break;
        if (self.uniformStrip(0, o, rowsAxis) && self.uniformStrip(end, n, rowsAxis)) return { o: o, f: by[o] / tot };
      }
      return { o: 0, f: 0 };
    }
    var s = 1, bx = { o: 0 }, by2 = { o: 0 }, bs = -Infinity, lam = Lattice.LAMBDA;
    for (var k = 1; k <= 16; k++) {
      var qx = best(this.ex, k, W, false), qy = best(this.ey, k, H, true), f = Math.min(qx.f, qy.f), sc = f + lam * Math.log(k);
      if (f >= 0.6 && sc > bs + 1e-9) { bs = sc; s = k; bx = qx; by2 = qy; }
    }
    this.s = s; this.ox = bx.o; this.oy = by2.o;
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
    /* the play box: inside a uniform outer ring (the frame around the game
       area) that does not occur inside it */
    var f = g[0][0], ring = true, p0 = 0, p1 = H - 1, q0 = 0, q1 = W - 1;
    /* the frame need not surround the game on all four sides (a game as
       wide as the screen has bands above and below only) */
    var any = false;
    for (c = 0; c < W && !any; c++) if (g[0][c] !== f) any = true;
    var topU = !any; any = false;
    for (r = 0; r < H && !any; r++) if (g[r][0] !== f) any = true;
    var leftU = !any;
    ring = topU || leftU;
    if (ring) {
      var allF = function (a, b, cc0, cc1) { for (var y = a; y <= b; y++) for (var x = cc0; x <= cc1; x++) if (g[y][x] !== f) return false; return true; };
      while (p1 > p0 && allF(p0, p0, q0, q1)) p0++;
      while (p1 > p0 && allF(p1, p1, q0, q1)) p1--;
      while (q1 > q0 && allF(p0, p1, q0, q0)) q0++;
      while (q1 > q0 && allF(p0, p1, q1, q1)) q1--;
      for (r = p0; r <= p1 && ring; r++) for (c = q0; c <= q1; c++) if (g[r][c] === f) { ring = false; break; }
      if (!ring) { p0 = 0; p1 = H - 1; q0 = 0; q1 = W - 1; }
    }
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
    return { bg: best, frame: ring && f !== best ? f : -1, box: [p0, q0, p1, q1] };
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
    return { g: g, H: H, W: W, bg: bg, frame: bgInfo.frame, objs: objs, at: seen, box: bgInfo.box || [0, 0, H - 1, W - 1] };
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
    /* moved AND recoloured (a crate taking another colour on a pad): same
       shape, near; reported as the move plus a separate TINT of the arrival,
       so a rule predicting only the move stays consistent */
    for (i = 0; i < P.objs.length; i++) {
      if (matched[i] >= 0) continue;
      var a6 = P.objs[i], b6i = -1, d6 = Infinity;
      for (j = 0; j < N.objs.length; j++) {
        var b6 = N.objs[j];
        if (usedN[j] || b6.shape !== a6.shape || b6.color === a6.color) continue;
        var dd = Math.abs(b6.r0 - a6.r0) + Math.abs(b6.c0 - a6.c0);
        if (dd > 0 && dd <= 2 && dd < d6) { d6 = dd; b6i = j; }
      }
      if (b6i >= 0) { var nb = N.objs[b6i]; usedN[b6i] = 1; matched[i] = b6i; ev.push({ t: "move", p: a6, n: nb, dr: nb.r0 - a6.r0, dc: nb.c0 - a6.c0, recol: nb.color }); ev.push({ t: "tint", p: a6, n: nb, from: a6.color, to: nb.color }); }
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
    if (e.t === "tint") return "t" + e.n.r0 + "," + e.n.c0 + ">" + e.to;
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
  /* the clicked CELL as an object: a second segmentation for clicks, whose
     effects are often local to one cell of a larger same-coloured region */
  function cellObj(S, cx) {
    var c = cx.cell, W = S.W, r = (c / W) | 0, col = c % W, v = S.g[r][col];
    return { id: -2, color: v, cells: [c], n: 1, r0: r, r1: r, c0: col, c1: col, cr: r, cc: col, shape: "0,0", canon: "0,0", cls: v + "/0,0" };
  }
  function objOf(S, id, cx) { return id === -2 ? cellObj(S, cx) : S.objs[id]; }
  function select(S, sel, cx) {
    var k = cx.k, o = k >= 0 ? S.objs[k] : null, lc = cx.lc >= 0 ? S.objs[cx.lc] : null;
    switch (sel.t) {
      case "cell": return cx.cell >= 0 ? [-2] : [];
      case "clicked": return o ? [k] : [];
      case "lastClicked": return lc && (sel.c === undefined || lc.color === sel.c) ? [cx.lc] : [];
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
  var SEL_BITS = { cell: 1.5, clicked: 1, lastClicked: 2, nbr4: 3, ray4: 3, clickedRay4: 2.5, row: 3, col: 3, sameColor: 3, sameClass: 3.5, color: 4, cls: 5 };
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
      case "grow": case "shrink": {
        /* extend (or cut) the object by one cell at its end in direction d:
           bars, gauges, counters, snakes */
        var W = S.W, ext = -1, best = -Infinity;
        o.cells.forEach(function (c) { var s = ((c / W) | 0) * op.dr + (c % W) * op.dc; if (s > best) { best = s; ext = c; } });
        if (op.o === "grow") {
          var y = ((ext / W) | 0) + op.dr, x = ext % W + op.dc;
          if (y < 0 || x < 0 || y >= S.H || x >= W || S.g[y][x] !== S.bg) return undefined;
          return { cells: o.cells.concat([y * W + x]), color: o.color };
        }
        if (o.cells.length <= 1) return null;
        return { cells: o.cells.filter(function (c) { return c !== ext; }), color: o.color };
      }
      case "rotate": return { cells: rotateCells(o, S.W, op.k, op.anchor), color: o.color };
      case "move": case "slide": case "patrol": case "moveTo": return { move: op, cells: o.cells, color: o.color };
      case "spawn": {
        /* a new object of a learned shape and colour at an offset from the
           anchor (selection markers, placed blocks, projectiles) */
        var Ws = S.W, cells = op.shape.split(";").map(function (q) { var pq = q.split(","); return (o.r0 + op.dr + +pq[0]) * Ws + (o.c0 + op.dc + +pq[1]); });
        return { spawn: true, cells: cells, color: op.color };
      }
    }
    return undefined;
  }
  var OP_BITS = { recolor: 3, swapcol: 3.5, cycle: 5, map: 4, delete: 1.5, grow: 3.5, shrink: 3.5, spawn: 5, rotate: 3, move: 3, slide: 3.5, patrol: 3, moveTo: 3, select: 1, togglevar: 2 };
  function opKey(op) { return op.o + (op.to !== undefined ? ":" + op.to : "") + (op.a !== undefined ? ":" + op.a + "/" + op.b : "") + (op.seq ? ":" + op.seq.join("") : "") + (op.k !== undefined ? ":" + op.k + (op.anchor || "") : "") + (op.dr !== undefined ? ":" + op.dr + "," + op.dc : "") + (op.ref ? ":" + op.ref : "") + (op.shape ? ":" + op.color + "@" + op.shape : "") + (op.m ? ":" + Object.keys(op.m).sort().map(function (k) { return k + ">" + op.m[k]; }).join(",") : ""); }

  /* inventories: sorted arrays of collected colours */
  function invHas(inv, need) { return !need || need.every(function (c) { return inv.indexOf(c) >= 0; }); }
  function invAdd(inv, c) { return inv.concat([c]).sort(function (a, b) { return a - b; }); }
  /* ------------------------------------------------------------ simulate
     Next grid from a state and a set of (rule, selected objects): colour and
     shape changes first, then moves, resolved against a CONTACT MODEL
     learned from experience (cx.phys.pass[colour] = {k, need, succ}):
       hide     the mover covers it; it is remembered in the UNDERLAY and
                shows again when the mover leaves
       collect  the entered object vanishes into the inventory (the
                collected colours)
       push     the entered object moves on, if it can
       deadly   entering it, or overlapping a mover of that colour, ends
                the game (out.dead)
     A passage refused before and taken later needs what was held when it
     was taken (keys and doors, without naming either): it blocks unless
     the inventory holds those colours. Every other colour blocks; while planning,
     untested colours may be assumed passable (cx.optimistic). An object
     arriving on colour v may take colour phys.tint[own>v]. Autonomous movers
     (ticks) may overlap actors: that is a contact, not a block.
     Results besides the grid go to cx.out: dead, contacts, into (colours
     that blocked an actor), vel, under, inv of the next state. */
  function simulate(S, applied, cx) {
    var H = S.H, W = S.W, g = S.g.map(function (row) { return row.slice(); }), changes = {}, objs = {}, moves = [], ticks = {}, spawns = [];
    var phys = cx.phys || {}, pass = phys.pass || {}, deadly = phys.deadly || {}, tint = phys.tint || {}, opt = cx.optimistic || {};
    var inv = cx.inv || [], under = {}, vel = {}, out = { dead: false, contacts: [], into: [], vel: vel, under: under, inv: inv };
    cx.out = out;
    if (cx.under) for (var uk in cx.under) under[uk] = cx.under[uk];
    function kind(v) { var p = pass[v]; if (p && invHas(inv, p.need)) return p.k; if (deadly[v]) return "deadly"; return opt[v] || cx.allPass ? "hide" : null; }
    applied.forEach(function (ap) {
      ap.objs.forEach(function (id) {
        var o = objOf(S, id, cx), r = applyOp(S, o, ap.rule.op, cx);
        if (r && r.spawn) { spawns.push(r); return; }
        if (r === undefined || changes[id] !== undefined) return;
        changes[id] = r; objs[id] = o; if (ap.tick) ticks[id] = 1;
        if (r && r.move) moves.push(id);
      });
    });
    /* colour / shape changes (a deleted object uncovers what lay under it) */
    Object.keys(changes).forEach(function (id) {
      var r = changes[id]; if (r && r.move) return;
      objs[id].cells.forEach(function (c) { var u = r === null ? under[c] : undefined; g[(c / W) | 0][c % W] = u !== undefined ? u : S.bg; if (u !== undefined) delete under[c]; });
    });
    Object.keys(changes).forEach(function (id) {
      var r = changes[id]; if (!r || r.move) return;
      r.cells.forEach(function (c) { var y = (c / W) | 0, x = c % W; if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = r.color; });
    });
    spawns.forEach(function (r) { r.cells.forEach(function (c) { var y = (c / W) | 0, x = c % W; if (c >= 0 && y < H && x >= 0 && x < W && g[y][x] === S.bg) g[y][x] = r.color; }); });
    /* moves: shift until blocked (slides), else one step */
    var moving = {}, pushed = {}, placed = {}, collected = {};
    moves.forEach(function (id) { objs[id].cells.forEach(function (c) { moving[c] = id; }); });
    function place(cells, col, tr, tc, mover) {
      /* move a set of cells by (tr, tc): uncover the vacated cells, record
         what the arrival covers, apply contact tints, paint */
      var dest = {}, own = {}, entered = [];
      cells.forEach(function (c) { own[c] = 1; var y = ((c / W) | 0) + tr, x = c % W + tc; if (y >= 0 && x >= 0 && y < H && x < W) dest[y * W + x] = 1; });
      cells.forEach(function (c) { if (dest[c] || placed[c] !== undefined) return; var u = under[c]; g[(c / W) | 0][c % W] = u !== undefined ? u : S.bg; delete under[c]; });
      Object.keys(dest).forEach(function (ci) {
        ci = +ci; if (own[ci]) return;
        var v3 = g[(ci / W) | 0][ci % W];
        if (placed[ci] !== undefined) { out.contacts.push([col, v3, !!ticks[mover], !!ticks[placed[ci]]]); if (deadly[v3] || deadly[col]) out.dead = true; return; }
        if (v3 === S.bg) return;
        entered.push(v3); out.contacts.push([col, v3, !!ticks[mover], false]);
        var k = kind(v3), j = S.at[ci];
        if (k === "deadly") { out.dead = true; under[ci] = v3; }
        else if (k === "collect") { if (j >= 0 && !collected[j]) { collected[j] = 1; out.inv = invAdd(out.inv, v3); S.objs[j].cells.forEach(function (q) { if (q !== ci && placed[q] === undefined && g[(q / W) | 0][q % W] === v3) g[(q / W) | 0][q % W] = S.bg; }); } }
        else if (k !== "push") under[ci] = v3;
      });
      var paint = col;
      entered.forEach(function (v) { if (tint[col + ">" + v] !== undefined) paint = tint[col + ">" + v]; });
      Object.keys(dest).forEach(function (ci) { ci = +ci; g[(ci / W) | 0][ci % W] = paint; placed[ci] = mover; });
      return paint;
    }
    moves.forEach(function (id) {
      var o = objs[id], op = changes[id].move, dr = op.dr, dc = op.dc, steps = op.o === "slide" ? Math.max(H, W) : 1, own = {};
      o.cells.forEach(function (c) { own[c] = 1; });
      if (op.o === "patrol") { var v = cx.vel && cx.vel[o.r0 + "," + o.c0 + ":" + o.color]; if (!v) { dr = 0; dc = 0; } else { dr = v[0]; dc = v[1]; } }
      if (op.o === "moveTo") { var ref = op.ref === "clicked" ? cx.k : cx.lc; if (!(ref >= 0) || !S.objs[ref]) { dr = 0; dc = 0; } else { dr = S.objs[ref].r0 - o.r0; dc = S.objs[ref].c0 - o.c0; } }
      var blockedBy = null;
      function free(ddr, ddc) {
        return o.cells.every(function (c) {
          var y = ((c / W) | 0) + ddr, x = c % W + ddc;
          if (y < 0 || x < 0 || y >= H || x >= W) return false;
          if (op.o === "moveTo") return true;
          var i = y * W + x, v2 = g[y][x];
          if (own[i] || v2 === S.bg) return true;
          if (placed[i] !== undefined) { if (!!ticks[placed[i]] !== !!ticks[id]) return true; }
          else if (moving[i] !== undefined && moving[i] !== id) return true;
          var k = kind(v2);
          if (k === "push") {
            var j = S.at[i]; if (j < 0 || pushed[j]) return false;
            return S.objs[j].cells.every(function (q) { var yy = ((q / W) | 0) + ddr, xx = q % W + ddc; if (yy < 0 || xx < 0 || yy >= H || xx >= W) return false; var w2 = g[yy][xx], k2 = kind(w2); return w2 === S.bg || S.at[yy * W + xx] === j || (k2 && k2 !== "push" && k2 !== "deadly"); });
          }
          if (k) return true;
          if (blockedBy === null) blockedBy = v2;
          return false;
        });
      }
      var tr = 0, tc = 0;
      for (var s = 0; s < steps; s++) { if (free(tr + dr, tc + dc)) { tr += dr; tc += dc; } else break; }
      if (op.o === "patrol" && !tr && !tc && (dr || dc) && free(-dr, -dc)) { tr = -dr; tc = -dc; }
      if (!tr && !tc && blockedBy !== null && !ticks[id]) out.into.push(blockedBy);
      /* pushed objects go first, one step along */
      if (tr || tc) o.cells.forEach(function (c) {
        var y = ((c / W) | 0) + tr, x = c % W + tc; if (y < 0 || x < 0 || y >= H || x >= W) return;
        var i = y * W + x, j = S.at[i];
        if (own[i] || placed[i] !== undefined || j < 0 || pushed[j] || kind(g[y][x]) !== "push") return;
        pushed[j] = 1; out.pushed = (out.pushed || 0) + 1;
        var pb = S.objs[j], pc = place(pb.cells, pb.color, Math.sign(tr), Math.sign(tc), -3 - j);
        vel[(pb.r0 + Math.sign(tr)) + "," + (pb.c0 + Math.sign(tc)) + ":" + pc] = [Math.sign(tr), Math.sign(tc)];
      });
      var col = place(o.cells, o.color, tr, tc, id);
      if (tr || tc) vel[(o.r0 + tr) + "," + (o.c0 + tc) + ":" + col] = [Math.sign(tr), Math.sign(tc)];
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
    if (cx.lc >= 0 && S.objs[cx.lc]) { add({ t: "lastClicked" }); add({ t: "lastClicked", c: S.objs[cx.lc].color }); }
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
    else if (e.t === "reshape") {
      var pc = {}, nc = {};
      e.p.cells.forEach(function (c) { pc[c] = 1; }); e.n.cells.forEach(function (c) { nc[c] = 1; });
      var add = e.n.cells.filter(function (c) { return !pc[c]; }).length, rem = e.p.cells.filter(function (c) { return !nc[c]; }).length;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
        if (add === 1 && !rem) ops.push({ o: "grow", dr: d[0], dc: d[1] });
        if (rem === 1 && !add) ops.push({ o: "shrink", dr: d[0], dc: d[1] });
      });
    }
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
  function ruleBits(r) { return (SEL_BITS[r.sel.t] || 4) + (r.sel.t === "lastClicked" && r.sel.c !== undefined ? 2 : 0) + (OP_BITS[r.op.o] || 4) + (r.pre ? 3 : 0); }

  /* One transition: the rules consistent with it (they predict only events
     that happened) and which of its events each explains. */
  function explainTransition(t) {
    if (t._ex) return t._ex;
    var keys = t.ev.map(P.evKey), keySet = new Set(keys), cands = new Map();
    function tryRule(sel, op) {
      var rule = { sel: sel, op: op }, rk = selKey(sel) + "|" + opKey(op);
      if (cands.has(rk)) return;
      var pe = predictedEvents(t, rule);
      if (!pe.length || !pe.every(function (k) { return keySet.has(k); })) return;
      rule.key = rk; rule.bits = ruleBits(rule); rule.covers = pe;
      cands.set(rk, rule);
    }
    t.ev.forEach(function (e) {
      if (!e.p || e.t === "tint") return;
      selectorsFor(t.S0, e.p.id, t.cx).forEach(function (sel) {
        opsFor(e, t.S0).forEach(function (op) { tryRule(sel, op); });
      });
    });
    /* appearances: a spawn anchored on the clicked or last-clicked object */
    t.ev.forEach(function (e) {
      if (e.t !== "spawn") return;
      [["clicked", t.cx.k], ["lastClicked", t.cx.lc]].forEach(function (an) {
        var a = an[1] >= 0 ? t.S0.objs[an[1]] : null; if (!a) return;
        tryRule({ t: an[0] }, { o: "spawn", color: e.n.color, shape: e.n.shape, dr: e.n.r0 - a.r0, dc: e.n.c0 - a.c0 });
      });
    });
    /* the clicked cell alone (second segmentation) */
    if (t.cx.cell >= 0 && t.g1 && t.g1.length === t.S0.H && t.g1[0].length === t.S0.W && t.cx.cell < t.S0.H * t.S0.W) {
      var c = t.cx.cell, W = t.S0.W, v0 = t.S0.g[(c / W) | 0][c % W], v1 = t.g1[(c / W) | 0][c % W];
      if (v0 !== v1) (v1 === t.S0.bg ? [{ o: "delete" }] : [{ o: "recolor", to: v1 }, { o: "swapcol", a: v0, b: v1 }]).forEach(function (op) { tryRule({ t: "cell" }, op); });
    }
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
      ex[i].cands.forEach(function (r) {
        if (r.op.o !== "recolor") return;
        var sk = selKey(r.sel), m = bySel[sk] || (bySel[sk] = { sel: r.sel, m: {}, bad: false });
        select(t.S0, r.sel, t.cx).forEach(function (id) {
          var from = objOf(t.S0, id, t.cx).color;
          if (from === r.op.to) return;
          if (m.m[from] !== undefined && m.m[from] !== r.op.to) m.bad = true; else m.m[from] = r.op.to;
        });
      });
    });
    Object.keys(bySel).forEach(function (sk) {
      var b = bySel[sk]; if (b.bad || Object.keys(b.m).length < 2) return;
      var rule = { sel: b.sel, op: { o: "map", m: b.m } }; rule.key = selKey(rule.sel) + "|" + opKey(rule.op); rule.bits = ruleBits(rule);
      if (!pool.has(rule.key)) pool.set(rule.key, rule);
    });
    /* a rule may be contradicted by a few transitions (unmodelled
       exceptions, misperceived contacts): tolerated, at a description-length
       cost, so one odd observation cannot erase a context's program */
    var rules = [], tol = trs.length >= 4 ? Math.max(1, Math.floor(trs.length / 8)) : 0;
    pool.forEach(function (r) {
      var bad = 0, covers = [];
      for (var i = 0; i < trs.length && bad <= tol; i++) {
        var keySet = new Set(ex[i].keys), pe = ex[i].cands.has(r.key) ? ex[i].cands.get(r.key).covers : predictedEvents(trs[i], r);
        if (!pe.every(function (k) { return keySet.has(k); })) { bad++; covers.push([]); } else covers.push(pe);
      }
      if (bad <= tol) rules.push({ rule: r, covers: covers, bad: bad });
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
          var sc = gain / (rc.rule.bits + 4 * rc.bad);
          if (gain && sc > bs) { bs = sc; best = rc; }
        });
        if (!best) break;
        chosen.push(best); best.covers.forEach(function (pe, i) { pe.forEach(function (k) { left[i].delete(k); }); });
      }
      var complete = left.every(function (s) { return !s.size; });
      if (!chosen.length && !complete) break;
      var key = chosen.map(function (c) { return c.rule.key; }).sort().join("&"), tot = 0, unexpl = 0;
      need.forEach(function (k, i) { tot += k.length; unexpl += left[i].size; });
      if (!out.some(function (o) { return o.key === key; })) out.push({ key: key, rules: chosen.map(function (c) { return c.rule; }), complete: complete, cov: tot ? 1 - unexpl / tot : 1, bits: chosen.reduce(function (a, c) { return a + c.rule.bits + 4 * c.bad; }, 0) });
      if (!chosen.length) break;
      banned.add(chosen[0].rule.key);
    }
    if (!out.length) { var none = need.every(function (k) { return !k.length; }); out.push({ key: "", rules: [], complete: none, cov: none ? 1 : 0, bits: 0 }); }
    out.sort(function (a, b) { return (b.complete - a.complete) || (a.bits - b.bits); });
    return { covers: out, complete: out[0].complete };
  }

  root.C4Arc3AgentModel = { invHas: invHas, invAdd: invAdd, select: select, simulate: simulate, applyOp: applyOp, explainTransition: explainTransition, induceContext: induceContext,
    predictedEvents: predictedEvents, selKey: selKey, opKey: opKey, rayNbrs: rayNbrs, objOf: objOf };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ================================================================== AGENT */
(function (root) {
  "use strict";
  var P = root.C4Arc3AgentParts, M = root.C4Arc3AgentModel, invHas = M.invHas, invAdd = M.invAdd;
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  /* ------------------------------------------------------- goal grammar
     Hypotheses about the level's win condition, instantiated on the state:
       clear(c)          no cell of colour c remains, visible or hidden
                         under an actor (collect, erase, cover with an object)
       reach(c)          an actor stands on colour c
       clear2(a,b)       both colours gone (conjunctions)
       align(ax,a,b)     the single objects of colours a and b line up on an
                         edge or centre (gauges, counters, sliders)
       count(a,b)        as many cells of colour a as of colour b
       match(A,B,mode)   panel B reproduces panel A: exactly, or as the mask
                         of one colour (templates, targets, patterns)
     Actors are the objects the simple actions move; the underlay (what
     movers cover) comes from the latent state. Panels come from separator
     lines (a full row/column of one colour). */
  /* separator rows / columns of the play box: uniform, not background */
  function separators(S) {
    if (S._seps) return S._seps;
    var g = S.g, b = S.box, r, c, x, y, seps = { rows: [], cols: [] };
    for (r = b[0]; r <= b[2]; r++) { var v = g[r][b[1]], ok = v !== S.bg && v !== S.frame; for (x = b[1]; x <= b[3] && ok; x++) if (g[r][x] !== v) ok = false; if (ok) seps.rows.push(r); }
    for (c = b[1]; c <= b[3]; c++) { var u = g[b[0]][c], ok2 = u !== S.bg && u !== S.frame; for (y = b[0]; y <= b[2] && ok2; y++) if (g[y][c] !== u) ok2 = false; if (ok2) seps.cols.push(c); }
    /* a separator splits the box: the box's own edges are not separators */
    if (seps.rows.length === b[2] - b[0] + 1) seps.rows = [];
    if (seps.cols.length === b[3] - b[1] + 1) seps.cols = [];
    S._seps = seps;
    return seps;
  }
  function panels(S) {
    var b = S.box, out = [], seps = separators(S);
    function bands(list, lo, hi) { var res = [], s = lo; list.concat([hi + 1]).forEach(function (x) { if (x - s >= 1) res.push([s, x - 1]); s = x + 1; }); return res; }
    if (seps.rows.length) { var br = bands(seps.rows, b[0], b[2]); for (var i = 0; i < br.length; i++) for (var j = 0; j < br.length; j++) if (i !== j && br[i][1] - br[i][0] === br[j][1] - br[j][0]) out.push({ A: [br[i][0], b[1], br[i][1], b[3]], B: [br[j][0], b[1], br[j][1], b[3]] }); }
    if (seps.cols.length) { var bc = bands(seps.cols, b[1], b[3]); for (var i2 = 0; i2 < bc.length; i2++) for (var j2 = 0; j2 < bc.length; j2++) if (i2 !== j2 && bc[i2][1] - bc[i2][0] === bc[j2][1] - bc[j2][0]) out.push({ A: [b[0], bc[i2][0], b[2], bc[i2][1]], B: [b[0], bc[j2][0], b[2], bc[j2][1]] }); }
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
  var AXES = ["r0", "r1", "c0", "c1", "cr", "cc"];
  function goalHyps(S, actors, seen) {
    var hs = [], cols = colorsOf(S), hasActor = actors && Object.keys(actors).length;
    /* colours seen earlier in the level count too: a goal colour may be
       hidden, collected or gone by the time its hypothesis matters */
    if (seen) Object.keys(seen).forEach(function (c) { cols[c] = Math.max(cols[c] || 0, seen[c]); });
    var keys = Object.keys(cols).filter(function (c) { return !(actors && actors[c]); });
    keys.forEach(function (c) {
      /* smaller colour classes are likelier targets than walls and floors */
      var pr = 1 / (1 + Math.log(1 + cols[c]) / 2);
      hs.push({ key: "clear:" + c, type: "clear", c: +c, prior: pr });
      if (hasActor) hs.push({ key: "reach:" + c, type: "reach", c: +c, prior: pr });
    });
    keys.forEach(function (a, i) { keys.slice(i + 1).forEach(function (b) {
      hs.push({ key: "clear2:" + a + "," + b, type: "clear2", a: +a, b: +b, prior: 0.3 });
      hs.push({ key: "count:" + a + "," + b, type: "count", a: +a, b: +b, prior: 0.1 });
    }); });
    var single = keys.filter(function (c) { return S.objs.filter(function (o) { return o.color === +c; }).length === 1; });
    single.forEach(function (a, i) { single.slice(i + 1).forEach(function (b) {
      AXES.forEach(function (ax) { hs.push({ key: "align:" + ax + ":" + a + "," + b, type: "align", ax: ax, a: +a, b: +b, prior: 0.2 }); });
    }); });
    /* pairs(a,b): the objects of colour b, in reading order, take the
       shapes of the objects of colour a (templates, orientations, copies) */
    var nObj = {}; S.objs.forEach(function (o) { nObj[o.color] = (nObj[o.color] || 0) + 1; });
    keys.forEach(function (a) { keys.forEach(function (b) {
      if (a === b || !nObj[a] || nObj[a] !== nObj[b]) return;
      hs.push({ key: "pairs:" + a + "," + b, type: "pairs", a: +a, b: +b, prior: 0.6 });
    }); });
    /* matching: exact when both panels use the same colours; as a mask of
       colour c when c is the workspace's own colour (absent from the
       template) */
    function colsIn(R) { var s = {}; for (var r = R[0]; r <= R[2]; r++) for (var c = R[1]; c <= R[3]; c++) if (S.g[r][c] !== S.bg) s[S.g[r][c]] = 1; return s; }
    panels(S).forEach(function (pp, i) {
      var ca = colsIn(pp.A), cb = colsIn(pp.B), same = Object.keys(cb).every(function (c) { return ca[c]; }) && Object.keys(ca).length > 0;
      hs.push({ key: "match:exact:" + pp.A + ">" + pp.B, tkey: "match:exact", type: "match", mode: "exact", A: pp.A, B: pp.B, prior: same ? 3 : 0.3 });
      Object.keys(cols).forEach(function (c) { hs.push({ key: "match:mask:" + c + ":" + pp.A + ">" + pp.B, tkey: "match:mask:" + c, type: "match", mode: "mask", col: +c, A: pp.A, B: pp.B, prior: cb[c] && !ca[c] ? 2 : 0.3 }); });
    });
    hs.forEach(function (h) { if (!h.tkey) h.tkey = h.key; });
    return hs;
  }
  function cellsOf(S, c) { var n = 0; S.objs.forEach(function (o) { if (o.color === c) n += o.n; }); return n; }
  function goalDist(S, h, lat) {
    var under = (lat && lat.under) || {}, actors = (lat && lat.actors) || {}, W = S.W;
    function hiddenUnderActor(c) { var n = 0; for (var i in under) { var y = (i / W) | 0; if (y < S.H && under[i] === c && actors[S.g[y][i % W]]) n++; } return n; }
    if (h.type === "clear") return cellsOf(S, h.c) + hiddenUnderActor(h.c);
    if (h.type === "clear2") return cellsOf(S, h.a) + hiddenUnderActor(h.a) + cellsOf(S, h.b) + hiddenUnderActor(h.b);
    if (h.type === "count") return Math.abs(cellsOf(S, h.a) - cellsOf(S, h.b));
    if (h.type === "reach") {
      if (hiddenUnderActor(h.c)) return 0;
      var act = [], tgt = [], best = Infinity;
      S.objs.forEach(function (o) { if (actors[o.color]) act = act.concat(o.cells); else if (o.color === h.c) tgt = tgt.concat(o.cells); });
      for (var i in under) if (under[i] === h.c && +i < S.H * W) tgt.push(+i);
      if (!act.length || !tgt.length) return Infinity;
      act.forEach(function (a) { tgt.forEach(function (b) { var d = Math.abs(((a / W) | 0) - ((b / W) | 0)) + Math.abs(a % W - b % W); if (d < best) best = d; }); });
      return best;
    }
    if (h.type === "align") {
      var A = null, B = null;
      S.objs.forEach(function (o) { if (o.color === h.a) A = A ? false : o; else if (o.color === h.b) B = B ? false : o; });
      if (!A || !B) return Infinity;
      return Math.round(Math.abs(A[h.ax] - B[h.ax]));
    }
    if (h.type === "pairs") {
      var As = [], Bs = [];
      S.objs.forEach(function (o) { if (o.color === h.a) As.push(o); else if (o.color === h.b) Bs.push(o); });
      if (As.length !== Bs.length || !As.length) return Infinity;
      function ord(x, y) { return x.c0 - y.c0 || x.r0 - y.r0; }
      As.sort(ord); Bs.sort(ord);
      var dd = 0; As.forEach(function (o, i) { if (o.shape !== Bs[i].shape) dd++; });
      return dd;
    }
    if (h.type === "match") return regionDiff(S, h.A, h.B, h.mode, h.col);
    return Infinity;
  }

  /* ------------------------------------------------------------- agent */
  /* ------------------------------------------- navigation specialist
     The previous agent (c4-arc3-world.js: avatar, walls, goals, hazards,
     frontier options) runs in the shadow on every frame and is consulted
     only when the program under discovery shows actor navigation and this
     agent has neither a plan nor an informative experiment. */
  function NavigationSpecialist(acts) {
    var W = root.C4Arc3World || (typeof require === "function" ? (function () { try { return require("./c4-arc3-world.js"); } catch (e) { return null; } })() : null);
    this.ok = !!(W && acts.length); this.acts = acts;
    if (this.ok) this.agent = new W.Agent(acts, {});
  }
  NavigationSpecialist.prototype.observe = function (frame, info) { if (this.ok && frame) this.agent.observe(frame, info || {}); };
  NavigationSpecialist.prototype.nextLevel = function () { if (this.ok) this.agent.nextLevel(); };
  NavigationSpecialist.prototype.restart = function () { if (this.ok) { this.agent.prev = null; this.agent.lastAction = null; } };
  NavigationSpecialist.prototype.suggest = function () { if (!this.ok || !this.agent.prev) return null; var a = this.agent.act(); return typeof a === "number" ? a : null; };
  /* the action actually taken, whoever chose it */
  NavigationSpecialist.prototype.taken = function (id) { if (this.ok) this.agent.lastAction = this.acts.indexOf(id) >= 0 ? id : null; };

  function Agent(opts) {
    this.opts = opts || {};
    this.cfg = {
      ig: this.opts.ig !== false, goals: this.opts.goals !== false, memory: this.opts.memory !== false,
      plan: this.opts.plan !== false, latent: this.opts.latent !== false, ticks: this.opts.ticks !== false,
      physics: this.opts.physics !== false, experiments: this.opts.experiments !== false, spec: this.opts.spec !== false,
      maxNodes: this.opts.maxNodes || 1500,
      thinkMs: this.opts.thinkMs || 1000  /* deliberation safety deadline per action */
    };
    this.stats = { predicted: 0, correct: 0, byK: {}, contextsTried: 0, goalConfirmedAt: null, modeLog: [], predLog: [] };
  }
  function freshPhys() { return { pass: {}, deadly: {}, tint: {}, solid: {}, deadN: {} }; }
  Agent.prototype.start = function (info) {
    this.avail = (info.available_actions || [1, 2, 3, 4, 5, 6]).slice();
    this.simple = this.avail.filter(function (a) { return a !== 6 && a !== 0; });
    this.canClick = this.avail.indexOf(6) >= 0;
    this.trs = [];            /* all transitions of the game (every level) */
    this.death = {};          /* context -> game-over count no contact explains */
    this.useN = {};           /* context -> times used (whole game) */
    this.goalW = {};          /* goal template -> weight (persists across levels) */
    this.goalConfirmed = {};  /* template -> times it held at a level completion */
    this.phys = freshPhys();  /* contact model, learned from events, kept across levels */
    this.gameCols = {};       /* every colour seen in the game */
    this.lose = {};           /* lose hypotheses: state predicates that ended the game */
    this.winStates = [];      /* winning configurations of completed levels */
    this.physV = 0;
    this.spec = this.cfg.spec ? new NavigationSpecialist(this.simple.filter(function (a) { return a >= 1 && a <= 5; })) : null;
    this.level = 0; this.nInLevel = 0;
    this.newLevel();
  };
  Agent.prototype.newLevel = function () {
    this.L = new P.Lattice(); this.S = null; this.last = null; this.plan = null; this.bgInfo = null;
    this.counts = {}; this.lc = null; this.vel = {}; this.levelSteps = 0;
    this.under = {}; this.inv = []; this.levelCols = {}; this.startS = null; this.levelResets = 0; this.noise = {}; this.visits = {};
    this.refuted = {}; this.noPlan = {};
    this.cache = {};
    if (!this.cfg.memory) { this.trs = []; this.goalW = {}; this.goalConfirmed = {}; this.death = {}; this.phys = freshPhys(); this.physV++; }
  };
  /* The background (and frame, play box) is decided on the level's first
     frame and kept: in a board of tiles the commonest colour changes as
     tiles are flipped, and a background that changed with it would turn
     every flip into appearances and disappearances. Re-decided only when
     the lattice (the logical grid's size) changes. */
  Agent.prototype.perceive = function (f) {
    var lg = this.L.logical(f), key = lg.length + "x" + lg[0].length;
    if (!this.bgInfo || this.bgInfo.key !== key) { this.bgInfo = P.background(lg); this.bgInfo.key = key; }
    return P.parse(lg, this.bgInfo);
  };
  /* ---------------------------------------------------- contexts */
  /* a click's context: the clicked class, colour, or any click, each also
     within the separator band clicked (panels of one screen often behave
     differently) */
  Agent.prototype.region = function (S, cell) {
    var sp = separators(S);
    if (!sp.rows.length && !sp.cols.length) return "";
    var y = (cell / S.W) | 0, x = cell % S.W, br = 0, bc = 0;
    sp.rows.forEach(function (r) { if (y > r) br++; }); sp.cols.forEach(function (c) { if (x > c) bc++; });
    return "@" + br + "," + bc;
  };
  Agent.prototype.ctxKeys = function (S, a, k, cell) {
    if (a !== 6) return ["a:" + a];
    if (k < 0) { var rb = cell >= 0 ? this.region(S, cell) : ""; return rb ? ["kbg" + rb, "kbg"] : ["kbg"]; }
    var o = S.objs[k], rg = cell >= 0 ? this.region(S, cell) : "";
    /* the band first: panels of a screen differ more than shapes do */
    return rg ? ["k:" + o.cls + rg, "kc:" + o.color + rg, "k*" + rg, "k:" + o.cls, "kc:" + o.color, "k*"] : ["k:" + o.cls, "kc:" + o.color, "k*"];
  };
  /* latent features of a context: own occurrence parity, whether something
     is selected, the parity of every simple action (modes, toggles) */
  Agent.prototype.features = function (key, lat) {
    var counts = lat ? lat.counts : this.counts, sel = lat ? !!lat.lc : !!this.lc;
    var f = { occ: (counts[key] || 0) % 2, sel: sel ? 1 : 0 };
    this.simple.forEach(function (a) { f["par:" + a] = (counts["a:" + a] || 0) % 2; });
    return f;
  };
  /* follow the last-clicked object through moves / rotations / recolours */
  Agent.prototype.lcIndex = function (S, desc) {
    var lc = desc === undefined ? this.lc : desc;
    if (!lc) return -1;
    var best = -1, bd = Infinity;
    S.objs.forEach(function (o) {
      if (o.canon !== lc.canon && o.color !== lc.color) return;
      var d = Math.abs(o.cr - lc.cr) + Math.abs(o.cc - lc.cc);
      if (d < bd) { bd = d; best = o.id; }
    });
    return bd <= 3 ? best : -1;
  };
  function lcDesc(o) { return o ? { canon: o.canon, color: o.color, cr: o.cr, cc: o.cc } : null; }
  /* actors: colours a simple action's own rules move (not ticks, not
     objects pushed along by contact) */
  Agent.prototype.actorColors = function () {
    if (this.cache.actors) return this.cache.actors;
    var act = {}, self = this;
    this.cache.actors = act;   /* guards re-entry while models are induced */
    this.simple.forEach(function (a) {
      var m = self.model("a:" + a); if (!m.n) return;
      var covers = m.split ? Object.keys(m.split.parts).map(function (v) { return m.split.parts[v].covers[0]; }) : [m.plain.covers[0]];
      covers.forEach(function (cv) { (cv ? cv.rules : []).forEach(function (r) {
        if (["move", "slide", "moveTo"].indexOf(r.op.o) < 0) return;
        if (r.sel.t === "color") act[r.sel.c] = 1; else if (r.sel.t === "cls") act[+r.sel.k.split("/")[0]] = 1;
      }); });
    });
    return act;
  };
  /* the agent's latent state, as the planner carries it */
  Agent.prototype.curLat = function () {
    return { counts: this.counts, lc: this.lc, vel: this.vel, under: this.under, inv: this.inv, actors: this.actorColors(), opt: null };
  };
  Agent.prototype.velocities = function (ev) {
    var v = {};
    ev.forEach(function (e) { if (e.t === "move") v[e.n.r0 + "," + e.n.c0 + ":" + e.n.color] = [Math.sign(e.dr), Math.sign(e.dc)]; });
    return v;
  };

  /* ---------------------------------------------------- induction */
  /* Autonomous rules (ticks): what happens whatever the action, in most
     recent transitions under at least two different actions: patrolling
     movers, countdown bars, blinking or cycling objects. Any operator of
     the DSL on a class selector qualifies. Recomputed every few
     transitions over a recent window, or at once when a tick fails. */
  Agent.prototype.ticks = function () {
    if (this.cache.ticks) return this.cache.ticks;
    var trs = this.trs, rules = [], self = this, prev = this.tickRules || [];
    if (!this.cfg.ticks || trs.length < 2) { this.cache.ticks = []; return []; }
    var last = trs[trs.length - 1], lastKeys = new Set(last.ev.map(P.evKey));
    var broken = prev.some(function (r) { return !M.predictedEvents(last, r).every(function (k) { return lastKeys.has(k); }); });
    if (!broken && this.tickAt !== undefined && trs.length - this.tickAt < 4) { this.cache.ticks = prev; return prev; }
    var win = trs.slice(-40), cands = new Map();
    win.forEach(function (t) { t.ev.forEach(function (e) { if (e.t === "move") { var r = { sel: { t: "color", c: e.p.color }, op: { o: "patrol" } }; r.key = "color:" + e.p.color + "|patrol"; cands.set(r.key, r); } }); });
    win.slice(-6).forEach(function (t) { M.explainTransition(t).cands.forEach(function (r, k) { if ((r.sel.t === "color" || r.sel.t === "cls") && r.op.o !== "patrol" && r.op.o !== "moveTo") cands.set(k, r); }); });
    var tol = Math.max(1, Math.floor(win.length / 10));
    cands.forEach(function (rule) {
      var hits = 0, bad = 0, acts = {};
      for (var i = 0; i < win.length && bad <= tol; i++) {
        var t = win[i], keys = new Set(t.ev.map(P.evKey)), pe = M.predictedEvents(t, rule);
        if (!pe.every(function (x) { return keys.has(x); })) bad++; else if (pe.length) { hits++; acts[t.a + ":" + (t.cx.k >= 0 ? "k" : "")] = 1; }
      }
      if (bad <= tol && hits >= 2 && hits >= 0.3 * win.length && Object.keys(acts).length >= 2) rules.push(rule);
    });
    this.tickRules = rules; this.tickAt = trs.length;
    this.cache.ticks = rules;
    return rules;
  };
  Agent.prototype.residual = function (t) {
    var ticks = this.ticks();
    if (!ticks.length) return t;
    var tk = new Set();
    ticks.forEach(function (r) { M.predictedEvents(t, r).forEach(function (k) { tk.add(k); }); });
    if (!tk.size) return t;
    if (!t._res || t._resN !== ticks.length) { t._res = { S0: t.S0, a: t.a, cx: t.cx, ev: t.ev.filter(function (e) { return !tk.has(P.evKey(e)); }), g1: t.g1, f: t.f, keys: t.keys, _pe: t._pe }; t._resN = ticks.length; }
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
  Agent.prototype.rulesFor = function (S, a, k, alt, lat, cell) {
    var keys = this.ctxKeys(S, a, k, cell);
    for (var i = 0; i < keys.length; i++) {
      var m = this.model(keys[i]);
      if (!m.n) continue;
      if (m.split) { var fv = this.features(keys[i], lat)[m.split.f], part = m.split.parts[fv]; if (part) { var pc = part.covers[Math.min(alt || 0, part.covers.length - 1)]; return { key: keys[i], rules: pc.rules, complete: true, cov: 1, split: m.split.f, alts: part.covers.length }; } continue; }
      if (m.plain.complete || i === keys.length - 1) { var cv = m.plain.covers[Math.min(alt || 0, m.plain.covers.length - 1)]; return { key: keys[i], rules: cv.rules, complete: m.plain.complete, cov: cv.cov === undefined ? (m.plain.complete ? 1 : 0) : cv.cov, alts: m.plain.covers.length }; }
    }
    return null;
  };
  /* the clicked cell of a click candidate: an object's middle cell, or a
     background cell (encoded k = -10 - cell) */
  function clickCell(S, k) { if (k <= -10) return -10 - k; var o = S.objs[k]; return o ? o.cells[Math.floor(o.cells.length / 2)] : -1; }
  /* Predicted next state of one action from a latent state, or null when
     the action's context was never observed. The latent state (selection,
     action parities, velocities, underlay, inventory) is advanced with it,
     so plans can run through modes, selections, moving objects and
     inventories. extra: { optimistic: {colour: 1}, allPass } */
  Agent.prototype.predictState = function (S, a, k, alt, lat, extra) {
    lat = lat || this.curLat();
    var cell = a === 6 ? clickCell(S, k) : -1;
    var rs = this.rulesFor(S, a, k, alt, lat, cell);
    if (!rs) return null;
    var lci = this.lcIndex(S, lat.lc);
    var cx = { k: k, lc: lci, vel: lat.vel, cell: cell, phys: this.cfg.physics ? this.phys : null, under: lat.under, inv: lat.inv,
               optimistic: (extra && extra.optimistic) || lat.opt, allPass: extra && extra.allPass }, applied = [];
    rs.rules.forEach(function (r) { var ids = M.select(S, r.sel, cx); if (ids.length) applied.push({ rule: r, objs: ids }); });
    this.ticks().forEach(function (r) { var ids = M.select(S, r.sel, cx); if (ids.length) applied.push({ rule: r, objs: ids, tick: true }); });
    var g = M.simulate(S, applied, cx), out = cx.out;
    /* the next latent state */
    var counts = {}, key; for (key in lat.counts) counts[key] = lat.counts[key];
    this.ctxKeys(S, a, k, cell).forEach(function (q) { counts[q] = (counts[q] || 0) + 1; });
    var lc = lat.lc;
    if (a === 6 && k >= 0) lc = lcDesc(S.objs[k]);
    var lat2 = { counts: counts, lc: lc, vel: out.vel, under: out.under, inv: out.inv, actors: lat.actors, opt: lat.opt };
    return { g: g, known: rs.complete, cov: rs.cov, key: rs.key, alts: rs.alts, lat: lat2, dead: out.dead, into: out.into, contacts: out.contacts, pushed: out.pushed || 0, cell: cell };
  };

  /* ---------------------------------------------------- observe */
  Agent.prototype.observe = function (obs) {
    var frames = obs.frames || [];
    this.state = obs.state;
    if (!frames.length) return;
    var levelUp = (obs.levels_completed || 0) > this.level;
    var f = frames[frames.length - 1];
    if (levelUp) {
      /* the frame before the new level shows the winning configuration: the
         last action's transition is learned from it, then the goals */
      var winF = obs.state === "WIN" ? f : frames.length >= 2 ? frames[frames.length - 2] : null;
      if (winF && this.S) {
        this.L.add(winF);
        var Sw = this.perceive(winF);
        if (this.last && this.last.a !== 0) this.record(Sw, false);
        this.confirmGoals(Sw); this.refuteLose(Sw, this.curLat()); this.winStates.push(Sw);
      }
      this.level = obs.levels_completed; this.newLevel();
      if (this.spec) { this.spec.nextLevel(); if (obs.state !== "WIN") this.spec.observe(f, {}); }
      if (obs.state === "WIN") return;
    } else if (this.spec) this.spec.observe(f, { gameOver: obs.state === "GAME_OVER" });
    var relattice = this.L.add(f);
    var S = this.perceive(f);
    if (this.last && this.S && !levelUp && this.last.a !== 0) {
      if (relattice) {
        this.S = this.perceive(this.last.frame);
        if (this.last.a === 6 && this.last.px) {
          var cl = this.L.cellOf(this.last.px.x, this.last.px.y), ci = cl.r * this.S.W + cl.c;
          if (cl.r >= 0 && cl.c >= 0 && cl.r < this.S.H && cl.c < this.S.W) { this.last.cell = ci; this.last.k = this.S.at[ci] >= 0 ? this.S.at[ci] : -10 - ci; }
          this.last.lc = -1;
        }
      }
      if (this.S.H === S.H && this.S.W === S.W) this.record(S, obs.state === "GAME_OVER");
      if (obs.state !== "GAME_OVER") this.refuteGoals(S);
    }
    /* RESET restarts the level: its latent state starts over */
    if (this.last && this.last.a === 0) {
      this.under = {}; this.inv = []; this.counts = {}; this.lc = null; this.vel = {};
      if (this.last.eg) this.planOk = this.sameGrid(this.last.eg, S.g); else this.plan = null;
    }
    if (!this.startS || levelUp || (this.last && this.last.a === 0)) this.startS = S;
    if (obs.state === "GAME_OVER") this.plan = null;
    var gkS = P.gkey(S.g); this.visits[gkS] = (this.visits[gkS] || 0) + 1;
    var lc = this.levelCols, gc = this.gameCols, cc = colorsOf(S); Object.keys(cc).forEach(function (c) { lc[c] = Math.max(lc[c] || 0, cc[c]); gc[c] = Math.max(gc[c] || 0, cc[c]); });
    this.S = S; this.frame = f;
  };
  /* one transition: contact model first (it changes what rules predict),
     then the rule evidence, the prediction check and the latent state */
  Agent.prototype.record = function (S, gameOver) {
    var L = this.last, S0 = this.S;
    var t = { S0: S0, a: L.a, cx: { k: L.k, lc: L.lc, vel: L.vel, cell: L.cell, phys: this.cfg.physics ? this.phys : null, under: L.under, inv: L.inv },
              ev: P.events(S0, S), g1: S.g, f: L.f, keys: L.keys };
    if (this.cfg.physics && this.learnPhysics(t, S)) this.physChanged();
    this.trs.push(t);
    var cache = this.cache; t.keys.forEach(function (k) { delete cache[k]; }); delete cache.ticks; delete cache.actors; delete cache.splitF; delete cache.silent; delete cache.bgActive;
    /* other contexts' models change only if the autonomous rules did */
    var tk0 = (this.tickRules || []).map(function (r) { return r.key; }).join("&"), tk1 = this.ticks().map(function (r) { return r.key; }).join("&");
    if (tk0 !== tk1) this.cache = {};
    this.version = (this.version || 0) + 1;
    t.keys.forEach(function (k) { this.ctxSeen[k] = 1; }, this);
    /* prediction check (the model's own prediction, before the outcome) */
    var gk = P.gkey(S.g);
    if (L.pred) {
      var ok = P.gkey(L.pred.g) === gk, K = Math.min(16, this.trs.length);
      this.stats.predicted++; if (ok) this.stats.correct++;
      var b = this.stats.byK[K] || (this.stats.byK[K] = [0, 0]); b[1]++; if (ok) b[0]++;
      this.stats.predLog.push(ok ? 1 : 0);
      this.lastPredOk = ok;
    } else { this.lastPredOk = null; this.stats.predLog.push(-1); }
    /* cells that change although the model predicts no change for them
       (status lines, counters, decorations) are noise for plan checks */
    if (L.pred && L.pred.g.length === S.H && S0.H === S.H) for (var y = 0; y < S.H; y++) for (var x = 0; x < S.W; x++) { var v0 = S0.g[y][x]; if (L.pred.g[y][x] === v0 && S.g[y][x] !== v0) this.noise[y * S.W + x] = (this.noise[y * S.W + x] || 0) + 1; }
    /* a plan step carries the planner's own expectation */
    this.planOk = L.eg ? this.sameGrid(L.eg, S.g) : this.lastPredOk;
    this.vel = this.velocities(t.ev);
    /* follow the selection */
    if (L.a === 6 && L.k >= 0) this.lc = lcDesc(S0.objs[L.k]);
    var li = this.lcIndex(S); if (this.lc && li >= 0) this.lc = lcDesc(S.objs[li]);
    if (gameOver) this.attributeDeath(t, L);
  };
  Agent.prototype.sameGrid = function (eg, g) {
    if (eg.length !== g.length || eg[0].length !== g[0].length) return false;
    var W = g[0].length;
    for (var y = 0; y < g.length; y++) for (var x = 0; x < W; x++) if (eg[y][x] !== g[y][x] && (this.noise[y * W + x] || 0) < 2) return false;
    return true;
  };
  Agent.prototype.physChanged = function () {
    this.physV++;
    this.trs.forEach(function (u) { u._ex = null; u._pe = null; u._res = null; });
    this.cache = {};
  };
  /* The contact model, learned from events directly: for every cell a
     moving object entered, what became of what was there. Pushed along ->
     push; still there, partly covered, or back when the mover leaves ->
     hide; gone for good -> collect (the inventory grows); the mover changed
     colour on arrival -> tint. A colour an actor pressed into without
     entering -> solid at this inventory. The underlay (what movers cover)
     is tracked as latent state. Returns whether the model changed. */
  Agent.prototype.learnPhysics = function (t, S1) {
    var ph = this.phys, S0 = t.S0, W = S0.W, changed = false, self = this, held = uniq(this.inv);
    var byObj = {}, entered = {}, covered = {}, purge = [];
    t.ev.forEach(function (e) { if (e.p && e.t !== "tint") byObj[e.p.id] = e; });
    /* what a passage needs: the colours held at every successful entry,
       once the colour has also been refused (a door before its key) */
    function setPass(v, k) {
      var p = ph.pass[v], succ = p && p.succ ? p.succ.filter(function (c) { return held.indexOf(c) >= 0; }) : held.slice();
      var need = ph.solid[v] !== undefined ? succ : [];
      if (p && p.k === k && p.succ && p.succ.join() === succ.join() && (p.need || []).join() === need.join()) return;
      ph.pass[v] = { k: k, succ: succ, need: need };
      if (ph.deadly[v]) delete ph.deadly[v];
      changed = true;
    }
    t.ev.forEach(function (e) { if (e.t === "move") e.n.cells.forEach(function (c) { covered[c] = 1; }); });
    t.ev.forEach(function (e) {
      if (e.t !== "move") return;
      var own = {}, arrive = [];
      e.p.cells.forEach(function (c) { own[c] = 1; });
      /* what the mover leaves: the underlay shows again, or not */
      e.p.cells.forEach(function (c) {
        if (covered[c] || self.under[c] === undefined) return;
        var v = self.under[c], s1 = S1.g[(c / W) | 0][c % W];
        if (s1 === v) setPass(v, "hide");
        else if (s1 === S1.bg && (!ph.pass[v] || ph.pass[v].k === "hide")) { setPass(v, "collect"); self.inv = invAdd(self.inv, v); purge.push(v); }
        delete self.under[c];
      });
      e.n.cells.forEach(function (c) {
        if (own[c]) return;
        var v0 = S0.g[(c / W) | 0][c % W], j = S0.at[c];
        if (v0 === S0.bg || v0 === e.p.color || j < 0) return;
        entered[v0] = 1; arrive.push(v0);
        var ej = byObj[j];
        if (ej && ej.t === "move" && ej !== e && ej.dr === e.dr && ej.dc === e.dc) { setPass(v0, "push"); return; }
        var gone = ej && ej.t === "delete", rest = S0.objs[j].cells.filter(function (q) { return !covered[q]; }).length;
        if (gone && rest > 0) { setPass(v0, "collect"); self.inv = invAdd(self.inv, v0); return; }      /* its uncovered part vanished too */
        var known = ph.pass[v0];
        if (known && known.k === "collect" && invHas(held, known.need) && gone) { self.inv = invAdd(self.inv, v0); return; }
        if (!known || known.k !== "collect") { if (!known) setPass(v0, "hide"); }
        self.under[c] = v0;                                                       /* covered, as far as we know */
      });
      if (e.recol !== undefined && arrive.length) arrive.forEach(function (v) { var k = e.p.color + ">" + v; if (ph.tint[k] !== e.recol) { ph.tint[k] = e.recol; changed = true; } });
    });
    /* a colour found to be collected was never lying under anything: past
       transitions' underlay snapshots forget it */
    if (purge.length) this.trs.concat([t]).forEach(function (u) {
      var un = u.cx.under; if (!un) return;
      var bad = Object.keys(un).filter(function (c) { return purge.indexOf(un[c]) >= 0; });
      if (bad.length) { var cp = {}; Object.keys(un).forEach(function (c) { if (bad.indexOf(c) < 0) cp[c] = un[c]; }); u.cx.under = cp; }
    });
    /* pressed into a colour without entering it (blocked as predicted, or
       refused although the model expected passage): refused while holding
       this inventory; a passage believed open is now conditional on what
       was held when it was taken, or unexplained */
    /* only an actor that stayed put was refused (one that moved elsewhere
       tells nothing about the colour it was expected to enter) */
    var act = this.actorColors(), actorMoved = t.ev.some(function (e) { return e.t === "move" && act[e.p.color]; });
    if (!actorMoved) (this.last.into || []).concat(this.last.enter || []).forEach(function (v) {
      if (entered[v] || v === S0.bg) return;
      if (!ph.solid[v] || ph.solid[v].join() !== held.join()) { ph.solid[v] = held.slice(); changed = true; }
      var p = ph.pass[v];
      if (p && invHas(held, p.need)) {
        if (p.succ && !invHas(held, p.succ)) p.need = p.succ.slice();
        else if ((p.ref = (p.ref || 0) + 1) >= 2) delete ph.pass[v];
        changed = true;
      }
    });
    return changed;
  };
  /* GAME_OVER: blame what an actor touched (per the model's prediction of
     the step, and of the same step with every colour passable), else the
     action's context */
  Agent.prototype.attributeDeath = function (t, L) {
    var actors = this.actorColors(), ph = this.phys, blamed = {}, self = this;
    /* lose hypotheses: predicates of the goal grammar the fatal step made
       true (the last of something destroyed, a count run out); refuted by
       any later safe state; the planner avoids states satisfying them */
    var S1 = P.parse(t.g1, { bg: t.S0.bg, frame: t.S0.frame, box: t.S0.box }), lat = this.curLat();
    goalHyps(S1, lat.actors, this.gameCols).forEach(function (h) {
      if (h.type !== "clear" && h.type !== "clear2" && h.type !== "count") return;
      if (goalDist(S1, h, lat) !== 0 || goalDist(t.S0, h, lat) === 0 || (self.loseRefuted || {})[h.key]) return;
      /* any state seen safe before (every state acted from, every winning
         configuration) that holds it refutes it at once */
      var safe = self.trs.some(function (u) { return u !== t && u.S0 !== t.S0 && goalDist(u.S0, h, lat) === 0; }) || self.winStates.some(function (W0) { return goalDist(W0, h, lat) === 0; });
      if (safe) { self.loseRefuted = self.loseRefuted || {}; self.loseRefuted[h.key] = 1; } else self.lose[h.key] = h;
    });
    (L.touch || []).concat(L.pred && L.pred.contacts ? L.pred.contacts : []).forEach(function (c) {
      var a = c[0], b = c[1];
      if (actors[a] && !actors[b]) blamed[b] = 1; else if (actors[b] && !actors[a]) blamed[a] = 1;
    });
    var cols = Object.keys(blamed).filter(function (v) { return !(ph.pass[v] && ph.pass[v].k === "hide" && invHas(self.inv, ph.pass[v].need)); });
    var notSolid = cols.filter(function (v) { return ph.solid[v] === undefined; });
    if (notSolid.length) cols = notSolid;
    if (this.cfg.physics && cols.length) {
      cols.forEach(function (v) { ph.deadN[v] = (ph.deadN[v] || 0) + 1; ph.deadly[v] = true; if (ph.pass[v]) delete ph.pass[v]; });
      this.physChanged();
    } else L.keys.forEach(function (k) { self.death[k] = (self.death[k] || 0) + 1; });
  };

  /* ---------------------------------------------------- goals */
  Agent.prototype.hyps = function (S, lat) {
    lat = lat || this.curLat();
    var hs = goalHyps(S, lat.actors, this.levelCols), self = this;
    hs.forEach(function (h) {
      var w = self.goalW[h.tkey]; h.w = (w === undefined ? h.prior : w) * (self.refuted[h.key] ? 0.01 : 1);
      if (self.goalConfirmed[h.tkey]) h.w *= 20 * self.goalConfirmed[h.tkey];
      /* a hypothesis already true that has not ended the level is not it */
      if (goalDist(S, h, lat) === 0) h.w *= 0.01;
    });
    return hs.sort(function (a, b) { return b.w - a.w; });
  };
  Agent.prototype.refuteGoals = function (S) {
    var self = this, lat = this.curLat();
    goalHyps(S, lat.actors, this.levelCols).forEach(function (h) { if (goalDist(S, h, lat) === 0) self.refuted[h.key] = 1; });
    this.refuteLose(S, lat);
  };
  /* a state that holds a lose hypothesis without ending the game refutes it */
  Agent.prototype.refuteLose = function (S, lat) {
    var self = this; this.loseRefuted = this.loseRefuted || {};
    Object.keys(this.lose).forEach(function (k) { if (goalDist(S, self.lose[k], lat) === 0) { delete self.lose[k]; self.loseRefuted[k] = 1; } });
  };
  Agent.prototype.losing = function (S, lat) {
    var self = this; return Object.keys(this.lose).some(function (k) { return goalDist(S, self.lose[k], lat) === 0; });
  };
  Agent.prototype.confirmGoals = function (Wst) {
    var self = this, lat = this.curLat(), hs = goalHyps(Wst, lat.actors, this.levelCols), held = hs.filter(function (h) { return goalDist(Wst, h, lat) === 0 && !self.refuted[h.key]; });
    if (!this.cfg.goals) return;
    hs.forEach(function (h) { self.goalW[h.tkey] = (self.goalW[h.tkey] === undefined ? h.prior : self.goalW[h.tkey]) * (held.indexOf(h) >= 0 ? 5 : self.refuted[h.key] ? 0.5 : 0.05); });
    held.forEach(function (h) { self.goalConfirmed[h.tkey] = (self.goalConfirmed[h.tkey] || 0) + 1; });
    if (this.stats.goalConfirmedAt === null && held.length) this.stats.goalConfirmedAt = this.trs.length;
  };

  /* ---------------------------------------------------- candidate actions */
  /* simple actions, and one click per object (its middle cell): semantic
     targets, never raw pixels */
  Agent.prototype.candidates = function (S, forPlan) {
    var out = [], self = this;
    this.simple.forEach(function (a) { out.push({ a: a, k: -1 }); });
    if (!this.canClick) return out;
    S.objs.forEach(function (o) { if (o.n <= S.H * S.W / 3) out.push({ a: 6, k: o.id }); });
    /* background cells of the play box too (a board of tiles may have its
       commonest tile colour taken for background); a sample when large, and
       for planning only once background clicks are known to do something */
    if (forPlan && !this.bgActive()) return out;
    var b = S.box, cells = [];
    for (var r = b[0]; r <= b[2]; r++) for (var c = b[1]; c <= b[3]; c++) if (S.g[r][c] === S.bg) cells.push(r * S.W + c);
    var stride = Math.max(1, Math.ceil(cells.length / 48));
    for (var i = 0; i < cells.length; i += stride) out.push({ a: 6, k: -10 - cells[i] });
    return out;
  };
  /* do background clicks ever change anything? */
  Agent.prototype.bgActive = function () {
    if (this.cache.bgActive !== undefined) return this.cache.bgActive;
    var act = this.trs.some(function (t) { return t.a === 6 && t.cx.k < 0 && t.ev.length; });
    this.cache.bgActive = act;
    return act;
  };
  Agent.prototype.toAction = function (S, c) {
    if (c.a !== 6) return { id: c.a };
    var cell = clickCell(S, c.k), p = this.L.pixelOf((cell / S.W) | 0, cell % S.W);
    return { id: 6, x: p.x, y: p.y };
  };
  /* expected information: unknown contexts are worth most; known contexts
     with competing explanations that disagree here are worth the entropy
     of their predictions; risky contexts (and predicted deaths) are
     penalised */
  Agent.prototype.infoGain = function (S, c, lat) {
    var cell = c.a === 6 ? clickCell(S, c.k) : -1, keys = this.ctxKeys(S, c.a, c.k, cell), m0 = this.model(keys[0]);
    var risk = this.banned(keys) ? 4 : 0, self = this; keys.forEach(function (k) { if (self.death[k]) risk += 0.5 * self.death[k] / (self.useN[k] || 1); });
    if (!m0.n) {
      var generic = c.a === 6 ? this.rulesFor(S, c.a, c.k, 0, lat, cell) : null;
      return { ig: generic && generic.complete ? 0.4 : 1.0, risk: risk + 0.05 };
    }
    var rs = this.rulesFor(S, c.a, c.k, 0, lat, cell);
    var p0 = rs ? this.predictState(S, c.a, c.k, 0, lat) : null;
    if (p0 && p0.dead) risk += 5;
    /* a known context never tried in the current latent configuration
       (something selected or not, silent toggles flipped) may behave anew */
    var nov = this.cfg.latent && c.a !== 6 && this.latentNovel(keys[0], lat) ? 0.5 : 0;
    /* an action seen only doing nothing may have been blocked: retry it
       where the actors' surroundings differ from every earlier try */
    if (c.a !== 6 && rs && !rs.rules.length && this.isNavigation()) { var nb = this.blockNovel(keys[0], S); if (nb) nov = Math.max(nov, nb); }
    if (!rs || rs.alts < 2) return { ig: Math.max(nov, rs && !rs.complete ? 0.3 * Math.max(0, 1 - m0.n / 6) : 0), risk: risk };
    var preds = {};
    if (p0) preds[P.gkey(p0.g)] = 1;
    for (var alt = 1; alt < Math.min(3, rs.alts); alt++) { var p = this.predictState(S, c.a, c.k, alt, lat); if (p) preds[P.gkey(p.g)] = 1; }
    var n = Object.keys(preds).length;
    return { ig: Math.max(nov, n > 1 ? Math.log2(n) * 0.6 : 0), risk: risk };
  };
  /* the colours around every actor (4 sides), a signature of what could
     block a move */
  Agent.prototype.surround = function (S) {
    var act = this.actorColors(), W = S.W, H = S.H, sig = [];
    S.objs.forEach(function (o) {
      if (!act[o.color]) return;
      var own = {}; o.cells.forEach(function (c) { own[c] = 1; });
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
        var cs = {};
        o.cells.forEach(function (c) { var y = ((c / W) | 0) + d[0], x = c % W + d[1]; if (y < 0 || x < 0 || y >= H || x >= W) cs.edge = 1; else if (!own[y * W + x]) cs[S.g[y][x]] = 1; });
        sig.push(Object.keys(cs).sort().join("."));
      });
    });
    return sig.join("|");
  };
  Agent.prototype.blockNovel = function (key, S) {
    var self = this, cur = this.surround(S), seen = false, n = 0;
    this.trs.forEach(function (t) { if (t.keys.indexOf(key) >= 0) { n++; if (!seen && self.surround(t.S0) === cur) seen = true; } });
    return seen || n >= 4 ? 0 : 0.6 / (1 + n);
  };
  /* silent simple actions (no visible effect so far): candidate mode
     switches, whose parity is latent state */
  Agent.prototype.silent = function () {
    if (this.cache.silent) return this.cache.silent;
    var self = this, out = this.simple.filter(function (a) { var m = self.model("a:" + a); return m.n && m.plain && m.plain.covers[0] && !m.plain.covers[0].rules.length; });
    this.cache.silent = out;
    return out;
  };
  Agent.prototype.latentSig = function (f, selColor) { return "s" + selColor + ":" + this.silent().map(function (a) { return f["par:" + a]; }).join(""); };
  Agent.prototype.latentNovel = function (key, lat) {
    var self = this, cur = this.latentSig(this.features(key, lat), lat.lc ? lat.lc.color : "-"), seen = false;
    this.trs.forEach(function (t) { if (!seen && t.keys.indexOf(key) >= 0 && self.latentSig(t.f, t.cx.lc >= 0 && t.S0.objs[t.cx.lc] ? t.S0.objs[t.cx.lc].color : "-") === cur) seen = true; });
    return !seen;
  };

  /* ---------------------------------------------------- planning */
  function stateFromGrid(S, g) { return P.parse(g, { bg: S.bg, frame: S.frame, box: S.box }); }
  /* latent features the learned splits depend on, as a state signature */
  Agent.prototype.latSig = function (L) {
    var self = this, sf = this.cache.splitF;
    if (!sf) {
      sf = [];
      this.trs.forEach(function (t) { t.keys.forEach(function (k) { if (sf.indexOf(k) < 0) sf.push(k); }); });
      sf = sf.map(function (k) { var m = self.model(k); return m.split ? { key: k, f: m.split.f } : null; }).filter(Boolean);
      this.cache.splitF = sf;
    }
    var s = sf.map(function (x) { return x.f === "occ" ? (L.counts[x.key] || 0) % 2 : x.f.indexOf("par:") === 0 ? (L.counts["a:" + x.f.slice(4)] || 0) % 2 : ""; }).join("");
    s += "|" + (L.lc ? Math.round(L.lc.cr) + "," + Math.round(L.lc.cc) : "") + "|" + L.inv.join(",");
    if (this.ticks().length) s += "|" + Object.keys(L.vel || {}).sort().map(function (k) { return k + L.vel[k]; }).join(";");
    return s;
  };
  /* colours never entered, and not refused while holding everything held
     now (something new in the inventory reopens the question) */
  Agent.prototype.untested = function (v, inv) {
    var ph = this.phys;
    if (v === undefined || v === null || this.actorColors()[v]) return false;
    var p = ph.pass[v]; if (p && invHas(inv, p.need)) return false;
    if (ph.deadly[v]) return false;
    var s = ph.solid[v]; if (s !== undefined && invHas(s, inv)) return false;
    return true;
  };
  /* Best-first search through the learned program, carrying the latent
     state. Goal mode: reach goalDist 0 for hypothesis h (untested colours h
     needs are assumed passable: optimism under uncertainty). Test mode
     (opts.test): stop at the first transition the test accepts. Steps
     carry the expected next grid, so execution can check them. */
  Agent.prototype.planTo = function (S0, h, lat0, opts) {
    opts = opts || {};
    var self = this, cap = opts.cap || this.cfg.maxNodes, n = 0, opt = {};
    if (h && this.cfg.physics) (h.type === "clear2" ? [h.a, h.b] : h.c !== undefined ? [h.c] : []).forEach(function (c) { if (self.untested(c, lat0.inv)) opt[c] = 1; });
    var lat = {}, key; for (key in lat0) lat[key] = lat0[key]; lat.opt = opt;
    var seen = new Set([P.gkey(S0.g) + "#" + this.latSig(lat)]), open = [{ S: S0, lat: lat, path: [], f: opts.test ? 0 : goalDist(S0, h, lat), pen: 0 }];
    this.planExhausted = false;
    var nTicks = this.ticks().length, nLose = Object.keys(this.lose).length;
    var timedOut = false;
    while (open.length && n < cap) {
      if ((n & 15) === 0 && this.deadline && Date.now() > this.deadline) { timedOut = true; break; }
      var bi = 0; for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open[bi]; open.splice(bi, 1); n++;
      var cands = this.candidates(cur.S, true);
      for (var j = 0; j < cands.length; j++) {
        var c = cands[j], cell = c.a === 6 ? clickCell(cur.S, c.k) : -1, keys = this.ctxKeys(cur.S, c.a, c.k, cell);
        if (this.banned(keys)) continue;
        if (!nTicks) { var rs0 = this.rulesFor(cur.S, c.a, c.k, 0, cur.lat, cell); if (!rs0 || (!rs0.rules.length && rs0.complete)) continue; }
        var pr = this.predictState(cur.S, c.a, c.k, 0, cur.lat);
        if (!pr || !(pr.known || pr.cov >= 0.6) || pr.dead) continue;
        var gk = P.gkey(pr.g), step = { a: c.a, k: c.k, g: pr.g };
        if (opts.test && opts.test(cur.S, c, pr)) return cur.path.concat([step]);
        var sk = gk + "#" + this.latSig(pr.lat); if (seen.has(sk)) continue; seen.add(sk);
        var S2 = stateFromGrid(cur.S, pr.g), path = cur.path.concat([step]), pen = cur.pen + (opts.test ? 4 * pr.pushed : 0), f = path.length + pen;
        if (nLose && this.losing(S2, pr.lat)) continue;
        if (opts.test && opts.test(cur.S, c, pr, S2)) return path;
        if (!opts.test) { var d = goalDist(S2, h, pr.lat); if (d === 0) return path; f += 2 * d; if (!isFinite(f)) continue; }
        if (path.length < 40) open.push({ S: S2, lat: pr.lat, path: path, f: f, pen: pen });
      }
    }
    /* the whole reachable space was searched: unreachable under the model */
    this.planExhausted = !open.length && !timedOut; this.planNodes = n;
    return null;
  };
  /* the latent state at the start of the level (after a RESET) */
  Agent.prototype.startLat = function () { return { counts: {}, lc: null, vel: {}, under: {}, inv: [], actors: this.actorColors(), opt: null }; };
  /* Experiment SEQUENCES: walk (through the known program) to where an
     actor can press into a colour whose contact effect is untested. */
  Agent.prototype.experimentPlan = function (S, lat) {
    if (!this.cfg.physics || !this.simple.length || !Object.keys(lat.actors || {}).length) return null;
    var self = this, cols = {};
    S.objs.forEach(function (o) { if (self.untested(o.color, lat.inv)) cols[o.color] = 1; });
    if (!Object.keys(cols).length) return null;
    return this.planTo(S, null, lat, { cap: 800, test: function (S1, c, pr) { return c.a !== 6 && pr.into.some(function (v) { return cols[v]; }); } });
  };
  /* Context experiments: through the known program, reach a state where
     an interaction never observed at the colour level can be tried (click
     a colour that has to be made first, act while something new is
     selected). */
  Agent.prototype.contextPlan = function (S, lat) {
    var self = this;
    function colourKey(S1, c) {
      if (c.a !== 6) return null;
      var cell = clickCell(S1, c.k), keys = self.ctxKeys(S1, c.a, c.k, cell);
      return c.k < 0 ? keys[0] : keys.filter(function (k) { return k.indexOf("kc:") === 0; })[0];
    }
    return this.planTo(S, null, lat, { cap: 400, test: function (S1, c, pr, S2) {
      if (!S2) return false;
      return self.candidates(S2).some(function (c2) { var k = colourKey(S2, c2); return k && !self.model(k).n; });
    } });
  };
  Agent.prototype.isNavigation = function () { return Object.keys(this.actorColors()).length > 0; };
  /* a context's unexplained deaths ban it only when it kills most of the
     times it is used (clicks: once suffices; simple actions: twice) */
  Agent.prototype.banned = function (keys) {
    var self = this;
    return keys.some(function (k) { var d = self.death[k] || 0; if (!d) return false; var u = self.useN[k] || 1; return d / u >= 0.5 && (k.charAt(0) !== "a" || d >= 2); });
  };

  /* ---------------------------------------------------- act */
  Agent.prototype.act = function () {
    var S = this.S;
    if (this.state === "GAME_OVER" || !S) { this.last = { a: 0 }; if (this.spec) this.spec.restart(); return { id: 0 }; }
    this.ctxSeen = this.ctxSeen || {};
    this.deadline = Date.now() + this.cfg.thinkMs;
    var choice = null, mode = "explore", lat = this.curLat();
    /* continue a plan while its expectations hold */
    if (this.plan && this.plan.length && this.planOk !== false) { choice = this.plan.shift(); mode = this.planMode; }
    else this.plan = null;
    if (!choice) {
      var cands = this.candidates(S), self = this, scored = [];
      cands.forEach(function (c) { var v = self.infoGain(S, c, lat); scored.push({ c: c, ig: v.ig, risk: v.risk }); });
      var unknown = scored.filter(function (x) { return x.ig >= 0.99 && x.risk < 1; });
      var hs = this.hyps(S, lat), confirmed = hs.length && this.goalConfirmed[hs[0].tkey];
      var planned = null, sig = this.physV + "/" + Object.keys(this.ctxSeen).length;
      /* DISCOVERY until the program is known well enough or a goal is
         confirmed, then EXECUTION */
      if (this.cfg.plan && (confirmed || !unknown.length || !this.cfg.ig || this.levelSteps % 4 === 3)) {
        /* goals in order of belief; hypotheses already found unreachable
           under the current model are skipped; a node budget spans them */
        var tried = 0, dead = 0, spent = 0;
        for (var i = 0; i < Math.min(hs.length, 10) && !planned && spent < 3 * this.cfg.maxNodes; i++) {
          if (hs[i].w < 1e-3) break;
          tried++;
          var np = this.noPlan[hs[i].key]; if (np && np.sig === sig && np.until > this.levelSteps) { if (np.exhausted) dead++; continue; }
          var pl = this.planTo(S, hs[i], lat); spent += this.planNodes || 0;
          if (pl && pl.length) planned = pl; else { this.noPlan[hs[i].key] = { sig: sig, until: this.levelSteps + 6, exhausted: this.planExhausted }; if (this.planExhausted) dead++; }
        }
        /* a dead end (a crate in a corner, a spent resource): if the leading
           goal is reachable from the level's start, RESET is worth its cost */
        if (!planned && tried && dead === tried && this.startS && this.levelSteps > 0 && this.levelResets < 3) {
          for (var i2 = 0; i2 < Math.min(hs.length, 2) && !planned; i2++) {
            var pl2 = this.planTo(this.startS, hs[i2], this.startLat());
            if (pl2 && pl2.length) planned = [{ a: 0, k: -1, g: this.startS.g }].concat(pl2);
          }
        }
      }
      if (planned) { this.plan = planned; this.planMode = "execute"; choice = this.plan.shift(); mode = "execute"; }
      else if (this.cfg.ig && scored.length) {
        scored.sort(function (a, b) { return (b.ig - b.risk) - (a.ig - a.risk) || ((a.c.k >= 0 ? S.objs[a.c.k].n : 0) - (b.c.k >= 0 ? S.objs[b.c.k].n : 0)); });
        var top = scored[0];
        if (top.ig - top.risk > 0) choice = top.c;
        else {
          var ex = this.cfg.experiments ? this.experimentPlan(S, lat) : null;
          if (!(ex && ex.length) && this.cfg.experiments && this.canClick) ex = this.contextPlan(S, lat);
          if (ex && ex.length) { this.plan = ex; this.planMode = "experiment"; choice = this.plan.shift(); mode = "experiment"; }
          else {
            var sug = this.spec && this.isNavigation() ? this.spec.suggest() : null;
            if (sug !== null && this.simple.indexOf(sug) >= 0) { choice = { a: sug, k: -1 }; mode = "specialist"; }
            else {
              /* nothing informative left and no plan: the safe action whose
                 predicted next state was visited least (unknown outcomes
                 count as new), ties varied */
              var safe = scored.filter(function (x) { return x.risk < 1; }), self3 = this, bestN = Infinity, pool = [];
              (safe.length ? safe : scored).forEach(function (x) {
                var pr = self3.predictState(S, x.c.a, x.c.k, 0, lat), v = pr ? (self3.visits[P.gkey(pr.g)] || 0) : 0;
                if (v < bestN) { bestN = v; pool = [x]; } else if (v === bestN) pool.push(x);
              });
              choice = (pool[(this.levelSteps + this.trs.length) % Math.max(1, pool.length)] || scored[0]).c;
              mode = "fallback";
            }
          }
        }
      } else {
        var cs = this.candidates(S); choice = cs[(this.levelSteps * 7) % cs.length]; mode = "random";
      }
    }
    if (choice.a === 0) {
      this.last = { a: 0, eg: choice.g || null }; this.levelResets++;
      this.stats.modeLog.push("R");
      if (this.spec) this.spec.restart();
      return { id: 0 };
    }
    /* keep the chosen object valid in the current state */
    if (choice.a === 6 && !(choice.k <= -10 && -10 - choice.k < S.H * S.W) && !(choice.k >= 0 && choice.k < S.objs.length)) { this.plan = null; choice = { a: this.simple[0] || 6, k: this.simple.length ? -1 : 0 }; }
    var cell = choice.a === 6 ? clickCell(S, choice.k) : -1, keys = this.ctxKeys(S, choice.a, choice.k, cell), self2 = this;
    var pred = this.predictState(S, choice.a, choice.k, 0, lat);
    var touch = this.cfg.physics ? this.predictState(S, choice.a, choice.k, 0, lat, { allPass: true }) : null;
    this.last = { a: choice.a, k: choice.k, cell: cell, lc: this.lcIndex(S), vel: this.vel, under: this.under, inv: this.inv, keys: keys, f: {},
                  pred: pred || null, into: pred ? pred.into : [], enter: pred ? uniq(pred.contacts.filter(function (c) { return !c[2]; }).map(function (c) { return c[1]; })) : [], touch: touch ? touch.contacts : [], eg: choice.g || null, frame: this.frame };
    this.under = {}; for (var uk in this.last.under) this.under[uk] = this.last.under[uk];
    keys.forEach(function (k) { self2.last.f = self2.features(k); });
    keys.forEach(function (k) { self2.counts[k] = (self2.counts[k] || 0) + 1; self2.useN[k] = (self2.useN[k] || 0) + 1; });
    this.levelSteps++;
    this.stats.modeLog.push({ explore: "x", execute: "p", experiment: "e", specialist: "s", fallback: "f", random: "r" }[mode] || "?");
    if (this.spec) this.spec.taken(choice.a);
    var act = this.toAction(S, choice);
    if (act.id === 6) this.last.px = { x: act.x, y: act.y };
    return act;
  };
  /* A failure inside the reasoning must not end the game: the step falls
     back to a valid action (RESET after GAME_OVER) and is counted in
     stats.errors, reported with the results. */
  Agent.prototype.actSafe = Agent.prototype.act;
  Agent.prototype.act = function () {
    try { return this.actSafe(); }
    catch (e) {
      this.stats.errors = (this.stats.errors || 0) + 1; this.stats.lastError = String(e && e.stack || e).slice(0, 300);
      this.plan = null;
      if (this.state === "GAME_OVER" || !this.S) { this.last = { a: 0 }; return { id: 0 }; }
      var a = this.simple.length ? this.simple[this.levelSteps++ % this.simple.length] : 6;
      this.last = { a: a, k: -1, keys: [], f: {}, pred: null, frame: this.frame, under: this.under, inv: this.inv };
      if (a !== 6) return { id: a };
      var o = this.S.objs[this.levelSteps % Math.max(1, this.S.objs.length)], cell = o ? o.cells[0] : 0, p = this.L.pixelOf((cell / this.S.W) | 0, cell % this.S.W);
      this.last = null; return { id: 6, x: p.x, y: p.y };
    }
  };
  Agent.prototype.observeSafe = Agent.prototype.observe;
  Agent.prototype.observe = function (obs) {
    try { return this.observeSafe(obs); }
    catch (e) {
      this.stats.errors = (this.stats.errors || 0) + 1; this.stats.lastError = String(e && e.stack || e).slice(0, 300);
      this.state = obs.state; this.last = null; this.plan = null;
      var f = obs.frames && obs.frames.length ? obs.frames[obs.frames.length - 1] : null;
      if ((obs.levels_completed || 0) > this.level) { this.level = obs.levels_completed; this.newLevel(); }
      if (f) { try { this.L.add(f); this.S = this.perceive(f); this.frame = f; } catch (e2) { } }
    }
  };
  Agent.prototype.predictLast = function () { return this.last && this.last.pred ? this.last.pred : null; };
  /* The inferred game program, as the compact symbolic memory carried
     across levels: per interaction context its best rule cover (or latent
     split), the autonomous rules, the contact model, the goal beliefs and
     the lose conditions. Colours are the game's own palette indices. */
  Agent.prototype.program = function () {
    var self = this, ctx = {}, keys = {};
    function rk(r) { return M.selKey(r.sel) + " -> " + M.opKey(r.op); }
    this.trs.forEach(function (t) { t.keys.forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).sort().forEach(function (k) {
      var m = self.model(k); if (!m.n) return;
      if (m.split) { var sp = {}; Object.keys(m.split.parts).forEach(function (v) { sp[m.split.f + "=" + v] = m.split.parts[v].covers[0].rules.map(rk); }); ctx[k] = { n: m.n, split: sp }; }
      else { var cv = m.plain.covers[0]; ctx[k] = { n: m.n, rules: cv.rules.map(rk), complete: m.plain.complete, coverage: Math.round((cv.cov === undefined ? 1 : cv.cov) * 100) / 100, alternatives: m.plain.covers.length }; }
    });
    var goals = Object.keys(this.goalW).map(function (k) { return [k, self.goalW[k] * (self.goalConfirmed[k] ? 20 * self.goalConfirmed[k] : 1)]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
    return { contexts: ctx, autonomous: this.ticks().map(rk), actors: Object.keys(this.actorColors()).map(Number),
             contact: { pass: this.phys.pass, deadly: Object.keys(this.phys.deadly).map(Number), tint: this.phys.tint, refused: this.phys.solid },
             goals: goals.map(function (g) { return { template: g[0], weight: Math.round(g[1] * 1000) / 1000, confirmed: self.goalConfirmed[g[0]] || 0 }; }),
             lose: Object.keys(this.lose), deadContexts: this.death };
  };
  /* counterfactual probe: the predicted next logical grid of any action
     from the current state (null = unknown context) */
  Agent.prototype.predictAction = function (action) {
    var S = this.S; if (!S) return null;
    var k = -1;
    if (action.id === 6) {
      var cl = this.L.cellOf(action.x, action.y);
      if (cl.r >= 0 && cl.c >= 0 && cl.r < S.H && cl.c < S.W) { k = S.at[cl.r * S.W + cl.c]; if (k < 0) k = -10 - (cl.r * S.W + cl.c); }
      if (k >= 0 && clickCell(S, k) !== cl.r * S.W + cl.c) return null;   /* probes click middle cells only */
    }
    var pr = this.predictState(S, action.id, k, 0);
    return pr ? { g: pr.g, known: pr.known } : null;
  };

  root.C4Arc3Agent = { Agent: Agent, NavigationSpecialist: NavigationSpecialist, goalHyps: goalHyps, goalDist: goalDist, panels: panels };
  if (typeof module !== "undefined" && module.exports) module.exports = { Agent: Agent, NavigationSpecialist: NavigationSpecialist, parts: P, model: M, goalHyps: goalHyps, goalDist: goalDist, panels: panels };
})(typeof globalThis !== "undefined" ? globalThis : this);
