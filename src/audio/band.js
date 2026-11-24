// ============================================================================
// band.js - the band. A chamber waltz: felt piano, bowed strings, pizzicato bass, nylon guitar, concertina, clarinet, horns,
// harp, celesta, music box, glockenspiel, frame drum, brush. Plain typed-array DSP, deterministic, no libraries, no samples.
//
//   BAND.jobs()      -> ids ('then.rhythm', ...): one instrument group in one section
//   BAND.render(id)  -> { id, lane:'band', sec, t0, L, R, send }      film seconds, SR 44100, send = reverb send (0..1) for MIX
//   BAND.loop()      -> { L, R, bars:16, bpm:112 }                    seamless free-ride waltz in D, room included
//
// Sounding model: sustained tones are banks of true harmonics (so nothing can alias) whose strengths move with effort, with their
// own slow shimmer and bow/breath noise; struck and plucked tones are decaying inharmonic partials; every instrument then
// speaks through its own stereo body (a synthesized modal impulse response, convolved).
// The one idea: the band keeps climbing to the call "so-mi" and stops one step short. THEN is cut there, NOW dies there,
// NIGHT whispers it, RIDE bar 19 finally plays it and bar 24 plays it with the chick.
// ============================================================================
const BAND = (() => {
'use strict';
const SC = typeof SCORE !== 'undefined' ? SCORE : require('../01_score.js');
const SR = 44100, TAU = Math.PI * 2, B = 64, BR = SR / B;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x), hz = m => 440 * Math.pow(2, (m - 69) / 12);
const lerp = (a, b, u) => a + (b - a) * u;
const tab = (t, x) => { if (x <= t[0][0]) return t[0][1]; for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return lerp(t[i - 1][1], t[i][1], (x - t[i - 1][0]) / (t[i][0] - t[i - 1][0])); return t[t.length - 1][1]; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
function Rng(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed | 0;
  const u = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const g = () => clamp(Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(TAU * u()), -2.4, 2.4);
  return { u, g, r: (x, y) => x + (y - x) * u(), i: () => u() * 4294967296 | 0 };
}
// ---------------------------------------------------------------- FFT: radix-4 DIF forward (bit-reversed out), DIT inverse. Convolution never needs the order.
const PLANS = {};
function plan(n) { let p = PLANS[n]; if (p) return p; const m = (n * 3 / 4 | 0) + 1, c = new Float64Array(m), s = new Float64Array(m); for (let k = 0; k < m; k++) { c[k] = Math.cos(TAU * k / n); s[k] = Math.sin(TAU * k / n); } return PLANS[n] = { c, s }; }
function fwd(x, y, n) {
  const { c, s } = plan(n); let len = n;
  for (; len > 4; len >>= 2) {
    const q = len >> 2, st = n / len;
    for (let o = 0; o < n; o += len) for (let j = 0, k = 0; j < q; j++, k += st) {
      const c1 = c[k], s1 = s[k], c2 = c[2 * k], s2 = s[2 * k], c3 = c[3 * k], s3 = s[3 * k], a = o + j, b = a + q, d = b + q, e = d + q;
      const ar = x[a], ai = y[a], br = x[b], bi = y[b], dr = x[d], di = y[d], er = x[e], ei = y[e];
      const t0r = ar + dr, t0i = ai + di, t2r = ar - dr, t2i = ai - di, t1r = br + er, t1i = bi + ei, t3r = br - er, t3i = bi - ei;
      x[a] = t0r + t1r; y[a] = t0i + t1i;
      let r = t0r - t1r, i = t0i - t1i; x[b] = r * c2 + i * s2; y[b] = i * c2 - r * s2;
      r = t2r + t3i; i = t2i - t3r; x[d] = r * c1 + i * s1; y[d] = i * c1 - r * s1;
      r = t2r - t3i; i = t2i + t3r; x[e] = r * c3 + i * s3; y[e] = i * c3 - r * s3;
    }
  }
  if (len === 4) for (let a = 0; a < n; a += 4) {
    const ar = x[a], ai = y[a], br = x[a + 1], bi = y[a + 1], dr = x[a + 2], di = y[a + 2], er = x[a + 3], ei = y[a + 3];
    const t0r = ar + dr, t0i = ai + di, t2r = ar - dr, t2i = ai - di, t1r = br + er, t1i = bi + ei, t3r = br - er, t3i = bi - ei;
    x[a] = t0r + t1r; y[a] = t0i + t1i; x[a + 1] = t0r - t1r; y[a + 1] = t0i - t1i; x[a + 2] = t2r + t3i; y[a + 2] = t2i - t3r; x[a + 3] = t2r - t3i; y[a + 3] = t2i + t3r;
  }
  if (len === 2) for (let a = 0; a < n; a += 2) { const r = x[a + 1], i = y[a + 1]; x[a + 1] = x[a] - r; y[a + 1] = y[a] - i; x[a] += r; y[a] += i; }
}
function inv(x, y, n) {
  const { c, s } = plan(n); let len = 4;
  if (Math.round(Math.log2(n)) & 1) { for (let a = 0; a < n; a += 2) { const r = x[a + 1], i = y[a + 1]; x[a + 1] = x[a] - r; y[a + 1] = y[a] - i; x[a] += r; y[a] += i; } len = 8; }
  for (; len <= n; len <<= 2) {
    const q = len >> 2, st = n / len;
    for (let o = 0; o < n; o += len) for (let j = 0, k = 0; j < q; j++, k += st) {
      const c1 = c[k], s1 = s[k], c2 = c[2 * k], s2 = s[2 * k], c3 = c[3 * k], s3 = s[3 * k], a = o + j, b = a + q, d = b + q, e = d + q;
      const br = x[b], bi = y[b], dr0 = x[d], di0 = y[d], er = x[e], ei = y[e];
      const z1r = br * c2 - bi * s2, z1i = bi * c2 + br * s2, z2r = dr0 * c1 - di0 * s1, z2i = di0 * c1 + dr0 * s1, z3r = er * c3 - ei * s3, z3i = ei * c3 + er * s3;
      const t0r = x[a] + z1r, t0i = y[a] + z1i, t1r = x[a] - z1r, t1i = y[a] - z1i, t2r = z2r + z3r, t2i = z2i + z3i, dr = z3r - z2r, di = z3i - z2i;
      x[a] = t0r + t2r; y[a] = t0i + t2i; x[d] = t0r - t2r; y[d] = t0i - t2i; x[b] = t1r + di; y[b] = t1i - dr; x[e] = t1r - di; y[e] = t1i + dr;
    }
  }
}
// two mono inputs through two stereo responses, added into L,R. 1 forward + 1 inverse FFT per block.
function conv2(x1, x2, h1, h2, L, R, gain = 1, off = 0) {
  const nx = x1.length, m = Math.max(h1[0].length, h2 ? h2[0].length : 0); let N = 1 << 14; while (N < m * 3.2) N <<= 1;
  const hop = N - m, re = new Float64Array(N), im = new Float64Array(N), ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N), k = gain / N;
  for (let i = 0; i < h1[0].length; i++) { ar[i] = h1[0][i] * k; ai[i] = h1[1][i] * k; } fwd(ar, ai, N);
  if (h2) { for (let i = 0; i < h2[0].length; i++) { br[i] = h2[0][i] * k; bi[i] = h2[1][i] * k; } fwd(br, bi, N); }
  for (let p = 0; p < nx; p += hop) {
    const e = Math.min(hop, nx - p); let any = 0;
    for (let i = 0; i < e; i++) { const v = x1[p + i]; re[i] = v; any += v < 0 ? -v : v; } for (let i = e; i < N; i++) re[i] = 0;
    if (x2) { for (let i = 0; i < e; i++) { const v = x2[p + i]; im[i] = v; any += v < 0 ? -v : v; } for (let i = e; i < N; i++) im[i] = 0; } else im.fill(0);
    if (any === 0) continue;
    fwd(re, im, N);
    if (x2) {
      const one = (P, Q) => {
        const zr = re[P], zi = im[P], wr = re[Q], wi = -im[Q], xr = (zr + wr) * .5, xi = (zi + wi) * .5, ur = (zi - wi) * .5, ui = (wr - zr) * .5;
        const yr = (wr + zr) * .5, yi = -xi, vr = ur, vi = -ui, g1r = ar[P], g1i = ai[P], g2r = br[P], g2i = bi[P], f1r = ar[Q], f1i = ai[Q], f2r = br[Q], f2i = bi[Q];
        re[P] = xr * g1r - xi * g1i + ur * g2r - ui * g2i; im[P] = xr * g1i + xi * g1r + ur * g2i + ui * g2r;
        if (Q !== P) { re[Q] = yr * f1r - yi * f1i + vr * f2r - vi * f2i; im[Q] = yr * f1i + yi * f1r + vr * f2i + vi * f2r; }
      };
      one(0, 0); for (let w = 1; w < N; w <<= 1) { const s = 3 * w - 1; for (let P = w; P <= s - P; P++) one(P, s - P); }
    } else for (let i = 0; i < N; i++) { const a = re[i], b = im[i]; re[i] = a * ar[i] - b * ai[i]; im[i] = a * ai[i] + b * ar[i]; }
    inv(re, im, N);
    const o = p + off, lim = Math.min(N, L.length - o); for (let i = 0; i < lim; i++) { L[o + i] += re[i]; R[o + i] += im[i]; }
  }
}
// ---------------------------------------------------------------- bodies: modal impulse responses, stereo, one per instrument
// sig: [f, Q, gain]; then a dense random field from lo..hi with spacing sp0..sp1 and gain curve env; dir = direct sound [gain, hp, lp]
const KIND = {
  violin: { sig: [[278, 14, .9], [408, 17, .8], [462, 19, 1.2], [548, 19, 1.2], [690, 18, .7]], lo: 760, hi: 6800, sp: [58, 165], env: [[560, .95], [900, .72], [1300, .62], [1900, .66], [2600, .72], [3400, .58], [4300, .38], [5400, .24], [6800, .12]], dir: [.17, 420, 5600], hp: 170, n: 9000, sym: [[55, 62, 69, 76], 1.0, 5.0e-5], ref: [300, 2400] },
  viola: { sig: [[222, 13, 1], [274, 16, .8], [338, 17, 1.2], [402, 18, 1.25], [456, 18, 1.1]], lo: 505, hi: 5000, sp: [48, 150], env: [[400, 1.1], [560, .98], [750, .86], [1050, .76], [1500, .70], [2000, .64], [2600, .54], [3300, .42], [4200, .28], [5200, .16]], dir: [.16, 320, 4800], hp: 115, n: 10000, sym: [[48, 55, 62, 69], 1.2, 5.0e-5], ref: [220, 2000] },
  cello: { sig: [[97, 12, .8], [148, 15, 1], [176, 17, 1.3], [203, 18, 1.25], [234, 18, 1.1]], lo: 262, hi: 4400, sp: [37, 120], env: [[200, 1.3], [330, 1.15], [480, .98], [700, .80], [950, .70], [1300, .66], [1800, .58], [2300, .50], [3000, .38], [3800, .25], [4600, .14]], dir: [.16, 220, 4000], hp: 55, n: 12000, sym: [[36, 43, 50, 57], 1.5, 5.0e-5], ref: [100, 1200] },
  bass: { sig: [[60, 9, .9], [98, 11, 1.1], [124, 13, 1.1], [170, 14, 1]], lo: 205, hi: 2600, sp: [30, 100], env: [[100, 1.2], [250, 1], [420, .7], [700, .46], [1100, .34], [1700, .22], [2600, .08]], dir: [.16, 130, 1900], hp: 32, n: 12000, ref: [60, 700] },
  guitar: { sig: [[102, 11, 1.1], [196, 15, 1.25], [236, 18, .8], [318, 18, .7], [392, 20, .8]], lo: 430, hi: 4800, sp: [42, 140], env: [[400, .9], [700, .75], [1100, .62], [1700, .60], [2500, .52], [3400, .38], [4800, .20]], dir: [.26, 160, 5600], hp: 62, n: 10000, ref: [140, 1600] },
  harp: { sig: [[112, 8, .5], [152, 11, .9], [193, 12, 1], [228, 13, .9]], lo: 250, hi: 6000, sp: [33, 125], env: [[250, 1], [500, 1], [900, .9], [1400, .78], [2100, .62], [3000, .42], [4200, .24], [6000, .10]], dir: [.2, 125, 5000], hp: 70, n: 11000, sym: [[38, 40, 42, 43, 45, 47, 49, 50, 52, 54, 55, 57, 59, 61, 62, 64, 66, 67, 69, 71, 73, 74], 1.7, 1.6e-5], ref: [150, 1800] },
  piano: { sig: [[62, 8, .8], [93, 9, 1], [131, 10, 1.1], [178, 11, 1], [223, 12, .9]], lo: 262, hi: 4600, sp: [34, 130], env: [[260, 1], [500, .92], [900, .8], [1500, .6], [2300, .42], [3200, .25], [4600, .1]], dir: [.34, 60, 3800], hp: 38, n: 12000, ref: [100, 1600] },
  box: { sig: [[430, 5, .5], [760, 5, .6], [1180, 5, .45], [1900, 5, .3], [2700, 5, .18]], lo: 3000, hi: 5600, sp: [260, 420], env: [[3000, .18], [5600, .06]], dir: [.75, 160, 5600], hp: 110, n: 3200, ref: [250, 2000] },
  pipe: { sig: [[310, 3, .3], [1150, 4, .25], [1700, 4, .18]], lo: 3000, hi: 3600, sp: [400, 500], env: [[3000, .05], [3600, .03]], dir: [.9, 90, 4200], hp: 80, n: 2200, ref: [200, 1600] },
  horn: { sig: [[210, 3, .35], [520, 3, .5], [840, 4, .35], [1300, 4, .2]], lo: 2000, hi: 2600, sp: [260, 400], env: [[2000, .06], [2600, .03]], dir: [.7, 50, 2600], hp: 42, n: 4200, ref: [90, 1000] },
  metal: { sig: [], lo: 900, hi: 5200, sp: [300, 520], env: [[900, .22], [2400, .2], [5200, .12]], dir: [1, 160, 9000], hp: 180, n: 3600, ref: [600, 4000] },
  skin: { sig: [[84, 5, .6], [140, 6, .5], [260, 6, .3]], lo: 400, hi: 2400, sp: [160, 300], env: [[400, .2], [2400, .06]], dir: [.8, 30, 3200], hp: 30, n: 5000, ref: [60, 800] },
};
const BODY = {};
function body(kind, v = 0) {
  const key = kind + v; if (BODY[key]) return BODY[key];
  const K = KIND[kind], rg = Rng('body' + key), nb = K.n, n = K.sym ? Math.round(K.sym[1] * 1.15 * SR) : nb, L = new Float64Array(n), R = new Float64Array(n), modes = [];
  for (const [f, q, g] of K.sig) { const s = rg.u() < .5 ? 1 : -1; modes.push([f * rg.r(.97, 1.03), q * rg.r(.85, 1.2), s * g * rg.r(.8, 1.2), .22]); }
  for (let f = K.lo; f < K.hi;) { const sp = lerp(K.sp[0], K.sp[1], clamp((f - K.lo) / 2600, 0, 1)); modes.push([f, f / (22 + f * .022) * rg.r(.8, 1.25), tab(K.env, f) * Math.pow(10, rg.g() * 2.6 / 20) * (rg.u() < .5 ? -1 : 1), .55]); f += sp * rg.r(.6, 1.4); }
  for (const [f, q, g, sd] of modes) {
    const bw = f / q, a = g * TAU * bw / SR, r = Math.exp(-Math.PI * bw / SR), w = TAU * f / SR, k1 = 2 * r * Math.cos(w), k2 = r * r, gl = a * (1 + sd * rg.g() * .8), gr = a * (1 + sd * rg.g() * .8), pl = rg.r(-.6, .6), pr = pl + sd * rg.g() * .9;
    let y1 = Math.sin(pl - w) / r, y2 = Math.sin(pl - 2 * w) / k2, z1 = Math.sin(pr - w) / r, z2 = Math.sin(pr - 2 * w) / k2; const e = Math.min(n, Math.ceil(9.2 / (Math.PI * bw) * SR));
    for (let i = 0; i < e; i++) { const y = k1 * y1 - k2 * y2, z = k1 * z1 - k2 * z2; y2 = y1; y1 = y; z2 = z1; z1 = z; L[i] += gl * y; R[i] += gr * z; }
  }
  const [dg, dh, dl] = K.dir, al = 1 - Math.exp(-TAU * dl / SR), ah = 1 - Math.exp(-TAU * dh / SR); let p = 0, q = 0, h = 0;
  for (let i = 0; i < 900; i++) { p += al * ((i === 1 ? 1 : 0) - p); q += al * (p - q); h += ah * (q - h); const d = dg * (q - h); L[i] += d; R[i] += d; }
  { const a = 1 - Math.exp(-TAU * K.hp / SR); for (const X of [L, R]) for (let pass = 0; pass < 2; pass++) { let s = 0; for (let i = 0; i < n; i++) { s += a * (X[i] - s); X[i] -= s; } } }      // what a body this size cannot move
  for (const X of [L, R]) { for (let i = nb - 1500; i < nb; i++) { const u = (nb - i) / 1500; X[i] *= u * u * (3 - 2 * u); } for (let i = nb; i < n; i++) X[i] = 0; }
  // unit rms response over the instrument's own range
  const re = new Float64Array(nb); for (let i = 0; i < nb; i++) re[i] = (L[i] + R[i]) * .5;
  let s = 0, c = 0; for (let f = K.ref[0]; f < K.ref[1]; f *= 1.03) { const w = TAU * f / SR; let a = 0, b = 0, cr = 1, ci = 0; const cw = Math.cos(w), sw = Math.sin(w); for (let i = 0; i < nb; i += 1) { a += re[i] * cr; b += re[i] * ci; const t = cr * cw - ci * sw; ci = cr * sw + ci * cw; cr = t; } s += a * a + b * b; c++; }
  const g = 1 / Math.sqrt(s / c), out = [new Float32Array(n), new Float32Array(n)]; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  if (K.sym) { const [ms, t60, a0] = K.sym; for (const m of ms) for (let k = 1; k <= 7; k++) { const f = hz(m) * k * (1 + rg.g() * .0006); if (f > 2600) break; const d = t60 * Math.pow(k, -.35), w = TAU * f / SR, r = Math.exp(-6.9078 / (d * SR)), k1 = 2 * r * Math.cos(w), k2 = r * r, gl = a0 * Math.pow(k, -.5) * rg.r(.6, 1.4), gr = a0 * Math.pow(k, -.5) * rg.r(.6, 1.4), pl = rg.r(-3, 3), pr = pl + rg.g() * .8; let y1 = Math.sin(pl - w) / r, y2 = Math.sin(pl - 2 * w) / k2, z1 = Math.sin(pr - w) / r, z2 = Math.sin(pr - 2 * w) / k2; for (let i = 0; i < n; i++) { const y = k1 * y1 - k2 * y2, z = k1 * z1 - k2 * z2; y2 = y1; y1 = y; z2 = z1; z1 = z; const u = i < 600 ? i / 600 : n - i < 4000 ? (n - i) / 4000 : 1; L[i] += gl * y * u; R[i] += gr * z * u; } } }
  for (let i = 0; i < n; i++) { out[0][i] = L[i]; out[1][i] = R[i]; }
  return BODY[key] = out;
}
// a player evens out the instrument: how loudly this body answers this note, and the correction a good hand makes (about 70 % of it)
const EVEN = {};
function even(kind, v, m, slope = 1, fc = 2200) {
  const key = kind + v + '|' + m + '|' + slope; if (EVEN[key] !== undefined) return EVEN[key];
  const [l, r] = body(kind, v), f0 = hz(m), n = KIND[kind].n; let s = 0, c = 0;
  for (let h = 1; h <= 14 && h * f0 < 5000; h++) { const w = TAU * h * f0 / SR, cw = Math.cos(w), sw = Math.sin(w), q = h * f0 / fc, a = Math.pow(h, -slope) / (1 + q * q); let cr = 1, ci = 0, x = 0, y = 0, z = 0, u = 0; for (let i = 0; i < n; i++) { x += l[i] * cr; y += l[i] * ci; z += r[i] * cr; u += r[i] * ci; const t = cr * cw - ci * sw; ci = cr * sw + ci * cw; cr = t; } s += a * a * (x * x + y * y + z * z + u * u) * .5; c += a * a; }
  return EVEN[key] = clamp(Math.pow(c / (s + 1e-9), .36), .42, 2.4);
}
// ---------------------------------------------------------------- a stem: mono streams -> bodies -> stereo
function Stem(id, sec, t0, t1, send) {
  const n = Math.ceil((t1 - t0) * SR / B) * B, st = {};
  const S = { id, sec, t0, n, send, L: new Float32Array(n), R: new Float32Array(n), nb: n / B,
    // stream by (kind, body variant, pan): instruments that share a chair share a buffer
    x(kind, v = 0, pan = 0, g = 1) { const k = kind + '|' + v + '|' + pan + '|' + g; return (st[k] = st[k] || { kind, v, pan, g, x: new Float32Array(n) }).x; },
    done(o = {}) {
      const list = Object.values(st), ir = s => { const [l, r] = body(s.kind, s.v), a = (s.pan + 1) * Math.PI / 4, gl = Math.cos(a) * Math.SQRT2 * s.g, gr = Math.sin(a) * Math.SQRT2 * s.g, d = Math.round(Math.abs(s.pan) * 14), L = new Float32Array(l.length + 16), R = new Float32Array(l.length + 16);
        for (let i = 0; i < l.length; i++) { L[i + (s.pan > 0 ? d : 0)] = l[i] * gl; R[i + (s.pan < 0 ? d : 0)] = r[i] * gr; } return [L, R]; };
      for (let i = 0; i < list.length; i += 2) { const a = list[i], b = list[i + 1]; conv2(a.x, b ? b.x : null, ir(a), b ? ir(b) : null, S.L, S.R); }
      if (o.hush) for (const X of [S.L, S.R]) { const a = Math.round((o.hush[0] - t0) * SR), b = Math.round((o.hush[1] - t0) * SR), k = SR * .4 | 0; for (let i = Math.max(0, a - k); i < b && i < n; i++) X[i] *= i < a ? smooth((a - i) / k) : 0; }
      const cut = o.cut !== undefined ? Math.min(n, Math.round((o.cut - t0) * SR)) : n, fo = o.fade !== undefined ? Math.round(o.fade * SR) : 900, g = (o.gain === undefined ? 1 : o.gain) * .60;
      for (const X of [S.L, S.R]) {
        let dc = 0; const a = 1 - Math.exp(-TAU * 16 / SR);
        for (let i = 0; i < cut; i++) { dc += a * (X[i] - dc); X[i] = (X[i] - dc) * g; }
        for (let i = Math.max(0, cut - fo); i < cut; i++) X[i] *= smooth((cut - i) / fo);
        for (let i = 0; i < 300 && i < n; i++) X[i] *= i / 300; for (let i = cut; i < n; i++) X[i] = 0;
      }
      const e = Math.min(n, cut + 64); return { id, lane: 'band', sec, t0, L: S.L.slice(0, e), R: S.R.slice(0, e), send };
    } };
  return S;
}
// ---------------------------------------------------------------- written parts
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); if (!m) throw new Error('note ' + s); return 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * +m[3]; };
// text: 'A4:2 ~B4:1 | r:1 F#4+A4:2' ; note(+note):beats, ~ slurred, / slurred with a slide, > accent, r rest; | must fall on a bar line
let LOG = null;                                      // tests switch this on to read what was played
const note = (S, k, t, d, m) => { if (LOG) LOG.push([S.id, k, t, d, m]); };
let CLOCK = null;                                    // the loop replaces SCORE.T with its own even clock
const T = (sec, x) => CLOCK ? CLOCK(x) : SC.T(sec, 0, x);
function seq(sec, bar, text, tr = 0) {
  let x = bar * 3; const out = [];
  for (const tok of text.trim().split(/\s+/)) {
    if (tok === '|') { if (Math.abs(x / 3 - Math.round(x / 3)) > 1e-6) throw new Error(sec + ' bar line off at ' + x + ' in ' + text); continue; }
    const m = /^([~\/>'^]*)([A-Gr][#b+A-G\d]*)(?::([\d.]+))?$/.exec(tok); if (!m) throw new Error('token ' + tok);
    const d = m[3] ? +m[3] : 1;
    if (m[2] !== 'r') out.push({ x, d, ms: m[2].split('+').map(midi).map(v => v + tr), t0: T(sec, x), t1: T(sec, x + d), slur: /[~\/]/.test(m[1]), port: /\//.test(m[1]) ? .13 : 0, acc: />/.test(m[1]), gr: /\^/.test(m[1]) ? 1 : 0 });
    x += d;
  }
  return out;
}
// dynamics over a section: [[bar, level], ...]
const curve = pts => x => tab(pts, x / 3);
// one voice out of chords
const voice = (notes, k) => notes.filter(e => e.ms.length > k).map(e => Object.assign({}, e, { m: e.ms[k] }));
// ---------------------------------------------------------------- sustained engine
// c = { nb, f, a, b, z } at block rate: pitch, loudness, effort 0..1, noise. P.spec fills harmonic strengths.
const tmp = new Float64Array(B);
function sustain(out, c, P, seed) {
  const nb = c.nb, HM = P.H, X = new Float64Array(HM + 2), Y = new Float64Array(HM + 2), Ap = new Float64Array(HM + 2), An = new Float64Array(HM + 2), sh = new Float64Array(HM + 2), E = new Float64Array(HM + 2), rg = Rng(seed);
  for (let h = 0; h <= HM; h++) { const p = rg.g() * (P.disp || .22) * Math.sqrt(h) + (P.rand ? rg.u() * TAU : 0); X[h] = Math.cos(p); Y[h] = Math.sin(p); E[h] = Math.pow(10, rg.g() * (P.vary === undefined ? 1.4 : P.vary) / 20); sh[h] = 0; }
  let ns = rg.i(), Hp = 0, n1 = 0, n2 = 0, n3 = 0, jit = 0, jit2 = 0, zp = 0, live = false; const shim = P.shim === undefined ? .07 : P.shim, jd = P.jit === undefined ? 2.2 : P.jit, la = 1 - Math.exp(-TAU * (P.nhi || 2800) / SR), lb = 1 - Math.exp(-TAU * (P.nlo || 420) / SR), fmax = P.fmax || 7600;
  for (let k = 0; k < nb; k++) {
    const a1 = c.a[k + 1], z1 = c.z[k + 1];
    if (a1 < 1e-6 && z1 < 1e-7 && !live) continue;
    ns = Math.imul(ns, 1664525) + 1013904223 | 0; jit += .16 * (ns * 4.6566e-10 - jit); ns = Math.imul(ns, 1664525) + 1013904223 | 0; jit2 += .012 * (ns * 4.6566e-10 - jit2);
    const f = .5 * (c.f[k] + c.f[k + 1]) * Math.pow(2, (jit * jd * 2.6 + jit2 * jd * 7) / 1200), H = Math.min(HM, Math.floor(fmax / f));
    P.spec(An, H, f, c.b[k + 1]); let e = 0;
    for (let h = 1; h <= H; h++) {
      ns = Math.imul(ns, 1664525) + 1013904223 | 0; sh[h] += .035 * (ns * 4.6566e-10 - sh[h]);
      const top = (fmax - h * f) / (.18 * fmax); An[h] *= a1 * E[h] * (1 + shim * 9 * sh[h]) * (top < 1 ? smooth(top) : 1); e += An[h];
    }
    const HH = Math.max(H, Hp); for (let h = H + 1; h <= HH; h++) An[h] = 0;
    tmp.fill(0); const w = TAU * f / SR, c1 = Math.cos(w), s1 = Math.sin(w); let cc = 1, ss = 0;
    for (let h = 1; h <= HH; h++) {
      const t = cc * c1 - ss * s1; ss = cc * s1 + ss * c1; cc = t;
      let a = Ap[h]; const an = An[h]; if (a < 1e-7 && an < 1e-7) { Ap[h] = an; continue; }
      const da = (an - a) / B; let x = X[h], y = Y[h]; const C = cc, S = ss;
      for (let i = 0; i < B; i++) { tmp[i] += a * y; a += da; const q = x * C - y * S; y = x * S + y * C; x = q; }
      X[h] = x; Y[h] = y; Ap[h] = an;
    }
    Hp = H; const o = k * B;
    if (z1 > 1e-7 || zp > 1e-7) { const dz = (z1 - zp) / B; let z = zp; const pm = P.psync || 0; for (let i = 0; i < B; i++) { ns = Math.imul(ns, 1664525) + 1013904223 | 0; n1 += la * (ns * 4.6566e-10 - n1); n2 += lb * (n1 - n2); const q = n1 - n2; n3 += lb * (q - n3); z += dz; out[o + i] += tmp[i] + (q - n3) * z * (1 + pm * tmp[i] / (a1 + .02)); } }
    else for (let i = 0; i < B; i++) out[o + i] += tmp[i];
    zp = z1; live = e > 1e-7 || z1 > 1e-7;
  }
}
// ---- how each thing puts its strength into its harmonics
const SPEC = {
  bow: (lo, hi) => (A, H, f, b) => { const fc = lo * Math.pow(hi / lo, b), q = f / fc; for (let h = 1; h <= H; h++) { const r = h * q; A[h] = 1 / (h * (1 + r * r)); } },
  harm: (A, H) => { for (let h = 1; h <= H; h++) A[h] = h === 1 ? 1 : h === 2 ? .10 : h === 3 ? .035 : .010 / h; },
  reed: (A, H, f, b) => { const fc = 2200 + 2500 * b; for (let h = 1; h <= H; h++) { const r = h * f / fc; A[h] = Math.pow(h, -.60) / (1 + r * r * r) * .50; } },
  clar: (A, H, f, b) => { const fc = 1150 + 1500 * b + f; for (let h = 1; h <= H; h++) { const r = h * f / fc, ev = h & 1 ? 1 : h === 2 ? .035 : h === 4 ? .10 : h === 6 ? .25 : .45; A[h] = ev * Math.pow(h, -(1.25 - .45 * b)) / (1 + r * r * r * r); } },
  horn: (A, H, f, b) => { const fc = 190 + 1250 * Math.pow(b, 1.5) + .55 * f; for (let h = 1; h <= H; h++) { const r = h * f / fc; A[h] = .55 * Math.pow(h, -.25) / Math.sqrt(1 + r * r * r * r * r); } },
};
// ---------------------------------------------------------------- players: from notes to controls
// bowed. K: att, rel, vib (cents), vr, det, lag, tj, z (noise)
function bowCtl(S, notes, dyn, rg, K) {
  const nb = S.nb, f = new Float64Array(nb + 1), a = new Float64Array(nb + 1), b = new Float64Array(nb + 1), z = new Float64Array(nb + 1);
  const det = clamp(rg.g() * K.det, -2.4, 2.4), lag = rg.g() * K.lag, vr0 = K.vr + rg.g() * .22;
  const ns = notes.map(e => { const tt = e.t0 + lag + rg.g() * K.tj - (e.slur ? .022 : Math.min(K.att, e.spic ? .02 : .2) * .38); const mm = e.m === undefined ? e.ms[0] : e.m; return { m: mm, ev: even(K.bodyKind, K.bodyV, Math.round(mm), 1), t: tt, e: e.t1 + lag + rg.g() * K.tj, slur: e.slur, port: e.port || 0, spic: e.spic || 0, trem: e.trem || 0, acc: e.acc ? 1.25 : 1, vib: e.vib === undefined ? K.vib : e.vib, att: e.att || K.att, rel: e.rel || K.rel,
    d0: dyn(e.x), d1: dyn(e.x + e.d * .5), d2: dyn(e.x + e.d), c: clamp(det + rg.g() * .8, -2.6, 2.6), vd: rg.r(.16, .40), vx: rg.r(.8, 1.2), vr: vr0 * rg.r(.96, 1.04), sw: e.sw === undefined ? .10 : e.sw }; });
  for (let i = 1; i < ns.length; i++) if (ns[i].slur || ns[i].t < ns[i - 1].e || ns[i].t - ns[i - 1].e < .05) ns[i - 1].e = ns[i].t;
  let k = 0, ph = rg.u() * TAU, pw = 0, wob = 0, tp = rg.u(), tw = 0;
  for (let i = 0; i <= nb; i++) {
    const t = S.t0 + i * B / SR; while (k + 1 < ns.length && t >= ns[k + 1].t) k++;
    const e = ns[k], p = k ? ns[k - 1] : null, n = k + 1 < ns.length ? ns[k + 1] : null, x = t - e.t, d = Math.max(.02, e.e - e.t);
    pw += .02 * (rg.g() - pw); ph += TAU * e.vr * (1 + .25 * pw) / BR;
    if (x < -.02 || x > d + .4) { f[i] = hz((x < 0 ? e : n && t > n.t - .1 ? n : e).m); continue; }
    const joinP = p && e.t - p.e < .05, joinN = n && n.t - e.e < .05;
    let m = e.m; if (joinP && e.slur && p.m !== m) { const w = e.port || .045; m = p.m + (m - p.m) * smooth((x + w * .5) / w); }
    if (joinN && n.slur && n.m !== e.m) { const w = n.port || .045, y = (t - n.t + w * .5) / w; if (y > 0) m = e.m + (n.m - e.m) * smooth(y); }
    const va = e.vib * e.vx * smooth((x - e.vd) / .45) * (1 - .55 * smooth((x - d + .28) / .28)), u = clamp(x / d, 0, 1);
    let dy = (u < .5 ? lerp(e.d0, e.d1, u * 2) : lerp(e.d1, e.d2, u * 2 - 1)) * (1 - e.sw + 2 * e.sw * Math.sin(Math.PI * u)) * e.acc;
    wob += .018 * (rg.g() - wob); dy = Math.max(0, dy * (1 + .55 * wob));
    f[i] = hz(m) * Math.pow(2, (e.c + va * (.55 + .7 * Math.min(1, dy)) * Math.sin(ph) + 3 * pw) / 1200);
    let env = 1, bite = 0;
    if (e.spic) { env = smooth(x / .014) * Math.exp(-Math.max(0, x - .03) / e.spic); bite = Math.exp(-Math.max(0, x) / .022); }
    else {
      if (!joinP) { env *= smooth(x / e.att); bite = .55 * Math.exp(-Math.max(0, x) / .05); } else if (!e.slur) { env *= 1 - .66 * Math.exp(-x * x / .0011); bite = .40 * Math.exp(-Math.max(0, x) / .04); }
      if (!joinN) env *= smooth((d - x) / Math.min(e.rel, d * .75)); else if (!n.slur) { const y = t - n.t; env *= 1 - .66 * Math.exp(-y * y / .0011); }
    }
    if (e.trem) { tw += .05 * (rg.g() - tw); tp += e.trem * (1 + .35 * tw) / BR; const s = tp - Math.floor(tp); env *= .34 + .66 * Math.pow(Math.sin(Math.PI * s), .75); bite = Math.max(bite, .22 * Math.exp(-s * 9)); }
    let ev = e.ev; if (joinP && x < .06) ev = lerp(p.ev, e.ev, smooth(x / .06 * .5 + .5)); else if (joinN && d - x < .06) ev = lerp(e.ev, n.ev, smooth((1 - (d - x) / .06) * .5));
    a[i] = Math.pow(dy, 1.35) * env * ev; b[i] = clamp(dy * (.55 + .45 * env), 0, 1.15); z[i] = (K.z * (.35 + .65 * dy) * env + K.z * 3.2 * bite * Math.min(env, 1) * dy);
  }
  return { nb, f, a, b, z };
}
const BOWS = {
  violin: { H: 40, spec: SPEC.bow(1300, 4300), att: .12, rel: .16, vib: 15, vr: 5.6, z: .040, nhi: 3600, nlo: 800, fmax: 9500 },
  viola: { H: 44, spec: SPEC.bow(1050, 3500), att: .14, rel: .18, vib: 15, vr: 5.3, z: .036, nhi: 3000, nlo: 700, fmax: 8200 },
  cello: { H: 60, spec: SPEC.bow(760, 2900), att: .15, rel: .22, vib: 15, vr: 5.1, z: .042, nhi: 2400, nlo: 480, fmax: 7000 },
  bass: { H: 60, spec: SPEC.bow(380, 1250), att: .17, rel: .24, vib: 8, vr: 4.8, z: .040, nhi: 1500, nlo: 260, fmax: 3600 },
};
// one part, several players; each player is a different hand on a different instrument
function bow(S, kind, notes, dyn, o = {}) {
  if (LOG) for (const e of notes) note(S, kind, e.t0, e.t1 - e.t0, e.m === undefined ? e.ms[0] : e.m);
  const K = Object.assign({ det: 2.0, lag: .010, tj: .009 }, BOWS[kind], o), N = o.players || 1, g = (o.gain || 1) * .30 / Math.pow(N, .62);
  for (let i = 0; i < N; i++) {
    const rg = Rng(S.id + kind + (o.seed || '') + i), x = new Float32Array(S.n), bk = o.body || kind, bv = (o.v || 0) + (i & 1), c = bowCtl(S, notes, dyn, rg, Object.assign({}, K, { bodyKind: bk, bodyV: bv }, N > 1 && o.tj === undefined ? { lag: .014, tj: .013 } : {})); if (o.mod) o.mod(c, S);
    sustain(x, c, { H: K.H, spec: o.spec || K.spec, fmax: K.fmax, nhi: K.nhi, nlo: K.nlo, psync: .5, rand: N > 1, shim: .06, jit: 2.2 }, rg.i());
    const y = S.x(bk, bv, clamp((o.pan || 0) + (N > 1 ? (i / (N - 1) - .5) * (o.spread || .24) : 0), -1, 1)); for (let j = 0; j < S.n; j++) y[j] += x[j] * g;
  }
}
// blown: concertina (bellows shared by all its reeds), clarinet, horns
function blow(S, kind, notes, dyn, o) {
  if (LOG) for (const e of notes) for (const m of e.ms) note(S, kind, e.t0, e.t1 - e.t0, m);
  const rg = Rng(S.id + kind + (o.seed || '')), nb = S.nb, N = Math.max(...notes.map(e => e.ms.length)), bel = new Float64Array(nb + 1);
  // bellows: one slow breath, a lift on every bar, a short turn where the direction changes
  if (o.bellows) { const turns = o.bellows; let w = 0; for (let i = 0; i <= nb; i++) { const t = S.t0 + i * B / SR; w += .01 * (rg.g() - w); let p = 1 + .35 * w; for (const q of turns) { const y = t - q; if (y > -.2 && y < .2) p *= 1 - .55 * Math.exp(-y * y / .0012); } bel[i] = p; } } else bel.fill(1);
  for (let v = 0; v < N; v++) {
    const ns0 = voice(notes, v), f = new Float64Array(nb + 1), a = new Float64Array(nb + 1), b = new Float64Array(nb + 1), z = new Float64Array(nb + 1), r = Rng(S.id + kind + v + (o.seed || '')), det = clamp(r.g() * (o.det === undefined ? 1.2 : o.det), -2, 2);
    const ns = ns0.map(e => ({ m: e.m, ev: even(o.body, o.v || 0, e.m, kind === 'conc' ? .7 : 1), t: e.t0 + r.g() * .008 - (e.slur ? .012 : o.att * .4), e: e.t1 + r.g() * .008 - (o.gap || 0), slur: e.slur, d0: dyn(e.x), d1: dyn(e.x + e.d * .5), d2: dyn(e.x + e.d), acc: e.acc ? 1.2 : 1, c: det + r.g() * .7, at: o.att * r.r(.85, 1.2) * (e.m < 58 ? 1.35 : 1), x: e.x, gr: e.gr && v === 0 ? ([2, 2, 1, 2, 2, 2, 1][[2, 4, 6, 7, 9, 11, 1].indexOf(e.m % 12)] || 2) : 0 }));
    for (let i = 1; i < ns.length; i++) if (ns[i].slur || ns[i].t < ns[i - 1].e) ns[i - 1].e = ns[i].t;
    let k = 0, w = 0, w2 = 0, vp = r.u() * TAU;
    for (let i = 0; i <= nb; i++) {
      const t = S.t0 + i * B / SR; while (k + 1 < ns.length && t >= ns[k + 1].t) k++;
      const e = ns[k]; if (!e) break; const n = ns[k + 1], p = ns[k - 1], x = t - e.t, d = Math.max(.03, e.e - e.t);
      w += .02 * (r.g() - w); w2 += .004 * (r.g() - w2); vp += TAU * 5.1 / BR;
      if (x < 0 || x > d + .02) { f[i] = hz(e.m); continue; }
      const u = clamp(x / d, 0, 1), sl = e.slur && p && e.t - p.e < .03, sn = n && n.slur && n.t - e.e < .03;
      let env = sl ? 1 - .22 * Math.exp(-x / .03) : smooth(x / e.at); if (!sn) env *= smooth((d - x) / o.rel); else env *= 1 - .22 * Math.exp(-(d - x) / .02);
      let dy = (u < .5 ? lerp(e.d0, e.d1, u * 2) : lerp(e.d1, e.d2, u * 2 - 1)) * e.acc * (1 + .3 * w) * bel[i]; if (o.swell) dy *= 1 - o.swell * .5 + o.swell * Math.sin(Math.PI * Math.min(1, u * 1.15));
      let m = e.m; if (sl) m = p.m + (m - p.m) * smooth((x + .004) / .028); if (e.gr && x < .085) { m += e.gr * (1 - smooth((x - .060) / .014)); env *= 1 - .25 * Math.exp(-Math.pow((x - .066) / .012, 2)); }
      const scoop = sl ? 0 : -(o.scoop || 6) * Math.exp(-x / .035), press = o.bellows ? -5 * (dy - .45) : 0, vb = (o.vib || 0) * smooth((x - .3) / .5) * Math.sin(vp);
      f[i] = hz(m) * Math.pow(2, (e.c + scoop + press + vb + 3.2 * w2) / 1200);
      a[i] = Math.pow(dy, o.pow || 1.25) * env * (sl && x < .03 ? lerp(p.ev, e.ev, smooth(x / .03)) : e.ev); b[i] = clamp(dy * (o.late ? smooth(x / (e.at * 2.4)) * .75 + .25 : 1), 0, 1.2); z[i] = (o.z || .02) * (.4 + .6 * dy) * env + (o.chiff || 0) * Math.exp(-x / .018) * (sl ? 0 : 1) * dy;
    }
    const X = new Float32Array(S.n); sustain(X, { nb, f, a, b, z }, { H: o.H, spec: o.spec, fmax: o.fmax, nhi: o.nhi || 2600, nlo: o.nlo || 500, shim: o.shim, jit: o.jit, vary: o.vary, disp: .5 }, r.i());
    if (o.click) for (const e of ns) { const j = Math.round((e.t - .012 - S.t0) * SR); puff(X, j, 620, o.click * (.7 + .6 * r.u()), 1700, 420, r, .25); }
    const pan = clamp((o.pan || 0) + (N > 1 ? (o.spread || 0) * (v / (N - 1) - .5) : 0), -1, 1), y = S.x(o.body, o.v || 0, pan), g = o.gain; for (let j = 0; j < S.n; j++) y[j] += X[j] * g;
  }
}
const concertina = (S, notes, dyn, o = {}) => blow(S, 'conc', notes, dyn, Object.assign({ H: 28, spec: SPEC.reed, fmax: 8000, att: .042, rel: .060, gap: .015, z: .010, nhi: 2000, shim: .035, jit: 1.1, vary: 1.8, body: 'box', click: .22, gain: .115, pan: -.18, spread: .50, swell: .16, bellows: [] }, o));
const clarinet = (S, notes, dyn, o = {}) => blow(S, 'clar', notes, dyn, Object.assign({ H: 24, spec: SPEC.clar, fmax: 6000, att: .050, rel: .070, gap: .02, z: .016, nhi: 2400, nlo: 700, shim: .03, jit: 1.0, vary: .8, body: 'pipe', gain: .17, pan: .30, swell: .2, scoop: 8, pow: 1.4, late: 1 }, o));
const horns = (S, notes, dyn, o = {}) => blow(S, 'horn', notes, dyn, Object.assign({ H: 34, spec: SPEC.horn, fmax: 4200, att: .11, rel: .16, gap: 0, z: .010, nhi: 1400, shim: .04, jit: 1.4, vary: .8, body: 'horn', gain: .16, pan: .18, spread: .4, swell: .10, scoop: 14, pow: 1.5, late: 1 }, o));
// ---------------------------------------------------------------- struck and plucked engine
const SCR = new Float64Array(SR * 16 | 0);
function ring(n, f, t60, a, ph) { // one decaying partial into the scratch
  if (f > 15000 || t60 <= 0) return 0; const e = Math.min(n, Math.ceil(t60 * SR * 1.35)), w = TAU * f / SR, r = Math.exp(-6.9078 / (t60 * SR)), k1 = 2 * r * Math.cos(w), k2 = r * r; let y1 = a * Math.sin(ph - w) / r, y2 = a * Math.sin(ph - 2 * w) / k2;
  for (let i = 0; i < e; i++) { const y = k1 * y1 - k2 * y2; y2 = y1; y1 = y; SCR[i] += y; } return e;
}
// scratch -> stream, with a soft front of `att` s and the finger/damper coming back at `dur`
function lay(S, x, t, n, g, att, dur, rel) {
  const o = Math.round((t - S.t0) * SR), na = Math.max(2, att * SR | 0), nd = Math.min(n, dur * SR | 0), k = Math.exp(-1 / (rel * SR)), end = Math.min(n, nd + rel * 8 * SR | 0); let e = 1;
  for (let i = 0; i < end; i++) { let v = SCR[i]; if (i < na) v *= smooth(i / na); if (i >= nd) { e *= k; v *= e; } const j = o + i; if (j >= 0 && j < x.length) x[j] += v * g; }
  SCR.fill(0, 0, n);
}
function puff(x, i0, n, g, hi, lo, rg, att) { // soft filtered noise: skin, felt, hair. never a burst
  const a = 1 - Math.exp(-TAU * hi / SR), b = 1 - Math.exp(-TAU * lo / SR), na = att * n; let p = 0, q = 0, r = 0, ns = rg.i();
  for (let i = 0; i < n; i++) { ns = Math.imul(ns, 1664525) + 1013904223 | 0; p += a * (ns * 4.6566e-10 - p); q += a * (p - q); r += b * (q - r); const u = i < na ? smooth(i / na) : Math.pow(1 - (i - na) / (n - na), 2.2), j = i0 + i; if (j >= 0 && j < x.length) x[j] += (q - r) * u * g; }
}
// ---- plucked: nylon guitar, harp, double bass, pizzicato
const PLUCK = {
  guitar: { T0: [[40, 4.6], [52, 4.0], [64, 2.9], [76, 1.7]], hi: .42, beta: .22, wid: [1900, 3600], Bn: 6e-5, att: .0014, body: 'guitar', puff: .020, np: 34, g: .30 },
  harp: { T0: [[38, 7.6], [50, 6.0], [62, 4.4], [74, 2.7], [86, 1.5]], hi: .50, beta: .42, wid: [1300, 2900], Bn: 8e-5, att: .0030, body: 'harp', puff: .014, np: 34, g: .30 },
  bass: { T0: [[28, 2.6], [40, 2.1], [52, 1.5]], hi: .16, beta: .19, wid: [560, 980], Bn: 1.6e-4, att: .0048, body: 'bass', puff: .036, np: 28, g: .80 },
  pizzVn: { T0: [[55, 1.0], [69, .75], [81, .45], [93, .3]], hi: .11, beta: .24, wid: [1300, 2000], Bn: 1.5e-4, att: .0022, body: 'violin', puff: .016, np: 18, g: .34 },
  pizzVa: { T0: [[48, 1.2], [60, .95], [72, .6]], hi: .11, beta: .24, wid: [1100, 1800], Bn: 1.5e-4, att: .0026, body: 'viola', puff: .016, np: 20, g: .34 },
  pizzVc: { T0: [[36, 1.9], [48, 1.5], [60, 1.0]], hi: .13, beta: .23, wid: [750, 1250], Bn: 1.4e-4, att: .0034, body: 'cello', puff: .020, np: 24, g: .36 },
};
function pluck(S, kind, t, m, vel, rg, o = {}) {
  const P = PLUCK[kind], x = S.x(P.body, o.v || 0, o.pan || 0), f0 = hz(m) * Math.pow(2, rg.g() * .5 / 1200), T0 = tab(P.T0, m) * (o.long || 1), dur = o.dur || T0, _ = note(S, kind, t, Math.min(dur, T0 * .5), m), beta = P.beta * rg.r(.92, 1.08), fc = lerp(P.wid[0], P.wid[1], vel) * Math.pow(2, (m - 55) / 40);
  const n = Math.min(SCR.length, Math.ceil(Math.min(T0 * 1.3, dur + .5) * SR)), s0 = 6.9078 / T0, sx = 6.9078 / P.hi - s0, B1 = P.Bn;
  for (let k = 1; k <= P.np; k++) {
    const fk = k * f0 * Math.sqrt((1 + B1 * k * k) / (1 + B1)); if (fk > 6800) break;
    const a = vel * Math.abs(Math.sin(Math.PI * k * beta)) / k * Math.exp(-Math.pow(fk / fc, 1.25) * .62), t60 = 6.9078 / (s0 * (1 + .03 * k) + sx * Math.pow(fk / 3000, 1.5)), ph = Math.PI * .5 * rg.r(.55, 1);
    ring(n, fk, t60, a * .74, ph); if (k < 9) ring(n, fk * (1 + (.00022 + .0001 * rg.u())), t60 * 1.35, a * .26, ph + 1.1);
  }
  lay(S, x, t, n, P.g * even(P.body, o.v || 0, m, 1, fc), P.att * (1.25 - .5 * vel), dur, o.rel || .075);
  puff(x, Math.round((t - S.t0 - .006) * SR), 900, P.puff * vel * (o.puff === undefined ? 1 : o.puff), kind === 'bass' ? 800 : 2100, kind === 'bass' ? 120 : 380, rg, .35);
}
// ---- felt piano: hammer felt, stiff strings in threes (prompt sound and aftersound), a quiet key
function piano(S, t, m, vel, rg, o = {}) {
  const x = S.x('piano', m < 58 ? 0 : 1, m < 58 ? -.26 : .22), f0 = hz(m) * Math.pow(2, rg.g() * .4 / 1200), T0 = tab([[28, 12], [40, 10], [52, 8], [64, 6], [76, 4], [88, 2.2]], m), Bn = 2.4e-4 * Math.pow(2, Math.max(0, m - 45) / 13), fc = (430 + 1250 * Math.pow(vel, 1.1)) * Math.pow(2, (m - 60) / 34), dur = o.dur || T0, n = Math.min(SCR.length, Math.ceil((dur + 1.2) * SR)); note(S, 'piano', t, dur, m);
  for (let k = 1; k <= 26; k++) {
    const fk = k * f0 * Math.sqrt((1 + Bn * k * k) / (1 + Bn)); if (fk > 6000) break;
    const a = vel * (.25 + .75 * Math.abs(Math.sin(Math.PI * k * .119))) * Math.pow(k, -.28) * Math.exp(-Math.pow(fk / fc, 1.15)) * Math.pow(10, rg.g() * 1.2 / 20), t60 = T0 / (1 + .20 * Math.pow(k - 1, 1.15) + Math.pow(fk / 2600, 2)), ph = rg.r(-.3, .3);
    ring(n, fk, t60 * .36, a * .62, ph); ring(n, fk * (1 + rg.r(.00010, .00022)), t60 * .95, a * .27, ph + .5); ring(n, fk * (1 - rg.r(.00008, .00018)), t60 * 1.1, a * .14, ph - .6);
  }
  lay(S, x, t, n, .30 * even('piano', m < 58 ? 0 : 1, m, .6, fc), .0046 + .0040 * (1 - vel), dur, o.rel || .16);
  puff(x, Math.round((t - S.t0 - .010) * SR), 1700, .045 * vel, 620, 60, rg, .22);                                  // felt on string, key on bed
  ring(6000, 71, .16, .020 * vel, 0); ring(6000, 112, .12, .016 * vel, 0); lay(S, x, t - .002, 6000, .5, .006, .2, .05);
}
// ---- plates and tines
function celesta(S, t, m, vel, rg, o = {}) {
  note(S, 'celesta', t, .5, m);
  const x = S.x('metal', o.v || 0, o.pan === undefined ? .28 : o.pan), f0 = hz(m), T0 = tab([[60, 3.6], [72, 3.0], [84, 2.2], [96, 1.4]], m), n = Math.ceil(T0 * 1.35 * SR);
  ring(n, f0, T0, vel, 0); ring(n, f0 * 1.0007, T0 * .8, vel * .35, 1); ring(n, f0 * 2.003, T0 * .34, vel * .10, .4); ring(n, f0 * 2.76, T0 * .26, vel * .17 * (.5 + vel), .3); ring(n, f0 * 5.40, T0 * .10, vel * .085, .6);
  lay(S, x, t, n, .20, .0022, T0, .2); puff(x, Math.round((t - S.t0 - .003) * SR), 700, .010 * vel, 1500, 300, rg, .3);
}
function musicbox(S, t, m, vel, rg, o = {}) {
  note(S, 'musicbox', t, .5, m);
  const x = S.x('metal', 2, o.pan === undefined ? .05 : o.pan), f0 = hz(m) * Math.pow(2, rg.g() * .6 / 1200), T0 = tab([[72, 2.4], [84, 1.8], [96, 1.1]], m), n = Math.ceil(T0 * 1.35 * SR);
  ring(n, f0, T0, vel, 0); ring(n, f0 * 1.0011, T0 * .7, vel * .28, 2); ring(n, f0 * 6.267, T0 * .10, vel * .07, .5); ring(n, f0 * 2.01, T0 * .22, vel * .05, 1);
  lay(S, x, t, n, .20, .0016, T0, .2); puff(x, Math.round((t - S.t0 - .004) * SR), 420, .010 * vel, 2400, 700, rg, .4);
}
function glock(S, t, m, vel, rg, o = {}) {
  note(S, 'glock', t, .5, m);
  const x = S.x('metal', 1, o.pan === undefined ? .36 : o.pan), f0 = hz(m), T0 = tab([[79, 3.4], [91, 2.6], [103, 1.6]], m), n = Math.ceil(T0 * 1.35 * SR);
  ring(n, f0, T0, vel, 0); ring(n, f0 * 1.0005, T0 * .9, vel * .3, 1); ring(n, f0 * 2.756, T0 * .34, vel * .20, .3); ring(n, f0 * 5.404, T0 * .12, vel * .06, .6);
  lay(S, x, t, n, .20, .0015, T0, .2); puff(x, Math.round((t - S.t0 - .002) * SR), 500, .012 * vel, 2600, 600, rg, .3);
}
// ---- skin: a frame drum played with the hand, a brush on it, and the big one
function drum(S, t, vel, rg, o = {}) {
  const x = S.x('skin', o.v || 0, o.pan || 0), f0 = (o.f || 76) * rg.r(.985, 1.015), tak = o.tak || 0, n = Math.ceil(1.1 * SR), md = [[1, 1, .62], [1.594, .55, .40], [2.136, .34, .30], [2.296, .24, .28], [2.653, .20, .22], [2.918, .16, .20], [3.156, .12, .16], [3.50, .12, .15], [4.06, .08, .11]];
  for (let k = 0; k < md.length; k++) { const [r, a, d] = md[k], g = vel * a * (tak ? (k < 2 ? .12 : 1.5) : Math.pow(.50 + .42 * vel, k)); ring(n, f0 * r, d * (o.long || 1), g * .8, rg.r(-.2, .2)); if (k < 2 && !tak) ring(n, f0 * r * 1.16, d * .22, g * .55, .3); }
  lay(S, x, t, n, .42, tak ? .0022 : .0050, 1.1, .1); puff(x, Math.round((t - S.t0 - .004) * SR), tak ? 1300 : 2000, (tak ? .10 : .07) * vel, tak ? 2300 : 900, tak ? 500 : 90, rg, .14);
}
const brush = (S, t, vel, rg, o = {}) => puff(S.x('skin', 1, o.pan === undefined ? -.18 : o.pan), Math.round((t - S.t0 - .02) * SR), (o.len || .13) * SR | 0, .42 * vel, 2600, 850, rg, .34);
// ============================================================================
// THE ARRANGEMENT
// ============================================================================
const TM = SC.TIME, M = s => s.split(' ').map(midi);
const bars = a => x => tab(a, x / 3);
// bass: [x, note, vel, dur beats]
function bassLine(S, sec, list, rg, o = {}) { for (const [x, m, v, d] of list) { const t = T(sec, x) + rg.g() * .004; pluck(S, 'bass', t, m, clamp(v + rg.g() * .03, .1, 1), rg, { pan: o.pan || .02, dur: T(sec, x + (d || 2.1)) - T(sec, x), rel: .11 }); } }
// pah: a strum on beats 2 and 3, the second a little early and lighter: the lilt
function strum(S, kind, t, ms, v, rg, o = {}) { const up = o.up, sp = o.sp || .012, n = ms.length; for (let i = 0; i < n; i++) pluck(S, kind, t + (up ? n - 1 - i : i) * sp * rg.r(.8, 1.2) - sp * .5, ms[i], clamp(v * (.9 + .1 * i / n) + rg.g() * .025, .05, 1), rg, o); }
function pah(S, sec, bar, ms1, ms2, v, rg, o = {}) { const b = T(sec, bar * 3 + 1) - T(sec, bar * 3); strum(S, 'guitar', T(sec, bar * 3 + 1) - .012 + rg.g() * .004, ms1, v, rg, Object.assign({ dur: b * .82 }, o)); if (ms2) strum(S, 'guitar', T(sec, bar * 3 + 2) - .003 + rg.g() * .004, ms2, v * .80, rg, Object.assign({ dur: b * .74, up: 1 }, o)); }
// the wheel: six spokes a bar
function wheel(S, kind, sec, bar, ms, v, rg, o = {}) { const pat = [0, 1, 2, 3, 2, 1]; for (let i = 0; i < 6; i++) { const x = bar * 3 + i * .5, m = ms[Math.min(ms.length - 1, pat[i])]; pluck(S, kind, T(sec, x) + rg.g() * .005 + (i % 2 ? .006 : 0), m, clamp(v * (i === 0 ? 1.05 : i % 2 ? .82 : .95) + rg.g() * .03, .05, 1), rg, Object.assign({ dur: Math.min((T(sec, x + 1) - T(sec, x)) * 1.5, T(sec, bar * 3 + 3) - T(sec, x) + .03) }, o)); } }
const G_D = ['A3 D4 F#4', 'A3 D4 F#4', 'B3 D4 G4', 'A3 C#4 G4', 'A3 D4 F#4', 'B3 D4 G4', 'A3 D4 F#4', 'G3 C#4 E4', 'G3 B3 D4', 'F#3 B3 D4', 'G3 B3 E4', 'G3 C#4 E4', 'F#3 A3 D4', 'F#3 A3 C#4', 'G3 B3 D4', 'G3 C#4 E4', 'A3 C#4 E4', 'F#3 B3 D4', 'G3 B3 D4', 'A3 D4 F#4'].map(M);
const G_18b = M('G3 C#4 E4');
// four-note spokes for the wheel pattern (E major, ride bars 12..19)
const W_E = ['B3 E4 G#4 B4', 'B3 D#4 G#4 B4', 'C#4 E4 A4 C#5', 'B3 E4 A4 B4', 'B3 D#4 F#4 B4', 'C#4 E4 G#4 C#5', 'A3 C#4 F#4 A4', 'B3 E4 G#4 B4'].map(M);
const J = {};
// ---------------------------------------------------------------- THEN
J['then.rhythm'] = id => {
  const s = 'then', S = Stem(id, s, T(s, 0) - .1, TM.matchCut + .05, .46), rg = Rng(id);
  bassLine(S, s, [[0, 38, .56], [3, 38, .50], [6, 38, .52], [9, 38, .50], [11, 33, .36, 1], [12, 38, .56], [15, 43, .52], [18, 42, .46], [21, 33, .50], [23, 35, .34, 1], [24, 31, .60], [27, 35, .56], [29, 38, .34, 1], [30, 40, .50], [33, 33, .52], [35, 37, .40, 1], [36, 38, .62], [38, 40, .38, 1], [39, 42, .58], [42, 43, .60], [44, 38, .36, 1], [45, 33, .60], [47, 35, .42, 1], [48, 37, .66], [51, 35, .66], [53, 38, .42, 1], [54, 40, .66], [56, 33, .60, 1.1], [57, 38, .72], [59, 33, .40, 1]], rg);
  for (let b = 0; b < 20; b++) { const v = tab([[0, .33], [3, .39], [4, .36], [8, .40], [12, .40], [16, .46], [19, .56]], b), hole = b === 6 || b === 10; pah(S, s, b, G_D[b], hole ? null : b === 18 ? G_18b : G_D[b], hole ? v * .7 : v, rg, { pan: -.46 }); }
  // the little turns of the wheel between the lines
  for (const [x, m, v] of [[22.5, 64, .30], [23, 67, .32], [23.5, 69, .30], [34.5, 61, .28], [35, 64, .32], [35.5, 67, .32], [46.5, 62, .26], [47, 64, .28], [47.5, 69, .30]]) pluck(S, 'guitar', T(s, x) + rg.g() * .004, m, v, rg, { pan: -.46, dur: .5 });
  return S.done({ cut: TM.matchCut, fade: .006, gain: .92 });
};
J['then.reeds'] = id => {
  const s = 'then', S = Stem(id, s, T(s, 0) - .1, TM.matchCut + .05, .60);
  const c = seq(s, 0, 'D5+A4:2 C#5+A4:1 | ^B4+F#4:2 A4+F#4:1 | B4+G4:2 D5+G4:1 | ^C#5+G4:2 E5+A4:1 | A4+F#4:3 | ~B4+G4:3 | r:3 | r:3 | B4+G4:3 | r:1 ^F#5+D5:1 ~D5+B4:1 | r:3 | r:1 E5+C#5:1 ~C#5+A4:1 | A4+F#4:3 | ~A4+F#4:3 | B4+G4:3 | C#5+G4:3 | C#5+A4+E4:3 | D5+B4+F#4:3 | D5+B4+E4:2 ~C#5+G4+E4:1 | D5+A4+F#4:3');
  concertina(S, c, curve([[0, .50], [3, .60], [3.9, .56], [4, .42], [7, .40], [8, .44], [9, .54], [11.9, .48], [12, .38], [15, .42], [16, .44], [18, .60], [20, .62]]), { bellows: [2, 4, 8, 12, 14, 16, 18].map(b => T(s, b * 3) - .02) });
  clarinet(S, seq(s, 7, 'r:1 A3:.5 ~C#4:.5 ~E4:.5 ~G4:.5 | ~B4:1.5 r:1.5'), curve([[7, .34], [8, .56], [8.5, .20]]), {});
  clarinet(S, seq(s, 15, 'r:1 C#4:.5 ~E4:.5 ~G4:.5 ~A4:.5 | ~A4:1 r:2'), curve([[15, .30], [16, .52], [16.3, .16]]), { seed: 'b' });
  return S.done({ cut: TM.matchCut, fade: .006, gain: 1.46 });
};
J['then.strings'] = id => {
  const s = 'then', S = Stem(id, s, T(s, 8) - .4, TM.matchCut + .05, .78);
  const d = curve([[8, .20], [9, .44], [9.8, .20], [10, .0], [11.9, .0], [12, .28], [14, .35], [15, .31], [16, .36], [17, .43], [18, .52], [19, .50], [20, .58]]);
  bow(S, 'violin', seq(s, 12, 'A4:2 ~B4:1 | C#5:3 | B4:1 /D5:2 | E5:3 | C#5:1 /E5:2 | D5:1 /F#5:2 | E5:1 /G5:2 | r:3'), d, { seed: '1', players: 2, pan: -.40, gain: 1.0 });
  bow(S, 'violin', seq(s, 8, 'G4:3 | ~F#4:2.6 r:.4 | r:3 | r:3 | F#4:3 | ~F#4:3 | G4:3 | ~G4:3 | A4:1 ~C#5:2 | B4:1 ~D5:2 | B4:1 ~D5:1 ~C#5:1 | D5:3'), d, { seed: '2', pan: .44, gain: .8, v: 2 });
  bow(S, 'viola', seq(s, 8, 'B3:3 | ~B3:2.5 r:.5 | r:3 | r:3 | D4:3 | ~C#4:3 | B3:3 | E4:3 | ~E4:3 | ~F#4:3 | ~E4:3 | D4:3'), d, { pan: .22, gain: .8 });
  bow(S, 'cello', seq(s, 8, 'G3:3 | ~F#3:2.5 r:.5 | r:3 | r:3 | F#3:3 | ~A3:3 | G3:3 | E3:3 | C#3:3 | B2:2 ~D3:1 | E3:2 A2:1 | D3:3'), d, { pan: .12, gain: .9 });
  return S.done({ cut: TM.matchCut, fade: .006, gain: .58 });
};
// ---------------------------------------------------------------- NOW
J['now.piano'] = id => {
  const s = 'now', S = Stem(id, s, T(s, 12) - .2, T(s, 70), .62), rg = Rng(id), ends = [21, 33, 70];
  // D5 C#5 B4 ... and the next step down would be her A4. D5 C#5 ... and the next would be her B4. Both are left out.
  const ev = [[12, 74, .30], [15, 47, .27], [17, 73, .28], [18, 43, .27], [19, 71, .25], [27, 43, .30], [29, 76, .27], [30, 42, .30], [31, 74, .28], [32, 73, .25], [39, 42, .31], [41, 66, .24], [42, 49, .27], [43, 73, .26], [45, 43, .31], [46, 74, .26], [48, 45, .30], [49, 67, .23], [50, 74, .26], [51, 45, .24], [52, 76, .28], [54, 35, .34], [55, 74, .28], [56, 78, .30],
    [57, 33, .24], [57.10, 52, .16], [57.22, 57, .15], [57.36, 62, .17], [57.52, 67, .20]];
  for (const [x, m, v] of ev) {
    const t = T(s, x) + rg.g() * .010, last = x >= 57, next = last ? 99 : Math.min(...ev.filter(e => e[0] > x + .01 && (e[1] < 58) === (m < 58)).map(e => e[0]), 99), e = Math.min(ends.find(q => q > x), next + (m < 58 ? .30 : .22));
    piano(S, t, m, clamp(v + rg.g() * .012, .1, 1), rg, { dur: Math.min(T(s, e) - t, 9), rel: .16 });
  }
  // the pedal lets every string answer; it comes up where her notes should be
  const n = S.n, dry = [S.x('piano', 0, -.26), S.x('piano', 1, .22)], N = 88200, r2 = Rng(id + 'bloom'), hL = new Float32Array(N), hR = new Float32Array(N);
  for (let m = 38; m <= 79; m++) { if (![2, 6, 9, 11, 1, 4, 7].includes(m % 12)) continue; for (let k = 1; k <= 3; k++) { const f = hz(m) * k * (1 + r2.g() * .0004), t60 = (3.6 - k * .7) * Math.pow(2, (55 - m) / 30), w = TAU * f / SR, r = Math.exp(-6.9078 / (t60 * SR)), k1 = 2 * r * Math.cos(w), g = .00042 * Math.pow(2, -k) * 2, p = r2.u() * TAU, q = p + r2.r(-1.2, 1.2); let a = Math.sin(p), b = Math.sin(p - w), c = Math.sin(q), d = Math.sin(q - w); for (let i = 0; i < N; i++) { const y = k1 * a - r * r * b, z = k1 * c - r * r * d; b = a; a = y; d = c; c = z; hL[i] += g * y; hR[i] += g * z; } } }
  for (let i = 0; i < N; i++) { const u = smooth(i / 2600) * smooth((N - i) / 22000); hL[i] *= u; hR[i] *= u; }
  const BL = new Float32Array(n), BRr = new Float32Array(n); conv2(dry[0], dry[1], [hL, hR], [hR, hL], BL, BRr);
  for (const e of ends.slice(0, 2)) { const i0 = Math.round((T(s, e) - S.t0) * SR), i1 = Math.round((T(s, e + 6) - S.t0) * SR); for (let i = i0; i < i1; i++) { const g = Math.exp(-(i - i0) / (.22 * SR)); BL[i] *= g; BRr[i] *= g; } }
  for (let i = 0; i < n; i++) { S.L[i] += BL[i]; S.R[i] += BRr[i]; }
  // damper felt leaving and touching the strings
  for (const x of [12, 15, 18, 27, 30, 39, 42, 45, 48, 51, 54, 57]) puff(S.x('piano', 0, -.26), Math.round((T(s, x) + .10 - S.t0) * SR), 5200, .010, 420, 60, rg, .4);
  return S.done({ fade: .8, gain: .86 });
};
J['now.strings'] = id => {
  const s = 'now', S = Stem(id, s, T(s, 45) - .5, SC.sec.storm.t0 + .6, .40);
  bow(S, 'cello', seq(s, 15, 'G2:3 | ~A2:3 | C#3:1 /E3:2 | D3:1 /F#3:2 | E3:1 /G3:5'), curve([[15, .05], [15.9, .28], [17, .40], [18.4, .48], [19.1, .40], [20, .24], [20.95, .0]]), { pan: .16, gain: 1.15, vib: 17, att: .35, rel: 1.6, lag: 0, tj: .012 });
  // the tide: a tremolo that comes up through the floor
  const t0 = T(s, 60), t1 = SC.sec.storm.t0 + .05, nx = (t1 - t0) / (T(s, 1) - T(s, 0)), tr = (m, a = 0) => [{ m, t0: t0 + a, t1, x: 60 + a / .75, d: nx - a / .75, trem: 10.2, vib: 0, att: 1.6, rel: .5 }];
  const d = curve([[20, .05], [21, .22], [22, .42], [22.5, .58]]);
  bow(S, 'cello', tr(47), d, { seed: 't', players: 2, pan: .34, gain: .8 }); bow(S, 'cello', tr(54, 1.9), d, { seed: 'u', players: 1, pan: .5, gain: .6, v: 2 }); bow(S, 'bass', tr(35, .6), d, { seed: 'v', pan: .06, gain: .9 }); bow(S, 'viola', tr(60, 3.2), curve([[20, 0], [21.4, .06], [22.5, .30]]), { seed: 'w', pan: .2, gain: .5 });
  return S.done({ fade: .35, gain: .40 });
};
// ---------------------------------------------------------------- STORM
const OST = { Bm: [47, 47, 54, 47, 50, 49], 'Bm/A': [45, 45, 54, 45, 50, 49], G: [43, 43, 50, 43, 47, 45], 'F#7': [42, 42, 49, 42, 46, 52], 'F#m/A': [45, 45, 54, 45, 49, 47], Em: [40, 40, 47, 40, 43, 42], 'F#': [42, 42, 49, 42, 46, 49] };
const STORM_D = [[0, .40], [3.9, .62], [4, .46], [7.9, .66], [8, .54], [11.9, .78], [12, .68], [16, 1.02]];
J['storm.low'] = id => {
  const s = 'storm', S = Stem(id, s, T(s, 0) - .3, TM.wave + .05, .30), cel = [], bs = [], C = SC.chords.storm;
  for (let b = 0; b < 16; b++) { const o = OST[C[b]]; for (let i = 0; i < 6; i++) { const x = b * 3 + i * .5; cel.push({ m: o[i], x, d: .5, t0: T(s, x), t1: T(s, x + .46), spic: b >= 12 ? .17 : .13, acc: i === 0, sw: 0 }); } for (const i of [0, 3]) { const x = b * 3 + i * .5, m = o[0] - 12 >= 28 ? o[0] - 12 : o[0]; bs.push({ m, x, d: 1.5, t0: T(s, x), t1: T(s, x + 1.35), acc: i === 0, att: .05, rel: .12, sw: .02, vib: 0 }); } }
  bow(S, 'cello', cel, curve(STORM_D), { players: 3, pan: .30, spread: .5, gain: 1.25, vib: 0, z: .085, tj: .006 });
  bow(S, 'bass', bs, curve(STORM_D), { players: 1, pan: .04, gain: 1.2, z: .06 });
  return S.done({ cut: TM.wave, fade: .010, gain: .56 });
};
J['storm.high'] = id => {
  const s = 'storm', S = Stem(id, s, T(s, 0) - .4, TM.wave + .05, .46), tr = n => n.map(e => Object.assign(e, { trem: 9.4, vib: 4, att: .08, rel: .12, m: e.ms[0] }));
  const d = curve([[0, .26], [3.9, .62], [4, .30], [6, .36], [7.9, .50], [8, .34], [10, .42], [11.9, .66], [12, .52], [14, .66], [15.9, .92], [16, .96]]);
  bow(S, 'violin', tr(seq(s, 0, 'F#5:3 | F#5:3 | G5:3 | A#5:3 | B5:3 | A5:3 | B5:3 | F#5:3 | G5:3 | B5:3 | B5:3 | A#5:3 | B5:3 | C6:3 | C#6:3 | /D6:1.5 /E6:1.5')), d, { seed: '1', players: 2, pan: -.46, gain: .78 });
  bow(S, 'violin', tr(seq(s, 0, 'D5:3 | C#5:3 | D5:3 | E5:3 | F#5:3 | F#5:3 | G5:3 | D5:3 | D5:3 | G5:3 | A5:3 | G5:3 | A#5:3 | B5:3 | C6:3 | /C#6:1.5 /D6:1.5')), d, { seed: '2', players: 2, pan: -.16, gain: .70, v: 2 });
  bow(S, 'viola', seq(s, 0, 'B3:3 | ~A3:3 | ~B3:3 | ~A#3:3 | F#4:3 | ~F#4:3 | ~G4:3 | ~F#4:3 | D4:3 | ~E4:3 | ~B3:3 | ~C#4:3 | F#4:3 | ~G4:3 | ~F#4:1.5 ~G4:1.5 | ~F#4:1.5 /G4:1.5').map(e => Object.assign(e, { m: e.ms[0] })), curve([[0, .22], [3.9, .5], [4, .22], [8, .28], [11.9, .46], [12, .36], [16, .74]]), { players: 2, pan: .22, gain: .75, v: 0 });
  return S.done({ cut: TM.wave, fade: .010, gain: .34 });
};
J['storm.force'] = id => {
  const s = 'storm', S = Stem(id, s, T(s, 0) - .2, TM.wave + .05, .36), rg = Rng(id);
  const h = seq(s, 2, 'G2+D3+B3:3 | ~F#2+C#3+A#3:2.7 r:.3 | r:3 | r:3 | G2+D3+B3:3 | ~B2+F#3+D4:2.6 r:.4 | r:3 | r:3 | G2+D3+B3:3 | ~F#2+C#3+A#3+E4:2.7 r:.3 | B2+F#3+D4:3 | ~E3+G3+B3:3 | ~F#2+C#3+A#3:3 | ~F#2+C#3+G3+A#3:3');
  horns(S, h, curve([[2, .16], [3.8, .64], [4, .2], [6, .18], [7.6, .62], [8, .2], [10, .22], [11.8, .78], [12, .46], [13, .56], [14, .70], [16, 1.0]]), { att: .20, rel: .12, gain: .20, pan: .10, spread: .55 });
  const D = x => tab(STORM_D, x / 3);
  for (let b = 0; b < 16; b++) for (const [q, v, k] of b < 14 ? [[0, .95, 0], [1, .22, 1], [1.5, .46, 0], [2, .26, 1], [2.5, .34, 1]] : [[0, 1, 0], [.5, .4, 1], [1, .6, 0], [1.5, .7, 0], [2, .6, 0], [2.5, .7, 1]]) { const x = b * 3 + q; drum(S, T(s, x) + rg.g() * .004, v * D(x) * rg.r(.92, 1.06), rg, { f: k ? 92 : 62, tak: k, pan: k ? .14 : -.04 }); }
  for (let i = 0; i < 16; i++) { const x = 45 + i * .1875; drum(S, T(s, x), .25 + .5 * i / 16, rg, { f: 62, pan: -.04 }); }
  return S.done({ cut: TM.wave, fade: .010, gain: .74 });
};
// ---------------------------------------------------------------- the wave, the egg in the air
J['storm.hit'] = id => {
  const t = TM.wave, S = Stem(id, 'storm', t - .12, t + 4.6, .7), rg = Rng(id), cd = curve([[0, 1]]);
  drum(S, t, 1, rg, { f: 40, long: 3.4, v: 2 }); drum(S, t + .006, .8, rg, { f: 57, long: 2.0, v: 2, pan: -.3 }); drum(S, t + .010, .7, rg, { f: 66, long: 1.6, v: 2, pan: .3 });
  { const x = S.x('skin', 2, 0), n = SR * 4; for (const [f, d, a] of [[33, 3.4, .5], [49, 2.4, .42], [73.4, 1.7, .26], [98, 1.1, .16], [146, .7, .10]]) ring(n, f, d, a, rg.r(-.4, .4)); lay(S, x, t - .004, n, .62, .014, 4, .2); }
  for (const [k, m, p] of [['bass', 30, 0], ['cello', 42, .3], ['cello', 43, -.3]]) bow(S, k, [{ m, t0: t, t1: t + .20, x: 0, d: 1, spic: .42, vib: 0, acc: true, sw: 0 }], cd, { seed: 'h' + m, pan: p, gain: .9, z: .07, tj: 0, lag: 0 });
  horns(S, [{ ms: [30, 37, 43], x: 0, d: 1, t0: t, t1: t + .5, slur: false }], curve([[0, .9], [.4, .1]]), { att: .03, rel: .4, gain: .18 });
  return S.done({ fade: 1.6, gain: .66 });
};
J['catch.glass'] = id => {
  const t = TM.wave, S = Stem(id, 'catch', t + .5, TM.black + .3, .55), rg = Rng(id), a = t + 1.1, e = TM.black + .04;
  // one harmonic, A6: the note her answer begins on, and the chick's
  for (let i = 0; i < 2; i++) bow(S, 'violin', [{ m: 93, t0: a + i * .35, t1: e, x: 0, d: 3, vib: i ? 2.5 : 0, att: 2.2, rel: .06, sw: .05 }], curve([[0, .26], [.55, .46], [.9, .38], [1, .34]]), { seed: 'g' + i, spec: SPEC.harm, pan: i ? .3 : -.3, gain: .34, z: .030, det: 1.2, v: i });
  // the egg: a pulse that slows and stops
  let x = t + .95, gap = .60; while (x < TM.black - .30) { for (const [dt, v, f] of [[0, 1, 43], [.17 + gap * .05, .62, 50]]) { const n = SR * .6 | 0; ring(n, f, .34, v, 0); ring(n, f * 2.02, .20, v * .42, .2); ring(n, f * 3.1, .12, v * .20, .4); lay(S, S.x('skin', 3, 0), x + dt, n, .36, .020, .5, .06); } x += gap; gap *= 1.20; }
  return S.done({ cut: TM.black, fade: .05, gain: .62 });
};
// ---------------------------------------------------------------- NIGHT
J['night.plucked'] = id => {
  const s = 'night', S = Stem(id, s, T(s, 0) - .2, TM.nightEnd + 4.4, .40), rg = Rng(id), end4 = T(s, 12), ready = T(s, 11.2);
  const hp = [[0, 38, .26], [1, 57, .22], [2, 62, .20], [3, 38, .22], [4, 57, .20], [5, 64, .20], [6, 38, .26], [7.5, 57, .16], [8, 62, .18], [9, 43, .26], [10, 59, .18], [11, 62, .16],
    [18, 43, .28], [19, 59, .20], [20, 62, .20], [21, 47, .28], [22, 54, .20], [23, 62, .22], [24, 40, .26], [26, 59, .16], [27, 45, .28], [28, 57, .20], [28.5, 62, .18], [29, 64, .20], [30, 40, .26], [31, 55, .18], [32, 45, .24], [33, 38, .26], [33.5, 45, .18], [34, 54, .18], [34.6, 57, .18], [35.3, 62, .18]];
  for (const [x, m, v] of hp) { const t = T(s, x) + rg.g() * .012; pluck(S, 'harp', t, m, clamp(v + rg.g() * .012, .08, 1), rg, { pan: -.30, dur: t < end4 ? Math.min(5, end4 - .35 - t) : 5, rel: t < end4 ? .22 : .12, v: 0 }); }
  for (const [x, m, v] of [[2, 86, .30], [4, 88, .26], [5.5, 81, .24], [8.5, 86, .20], [11, 83, .20], [20.5, 83, .24], [22, 90, .26], [23, 86, .24], [27, 86, .28], [28, 88, .26], [29, 81, .22]]) { const t = T(s, x) + rg.g() * .012; celesta(S, t, m, v * 1.5, rg, { pan: .30 }); }
  // the music box runs down with him
  for (const [x, m, v] of [[31, 91, .22], [31.6, 88, .19], [32.3, 85, .18], [33.1, 86, .20], [34.0, 93, .16], [35.1, 90, .15]]) musicbox(S, T(s, x), m, v, rg, { pan: .06 });
  // bar 4: he waits. nothing may still be sounding
  const i0 = Math.round((T(s, 11.4) - S.t0) * SR), i1 = Math.round((end4 + .05 - S.t0) * SR), i2 = Math.round((T(s, 15) - S.t0) * SR), st = [S.x('harp', 0, -.30), S.x('metal', 0, .30), S.x('metal', 2, .06)];
  for (const x of st) for (let i = i0; i < i2; i++) x[i] *= smooth((i1 - i) / (i1 - i0));
  return S.done({ fade: 2.4, gain: .66, hush: [end4 + .10, T(s, 14.9)] });
};
J['night.bowed'] = id => {
  const s = 'night', S = Stem(id, s, T(s, 0) - .6, TM.nightEnd + 2.4, .32), m1 = n => n.map(e => Object.assign(e, { m: e.ms[0] }));
  const d = curve([[0, .0], [.6, .16], [2, .20], [3.2, .22], [3.95, .0], [4, 0], [5.9, 0], [6, .12], [7, .24], [9, .24], [10, .20], [11, .18], [12.2, .0]]);
  bow(S, 'cello', m1(seq(s, 0, 'D2:6 | D2:3 | ~G2:2.9 r:.1 | r:3 | r:3 | G2:3 | B2:3 | ~E2:3 | A2:3 | E2:2 ~A2:1 | D2:4.2')), d, { seed: 'd', pan: .20, gain: .9, vib: 7, att: 1.3, rel: 1.3, body: 'cello' });
  bow(S, 'cello', m1(seq(s, 0, 'A2:6 | A2:3 | ~D3:2.9 r:.1 | r:3 | r:3 | D3:3 | F#3:3 | ~G2:3 | D3:3 | B2:2 ~G2:1 | ~A2:4.2')), d, { seed: 'e', pan: .38, gain: .62, vib: 8, att: 1.5, rel: 1.4, v: 2 });
  // her two notes, an octave under his hum, barely
  bow(S, 'viola', m1(seq(s, 5, 'A2:1 ~F#2:2.3 r:.7')), curve([[5, .13], [5.5, .24], [6, .0]]), { seed: 'h1', body: 'cello', pan: .10, gain: 1.0, vib: 10, att: .34, rel: .9, v: 3 });
  bow(S, 'viola', m1(seq(s, 8, 'B2:1 ~G2:2.4 r:.6')), curve([[8, .18], [8.5, .30], [9, .0]]), { seed: 'h2', body: 'cello', pan: .10, gain: 1.0, vib: 12, att: .30, rel: .9, v: 3 });
  return S.done({ fade: 1.2, gain: .46, hush: [T(s, 12) + .15, T(s, 14.6)] });
};
// ---------------------------------------------------------------- DAWN: one chord out of nothing. D over A: it stands on one leg until 184
J['dawn.bloom'] = id => {
  const t0 = TM.answer + 1.2, t1 = TM.rideGo + .05, S = Stem(id, 'dawn', t0 - .1, t1 + 1.6, .62), d = curve([[0, .02], [.26, .14], [.52, .42], [.76, .84], [.86, .66], [1, .30]]);
  const add = (k, m, a, pan, g, o = {}) => bow(S, k, [{ m, t0: t0 + a, t1: t1 + .75, x: a / (t1 - t0) * 3, d: 3 - a / (t1 - t0) * 3, att: 1.1, rel: 1.0, vib: 13, sw: .02 }], d, Object.assign({ seed: 'b' + m, pan, gain: g, players: 2, spread: .2 }, o));
  add('bass', 33, .5, .05, .9, { players: 1 }); add('cello', 45, .2, .40, .8); add('cello', 50, 0, .30, .7, { v: 2 }); add('viola', 57, .3, .20, .7); add('viola', 62, .7, .14, .6, { v: 2 }); add('violin', 66, .9, -.18, .6); add('violin', 69, 1.1, -.36, .6, { v: 2 }); add('violin', 74, 1.4, -.46, .55); add('violin', 78, 1.7, -.28, .42, { v: 2 });
  return S.done({ fade: .5, gain: .50 });
};
// ---------------------------------------------------------------- RIDE
const RB = [[0, 38, .60], [3, 38, .54], [6, 38, .58], [9, 38, .58], [11, 33, .42, 1], [12, 38, .64], [15, 43, .58], [18, 42, .50], [21, 33, .54], [23, 35, .38, 1], [24, 31, .64], [27, 35, .60], [29, 38, .40, 1], [30, 40, .56], [33, 35, .60], [34, 39, .44, 1], [35, 42, .48, 1], [36, 40, .74], [38, 42, .46, 1], [39, 44, .68], [42, 45, .70], [44, 40, .42, 1], [45, 35, .70], [47, 37, .46, 1], [48, 39, .76], [51, 37, .76], [53, 40, .48, 1], [54, 42, .78], [56, 35, .70, 1.1], [57, 40, .76], [59, 40, .40, 1], [60, 39, .50, 3], [63, 37, .48, 3], [66, 42, .46, 2], [68, 35, .44, 1], [69, 40, .46, 3], [72, 28, .52, 8]];
J['ride.rhythm'] = id => {
  const s = 'ride', S = Stem(id, s, T(s, 0) - .1, T(s, 82), .42), rg = Rng(id);
  bassLine(S, s, RB, rg);
  strum(S, 'guitar', T(s, 0), M('D3 A3 D4 F#4 A4'), .56, rg, { pan: -.30, dur: 1.5, v: 1, sp: .016 });
  for (let b = 0; b < 4; b++) wheel(S, 'guitar', s, b, [['A3 D4 F#4 A4'], ['A3 D4 F#4 A4'], ['B3 D4 G4 B4'], ['A3 C#4 G4 A4']][b].map(M)[0], tab([[0, .42], [3, .48]], b), rg, { pan: -.46 });
  for (let b = 4; b < 12; b++) { const v = tab([[4, .46], [8, .50], [11, .56]], b), hole = b === 6 || b === 10, g = b === 11 ? M('F#3 A3 D#4') : G_D[b]; pah(S, s, b, g, hole ? null : g, hole ? v * .75 : v, rg, { pan: -.46 }); }
  for (let b = 12; b < 20; b++) { const v = tab([[12, .50], [15, .54], [18, .62], [19, .54]], b); wheel(S, 'guitar', s, b, b === 18 ? W_E[6] : W_E[b - 12], v, rg, { pan: -.46 }); strum(S, 'guitar', T(s, b * 3 + 1) - .012, b === 18 ? M('A3 C#4 E4') : W_E[b - 12].slice(0, 3), v * .72, rg, { pan: -.30, dur: .4, v: 1 }); if (b === 18) strum(S, 'guitar', T(s, 56), M('A3 D#4 F#4'), v * .7, rg, { pan: -.30, dur: .4, v: 1 }); }
  // pizzicato: violins and violas answer the bass
  for (let b = 0; b < 12; b++) { const hole = b === 6 || b === 10, g = b === 11 ? M('A4 D#5') : [M('F#4 A4'), M('A4 F#5'), M('B4 G5'), M('A4 E5')][b < 4 ? b : [0, 2, 0, 3, 2, 0, 2, 3][b - 4]], v = tab([[0, .40], [3, .52], [4, .36], [8, .40], [11, .48]], b); if (hole) continue; for (const q of [1, 2]) { const t = T(s, b * 3 + q) - (q === 1 ? .010 : 0) + rg.g() * .004; for (let p = 0; p < 2; p++) { pluck(S, 'pizzVn', t + rg.g() * .007, g[1], v * (q === 1 ? 1 : .8), rg, { pan: -.30 + p * .2, v: p, rel: .06 }); pluck(S, 'pizzVa', t + rg.g() * .007, g[0], v * (q === 1 ? 1 : .8), rg, { pan: .24, rel: .06 }); } } }
  // feet: soft skin on one, brush on two and three
  for (let b = 2; b < 20; b++) { const v = tab([[2, .20], [4, .28], [11, .34], [12, .46], [18, .54], [19.5, .40]], b), hole = b === 6 || b === 10; drum(S, T(s, b * 3) + rg.g() * .003, v * (hole ? .6 : 1), rg, { f: 70, pan: -.02 }); if (!hole) for (const q of [1, 2]) brush(S, T(s, b * 3 + q) + rg.g() * .004, v * (q === 1 ? .55 : .40), rg, { len: b >= 12 ? .16 : .12 }); if (b >= 12) drum(S, T(s, b * 3 + 2.5) + rg.g() * .004, v * .35, rg, { f: 96, tak: 1, pan: .10 }); }
  // two soft rolls: into the new key, into 'you'
  for (const [a, b, v] of [[34, 36, .30], [52, 54, .36]]) { const n = Math.round((T(s, b) - T(s, a)) / .062); for (let i = 0; i < n; i++) { const u = i / n; drum(S, T(s, a) + (T(s, b) - T(s, a)) * u + rg.g() * .003, v * (.16 + .84 * u * u), rg, { f: i & 1 ? 74 : 70, pan: -.02, long: .5 }); } }
  return S.done({ fade: 1.2, gain: .62 });
};
J['ride.reeds'] = id => {
  const s = 'ride', S = Stem(id, s, T(s, 0) - .2, T(s, 79), .52);
  const c = seq(s, 0, '^D5+A4:2 C#5+A4:1 | ^B4+F#4:2 A4+F#4:1 | B4+G4:2 ^D5+G4:1 | ^C#5+G4:2 E5+A4:1 | A4+F#4:3 | ~B4+G4:3 | r:3 | r:1 G4+E4:1 A4+E4:1 | B4+G4:3 | r:1 ^F#5+D5:1 ~D5+B4:1 | r:3 | r:1 F#5+D#5:1 ~D#5+B4:1 | B4+G#4+E4:3 | B4+G#4+D#4:3 | C#5+A4+E4:3 | ~B4+A4+E4:3 | D#5+B4+F#4:3 | E5+C#5+G#4:3 | E5+C#5+F#4:2 ~D#5+B4+A4:1 | E5+B4+G#4:3 | B4+F#4:3 | ~G#4+E4:3 | E4+C#4:2 ~F#4+D#4:1 | G#4+E4:3 | G#4+E4+B4:6.5');
  concertina(S, c, curve([[0, .56], [1, .52], [3, .58], [3.9, .52], [4, .46], [8, .50], [9, .60], [11.9, .58], [12, .46], [15, .50], [17, .56], [18, .60], [19.5, .48], [20, .42], [23, .38], [24, .38], [25, .30], [26.1, .0]]), { bellows: [2, 4, 8, 12, 14, 16, 18, 20, 22, 24].map(b => T(s, b * 3) - .02), rel: .09 });
  clarinet(S, seq(s, 7, 'r:1 A3:.5 ~C#4:.5 ~E4:.5 ~G4:.5 | ~B4:1.5 r:1.5'), curve([[7, .40], [8, .60], [8.5, .24]]), {});
  clarinet(S, seq(s, 15, 'r:1 E4:.5 ~F#4:.5 ~A4:.5 ~B4:.5 | ~B4:1 r:2'), curve([[15, .40], [16, .62], [16.3, .2]]), { seed: 'b' });
  return S.done({ fade: .6, gain: 1.14 });
};
J['ride.violins'] = id => {
  const s = 'ride', S = Stem(id, s, T(s, 0) - .3, T(s, 86), .66), m1 = n => n.map(e => Object.assign(e, { m: e.ms[0] }));
  const d = curve([[0, .50], [1, .44], [2, .48], [3.8, .54], [4, .38], [4.6, .20], [7, .36], [8, .42], [9, .56], [9.9, .24], [11, .42], [11.9, .68], [12, .54], [14, .61], [15, .56], [16, .62], [17, .72], [18, .88], [18.6, .84], [19, .74], [19.9, .46], [20, .38], [22.4, .46], [23, .38], [24, .40], [25, .36], [27, .16], [28.2, 0]]);
  bow(S, 'violin', m1(seq(s, 0, 'F#4:2 ~A4:1 | D5:2 ~F#5:1 | G5:2 ~B5:1 | A5:2 ~C#6:1 | D6:1.2 r:1.8 | r:3 | r:3 | r:1 G4:1 ~A4:1 | B4:3 | D5:2 ~C#5:1 | r:3 | r:1 B3:.5 ~D#4:.5 ~F#4:.5 ~A4:.5 | B4:2 ~C#5:1 | D#5:3 | C#5:1 /E5:2 | F#5:2 ~E5:1 | D#5:1 /F#5:2 | E5:1 /G#5:2 | F#5:1 /A5:2 | B5:1 ~G#5:2')), d, { seed: '1', players: 3, spread: .44, pan: -.44, gain: 1.05 });
  bow(S, 'violin', m1(seq(s, 0, 'D4:2 ~F#4:1 | A4:2 ~D5:1 | D5:2 ~G5:1 | E5:2 ~G5:1 | F#5:1.2 r:1.8 | r:3 | r:3 | r:3 | G4:3 | ~F#4:2.6 r:.4 | r:3 | r:2 ~A4:1 | G#4:3 | ~G#4:3 | A4:3 | ~A4:3 | B4:1 ~D#5:2 | C#5:1 ~E5:2 | C#5:1 ~E5:1 ~D#5:1 | G#5:1 ~E5:2')), d, { seed: '2', players: 2, pan: .46, spread: .3, gain: .86, v: 2 });
  // the tag: one violin climbs the three steps again; then the call, in thin air, with the chick
  bow(S, 'violin', m1(seq(s, 20, 'D#5:1 /F#5:2 | E5:1 /G#5:2 | F#5:1 /A5:2 | ~G#5:3 | r:1 B5:1 ~G#5:8.4')), d, { seed: 's', players: 1, pan: -.30, gain: 1.05, v: 4, vib: 17, rel: 1.8 });
  bow(S, 'violin', m1(seq(s, 20, 'B4:3 | G#4:3 | F#4:2 ~A4:1 | ~G#4:3 | ~E4:10')), d, { seed: 't', players: 2, pan: .40, spread: .3, gain: .74, rel: 1.6, v: 2 });
  return S.done({ fade: .8, gain: .50 });
};
J['ride.low'] = id => {
  const s = 'ride', S = Stem(id, s, T(s, 0) - .3, T(s, 86), .58), m1 = n => n.map(e => Object.assign(e, { m: e.ms[0] }));
  const d = curve([[0, .50], [1, .42], [3.8, .58], [4, .38], [6, .26], [8, .42], [9, .50], [9.9, .24], [11, .36], [11.9, .68], [12, .54], [15, .56], [17, .64], [18, .74], [19, .62], [19.9, .44], [20, .40], [22.4, .46], [24, .44], [25, .38], [27, .16], [28.2, 0]]);
  bow(S, 'cello', m1(seq(s, 0, 'D3:3 | F#3:3 | G3:2 ~B3:1 | C#4:3 | D3:3 | ~B2:3 | r:3 | r:3 | G3:3 | ~F#3:2.6 r:.4 | r:3 | A3:3 | E3:2 ~F#3:1 | G#3:3 | A3:3 | F#3:3 | D#3:2 ~F#3:1 | E3:2 ~G#3:1 | A3:2 ~F#3:1 | ~G#3:3 | D#3:3 | ~C#3:3 | F#3:2 B2:1 | E3:3 | ~B2:10')), d, { players: 2, pan: .14, spread: .3, gain: .96 });
  bow(S, 'viola', m1(seq(s, 0, 'A3:3 | ~D4:3 | ~D4:3 | ~E4:3 | A3:3 | ~B3:3 | r:3 | r:3 | D4:3 | ~D4:2.6 r:.4 | r:3 | F#4:3 | E4:3 | ~D#4:3 | C#4:3 | ~E4:3 | F#4:3 | ~G#4:3 | ~F#4:3 | E4:3 | F#4:3 | E4:3 | ~E4:2 ~D#4:1 | ~B3:3 | ~G#3:10')), d, { players: 2, pan: .26, gain: .80 });
  bow(S, 'bass', m1(seq(s, 11, 'B1:3 | E2:3 | ~G#1:3 | A1:3 | ~B1:3 | D#2:3 | C#2:3 | F#1:2 ~B1:1 | E2:3 | r:3 | r:3 | r:3 | r:3 | E2:10')), d, { pan: .04, gain: .62, att: .16, rel: 1.4 });
  return S.done({ fade: .8, gain: .50 });
};
J['ride.colour'] = id => {
  const s = 'ride', S = Stem(id, s, T(s, 9), T(s, 84), .62), rg = Rng(id);
  horns(S, seq(s, 11, 'B2+F#3:3 | E3+B3:3 | D#3+B3:3 | E3+A3:3 | E3+B3:3 | D#3+B3:3 | E3+C#4:3 | F#3+C#4:2 ~F#3+B3:1 | E3+B3:3'), curve([[11, .12], [11.95, .46], [12, .34], [14, .36], [15.9, .48], [16, .40], [17, .48], [18, .60], [19, .40], [20, .0]]), { gain: .17, att: .14, rel: .3 });
  for (const [x, m, v] of [[49, 90, .34], [52, 92, .38], [55, 93, .42], [57, 95, .44], [58, 92, .40]]) glock(S, T(s, x) + rg.g() * .004, m, v, rg);
  for (const [x, m, v] of [[61, 90, .26], [64, 92, .26], [67, 93, .26], [69, 92, .24], [70.5, 88, .18], [72, 64, .24], [72.14, 71, .22], [72.28, 76, .22], [72.42, 80, .22]]) celesta(S, T(s, x) + rg.g() * .006, m, v, rg, { pan: .24 });
  // the felt piano of NOW comes back for five notes: its line goes on at last, down into her two
  for (const [x, m, v, d] of [[63, 76, .30, 2.2], [65, 75, .27, 1.2], [66, 73, .29, 3.2], [69, 71, .34, 1.15], [70, 68, .32, 5]]) piano(S, T(s, x) + rg.g() * .008, m, v, rg, { dur: T(s, x + d) - T(s, x), rel: .2 });
  return S.done({ fade: .8, gain: .86 });
};
// ---------------------------------------------------------------- free ride: sixteen bars that close on themselves
function loop() {
  const bpm = 112, beat = 60 / bpm, nb = 16, len = Math.round(nb * 3 * beat * SR), s = 'loop', keep = CLOCK; CLOCK = x => x * beat;
  try {
    const S = Stem('loop', s, 0, nb * 3 * beat + 3.2, .4), rg = Rng('loop'), c16 = G_D.slice(4, 20);
    bassLine(S, s, [[0, 38, .58], [3, 43, .52], [6, 42, .50], [9, 33, .52], [11, 35, .36, 1], [12, 31, .58], [15, 35, .54], [18, 40, .52], [21, 33, .54], [23, 37, .40, 1], [24, 38, .60], [26, 40, .38, 1], [27, 42, .56], [30, 43, .58], [33, 33, .56], [35, 35, .40, 1], [36, 37, .62], [39, 35, .60], [41, 38, .40, 1], [42, 40, .60], [44, 33, .56, 1], [45, 38, .60], [47, 33, .40, 1]].map(e => [e[0] + .0, e[1], e[2], e[3]]), rg);
    for (let b = 0; b < 16; b++) pah(S, s, b, c16[b], b === 14 ? G_18b : c16[b], .40, rg, { pan: -.42 });
    for (let b = 0; b < 16; b++) { drum(S, T(s, b * 3) + .002, .26, rg, { f: 70 }); for (const q of [1, 2]) brush(S, T(s, b * 3 + q) + .02, q === 1 ? .16 : .12, rg, {}); }
    const mel = 'r:3 | r:3 | A5+F#5:1 F#5+D5:2 | r:1 A4:1 C#5:1 | r:3 | r:3 | B5+G5:1 G5+E5:2 | r:2 A4:1 | D5+F#4:1 C#5+E4:1 B4+D4:1 | A4+C#4:1 F#4:2 | G4+B3:1 A4+C#4:1 B4+D4:1 | A4+C#4:2 r:1 | r:3 | r:3 | F#5+A4:1 E5+G4:1 C#5+E4:1 | D5+F#4:2.6 r:.4';
    concertina(S, seq(s, 0, mel), curve([[0, .50], [8, .46], [12, .50], [16, .50]]), { bellows: [2, 4, 8, 10, 12, 14].map(b => T(s, b * 3) - .02), gain: .12 });
    clarinet(S, seq(s, 0, 'D4:1 ~F#4:1 ~A4:1 | B4:2 ~A4:1 | r:3 | r:3 | D4:1 ~G4:1 ~B4:1 | D5:2.6 r:.4 | r:3 | r:3 | r:3 | r:3 | r:3 | r:2 A4:.5 ~B4:.5 | C#5:2 B4:.5 ~C#5:.5 | D5:2 ~D5:1 | r:3 | r:3'), curve([[0, .50], [1, .58], [4, .52], [5, .60], [12, .58], [13, .62], [16, .5]]), { gain: .17 });
    const m1 = n => n.map(e => Object.assign(e, { m: e.ms[0] })), d = curve([[0, .20], [2, .24], [7, .28], [8, .36], [12, .44], [14, .54], [15, .44], [16, .20]]);
    bow(S, 'violin', m1(seq(s, 8, 'A4:2 ~B4:1 | C#5:3 | B4:1 /D5:2 | E5:2 ~D5:1 | C#5:1 /E5:2 | D5:1 /F#5:2 | E5:1 /G5:2 | A5:1 ~F#5:1.7 r:.3')), d, { seed: '1', players: 2, pan: -.36, gain: .8 });
    bow(S, 'viola', m1(seq(s, 0, 'A3:3 | ~B3:3 | ~A3:3 | ~G3:3 | B3:3 | ~B3:3 | ~B3:3 | ~C#4:3 | D4:3 | ~C#4:3 | B3:3 | ~D4:3 | E4:3 | ~F#4:3 | ~E4:3 | D4:2.8 r:.2')), d, { pan: .22, gain: .6 });
    bow(S, 'cello', m1(seq(s, 0, 'F#3:3 | ~G3:3 | ~F#3:3 | ~E3:3 | D3:3 | ~F#3:3 | ~E3:3 | ~E3:3 | F#3:3 | ~A3:3 | G3:2 ~F#3:1 | E3:3 | C#3:3 | B2:2 ~D3:1 | E3:2 A2:1 | D3:2.8 r:.2')), d, { pan: .40, gain: .7 });
    for (const [x, m, v] of [[6, 81, .22], [7, 78, .20], [18, 83, .22], [19, 79, .20], [45, 81, .24], [46, 78, .22]]) glock(S, T(s, x), m, v, rg);
    const st = S.done({ fade: 1.2, gain: .60 });
    // a small bright room, then the end folded onto the start so the seam is the music's own decay
    const n = st.L.length, N = SR * 1.7 | 0, r = Rng('room'), h = [0, 1, 2, 3].map(() => { const x = new Float32Array(N); let lp = 0, ns = r.i(); for (let i = 0; i < N; i++) { const t = i / SR; ns = Math.imul(ns, 1664525) + 1013904223 | 0; lp += (.50 * Math.exp(-t * 2.0) + .05) * (ns * 4.6566e-10 - lp); x[i] = lp * Math.exp(-t * 4.6) * smooth((t - .012) / .03) * smooth((1.7 - t) / .3); } let e = 0; for (const v of x) e += v * v; const g = .24 / Math.sqrt(e); for (let i = 0; i < N; i++) x[i] *= g; return x; });
    const WL = new Float32Array(n + N), WR = new Float32Array(n + N), hp = x => { const y = new Float32Array(n); let q = 0; const a = 1 - Math.exp(-TAU * 190 / SR); for (let i = 0; i < n; i++) { q += a * (x[i] - q); y[i] = x[i] - q; } return y; };
    conv2(hp(st.L), hp(st.R), [h[0], h[1]], [h[2], h[3]], WL, WR);
    const L = new Float32Array(len), R = new Float32Array(len); for (let i = 0; i < n + N; i++) { const j = i % len; L[j] += WL[i] + (i < n ? st.L[i] : 0); R[j] += WR[i] + (i < n ? st.R[i] : 0); }
    let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); const g = Math.min(1.6, .55 / pk); for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; }
    return { L, R, bars: nb, bpm, dur: len / SR };
  } finally { CLOCK = keep; }
}
// one held note of any instrument, dry but for its body (tests, and a look at each instrument by itself)
function probe(kind, m, o = {}) {
  const S = Stem('probe' + kind + m, 'x', 0, o.len || 3.5, .4), rg = Rng(kind + m), n = [{ ms: [m], m, x: 0, d: 3, t0: .25, t1: o.dur || 2.6, slur: false }], d = curve([[0, o.dyn || .5], [1, o.dyn || .5]]), v = o.vel || .5;
  if (BOWS[kind]) bow(S, kind, n, d, Object.assign({ players: 1 }, o)); else if (PLUCK[kind]) pluck(S, kind, .25, m, v, rg); else if (kind === 'piano') piano(S, .25, m, v, rg, { dur: 3 }); else if (kind === 'concertina') concertina(S, n, d, o); else if (kind === 'clarinet') clarinet(S, n, d, o); else if (kind === 'horns') horns(S, n, d, o); else if (kind === 'celesta') celesta(S, .25, m, v, rg); else if (kind === 'musicbox') musicbox(S, .25, m, v, rg); else if (kind === 'glock') glock(S, .25, m, v, rg); else if (kind === 'drum') drum(S, .25, v, rg, o); else if (kind === 'brush') brush(S, .25, v, rg, o);
  return S.done();
}
const COST = { 'ride.rhythm': .55, 'ride.low': .55, 'now.piano': .5, 'night.bowed': .45, 'ride.violins': .4, 'then.rhythm': .4, 'storm.low': .4, 'storm.high': .35, 'then.strings': .35, 'then.reeds': .33, 'ride.reeds': .3, 'now.strings': .25, 'night.plucked': .25, 'storm.force': .25, 'ride.colour': .25, 'dawn.bloom': .14, 'storm.hit': .07, 'catch.glass': .06 };      // seconds of CPU, for a scheduler
const cost = id => COST[id] || .2, jobs = () => Object.keys(J).sort((a, b) => cost(b) - cost(a));
function render(id) { if (!J[id]) throw new Error('BAND: no job ' + id); return J[id](id); }
return { jobs, cost, render, loop, probe, log: () => { LOG = []; for (const id of jobs()) render(id); const l = LOG; LOG = null; return l; }, dsp: { conv2, fwd, inv, body, Rng } };
})();
if (typeof module !== 'undefined') module.exports = BAND;
