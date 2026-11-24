// ============================================================================
// foley.js - every sound that is not sung or played: the tandem, the bell, sea,
// air, storm, wave, egg, shell, wings. Pure typed-array DSP, no samples.
//   FOLEY.jobs()            -> ids (independent, may run in parallel)
//   FOLEY.render(id)        -> { id, t0, L, R, bus:'amb'|'fx', send:0..1 }
//   FOLEY.oneshot(kind,seed)-> { L, R }  live: bell splash plink ruffle hop gust pop shelltap ...
//   FOLEY.marks             -> event times for the picture (thunder, slaps, beam, splashes, taps ...)
//   FOLEY.wind(t)           -> m/s, the one wind that moves scarf, spokes and air together
// Every time is a function of SCORE; no film seconds are typed in here.
// ============================================================================
const FOLEY = (() => {
'use strict';
const S = typeof SCORE !== 'undefined' ? SCORE : require('../01_score.js');
const SR = 44100, TAU = Math.PI * 2, PI = Math.PI;
const dB = x => Math.pow(10, x / 20);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const ss = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, k) => a + (b - a) * k;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const cents = c => Math.pow(2, c / 1200);
// bell curve bump: 0 outside, 1 at the centre
const bump = (c, w, x) => { const u = Math.abs(x - c) / w; return u >= 1 ? 0 : .5 + .5 * Math.cos(PI * u); };
// piecewise-linear table [[x, y], ...]
const lin = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x < tab[i][0]) { const a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return tab[tab.length - 1][1];
};
// ---------- seeded randomness ----------------------------------------------
const hash = x => { x = Math.imul((x | 0) ^ 0x9E3779B9, 0x85EBCA6B); x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16; return x | 0 || 1; };
function RNG(seed) {
  let s = hash(seed);
  const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) * 2.3283064365386963e-10; };
  r(); r(); r();
  r.bi = () => r() * 2 - 1;
  r.in = (a, b) => a + (b - a) * r();
  r.exp = () => -Math.log(1 - r() * .99999);
  r.pick = a => a[Math.min(a.length - 1, r() * a.length | 0)];
  r.int = () => (r() * 4294967295) | 0 || 1;
  return r;
}
// C1 value noise on the unit lattice, -1..1
function smooth(seed) {
  const h = k => hash(Math.imul(k, 0x27D4EB2F) ^ seed) * 4.656612873077393e-10;
  return x => { const k = Math.floor(x), f = x - k, u = f * f * (3 - 2 * f); return h(k) * (1 - u) + h(k + 1) * u; };
}
// ---------- buffers ---------------------------------------------------------
function Out(t0, t1) { const n = Math.max(64, Math.ceil((t1 - t0) * SR)); return { t0, n, L: new Float32Array(n), R: new Float32Array(n) }; }
// mono grain at film time t, peak gain g, equal-power pan -1..1
function put(o, m, t, g, pan = 0) {
  const i = Math.round((t - o.t0) * SR), a = (clamp(pan, -1, 1) + 1) * .25 * PI, gl = g * Math.cos(a), gr = g * Math.sin(a);
  const k1 = Math.min(m.length, o.n - i), L = o.L, R = o.R;
  for (let k = i < 0 ? -i : 0; k < k1; k++) { const v = m[k]; L[i + k] += v * gl; R[i + k] += v * gr; }
}
function putSt(o, s, t, g) {
  const i = Math.round((t - o.t0) * SR), k1 = Math.min(s.L.length, o.n - i);
  for (let k = i < 0 ? -i : 0; k < k1; k++) { o.L[i + k] += s.L[k] * g; o.R[i + k] += s.R[k] * g; }
}
// grain whose gain and pan move: gf(u), pf(u) over the grain
function putPath(o, m, t, gf, pf) {
  const i = Math.round((t - o.t0) * SR), n = m.length, B = 64;
  for (let b = 0; b < n; b += B) {
    const u0 = b / n, u1 = Math.min(1, (b + B) / n), a0 = (clamp(pf(u0), -1, 1) + 1) * .25 * PI, a1 = (clamp(pf(u1), -1, 1) + 1) * .25 * PI, g0 = gf(u0), g1 = gf(u1);
    const l0 = g0 * Math.cos(a0), l1 = g1 * Math.cos(a1), r0 = g0 * Math.sin(a0), r1 = g1 * Math.sin(a1);
    for (let k = b; k < Math.min(n, b + B); k++) { const j = i + k; if (j < 0 || j >= o.n) continue; const x = (k - b) / B; o.L[j] += m[k] * (l0 + (l1 - l0) * x); o.R[j] += m[k] * (r0 + (r1 - r0) * x); }
  }
}
function norm(m, p = 1) { let k = 0; for (let i = 0; i < m.length; i++) { const a = m[i] < 0 ? -m[i] : m[i]; if (a > k) k = a; } if (k > 0) { k = p / k; for (let i = 0; i < m.length; i++) m[i] *= k; } return m; }
function add(a, b, at, g) { const i = Math.round(at * SR), e = Math.min(b.length, a.length - i); for (let k = Math.max(0, -i); k < e; k++) a[i + k] += b[k] * g; return a; }
const zeros = d => new Float32Array(Math.max(8, d * SR | 0));
// two one-pole low-passes = distance / muffling
function far(m, fc) { const k = 1 - Math.exp(-TAU * fc / SR); let a = 0, b = 0; for (let i = 0; i < m.length; i++) { a += (m[i] - a) * k; b += (a - b) * k; m[i] = b; } return m; }
function fadeEnds(m, a, b) { const n = m.length, i1 = Math.min(n, a * SR | 0), i2 = Math.min(n, b * SR | 0); for (let i = 0; i < i1; i++) m[i] *= .5 - .5 * Math.cos(PI * i / i1); for (let i = 0; i < i2; i++) m[n - 1 - i] *= .5 - .5 * Math.cos(PI * i / i2); return m; }
// time-varying 12 dB/oct low-pass over a whole stem, fc(t)
function sweepLP(o, t0, t1, fc) {
  const i0 = Math.max(0, Math.round((t0 - o.t0) * SR)), i1 = Math.min(o.n, Math.round((t1 - o.t0) * SR)), B = 64;
  for (const X of [o.L, o.R]) {
    let a = X[i0] || 0, b = a; const xf = 3000;
    for (let i = i0; i < i1; i += B) {
      const k = 1 - Math.exp(-TAU * Math.min(14000, fc(o.t0 + i / SR)) / SR), e = Math.min(i1, i + B);
      for (let j = i; j < e; j++) { a += (X[j] - a) * k; b += (a - b) * k; const w = j - i0; X[j] = w < xf ? X[j] + (b - X[j]) * w / xf : b; }
    }
  }
  return o;
}
function gain(o, t0, t1, g) { const i0 = Math.max(0, Math.round((t0 - o.t0) * SR)), i1 = Math.min(o.n, Math.round((t1 - o.t0) * SR)), B = 64; let g0 = g(t0); for (let i = i0; i < i1; i += B) { const e = Math.min(i1, i + B), g1 = g(o.t0 + e / SR); for (let j = i; j < e; j++) { const x = g0 + (g1 - g0) * (j - i) / B; o.L[j] *= x; o.R[j] *= x; } g0 = g1; } }
function peakTo(o, p) { let k = 0; for (const X of [o.L, o.R]) for (let i = 0; i < o.n; i++) { const a = X[i] < 0 ? -X[i] : X[i]; if (a > k) k = a; } if (k) { k = p / k; for (const X of [o.L, o.R]) for (let i = 0; i < o.n; i++) X[i] *= k; } return o; }
// look-ahead gain ride: keeps peaks under c by moving the level, never by bending the wave
function ride(o, c, K = 20) {
  const B = 64, nb = Math.ceil(o.n / B), g = new Float32Array(nb + 1), h = new Float32Array(nb + 1);
  for (let b = 0; b < nb; b++) { let k = 1e-9; for (let i = b * B; i < Math.min(o.n, (b + 1) * B); i++) { const a = Math.max(Math.abs(o.L[i]), Math.abs(o.R[i])); if (a > k) k = a; } g[b] = Math.min(1, c / k); } g[nb] = 1;
  for (let b = 0; b <= nb; b++) { let m = 1; for (let j = Math.max(0, b - K); j <= Math.min(nb, b + K + 1); j++) if (g[j] < m) m = g[j]; h[b] = m; }
  for (let b = 0; b <= nb; b++) { let a = 0, w = 0; for (let j = -K; j <= K; j++) { const i = b + j; if (i >= 0 && i <= nb) { const k = .5 + .5 * Math.cos(PI * j / (K + 1)); a += h[i] * k; w += k; } } g[b] = a / w; }
  for (let b = 0; b < nb; b++) for (let i = b * B; i < Math.min(o.n, (b + 1) * B); i++) { const x = g[b] + (g[b + 1] - g[b]) * (i - b * B) / B; o.L[i] *= x; o.R[i] *= x; }
  return o;
}
function finish(o, fi = .02, fo = .05) {
  const c = Math.exp(-TAU * 18 / SR);
  for (const X of [o.L, o.R]) { let x1 = 0, y1 = 0; for (let i = 0; i < o.n; i++) { const x = X[i]; y1 = x - x1 + c * y1; x1 = x; X[i] = y1; } fadeEnds(X, fi, fo); }
  return o;
}
// ---------- physics kit ------------------------------------------------------
// struck object: modes [f, T60, amp] driven by a Hertz contact pulse (longer = softer mallet)
function strike(modes, contact, dur) {
  const n = dur * SR | 0, y = new Float32Array(n), c = Math.max(3, contact * SR | 0), x = new Float64Array(c); let sum = 0;
  for (let i = 0; i < c; i++) { x[i] = Math.pow(Math.sin(PI * (i + .5) / c), 1.6); sum += x[i]; }
  for (let i = 0; i < c; i++) x[i] /= sum;
  for (const [f, t60, a] of modes) {
    const w = TAU * f / SR, q = Math.pow(10, -3 / (t60 * SR)), k = 2 * q * Math.cos(w), q2 = q * q, g = a * Math.sin(w), m = Math.min(n, Math.ceil(t60 * 1.7 * SR) + c);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < m; i++) { const v = k * y1 - q2 * y2 + (i < c ? x[i] * g : 0); y[i] += v; y2 = y1; y1 = v; }
  }
  return fadeEnds(y, 0, Math.min(.02, dur * .3));
}
// Minnaert bubble, radius in metres: f = 3/r, radiation + thermal damping, pitch rises as it nears the surface
function bubble(rad, xi = .1, atk = .6) {
  const f = 3 / rad, d = .13 / rad + .0072 * Math.pow(rad, -1.5), sg = xi * d, n = Math.min(.5, 6.5 / d) * SR | 0, y = new Float32Array(n), na = Math.max(8, atk / f * SR);
  for (let i = 0; i < n; i++) { const t = i / SR, e = Math.exp(-d * t) * (i < na ? .5 - .5 * Math.cos(PI * i / na) : 1); y[i] = e * Math.sin(TAU * f * (t + .5 * sg * t * t)); }
  return fadeEnds(y, 0, .002);
}
// turbulence through one moving resonance (2-pole band-pass, then 2-pole low-pass). f,q,g are functions of u = 0..1; g = rms
function shaped(r, dur, f, q, g, lp = 3000, mode = 0, tex = null) {
  const tn = tex ? smooth(r.int()) : null, tg = u => tex ? g(u) * (1 - tex[1] * (.5 + .5 * tn(u * dur * tex[0]))) : g(u);
  const n = dur * SR | 0, y = new Float32Array(n), B = 32; let s = r.int(), a1_ = 0, b1_ = 0, c1_ = 0, d1_ = 0, g0 = tg(0);
  const gl = Math.tan(PI * lp / SR), kl = 1.414, la1 = 1 / (1 + gl * (gl + kl)), la2 = gl * la1, la3 = gl * la2;
  for (let i = 0; i < n; i += B) {
    const u = i / n, e = Math.min(n, i + B), fc = clamp(f(u), 20, 9000), qq = typeof q === 'function' ? q(u) : q, gg = Math.tan(PI * fc / SR), k = 1 / qq, a1 = 1 / (1 + gg * (gg + k)), a2 = gg * a1, a3 = gg * a2;
    const nr = mode ? 1 / Math.sqrt(1.11 * fc / 22050 / 3) : k / Math.sqrt(PI / 2 * fc / qq / 22050 / 3), g1 = tg(e / n);
    for (let j = i; j < e; j++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const v3 = s * 4.656612873077393e-10 - b1_, v1 = a1 * a1_ + a2 * v3, v2 = b1_ + a2 * a1_ + a3 * v3; a1_ = 2 * v1 - a1_; b1_ = 2 * v2 - b1_;
      const w3 = (mode ? v2 : v1) - d1_, w1 = la1 * c1_ + la2 * w3, w2 = d1_ + la2 * c1_ + la3 * w3; c1_ = 2 * w1 - c1_; d1_ = 2 * w2 - d1_;
      y[j] = w2 * nr * (g0 + (g1 - g0) * (j - i) / B);
    }
    g0 = g1;
  }
  return y;
}
// the same turbulence, long and stereo, written into a stem. f(t), g(t) rms, pan(t) in film seconds
function layer(o, t0, t1, p) {
  const i0 = Math.max(0, Math.round((t0 - o.t0) * SR)), i1 = Math.min(o.n, Math.round((t1 - o.t0) * SR)), B = p.block || 128, bp = p.mode !== 'lp', q = p.q || .7, wd = p.width === undefined ? .8 : p.width, cc = Math.sqrt(1 - wd), cw = Math.sqrt(wd), L = o.L, R = o.R;
  const tn = p.tex ? smooth(p.seed * 977 + 3) : null, pg = t => p.tex ? p.g(t) * (1 - p.tex[1] * (.5 + .5 * tn(t * p.tex[0]))) : p.g(t);
  let s = hash(p.seed || 1), l1 = 0, l2 = 0, r1 = 0, r2 = 0, p1 = 0, p2 = 0, q1 = 0, q2 = 0, ga = 0, gb = 0, first = true;
  const lpf = p.lp || 2400, gl = Math.tan(PI * lpf / SR), kl = 1.414, m1 = 1 / (1 + gl * (gl + kl)), m2 = gl * m1, m3 = gl * m2;
  for (let i = i0; i < i1; i += B) {
    const e = Math.min(i1, i + B), t = o.t0 + i / SR, te = o.t0 + e / SR, fc = clamp(p.f(t), 18, 8000), gg = Math.tan(PI * fc / SR), k = 1 / q, a1 = 1 / (1 + gg * (gg + k)), a2 = gg * a1, a3 = gg * a2;
    const nr = bp ? k / Math.sqrt(PI / 2 * fc / q / 22050 / 3) : 1 / Math.sqrt(1.11 * fc / 22050 / 3), gt = pg(te) * nr * Math.min(1, (i1 - e) / 530), pa = p.pan ? (clamp(p.pan(te), -1, 1) + 1) * .25 * PI : .25 * PI, e1 = gt * Math.cos(pa) * 1.41421, e2 = gt * Math.sin(pa) * 1.41421;
    if (first) { ga = 0; gb = 0; first = false; }
    if (gt < 1e-7 && ga < 1e-7 && gb < 1e-7) continue;
    const da = (e1 - ga) / B, db = (e2 - gb) / B;
    for (let j = i; j < e; j++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const n0 = s * 4.656612873077393e-10 * cc;
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const xl = n0 + s * 4.656612873077393e-10 * cw;
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const xr = n0 + s * 4.656612873077393e-10 * cw;
      let v3 = xl - l2, v1 = a1 * l1 + a2 * v3, v2 = l2 + a2 * l1 + a3 * v3; l1 = 2 * v1 - l1; l2 = 2 * v2 - l2;
      v3 = (bp ? v1 : v2) - p2; v1 = m1 * p1 + m2 * v3; v2 = p2 + m2 * p1 + m3 * v3; p1 = 2 * v1 - p1; p2 = 2 * v2 - p2; L[j] += v2 * ga;
      v3 = xr - r2; v1 = a1 * r1 + a2 * v3; v2 = r2 + a2 * r1 + a3 * v3; r1 = 2 * v1 - r1; r2 = 2 * v2 - r2;
      v3 = (bp ? v1 : v2) - q2; v1 = m1 * q1 + m2 * v3; v2 = q2 + m2 * q1 + m3 * v3; q1 = 2 * v1 - q1; q2 = 2 * v2 - q2; R[j] += v2 * gb;
      ga += da; gb += db;
    }
    ga = e1; gb = e2;
  }
}
// dry friction: a relaxation oscillator (stick, slip) knocking on resonances [f, Q, amp]
function friction(r, dur, rate, env, lp, jit, miss) {
  const n = dur * SR | 0, x = new Float32Array(n); let ph = r(), per = 1, rt = rate(0), ev = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) { const u = i / n; rt = rate(u) / SR; ev = env(u); }
    ph += rt * per; if (ph >= 1) { ph -= 1; per = 1 + jit * r.bi(); x[i] = ev * r.in(.7, 1.1) * (r() < miss ? .25 : 1); }
  }
  const kl = 1 - Math.exp(-TAU * lp / SR); let a = 0, b = 0; for (let i = 0; i < n; i++) { a += (x[i] - a) * kl; b += (a - b) * kl; x[i] = b; }
  return x;
}
function resonate(x, res) {
  const n = x.length, y = new Float32Array(n);
  for (const [f, q, am] of res) { const w = TAU * f / SR, rr = Math.exp(-w / (2 * q)), k = 2 * rr * Math.cos(w), q2 = rr * rr, g = am * Math.sin(w); let y1 = 0, y2 = 0; for (let i = 0; i < n; i++) { const v = k * y1 - q2 * y2 + x[i] * g; y[i] += v; y2 = y1; y1 = v; } }
  return y;
}
const stickslip = (r, dur, rate, env, res, lp = 2600, jit = .04, miss = .06) => fadeEnds(resonate(friction(r, dur, rate, env, lp, jit, miss), res), .004, Math.min(.06, dur * .2));
// a cloud of Minnaert bubbles poured into y. tf(), rf(), gf(u) give each one's time (s), radius (m) and gain
let BB = null;
function cloud(y, r, n, tf, rf, g) {
  if (!BB) { const q = RNG(9001); BB = []; for (let i = 0; i < 72; i++) BB.push(norm(bubble(.0007 * Math.pow(26, i / 71), q.in(.01, .14), q.in(.6, 1)))); }
  for (let i = 0; i < n; i++) { const rad = clamp(rf(), .0007, .018); add(y, BB[Math.round(71 * Math.log(rad / .0007) / Math.log(26))], tf(), g * Math.pow(rad / .004, .8) * (.25 + .75 * r() * r())); }
  return y;
}
// decaying sine with an exponential pitch drop f0 -> f1, time constant tau (membranes, hearts, thumps)
function drop(f0, f1, tau, atk, dec, dur) {
  const n = dur * SR | 0, y = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * (f1 + (f0 - f1) * Math.exp(-t / tau)) / SR; y[i] = Math.sin(ph) * Math.exp(-t / dec) * (t < atk ? .5 - .5 * Math.cos(PI * t / atk) : 1); }
  return fadeEnds(y, 0, dur * .25);
}
const hump = (a, p = 1) => u => u < a ? Math.pow(Math.sin(PI * .5 * u / a), 2) : Math.pow(Math.max(0, (1 - u) / (1 - a)), p) ;

