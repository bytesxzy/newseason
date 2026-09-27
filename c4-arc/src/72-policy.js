/* ===== src/72-policy.js ===== */
/* The transformation policy: P(next step | input, EXECUTED state, target).
 *
 * The model never infers what a partial program did from its tokens; it is
 * shown the executed state S_i = P(x_i) of every demonstration next to the
 * target y_i, and asked which step closes the gap. Per demonstration:
 *
 *   pair tower   (only when S_i and y_i have the same size) over 25 channels:
 *                S one-hot (10), y one-hot (10), S != y, S == bg, y == bg,
 *                x != S, x != y   -- conv3x3 d1, d2, d4 (16 ch), mean+max pool
 *   single tower over S_i and over y_i (shared weights), 11 channels:
 *                one-hot (10), == bg  -- conv3x3 d1, d2 (16 ch), mean+max pool
 *   16 scalars   sizes, size ratios, residual fraction, palette sizes, ...
 *   -> dense 112 -> 96 (ReLU)
 * The demonstrations are a SET: mean and max over them -> dense 192 -> 128.
 * Heads:
 *   type    128 -> K logits over STEPS.TYPES (70-steps.js)
 *   colour  a pointer over colours: for each colour c, its statistics
 *           (8, averaged over demonstrations) and the pair-tower features
 *           pooled over the cells where y == c and where S == c, with the
 *           task vector z -> 32 -> one score per colour-taking step type.
 *           Colours are compared by what they DO in the demonstrations,
 *           not by their names, so the head is colour-permutation equivariant.
 *
 * mode "template" is the ablation Ouellette calls learning the program
 * space: the same network sees the INPUT instead of the executed state and,
 * in addition, the steps already taken (a bag and the last step). It must
 * infer from tokens what the partial program did.
 */
