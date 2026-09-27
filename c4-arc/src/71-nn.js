/* ===== src/71-nn.js ===== */
/* A small neural-network library: exactly what the transformation policy
 * (72-policy.js) needs, with hand-written backward passes, in plain
 * JavaScript on Float32Arrays. No external model and no dependency: the
 * weights are trained by tools/arc-policy-train.js on synthetic tasks and
 * shipped as a generated file.
 *
 * Tensors are flat Float32Arrays, feature maps are channel-major (C x H x W).
 * Every layer keeps what its backward pass needs in a per-call cache object,
 * so one forward/backward pair per example is re-entrant.
 *
 *   NN.param(n, scale)            parameter {w, g, m, v} (He-scaled init)
 *   NN.conv(P, x, cin, H, W, cout, dil)          3x3 'same' convolution
 *   NN.convBack(P, x, cin, H, W, cout, dil, dy)  -> dx, accumulates P.g
 *   NN.dense(P, x, nin, nout) / NN.denseBack(P, x, nin, nout, dy) -> dx
 *   NN.relu(y) in place / NN.reluBack(y, dy) in place
 *   NN.pool(x, C, HW) -> [mean(C), max(C)] + argmax / NN.poolBack
 *   NN.adam(params, lr, t)        one Adam step, clears gradients
 */
