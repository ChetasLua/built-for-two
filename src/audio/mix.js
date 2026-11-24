// ============================================================================
// mix.js - the rooms, the balance, the master.
//
//   MIX.master(stems, SR) -> { L, R, report }      the whole film (SCORE.DUR seconds, stereo)
//
// stems, in any order, missing ones are fine:
//   voice { id, who, t0, pcm }              ids found in SCORE.lines are brought to the level the score asks for; others (breaths) stay as they are
//   band  { id, lane:'band', sec, t0, L, R, send }
//   foley { id, t0, L, R, bus, send }       send = number 0..1 (default .2)
//
// Seven places, one after another, each a synthesized impulse response (four decorrelated noise tails, band by band decay,
// early reflections), convolved at half rate. A place hears only its own stretch of film, but its tail rings on into the next:
// that is how the hall of THEN keeps sounding over the empty NOW. Nothing saturates anywhere.
// ============================================================================
const MIX = (() => {
'use strict';
const SC = typeof SCORE !== 'undefined' ? SCORE : require('../01_score.js');
const TAU = Math.PI * 2, clamp = (x, a, b) => x < a ? a : x > b ? b : x, smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x), dB = x => Math.pow(10, x / 20), lin = x => 20 * Math.log10(x + 1e-12);
function Rng(a) { a |= 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// ---------------------------------------------------------------- FFT (radix-4 DIF / DIT, bit-reversed middle) and stereo-in stereo-out convolution
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
// xL,xR[i0..i1) * window -> room -> added into L,R at half rate
function convolve(xL, xR, i0, i1, win, h, L, R, gain) {
  const m = h[0].length, n = i1 - i0; let N = 1 << 15; while (N < m * 2.6) N <<= 1; if (n > 3 * N && N < 262144) N <<= 1;
  const hop = N - m, re = new Float64Array(N), im = new Float64Array(N), ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N), k = gain / N;
  for (let i = 0; i < m; i++) { ar[i] = h[0][i] * k; ai[i] = h[1][i] * k; br[i] = h[2][i] * k; bi[i] = h[3][i] * k; } fwd(ar, ai, N); fwd(br, bi, N);
  for (let p = 0; p < n; p += hop) {
    const e = Math.min(hop, n - p); let any = 0;
    for (let i = 0; i < e; i++) { const j = i0 + p + i, w = win ? win(p + i) : 1, a = xL[j] * w, b = xR[j] * w; re[i] = a; im[i] = b; any += a < 0 ? -a : a; any += b < 0 ? -b : b; }
    if (any < 1e-9) continue;
    for (let i = e; i < N; i++) { re[i] = 0; im[i] = 0; }
    fwd(re, im, N);
    const one = (P, Q) => {
      const zr = re[P], zi = im[P], wr = re[Q], wi = -im[Q], xr = (zr + wr) * .5, xi = (zi + wi) * .5, ur = (zi - wi) * .5, ui = (wr - zr) * .5;
      const a = ar[P], b = ai[P], c = br[P], d = bi[P], f = ar[Q], g = ai[Q], u = br[Q], v = bi[Q];
      re[P] = xr * a - xi * b + ur * c - ui * d; im[P] = xr * b + xi * a + ur * d + ui * c;
      if (Q !== P) { re[Q] = xr * f + xi * g + ur * u + ui * v; im[Q] = xr * g - xi * f + ur * v - ui * u; }
    };
    one(0, 0); for (let w = 1; w < N; w <<= 1) { const s = 3 * w - 1; for (let P = w; P <= s - P; P++) one(P, s - P); }
    inv(re, im, N);
    const o = i0 + p, lim = Math.min(N, L.length - o); for (let i = 0; i < lim; i++) { L[o + i] += re[i]; R[o + i] += im[i]; }
  }
}
// ---------------------------------------------------------------- rooms
// t60 at [<300, 300-1200, 1200-3600, >3600] Hz; col = colour of the tail in the same bands; pre, ramp = onset; er = [count, spread s, gain]; len s
const ROOMS = {
  then:  { t60: [2.1, 2.5, 1.9, 1.05], col: [.75, 1, .80, .42], pre: .020, ramp: .030, er: [12, .075, 1.6], len: 2.7, wet: .50, seed: 11 },
  ring:  { t60: [7.5, 11, 8.0, 2.8], col: [.45, 1, .75, .25], pre: .030, ramp: .12, er: [0, 0, 0], len: 9.0, wet: 1.12, seed: 12 },
  now:   { t60: [2.2, 3.4, 2.3, .9], col: [.35, 1, .60, .14], pre: .085, ramp: .16, er: [3, .12, .5], len: 3.6, wet: .32, seed: 13 },
  storm: { t60: [1.2, 1.3, .95, .55], col: [.7, 1, .75, .35], pre: .012, ramp: .020, er: [9, .05, 1.3], len: 1.5, wet: .32, seed: 14 },
  catch: { t60: [3.2, 2.8, 1.6, .7], col: [1, 1, .35, .08], pre: .010, ramp: .10, er: [0, 0, 0], len: 3.2, wet: .60, seed: 15 },
  night: { t60: [.8, 1.15, .95, .6], col: [.7, 1, .8, .4], pre: .006, ramp: .010, er: [10, .030, 1.4], len: 1.3, wet: .22, seed: 16 },
  dawn:  { t60: [.5, .8, .7, .45], col: [.5, 1, .9, .5], pre: .012, ramp: .012, er: [6, .04, 1.2], len: .9, wet: .11, seed: 17 },
  ghost: { t60: [3.4, 4.8, 4.0, 2.2], col: [.5, 1, .95, .55], pre: .070, ramp: .14, er: [0, 0, 0], len: 4.6, wet: .58, seed: 19 },
  ride:  { t60: [2.3, 2.9, 2.2, 1.2], col: [.70, 1, .85, .46], pre: .024, ramp: .034, er: [14, .085, 1.5], len: 3.2, wet: .52, seed: 18 },
};
function makeIR(o, sr) {
  const n = Math.ceil(o.len * sr), a1 = 1 - Math.exp(-TAU * 300 / sr), a2 = 1 - Math.exp(-TAU * 1200 / sr), a3 = 1 - Math.exp(-TAU * 3600 / sr), out = [], np = Math.round(o.pre * sr);
  for (let c = 0; c < 4; c++) {
    const r = Rng(o.seed * 1000 + c * 77 + 5), x = new Float64Array(n), same = c === 0 || c === 3, d = o.t60.map(t => Math.exp(-6.9078 / (t * sr))); let g0 = 1, g1 = 1, g2 = 1, g3 = 1, p = 0, q = 0, s = 0, e = 0;
    const tap = new Float64Array(n); for (let k = 0; k < o.er[0]; k++) { const u = (k + r()) / o.er[0], j = np + Math.round(Math.pow(u, 1.3) * o.er[1] * sr); if (j < n) tap[j] += (r() < .5 ? -1 : 1) * o.er[2] * (1 - .75 * u) * (same ? 1 : .6) * 7; }
    for (let i = np; i < n; i++) {
      const t = (i - np) / sr, w = (Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(TAU * r())) * smooth(t / o.ramp + .02) + tap[i];
      p += a1 * (w - p); q += a2 * (w - q); s += a3 * (w - s);
      const v = p * g0 * o.col[0] * 1.6 + (q - p) * g1 * o.col[1] * 1.3 + (s - q) * g2 * o.col[2] + (w - s) * g3 * o.col[3]; g0 *= d[0]; g1 *= d[1]; g2 *= d[2]; g3 *= d[3];
      const z = v * smooth((n - i) / (.3 * n)); x[i] = z; e += z * z;
    }
    const g = (same ? 1 : .72) / Math.sqrt(e * 1.5), y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = x[i] * g; out.push(y);
  }
  return out;      // [LL, LR, RL, RR]
}
// ---------------------------------------------------------------- small tools
function bq(kind, f, q, g, sr) {
  const w = TAU * f / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, (g || 0) / 40); let b, a;
  if (kind === 'lp') { b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]; } else if (kind === 'hp') { b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]; } else if (kind === 'pk') { b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]; }
  else { const sq = 2 * Math.sqrt(A) * al, k = kind === 'ls' ? 1 : -1; b = [A * (A + 1 - k * (A - 1) * c + sq), k * 2 * A * (A - 1 - k * (A + 1) * c), A * (A + 1 - k * (A - 1) * c - sq)]; a = [A + 1 + k * (A - 1) * c + sq, -k * 2 * (A - 1 + k * (A + 1) * c), A + 1 + k * (A - 1) * c - sq]; }
  return [b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]];
}
function filt(x, k, i0 = 0, i1 = x.length) { const [b0, b1, b2, a1, a2] = k; let z1 = 0, z2 = 0; for (let i = i0; i < i1; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; x[i] = y; } return x; }
function kCoefs(sr) { let K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = .7071752369554196, Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, .4996667741545416), a0 = 1 + K / Q + K * K; const s1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]; K = Math.tan(Math.PI * 38.13547087602444 / sr); Q = .5003270373238773; a0 = 1 + K / Q + K * K; return [s1, [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]]; }
// K-weighted energy per 100 ms
function kEnergy(chs, sr) {
  const [s1, s2] = kCoefs(sr), hop = Math.round(sr / 10), n = Math.floor(chs[0].length / hop), E = new Float64Array(n);
  for (const x of chs) { let a = 0, b = 0, c = 0, d = 0; const [b0, b1, b2, a1, a2] = s1, p1 = s2[3], p2 = s2[4]; for (let k = 0, i = 0; k < n; k++) { let e = 0; for (let j = 0; j < hop; j++, i++) { const v = x[i], y = b0 * v + a; a = b1 * v - a1 * y + b; b = b2 * v - a2 * y; const z = y + c; c = -2 * y - p1 * z + d; d = y - p2 * z; e += z * z; } E[k] += e / hop; } }
  return E;
}
const LK = e => -.691 + 10 * Math.log10(e + 1e-12);
function integrated(E) { const g = []; for (let i = 0; i + 4 <= E.length; i++) { const z = (E[i] + E[i + 1] + E[i + 2] + E[i + 3]) / 4; if (LK(z) > -70) g.push(z); } if (!g.length) return -99; const th = LK(g.reduce((a, b) => a + b) / g.length) - 10, h = g.filter(z => LK(z) > th); return LK(h.reduce((a, b) => a + b) / h.length); }
// half-band FIR, both directions
const HB = (() => { const h = []; for (let k = 1; k <= 19; k += 2) h.push(Math.sin(Math.PI * k / 2) / (Math.PI * k) * (.5 + .5 * Math.cos(Math.PI * k / 20.5))); let s = 0; for (const v of h) s += 2 * v; return h.map(v => v * .5 / s); })();
function halve(x) { const n = x.length >> 1, y = new Float32Array(n), N = x.length, [h0, h1, h2, h3, h4, h5, h6, h7, h8, h9] = HB; for (let i = 10; i < n - 10; i++) { const j = 2 * i; y[i] = .5 * x[j] + h0 * (x[j - 1] + x[j + 1]) + h1 * (x[j - 3] + x[j + 3]) + h2 * (x[j - 5] + x[j + 5]) + h3 * (x[j - 7] + x[j + 7]) + h4 * (x[j - 9] + x[j + 9]) + h5 * (x[j - 11] + x[j + 11]) + h6 * (x[j - 13] + x[j + 13]) + h7 * (x[j - 15] + x[j + 15]) + h8 * (x[j - 17] + x[j + 17]) + h9 * (x[j - 19] + x[j + 19]); } return y; }
function doubleInto(x, out) { const n = x.length, [h0, h1, h2, h3, h4, h5, h6, h7, h8, h9] = HB.map(v => v * 2); for (let i = 10; i < n - 11; i++) { out[2 * i] += x[i]; out[2 * i + 1] += h0 * (x[i] + x[i + 1]) + h1 * (x[i - 1] + x[i + 2]) + h2 * (x[i - 2] + x[i + 3]) + h3 * (x[i - 3] + x[i + 4]) + h4 * (x[i - 4] + x[i + 5]) + h5 * (x[i - 5] + x[i + 6]) + h6 * (x[i - 6] + x[i + 7]) + h7 * (x[i - 7] + x[i + 8]) + h8 * (x[i - 8] + x[i + 9]) + h9 * (x[i - 9] + x[i + 10]); } }
// ---------------------------------------------------------------- balance
// how loud a line should sit (LUFS while singing). The score's dyn decides; the chick and the ghost have their own ideas
const LINE = { t1a: -18.5, t2a: -18, t3h: -20.5, t4h: -20, c0: -28, c00: -21.5, r1a: -17.2, r2a: -17.6, r5h: -24, r5c: -20 };
const lineLufs = l => (LINE[l.id] !== undefined ? LINE[l.id] : Math.min(-13.8, -16.2 + .80 * (l.feel.dyn || 0))) - ({ then: 1.8, storm: 1.2, night: 4.6 }[l.sec] || 0);
const SEND = { then: .55, now: .42, storm: .40, night: .30, dawn: .30, ride: .50 };
const BAND = { gain: 1 / .60, trim: { 'storm.hit': 1.5 }, sec: { then: -1.6, storm: -1.0, night: -1.2, ride: .3 }, duck: { then: 2.4, now: 2.4, storm: 3.0, night: 1.2, ride: 3.0, dawn: 2.6 }, mid: { then: 4.8, now: 2.0, storm: 4.0, night: .8, ride: 6.0, dawn: 3.0 } };      // under a voice: everything a little, the words' octaves (450-3600 Hz) more
const FOLEY = { duck: 3.0, db: { then: [1, 2], now: [3.5, 4], storm: [4, 4.5], catch: [0, 0], night: [0, 1], dawn: [8, 4], ride: [3, 2] } };      // [beds, events] dB per place
function secAt(t) { const M = SC.TIME, s = SC.sec; return t < M.matchCut ? 'then' : t < s.storm.t0 - .2 ? 'now' : t < M.wave ? 'storm' : t < M.nightIn ? 'catch' : t < M.nightEnd + .4 ? 'night' : t < M.answer + 1 ? 'dawn' : 'ride'; }
// ---------------------------------------------------------------- one sung line
function singer(st, line, sr) {
  const x = Float32Array.from(st.pcm), n = x.length, who = st.who || line.who, sec = line.sec;
  filt(x, bq('hp', who === 'he' ? 72 : who === 'chick' ? 320 : 130, .7, 0, sr));
  if (who === 'he') { filt(x, bq('pk', 260, .8, sec === 'night' ? 1.5 : -1.5, sr)); filt(x, bq('pk', 2700, .8, sec === 'storm' ? 2.6 : sec === 'night' ? -1 : 1.4, sr)); } else if (who === 'she') { filt(x, bq('pk', 420, .8, -1.2, sr)); filt(x, bq('pk', 3000, .8, 1.0, sr)); } else filt(x, bq('pk', 3400, .8, -1.5, sr));
  filt(x, bq('hs', 4200, .7, who === 'he' ? 3.4 : who === 'she' ? 1.8 : 0, sr)); filt(x, bq('hs', 9500, .7, -1.5, sr));
  // loudness of what is actually sung
  const k = Float32Array.from(x), [s1, s2] = kCoefs(sr); filt(k, s1); filt(k, s2); const hop = Math.round(sr * .02), E = []; for (let i = 0; i + hop <= n; i += hop) { let e = 0; for (let j = i; j < i + hop; j++) e += k[j] * k[j]; E.push(e / hop); } const mx = Math.max(...E, 1e-12), act = E.filter(e => e > mx * .003); const l = LK(act.reduce((a, b) => a + b, 0) / Math.max(1, act.length)), g0 = dB(lineLufs(line) - l);
  // slow 2:1 above its own average, de-ess above 4.8 kHz
  const B = 32, nb = Math.ceil(n / B), aL = 1 - Math.exp(-TAU * 4800 / sr); let env = 0, lp = 0, lp2 = 0, es = 0, g = 0, eg = 1, gp = g0, ep = 1; const out = new Float32Array(n), ref = mx > 0 ? 10 * Math.log10(act.reduce((a, b) => a + b, 0) / Math.max(1, act.length) + 1e-12) : -60;
  for (let b = 0; b < nb; b++) {
    const i0 = b * B, i1 = Math.min(n, i0 + B); let e = 0, h = 0; for (let i = i0; i < i1; i++) { const v = x[i]; e += v * v; lp += aL * (v - lp); lp2 += aL * (lp - lp2); const q = v - lp2; h += q * q; } e /= B; h /= B;
    env += (e > env ? .05 : .004) * (e - env); es += (h > es ? .30 : .02) * (h - es);
    const over = 10 * Math.log10(env + 1e-12) - (ref + 1.5), red = over > 0 ? -over * .5 : 0; g += (red < g ? .05 : .008) * (red - g);
    const sib = 10 * Math.log10((es + 1e-12) / (env + 1e-9)), dg = dB(-clamp((sib + 11) * .6, 0, 8)); eg += (dg < eg ? .4 : .05) * (dg - eg);
    const gn = g0 * dB(g + 1.0); for (let i = i0; i < i1; i++) { const u = (i - i0) / B; out[i] = x[i] * (gp + (gn - gp) * u); } gp = gn;
    ep = eg; if (eg < .995) { let a = lp, c = lp2; for (let i = i0; i < i1; i++) { a += aL * (out[i] - a); c += aL * (a - c); out[i] = c + (out[i] - c) * ep; } }
  }
  for (let i = 0; i < 200 && i < n; i++) { out[i] *= i / 200; out[n - 1 - i] *= i / 200; }
  return out;
}
// ---------------------------------------------------------------- the film
function master(stems, SR = 44100, opt = {}) {
  const N = Math.round(SC.DUR * SR), M = SC.TIME, ms = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t00 = ms(), rep = { t: {} }, mark = k => { rep.t[k] = Math.round(ms() - t00); };
  const L = new Float32Array(N), R = new Float32Array(N), sL = new Float32Array(N), sR = new Float32Array(N), V = new Float32Array(N);
  const isV = s => !!s.pcm, isB = s => !isV(s) && (s.lane === 'band' || s.send !== undefined && s.sec !== undefined && s.bus === undefined);
  // voices first: everyone else listens to them
  const vdry = [], CH = opt.gains || {};
  for (const st of stems) if (isV(st)) {
    const line = SC.lines.find(l => l.id === st.id), o = Math.round(st.t0 * SR); let y;
    if (line) y = singer(st, line, SR); else { y = Float32Array.from(st.pcm); for (let i = 0; i < 100 && i < y.length; i++) { y[i] *= i / 100; y[y.length - 1 - i] *= i / 100; } }
    const ghost = line && line.feel && line.feel.ghost, sec = line ? line.sec : secAt(st.t0), dry = ghost ? .13 : 1, wet = ghost ? .25 : (SEND[sec] || .3) * (st.who === 'chick' ? .8 : 1); vdry.push({ y, o, dry, wet, ghost });
    if (!ghost) for (let i = Math.max(0, -o), e = Math.min(y.length, N - o); i < e; i++) V[o + i] += y[i];
  }
  // what the singers leave for the rest: duck at 100 Hz, looking 60 ms ahead
  const CB = Math.round(SR / 100), NC = Math.ceil(N / CB), duck = new Float32Array(NC + 8); { let e = 0; for (let c = 0; c < NC; c++) { let s = 0; const i1 = Math.min(N, (c + 1) * CB); for (let i = c * CB; i < i1; i++) s += V[i] * V[i]; const a = smooth((10 * Math.log10(s / CB + 1e-12) + 46) / 14); e += (a > e ? .16 : .028) * (a - e); duck[c] = e; } for (let c = 0; c < NC; c++) duck[c] = duck[Math.min(NC - 1, c + 6)]; }
  const dk = (db, o, n) => { const g = new Float32Array(Math.ceil(n / CB) + 2); for (let k = 0; k < g.length; k++) { const c = clamp(Math.floor(o / CB) + k, 0, NC - 1); g[k] = dB(-db * duck[c]); } return g; };
  mark('voice');
  if (opt.solo && opt.solo !== 'voice') vdry.length = 0;
  const glass = [];
  for (const st of stems) {
    if (isV(st) || opt.solo && opt.solo !== (isB(st) ? 'band' : 'foley')) continue;
    if (st.sec === 'catch') { glass.push(st); continue; }
    const band = isB(st), o = Math.round(st.t0 * SR), n = st.L.length, sec = st.sec || secAt(st.t0), g = dk(band ? BAND.duck[sec] || 0 : FOLEY.duck, o, n), gm = dk(band ? BAND.mid[sec] || 0 : 0, o, n), a3 = 1 - Math.exp(-TAU * 3600 / SR), a4 = 1 - Math.exp(-TAU * 450 / SR), where = FOLEY.db[String(st.id).split('.')[1]] || FOLEY.db[secAt(st.t0 + .4)], G = (CH[st.id] !== undefined ? CH[st.id] : 1) * (band ? BAND.gain * dB(BAND.sec[sec] || 0) * (BAND.trim[st.id] || 1) : dB(where[st.bus === 'amb' ? 0 : 1]));
    const send = typeof st.send === 'number' ? st.send : band ? .4 : .2; const SL = st.L, SRr = st.R, q16 = st.q || 1;   // stems may arrive as 16-bit with their own scale q
    let p = 0, q = 0, u = 0, w = 0;
    for (let i = Math.max(0, -o), e = Math.min(n, N - o); i < e;) {
      const c = Math.floor(i / CB), e2 = Math.min(e, (c + 1) * CB), g0 = g[c] * G * q16, dg = (g[c + 1] - g[c]) * G * q16 / CB; let k = g0 + dg * (i - c * CB), m = 1 - gm[c], dm = (gm[c] - gm[c + 1]) / CB;
      if (!band) for (; i < e2; i++, k += dg) { const a = SL[i] * k, b = SRr[i] * k, j = o + i; L[j] += a; R[j] += b; sL[j] += a * send; sR[j] += b * send; }
      else for (; i < e2; i++, k += dg, m += dm) { let a = SL[i], b = SRr[i]; p += a3 * (a - p); q += a4 * (a - q); u += a3 * (b - u); w += a4 * (b - w); a = (a - m * (p - q)) * k; b = (b - m * (u - w)) * k; const j = o + i; L[j] += a; R[j] += b; sL[j] += a * send; sR[j] += b * send; }
    }
    if (opt.free) st.L = st.R = null;
  }
  for (const v of vdry) for (let i = Math.max(0, -v.o), e = Math.min(v.y.length, N - v.o); i < e; i++) { const a = v.y[i], j = v.o + i; L[j] += a * v.dry * .7071; R[j] += a * v.dry * .7071; sL[j] += a * v.wet * .7071; sR[j] += a * v.wet * .7071; }
  mark('sum');
  // the wave: the world goes under water, and comes back with the dark
  { const i0 = Math.round(M.wave * SR), i1 = Math.round((M.nightIn + .6) * SR), a = [0, 0, 0, 0]; let fc = 16000;
    for (let b = i0; b < i1; b += 32) {
      const t = b / SR, u = t - M.wave, f = u < .45 ? 15000 * Math.pow(420 / 15000, smooth(u / .45)) : t < M.catch_ ? 420 + 160 * smooth((t - M.wave - 1) / 3) : t < M.black ? 580 + 900 * smooth((t - M.catch_) / 1.6) : t < M.nightIn ? 1480 * Math.pow(340 / 1480, smooth((t - M.black) / .15)) : 340 * Math.pow(16000 / 340, smooth((t - M.nightIn) / .45)); fc = f;
      const gg = Math.tan(Math.PI * Math.min(fc, 17000) / SR), k = 1.2, a1 = 1 / (1 + gg * (gg + k)), a2 = gg * a1, a3 = gg * a2, e = Math.min(i1, b + 32);
      for (let c = 0; c < 2; c++) { const X = c ? R : L, S = c ? sR : sL; let p = a[c * 2], q = a[c * 2 + 1]; for (let i = b; i < e; i++) { const v3 = X[i] - q, v1 = a1 * p + a2 * v3, v2 = q + a2 * p + a3 * v3; p = 2 * v1 - p; q = 2 * v2 - q; X[i] = v2; S[i] *= fc > 4000 ? 1 : .5 + .5 * fc / 4000; } a[c * 2] = p; a[c * 2 + 1] = q; }
    } }
  for (const st of glass) { const o = Math.round(st.t0 * SR); for (let i = 0, e = Math.min(st.L.length, N - o); i < e; i++) { const a = st.L[i] * BAND.gain * (st.q || 1), b = st.R[i] * BAND.gain * (st.q || 1); L[o + i] += a; R[o + i] += b; sL[o + i] += a * st.send; sR[o + i] += b * st.send; } }
  mark('water');
  // rooms, at half rate
  for (const x of [sL, sR]) { let q = 0, p = 0; const a = 1 - Math.exp(-TAU * 150 / SR); for (let i = 0; i < N; i++) { q += a * (x[i] - q); const y = x[i] - q; p += a * (y - p); x[i] = y - p; } }
  const hL = halve(sL), hR = halve(sR), n2 = hL.length, sr = SR / 2, wL = new Float32Array(n2 + 16), wR = new Float32Array(n2 + 16), ix = t => clamp(Math.round(t * sr), 0, n2);
  const st0 = SC.sec.storm.t0 - .2, dw = M.nightEnd + .4, rd = M.answer + 1;
  const PLACE = [['then', 0, M.matchCut, 0, .004], ['now', M.matchCut, st0, .004, .6], ['storm', st0, M.wave, .6, .006], ['catch', M.wave, M.nightIn, .006, .2], ['night', M.nightIn, dw, .2, .5], ['dawn', dw, rd, .5, .4], ['ride', rd, SC.DUR, .4, .01]];
  for (const [k, a, b, fi, fo] of PLACE) {
    const i0 = ix(a - fi / 2), i1 = ix(b + fo / 2), n = i1 - i0, fin = Math.max(1, fi * sr), fon = Math.max(1, fo * sr), win = i => (i < fin ? smooth(i / fin) : 1) * (n - i < fon ? smooth((n - i) / fon) : 1), o = ROOMS[k];
    if (k === 'storm') { // its tail must not survive the wave
      const tL = new Float32Array(n2), tR = new Float32Array(n2); convolve(hL, hR, i0, i1, win, makeIR(o, sr), tL, tR, o.wet); const c = ix(M.wave); for (let i = i0; i < n2 && i < c + 3 * sr; i++) { const g = i < c ? 1 : Math.exp(-(i - c) / (.10 * sr)); wL[i] += tL[i] * g; wR[i] += tR[i] * g; }
    } else convolve(hL, hR, i0, i1, win, makeIR(o, sr), wL, wR, o.wet);
  }
  // the hall that keeps ringing after the cut: it only opens during the last two bars
  { const T = SC.T, a = T('then', 17, 2), b = M.matchCut, i0 = ix(a), i1 = ix(b), n = i1 - i0, o = ROOMS.ring; convolve(hL, hR, i0, i1, i => Math.pow(i / n, 2.0) * (n - i < 80 ? (n - i) / 80 : 1), makeIR(o, sr), wL, wR, o.wet); }
  // her voice at the end stands in a place of its own
  for (const v of vdry) if (v.ghost) { const o = ROOMS.ghost, m = v.y.length >> 1, x = new Float32Array(m), j0 = Math.max(0, Math.round(v.o / 2)), gL = new Float32Array(n2 - j0), gR = new Float32Array(n2 - j0); let q = 0; for (let i = 0; i < m; i++) { const a = .5 * v.y[2 * i] + .25 * ((v.y[2 * i - 1] || 0) + (v.y[2 * i + 1] || 0)); q += .05 * (a - q); x[i] = (a - q) * .7071; } convolve(x, x, 0, m, null, makeIR(o, sr), gL, gR, o.wet); for (let i = 0; i < gL.length; i++) { wL[j0 + i] += gL[i]; wR[j0 + i] += gR[i]; } }
  mark('rooms');
  doubleInto(wL, L); doubleInto(wR, R);
  // ---- master: infrasonic off, slow glue, level, true peak
  for (const x of [L, R]) { filt(x, bq('hp', 26, .65, 0, SR)); filt(x, bq('hs', 5600, .6, 2.6, SR)); }
  if (opt.solo) { const k = opt.gain || 1; for (const x of [L, R]) for (let i = 0; i < N; i++) x[i] *= k; rep.E = kEnergy([L, R], SR); return { L, R, report: rep }; }
  const E0 = kEnergy([L, R], SR), l0 = integrated(E0); let pre = l0 < -60 ? 1 : dB(-16 - l0); rep.pre = pre;
  { const hop = Math.round(SR / 10), g = new Float64Array(E0.length + 2); let y = 0, e = 0; for (let k = 0; k < E0.length; k++) { const v = E0[k] * pre * pre; e += (v > e ? .55 : .16) * (v - e); const over = LK(e) + 15.5, red = over > 0 ? -Math.min(4, over * .42) : 0; y += (red < y ? .5 : .14) * (red - y); g[k] = dB(y); } g[E0.length] = g[E0.length - 1]; g[E0.length + 1] = g[E0.length]; rep.glueMax = +Math.min(...g).toFixed(3);
    for (const x of [L, R]) for (let i = 0; i < N; i++) { const p = i / hop, k = p | 0, f = p - k, a = g[Math.min(k, g.length - 1)], b = g[Math.min(k + 1, g.length - 1)]; x[i] *= pre * (a + (b - a) * f); } }
  const tail = Math.round(1.5 * SR); for (let i = 0; i < tail; i++) { const g = smooth(i / tail); L[N - 1 - i] *= g; R[N - 1 - i] *= g; }
  const lim = dB(-1.5); const l1 = integrated(kEnergy([L, R], SR)), tr = l1 < -60 ? 1 : dB(-16 - l1);
  for (const x of [L, R]) for (let i = 0; i < N; i++) x[i] *= tr;
  mark('glue');
  { const B = 16, nb = Math.ceil(N / B), W = 14, need = new Float32Array(nb + W + 2).fill(1); let worst = 1;
    for (let b = 0; b < nb; b++) { let p = 0; const i1 = Math.min(N, b * B + B); for (let i = b * B; i < i1; i++) { const a = L[i] < 0 ? -L[i] : L[i], c = R[i] < 0 ? -R[i] : R[i]; if (a > p) p = a; if (c > p) p = c; } p *= 1.03; if (p > lim) { need[b] = lim / p; if (need[b] < worst) worst = need[b]; } }
    const m = new Float32Array(nb + W + 2); let y = 1; for (let b = 0; b < nb; b++) { let q = 1; for (let k = 0; k <= W; k++) if (need[b + k] < q) q = need[b + k]; y = q < y ? q : y + .0030 * (q - y); m[b] = y; } for (let b = nb; b < m.length; b++) m[b] = 1;
    let s = 0; const ring = new Float32Array(W).fill(1); s = W; let gp = 1; for (let b = 0; b < nb; b++) { s += m[b] - ring[b % W]; ring[b % W] = m[b]; const gn = Math.min(1, s / W), i0 = b * B, i1 = Math.min(N, i0 + B), d = (gn - gp) / B; if (gn < .99999 || gp < .99999) { let k = gp; for (let i = i0; i < i1; i++) { k += d; L[i] *= k; R[i] *= k; } } gp = gn; }
    rep.limiterDb = +lin(worst).toFixed(2); }
  mark('limit');
  if (opt.report !== false) { const E = kEnergy([L, R], SR); rep.lufs = +integrated(E).toFixed(2); rep.E = E; rep.tp = +lin(Math.max(truePeak(L), truePeak(R))).toFixed(2); if (rep.tp > -1.2) { const k = dB(-1.25 - rep.tp); for (const x of [L, R]) for (let i = 0; i < N; i++) x[i] *= k; rep.lufs = +(rep.lufs + lin(k)).toFixed(2); rep.tp = -1.25; } }
  mark('end');
  return { L, R, report: rep };
}
const OS = []; for (let p = 1; p < 4; p++) { const t = p / 4, c = new Float64Array(24); for (let k = -11; k < 13; k++) { const u = t - k; c[k + 11] = Math.sin(Math.PI * u) / (Math.PI * u) * (.5 + .5 * Math.cos(Math.PI * u / 12.5)); } OS.push(c); }
function truePeak(x) { let pk = 0; const n = x.length; for (let i = 0; i < n; i++) { const a = x[i] < 0 ? -x[i] : x[i]; if (a > pk) pk = a; } const th = pk * .75; let best = pk; for (let i = 12; i < n - 13; i++) { const v = x[i]; if (v > th || v < -th) for (let p = 0; p < 3; p++) { const c = OS[p]; let s = 0; for (let k = 0; k < 24; k++) s += x[i - 11 + k] * c[k]; if (s < 0) s = -s; if (s > best) best = s; } } return best; }
return { master, ROOMS, makeIR, kEnergy, integrated, truePeak, secAt };
})();
if (typeof module !== 'undefined') module.exports = MIX;
