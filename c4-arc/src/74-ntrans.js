/* ===== src/74-ntrans.js ===== */
/* Neural transduction: predict the test output grid directly.
 *
 * An independent branch with different inductive biases from every program
 * family: no program is formed. A network trained on synthetic same-shape
 * tasks -- step programs, entity programs AND random cellular automata that
 * no DSL here can express -- reads the demonstrations and paints the output.
 *
 *   task encoder  per demonstration (x_i, y_i): 23 channels (x one-hot, y
 *                 one-hot, x != y, x == bg, y == bg), conv3x3 d1, d2, d4
 *                 (24 ch), mean+max pool, dense 48 -> 96; the demonstrations
 *                 are a set: mean+max -> dense 192 -> 96 = z
 *   transitions   T[c][c'] = share of cells of colour c that became c'
 *   decoder       conv3x3 d1, d2, d4 over the test input (11 ch -> 24 ch);
 *                 per cell [features, own colour one-hot, T[own colour], z]
 *                 -> 64 (ReLU) -> 10 colour logits
 * Admission is LEAVE-ONE-DEMONSTRATION-OUT, as for 69-transduce.js: encoded
 * without demonstration j, the model must repaint demonstration j exactly,
 * for every j. Only then is its test prediction a candidate. The portfolio
 * treats it as family "ntrans".
 */