var NN = (function () {
  var seed = 12345;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function gauss() { var u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function param(n, fanIn, zero) {
    var w = new Float32Array(n), s = Math.sqrt(2 / Math.max(1, fanIn)), i;
    if (!zero) for (i = 0; i < n; i++) w[i] = gauss() * s;
    return { w: w, g: new Float32Array(n), m: new Float32Array(n), v: new Float32Array(n), n: n };
  }
  /* 3x3 convolution with dilation, zero padding, output same size.
     P.w layout [cout][cin][3][3], bias in P.b */
  function conv(P, B, x, cin, H, W, cout, dil) {
    var HW = H * W, y = new Float32Array(cout * HW), co, ci, ky, kx, r, c, w, dr, dc, r0, r1, c0, c1, yo, xo, wo;
    for (co = 0; co < cout; co++) {
      var bb = B.w[co]; yo = co * HW;
      for (r = 0; r < HW; r++) y[yo + r] = bb;
      for (ci = 0; ci < cin; ci++) {
        xo = ci * HW; wo = (co * cin + ci) * 9;
        for (ky = 0; ky < 3; ky++) {
          dr = (ky - 1) * dil; r0 = Math.max(0, -dr); r1 = Math.min(H, H - dr);
          for (kx = 0; kx < 3; kx++) {
            w = P.w[wo + ky * 3 + kx];
            if (w === 0) continue;
            dc = (kx - 1) * dil; c0 = Math.max(0, -dc); c1 = Math.min(W, W - dc);
            for (r = r0; r < r1; r++) {
              var yr = yo + r * W, xr = xo + (r + dr) * W + dc;
              for (c = c0; c < c1; c++) y[yr + c] += w * x[xr + c];
            }
          }
        }
      }
    }
    return y;
  }
  function convBack(P, B, x, cin, H, W, cout, dil, dy, needDx) {
    var HW = H * W, dx = needDx ? new Float32Array(cin * HW) : null, co, ci, ky, kx, r, c, w, dr, dc, r0, r1, c0, c1, yo, xo, wo, s;
    for (co = 0; co < cout; co++) {
      yo = co * HW; s = 0;
      for (r = 0; r < HW; r++) s += dy[yo + r];
      B.g[co] += s;
      for (ci = 0; ci < cin; ci++) {
        xo = ci * HW; wo = (co * cin + ci) * 9;
        for (ky = 0; ky < 3; ky++) {
          dr = (ky - 1) * dil; r0 = Math.max(0, -dr); r1 = Math.min(H, H - dr);
          for (kx = 0; kx < 3; kx++) {
            dc = (kx - 1) * dil; c0 = Math.max(0, -dc); c1 = Math.min(W, W - dc);
            w = P.w[wo + ky * 3 + kx]; s = 0;
            for (r = r0; r < r1; r++) {
              var yr = yo + r * W, xr = xo + (r + dr) * W + dc;
              if (dx) for (c = c0; c < c1; c++) { s += dy[yr + c] * x[xr + c]; dx[xr + c] += w * dy[yr + c]; }
              else for (c = c0; c < c1; c++) s += dy[yr + c] * x[xr + c];
            }
            P.g[wo + ky * 3 + kx] += s;
          }
        }
      }
    }
    return dx;
  }
  function dense(P, B, x, nin, nout) {
    var y = new Float32Array(nout), o, i, s, wo;
    for (o = 0; o < nout; o++) {
      s = B.w[o]; wo = o * nin;
      for (i = 0; i < nin; i++) s += P.w[wo + i] * x[i];
      y[o] = s;
    }
    return y;
  }
  function denseBack(P, B, x, nin, nout, dy, needDx) {
    var dx = needDx ? new Float32Array(nin) : null, o, i, d, wo;
    for (o = 0; o < nout; o++) {
      d = dy[o]; if (d === 0) continue;
      B.g[o] += d; wo = o * nin;
      for (i = 0; i < nin; i++) { P.g[wo + i] += d * x[i]; if (dx) dx[i] += d * P.w[wo + i]; }
    }
    return dx;
  }
  function relu(y) { for (var i = 0; i < y.length; i++) if (y[i] < 0) y[i] = 0; return y; }
  function reluBack(y, dy) { for (var i = 0; i < y.length; i++) if (y[i] <= 0) dy[i] = 0; return dy; }
  /* global mean and max per channel */
  function pool(x, C, HW) {
    var out = new Float32Array(2 * C), arg = new Int32Array(C), c, i, s, m, mi, o;
    for (c = 0; c < C; c++) {
      o = c * HW; s = 0; m = -Infinity; mi = 0;
      for (i = 0; i < HW; i++) { var v = x[o + i]; s += v; if (v > m) { m = v; mi = i; } }
      out[c] = s / HW; out[C + c] = m; arg[c] = mi;
    }
    return { y: out, arg: arg };
  }
  function poolBack(pc, C, HW, dy) {
    var dx = new Float32Array(C * HW), c, i, o, d;
    for (c = 0; c < C; c++) {
      o = c * HW; d = dy[c] / HW;
      if (d !== 0) for (i = 0; i < HW; i++) dx[o + i] = d;
      dx[o + pc.arg[c]] += dy[C + c];
    }
    return dx;
  }
  /* mean over the cells of a mask (per channel); empty mask -> zeros */
  function maskPool(x, C, HW, mask) {
    var out = new Float32Array(C), n = 0, c, i;
    for (i = 0; i < HW; i++) if (mask[i]) n++;
    if (!n) return { y: out, n: 0 };
    for (c = 0; c < C; c++) { var s = 0, o = c * HW; for (i = 0; i < HW; i++) if (mask[i]) s += x[o + i]; out[c] = s / n; }
    return { y: out, n: n };
  }
  function maskPoolBack(dx, C, HW, mask, n, dy) {
    if (!n) return;
    for (var c = 0; c < C; c++) { var d = dy[c] / n, o = c * HW; if (d === 0) continue; for (var i = 0; i < HW; i++) if (mask[i]) dx[o + i] += d; }
  }
  function softmax(z) {
    var m = -Infinity, i, s = 0, p = new Float32Array(z.length);
    for (i = 0; i < z.length; i++) if (z[i] > m) m = z[i];
    for (i = 0; i < z.length; i++) { p[i] = Math.exp(z[i] - m); s += p[i]; }
    for (i = 0; i < z.length; i++) p[i] /= s;
    return p;
  }
  function adam(params, lr, t, b1, b2, eps, wd) {
    b1 = b1 || 0.9; b2 = b2 || 0.999; eps = eps || 1e-8; wd = wd || 0;
    var c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
    params.forEach(function (P) {
      for (var i = 0; i < P.n; i++) {
        var g = P.g[i] + wd * P.w[i];
        P.m[i] = b1 * P.m[i] + (1 - b1) * g;
        P.v[i] = b2 * P.v[i] + (1 - b2) * g * g;
        P.w[i] -= lr * (P.m[i] / c1) / (Math.sqrt(P.v[i] / c2) + eps);
        P.g[i] = 0;
      }
    });
  }
  function setSeed(s) { seed = s >>> 0 || 1; }
  return { param: param, conv: conv, convBack: convBack, dense: dense, denseBack: denseBack, relu: relu, reluBack: reluBack,
           pool: pool, poolBack: poolBack, maskPool: maskPool, maskPoolBack: maskPoolBack, softmax: softmax, adam: adam, setSeed: setSeed };
})();