// ---------- the voices of things (mono generators, peak 1 unless noted) ------
const G = {};
G.chainTick = (r, k = 1) => { k *= r.in(.94, 1.07); return norm(far(strike([[262 * k, .024, .34], [985 * k, .015, .62], [1610 * k, .012, .60], [2370 * k, .009, .38], [3240 * k, .006, .12]], .00030, .06), 5200)); };
G.rearTick = (r, second = 0) => {
  const k = (second ? cents(-120) : 1) * r.in(.993, 1.007), y = zeros(.36), hit = g => strike([[338 * k, .10, .30], [612 * k, .085, .42], [1165 * k, .062, .72], [1890 * k, .042, .55], [2640 * k, .024, .26]], .00032, .3);
  add(y, hit(), 0, .34); add(y, hit(), .0115 + r.in(0, .002), 1); return norm(y);
};
// pedal bearing: a falling minor third, so-mi, so the empty crank almost says her two notes
G.creak = (r, o = {}) => {
  const c = cents(o.cents || 0) * (o.key || 1), d = o.dur || .85, hi = 440 * c, lo = 370 * c, dn = smooth(r.int()), drift = u => 1 + .0035 * dn(u * 5) + .0020 * dn(u * 23 + 9);
  const rate = o.two ? u => drift(u) * (u < .13 ? 46 * Math.pow(hi / 46, Math.pow(u / .13, .6)) : u < .45 ? hi : u < .57 ? mix(hi, lo, ss(.45, .57, u)) : u < .84 ? lo * (1 - .03 * ss(.57, .84, u)) : lo * .97 * Math.pow(.16, (u - .84) / .16))
    : u => drift(u) * (u < .2 ? 46 * Math.pow(hi / 46, Math.pow(u / .2, .6)) : u < .66 ? hi * (1 - .02 * u) : hi * .985 * Math.pow(.14, (u - .66) / .34));
  const env = o.two ? u => (.35 + .65 * bump(.30, .26, u)) * ss(0, .05, u) * (u < .57 ? 1 : 0) + (u >= .57 ? (.30 + .55 * bump(.70, .24, u)) * (1 - ss(.86, 1, u)) : 0) : u => Math.sin(PI * Math.pow(u, .8));
  const x = friction(r, d, rate, env, 3200, .045, .12), ee = resonate(x, [[505 * c, 5, .9], [1240 * c, 6, .35], [2120 * c, 8, .42]]), oo = resonate(x, [[455 * c, 5, 1], [885 * c, 7, .62], [1480 * c, 7, .18]]), n = x.length;
  for (let i = 0; i < n; i++) { const k = o.two ? ss(.44, .58, i / n) : .45; ee[i] = ee[i] * (1 - k) + oo[i] * k; }
  return norm(fadeEnds(far(ee, 3800), .004, .05));
};
G.wicker = r => {
  const n = 3 + (r() * 5 | 0), y = zeros(.34); let t = .004, k = r.in(.9, 1.15);
  for (let i = 0; i < n; i++) { add(y, strike([[405 * k, .030, .34], [930 * k, .024, .75], [1540 * k, .018, .62], [2280 * k, .012, .34]], .00042, .07), t, r.in(.3, 1) * (1 - i / n * .5)); t += r.in(.009, .045); k *= r.in(.95, 1.08); }
  return norm(y);
};
G.pawl = r => { const k = r.in(.97, 1.03); return norm(far(strike([[520 * k, .02, .26], [1380 * k, .014, .6], [2190 * k, .011, .6], [3120 * k, .008, .30]], .00024, .04), 5600)); };
G.footPat = (r, hi = 1) => { const y = far(shaped(r, .11, u => mix(360, 190, u) * hi, .8, hump(.14, 2.2), 1100), 1300); add(y, drop(118 * hi, 72 * hi, .02, .006, .03, .1), 0, 2.6 * .25); return norm(y); };
G.bumpThud = r => { const y = drop(104, 70, .03, .007, .05, .22); add(y, strike([[212, .07, .5], [388, .05, .25]], .003, .2), 0, .6); return norm(y); };
G.dropGrain = (r, a = .0007, b = .003) => norm(bubble(a * Math.pow(b / a, r()), r.in(.02, .2), r.in(.5, 1)), 1);
G.stoneTap = r => { const k = r.in(.8, 1.3); return norm(far(strike([[700 * k, .012, .34], [1350 * k, .011, .7], [2200 * k, .008, .6]], .00045, .03), 3800)); };
G.leatherTap = r => norm(far(strike([[250 * r.in(.8, 1.25), .035, 1], [440 * r.in(.8, 1.2), .02, .5]], .003, .08), 900));
G.plink = (r, rad = .0042) => { const y = zeros(.5); add(y, strike([[1500, .006, .25], [760, .012, .3]], .0012, .04), 0, .35); add(y, bubble(rad, .16, 1), .016, 1); add(y, bubble(rad * .62, .2, 1), .052, .34); add(y, bubble(rad * 2.1, .08, 1), .020, .5); return norm(y); };
G.drip = r => { const rad = r.in(.0030, .0062), y = zeros(.4); add(y, bubble(rad, r.in(.10, .2), 1), .008, 1); if (r() < .5) add(y, bubble(rad * r.in(.5, .7), .2, 1), r.in(.04, .08), .35); return norm(far(y, 2600)); };
// one small wave on sand: rise, spill, bubbles in the backwash
G.lap = (r, size = 1) => {
  const d = r.in(1.5, 2.5) * (.7 + .3 * size), y = shaped(r, d, u => (240 + 420 * bump(.36, .4, u)) / (.6 + .4 * size), .7, u => .075 * Math.pow(bump(.34, .34, u), 1.4) + .03 * hump(.5, 1.6)(u) * ss(.2, .5, u), 1400, 0, [26, .8]);
  cloud(y, r, 90 + 110 * size | 0, () => d * (.18 + .74 * (r() < .5 ? (r() + r()) * .26 : Math.pow(r(), 1.1))), () => .0013 * Math.pow(6, Math.pow(r(), 1.2)), .085);
  return norm(fadeEnds(y, .05, .2));
};
// herring-gull cry: two syrinx halves a few cents apart, harmonics through a 2 kHz throat
G.gull = (r, o = {}) => {
  const n = o.n || 3, f = o.f || 790, y = zeros(n * .52 + .5); let at = .02;
  for (let c = 0; c < n; c++) {
    const d = r.in(.26, .38) * (c === 0 ? 1.35 : 1), N = d * SR | 0, pk = r.in(.30, .42) * (c === 0 ? 1.2 : 1), fl = f * r.in(.96, 1.04), off = Math.round(at * SR), rough = r.in(24, 38); let p1 = 0, p2 = 0;
    for (let i = 0; i < N; i++) {
      const u = i / N, f0 = fl * (1 + pk * Math.sin(PI * Math.pow(u, .62)) - .12 * u), env = Math.pow(Math.sin(PI * Math.pow(u, .55)), 1.2) * (1 - .22 * (.5 + .5 * Math.sin(TAU * rough * i / SR))); p1 += TAU * f0 / SR; p2 += TAU * f0 * 1.006 / SR; let v = 0;
      for (let h = 1; h <= 4; h++) { const fh = f0 * h, a = (h === 1 ? .55 : 1 / h) * (.35 + 1 / (1 + Math.pow((fh - 1750) / 620, 2))); v += a * (Math.sin(p1 * h) + .7 * Math.sin(p2 * h + h)); }
      if (off + i < y.length) y[off + i] += v * env;
    }
    at += d + r.in(.07, .14);
  }
  return norm(far(y, o.lp || 2300));
};
G.lark = r => {
  const n = 16 + (r() * 8 | 0), y = zeros(2.6); let at = .02, base = r.in(2500, 2800);
  for (let c = 0; c < n; c++) {
    const d = r.in(.045, .085), N = d * SR | 0, fa = base * r.in(.92, 1.35), fb = base * r.in(.95, 1.45), off = at * SR | 0; let p = 0; const a = .4 + .6 * Math.sin(PI * (c + .5) / n);
    for (let i = 0; i < N; i++) { const u = i / N; p += TAU * (mix(fa, fb, u) + 90 * Math.sin(TAU * 42 * i / SR)) / SR; const e = Math.sin(PI * u); if (off + i < y.length) y[off + i] += a * e * e * (Math.sin(p) + .06 * Math.sin(2 * p)); }
    at += d + r.in(.012, .05); if (r() < .25) base *= r.in(.9, 1.12);
  }
  return norm(far(y, 4200));
};
// tortuous lightning: many N-waves arriving over seconds, air eating the top
G.thunder = (r, o = {}) => {
  const d = o.dur || 6, n = d * SR | 0, x = new Float32Array(n), nc = o.claps || 4, near = o.near || .3, c = []; for (let i = 0; i < nc; i++) c.push([i === 0 ? .04 : Math.pow(r(), 1.2) * .62, r.in(.3, 1) * (i === 0 ? 1 : .8), r.in(.02, .07)]);
  for (let i = 0; i < 520; i++) {
    const k = r.pick(c), u = Math.abs(k[0] + (r() + r() + r() - 1.5) * k[2] * 1.6) + .004, j = u * n | 0, w = r.in(.005, .020) * SR | 0, a = k[1] * Math.pow(r(), 2.2) * Math.pow(Math.max(0, 1 - u), 1.1) * (r() < .5 ? -1 : 1); if (j + w < n) { x[j] += a * w; x[j + w] -= a * w; }
  }
  const roll = shaped(r, d, () => 78, .6, u => .30 * hump(.10, 1.5)(u) * (.5 + .5 * Math.abs(Math.sin(u * 17 + 5 * u * u))), 260); let a = 0, b = 0, e = 0;
  for (let i = 0; i < n; i++) { const u = i / n, k = 1 - Math.exp(-TAU * (70 + (90 + 560 * near) * Math.exp(-u * (4 + 3 * (1 - near)))) / SR); if ((i & 31) === 0) e = k; a += (x[i] - a) * e; b += (a - b) * e; x[i] = b; }
  norm(x); norm(roll); for (let i = 0; i < n; i++) x[i] = x[i] * (.6 + .4 * near) + roll[i] * .7;
  return norm(fadeEnds(x, .03, d * .35));
};
// wave on the causeway wall: rush, hollow boom of trapped air, wet slap. Impact .42 s in.
G.slap = (r, size = .5) => {
  const at = .42, d = 1.9 + size, y = shaped(r, d, u => { const t = u * d; return t < at ? mix(150, 330, t / at) : mix(680, 230, ss(at, at + .9, t)); }, .65, u => { const t = u * d; return t < at ? .10 * Math.pow(t / at, 2) : .42 * Math.exp(-(t - at) / (.16 + .14 * size)) * (1 - Math.exp(-(t - at) / .009)) + .07 * Math.exp(-(t - at) / .7); }, 1800 + 600 * size, 0, [30, .55]);
  const k = 1.25 - .4 * size; add(y, strike([[58 * k, .7, 1], [91 * k, .5, .8], [143 * k, .3, .5], [236 * k, .16, .22]], .016, 1.2), at - .006, .55 + .5 * size); add(y, drop(120 * k, 46 * k, .06, .010, .16, .7), at - .004, .5 * size + .2);
  cloud(y, r, 160 + 420 * size | 0, () => at + .03 + Math.pow(r(), 1.6) * (d - at - .5), () => .0014 * Math.pow(9, Math.pow(r(), 1.2)), .05);
  return norm(fadeEnds(y, .08, .3));
};
G.slapAt = .42;
// steel tube frame dropped on stone
G.clang = (r, o = {}) => {
  const b = (o.f || 276) * r.in(.98, 1.02), q = o.q || 1, y = zeros(1.5), hit = (h, g, at) => add(y, strike([[b, .60 * q, .34], [b * 1.83, .62 * q, .42], [b * 2.76, .80 * q, .8], [b * 4.07, .72 * q, .85], [b * 5.4, .50 * q, .75], [b * 7.3, .30 * q, .5], [b * 9.7, .22 * q, .42], [b * 12.2, .15 * q, .30], [118, .10, .4]].map(m => [m[0] * h, m[1], m[2] * r.in(.6, 1.1)]), .00026, 1), at, g);
  hit(1, 1, 0); hit(1.006, .5, .072 + r.in(0, .02)); hit(.994, .34, .19 + r.in(0, .03)); hit(1.01, .16, .30); hit(1.0, .10, .36); return norm(far(y, 5200));
};
G.skid = r => { const y = stickslip(r, .62, u => mix(265, 150, u * u) * (1 + .05 * Math.sin(u * 40)), u => Math.pow(bump(.38, .5, u), .8), [[540, 2.6, .6], [1120, 3, 1], [1980, 3, .6]], 3000, .12, .12); norm(y); add(y, norm(shaped(r, .62, u => mix(1500, 640, u), .7, u => bump(.4, .5, u), 2600, 0, [55, .6])), 0, .6); return norm(far(y, 4200)); };
// brass dome, doublet modes that beat, a warm bracket note under it
const BELL_F = mtof(95);                               // B6: sixth of D, fifth of E - in both pentatonics
function dome(side, o = {}) {
  const f = BELL_F * cents(o.cents || 0), q = o.q || 1, a = side ? .62 : 1, b = side ? 1 : .62, sp = .75;
  return [[f - sp, 2.35 * q, a], [f + sp, 2.05 * q, b], [f * 2.669 - 1.6, .85 * q, .40 * a], [f * 2.669 + 1.7, .70 * q, .40 * b], [f * 4.91, .20 * q, .34], [f * .7492, .32 * q, .17], [f * .3745, .10, .17], [612, .05, .12]];
}
// {L,R}; the main stroke is at G.bellAt. trr = ratchet grace hits before it
G.bellAt = .118;
G.bell = (r, o = {}) => {
  const st = { L: zeros(o.dur || 3.4), R: zeros(o.dur || 3.4) }, at = o.lead === undefined ? G.bellAt : o.lead, trr = o.trr === undefined ? 1 : o.trr, wob = r.bi() * .12;
  const hits = trr ? [[-.082, .13], [-.041, .24], [0, 1], [.066, .22], [.121, .09]] : [[0, 1]];
  for (let s = 0; s < 2; s++) {
    const X = s ? st.R : st.L;
    for (const [dt, g] of hits) if (at + dt >= 0) add(X, strike(dome(s, o), dt === 0 ? .00017 : .00026, (o.dur || 3.4) - at - dt - .01), at + dt, g * (1 + (s ? wob : -wob)));
    if (trr) for (let i = 0; i < 6; i++) { const t = at - .108 + i * .0205 - i * i * .0006; if (t >= 0) add(X, strike([[905, .016, .34], [1640, .012, .55], [2440, .010, .42]], .00028, .03), t, .085 * (.6 + .4 * i / 5) * (s ? .8 : 1)); }
    fadeEnds(X, .001, .5);
  }
  let k = 0; for (const X of [st.L, st.R]) for (let i = 0; i < X.length; i++) k = Math.max(k, Math.abs(X[i])); for (const X of [st.L, st.R]) for (let i = 0; i < X.length; i++) X[i] /= k;
  return st;
};
// shaken by wind: the dome half leans on its spindle, short and dull
G.bellLoose = r => {
  const st = { L: zeros(1.5), R: zeros(1.5) }; let t = .01, g = .7;
  for (let i = 0; i < 4; i++) { for (let s = 0; s < 2; s++) add(s ? st.R : st.L, strike(dome(s, { cents: -14, q: .38 }), .00040, 1.2), t, g); t += r.in(.06, .19); g *= r.in(.45, .9); }
  let k = 0; for (const X of [st.L, st.R]) { far(X, 5200); for (let i = 0; i < X.length; i++) k = Math.max(k, Math.abs(X[i])); } for (const X of [st.L, st.R]) { for (let i = 0; i < X.length; i++) X[i] /= k; fadeEnds(X, 0, .2); }
  return st;
};
// torn off: rings free in the air, then the sea closes on it (added mass: pitch sinks, damping soars)
G.bellTorn = (r, air = 1.25) => {
  const d = air + .9, n = d * SR | 0, st = { L: new Float32Array(n), R: new Float32Array(n) };
  for (let s = 0; s < 2; s++) {
    const X = s ? st.R : st.L, m = dome(s); add(X, strike(m, .0004, air + .02), 0, 0);
    for (const [f, t60, a] of m) {
      let ph = 0, A = a; const k0 = Math.pow(10, -3 / (t60 * 1.15 * SR)); for (let i = 0; i < n; i++) { const t = i / SR, w = ss(air, air + .16, t), tumble = 1 + .28 * Math.sin(TAU * (3.1 * t + s * .25)); ph += TAU * f * (1 - .30 * w) / SR; A *= w > 0 ? Math.pow(10, -3 / (mix(t60 * 1.15, .10, w) * SR)) : k0; X[i] += A * Math.sin(ph) * tumble * Math.min(1, t / .0009) * Math.exp(-Math.max(0, f - 2600) / 2600 * .9); }
    }
    add(X, bubble(.0085, .22, 1), air + .05, .16); add(X, bubble(.0052, .25, 1), air + .13, .10); add(X, bubble(.0034, .2, 1), air + .20, .06); fadeEnds(X, .001, .2);
  }
  let k = 0; for (const X of [st.L, st.R]) for (let i = 0; i < n; i++) k = Math.max(k, Math.abs(X[i])); for (const X of [st.L, st.R]) for (let i = 0; i < n; i++) X[i] /= k;
  return st;
};
G.heart = (r, big = 1) => { const y = zeros(.75); if (big) { add(y, drop(74, 44, .03, .022, .09, .34), 0, 1); add(y, drop(150, 108, .02, .016, .040, .18), 0, .55); add(y, drop(236, 190, .02, .014, .020, .09), 0, .16); add(y, drop(88, 56, .025, .018, .06, .26), .30, .62); add(y, drop(170, 132, .02, .016, .03, .14), .30, .34); } else { add(y, drop(170, 128, .012, .009, .028, .11), 0, 1); add(y, drop(350, 280, .010, .006, .016, .07), 0, .62); add(y, drop(205, 160, .010, .008, .020, .09), .118, .55); add(y, drop(420, 340, .010, .006, .010, .05), .118, .30); } return norm(y); };
G.whoosh = (r, d = 1.05, up = 1) => { const spin = 5.2; return norm(shaped(r, d, u => 300 * (1 + .55 * (u < .5 ? 1 : 1 - 1.1 * ss(.46, .62, u))) * (1 + .10 * Math.sin(TAU * spin * 2 * u * d)), 1.7, u => Math.pow(bump(.5, .5, u), 1.7) * (.62 + .38 * Math.sin(TAU * spin * 2 * u * d)), 1700, 0, [34, .4])); };
// the catch: a wet leather pouch takes the weight of an egg
G.whup = r => {
  const y = zeros(1.1); add(y, drop(132, 58, .045, .011, .12, .55), .004, 1); add(y, drop(236, 118, .03, .008, .06, .3), .006, .42);
  add(y, norm(shaped(r, .24, u => mix(980, 300, Math.pow(u, .5)), .75, hump(.07, 2.6), 2200, 0, [40, .5])), 0, .72); add(y, norm(shaped(r, .10, u => mix(420, 240, u), 2.2, hump(.12, 2), 900)), .002, .5);
  cloud(y, r, 70, () => .012 + .34 * Math.pow(r(), 1.5), () => .0026 * Math.pow(4.6, r()), .16);
  const w = shaped(r, .8, u => 170 + 40 * Math.sin(TAU * 6.4 * u * .8), 1.6, u => { const t = u * .8; return Math.exp(-t / .22) * (.5 - .5 * Math.cos(TAU * 6.4 * t)) * ss(0, .06, t); }, 600); add(y, norm(w), .12, .30);
  return norm(y);
};
G.jiggle = r => { const d = .7; const y = norm(shaped(r, d, u => 215 + 70 * Math.sin(TAU * 7 * u * d), 2, u => { const t = u * d; return Math.exp(-t / .2) * (.5 - .5 * Math.cos(TAU * 7 * t)); }, 700)); for (let i = 0; i < 3; i++) add(y, bubble(r.in(.006, .011), .1, 1), .05 + .14 * i + r.in(0, .03), .22 / (1 + i)); return norm(y); };
G.swell = (r, size = 1) => {
  const d = 5.4, y = norm(shaped(r, d, u => 130 + 300 * bump(.42, .36, u), .6, u => Math.pow(bump(.40, .40, u), 1.5) + .16 * bump(.66, .34, u), 900, 0, [11, .55]));
  cloud(y, r, 620 * size | 0, () => d * (.34 + .58 * Math.pow(r(), 1.3)), () => .0020 * Math.pow(6.5, r()), .040); return norm(fadeEnds(y, .2, .5));
};
G.beam = r => { const d = 1.2, y = norm(shaped(r, d, u => 230 + 340 * bump(.5, .5, u), 1.3, u => Math.pow(bump(.5, .5, u), 1.6), 1200, 0, [18, .45])); add(y, norm(shaped(r, d, u => 820 + 640 * bump(.5, .5, u), 1.6, u => Math.pow(bump(.5, .42, u), 2), 2400, 0, [24, .5])), 0, .30); add(y, drop(73.4, 73.4, 1, .5, 9, d - .02).map((v, i, a) => v * Math.pow(bump(.5, .5, i / a.length), 1.4)), 0, .5); return norm(y); };
G.lantern = r => norm(far(stickslip(r, r.in(1.1, 1.7), u => mix(11, 24, bump(.5, .6, u)), u => Math.pow(Math.sin(PI * u), 1.4), [[228, 16, 1], [391, 18, .7], [636, 16, .4], [1010, 12, .15]], 900, .16, .18), 1300));
G.shellTap = r => { const y = zeros(.17), k = r.in(.97, 1.03), t = () => strike([[590 * k, .03, .30], [1175 * k, .030, 1], [1960 * k, .012, .34]], .00055, .07); add(y, t(), .002, 1); add(y, t(), .068 + r.in(0, .012), .55); return norm(far(y, 2600)); };
// eggshell: tick + splinter of micro-fractures + membrane stretching under it
G.crack = (r, size = .5) => {
  const d = .45 + .45 * size, y = zeros(d), tk = (g, at, c) => add(y, strike([[r.in(900, 1250), .015, .34], [r.in(1700, 2300), .010, .8], [r.in(2700, 3500), .007, .75], [r.in(4100, 4700), .005, .34]], c * .5, .04), at, g);
  tk(1, .012, .00045); tk(.55, .021 + r.in(0, .006), .0004); if (size > .4) tk(.7, .052 + r.in(0, .02), .0004);
  const n = 8 + 34 * size | 0; for (let i = 0; i < n; i++) tk(.04 + .34 * Math.pow(r(), 2.6), .03 + Math.pow(r(), 1.5) * (d - .12), .00035);
  add(y, norm(stickslip(r, d * .75, u => mix(34, 88, u), u => Math.sin(PI * Math.pow(u, .7)), [[420, 3, 1], [690, 3, .8], [1040, 3, .5]], 1500, .2, .2)), .04, .10 + .12 * size);
  return norm(far(y, 6000));
};
G.shellTok = r => { const y = zeros(.9); let t = .004, g = 1, dt = .15; for (let i = 0; i < 7; i++) { const k = 1 + .035 * r.bi() + .02 * i; add(y, strike([[410, .030, .30], [1270 * k, .013, .8], [2130 * k, .011, .9], [3050 * k, .009, .6]], .00026, .06), t, g); t += dt; dt *= .70; g *= .66; } return norm(far(y, 5600)); };
G.woolThump = r => norm(far(shaped(r, .16, u => mix(190, 110, u), .7, hump(.16, 2), 480), 520));
G.claw = r => norm(strike([[820 * r.in(.9, 1.1), .020, .30], [1480 * r.in(.9, 1.1), .014, .8], [2300, .010, .6]], .00035, .04));
// barbs sliding: hundreds of tiny soft catches, gated by the shake rate
G.ruffle = (r, o = {}) => {
  const d = o.dur || .6, rate = o.rate || 10, fc = o.f || 1500, y = shaped(r, d, u => fc * (.8 + .3 * Math.sin(TAU * rate * .5 * u * d)), .9, u => .5 * hump(.2, 1.2)(u) * Math.pow(.5 - .5 * Math.cos(TAU * rate * u * d), 1.3), o.lp || 2600);
  for (let i = 0; i < 90 * d; i++) { const u = Math.pow(r(), 1.2), g = hump(.2, 1.2)(u) * (.5 - .5 * Math.cos(TAU * rate * u * d)); add(y, strike([[fc * r.in(.5, .9), .010, .6], [fc * r.in(.9, 1.5), .008, .6]], .0016, .02), u * (d - .04), g * r.in(.04, .22)); }
  return norm(far(fadeEnds(y, .02, .08), o.lp || 2600));
};
G.flap = (r, k = 1) => { const d = r.in(.13, .17), y = shaped(r, d, u => mix(540, 250, u) * k, .7, u => (hump(.16, 2.4)(u) + .38 * bump(.74, .22, u)) * (.60 + .40 * Math.sin(TAU * 88 * u * d)), 1900); norm(y); add(y, drop(128 * k, 76 * k, .03, .016, .035, d), .004, .55); return norm(y); };
G.clothWhump = r => norm(far(shaped(r, .2, u => mix(150, 84, u), .8, hump(.22, 1.8), 380), 420));
G.clothRub = r => norm(shaped(r, r.in(.14, .24), u => mix(640, 380, u), 1.1, u => Math.pow(bump(.42, .42, u), .8), 1300, 0, [75, .8]));
G.splash = (r, size = 1) => {
  const st = { L: zeros(1.6), R: zeros(1.6) }, body = norm(shaped(r, .46, u => mix(1500, 420, Math.pow(u, .45)) / (.7 + .3 * size), .6, u => hump(.035, 2.6)(u), 3400, 0, [60, .55])), p = r.bi() * .25;
  const one = (m, t, g, pan) => { const a = (clamp(pan, -1, 1) + 1) * .25 * PI; add(st.L, m, t, g * Math.cos(a)); add(st.R, m, t, g * Math.sin(a)); };
  one(body, 0, .78, p); one(drop(150 / size, 80 / size, .05, .010, .06, .3), .002, .34, p); one(bubble(.0085 * size, .16, 1), .048, .26, p); one(bubble(.0058 * size, .2, 1), .105, .18, p * .5);
  for (let k = 0; k < 2; k++) one(cloud(zeros(1.1), r, 150 * size | 0, () => .02 + .8 * Math.pow(r(), 1.8), () => .0011 * Math.pow(6, Math.pow(r(), 1.4)), .10), .01, 1, p + (k ? .5 : -.5));
  for (let i = 0; i < 110; i++) { const u = Math.pow(r(), 1.2); one(G.dropGrain(r, .0008, .0030), .10 + u * 1.15, r.in(.03, .20) * (1 - .75 * u), p + r.bi() * (.3 + .7 * u)); }
  return peakSt(st);
};
G.hop = r => { const y = zeros(.95); add(y, G.claw(r), 0, .10); add(y, G.claw(r), .03, .08); for (let i = 0; i < 3; i++) add(y, G.flap(r, 1.9), .04 + i * .062, .16); add(y, strike([[126, .11, 1], [231, .07, .6], [402, .045, .4], [760, .03, .2]], .004, .3), .27, .85); add(y, G.creak(r, { dur: .16, cents: 700 }), .30, .10); add(y, G.ruffle(r, { dur: .42, rate: 17, f: 1500 }), .40, .16); return norm(y); };
G.gust = r => { const a = u => Math.pow(bump(.42, .46, u), 1.5), y = norm(shaped(r, 1.9, u => 170 + 260 * bump(.42, .5, u), 1, a, 900, 0, [9, .6])); add(y, norm(shaped(r, 1.9, u => 420 + 560 * bump(.44, .5, u), 5, a, 1800, 0, [14, .7])), 0, .34); for (let i = 0; i < 5; i++) { const t = .4 + i * .19 + r.in(0, .05); add(y, G.clothWhump(r), t, .4 * bump(.8, .8, t)); add(y, G.clothRub(r), t + .02, .22 * bump(.8, .8, t)); } return norm(fadeEnds(y, .1, .2)); };
G.pop = r => { const y = zeros(.2); add(y, bubble(r.in(.0046, .0072), .34, 1), .002, 1); add(y, strike([[1250, .007, .4], [640, .012, .4]], .0007, .04), 0, .25); return norm(y); };
function peakSt(st, p = 1) { let k = 0; for (const X of [st.L, st.R]) for (let i = 0; i < X.length; i++) { const a = X[i] < 0 ? -X[i] : X[i]; if (a > k) k = a; } if (k) for (const X of [st.L, st.R]) { for (let i = 0; i < X.length; i++) X[i] *= p / k; fadeEnds(X, .001, .06); } return st; }

