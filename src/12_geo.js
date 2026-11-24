// ============================================================================
// 12_geo.js - the workshop: tubes, lathes, rounded boxes, lofts, ellipsoids.
// All take a Geo g and add to it with g's current colour / material / bone / X.
// ============================================================================
const GK = {
  // grid of rings: rings[r][s] = {p,n?}; closed around s
  rings(g, P, { closeS = true, capA = false, capB = false, flip = false, uv = null } = {}) {
    const R = P.length, S = P[0].length, base = [];
    const nrm = (r, s) => { const s0 = closeS ? (s - 1 + S) % S : Math.max(0, s - 1), s1 = closeS ? (s + 1) % S : Math.min(S - 1, s + 1), r0 = Math.max(0, r - 1), r1 = Math.min(R - 1, r + 1); let d1 = V.sub(P[r][s1], P[r][s0]), d2 = V.sub(P[r1][s], P[r0][s]); if (V.len(d1) < 1e-7) d1 = V.sub(P[r === 0 ? 1 : R - 2][s1], P[r === 0 ? 1 : R - 2][s0]); let n = V.norm(V.cross(d1, d2)); return flip ? V.mul(n, -1) : n; };
    for (let r = 0; r < R; r++) { base.push([]); for (let s = 0; s <= (closeS ? S : S - 1); s++) { const k = s % S; base[r].push(g.v(P[r][k], nrm(r, k), uv ? uv(r / (R - 1), s / S) : [r / (R - 1), s / (closeS ? S : S - 1)])); } }
    const C = base[0].length;
    for (let r = 0; r < R - 1; r++) for (let s = 0; s < C - 1; s++) flip ? g.q(base[r][s], base[r + 1][s], base[r + 1][s + 1], base[r][s + 1]) : g.q(base[r][s], base[r][s + 1], base[r + 1][s + 1], base[r + 1][s]);
    const cap = (r, dir) => { const c = P[r].reduce((a, b) => V.add(a, b), [0, 0, 0]).map(x => x / S); let n = V.norm(V.cross(V.sub(P[r][1], P[r][0]), V.sub(P[r][Math.floor(S / 2)], P[r][0]))); const o = V.sub(P[r === 0 ? 1 : R - 2][0], P[r][0]); if (V.dot(n, o) > 0) n = V.mul(n, -1); const ci = g.v(c, n), ids = P[r].map(p => g.v(p, n)); for (let s = 0; s < S; s++) { const a = ids[s], b = ids[(s + 1) % S]; const fl = V.dot(V.cross(V.sub(P[r][s], c), V.sub(P[r][(s + 1) % S], c)), n) > 0; fl ? g.t(ci, a, b) : g.t(ci, b, a); } };
    if (capA) cap(0); if (capB) cap(R - 1); return base;
  },
  // tube along points; rad number | fn(t); ell = flattening of the second axis
  tube(g, pts, rad, { seg = 10, caps = true, up = [0, 0, 1], ell = 1, steps = 0, closed = false } = {}) {
    if (steps) { const q = []; for (let i = 0; i <= steps; i++) q.push(catmull(pts, i / steps)); pts = q; }
    const n = pts.length, R = [], f = typeof rad === 'function' ? rad : () => rad; let U = up;
    for (let i = 0; i < n; i++) { const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)], T = V.norm(V.sub(b, a)); let S = V.cross(T, U); if (V.len(S) < 1e-4) S = V.cross(T, [0, 1, .01]); S = V.norm(S); const W = V.cross(S, T); U = W; const r = f(i / (n - 1)), ring = []; for (let s = 0; s < seg; s++) { const A = s / seg * TAU; ring.push(V.add(pts[i], V.add(V.mul(S, Math.cos(A) * r), V.mul(W, Math.sin(A) * r * ell)))); } R.push(ring); }
    if (closed) R.push(R[0]);
    return GK.rings(g, R, { capA: caps && !closed, capB: caps && !closed, flip: true });
  },
  // profile [[r, y], ...] around the Y axis
  lathe(g, prof, { seg = 24, a0 = 0, a1 = TAU, X = null } = {}) { const o = g.X; if (X) g.X = o ? M4.mul(o, X) : X; const full = Math.abs(a1 - a0 - TAU) < 1e-6, R = prof.map(([r, y]) => { const ring = []; for (let s = 0; s < seg + (full ? 0 : 1); s++) { const A = a0 + (a1 - a0) * s / seg; ring.push([Math.cos(A) * Math.max(r, 1e-5), y, Math.sin(A) * Math.max(r, 1e-5)]); } return ring; }); GK.rings(g, R, { closeS: full, flip: true }); g.X = o; },
  ellipsoid(g, c, r, { seg = 20, rings = 14, q = null, u0 = 0, u1 = 1 } = {}) { const R = []; for (let i = 0; i <= rings; i++) { const u = lerp(u0, u1, i / rings) * Math.PI, ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU; let p = [Math.cos(u) * r[0], Math.sin(u) * Math.cos(a) * r[1], Math.sin(u) * Math.sin(a) * r[2]]; if (q) p = Q.rot(q, p); ring.push(V.add(c, p)); } R.push(ring); } GK.rings(g, R, { flip: false }); },
  // rounded box centred at c, half sizes h, corner radius r
  rbox(g, c, h, r = .02, { n = 3, q = null } = {}) {
    const m = Math.min(r, h[0], h[1], h[2]); const face = (ax, sg) => { const a = (ax + 1) % 3, b = (ax + 2) % 3, N = 2 * n + 1, ids = []; const co = k => { if (k <= n) return -1 + (k / n) * 1; return (k - n - 1) / n; };
      // parameter along an edge: corner arc, flat, corner arc
      const line = H => { const L = []; for (let k = 0; k <= n; k++) L.push([-(H - m), -Math.tan((1 - k / n) * Math.PI / 4)]); for (let k = 0; k <= n; k++) L.push([H - m, Math.tan(k / n * Math.PI / 4)]); return L; };
      const A = line(h[a]), B = line(h[b]); for (const [pa, na] of A) { const row = []; for (const [pb, nb] of B) { const nn = [0, 0, 0]; nn[ax] = sg; nn[a] = na; nn[b] = nb; const nv = V.norm(nn), base = [0, 0, 0]; base[ax] = sg * (h[ax] - m); base[a] = pa; base[b] = pb; let p = V.mad(base, nv, m), nr = nv; if (q) { p = Q.rot(q, p); nr = Q.rot(q, nr); } row.push(g.v(V.add(c, p), nr, [pa, pb])); } ids.push(row); }
      for (let i = 0; i < ids.length - 1; i++) for (let j = 0; j < ids[0].length - 1; j++) sg > 0 ? g.q(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]) : g.q(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]); };
    for (let ax = 0; ax < 3; ax++) { face(ax, 1); face(ax, -1); }
  },
  torus(g, c, R, r, { seg = 48, sec = 10, axis = [0, 0, 1], a0 = 0, a1 = TAU, ell = 1 } = {}) { const z = V.norm(axis), x = V.norm(V.cross(Math.abs(z[1]) < .9 ? [0, 1, 0] : [1, 0, 0], z)), y = V.cross(z, x), full = Math.abs(a1 - a0 - TAU) < 1e-6, P = []; for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg, d = V.add(V.mul(x, Math.cos(a)), V.mul(y, Math.sin(a))), ring = []; for (let s = 0; s < sec; s++) { const b = s / sec * TAU; ring.push(V.add(c, V.add(V.mul(d, R + Math.cos(b) * r), V.mul(z, Math.sin(b) * r * ell)))); } P.push(ring); } GK.rings(g, P, { capA: !full, capB: !full, flip: true }); },
  // a lump of rock / stone: displaced icosphere-ish ellipsoid
  rock(g, c, r, seed, { amp = .25, freq = 1.6, seg = 22, rings = 14, flat = .0 } = {}) { const R = []; for (let i = 0; i <= rings; i++) { const u = i / rings * Math.PI, ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU, d = [Math.cos(u), Math.sin(u) * Math.cos(a), Math.sin(u) * Math.sin(a)]; const D = [d[1], d[0], d[2]]; let k = 1 + amp * fbm3(D[0] * freq + seed * 7.1, D[1] * freq, D[2] * freq, 4) + amp * .6 * Math.abs(noise3(D[0] * freq * .8 + seed, D[1] * freq * .8 + 9, D[2] * freq * .8)); if (flat) k = Math.round(k / flat) * flat * .5 + k * .5; ring.push([c[0] + D[0] * r[0] * k, c[1] + D[1] * r[1] * k, c[2] + D[2] * r[2] * k]); } R.push(ring); } GK.rings(g, R, { flip: true }); },
  // closed loft through cross-sections {c, f (forward), u (up), ry, rz, sq (squareness), bot (belly scale)}
  loft(g, S, { seg = 24, capA = true, capB = true } = {}) { const R = S.map(s => { const f = V.norm(s.f), z = V.norm(V.cross(f, s.u || [0, 1, 0])), y = V.cross(z, f), ring = []; for (let k = 0; k < seg; k++) { const a = k / seg * TAU; let cy = Math.sin(a), cz = Math.cos(a); const e = s.sq || 1; cy = Math.sign(cy) * Math.abs(cy) ** e; cz = Math.sign(cz) * Math.abs(cz) ** e; const yy = cy * s.ry * (cy < 0 ? (s.bot ?? 1) : 1); ring.push(V.add(s.c, V.add(V.mul(y, yy), V.mul(z, cz * s.rz)))); } return ring; }); return GK.rings(g, R, { capA, capB, flip: false }); },
};
