// ============================================================================
// 00_math.js - numbers: vectors, matrices, noise, easing, splines, springs.
// ============================================================================
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (6 * t - 15) + 10); };
const remap = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a));
const pulse = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));
const fract = x => x - Math.floor(x);
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const ease = { inOut: t => t * t * (3 - 2 * t), out: t => 1 - (1 - t) ** 3, in: t => t ** 3, inOut5: t => t < .5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2, back: t => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2, sine: t => .5 - .5 * Math.cos(Math.PI * t) };
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len: a => Math.hypot(a[0], a[1], a[2]),
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};
// quaternions [x,y,z,w]
const Q = {
  id: () => [0, 0, 0, 1],
  axis: (ax, a) => { const s = Math.sin(a / 2), n = V.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; },
  mul: (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]],
  rot: (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; },
  conj: q => [-q[0], -q[1], -q[2], q[3]],
  norm: q => { const l = Math.hypot(...q) || 1; return q.map(v => v / l); },
  slerp: (a, b, t) => { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1; if (d < 0) { d = -d; s = -1; } if (d > .9995) return Q.norm(a.map((v, i) => v + (b[i] * s - v) * t)); const th = Math.acos(d), st = Math.sin(th), w0 = Math.sin((1 - t) * th) / st, w1 = Math.sin(t * th) / st * s; return a.map((v, i) => v * w0 + b[i] * w1); },
  // rotation taking the +X axis to f and +Y as near as possible to u
  basis: (f, u) => { const X = V.norm(f), Z = V.norm(V.cross(X, u)), Y = V.cross(Z, X); return Q.fromAxes(X, Y, Z); },
  fromAxes: (X, Y, Z) => { const m00 = X[0], m10 = X[1], m20 = X[2], m01 = Y[0], m11 = Y[1], m21 = Y[2], m02 = Z[0], m12 = Z[1], m22 = Z[2], tr = m00 + m11 + m22; let s, q;
    if (tr > 0) { s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, .25 * s]; }
    else if (m00 > m11 && m00 > m22) { s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    else if (m11 > m22) { s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, .25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
    else { s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, .25 * s, (m10 - m01) / s]; } return Q.norm(q); },
  euler: (yaw, pitch, roll) => Q.mul(Q.mul(Q.axis([0, 1, 0], yaw), Q.axis([0, 0, 1], pitch)), Q.axis([1, 0, 0], roll)), // yaw about Y, pitch about Z (nose up +), roll about X (forward axis)
};
// 4x4 column-major
const M4 = {
  id: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul: (a, b, o = new Float32Array(16)) => { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  trs: (t, q = [0, 0, 0, 1], s = 1) => { const [x, y, z, w] = q, sx = s.length ? s[0] : s, sy = s.length ? s[1] : s, sz = s.length ? s[2] : s, m = new Float32Array(16);
    m[0] = (1 - 2 * (y * y + z * z)) * sx; m[1] = 2 * (x * y + z * w) * sx; m[2] = 2 * (x * z - y * w) * sx;
    m[4] = 2 * (x * y - z * w) * sy; m[5] = (1 - 2 * (x * x + z * z)) * sy; m[6] = 2 * (y * z + x * w) * sy;
    m[8] = 2 * (x * z + y * w) * sz; m[9] = 2 * (y * z - x * w) * sz; m[10] = (1 - 2 * (x * x + y * y)) * sz;
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1; return m; },
  pt: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
  dir: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]],
  persp: (fovy, asp, n, f) => { const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; },
  ortho: (l, r, b, t, n, f) => { const m = new Float32Array(16); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1; return m; },
  look: (e, c, up) => { const z = V.norm(V.sub(e, c)), x = V.norm(V.cross(up, z)), y = V.cross(z, x); const m = new Float32Array(16); m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[12] = -V.dot(x, e); m[13] = -V.dot(y, e); m[14] = -V.dot(z, e); m[15] = 1; return m; },
  inv: (a, o = new Float32Array(16)) => { const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14]; let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; d = 1 / d;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d; o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d; o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d; o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d; return o; },
};
// ---------- seeded noise ----------------------------------------------------
const rng = seed => { let a = (seed >>> 0) || 1; const f = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.r = (lo, hi) => lo + (hi - lo) * f(); f.s = () => f() * 2 - 1; f.g = () => Math.sqrt(-2 * Math.log(f() + 1e-9)) * Math.cos(TAU * f()); return f; };
const hash1 = n => { let h = Math.imul(n | 0, 374761393); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hash3 = (x, y, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
// smooth 1-D noise in -1..1, the hand that moves the camera, the breath in an idle pose
const wob = (t, seed = 0) => { const i = Math.floor(t), f = t - i, u = f * f * f * (f * (f * 6 - 15) + 10); return lerp(hash3(i, seed, 7), hash3(i + 1, seed, 7), u) * 2 - 1; };
const wob2 = (t, seed = 0) => wob(t, seed) * .62 + wob(t * 2.13, seed + 31) * .28 + wob(t * 4.4, seed + 77) * .12;
const noise3 = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); const H = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  return lerp(lerp(lerp(H(0, 0, 0), H(1, 0, 0), u), lerp(H(0, 1, 0), H(1, 1, 0), u), v), lerp(lerp(H(0, 0, 1), H(1, 0, 1), u), lerp(H(0, 1, 1), H(1, 1, 1), u), v), w) * 2 - 1; };
const fbm3 = (x, y, z, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * noise3(x * f, y * f, z * f); a *= .5; f *= 2.03; } return s; };
// ---------- curves ----------------------------------------------------------
const catmull = (P, t, k = 3) => { const n = P.length - 1, x = clamp(t) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i, a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(n, i + 2)], o = []; for (let j = 0; j < k; j++) o.push(.5 * (2 * b[j] + (c[j] - a[j]) * f + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * f * f + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * f * f * f)); return o; };
// piecewise keys: [[t, v], ...] with smooth in-between; v number or array
const keys = (K, t, e = ease.inOut) => { if (t <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (t < K[i][0]) { const [a, va] = K[i - 1], [b, vb] = K[i], u = (K[i][2] || e)((t - a) / (b - a)); return Array.isArray(va) ? va.map((x, j) => lerp(x, vb[j], u)) : lerp(va, vb, u); } return K[K.length - 1][1]; };
// critically-ish damped spring, stable at any step
class Spring { constructor(x = 0, f = 3, z = .5) { this.x = x; this.v = 0; this.f = f; this.z = z; } step(target, dt, acc = 0) { const w = TAU * this.f, n = Math.max(1, Math.ceil(dt * w * 1.2)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (w * w * (target - this.x) - 2 * this.z * w * this.v + acc) * h; this.x += this.v * h; } return this.x; } set(x) { this.x = x; this.v = 0; } }