// ---------- film times --------------------------------------------------------
const T = S.T, TM = S.TIME, W = TM.wave, NOW1 = T('now', S.sec.now.bars), STORM = T('storm', 0), NIGHT = T('night', 0), NB = 60 / S.sec.night.bpm, RIDE = T('ride', 0), END = S.DUR;
const SLOW = W + 1.2;                                  // slow time begins
const POV0 = T('night', 7, 1), POV1 = T('night', 10);  // the bill is the point of view
const BEAM_T = S.SWEEP.P, BEAM_W = 1.2, beam0 = S.SWEEP.t0 - BEAM_W * .5;   // passes start here, every 6 s, 1.2 s long
const taps = [T('night', 8, 1.3), T('night', 9, .8), T('night', 11, 1.2)];
const beamStarts = []; for (let t = beam0; t < TM.nightEnd; t += BEAM_T) beamStarts.push(t);
const thunderAt = [                                     // [time, distance km, dur, dB peak, pan, near 0..1]
  [NOW1 + .9, 4.2, 5.2, -24, -.5, .05], [T('storm', 3, 1), 2.0, 5.5, -14.5, .4, .3], [T('storm', 7, 2), 1.3, 5.5, -12.5, -.35, .5], [T('storm', 12, 1), .7, 6, -11, .2, .8]];