var NTRANS = (function () {
  var C = 24, PIN = 23, SIN = 11, DD = 96, DZ = 96, DI = C + 20, DH = 64;
  function create() {
    var p = {
      a1: NN.param(PIN * C * 9, PIN * 9), ab1: NN.param(C, 1, true),
      a2: NN.param(C * C * 9, C * 9), ab2: NN.param(C, 1, true),
      a3: NN.param(C * C * 9, C * 9), ab3: NN.param(C, 1, true),
      e1: NN.param(2 * C * DD, 2 * C), eb1: NN.param(DD, 1, true),
      e2: NN.param(2 * DD * DZ, 2 * DD), eb2: NN.param(DZ, 1, true),
      b1: NN.param(SIN * C * 9, SIN * 9), bb1: NN.param(C, 1, true),
      b2: NN.param(C * C * 9, C * 9), bb2: NN.param(C, 1, true),
      b3: NN.param(C * C * 9, C * 9), bb3: NN.param(C, 1, true),
      h1: NN.param(DI * DH, DI + DZ), hz: NN.param(DZ * DH, DI + DZ), hb1: NN.param(DH, 1, true),
      h2: NN.param(DH * 10, DH), hb2: NN.param(10, 1, true)
    };
    var order = Object.keys(p);
    return { p: p, order: order, list: order.map(function (k) { return p[k]; }) };
  }
  function pairIn(x, y, bg) {
    var H = x.length, W = x[0].length, HW = H * W, P = new Float32Array(PIN * HW), r, c, i;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      i = r * W + c; var a = x[r][c], b = y[r][c];
      P[a * HW + i] = 1; P[(10 + b) * HW + i] = 1;
      if (a !== b) P[20 * HW + i] = 1; if (a === bg) P[21 * HW + i] = 1; if (b === bg) P[22 * HW + i] = 1;
    }
    return P;
  }
  function singleIn(x, bg) {
    var H = x.length, W = x[0].length, HW = H * W, P = new Float32Array(SIN * HW), r, c;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) { P[x[r][c] * HW + r * W + c] = 1; if (x[r][c] === bg) P[10 * HW + r * W + c] = 1; }
    return P;
  }
  function trans(pairs) {
    var T = new Float32Array(100), n = new Float32Array(10), i, r, c;
    pairs.forEach(function (pr) { for (r = 0; r < pr[0].length; r++) for (c = 0; c < pr[0][r].length; c++) { T[pr[0][r][c] * 10 + pr[1][r][c]]++; n[pr[0][r][c]]++; } });
    for (i = 0; i < 100; i++) if (n[(i / 10) | 0]) T[i] /= n[(i / 10) | 0];
    return T;
  }
  function conv3(m, pre, x, cin, H, W) {
    var P = m.p;
    var a = NN.relu(NN.conv(P[pre + "1"], P[pre + "b1"], x, cin, H, W, C, 1));
    var b = NN.relu(NN.conv(P[pre + "2"], P[pre + "b2"], a, C, H, W, C, 2));
    var c = NN.relu(NN.conv(P[pre + "3"], P[pre + "b3"], b, C, H, W, C, 4));
    return { x: x, a: a, b: b, c: c, cin: cin, H: H, W: W };
  }
  function conv3Back(m, pre, t, dc) {
    var P = m.p;
    NN.reluBack(t.c, dc);
    var db = NN.convBack(P[pre + "3"], P[pre + "b3"], t.b, C, t.H, t.W, C, 4, dc, true); NN.reluBack(t.b, db);
    var da = NN.convBack(P[pre + "2"], P[pre + "b2"], t.a, C, t.H, t.W, C, 2, db, true); NN.reluBack(t.a, da);
    NN.convBack(P[pre + "1"], P[pre + "b1"], t.x, t.cin, t.H, t.W, C, 1, da, false);
  }
  /* encode the demonstrations -> z */
  function encode(m, pairs, bg) {
    var P = m.p, D = [], hs = [], j, d;
    pairs.forEach(function (pr) {
      var H = pr[0].length, W = pr[0][0].length, t = conv3(m, "a", pairIn(pr[0], pr[1], bg), PIN, H, W);
      var pl = NN.pool(t.c, C, H * W), h = NN.relu(NN.dense(P.e1, P.eb1, pl.y, 2 * C, DD));
      D.push({ t: t, pl: pl, h: h }); hs.push(h);
    });
    var u = new Float32Array(2 * DD), am = new Int32Array(DD);
    for (j = 0; j < DD; j++) {
      var s = 0, mx = -Infinity, ai = 0;
      for (d = 0; d < hs.length; d++) { s += hs[d][j]; if (hs[d][j] > mx) { mx = hs[d][j]; ai = d; } }
      u[j] = s / hs.length; u[DD + j] = mx; am[j] = ai;
    }
    var z = NN.relu(NN.dense(P.e2, P.eb2, u, 2 * DD, DZ));
    return { D: D, u: u, am: am, z: z, T: trans(pairs) };
  }
  /* paint the output for x given the encoding */
  function decode(m, enc, x, bg) {
    var P = m.p, H = x.length, W = x[0].length, HW = H * W, t = conv3(m, "b", singleIn(x, bg), SIN, H, W);
    var hz = NN.dense(P.hz, P.hb1, enc.z, DZ, DH), cells = [], logits = new Float32Array(10 * HW), i, k, j;
    for (i = 0; i < HW; i++) {
      var v = x[(i / W) | 0][i % W], inp = new Float32Array(DI);
      for (k = 0; k < C; k++) inp[k] = t.c[k * HW + i];
      inp[C + v] = 1;
      for (k = 0; k < 10; k++) inp[C + 10 + k] = enc.T[v * 10 + k];
      var h = new Float32Array(DH);
      for (j = 0; j < DH; j++) { var s = hz[j], wo = j * DI; for (k = 0; k < DI; k++) s += P.h1.w[wo + k] * inp[k]; h[j] = s > 0 ? s : 0; }
      var lg = NN.dense(P.h2, P.hb2, h, DH, 10);
      for (k = 0; k < 10; k++) logits[k * HW + i] = lg[k];
      cells.push({ inp: inp, h: h });
    }
    return { t: t, cells: cells, logits: logits, H: H, W: W };
  }
  function predictGrid(dec) {
    var H = dec.H, W = dec.W, HW = H * W, out = [], r, c, k;
    for (r = 0; r < H; r++) {
      var row = [];
      for (c = 0; c < W; c++) { var i = r * W + c, b = 0, bv = -Infinity; for (k = 0; k < 10; k++) if (dec.logits[k * HW + i] > bv) { bv = dec.logits[k * HW + i]; b = k; } row.push(b); }
      out.push(row);
    }
    return out;
  }
  /* cross-entropy over the target cells; backward through decoder and encoder */
  function lossBack(m, enc, dec, y) {
    var P = m.p, H = dec.H, W = dec.W, HW = H * W, loss = 0, i, k, j;
    var dF = new Float32Array(C * HW), dz = new Float32Array(DZ), dhzSum = new Float32Array(DH);
    for (i = 0; i < HW; i++) {
      var lg = new Float32Array(10); for (k = 0; k < 10; k++) lg[k] = dec.logits[k * HW + i];
      var p = NN.softmax(lg), tgt = y[(i / W) | 0][i % W];
      loss -= Math.log(Math.max(1e-9, p[tgt]));
      var dl = new Float32Array(10); for (k = 0; k < 10; k++) dl[k] = (p[k] - (k === tgt ? 1 : 0)) / HW;
      var cell = dec.cells[i], dh = NN.denseBack(P.h2, P.hb2, cell.h, DH, 10, dl, true);
      NN.reluBack(cell.h, dh);
      for (j = 0; j < DH; j++) {
        var d = dh[j]; if (d === 0) continue;
        dhzSum[j] += d; var wo = j * DI;
        for (k = 0; k < DI; k++) { P.h1.g[wo + k] += d * cell.inp[k]; if (k < C) dF[k * HW + i] += d * P.h1.w[wo + k]; }
      }
    }
    var dzv = NN.denseBack(P.hz, P.hb1, enc.z, DZ, DH, dhzSum, true);
    for (k = 0; k < DZ; k++) dz[k] = dzv[k];
    conv3Back(m, "b", dec.t, dF);
    NN.reluBack(enc.z, dz);
    var du = NN.denseBack(P.e2, P.eb2, enc.u, 2 * DD, DZ, dz, true), nd = enc.D.length;
    enc.D.forEach(function (D, d) {
      var dh2 = new Float32Array(DD);
      for (j = 0; j < DD; j++) { dh2[j] = du[j] / nd; if (enc.am[j] === d) dh2[j] += du[DD + j]; }
      NN.reluBack(D.h, dh2);
      var dpl = NN.denseBack(P.e1, P.eb1, D.pl.y, 2 * C, DD, dh2, true);
      conv3Back(m, "a", D.t, NN.poolBack(D.pl, C, D.t.H * D.t.W, dpl));
    });
    return loss / HW;
  }
  /* LODO-gated prediction for a task: null unless every demonstration is
     repainted exactly from the others */
  function solve(m, ctx) {
    var tr = ctx.train, bg = ctx.bg(), j;
    if (tr.length < 2) return null;
    for (j = 0; j < tr.length; j++) if (tr[j][0].length !== tr[j][1].length || tr[j][0][0].length !== tr[j][1][0].length) return null;
    for (j = 0; j < tr.length; j++) {
      var rest = tr.filter(function (_, k) { return k !== j; });
      if (!G.gEq(predictGrid(decode(m, encode(m, rest, bg), tr[j][0], bg)), tr[j][1])) return null;
    }
    var enc = encode(m, tr, bg);
    return function (g) { return predictGrid(decode(m, enc, g, bg)); };
  }
  function dump(m) {
    var n = 0; m.list.forEach(function (P) { n += P.n; });
    var all = new Float32Array(n), o = 0; m.list.forEach(function (P) { all.set(P.w, o); o += P.n; });
    return { n: n, w: Buffer.from(all.buffer).toString("base64") };
  }
  function load(m, W) {
    if (!W) return false;
    var bin = typeof Buffer !== "undefined" ? Buffer.from(W.w, "base64") : Uint8Array.from(atob(W.w), function (ch) { return ch.charCodeAt(0); });
    var all = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4), o = 0;
    if (all.length !== W.n) return false;
    m.list.forEach(function (P) { P.w.set(all.subarray(o, o + P.n)); o += P.n; });
    return true;
  }
  var shipped = null;
  function base() {
    if (shipped === null) { shipped = false; if (typeof NTRANS_WEIGHTS !== "undefined" && NTRANS_WEIGHTS) { var m = create(); if (load(m, NTRANS_WEIGHTS)) shipped = m; } }
    return shipped || null;
  }
  (function () {
    function generate(ctx) {
      var m = base(); if (!m) return [];
      var f = null; try { f = solve(m, ctx); } catch (e) { f = null; }
      return f ? [new Hyp("ntrans", f, 6.5, "ntrans")] : [];
    }
    var mod = defSolver("ntrans", "ntrans", generate, 2, 0.6);
    mod.NO_LOO = true;
  })();
  return { create: create, encode: encode, decode: decode, predictGrid: predictGrid, lossBack: lossBack, solve: solve, dump: dump, load: load, base: base };
})();