var POLICY = (function () {
  var K = STEPS.N, NCT = STEPS.COLOR_TYPES.length, CT = {}, C1 = 16, PIN = 25, SIN = 11, NSC = 16, NCS = 8;
  STEPS.COLOR_TYPES.forEach(function (id, j) { CT[id] = j; });
  var DIN = 6 * C1 + NSC, DH = 96, DZ = 128, DC = NCS + 2 * C1 + DZ, DCH = 32;

  function create(mode) {
    var NU = 2 * DH + (mode === "template" ? 2 * K : 0);
    var p = {
      pc1: NN.param(PIN * C1 * 9, PIN * 9), pb1: NN.param(C1, 1, true),
      pc2: NN.param(C1 * C1 * 9, C1 * 9), pb2: NN.param(C1, 1, true),
      pc3: NN.param(C1 * C1 * 9, C1 * 9), pb3: NN.param(C1, 1, true),
      sc1: NN.param(SIN * C1 * 9, SIN * 9), sb1: NN.param(C1, 1, true),
      sc2: NN.param(C1 * C1 * 9, C1 * 9), sb2: NN.param(C1, 1, true),
      d1: NN.param(DIN * DH, DIN), e1: NN.param(DH, 1, true),
      d2: NN.param(NU * DZ, NU), e2: NN.param(DZ, 1, true),
      d3: NN.param(DZ * K, DZ), e3: NN.param(K, 1, true),
      c1: NN.param(DC * DCH, DC), f1: NN.param(DCH, 1, true),
      c2: NN.param(DCH * NCT, DCH), f2: NN.param(NCT, 1, true)
    };
    var order = ["pc1", "pb1", "pc2", "pb2", "pc3", "pb3", "sc1", "sb1", "sc2", "sb2", "d1", "e1", "d2", "e2", "d3", "e3", "c1", "f1", "c2", "f2"];
    return { mode: mode || "full", p: p, order: order, list: order.map(function (k) { return p[k]; }), NU: NU };
  }

  /* ---------------------------------------------------------- features */
  function palMask(g) { var m = 0; for (var r = 0; r < g.length; r++) for (var c = 0; c < g[r].length; c++) m |= 1 << g[r][c]; return m; }
  function single(g, bg) {
    var H = g.length, W = g[0].length, HW = H * W, x = new Float32Array(SIN * HW), r, c, v;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) { v = g[r][c]; x[v * HW + r * W + c] = 1; if (v === bg) x[10 * HW + r * W + c] = 1; }
    return { x: x, H: H, W: W };
  }
  function demoFeats(x, S, y, bg) {
    var HS = S.length, WS = S[0].length, Hy = y.length, Wy = y[0].length, same = HS === Hy && WS === Wy;
    var xs = x.length === HS && x[0].length === WS, xy = x.length === Hy && x[0].length === Wy;
    var f = { same: same, sS: single(S, bg), sY: single(y, bg), pair: null, H: Hy, W: Wy, sc: new Float32Array(NSC), cs: new Float32Array(10 * NCS), yMask: null, sMask: null };
    var HW = Hy * Wy, r, c, resid = 0, i;
    if (same) {
      var P = new Float32Array(PIN * HW); f.yMask = new Uint8Array(HW); f.sMask = new Uint8Array(HW);
      for (r = 0; r < Hy; r++) for (c = 0; c < Wy; c++) {
        i = r * Wy + c; var sv = S[r][c], yv = y[r][c];
        P[sv * HW + i] = 1; P[(10 + yv) * HW + i] = 1;
        if (sv !== yv) { P[20 * HW + i] = 1; resid++; }
        if (sv === bg) P[21 * HW + i] = 1;
        if (yv === bg) P[22 * HW + i] = 1;
        if (xs && x[r][c] !== sv) P[23 * HW + i] = 1;
        if (xy && x[r][c] !== yv) P[24 * HW + i] = 1;
        f.yMask[i] = yv; f.sMask[i] = sv;
      }
      f.pair = P;
    }
    var pS = palMask(S), pY = palMask(y), pX = palMask(x), nS = HS * WS, nY = HW, nX = x.length * x[0].length;
    var cS = new Float32Array(10), cY = new Float32Array(10), cX = new Float32Array(10), rS = new Float32Array(10), rY = new Float32Array(10);
    for (r = 0; r < HS; r++) for (c = 0; c < WS; c++) cS[S[r][c]]++;
    for (r = 0; r < Hy; r++) for (c = 0; c < Wy; c++) { cY[y[r][c]]++; if (same && S[r][c] !== y[r][c]) { rS[S[r][c]]++; rY[y[r][c]]++; } }
    for (r = 0; r < x.length; r++) for (c = 0; c < x[0].length; c++) cX[x[r][c]]++;
    for (c = 0; c < 10; c++) {
      var o = c * NCS;
      f.cs[o] = cS[c] / nS; f.cs[o + 1] = cY[c] / nY; f.cs[o + 2] = cX[c] / nX;
      f.cs[o + 3] = resid ? rS[c] / resid : 0; f.cs[o + 4] = resid ? rY[c] / resid : 0;
      f.cs[o + 5] = c === bg ? 1 : 0; f.cs[o + 6] = (pY >> c & 1) && !(pS >> c & 1) ? 1 : 0; f.cs[o + 7] = (pS >> c & 1) && !(pY >> c & 1) ? 1 : 0;
    }
    var s = f.sc, nc = function (m) { var k = 0; while (m) { k += m & 1; m >>= 1; } return k; };
    s[0] = HS / 30; s[1] = WS / 30; s[2] = Hy / 30; s[3] = Wy / 30; s[4] = same ? 1 : 0;
    s[5] = Math.min(4, Hy / HS) / 4; s[6] = Math.min(4, Wy / WS) / 4; s[7] = same ? resid / HW : 1;
    s[8] = nc(pS) / 10; s[9] = nc(pY) / 10; s[10] = cS[bg] / nS; s[11] = cY[bg] / nY;
    s[12] = same && !resid ? 1 : 0; s[13] = xs ? 1 : 0; s[14] = xs && G.gEq(x, S) ? 1 : 0; s[15] = Hy <= HS && Wy <= WS ? 1 : 0;
    f.pal = pS | pY | pX;
    return f;
  }

  /* ------------------------------------------------------ forward pass */
  function tower(m, sx, H, W, keep) {
    var P = m.p, HW = H * W;
    var a1 = NN.relu(NN.conv(P.sc1, P.sb1, sx, SIN, H, W, C1, 1));
    var a2 = NN.relu(NN.conv(P.sc2, P.sb2, a1, C1, H, W, C1, 2));
    var pl = NN.pool(a2, C1, HW);
    return keep ? { x: sx, a1: a1, a2: a2, pl: pl, H: H, W: W } : { pl: pl };
  }
  function forward(m, ex, keep) {
    var P = m.p, nd = ex.demos.length, D = [], hs = [], d, i, j;
    for (d = 0; d < nd; d++) {
      var dm = ex.demos[d], S = m.mode === "template" ? dm.x : dm.S;
      var f = demoFeats(dm.x, S, dm.y, ex.bg), c = { f: f };
      var pv = new Float32Array(2 * C1);
      if (f.same) {
        var H = f.H, W = f.W, HW = H * W;
        c.a1 = NN.relu(NN.conv(P.pc1, P.pb1, f.pair, PIN, H, W, C1, 1));
        c.a2 = NN.relu(NN.conv(P.pc2, P.pb2, c.a1, C1, H, W, C1, 2));
        c.a3 = NN.relu(NN.conv(P.pc3, P.pb3, c.a2, C1, H, W, C1, 4));
        c.pp = NN.pool(c.a3, C1, HW); pv = c.pp.y;
      }
      c.ts = tower(m, f.sS.x, f.sS.H, f.sS.W, keep);
      c.ty = (!keep && dm._ty) ? dm._ty : tower(m, f.sY.x, f.sY.H, f.sY.W, keep);
      if (!keep) dm._ty = c.ty;
      var in1 = new Float32Array(DIN);
      in1.set(pv, 0); in1.set(c.ts.pl.y, 2 * C1); in1.set(c.ty.pl.y, 4 * C1); in1.set(f.sc, 6 * C1);
      c.in1 = in1; c.h = NN.relu(NN.dense(P.d1, P.e1, in1, DIN, DH));
      D.push(c); hs.push(c.h);
    }
    var u = new Float32Array(m.NU), am = new Int32Array(DH);
    for (j = 0; j < DH; j++) {
      var s = 0, mx = -Infinity, ai = 0;
      for (d = 0; d < nd; d++) { s += hs[d][j]; if (hs[d][j] > mx) { mx = hs[d][j]; ai = d; } }
      u[j] = s / nd; u[DH + j] = mx; am[j] = ai;
    }
    if (m.mode === "template" && ex.prev) u.set(ex.prev, 2 * DH);
    var z = NN.relu(NN.dense(P.d2, P.e2, u, m.NU, DZ));
    var logits = NN.dense(P.d3, P.e3, z, DZ, K);
    /* colour pointer */
    var pal = 0; D.forEach(function (c) { pal |= c.f.pal; });
    var col = [];
    for (var cc = 0; cc < 10; cc++) {
      if (!(pal >> cc & 1)) { col.push(null); continue; }
      var fc = new Float32Array(DC), ny = 0, ns = 0;
      for (d = 0; d < nd; d++) {
        var f2 = D[d].f;
        for (i = 0; i < NCS; i++) fc[i] += f2.cs[cc * NCS + i] / nd;
        if (f2.same) {
          var HW2 = f2.H * f2.W, my = new Uint8Array(HW2), ms = new Uint8Array(HW2);
          for (i = 0; i < HW2; i++) { my[i] = f2.yMask[i] === cc ? 1 : 0; ms[i] = f2.sMask[i] === cc ? 1 : 0; }
          var py = NN.maskPool(D[d].a3, C1, HW2, my), ps = NN.maskPool(D[d].a3, C1, HW2, ms);
          for (i = 0; i < C1; i++) { fc[NCS + i] += py.y[i] / nd; fc[NCS + C1 + i] += ps.y[i] / nd; }
          if (keep) { D[d]["my" + cc] = my; D[d]["ms" + cc] = ms; D[d]["ny" + cc] = py.n; D[d]["ns" + cc] = ps.n; }
        }
      }
      fc.set(z, NCS + 2 * C1);
      var hc = NN.relu(NN.dense(P.c1, P.f1, fc, DC, DCH));
      var sc = NN.dense(P.c2, P.f2, hc, DCH, NCT);
      col.push({ fc: fc, hc: hc, s: sc });
    }
    return { D: D, u: u, am: am, z: z, logits: logits, col: col, nd: nd };
  }

  /* -------------------------------------------- loss and backward pass */
  function lossBack(m, ex, fw, lab) {
    var P = m.p, nd = fw.nd, d, i, j;
    var pT = NN.softmax(fw.logits), loss, dlog = new Float32Array(K);
    if (lab.alts && lab.alts.length > 1) {
      /* set-valued label: every equivalent next step is correct; maximise
         their total probability, -log sum_A p, dL/dz_i = p_i - [i in A] p_i / sum_A p */
      var inA = new Uint8Array(K), sA = 0;
      lab.alts.forEach(function (t) { inA[t] = 1; }); inA[lab.type] = 1;
      for (i = 0; i < K; i++) if (inA[i]) sA += pT[i];
      loss = -Math.log(Math.max(1e-9, sA));
      for (i = 0; i < K; i++) dlog[i] = pT[i] - (inA[i] ? pT[i] / Math.max(1e-9, sA) : 0);
    } else {
      loss = -Math.log(Math.max(1e-9, pT[lab.type]));
      for (i = 0; i < K; i++) dlog[i] = pT[i] - (i === lab.type ? 1 : 0);
    }
    var dz = NN.denseBack(P.d3, P.e3, fw.z, DZ, K, dlog, true);
    var dfcD = null;
    if (CT[lab.type] !== undefined && lab.color !== undefined && fw.col[lab.color]) {
      var jj = CT[lab.type], cand = [], cc;
      for (cc = 0; cc < 10; cc++) if (fw.col[cc]) cand.push(cc);
      var zc = new Float32Array(cand.length);
      cand.forEach(function (c, k) { zc[k] = fw.col[c].s[jj]; });
      var pc = NN.softmax(zc), kk = cand.indexOf(lab.color);
      loss += -Math.log(Math.max(1e-9, pc[kk]));
      dfcD = [];
      cand.forEach(function (c, k) {
        var ds = new Float32Array(NCT); ds[jj] = pc[k] - (k === kk ? 1 : 0);
        var e = fw.col[c], dh = NN.denseBack(P.c2, P.f2, e.hc, DCH, NCT, ds, true);
        NN.reluBack(e.hc, dh);
        var dfc = NN.denseBack(P.c1, P.f1, e.fc, DC, DCH, dh, true);
        for (i = 0; i < DZ; i++) dz[i] += dfc[NCS + 2 * C1 + i];
        dfcD.push([c, dfc]);
      });
    }
    NN.reluBack(fw.z, dz);
    var du = NN.denseBack(P.d2, P.e2, fw.u, m.NU, DZ, dz, true);
    for (d = 0; d < nd; d++) {
      var c = fw.D[d], f = c.f, dh2 = new Float32Array(DH);
      for (j = 0; j < DH; j++) { dh2[j] = du[j] / nd; if (fw.am[j] === d) dh2[j] += du[DH + j]; }
      NN.reluBack(c.h, dh2);
      var din = NN.denseBack(P.d1, P.e1, c.in1, DIN, DH, dh2, true);
      if (f.same) {
        var H = f.H, W = f.W, HW = H * W;
        var da3 = NN.poolBack(c.pp, C1, HW, din.subarray(0, 2 * C1));
        if (dfcD) dfcD.forEach(function (e) {
          var cc2 = e[0], dfc2 = e[1];
          NN.maskPoolBack(da3, C1, HW, c["my" + cc2], c["ny" + cc2], dfc2.subarray(NCS, NCS + C1).map(function (v) { return v / nd; }));
          NN.maskPoolBack(da3, C1, HW, c["ms" + cc2], c["ns" + cc2], dfc2.subarray(NCS + C1, NCS + 2 * C1).map(function (v) { return v / nd; }));
        });
        NN.reluBack(c.a3, da3);
        var da2 = NN.convBack(P.pc3, P.pb3, c.a2, C1, H, W, C1, 4, da3, true);
        NN.reluBack(c.a2, da2);
        var da1 = NN.convBack(P.pc2, P.pb2, c.a1, C1, H, W, C1, 2, da2, true);
        NN.reluBack(c.a1, da1);
        NN.convBack(P.pc1, P.pb1, f.pair, PIN, H, W, C1, 1, da1, false);
      }
      [[c.ts, 2 * C1], [c.ty, 4 * C1]].forEach(function (tt) {
        var t = tt[0], HW3 = t.H * t.W, da = NN.poolBack(t.pl, C1, HW3, din.subarray(tt[1], tt[1] + 2 * C1));
        NN.reluBack(t.a2, da);
        var d1 = NN.convBack(P.sc2, P.sb2, t.a1, C1, t.H, t.W, C1, 2, da, true);
        NN.reluBack(t.a1, d1);
        NN.convBack(P.sc1, P.sb1, t.x, SIN, t.H, t.W, C1, 1, d1, false);
      });
    }
    return loss;
  }

  /* ---------------------------------------------------------- inference */
  function predict(m, ex) {
    var fw = forward(m, ex, false), pT = NN.softmax(fw.logits);
    function colours(typeId) {
      var jj = CT[typeId]; if (jj === undefined) return [];
      var cand = [], z = [];
      fw.col.forEach(function (e, c) { if (e) { cand.push(c); z.push(e.s[jj]); } });
      var p = NN.softmax(Float32Array.from(z));
      return cand.map(function (c, k) { return [c, p[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    }
    return { p: pT, colours: colours };
  }
  /* ------------------------------------------ task-time adaptation (heads)
     The convolutional towers and the per-demonstration layer stay frozen;
     their outputs for an example (the set vector u and the colour features)
     are computed once, and only the heads (d2, d3, c1, c2) are fine-tuned on
     a clone. headCache is the frozen part, headLoss the trainable part. */
  function headCache(m, ex) {
    var fw = forward(m, ex, false);
    return { u: fw.u, fc: fw.col.map(function (e) { return e ? e.fc.slice(0, NCS + 2 * C1) : null; }) };
  }
  var HEADS = ["d2", "e2", "d3", "e3", "c1", "f1", "c2", "f2"];
  function cloneHeads(m) {
    var c = { mode: m.mode, NU: m.NU, p: {} };
    for (var k in m.p) c.p[k] = HEADS.indexOf(k) >= 0 ? { w: m.p[k].w.slice(), g: new Float32Array(m.p[k].n), m: new Float32Array(m.p[k].n), v: new Float32Array(m.p[k].n), n: m.p[k].n } : m.p[k];
    c.order = m.order; c.list = m.order.map(function (k) { return c.p[k]; });
    c.heads = HEADS.map(function (k) { return c.p[k]; });
    return c;
  }
  function headLoss(c, hc, lab, back) {
    var P = c.p, z = NN.relu(NN.dense(P.d2, P.e2, hc.u, c.NU, DZ)), logits = NN.dense(P.d3, P.e3, z, DZ, K), pT = NN.softmax(logits), i;
    var loss = -Math.log(Math.max(1e-9, pT[lab.type]));
    if (!back) return loss;
    var dl = new Float32Array(K); for (i = 0; i < K; i++) dl[i] = pT[i] - (i === lab.type ? 1 : 0);
    var dz = NN.denseBack(P.d3, P.e3, z, DZ, K, dl, true);
    if (CT[lab.type] !== undefined && lab.color !== undefined && hc.fc[lab.color]) {
      var jj = CT[lab.type], cand = [], hs = [], zc = [];
      hc.fc.forEach(function (f, cc) {
        if (!f) return;
        var fc = new Float32Array(DC); fc.set(f, 0); fc.set(z, NCS + 2 * C1);
        var hh = NN.relu(NN.dense(P.c1, P.f1, fc, DC, DCH)), s = NN.dense(P.c2, P.f2, hh, DCH, NCT);
        cand.push([cc, fc, hh]); zc.push(s[jj]);
      });
      var pc = NN.softmax(Float32Array.from(zc)), kk = cand.findIndex(function (e) { return e[0] === lab.color; });
      loss += -Math.log(Math.max(1e-9, pc[kk]));
      cand.forEach(function (e, k) {
        var ds = new Float32Array(NCT); ds[jj] = pc[k] - (k === kk ? 1 : 0);
        var dh = NN.denseBack(P.c2, P.f2, e[2], DCH, NCT, ds, true); NN.reluBack(e[2], dh);
        var dfc = NN.denseBack(P.c1, P.f1, e[1], DC, DCH, dh, true);
        for (i = 0; i < DZ; i++) dz[i] += dfc[NCS + 2 * C1 + i];
      });
    }
    NN.reluBack(z, dz);
    NN.denseBack(P.d2, P.e2, hc.u, c.NU, DZ, dz, false);
    return loss;
  }
  function prevVec(steps) {
    var v = new Float32Array(2 * K);
    steps.forEach(function (s) { v[s] = 1; });
    if (steps.length) v[K + steps[steps.length - 1]] = 1;
    return v;
  }

  /* ------------------------------------------------ weights (de)serialise */
  function dump(m) {
    var n = 0; m.list.forEach(function (P) { n += P.n; });
    var all = new Float32Array(n), o = 0;
    m.list.forEach(function (P) { all.set(P.w, o); o += P.n; });
    return { mode: m.mode, names: STEPS.NAMES.join(","), n: n, w: Buffer.from(all.buffer).toString("base64") };
  }
  function load(m, W) {
    if (!W || W.names !== STEPS.NAMES.join(",") || W.mode !== m.mode) return false;
    var bin = typeof Buffer !== "undefined" ? Buffer.from(W.w, "base64") : Uint8Array.from(atob(W.w), function (ch) { return ch.charCodeAt(0); });
    var all = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4), o = 0;
    if (all.length !== W.n) return false;
    var ok = true; m.list.forEach(function (P) { if (o + P.n > all.length) ok = false; else P.w.set(all.subarray(o, o + P.n)); o += P.n; });
    return ok && o === all.length;
  }
  var shipped = null;
  function base() {
    if (shipped === null) {
      shipped = false;
      if (typeof POLICY_WEIGHTS !== "undefined" && POLICY_WEIGHTS) { var m = create("full"); if (load(m, POLICY_WEIGHTS)) shipped = m; }
    }
    return shipped || null;
  }
  return { create: create, forward: forward, lossBack: lossBack, predict: predict, prevVec: prevVec, dump: dump, load: load, base: base,
           demoFeats: demoFeats, K: K, CT: CT, headCache: headCache, cloneHeads: cloneHeads, headLoss: headLoss };
})();