const slapAt = [[1, 1, .16], [3, 2, .22], [5, 0, .28], [6, 2, .34], [8, 1, .42], [9, 2, .5], [11, 0, .6], [12, 2, .68], [13, 2, .78], [14, 2, .88], [15, 2, 1]].map(([b, q, s], i) => [T('storm', b, q), s, [-.5, .45, -.2, .6, -.6, .3, -.35, .55, -.5, .25, 0][i]]);
const splashAt = [[T('ride', 4), 1, -.15], [T('ride', 8), 1.25, .2], [T('ride', 12), 1.6, 0]];
const flockAt = T('ride', 12);
const passes = [mix(SLOW, TM.catch_, .30), mix(SLOW, TM.catch_, .72)];   // centres of the egg's two passes
// one wind for everything, m/s
const gA = smooth(101), gB = smooth(102), gC = smooth(103);
const windBase = [[0, 2.2], [TM.matchCut - .01, 2.2], [TM.matchCut, .5], [NOW1 - 2, .6], [NOW1, 1.2], [STORM, 6.5], [T('storm', 4), 8.5], [T('storm', 12), 12], [W, 13], [SLOW, 9], [TM.black, 5], [TM.nightIn, 3], [NIGHT + 8, 1.2], [TM.nightEnd, .7], [RIDE, 1.1], [T('ride', 4), 2.6], [T('ride', 12), 4], [T('ride', 20), 3.4], [TM.end, 1.6], [END, 1.2]];
const windGust = [[0, .8], [TM.matchCut, .25], [NOW1, .5], [STORM, 3.6], [T('storm', 8), 5], [W, 6], [SLOW, 2.5], [TM.nightIn, .9], [TM.nightEnd, .3], [RIDE, .5], [T('ride', 12), 1.3], [END, .5]];
const wind = t => Math.max(.1, lin(windBase, t) + lin(windGust, t) * (.62 * gA(t * .23) + .42 * gB(t * .61) + .22 * gC(t * 1.6)));
const apparent = t => wind(t) * .75 + S.speed(t) * .62;
// crank events: every 1/div of a revolution, at phase ph
function crankEvents(t0, t1, div, ph = 0) {
  const ev = [], h = .002; let c0 = S.crank(t0) * div - ph * div, k = Math.floor(c0 - 1e-6);
  for (let t = t0; t < t1; t += h) {
    const c1 = S.crank(t + h) * div - ph * div, k1 = Math.floor(c1);
    while (k < k1) { k++; const x = k / div + ph; ev.push({ t: t + h * clamp((k - c0) / ((c1 - c0) || 1), 0, 1), k, frac: x - Math.floor(x) }); }
    c0 = c1;
  }
  return ev;
}
// ---------- machine -----------------------------------------------------------
// c: chain, front, rear, creakF, creakR, sheet, drops, feet, wicker: dB functions of film time
function tandem(t0, t1, c) {
  const o = Out(t0 - .04, t1 + .5), r = RNG(c.seed), bank = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return a; };
  const gate = t => ss(.02, .10, S.rate(t));
  // two chains: the drive chain on the right, the timing chain that ties her pedals to his on the left
  const ta = bank(9, () => G.chainTick(r, 1)), tb = bank(9, () => G.chainTick(r, 1.13));
  for (const e of crankEvents(t0, t1, 24)) put(o, r.pick(ta), e.t + r.bi() * .0012, dB(c.chain(e.t)) * gate(e.t) * (.40 + .60 * Math.abs(Math.sin(TAU * (e.frac + .06)))) * (e.k & 1 ? 1 : .68) * r.in(.7, 1.1), .24 + .04 * r.bi());
  for (const e of crankEvents(t0, t1, 24, .43 / 24)) put(o, r.pick(tb), e.t + r.bi() * .0015, dB(c.chain(e.t) - 4) * gate(e.t) * (.5 + .5 * Math.abs(Math.sin(TAU * (e.frac + .06)))) * (e.k & 1 ? .7 : 1) * r.in(.7, 1.1), -.26 + .04 * r.bi());
  // rear pedals: a loose axle that ticks as each pedal goes over the bottom
  const rp = [bank(3, () => G.rearTick(r, 0)), bank(3, () => G.rearTick(r, 1))];
  for (const e of crankEvents(t0, t1, 2)) put(o, r.pick(rp[e.k & 1]), e.t, dB(c.rear(e.t)) * gate(e.t) * (e.k & 1 ? .72 : 1), -.12);
  // creaks: front one note, rear two notes, nine cents apart
  const key = t => t >= TM.key - .05 && t > RIDE ? 1 : 0, per = t => 1 / Math.max(.2, S.rate(t));
  const mk = (two, k) => bank(3, () => G.creak(r, { two, cents: two ? 9 : 0, dur: (two ? .42 : .24) * c.per, key: k ? cents(200) : 1 }));
  const cf = [mk(0, 0), c.lift ? mk(0, 1) : null], cr = [mk(1, 0), c.lift ? mk(1, 1) : null];
  for (const e of crankEvents(t0, t1, 1, .10)) put(o, r.pick(cf[key(e.t)]), e.t, dB(c.creakF(e.t)) * gate(e.t) * r.in(.6, 1), .16);
  for (const e of crankEvents(t0, t1, 1, .56)) put(o, r.pick(cr[key(e.t)]), e.t, dB(c.creakR(e.t)) * gate(e.t) * r.in(.8, 1), -.14);
  // feet
  const f1 = bank(4, () => G.footPat(r, 1)), f2 = bank(4, () => G.footPat(r, 1.35));
  for (const e of crankEvents(t0, t1, 2, .25 - .06)) { put(o, r.pick(f1), e.t + r.bi() * .012, dB(c.feet(e.t)) * gate(e.t) * r.in(.6, 1), .12 + (e.k & 1 ? .06 : -.06)); if (c.four) put(o, r.pick(f2), e.t + r.in(.02, .05), dB(c.feet(e.t) - 3) * gate(e.t) * r.in(.6, 1), -.16 + (e.k & 1 ? .06 : -.06)); }
  // wheels on the water film: turbulence read along the road, so it ripples with distance and stops with the bike
  const tx = smooth(c.seed * 31 + 5), ty = smooth(c.seed * 31 + 6);
  const sheet = (sd, off, f0, pan, q) => layer(o, t0, t1, { seed: c.seed * 7 + sd, block: 64, q, lp: 2100, width: .55, pan: () => pan, f: t => f0 * (.75 + .25 * S.speed(t) / 2.8) * (1 + .10 * tx(S.dist(t) * 1.1 + off)), g: t => { const d = S.dist(t) + off; return dB(c.sheet(t)) * Math.pow(S.speed(t) / 2.8, 1.4) * Math.max(.06, .60 + .34 * tx(d * 1.7) + .24 * ty(d * 7) + .22 * tx(d * 19)) * mix(.38, 1.35, ss(-.45, .55, ty(d * .33 + 5))); } });
  sheet(1, 0, 560, .14, .6); sheet(2, 2.4, 860, -.12, .7);
  layer(o, t0, t1, { seed: c.seed * 7 + 3, block: 64, q: 2.6, lp: 1900, width: .7, f: t => 420 + 190 * apparent(t), g: t => dB(c.sheet(t) - 11) * Math.pow(apparent(t) / 3, 1.5) * (.72 + .28 * Math.sin(TAU * 36 * S.crank(t) * S.GEAR)) });   // spokes
  const dg = bank(40, () => G.dropGrain(r, .0008, .0030));
  for (let t = t0; ;) { t += r.exp() / Math.max(1, 26 * S.speed(t) / 2.8); if (t >= t1) break; put(o, r.pick(dg), t, dB(c.drops(t)) * Math.pow(S.speed(t) / 2.8, 1.3) * mix(.10, .24, ss(-.45, .55, ty(S.dist(t) * .33 + 5))) * Math.pow(r() + .02, -.45), r.bi() * .55); }
  // small stones under the wheel, and the basket answering
  const bt = bank(4, () => G.bumpThud(r)), wk = bank(5, () => G.wicker(r)); let next = S.dist(t0) + r.in(.5, 2);
  for (let t = t0; t < t1; t += .01) if (S.dist(t) >= next) { next += r.in(2.0, 6.2); const g = r.in(.35, 1); put(o, r.pick(bt), t, dB(c.wicker(t) - 2) * g, .1); put(o, r.pick(bt), t + 2.4 / Math.max(.6, S.speed(t)), dB(c.wicker(t) - 5) * g, -.1); if (r() < .75) put(o, r.pick(wk), t + r.in(.05, .14), dB(c.wicker(t)) * g, .26); }
  // freewheel whenever the wheels outrun his feet
  if (c.coast) { const pw = bank(5, () => G.pawl(r)); let a = 0; for (let t = c.coast[0]; t < c.coast[1]; t += .001) { a += S.rate(t) * S.GEAR * 18 * .001; if (a >= 1) { a -= 1; put(o, r.pick(pw), t, dB(-30) * r.in(.6, 1), -.2); } } }
  return o;
}
function scarf(o, t0, t1, lvl, r, pan) {
  const wh = [], rb = []; for (let i = 0; i < 6; i++) { wh.push(G.clothWhump(r)); rb.push(G.clothRub(r)); }
  for (let t = t0 + r.in(.1, .4); t < t1;) { const v = apparent(t), f = clamp(.75 + v * .55, 1, 8.5), a = Math.pow(v / 4, 1.1) * r.in(.35, 1), p = pan + .18 * r.bi(); put(o, r.pick(wh), t, dB(lvl(t)) * a, p); put(o, r.pick(rb), t + r.in(.008, .03), dB(lvl(t) - 7) * a, p + .1); t += r.in(.72, 1.4) / f; }
}
const bank = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return a; };
// poisson sprinkle: rate(t) per second
function sprinkle(o, t0, t1, r, rate, fn) { for (let t = t0; ;) { const k = rate(t); t += r.exp() / Math.max(.2, k); if (t >= t1) return; if (k > .2) fn(t); } }

