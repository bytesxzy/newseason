/* Synthetic interactive games for ARC-AGI-3-style evaluation.
 *
 * NOT ARC-AGI-3 games; no score here is an ARC-AGI-3 score. They exist to
 * test whether an agent can discover UNKNOWN mechanics: most families have
 * no avatar, many are click-driven, several have hidden state, autonomous
 * motion, delayed effects or non-spatial goals. Every game instance draws
 * random colours for every role, random shapes, and a random assignment of
 * simple-action ids, so no colour, shape or action id carries meaning across
 * games.
 *
 * Every game speaks the official protocol (c4-arc3-env.js): 64x64 frames
 * (the logical grid rendered at an integer scale, centred on a frame colour),
 * lists of frames for animated actions, ACTION6 clicks at pixel (x, y),
 * RESET semantics, 3 levels. Baselines per level are the OPTIMAL action
 * counts found by breadth-first search over the true game (a stand-in for
 * the official human baselines).
 *
 * Families are split BEFORE development:
 *   dev      lights, rotsel, cyclematch, counter, modepaint, sequence,
 *            maze, push, patrol, keys, timedstop, collect
 *   holdout  swap, symmetry, dropstack, logicpanel, eliminate, bridgekey
 *            (never run during development; bridgekey composes click
 *            switch -> rotating bridge -> walk -> key -> door)
 */