// ---------- jobs ----------------------------------------------------------------
const J = {};
const job = (id, bus, send, run) => { J[id] = { bus, send, run }; };
const TRIM = { 'amb.then': 2, 'amb.now': 2.4, 'amb.night': 2, 'amb.dawn': 3, 'amb.ride': 2 };   // dB, whole stem
// ---- THEN: calm water, warm air
job('amb.then', 'amb', .10, () => {
  const t1 = TM.matchCut, o = Out(0, t1 + .03), r = RNG(201), n1 = smooth(31), n2 = smooth(32);
  layer(o, 0, t1 + .03, { seed: 41, q: .5, lp: 900, width: .9, f: t => 260 + 80 * n1(t * .13), g: t => dB(-40) * Math.pow(clamp(.72 + .5 * n2(t * .19), .1, 1.3), 1.5), tex: [7, .45] });
  layer(o, 0, t1 + .03, { seed: 42, q: .9, lp: 1300, width: .8, tex: [13, .5], f: t => 290 + 70 * wind(t), g: t => dB(-43) * Math.pow(wind(t) / 2.2, 2.6) });
  const lp = bank(6, i => G.lap(r, .5 + .5 * (i % 3) / 2)); for (let t = .4; t < t1 - .5; t += r.in(1.1, 2.6)) put(o, r.pick(lp), t, dB(r.in(-29, -20.5)), r.bi() * .85);
  const g = bank(24, () => G.dropGrain(r, .0011, .0036)); sprinkle(o, .5, t1, r, t => 2.2 + 1.8 * n1(t * .4), t => put(o, r.pick(g), t, dB(r.in(-44, -31)), r.bi() * .9));
  return finish(o, 1.2, .06);
});
// ---- NOW: hollow, dead calm, mist
job('amb.now', 'amb', .16, () => {
  const t0 = TM.matchCut, t1 = STORM + 1, o = Out(t0, t1), r = RNG(202), n1 = smooth(33), n2 = smooth(34), dk = t => 1 - ss(NOW1, STORM + 1, t);
  const still = t => mix(.55, 1, ss(T('now', 4), T('now', 6), t));
  for (const [f, sd, g] of [[98, 43, -44], [147, 44, -38], [221, 45, -37.5], [294, 47, -39.5], [441, 48, -42]]) layer(o, t0, t1, { seed: sd, q: 5, lp: 900, tex: [5, .4], width: .85, f: t => f * (1 + .03 * n1(t * .2 + f)), g: t => dB(g) * still(t) * dk(t) * Math.pow(clamp(.52 + .62 * n2(t * .17 + f), 0, 1.2), 1.7) });
  layer(o, t0, t1, { seed: 46, q: .6, lp: 1000, width: .95, tex: [9, .4], f: t => 330 + 90 * n1(t * .1), g: t => dB(-43.5) * dk(t) * still(t) * Math.pow(clamp(.55 + .6 * n2(t * .23 + 7), 0, 1.2), 1.6) });
  for (let t = t0 + 2.6; t < NOW1 + 1; t += r.in(2.1, 5.4)) put(o, G.drip(r), t, dB(r.in(-41, -34)), r.bi() * .8);
  const lp = bank(4, () => G.lap(r, .35)); for (let t = T('now', 5); t < NOW1; t += r.in(3.2, 6.5)) put(o, far(r.pick(lp).slice(), 700), t, dB(r.in(-36, -31)), r.bi() * .9);
  return finish(o, 1.1, .8);
});
// ---- STORM air: one wind, four throats
job('amb.storm', 'amb', .12, () => {
  const t0 = NOW1 - .2, t1 = W + 1.9, o = Out(t0, t1), n1 = smooth(35), n2 = smooth(36), v = t => wind(t), up = t => ss(NOW1, STORM + 1, t);
  layer(o, t0, t1, { seed: 51, q: .6, lp: 700, width: .9, tex: [6, .45], f: t => 95 + 8 * v(t), g: t => dB(-28.5) * up(t) * Math.pow(v(t) / 12, 1.8) });
  layer(o, t0, t1, { seed: 52, q: .8, lp: 1800, width: .85, tex: [17, .55], f: t => 180 + 34 * v(t), g: t => dB(-27) * up(t) * Math.pow(v(t) / 12, 2.1), pan: t => .5 * n1(t * .35) });
  layer(o, t0, t1, { seed: 53, q: 6.5, lp: 1800, width: .6, tex: [23, .6], f: t => 52 * v(t) + 26 * n2(t * 1.3), g: t => dB(-35) * up(t) * Math.pow(v(t) / 12, 1.8), pan: t => .4 * n2(t * .5) });   // spokes sing
  layer(o, t0, t1, { seed: 54, q: 8, lp: 900, width: .5, f: t => 25 * v(t) + 12 * n1(t * 1.1), g: t => dB(-35) * up(t) * Math.pow(v(t) / 12, 1.8), pan: t => -.4 * n1(t * .4) }); // cables and stays
  layer(o, t0, t1, { seed: 55, q: .5, lp: 800, width: .95, tex: [8, .5], f: t => 210 + 60 * n1(t * .22), g: t => dB(-31 + 5 * ss(STORM, W, t)) * up(t) * (.7 + .5 * n2(t * .31)) });      // open sea
  gain(o, W - 1.25, t1, t => t < W ? mix(1, .22, ss(W - 1.25, W - .3, t)) * mix(1, .25, ss(W - .12, W - .05, t)) : mix(.10, .6, ss(W, W + .12, t))); sweepLP(o, W + .4, t1, t => 220 + 5000 * Math.pow(1 - ss(W + .5, SLOW + .4, t), 2));
  return finish(o, .5, .7);
});
// ---- STORM rain: every drop is a bubble, a tap on stone or a pat on leather
job('amb.rain', 'amb', .08, () => {
  const t0 = STORM - 1.6, t1 = W + 1.6, o = Out(t0, t1 + .1), r = RNG(203), n1 = smooth(37), wet = bank(64, () => G.dropGrain(r, .00085, .0034)), st = bank(24, () => G.stoneTap(r)), le = bank(12, () => G.leatherTap(r));
  const rate = t => lin([[t0, 12], [STORM, 90], [T('storm', 4), 420], [T('storm', 9), 1000], [W - 1.3, 1500], [W - .1, 700], [W, 260], [W + .5, 160], [t1, 10]], t) * (1 + .6 * n1(t * .7)), sq = t => 4 * n1(t * .7);
  sprinkle(o, t0, t1, r, rate, t => { const k = r(), near = Math.pow(r(), 2.4), g = dB(-43 + 21 * near + sq(t)); if (k < .50) put(o, r.pick(wet), t, g * .8, r.bi()); else if (k < .86) put(o, r.pick(st), t, g * 1.15, r.bi()); else put(o, r.pick(le), t, g * 1.7, r.bi() * .35); });
  layer(o, t0, t1, { seed: 56, q: .7, lp: 2200, width: 1, tex: [31, .6], f: t => 900 + 160 * n1(t * .6), g: t => dB(-39) * Math.pow(rate(t) / 1000, 1) * (.6 + .5 * n1(t * 1.7 + 9)) });       // the far field, too many to count
  sweepLP(o, W + .4, t1 + .1, t => 220 + 5000 * Math.pow(1 - ss(W + .5, SLOW + .3, t), 2));
  return finish(o, .8, .4);
});
// ---- CATCH: ears under water, then the world returns quietly
job('amb.catch', 'amb', .22, () => {
  const t0 = W + .7, t1 = TM.nightIn + .6, o = Out(t0, t1), r = RNG(204), n1 = smooth(38), n2 = smooth(39), c = TM.catch_, inn = t => ss(t0, SLOW + .5, t), back = t => ss(c + .25, c + 2.1, t), gone = t => 1 - ss(TM.black - .25, TM.nightIn + .4, t);
  layer(o, t0, t1, { seed: 61, q: .8, lp: 210, width: .8, f: t => 84 + 16 * n1(t * .5), g: t => dB(-32) * inn(t) * (1 - .75 * back(t)) * gone(t) * (.75 + .35 * n2(t * .6)) });
  layer(o, t0, t1, { seed: 62, q: 4, lp: 520, width: .6, f: t => 205 + 26 * n2(t * .37), g: t => dB(-40) * inn(t) * (1 - back(t)) * gone(t) });
  layer(o, t0, t1, { seed: 63, q: .6, lp: 900, width: .9, f: t => mix(150, 430, back(t)) + 40 * n1(t * .8), g: t => dB(mix(-46, -37, back(t))) * inn(t) * gone(t) * (.75 + .35 * n1(t * .45 + 3)) });
  const g = bank(24, () => far(G.dropGrain(r, .0012, .0040), 2400)); sprinkle(o, c + .4, TM.nightIn, r, t => 46 * back(t) * gone(t), t => put(o, r.pick(g), t, dB(r.in(-50, -38)), r.bi()));
  return finish(o, .3, .4);
});
// ---- NIGHT: distance
job('amb.night', 'amb', .20, () => {
  const t0 = TM.nightIn - .3, t1 = TM.nightEnd + 2.5, o = Out(t0, t1), r = RNG(205), n1 = smooth(40), n2 = smooth(47), inn = t => ss(t0, t0 + 3, t) * (1 - ss(TM.nightEnd - .5, t1, t)), pov = t => ss(POV0 - .15, POV0 + .25, t) * (1 - ss(POV1 - .25, POV1 + .3, t));
  layer(o, t0, t1, { seed: 71, q: .5, lp: 800, width: .95, tex: [6, .4], f: t => 210 + 50 * n1(t * .12), g: t => dB(-35.5) * inn(t) * (1 - .55 * pov(t)) * (.7 + .45 * n2(t * .15)) });
  layer(o, t0, t1, { seed: 72, q: 1.4, lp: 300, width: .5, f: t => 118 + 22 * Math.sin(TAU * t * .24), g: t => dB(-37) * pov(t) * (.6 + .4 * Math.sin(TAU * t * .24)) });               // inside the bill
  const sw = bank(4, () => G.swell(r)); for (let t = t0 + .6; t < TM.nightEnd - 2; t += r.in(5.9, 7.6)) put(o, r.pick(sw), t, dB(r.in(-27, -23.5)) * (1 - .5 * pov(t + 2)), r.bi() * .6);
  // the lamp room: a slow low turn, D and A, following the beam round
  const L = o.L, R = o.R, fs = [36.7, 55, 73.4, 110.2], am = [.5, .8, 1, .22], a0 = dB(-40); let k0 = 0;
  for (let i = 0; i < o.n; i += 128) { const t = t0 + i / SR, ph = (t - beam0 - BEAM_W * .5) / BEAM_T, e = inn(t) * (.58 + .42 * Math.cos(TAU * ph)) * (1 - .4 * pov(t)), p = .6 * Math.sin(TAU * ph), k1 = e * a0; const gl = Math.cos((p + 1) * .25 * PI), gr = Math.sin((p + 1) * .25 * PI); for (let j = i; j < Math.min(o.n, i + 128); j++) { const x = k0 + (k1 - k0) * (j - i) / 128, tt = j / SR; let v = 0; for (let h = 0; h < 4; h++) v += am[h] * Math.sin(TAU * fs[h] * tt + .6 * Math.sin(TAU * .31 * tt + h)); L[j] += v * x * gl; R[j] += v * x * gr; } k0 = k1; }
  return finish(o, .5, 1.2);
});
// ---- DAWN: the sea leaving
job('amb.dawn', 'amb', .14, () => {
  const t0 = TM.nightEnd - 1.5, t1 = RIDE + 1.2, o = Out(t0, t1), r = RNG(206), n1 = smooth(48), hush = t => 1 - .66 * ss(TM.ask + 4.2, TM.ask + 6.4, t) * (1 - ss(TM.answer + .4, TM.answer + 1.4, t)), inn = t => ss(t0, t0 + 3, t) * (1 - ss(RIDE, t1, t));
  layer(o, t0, t1, { seed: 81, q: .5, lp: 900, width: .95, tex: [5, .4], f: t => 270 + 70 * n1(t * .1), g: t => dB(-43) * inn(t) * hush(t) * Math.pow(clamp(.62 + .62 * n1(t * .19 + 4), .04, 1.2), 1.7) });
  const lp = bank(4, () => far(G.lap(r, .3), 1100)); for (let t = t0 + 2; t < TM.ask + 3; t += r.in(3.2, 5.6)) put(o, r.pick(lp), t, dB(-24 - 5 * ss(TM.nightEnd, TM.ask, t)) * hush(t), r.bi() * .8);
  // sand drinking the last water: film bubbles popping, ever fewer
  const g = bank(40, () => G.dropGrain(r, .0007, .0022)), b = bank(8, () => bubble(r.in(.003, .006), r.in(.2, .4), 1));
  sprinkle(o, t0 + 1, t1, r, t => (lin([[t0, 22], [TM.nightEnd + 4, 18], [TM.crack1, 9], [TM.hatch, 6], [TM.ask, 5], [TM.answer, 1.2], [RIDE, 4]], t)) * hush(t) * (.6 + .6 * Math.max(0, n1(t * .8 + 20))), t => { if (r() < .07) put(o, r.pick(b), t, dB(-35) * inn(t), r.bi() * .7); else put(o, r.pick(g), t, dB(r.in(-44, -31)) * inn(t), r.bi()); });
  put(o, G.drip(r), mix(TM.ask, TM.answer, .70), dB(-34), -.5);
  return finish(o, 1.2, 1);
});
// ---- RIDE: the frame opens, then a long quiet sea
job('amb.ride', 'amb', .10, () => {
  const t0 = RIDE - .4, o = Out(t0, END), r = RNG(207), n1 = smooth(49), n2 = smooth(50), inn = t => ss(t0, RIDE + 3, t) * (1 - ss(END - 3.2, END - .3, t)), end = t => ss(T('ride', 24), TM.end, t), bellDuck = t => 1 - .5 * bump(TM.bellEnd + 1.0, 2.4, t), wide = t => ss(RIDE, T('ride', 12), t);
  layer(o, t0, END, { seed: 91, q: .5, lp: 950, width: .95, tex: [7, .35], f: t => 270 + 80 * n1(t * .12), g: t => dB(-39 + 3 * wide(t)) * inn(t) * bellDuck(t) * Math.pow(clamp(.70 + .55 * n2(t * .17), .08, 1.3), 1.6) });
  layer(o, t0, END, { seed: 92, q: .8, lp: 1500, width: .85, tex: [15, .5], f: t => 220 + 48 * apparent(t), g: t => dB(-42) * inn(t) * Math.pow(apparent(t) / 4.4, 2.4) * (1 - .6 * end(t)) * bellDuck(t), pan: t => .3 * n1(t * .3) });
  const lp = bank(6, i => G.lap(r, .6 + .4 * (i % 3) / 2)); for (let t = RIDE + 2; t < TM.end - 2; t += r.in(1.6, 3.4)) put(o, r.pick(lp), t, dB(r.in(-28, -20)) * bellDuck(t + .7), r.bi() * .9);
  const sw = bank(3, () => G.swell(r)); for (const [k, p] of [[-.6, -.4], [.28, .5], [.86, -.15]]) put(o, r.pick(sw), mix(TM.end, END, k) - 1.6, dB(-24), p);
  const g = bank(30, () => G.dropGrain(r, .0010, .0036)); sprinkle(o, RIDE + 1, END - 1, r, t => 3.5 * (1 - .7 * end(t)), t => put(o, r.pick(g), t, dB(r.in(-50, -39)) * bellDuck(t), r.bi()));
  return finish(o, 1, 1.5);
});
// ---- the tandem, four rides
job('tandem.then', 'fx', .10, () => finish(tandem(0, TM.matchCut, { seed: 301, per: 1 / S.rate(5), four: 1, chain: () => -29, rear: () => -34, creakF: () => -38, creakR: () => -37, feet: () => -33, sheet: () => -48, drops: () => -31, wicker: () => -34 }), .9, .03));
job('tandem.now', 'fx', .20, () => {
  // bars 0-5 and every hole where her answer was: the empty pedals come forward
  const hole = t => Math.max(1 - ss(T('now', 4, 1), T('now', 5, .5), t), bump(T('now', 8), 2.6, t), bump(T('now', 12), 2.6, t), ss(T('now', 19), T('now', 19, 2), t) * (1 - ss(NOW1 - .5, NOW1 + 1, t)));
  return finish(tandem(TM.matchCut, STORM, { seed: 302, per: 1 / S.rate(50), chain: t => mix(-37, -40, hole(t)), rear: t => mix(-29, -18, hole(t)), creakF: () => -44, creakR: t => mix(-36, -23, hole(t)), feet: t => mix(-38, -42, hole(t)), sheet: t => mix(-48, -52, hole(t)), drops: t => mix(-40, -43, hole(t)), wicker: t => mix(-39, -43, hole(t)) }), .004, .5);
});
job('tandem.storm', 'fx', .10, () => { const e = t => ss(STORM, T('storm', 8), t); return finish(tandem(STORM - .5, W + .05, { seed: 303, per: 1 / S.rate(STORM + 4), chain: t => -30 + 3 * e(t), rear: () => -32, creakF: t => -35 + 3 * e(t), creakR: t => -36 + 3 * e(t), feet: t => -33 + 2 * e(t), sheet: t => -38 + 3 * e(t), drops: t => -30 + 3 * e(t), wicker: t => -33 + 3 * e(t), coast: (x => [x[0], x[1]])(S.seg.find(x => x[2] > 0 && x[3] === 0)) }), .5, .04); });
job('tandem.ride', 'fx', .10, () => { const t0 = RIDE + 1.2, dn = t => 1 - ss(T('ride', 23), TM.bellEnd + 2, t), o = tandem(t0, TM.bellEnd + 3, { seed: 304, per: 1 / S.rate(T('ride', 8)), lift: 1, chain: t => -29.5 + 24 * Math.log10(Math.max(.01, dn(t))), rear: t => -32 + 24 * Math.log10(Math.max(.01, dn(t))), creakF: () => -42, creakR: t => -39 + 24 * Math.log10(Math.max(.01, dn(t))), feet: t => -33 + 24 * Math.log10(Math.max(.01, dn(t))), sheet: t => -46 + 24 * Math.log10(Math.max(.01, dn(t))), drops: t => -33 + 24 * Math.log10(Math.max(.01, dn(t))), wicker: t => -34 + 24 * Math.log10(Math.max(.01, dn(t))) }); gain(o, T('ride', 24), TM.bellEnd + 4, t => dn(t)); return finish(o, .2, .5); });
// ---- cloth and feathers
job('body.then', 'fx', .12, () => { const o = Out(0, TM.matchCut + .03), r = RNG(401); scarf(o, .5, TM.matchCut, () => -36, r, -.1); for (const [t, g] of [[T('then', 3, 2), -38], [T('then', 5, 2), -36], [T('then', 9, 2), -36], [T('then', 11, 1.6), -39], [T('then', 15, 2), -38]]) put(o, G.ruffle(r, { dur: .5, rate: 8, f: 1150 }), t, dB(g), r.bi() * .3); return finish(o, .6, .04); });
job('body.now', 'fx', .20, () => { const o = Out(TM.matchCut, STORM + .6), r = RNG(402); scarf(o, T('now', 1), NOW1, t => -36, r, -.32); scarf(o, NOW1, STORM + .4, t => -32, r, -.3); for (const [t, g, f] of [[T('now', 4, 1.6), -38, 900], [T('now', 10, 1.8), -36, 950], [T('now', 12, 2), -39, 900], [T('now', 16, 1.4), -39, 900], [T('now', 20, .5), -36, 800]]) put(o, G.ruffle(r, { dur: .8, rate: 5, f }), t, dB(g), r.bi() * .3); return finish(o, .5, .3); });
job('body.storm', 'fx', .10, () => { const o = Out(STORM - .4, W + .4), r = RNG(403); scarf(o, STORM - .2, W - .1, t => -32 + 3 * ss(STORM, W, t), r, -.2); for (let t = STORM + 2; t < W - 1; t += r.in(1.6, 3.2)) put(o, G.ruffle(r, { dur: r.in(.5, .9), rate: r.in(11, 16), f: 900 }), t, dB(r.in(-36, -31)), r.bi() * .4); for (let t = STORM + 1.4; t < W - .6; t += r.in(.9, 2.2)) put(o, G.wicker(r), t, dB(r.in(-35, -29)), .3); return finish(o, .3, .2); });
job('body.ride', 'fx', .12, () => { const o = Out(RIDE, TM.end), r = RNG(404), dn = t => -22 * ss(T('ride', 22), TM.end, t); scarf(o, RIDE + 2.4, TM.end - .5, t => -36 + dn(t), r, -.2); for (const [b, q, f, rt, g] of [[3, 2, 1000, 8, -37], [5, 2, 1700, 19, -35], [7, 2, 1000, 8, -38], [9, 2, 1700, 19, -35], [11, 2, 1000, 8, -38], [14, 1, 1700, 18, -38], [19, 2, 1000, 7, -39], [23, 2, 1700, 17, -37]]) put(o, G.ruffle(r, { dur: f > 1200 ? .42 : .6, rate: rt, f }), T('ride', b, q), dB(g), f > 1200 ? -.25 : .1); put(o, G.jiggle(r), T('ride', 4) + .12, dB(-34), .1); put(o, G.jiggle(r), T('ride', 8) + .12, dB(-34), .1); return finish(o, .3, .6); });
// ---- the bell: cues grouped into short windows
(() => {
  const cs = S.cues.filter(c => c.kind === 'bell').sort((a, b) => a.t - b.t), gr = []; for (const c of cs) { const g = gr[gr.length - 1]; if (g && c.t - g[g.length - 1].t < 5) g.push(c); else gr.push([c]); }
  gr.forEach((g, gi) => job('bell.' + gi, 'fx', g[0].loose ? .22 : gi === gr.length - 1 ? .34 : .26, () => {
    const o = Out(g[0].t - .3, Math.min(END, g[g.length - 1].t + (g[0].loose ? 1.6 : 3.6)));
    g.forEach((c, i) => { const r = RNG(500 + gi * 17 + i); if (c.loose) putSt(o, G.bellLoose(r), c.t - .01, dB(c.db)); else putSt(o, G.bell(r), c.t - G.bellAt, dB(c.db)); });
    return finish(o, .02, .5);
  }));
})();
// ---- birds
job('birds.then', 'amb', .42, () => { const o = Out(0, TM.matchCut + .02), r = RNG(601); for (const [t, n, p, g, f] of [[T('then', 0, 1.5), 3, .7, -37, 760], [T('then', 3, 1), 2, -.75, -40, 820], [T('then', 11, 1), 3, .55, -41, 740], [T('then', 15, .5), 2, -.6, -42, 800]]) put(o, G.gull(r, { n, f, lp: 2100 }), t, dB(g), p); return finish(o, .05, .05); });
job('birds.now', 'amb', .55, () => { const t = T('now', 3, 2.4), o = Out(t - .1, t + 4), r = RNG(602); put(o, G.gull(r, { n: 2, f: 700, lp: 1500 }), t, dB(-40), -.7); return finish(o, .05, .3); });
job('birds.dawn', 'amb', .5, () => { const t = TM.nightEnd + 2.4, o = Out(t - .1, t + 15), r = RNG(603); put(o, G.lark(r), t, dB(-43), .65); put(o, G.lark(r), TM.hatch + 1.2, dB(-45), .7); return finish(o, .05, .3); });
job('birds.ride', 'amb', .4, () => { const t0 = T('ride', 2), o = Out(t0, TM.end), r = RNG(604); for (const [b, q, n, p, g, f] of [[2, 1, 2, .6, -39, 790], [7, 1.4, 3, -.7, -39, 840], [13, 1, 4, .3, -34, 760], [13, 2.4, 3, -.5, -35, 860], [14, 1.5, 3, .7, -37, 800], [17, 1, 2, -.8, -40, 720], [22, 2, 2, .7, -43, 760]]) put(o, G.gull(r, { n, f, lp: b === 13 ? 2500 : 2000 }), T('ride', b, q), dB(g), p); put(o, G.gull(r, { n: 2, f: 690, lp: 1500 }), TM.end - 1.4, dB(-45), -.6); return finish(o, .05, .6); });
// ---- storm events
job('fx.thunder', 'fx', .18, () => { const o = Out(thunderAt[0][0] - .6, W + .3), r = RNG(701); for (const [t, , d, g, p, near] of thunderAt) { put(o, G.thunder(r, { dur: d, near, claps: 3 + near * 4 | 0 }), t - .05 * d, dB(g), p); put(o, far(G.thunder(r, { dur: d, near: near * .6, claps: 4 }), 240), t + .12, dB(g - 5), -p); } return finish(o, .1, .25); });
job('fx.slaps', 'fx', .14, () => {
  const o = Out(STORM, W + .2), r = RNG(702), g = bank(48, () => G.dropGrain(r, .0009, .0044));
  for (const [t, s, p] of slapAt) { put(o, G.slap(r, s), t - G.slapAt, dB(-22 + 10 * s), p); const n = 30 + 190 * s | 0; for (let i = 0; i < n; i++) { const u = Math.pow(r(), 1.4); put(o, r.pick(g), t + .06 + u * (.7 + .9 * s), dB(-41 + 12 * s + r.in(-6, 5)) * (1 - .6 * u), clamp(p + r.bi() * (.25 + .7 * u), -1, 1)); } }
  return finish(o, .05, .2);
});
// ---- THE WAVE
job('fx.wave', 'fx', .20, () => {
  const o = Out(W - 1.35, W + 5), ow = Out(W - 1.35, W + 5), r = RNG(703);
  // suck-back: the water leaves, pebbles roll with it, the pitch sinks, then a hole of nothing
  put(o, norm(shaped(r, 1.16, u => mix(760, 190, Math.pow(u, .8)), 1.1, u => Math.pow(u, 1.5) * (1 - ss(.94, 1, u)), 1800, 0, [22, .5])), W - 1.23, dB(-17), 0);
  const bb = bank(30, () => norm(bubble(r.in(.0022, .009), r.in(-.04, .06), 1))), pb = bank(12, () => G.stoneTap(r));
  for (let i = 0; i < 150; i++) { const u = Math.pow(r(), .55); put(o, r.pick(bb), W - 1.2 + u * 1.1, dB(-35 + 9 * u), r.bi() * (1 - .6 * u)); } for (let i = 0; i < 150; i++) { const u = Math.pow(r(), .6); put(o, r.pick(pb), W - 1.2 + u * 1.06, dB(-36 + 10 * u), r.bi() * .8); }
  // the body: a wall falls (sub), air is trapped under it (low modes), then tons of bubbles
  const th = drop(98, 36, .10, .014, .42, 2.2); add(th, drop(160, 62, .07, .010, .16, .8), 0, .55); add(th, drop(70, 31, .14, .02, .5, 1.8), .15, .7); put(o, norm(th), W, dB(-7.5), 0);
  put(o, norm(strike([[112, .8, 1], [163, .7, .9], [247, .5, .7], [371, .34, .45]], .010, 1.6)), W + .006, dB(-12), 0);
  layer(ow, W - .004, W + 4.6, { seed: 704, q: .5, lp: 2800, width: .8, tex: [19, .5], f: t => { const u = t - W; return u < .12 ? mix(360, 1050, u / .12) : 240 + 810 * Math.exp(-(u - .12) / .7); }, g: t => { const u = t - W; return u < 0 ? 0 : dB(-9.5) * (1 - Math.exp(-u / .022)) * (Math.exp(-u / .55) + .32 * Math.exp(-u / 1.5)); } });
  layer(ow, W - .004, W + 4.6, { seed: 705, q: .6, lp: 700, width: .7, tex: [7, .4], f: t => 120 + 170 * Math.exp(-(t - W) / .6), g: t => { const u = t - W; return u < 0 ? 0 : dB(-9) * (1 - Math.exp(-u / .04)) * Math.exp(-u / .9); }, pan: t => .35 * Math.sin((t - W) * 3) });
  for (let k = 0; k < 6; k++) put(ow, cloud(zeros(3.2), r, 900, () => .02 + Math.pow(r(), 1.7) * 2.7, () => .0016 * Math.pow(10, Math.pow(r(), 1.1)), .048), W, 1, (k - 2.5) / 2.6);
  ride(ow, dB(-8.2), 4); putSt(o, ow, o.t0, 1);
  // falling water
  const sp = bank(60, () => G.dropGrain(r, .0009, .0052)); for (let i = 0; i < 2600; i++) { const u = .16 + Math.pow(r(), 1.15) * 2.6; put(o, r.pick(sp), W + u, dB(-30 + r.in(-9, 4)) * Math.exp(-Math.max(0, u - .5) / .8) * ss(.1, .4, u), r.bi()); }
  // the bike
  put(o, G.skid(r), W - .44, dB(-20), .15); put(o, G.clang(r), W + .44, dB(-9), .25); put(o, G.clang(r, { f: 318, q: .7 }), W + .88, dB(-21), .35); put(o, G.wicker(r), W + .56, dB(-22), .2);
  ride(o, dB(-6.6));
  sweepLP(o, W + .6, W + 5, t => 170 + 9000 * Math.pow(1 - ss(W + .75, SLOW + .6, t), 3)); gain(o, SLOW, W + 5, t => 1 - ss(SLOW, W + 4.6, t) * .9);
  return finish(o, .12, .6);
});
job('fx.belltorn', 'fx', .45, () => { const o = Out(W + .6, W + 4), r = RNG(705); putSt(o, G.bellTorn(r, 1.3), W + .70, dB(-16)); return finish(o, .01, .4); });
// ---- CATCH
job('fx.catch', 'fx', .34, () => {
  const c = TM.catch_, o = Out(SLOW - .1, TM.nightIn + .6), r = RNG(706), big = G.heart(r, 1), egg = G.heart(r, 0), near = t => Math.max(bump(passes[0], .8, t), bump(passes[1], .8, t)), pn = t => t < mix(passes[0], passes[1], .5) ? clamp((t - passes[0]) * 1.4, -.85, .85) : clamp(-(t - passes[1]) * 1.4, -.85, .85);
  for (let t = SLOW + .15; t < c - .2; t += 1.28) put(o, big, t, dB(-15), 0);                                                    // his, slow
  for (let t = SLOW + .3; t < TM.black; t += .4) put(o, egg, t, dB((t < c ? -35 + 9 * near(t) : -36) - 18 * ss(c + .4, TM.black, t)), t < c ? pn(t) : 0);   // the egg's, fast and tiny
  passes.forEach((p, i) => putPath(o, G.whoosh(r, 1.3, 1), p - .65, () => dB(i ? -17.5 : -20.5), u => (i ? -1 : 1) * (u * 2 - 1) * .95));
  // the fallen wheel, still turning, slower and slower
  const pw = bank(5, () => norm(far(G.pawl(r), 900))); let a = 0; for (let t = SLOW + .1, v = 26; t < c - .4 && v > 2.2; t += .001, v *= .99945) { a += v * .001; if (a >= 1) { a -= 1; put(o, r.pick(pw), t, dB(-41) * ss(2, 6, v), .5); } }
  put(o, G.whup(r), c, dB(-7.5), 0); put(o, G.jiggle(r), c + .5, dB(-27), 0);
  for (let i = 0; i < 4; i++) put(o, G.drip(r), c + .8 + i * .52 + r.in(0, .2), dB(-36), r.bi() * .6);
  return finish(o, .1, .5);
});
// ---- NIGHT details
job('fx.night', 'fx', .36, () => {
  const t0 = TM.nightIn, o = Out(t0, TM.nightEnd + 1.5), r = RNG(707);
  for (const b of beamStarts) { putPath(o, G.beam(r), b, () => dB(-27), u => -.8 + 1.6 * u); }
  beamStarts.forEach((b, i) => { if (i % 2 === 1) put(o, G.lantern(r), b + BEAM_T * .52 + r.in(0, .5), dB(-34), .5); });
  for (let t = t0 + 1.4; t < TM.nightEnd; t += r.in(1.3, 3.4)) { const p = r.bi() * .8; put(o, G.drip(r), t, dB(r.in(-38, -32)) * (t > POV0 - .3 && t < POV1 ? .35 : 1), p); }
  const egg = G.heart(r, 0); for (let t = POV0; t < POV1; t += .4) put(o, egg, t, dB(-33) * ss(POV0 - .2, POV0 + .8, t) * (1 - ss(POV1 - 1.2, POV1, t)), 0);
  for (const t of taps) put(o, G.shellTap(r), t, dB(-29), .04);
  for (const [t, g] of [[T('night', 1, .2), -38], [T('night', 5, 2.4), -40], [T('night', 9, 2.2), -41], [T('night', 11, 2.6), -40]]) put(o, G.ruffle(r, { dur: .9, rate: 4, f: 820 }), t, dB(g), r.bi() * .2);
  return finish(o, .4, .6);
});
// ---- DAWN details
job('fx.dawn', 'fx', .24, () => {
  const t0 = TM.crack1 - 1.6, o = Out(t0, RIDE + .4), r = RNG(708), cr = [[TM.crack1, .28, -20, -.04], [TM.crack2, .5, -18, .05], [TM.crack3, .75, -16.5, -.02], [TM.hatch, 1, -14, 0]];
  cr.forEach(([t, s, g, p], i) => { const n = 1 + Math.min(2, i); for (let k = 0; k < n; k++) put(o, G.shellTap(r), t - .34 - .36 * k, dB(-31 + 1.5 * (n - k)), p); put(o, G.crack(r, s), t - .012, dB(g), p); });
  put(o, G.crack(r, .6), mix(TM.crack3, TM.hatch, .62), dB(-27), .06); put(o, G.crack(r, .9), TM.hatch + .17, dB(-21), -.05);
  put(o, norm(shaped(r, .5, u => mix(330, 620, u), 2, u => bump(.45, .5, u) * (.6 + .4 * Math.sin(u * 70)), 1000)), TM.hatch + .05, dB(-30), 0);     // membrane gives way
  put(o, G.shellTok(r), TM.hatch + .46, dB(-22), -.28); put(o, G.woolThump(r), TM.hatch + .74, dB(-27), .25); put(o, G.shellTok(r), TM.hatch + .80, dB(-31), .28);
  for (let i = 0; i < 5; i++) put(o, bubble(r.in(.004, .009), r.in(.1, .3), 1), TM.hatch + .95 + i * .13 + r.in(0, .07), dB(-36), 0);                // wet wriggle
  const shuffle = (t, n, g) => { for (let i = 0; i < n; i++) put(o, G.claw(r), t + i * r.in(.09, .17), dB(g + r.in(-4, 1)), .05 * r.bi()); put(o, G.woolThump(r), t + .05, dB(g + 3), 0); };
  shuffle(TM.hatch + 1.7, 3, -36); put(o, G.ruffle(r, { dur: .55, rate: 21, f: 1800, lp: 3000 }), TM.hatch + 2.5, dB(-30), 0); shuffle(TM.ask - 1.2, 2, -38);
  shuffle(mix(TM.ask, TM.answer, .46), 2, -39);                                                                                                        // then nothing, until the answer
  put(o, G.ruffle(r, { dur: .38, rate: 23, f: 1800, lp: 3000 }), TM.answer + 1.25, dB(-33), 0); shuffle(TM.answer + 1.7, 3, -36); for (let i = 0; i < 4; i++) put(o, G.flap(r, 2.3), TM.answer2 - .42 + i * .07, dB(-36), 0);
  return finish(o, .2, .3);
});
// ---- RIDE details
job('fx.ride', 'fx', .18, () => {
  const o = Out(RIDE - .1, T('ride', 12) + 2), r = RNG(709), l = TM.rideGo + .3;
  // the bike comes out of the sand: suction, release, drips, frame
  put(o, norm(shaped(r, .55, u => mix(200, 620, u * u), 2.2, u => Math.pow(bump(.62, .62, u), 1.2), 1200)), l - .4, dB(-28), 0); for (let i = 0; i < 12; i++) put(o, bubble(mix(.011, .004, i / 11), .18, 1), l - .34 + i * .036 + r.in(0, .012), dB(-31 + i * .2), .2 * r.bi()); put(o, G.pop(r), l + .08, dB(-26), 0);
  put(o, G.clang(r, { f: 410, q: .22 }), l + .16, dB(-31), .1); for (let i = 0; i < 5; i++) put(o, G.chainTick(r, 1), l + .2 + i * r.in(.04, .07), dB(-33), .2); for (let i = 0; i < 9; i++) put(o, G.drip(r), l + .2 + Math.pow(i / 9, 1.4) * 1.5, dB(-37), r.bi() * .4);
  put(o, G.creak(r, { dur: .3, cents: -500 }), l + .72, dB(-33), .05); put(o, G.bumpThud(r), l + .74, dB(-32), .05);                                    // he sits
  put(o, G.hop(r), T('ride', 1) - .27, dB(-19), -.12);
  put(o, G.footPat(r), S.seg.find(s => s[0] > RIDE)[0] - .02, dB(-29), .1); put(o, G.rearTick(r, 1), S.seg.find(s => s[0] > RIDE)[0] + .02, dB(-31), 0);   // push off
  splashAt.forEach(([t, s, p], i) => { const x = G.splash(r, s), a = (p + 1) * .25 * PI; for (let k = 0; k < x.L.length; k++) { x.L[k] *= Math.cos(a) * 1.414; x.R[k] *= Math.sin(a) * 1.414; } putSt(o, x, t, dB([-21, -20, -18][i])); });
  return finish(o, .05, .3);
});
job('fx.flock', 'fx', .24, () => {
  const t0 = flockAt, o = Out(t0 - .2, t0 + 9), r = RNG(710), nr = bank(12, () => G.flap(r, 1)), md = nr.map(m => norm(far(m.slice(), 620))), fr = nr.map(m => norm(far(m.slice(), 330))), sp = bank(20, () => G.dropGrain(r, .0016, .0050));
  for (let b = 0; b < 44; b++) {
    const lag = Math.pow(r(), 1.3) * 1.5, tp = 1.7 + lag + r.in(0, 1.7), v = r.in(6, 9.5), h = r.in(2.6, 9), side = r.bi(), fl = r.in(4.6, 6.8); let ph = r();
    for (let i = 0; i < 5; i++) { const t = t0 + lag + i * r.in(.08, .11); put(o, r.pick(sp), t, dB(-30) * r.in(.4, 1), side * .7); }                      // feet pattering off the water
    for (let t = lag + .1; t < tp + 4.2; t += r.in(.93, 1.08) / (fl * (1 + .35 * Math.exp(-(t - lag) / .8)))) { const x = v * (t - tp), D = Math.hypot(x, h), g = Math.pow(3 / Math.max(2.4, D), 1.7) * (1 - ss(tp + 2.6, tp + 4.2, t)) * ss(lag, lag + .3, t), bk = D < 6 ? nr : D < 13 ? md : fr; if (g > .015) put(o, r.pick(bk), t0 + t, dB(-17) * g * r.in(.6, 1), side * clamp(.35 + .65 * (x + 4) / 14, .2, 1)); }
  }
  return finish(o, .1, 1);
});

// ---------- live one-shots -----------------------------------------------------
const mono = (m, g = 1, pan = 0) => { const a = (pan + 1) * .25 * PI, L = new Float32Array(m.length), R = new Float32Array(m.length); for (let i = 0; i < m.length; i++) { L[i] = m[i] * g * Math.cos(a) * 1.414; R[i] = m[i] * g * Math.sin(a) * 1.414; } fadeEnds(L, .0006, .02); fadeEnds(R, .0006, .02); return { L, R }; };
const sc = (st, g) => { for (const X of [st.L, st.R]) for (let i = 0; i < X.length; i++) X[i] *= g; return st; };
const KINDS = {
  bell: r => sc(G.bell(r, { lead: .046 }), dB(-9)), belltorn: r => sc(G.bellTorn(r), dB(-9)), bellloose: r => sc(G.bellLoose(r), dB(-12)),
  splash: r => sc(G.splash(r, r.in(.8, 1.5)), dB(-11)), plink: r => mono(G.plink(r, r.in(.0030, .0058)), dB(-13), r.bi() * .3), ruffle: r => mono(G.ruffle(r, { dur: r.in(.45, .7), rate: r.in(8, 13), f: r.in(1100, 1600) }), dB(-15)),
  hop: r => mono(G.hop(r), dB(-12)), gust: r => mono(G.gust(r), dB(-14)), pop: r => mono(G.pop(r), dB(-12)), shelltap: r => mono(G.shellTap(r), dB(-14)),
  whup: r => mono(G.whup(r), dB(-9)), gull: r => mono(G.gull(r, { f: r.in(700, 860) }), dB(-18), r.bi() * .6), creak: r => mono(G.creak(r, { two: 1, cents: 9, dur: .9 }), dB(-16)), reartick: r => mono(G.rearTick(r, r() < .5 ? 0 : 1), dB(-14)), drip: r => mono(G.drip(r), dB(-16), r.bi() * .5), heart: r => mono(G.heart(r, 0), dB(-14) * r.in(.8, 1)), jiggle: r => mono(G.jiggle(r), dB(-14)), lap: r => mono(G.lap(r, .7), dB(-18)), crack: r => mono(G.crack(r, .6), dB(-12)), flap: r => mono(G.flap(r), dB(-13)),
};
// ---------- catalogue of every named sound, alone (tests, sound table) ----------
const CAT = {
  'chain tick': r => G.chainTick(r), 'rear pedal tick': r => G.rearTick(r, 0), 'creak front': r => G.creak(r, { dur: .5 }), 'creak rear (so-mi)': r => G.creak(r, { two: 1, cents: 9, dur: .95 }), 'freewheel pawl': r => G.pawl(r), 'wicker': r => G.wicker(r), 'foot on pedal': r => G.footPat(r), 'stone under wheel': r => G.bumpThud(r), 'scarf whump': r => G.clothWhump(r), 'scarf rub': r => G.clothRub(r), 'ruffle pelican': r => G.ruffle(r, { dur: .6, rate: 8, f: 1000 }), 'ruffle chick': r => G.ruffle(r, { dur: .5, rate: 21, f: 1800, lp: 3000 }),
  'bell': r => G.bell(r), 'bell loose': r => G.bellLoose(r), 'bell torn': r => G.bellTorn(r, 1.3), 'lap': r => G.lap(r, .7), 'drip': r => G.drip(r), 'plink': r => G.plink(r), 'rain drop': r => G.dropGrain(r, .0008, .003), 'stone tap (rain)': r => G.stoneTap(r), 'gull': r => G.gull(r), 'lark': r => G.lark(r), 'thunder far': r => G.thunder(r, { near: .05, dur: 5 }), 'thunder near': r => G.thunder(r, { near: .8, dur: 6 }), 'causeway slap': r => G.slap(r, .7), 'bike clang': r => G.clang(r), 'skid': r => G.skid(r), 'heart his': r => G.heart(r, 1), 'heart egg': r => G.heart(r, 0), 'egg whoosh': r => G.whoosh(r, 1.3), 'catch whup': r => G.whup(r), 'pouch jiggle': r => G.jiggle(r), 'night swell': r => G.swell(r), 'beam pass': r => G.beam(r), 'lantern creak': r => G.lantern(r), 'shell tap': r => G.shellTap(r), 'crack 1': r => G.crack(r, .28), 'crack hatch': r => G.crack(r, 1), 'shell halves': r => G.shellTok(r), 'wool thump': r => G.woolThump(r), 'claw': r => G.claw(r), 'wing flap': r => G.flap(r), 'splash': r => G.splash(r, 1), 'hop + settle': r => G.hop(r), 'gust': r => G.gust(r), 'pop': r => G.pop(r),
};
const marks = { thunder: thunderAt.map(x => ({ t: x[0], flash: x[0] - x[1] / .34 * .3, km: x[1] })), slaps: slapAt.map(x => ({ t: x[0], size: x[1], pan: x[2] })), splashes: splashAt.map(x => ({ t: x[0], size: x[1] })), taps, passes, pov: [POV0, POV1], suck: W - 1.2, wave: W, skid: W - .44, clang: W + .44, bellTorn: W + .7, bellSinks: W + 2.0, flock: [flockAt, flockAt + 7], lift: TM.rideGo + .3, hop: T('ride', 1), beam: { t0: beam0, period: BEAM_T, width: BEAM_W, level: t => { const u = ((t - beam0) % BEAM_T + BEAM_T) % BEAM_T / BEAM_W; return u < 1 && t >= beam0 ? .5 - .5 * Math.cos(TAU * u) : 0; } }, bellLead: G.bellAt };
return {
  SR, BELL_F, marks, wind, gen: G, RNG,
  jobs: () => Object.keys(J),
  render(id) { const j = J[id]; if (!j) throw new Error('FOLEY: no job ' + id); const o = j.run(), k = dB(TRIM[id] || 0); if (k !== 1) for (const X of [o.L, o.R]) for (let i = 0; i < o.n; i++) X[i] *= k; return { id, t0: o.t0, L: o.L, R: o.R, bus: j.bus, send: j.send }; },
  kinds: () => Object.keys(KINDS),
  oneshot(kind, seed = 1) { const k = KINDS[kind]; if (!k) throw new Error('FOLEY: no one-shot ' + kind); let h = 7; for (let i = 0; i < kind.length; i++) h = Math.imul(h, 31) + kind.charCodeAt(i) | 0; return k(RNG(h ^ Math.imul(seed | 0, 7919))); },
  catalogue: () => Object.keys(CAT),
  sound(name, seed = 1) { const x = CAT[name](RNG(seed * 131 + 17)); return x.L ? x : { L: x, R: x }; },
};
})();
if (typeof module !== 'undefined') module.exports = FOLEY;