(function (root) {
  "use strict";

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function ri(R, a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function shuffle(R, a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function grid(H, W, v) { var g = []; for (var r = 0; r < H; r++) { g.push(new Array(W).fill(v)); } return g; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* random colours for n roles, all distinct; role 0 = background */
  function palette(R, n) {
    var cols = shuffle(R, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    var bg = R() < 0.6 ? 0 : cols.pop();
    return [bg].concat(cols.slice(0, n - 1));
  }
  /* distinct simple-action ids for n roles */
  function actionIds(R, n) { return shuffle(R, [1, 2, 3, 4, 5]).slice(0, n); }
  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  /* small asymmetric shapes (cells relative to an anchor) */
  var SHAPES = [
    [[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [1, 0], [2, 0], [2, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 1], [1, 0], [1, 1], [2, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]
  ];
  function rot(cells, k) {
    var out = cells.map(function (p) { return p.slice(); });
    for (var i = 0; i < k; i++) out = out.map(function (p) { return [p[1], -p[0]]; });
    var r0 = Math.min.apply(null, out.map(function (p) { return p[0]; })), c0 = Math.min.apply(null, out.map(function (p) { return p[1]; }));
    return out.map(function (p) { return [p[0] - r0, p[1] - c0]; });
  }

  /* ------------------------------------------------------------ families */
  var F = {};

  /* LIGHTS: click a lamp -> it and its "neighbourhood" toggle between two
     colours; goal: every lamp in the ON colour. Neighbourhood per game:
     plus (lights-out), self, row, column. No avatar. */
  F.lights = {
    config: function (R) {
      var p = palette(R, 4);
      return { bg: p[0], off: p[1], on: p[2], frame: p[3], nb: ["plus", "self", "row", "col"][ri(R, 0, 3)], actions: [6] };
    },
    init: function (R, cfg, lv) {
      var n = 3 + (lv >= 1 ? 1 : 0), st = { n: n, on: [], H: 2 * n + 1, W: 2 * n + 1 };
      for (var i = 0; i < n * n; i++) st.on.push(1);
      for (var k = 0; k < 2 + lv; k++) this.toggle(cfg, st, ri(R, 0, n - 1), ri(R, 0, n - 1));
      if (st.on.every(function (v) { return v; })) this.toggle(cfg, st, 0, 0);
      return st;
    },
    toggle: function (cfg, st, r, c) {
      var n = st.n, cells = [[r, c]];
      if (cfg.nb === "plus") DIRS.forEach(function (d) { cells.push([r + d[0], c + d[1]]); });
      if (cfg.nb === "row") for (var j = 0; j < n; j++) if (j !== c) cells.push([r, j]);
      if (cfg.nb === "col") for (var i = 0; i < n; i++) if (i !== r) cells.push([i, c]);
      cells.forEach(function (q) { if (q[0] >= 0 && q[0] < n && q[1] >= 0 && q[1] < n) st.on[q[0] * n + q[1]] ^= 1; });
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg);
      for (var i = 0; i < st.n; i++) for (var j = 0; j < st.n; j++) g[2 * i + 1][2 * j + 1] = st.on[i * st.n + j] ? cfg.on : cfg.off;
      return g;
    },
    step: function (cfg, st, a) {
      if (a.id !== 6) return { st: st };
      var i = (a.r - 1) / 2, j = (a.c - 1) / 2;
      if (a.r % 2 !== 1 || a.c % 2 !== 1 || i < 0 || j < 0 || i >= st.n || j >= st.n) return { st: st };
      st = clone(st); this.toggle(cfg, st, i, j);
      return { st: st, win: st.on.every(function (v) { return v; }) };
    },
    moves: function (cfg, st) { var m = []; for (var i = 0; i < st.n; i++) for (var j = 0; j < st.n; j++) m.push({ id: 6, r: 2 * i + 1, c: 2 * j + 1 }); return m; }
  };

  /* ROTSEL: click a piece to SELECT it (hidden state; in some games the
     selection is shown by a marker, in others it is invisible), a simple
     action rotates the selected piece 90 degrees; goal: every piece in the
     orientation of its template shown in the top row. */
  F.rotsel = {
    config: function (R) {
      var p = palette(R, 6);
      return { bg: p[0], piece: p[1], tmpl: p[2], mark: p[3], sep: p[4], frame: p[5], visibleSel: R() < 0.5, rotId: actionIds(R, 1)[0], dir: R() < 0.5 ? 1 : 3, actions: null };
    },
    init: function (R, cfg, lv) {
      var n = 2 + (lv >= 1 ? 1 : 0) + (lv >= 2 ? 1 : 0), st = { n: n, shape: [], rot: [], tgt: [], sel: -1, H: 11, W: 5 * n + 1 };
      for (var i = 0; i < n; i++) { st.shape.push(ri(R, 0, SHAPES.length - 1)); st.tgt.push(ri(R, 0, 3)); var r0 = ri(R, 0, 3); st.rot.push(r0 === st.tgt[i] ? (r0 + 1) % 4 : r0); }
      return st;
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg), i;
      for (var c = 0; c < st.W; c++) g[5][c] = cfg.sep;
      for (i = 0; i < st.n; i++) {
        var x0 = 5 * i + 1;
        rot(SHAPES[st.shape[i]], st.tgt[i]).forEach(function (p) { g[1 + p[0]][x0 + p[1]] = cfg.tmpl; });
        rot(SHAPES[st.shape[i]], st.rot[i]).forEach(function (p) { g[6 + p[0]][x0 + p[1]] = cfg.piece; });
        if (cfg.visibleSel && st.sel === i) g[10][x0 + 1] = cfg.mark;
      }
      return g;
    },
    pieceAt: function (st, r, c) {
      for (var i = 0; i < st.n; i++) { var x0 = 5 * i + 1, hit = rot(SHAPES[st.shape[i]], st.rot[i]).some(function (p) { return 6 + p[0] === r && x0 + p[1] === c; }); if (hit) return i; }
      return -1;
    },
    step: function (cfg, st, a) {
      if (a.id === 6) { var i = this.pieceAt(st, a.r, a.c); if (i < 0) return { st: st }; st = clone(st); st.sel = i; return { st: st }; }
      if (a.id === cfg.rotId && st.sel >= 0) { st = clone(st); st.rot[st.sel] = (st.rot[st.sel] + cfg.dir) % 4; return { st: st, win: st.rot.every(function (v, k) { return v === st.tgt[k]; }) }; }
      return { st: st };
    },
    moves: function (cfg, st) {
      var m = [{ id: cfg.rotId }], self = this;
      for (var i = 0; i < st.n; i++) { var c0 = rot(SHAPES[st.shape[i]], st.rot[i])[0]; m.push({ id: 6, r: 6 + c0[0], c: 5 * i + 1 + c0[1] }); }
      return m;
    },
    avail: function (cfg) { return [cfg.rotId, 6].sort(); }
  };

  /* CYCLEMATCH: a template panel and a workspace panel; clicking a workspace
     cell advances its colour along a hidden cycle of k colours; goal: the
     workspace equals the template. */
  F.cyclematch = {
    config: function (R) {
      var p = palette(R, 7), k = ri(R, 3, 4);
      return { bg: p[0], cyc: p.slice(1, 1 + k), sep: p[5], frame: p[6], k: k, actions: [6] };
    },
    init: function (R, cfg, lv) {
      var n = 2 + (lv >= 1 ? 1 : 0), st = { n: n, t: [], w: [], H: n, W: 2 * n + 1 };
      for (var i = 0; i < n * n; i++) { st.t.push(ri(R, 0, cfg.k - 1)); st.w.push(ri(R, 0, cfg.k - 1)); }
      if (st.t.join() === st.w.join()) st.w[0] = (st.w[0] + 1) % cfg.k;
      return st;
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg), n = st.n;
      for (var r = 0; r < n; r++) { g[r][n] = cfg.sep; for (var c = 0; c < n; c++) { g[r][c] = cfg.cyc[st.t[r * n + c]]; g[r][n + 1 + c] = cfg.cyc[st.w[r * n + c]]; } }
      return g;
    },
    step: function (cfg, st, a) {
      if (a.id !== 6 || a.r < 0 || a.r >= st.n || a.c <= st.n || a.c > 2 * st.n) return { st: st };
      st = clone(st); var i = a.r * st.n + (a.c - st.n - 1); st.w[i] = (st.w[i] + 1) % cfg.k;
      return { st: st, win: st.w.join() === st.t.join() };
    },
    optimal: function (cfg, st) { var s = 0; for (var i = 0; i < st.t.length; i++) s += ((st.t[i] - st.w[i]) % cfg.k + cfg.k) % cfg.k; return s; }
  };

  /* COUNTER: a bar shows a hidden counter, a marker shows the target; one
     button adds, another subtracts; goal: bar length equals the target. */
  F.counter = {
    config: function (R) {
      var p = palette(R, 6), sw = R() < 0.5;
      return { bg: p[0], bar: p[1], tgt: p[2], plus: sw ? p[3] : p[4], minus: sw ? p[4] : p[3], frame: p[5], actions: [6] };
    },
    init: function (R, cfg, lv) {
      var L = 8 + 2 * lv, st = { L: L, v: ri(R, 0, L), t: 0, H: 6, W: L + 2 };
      do { st.t = ri(R, 1, L); } while (st.t === st.v);
      return st;
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg);
      for (var c = 0; c < st.v; c++) g[1][1 + c] = cfg.bar;
      g[2][st.t] = cfg.tgt;
      g[4][1] = cfg.plus; g[4][2] = cfg.plus; g[4][st.W - 3] = cfg.minus; g[4][st.W - 2] = cfg.minus;
      return g;
    },
    step: function (cfg, st, a) {
      if (a.id !== 6 || a.r !== 4) return { st: st };
      var d = (a.c === 1 || a.c === 2) ? 1 : (a.c === st.W - 3 || a.c === st.W - 2) ? -1 : 0;
      if (!d) return { st: st };
      st = clone(st); st.v = Math.max(0, Math.min(st.L, st.v + d));
      return { st: st, win: st.v === st.t };
    },
    optimal: function (cfg, st) { return Math.abs(st.t - st.v); }
  };

  /* MODEPAINT: objects of colours A and B; a simple action toggles a HIDDEN
     mode; in one mode a click deletes the clicked object, in the other it
     recolours it to C. Goal: no A objects left and every B object turned C. */
  F.modepaint = {
    config: function (R) {
      var p = palette(R, 5);
      return { bg: p[0], A: p[1], B: p[2], C: p[3], frame: p[4], modeId: actionIds(R, 1)[0], actions: null };
    },
    init: function (R, cfg, lv) {
      var st = { H: 8, W: 8, objs: [], mode: 0 }, occ = {}, n = 3 + lv;
      for (var k = 0; k < n; k++) {
        var r, c; do { r = ri(R, 0, 7); c = ri(R, 0, 7); } while (occ[r + "," + c] || occ[(r + 1) + "," + c] || occ[r + "," + (c + 1)] || occ[(r - 1) + "," + c] || occ[r + "," + (c - 1)]);
        occ[r + "," + c] = 1; st.objs.push({ r: r, c: c, k: k % 2 ? "B" : "A" });
      }
      return st;
    },
    view: function (cfg, st) { var g = grid(st.H, st.W, cfg.bg); st.objs.forEach(function (o) { g[o.r][o.c] = cfg[o.k]; }); return g; },
    step: function (cfg, st, a) {
      if (a.id === cfg.modeId) { st = clone(st); st.mode ^= 1; return { st: st }; }
      if (a.id !== 6) return { st: st };
      var i = st.objs.findIndex(function (o) { return o.r === a.r && o.c === a.c; });
      if (i < 0) return { st: st };
      st = clone(st);
      if (st.mode === 0) st.objs.splice(i, 1); else st.objs[i].k = "C";
      var win = st.objs.every(function (o) { return o.k === "C"; }) && st.objs.some(function (o) { return o.k === "C"; }) && !st.objs.some(function (o) { return o.k === "A"; });
      var lose = !st.objs.some(function (o) { return o.k === "B" || o.k === "C"; });
      return { st: st, win: win && !lose, lose: lose };
    },
    moves: function (cfg, st) { return [{ id: cfg.modeId }].concat(st.objs.map(function (o) { return { id: 6, r: o.r, c: o.c }; })); },
    avail: function (cfg) { return [cfg.modeId, 6].sort(); }
  };

  /* SEQUENCE: coloured buttons; a strip at the top SHOWS an order of colours;
     clicking the next colour in the order lights one progress cell, a wrong
     click clears the progress. Goal: complete the strip. */
  F.sequence = {
    config: function (R) {
      var p = palette(R, 8);
      return { bg: p[0], btn: p.slice(1, 5), prog: p[5], frame: p[7], actions: [6] };
    },
    init: function (R, cfg, lv) {
      var n = 3 + lv, st = { order: [], k: 0, H: 7, W: Math.max(9, n + 2), pos: shuffle(R, [0, 1, 2, 3]) };
      for (var i = 0; i < n; i++) st.order.push(ri(R, 0, 3));
      return st;
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg);
      st.order.forEach(function (b, i) { g[1][1 + i] = cfg.btn[b]; if (i < st.k) g[2][1 + i] = cfg.prog; });
      st.pos.forEach(function (b, j) { g[5][1 + 2 * j] = cfg.btn[b]; });
      return g;
    },
    step: function (cfg, st, a) {
      if (a.id !== 6 || a.r !== 5 || (a.c - 1) % 2 !== 0) return { st: st };
      var j = (a.c - 1) / 2; if (j < 0 || j > 3) return { st: st };
      st = clone(st);
      if (st.pos[j] === st.order[st.k]) st.k++; else st.k = 0;
      return { st: st, win: st.k === st.order.length };
    },
    optimal: function (cfg, st) { return st.order.length - st.k; }
  };

  /* shared: avatar worlds (maze, push, patrol, keys, collect, bridgekey) */
  function avatarCfg(R, extra) {
    var p = palette(R, 8 + (extra || 0)), ids = actionIds(R, 4);
    return { bg: p[0], wall: p[1], me: p[2], goal: p[3], p4: p[4], p5: p[5], p6: p[6], frame: p[7], extra: p.slice(8), move: ids, actions: ids.slice().sort() };
  }
  function carve(R, H, W, density) {
    var g = grid(H, W, 0);
    for (var r = 0; r < H; r++) for (var c = 0; c < W; c++) if (r === 0 || c === 0 || r === H - 1 || c === W - 1 || R() < density) g[r][c] = 1;
    return g;
  }
  function freeCells(g) { var f = []; for (var r = 0; r < g.length; r++) for (var c = 0; c < g[0].length; c++) if (!g[r][c]) f.push([r, c]); return f; }
  function reach(g, a, b) {
    var H = g.length, W = g[0].length, seen = {}, q = [a]; seen[a + ""] = 1;
    while (q.length) { var p = q.shift(); if (p[0] === b[0] && p[1] === b[1]) return true; DIRS.forEach(function (d) { var y = p[0] + d[0], x = p[1] + d[1]; if (y >= 0 && x >= 0 && y < H && x < W && !g[y][x] && !seen[y + "," + x]) { seen[y + "," + x] = 1; q.push([y, x]); } }); }
    return false;
  }
  function dirOf(cfg, a) { var k = cfg.move.indexOf(a.id); return k < 0 ? null : DIRS[k]; }

  F.maze = {
    config: function (R) { return avatarCfg(R); },
    init: function (R, cfg, lv) {
      var H = 7 + 2 * lv, W = 7 + 2 * lv;
      for (;;) {
        var g = carve(R, H, W, 0.22), f = shuffle(R, freeCells(g));
        if (f.length < 6) continue;
        var a = f[0], b = f.find(function (p) { return Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]) >= H / 2; });
        if (b && reach(g, a, b)) return { H: H, W: W, g: g, me: a, goal: b };
      }
    },
    view: function (cfg, st) { var g = grid(st.H, st.W, cfg.bg); for (var r = 0; r < st.H; r++) for (var c = 0; c < st.W; c++) if (st.g[r][c]) g[r][c] = cfg.wall; g[st.goal[0]][st.goal[1]] = cfg.goal; g[st.me[0]][st.me[1]] = cfg.me; return g; },
    step: function (cfg, st, a) {
      var d = dirOf(cfg, a); if (!d) return { st: st };
      var y = st.me[0] + d[0], x = st.me[1] + d[1];
      if (st.g[y][x]) return { st: st };
      st = clone(st); st.me = [y, x];
      return { st: st, win: y === st.goal[0] && x === st.goal[1] };
    },
    moves: function (cfg) { return cfg.move.map(function (id) { return { id: id }; }); }
  };

  /* PUSH: walk into a crate to push it; goal: every pad covered. */
  F.push = {
    config: function (R) { return avatarCfg(R); },
    init: function (R, cfg, lv) {
      var n = lv >= 2 ? 2 : 1, H = 7 + lv, W = 7 + lv;
      for (var tries = 0; ; tries++) {
        var g = carve(R, H, W, 0.08), f = shuffle(R, freeCells(g).filter(function (p) { return p[0] > 1 && p[1] > 1 && p[0] < H - 2 && p[1] < W - 2; }));
        if (f.length < 2 * n + 1) continue;
        var st = { H: H, W: W, g: g, me: f[0], crates: f.slice(1, 1 + n), pads: f.slice(1 + n, 1 + 2 * n) };
        if (st.crates.some(function (c) { return st.pads.some(function (p) { return p[0] === c[0] && p[1] === c[1]; }); })) continue;
        if (F.push.solve(cfg, st) !== null) return st;
      }
    },
    view: function (cfg, st) {
      var g = F.maze.view(cfg, { H: st.H, W: st.W, g: st.g, me: st.me, goal: [0, 0] }); g[0][0] = cfg.wall;
      st.pads.forEach(function (p) { if (!(p[0] === st.me[0] && p[1] === st.me[1])) g[p[0]][p[1]] = cfg.goal; });
      st.crates.forEach(function (p) { g[p[0]][p[1]] = st.pads.some(function (q) { return q[0] === p[0] && q[1] === p[1]; }) ? cfg.p5 : cfg.p4; });
      g[st.me[0]][st.me[1]] = cfg.me; return g;
    },
    step: function (cfg, st, a) {
      var d = dirOf(cfg, a); if (!d) return { st: st };
      var y = st.me[0] + d[0], x = st.me[1] + d[1];
      if (st.g[y][x]) return { st: st };
      var ci = st.crates.findIndex(function (p) { return p[0] === y && p[1] === x; });
      if (ci >= 0) {
        var y2 = y + d[0], x2 = x + d[1];
        if (st.g[y2][x2] || st.crates.some(function (p) { return p[0] === y2 && p[1] === x2; })) return { st: st };
        st = clone(st); st.crates[ci] = [y2, x2];
      } else st = clone(st);
      st.me = [y, x];
      return { st: st, win: st.pads.every(function (p) { return st.crates.some(function (q) { return q[0] === p[0] && q[1] === p[1]; }); }) };
    },
    moves: function (cfg) { return cfg.move.map(function (id) { return { id: id }; }); },
    solve: function (cfg, st) { return bfs(F.push, cfg, st, 60000); }
  };

  /* PATROL: hazards move back and forth by themselves every action; touching
     one is game over; goal: reach the goal cell. */
  F.patrol = {
    config: function (R) { return avatarCfg(R); },
    init: function (R, cfg, lv) {
      var H = 7 + lv, W = 9 + lv;
      for (;;) {
        var g = grid(H, W, 0), r, c;
        for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (r === 0 || c === 0 || r === H - 1 || c === W - 1) g[r][c] = 1;
        var pats = [], rows = shuffle(R, [2, 3, 4, 5].filter(function (x) { return x < H - 1; })).slice(0, 1 + (lv >= 1 ? 1 : 0));
        rows.forEach(function (row) { pats.push({ r: row, c: ri(R, 1, W - 2), d: R() < 0.5 ? 1 : -1 }); });
        var st = { H: H, W: W, g: g, me: [H - 2, 1], goal: [1, W - 2], pats: pats, t: 0 };
        if (bfs(F.patrol, cfg, st, 40000) !== null) return st;
      }
    },
    view: function (cfg, st) { var g = F.maze.view(cfg, st); st.pats.forEach(function (p) { g[p.r][p.c] = cfg.p4; }); return g; },
    step: function (cfg, st, a) {
      var d = dirOf(cfg, a); if (!d) return { st: st };
      st = clone(st);
      var y = st.me[0] + d[0], x = st.me[1] + d[1];
      if (!st.g[y][x]) st.me = [y, x];
      st.pats.forEach(function (p) { var nc = p.c + p.d; if (st.g[p.r][nc]) { p.d = -p.d; nc = p.c + p.d; } p.c = nc; });
      var hit = st.pats.some(function (p) { return p.r === st.me[0] && p.c === st.me[1]; });
      return { st: st, lose: hit, win: !hit && st.me[0] === st.goal[0] && st.me[1] === st.goal[1] };
    },
    moves: function (cfg) { return cfg.move.map(function (id) { return { id: id }; }); }
  };

  /* KEYS: a key of each door's colour opens that door (the key is carried
     invisibly once picked up); goal: reach the goal behind the doors. */
  F.keys = {
    config: function (R) { return avatarCfg(R, 2); },
    init: function (R, cfg, lv) {
      var n = lv >= 1 ? 2 : 1, H = 9, W = 9 + 2 * n;
      var g = grid(H, W, 0), r, c;
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (r === 0 || c === 0 || r === H - 1 || c === W - 1) g[r][c] = 1;
      var doors = [], keys = [], cols = [cfg.p4, cfg.p5];
      for (var k = 0; k < n; k++) {
        var x = W - 3 - 2 * k;
        for (r = 1; r < H - 1; r++) g[r][x] = 1;
        var dr = ri(R, 1, H - 2); g[dr][x] = 0;
        doors.push({ r: dr, c: x, col: k, open: false });
        keys.push({ r: ri(R, 1, H - 2), c: ri(R, 1, x - 3 - (n - 1 - k) * 0), col: k, held: false });
      }
      keys.forEach(function (kk, i) { kk.c = Math.min(kk.c, W - 4 - 2 * (n - 1)); if (i === 1) kk.c = Math.max(1, kk.c - 2); });
      return { H: H, W: W, g: g, me: [ri(R, 1, H - 2), 1], goal: [ri(R, 1, H - 2), W - 2], doors: doors, keys: keys, cols: cols };
    },
    view: function (cfg, st) {
      var g = F.maze.view(cfg, st);
      st.doors.forEach(function (d) { if (!d.open) g[d.r][d.c] = st.cols[d.col]; });
      st.keys.forEach(function (k) { if (!k.held) g[k.r][k.c] = st.cols[k.col] === cfg.p4 ? cfg.p6 : cfg.extra[0]; });
      g[st.me[0]][st.me[1]] = cfg.me; return g;
    },
    step: function (cfg, st, a) {
      var d = dirOf(cfg, a); if (!d) return { st: st };
      var y = st.me[0] + d[0], x = st.me[1] + d[1];
      if (st.g[y][x]) return { st: st };
      var door = st.doors.find(function (q) { return q.r === y && q.c === x && !q.open; });
      if (door && !st.keys.some(function (k) { return k.held && k.col === door.col; })) return { st: st };
      st = clone(st); st.me = [y, x];
      st.doors.forEach(function (q) { if (q.r === y && q.c === x) q.open = true; });
      st.keys.forEach(function (k) { if (k.r === y && k.c === x) k.held = true; });
      return { st: st, win: y === st.goal[0] && x === st.goal[1] };
    },
    moves: function (cfg) { return cfg.move.map(function (id) { return { id: id }; }); }
  };

  /* TIMEDSTOP: a marker runs around a loop by itself, one cell per action;
     a click on the stop button freezes it (and again releases it); any
     simple action just lets time pass. Goal: the marker frozen on the target. */
  F.timedstop = {
    config: function (R) { var p = palette(R, 6); return { bg: p[0], track: p[1], mk: p[2], tgt: p[3], btn: p[4], frame: p[5], wait: actionIds(R, 1)[0], actions: null }; },
    init: function (R, cfg, lv) {
      var L = 6 + 2 * lv, loop = [];
      for (var c = 1; c <= L; c++) loop.push([1, c]);
      loop.push([2, L]); for (c = L; c >= 1; c--) loop.push([3, c]); loop.push([2, 1]);
      var st = { loop: loop, p: 0, t: 0, frozen: false, H: 7, W: L + 2 };
      st.t = ri(R, 3, loop.length - 1);
      return st;
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg);
      st.loop.forEach(function (q) { g[q[0]][q[1]] = cfg.track; });
      var t = st.loop[st.t]; g[t[0]][t[1]] = cfg.tgt;
      var m = st.loop[st.p]; g[m[0]][m[1]] = cfg.mk;
      g[5][1] = cfg.btn; return g;
    },
    step: function (cfg, st, a) {
      st = clone(st);
      if (a.id === 6 && a.r === 5 && a.c === 1) st.frozen = !st.frozen;
      else if (a.id !== cfg.wait && a.id !== 6) return { st: st };
      if (!st.frozen) st.p = (st.p + 1) % st.loop.length;
      return { st: st, win: st.frozen && st.p === st.t };
    },
    moves: function (cfg) { return [{ id: cfg.wait }, { id: 6, r: 5, c: 1 }]; },
    avail: function (cfg) { return [cfg.wait, 6].sort(); }
  };

  /* COLLECT: walk over every coin; the level completes when none is left. */
  F.collect = {
    config: function (R) { return avatarCfg(R); },
    init: function (R, cfg, lv) {
      var H = 7 + lv, W = 7 + lv;
      for (;;) {
        var g = carve(R, H, W, 0.1), f = shuffle(R, freeCells(g));
        if (f.length < 6) continue;
        var coins = f.slice(1, 3 + lv), me = f[0];
        if (coins.every(function (c) { return reach(g, me, c); })) return { H: H, W: W, g: g, me: me, coins: coins, goal: [-1, -1] };
      }
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg); for (var r = 0; r < st.H; r++) for (var c = 0; c < st.W; c++) if (st.g[r][c]) g[r][c] = cfg.wall;
      st.coins.forEach(function (p) { g[p[0]][p[1]] = cfg.goal; }); g[st.me[0]][st.me[1]] = cfg.me; return g;
    },
    step: function (cfg, st, a) {
      var d = dirOf(cfg, a); if (!d) return { st: st };
      var y = st.me[0] + d[0], x = st.me[1] + d[1]; if (st.g[y][x]) return { st: st };
      st = clone(st); st.me = [y, x]; st.coins = st.coins.filter(function (p) { return !(p[0] === y && p[1] === x); });
      return { st: st, win: !st.coins.length };
    },
    moves: function (cfg) { return cfg.move.map(function (id) { return { id: id }; }); }
  };

  /* ---------------------------------------------- HOLDOUT families
     (never run during development) */

  /* SWAP: click one tile then another to swap them (the first click is a
     hidden selection); goal: the row equals the template row above. */
  F.swap = {
    config: function (R) { var p = palette(R, 8); return { bg: p[0], cols: p.slice(1, 6), sep: p[6], frame: p[7], actions: [6] }; },
    init: function (R, cfg, lv) {
      var n = 3 + lv, t = shuffle(R, [0, 1, 2, 3, 4]).slice(0, n), w;
      do { w = shuffle(R, t); } while (w.join() === t.join());
      return { n: n, t: t, w: w, sel: -1, H: 5, W: 2 * n + 1 };
    },
    view: function (cfg, st) { var g = grid(st.H, st.W, cfg.bg); for (var i = 0; i < st.n; i++) { g[1][1 + 2 * i] = cfg.cols[st.t[i]]; g[3][1 + 2 * i] = cfg.cols[st.w[i]]; } for (var c = 0; c < st.W; c++) g[2][c] = cfg.sep; return g; },
    step: function (cfg, st, a) {
      if (a.id !== 6 || a.r !== 3 || (a.c - 1) % 2) return { st: st };
      var i = (a.c - 1) / 2; if (i < 0 || i >= st.n) return { st: st };
      st = clone(st);
      if (st.sel < 0) { st.sel = i; return { st: st }; }
      var j = st.sel; st.sel = -1; var t = st.w[i]; st.w[i] = st.w[j]; st.w[j] = t;
      return { st: st, win: st.w.join() === st.t.join() };
    },
    moves: function (cfg, st) { var m = []; for (var i = 0; i < st.n; i++) m.push({ id: 6, r: 3, c: 1 + 2 * i }); return m; }
  };

  /* SYMMETRY: click a cell to toggle it; goal: the pattern is mirror
     symmetric about the vertical axis (drawn as a line). */
  F.symmetry = {
    config: function (R) { var p = palette(R, 4); return { bg: p[0], ink: p[1], axis: p[2], frame: p[3], actions: [6] }; },
    init: function (R, cfg, lv) {
      var h = 4 + lv, w = 3 + lv, on = [];
      for (var i = 0; i < h * w; i++) on.push(R() < 0.5 ? 1 : 0);
      var m = on.slice(); for (var k = 0; k < 2 + lv; k++) m[ri(R, 0, h * w - 1)] ^= 1;
      if (m.join() === on.join()) m[0] ^= 1;   /* never start solved */
      return { h: h, w: w, L: on, Rr: m, H: h, W: 2 * w + 1 };
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg);
      for (var r = 0; r < st.h; r++) { g[r][st.w] = cfg.axis; for (var c = 0; c < st.w; c++) { if (st.L[r * st.w + c]) g[r][c] = cfg.ink; if (st.Rr[r * st.w + c]) g[r][2 * st.w - c] = cfg.ink; } }
      return g;
    },
    step: function (cfg, st, a) {
      if (a.id !== 6 || a.r < 0 || a.r >= st.h || a.c === st.w || a.c < 0 || a.c > 2 * st.w) return { st: st };
      st = clone(st);
      if (a.c < st.w) st.L[a.r * st.w + a.c] ^= 1; else st.Rr[a.r * st.w + (2 * st.w - a.c)] ^= 1;
      return { st: st, win: st.L.join() === st.Rr.join() };
    },
    optimal: function (cfg, st) { var s = 0; for (var i = 0; i < st.L.length; i++) s += st.L[i] !== st.Rr[i] ? 1 : 0; return s; }
  };

  /* DROPSTACK: clicking a column drops a block that falls to the top of the
     stack (animated frames); goal: the column heights equal the template
     skyline shown at the right. */
  F.dropstack = {
    config: function (R) { var p = palette(R, 5); return { bg: p[0], blk: p[1], tmpl: p[2], sep: p[3], frame: p[4], actions: [6] }; },
    init: function (R, cfg, lv) {
      var n = 3 + lv, Hh = 6, t = [], h = [];
      for (var i = 0; i < n; i++) { t.push(ri(R, 1, 4)); h.push(0); }
      for (i = 0; i < n; i++) h[i] = Math.max(0, t[i] - ri(R, 0, 2));
      if (h.join() === t.join()) h[0] = Math.max(0, h[0] - 1);
      return { n: n, t: t, h: h, Hh: Hh, H: Hh, W: 2 * n + 1 };
    },
    view: function (cfg, st, falling) {
      var g = grid(st.H, st.W, cfg.bg);
      for (var i = 0; i < st.n; i++) { g[st.Hh - 1 - (st.t[i] - 1)][st.n + 1 + i] = cfg.tmpl; for (var k = 0; k < st.h[i]; k++) g[st.Hh - 1 - k][i] = cfg.blk; }
      for (var r = 0; r < st.H; r++) g[r][st.n] = cfg.sep;
      if (falling) g[falling[0]][falling[1]] = cfg.blk;
      return g;
    },
    step: function (cfg, st, a) {
      if (a.id !== 6 || a.c < 0 || a.c >= st.n || a.r < 0 || a.r >= st.H) return { st: st };
      if (st.h[a.c] >= st.Hh - 1) return { st: st };
      var anim = [], land = st.Hh - 1 - st.h[a.c];
      for (var r = 0; r < land; r++) anim.push(this.view(cfg, st, [r, a.c]));
      st = clone(st); st.h[a.c]++;
      var over = st.h.some(function (v, i) { return v > st.t[i]; });
      return { st: st, anim: anim, win: st.h.join() === st.t.join(), lose: over };
    },
    optimal: function (cfg, st) { var s = 0; for (var i = 0; i < st.n; i++) s += st.t[i] - st.h[i]; return s; }
  };

  /* LOGICPANEL: switches (click to toggle) feed a lamp through a HIDDEN
     boolean function (AND, OR, XOR, or "exactly k on"); goal: lamp lit. */
  F.logicpanel = {
    config: function (R) { var p = palette(R, 6); return { bg: p[0], off: p[1], on: p[2], lampOff: p[3], lampOn: p[4], frame: p[5], fn: ["and", "xor", "exact2", "majority"][ri(R, 0, 3)], actions: [6] }; },
    init: function (R, cfg, lv) {
      var n = 3 + (lv >= 1 ? 1 : 0), s = [];
      for (;;) { s = []; for (var i = 0; i < n; i++) s.push(R() < 0.4 ? 1 : 0); if (!this.lit(cfg, s)) break; }
      return { n: n, s: s, H: 5, W: 2 * n + 1 };
    },
    lit: function (cfg, s) {
      var k = s.reduce(function (a, b) { return a + b; }, 0);
      return cfg.fn === "and" ? k === s.length : cfg.fn === "xor" ? k % 2 === 1 && k < s.length : cfg.fn === "exact2" ? k === 2 : k * 2 > s.length;
    },
    view: function (cfg, st) { var g = grid(st.H, st.W, cfg.bg); for (var i = 0; i < st.n; i++) g[3][1 + 2 * i] = st.s[i] ? cfg.on : cfg.off; g[1][st.n] = this.lit(cfg, st.s) ? cfg.lampOn : cfg.lampOff; return g; },
    step: function (cfg, st, a) {
      if (a.id !== 6 || a.r !== 3 || (a.c - 1) % 2) return { st: st };
      var i = (a.c - 1) / 2; if (i < 0 || i >= st.n) return { st: st };
      st = clone(st); st.s[i] ^= 1; return { st: st, win: this.lit(cfg, st.s) };
    },
    moves: function (cfg, st) { var m = []; for (var i = 0; i < st.n; i++) m.push({ id: 6, r: 3, c: 1 + 2 * i }); return m; }
  };

  /* ELIMINATE: clicking an object deletes it only if it has the property
     marked by the legend object in the corner (same shape); clicking a
     wrong object is game over. Goal: no object with that shape left. */
  F.eliminate = {
    config: function (R) { var p = palette(R, 5); return { bg: p[0], o1: p[1], o2: p[2], legend: p[3], frame: p[4], actions: [6] }; },
    init: function (R, cfg, lv) {
      var st = { H: 10, W: 10, objs: [], shape: ri(R, 0, SHAPES.length - 1) }, other = (st.shape + 1 + ri(R, 0, SHAPES.length - 2)) % SHAPES.length;
      var occ = grid(10, 10, 0), n = 3 + lv;
      for (var k = 0; k < n; k++) {
        var sh = k % 2 ? other : st.shape, cells = rot(SHAPES[sh], 0), placed = false;
        for (var tr = 0; tr < 200 && !placed; tr++) {
          var r0 = ri(R, 3, 7), c0 = ri(R, 0, 7);
          if (cells.every(function (q) { var y = r0 + q[0], x = c0 + q[1]; if (y >= 10 || x >= 10) return false; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < 10 && xx < 10 && occ[yy][xx]) return false; } return true; })) {
            cells.forEach(function (q) { occ[r0 + q[0]][c0 + q[1]] = 1; });
            st.objs.push({ sh: sh, r: r0, c: c0, col: R() < 0.5 ? "o1" : "o2" }); placed = true;
          }
        }
      }
      return st;
    },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg);
      rot(SHAPES[st.shape], 0).forEach(function (q) { g[q[0]][q[1]] = cfg.legend; });
      st.objs.forEach(function (o) { rot(SHAPES[o.sh], 0).forEach(function (q) { g[o.r + q[0]][o.c + q[1]] = cfg[o.col]; }); });
      return g;
    },
    step: function (cfg, st, a) {
      if (a.id !== 6) return { st: st };
      var i = st.objs.findIndex(function (o) { return rot(SHAPES[o.sh], 0).some(function (q) { return o.r + q[0] === a.r && o.c + q[1] === a.c; }); });
      if (i < 0) return { st: st };
      if (st.objs[i].sh !== st.shape) return { st: st, lose: true };
      st = clone(st); st.objs.splice(i, 1);
      var shape = st.shape;
      return { st: st, win: !st.objs.some(function (o) { return o.sh === shape; }) };
    },
    optimal: function (cfg, st) { return st.objs.filter(function (o) { return o.sh === st.shape; }).length; }
  };

  /* BRIDGEKEY (composition holdout): clicking the switch rotates the bridge
     segment by 90 degrees (horizontal <-> vertical) across the water; the
     avatar walks across, picks up the key (carried invisibly) and opens the
     door in front of the goal. */
  F.bridgekey = {
    config: function (R) { var c = avatarCfg(R, 2); c.actions = c.move.concat([6]).sort(); c.water = c.extra[0]; c.bridge = c.extra[1]; c.sw = c.p6; return c; },
    init: function (R, cfg, lv) {
      var H = 9, W = 11 + 2 * lv, g = grid(H, W, 0), r, c;
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (r === 0 || c === 0 || r === H - 1 || c === W - 1) g[r][c] = 1;
      var wc = 4 + lv;
      for (r = 1; r < H - 1; r++) for (c = wc - 1; c <= wc + 1; c++) g[r][c] = 2;
      var br = ri(R, 2, H - 3), dx = W - 3;
      for (r = 1; r < H - 1; r++) g[r][dx] = 1;
      var dr = ri(R, 1, H - 2); g[dr][dx] = 0;
      return { H: H, W: W, g: g, me: [ri(R, 1, H - 2), 1], goal: [ri(R, 1, H - 2), W - 2], bridge: { r: br, c: wc, horiz: false }, sw: [ri(R, 1, H - 2), 2], key: [ri(R, 1, H - 2), wc + 3], held: false, door: [dr, dx], open: false };
    },
    bridgeCells: function (st) { var b = st.bridge; return b.horiz ? [[b.r, b.c - 1], [b.r, b.c], [b.r, b.c + 1]] : [[b.r - 1, b.c], [b.r, b.c], [b.r + 1, b.c]]; },
    view: function (cfg, st) {
      var g = grid(st.H, st.W, cfg.bg), r, c;
      for (r = 0; r < st.H; r++) for (c = 0; c < st.W; c++) g[r][c] = st.g[r][c] === 1 ? cfg.wall : st.g[r][c] === 2 ? cfg.water : cfg.bg;
      this.bridgeCells(st).forEach(function (q) { g[q[0]][q[1]] = cfg.bridge; });
      g[st.sw[0]][st.sw[1]] = cfg.sw;
      if (!st.held) g[st.key[0]][st.key[1]] = cfg.p4;
      if (!st.open) g[st.door[0]][st.door[1]] = cfg.p5;
      g[st.goal[0]][st.goal[1]] = cfg.goal; g[st.me[0]][st.me[1]] = cfg.me; return g;
    },
    step: function (cfg, st, a) {
      if (a.id === 6) {
        if (a.r !== st.sw[0] || a.c !== st.sw[1]) return { st: st };
        st = clone(st); st.bridge.horiz = !st.bridge.horiz; return { st: st };
      }
      var d = dirOf(cfg, a); if (!d) return { st: st };
      var y = st.me[0] + d[0], x = st.me[1] + d[1];
      var onBridge = this.bridgeCells(st).some(function (q) { return q[0] === y && q[1] === x; });
      if (st.g[y][x] === 1 || (st.g[y][x] === 2 && !onBridge)) return { st: st };
      if (y === st.door[0] && x === st.door[1] && !st.open && !st.held) return { st: st };
      st = clone(st); st.me = [y, x];
      if (y === st.key[0] && x === st.key[1]) st.held = true;
      if (y === st.door[0] && x === st.door[1]) st.open = true;
      return { st: st, win: y === st.goal[0] && x === st.goal[1] };
    },
    moves: function (cfg, st) { return cfg.move.map(function (id) { return { id: id }; }).concat([{ id: 6, r: st.sw[0], c: st.sw[1] }]); }
  };

  var DEV = ["lights", "rotsel", "cyclematch", "counter", "modepaint", "sequence", "maze", "push", "patrol", "keys", "timedstop", "collect"];
  var HOLDOUT = ["swap", "symmetry", "dropstack", "logicpanel", "eliminate", "bridgekey"];

  /* ------------------------------------------------------------ oracle */
  function stKey(st) { return JSON.stringify(st); }
  function bfs(fam, cfg, st0, cap) {
    var seen = new Set([stKey(st0)]), q = [[st0, 0]], head = 0;
    while (head < q.length && seen.size < cap) {
      var cur = q[head++], ms = fam.moves(cfg, cur[0]);
      for (var i = 0; i < ms.length; i++) {
        var r = fam.step(cfg, cur[0], ms[i]);
        if (r.lose) continue;
        if (r.win) return cur[1] + 1;
        var k = stKey(r.st); if (seen.has(k)) continue;
        seen.add(k); q.push([r.st, cur[1] + 1]);
      }
    }
    return null;
  }

  /* ------------------------------------------------------------ game */
  function Game(family, seed, opts) {
    opts = opts || {};
    this.family = family; this.fam = F[family]; this.seed = seed;
    var R = rng(seed * 7919 + family.length * 104729 + 17);
    this.cfg = this.fam.config(R);
    this.levels = opts.levels || 3;
    this.init = [];
    this.baselines = [];
    for (var lv = 0; lv < this.levels; lv++) {
      var st = this.fam.init(R, this.cfg, lv), b = this.fam.optimal ? this.fam.optimal(this.cfg, st) : bfs(this.fam, this.cfg, st, 200000);
      this.init.push(st); this.baselines.push(Math.max(1, b || 30));
    }
    this.available = this.fam.avail ? this.fam.avail(this.cfg) : this.cfg.actions;
    this.lv = 0; this.st = null; this.state = "NOT_PLAYED"; this.played = 0;
  }
  Game.prototype.geom = function (st) {
    var s = Math.max(1, Math.floor(64 / Math.max(st.H, st.W)));
    return { s: s, oy: Math.floor((64 - s * st.H) / 2), ox: Math.floor((64 - s * st.W) / 2) };
  };
  Game.prototype.render = function (lg, st) {
    var G = this.geom(st), f = grid(64, 64, this.cfg.frame), r, c, y, x;
    for (r = 0; r < st.H; r++) for (c = 0; c < st.W; c++) {
      var v = lg[r][c];
      for (y = 0; y < G.s; y++) for (x = 0; x < G.s; x++) f[G.oy + r * G.s + y][G.ox + c * G.s + x] = v;
    }
    return f;
  };
  Game.prototype.frame = function () { return this.render(this.fam.view(this.cfg, this.st), this.st); };
  Game.prototype.obs = function (frames) {
    return { frames: frames, state: this.state, levels_completed: this.lv, win_levels: this.levels, available_actions: this.available.slice() };
  };
  Game.prototype.reset = function () {
    this.lv = 0; this.st = clone(this.init[0]); this.state = "NOT_FINISHED"; this.played = 0;
    return this.obs([this.frame()]);
  };
  Game.prototype.logical = function (a) {
    if (a.id !== 6) return { id: a.id };
    var G = this.geom(this.st), c = Math.floor((a.x - G.ox) / G.s), r = Math.floor((a.y - G.oy) / G.s);
    return { id: 6, r: r, c: c };
  };
  Game.prototype.step = function (a) {
    if (a.id === 0) {
      if (this.played === 0 || this.state === "WIN") return this.reset();
      this.st = clone(this.init[this.lv]); this.state = "NOT_FINISHED";
      return this.obs([this.frame()]);
    }
    if (this.state === "WIN" || this.state === "GAME_OVER") return this.obs([]);
    if (this.available.indexOf(a.id) < 0) { this.played++; return this.obs([this.frame()]); }
    this.played++;
    var la = this.logical(a), r = this.fam.step(this.cfg, this.st, la), self = this;
    this.st = r.st;
    var frames = (r.anim || []).map(function (lg) { return self.render(lg, r.st); });
    frames.push(this.frame());
    if (r.lose) { this.state = "GAME_OVER"; return this.obs(frames); }
    if (r.win) {
      this.lv++;
      if (this.lv >= this.levels) { this.state = "WIN"; return this.obs(frames); }
      this.st = clone(this.init[this.lv]);
      frames.push(this.frame());
    }
    return this.obs(frames);
  };
  /* the TRUE next frame of a hypothetical action, for prediction probes;
     does not change the game */
  Game.prototype.peek = function (a) {
    var save = { st: this.st, lv: this.lv, state: this.state, played: this.played };
    var o = this.step(a);
    this.st = save.st; this.lv = save.lv; this.state = save.state; this.played = save.played;
    return o;
  };

  var GAMES = { Game: Game, FAMILIES: F, DEV: DEV, HOLDOUT: HOLDOUT, bfs: bfs, rng: rng };
  root.C4Arc3Games = GAMES;
  if (typeof module !== "undefined" && module.exports) module.exports = GAMES;
})(typeof globalThis !== "undefined" ? globalThis : this);
