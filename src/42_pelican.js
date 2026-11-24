// ============================================================================
// 42_pelican.js - the actor. One lofted body from tail to bill, dressed in
// about six thousand instanced feathers; a head with lids, brows, crest; a horn
// bill with a living pouch; wings with real flight feathers on a two-bone arm;
// legs on inverse kinematics. Everything is posed from one struct.
// ============================================================================
const PEL = { NS: 60 }, HS = 1.36;   // HS: how much bigger than life the head is
// u along the spine: body 0..UB, neck UB..UH, head UH..1
const UB = .40, UH = .80;
const BLADE = (nt, ns, wfun) => { const g = new Geo(); g.set([1, 1, 1], .7, 18, 0, .55); const id = []; for (let i = 0; i <= nt; i++) { const t = i / nt, row = []; for (let j = 0; j <= ns; j++) { const s = j / ns * 2 - 1; row.push(g.v([t, 0, s * wfun(t)], [0, 1, 0], [t, s])); } id.push(row); } for (let i = 0; i < nt; i++) for (let j = 0; j < ns; j++) g.q(id[i][j], id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]); return g; };
const featherW = t => Math.pow(Math.max(t, .0001), .32) * Math.pow(Math.max(0, 1 - Math.pow(t, 3.2)), .55);

class Pelican {
  constructor(o = {}) {
    this.o = Object.assign({ sex: 'he', white: C('#efe9df'), shade: C('#d9d0c6'), dark: C('#2b2628'), blush: C('#f0cdb4'), skin: C('#e6a488'), bill: C('#e79a35'), billTip: C('#c9552a'), pouch: C('#e8912e'), leg: C('#e07a2c'), iris: .30, crest: 1, scale: 1, seed: 11, age: 1 }, o);
    this.row = newRow(); this.brow = newRow(); this.sp = []; for (let i = 0; i < PEL.NS; i++) this.sp.push({ c: [0, 0, 0], q: [0, 0, 0, 1], ry: .1, rz: .1, b: 1 });
    const r = this.r = rng(this.o.seed * 97 + 5);
    this.build();
    // springs
    this.s = { pouchY: new Spring(0, 3.2, .22), pouchZ: new Spring(0, 2.6, .25), crest: new Spring(0, 3.5, .3), crestZ: new Spring(0, 3, .3), belly: new Spring(0, 4, .35), headY: new Spring(0, 5, .45), tail: new Spring(0, 4, .35), cape: new Spring(0, 2.4, .3) };
    this.last = null; this.vel = [0, 0, 0];
  }
  faceMask(u, th) { // bare skin around the eye, tapering to the bill: 0 feather .. 1 skin
    const x = (u - UH) / (1 - UH), a = Math.abs(Math.atan2(Math.sin(th), Math.abs(Math.cos(th)))); // x 0 nape..1 bill base
    const s = Math.sin(th), ex = (x - .70) / .34, ey = (s - .34) / .52; let m = 1 - smooth(.72, 1.05, Math.hypot(ex, ey)); m = Math.max(m, smooth(.84, .95, x)); m = Math.max(m, smooth(.62, .9, x) * smooth(-.35, -.75, s)); return x > 0 ? m : 0;
  }
  plumCol(u, th) { const o = this.o, s = Math.sin(th); let c = o.white; c = V.lerp(c, o.shade, smooth(.1, -1, s) * .45 * (1 - smooth(.3, .6, u))); const chest = smooth(.26, .36, u) * (1 - smooth(.44, .56, u)) * smooth(-.1, -.9, s); c = V.lerp(c, C('#f2c98f'), chest * .55); c = V.lerp(c, o.blush, smooth(.62, .82, u) * .35); const nape = smooth(.5, .75, u) * smooth(.3, 1, s); c = V.lerp(c, this.o.sex === 'he' ? C('#e6dcc6') : C('#f4dcb6'), nape * .5); return c; }
  build() {
    const o = this.o, r = this.r;
    // ---- the body loft
    { const g = new Geo(), NU = 120, NT = 40; const ids = []; for (let i = 0; i <= NU; i++) { const u = i / NU, row = []; for (let j = 0; j <= NT; j++) { const th = j / NT * TAU; const m = this.faceMask(u, th); g.set(V.mul(V.lerp(this.plumCol(u, th), o.skin, smooth(.35, .65, m)), m > .5 ? 1 : .95), m > .5 ? .55 : .85, m > .5 ? 22 : 21, 0, .25); row.push(g.v([u, th, m > .5 ? .0006 : 0], [0, 1, 0], [u * 8, th / TAU * 3], 1)); } ids.push(row); } for (let i = 0; i < NU; i++) for (let j = 0; j < NT; j++) g.q(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]); this.itBody = R.add({ v: 'LOFT', mesh: mesh(g), row: this.row, hero: true, spineN: PEL.NS }); }
    // ---- contour feathers
    const mk = (list, geo) => { const d = new Float32Array(list.length * 12); list.forEach((f, i) => d.set(f, i * 12)); return R.add({ v: 'FEATHER', mesh: mesh(geo, { inst: { data: d, n: 12 } }), row: this.row, hero: true, spineN: PEL.NS }); };
    const big = [], small = [], circ = u => this.restR(u);
    const put = (arr, u, th, L, W, lift, curl) => { const m = this.faceMask(u, th); if (m > .42) return; const c = this.plumCol(u, th), k = r.r(.92, 1.03), w = r.r(-.02, .02); arr.push([u, th, L * r.r(.86, 1.14), W * r.r(.88, 1.1), lift * r.r(.75, 1.3), r.s() * .13, curl * r.r(.6, 1.4), r.r(.90, 1), c[0] * k + w, c[1] * k, c[2] * k - w * .5, r() * 10]); };
    // body: rows from the tail forward so the tips overlap backwards like slates
    for (let u = .045; u < UB + .05;) { const k = smooth(.0, .16, u) * (1 - .62 * smooth(.24, .45, u)), L = lerp(.050, .082, k), W = L * .24, R0 = circ(u), n = Math.max(10, Math.round(TAU * R0 / (W * 1.25))); const off = r(); for (let j = 0; j < n; j++) put(big, u + r.s() * .004, (j + off + r.s() * .2) / n * TAU, L, W, .13, .10); u += L * .30 / 1.62; }
    for (let u = UB + .03; u < .985;) { const h = smooth(UH - .06, UH + .04, u), L = lerp(.036, .020, smooth(UB, UB + .12, u)) * (1 - .25 * h), W = L * .26, R0 = circ(u), n = Math.max(10, Math.round(TAU * R0 / (W * 1.35))); const off = r(); for (let j = 0; j < n; j++) put(small, u + r.s() * .003, (j + off + r.s() * .25) / n * TAU, L, W, .17 + .05 * h, .06); u += L * .30 / (u < UH ? 1.12 : .95); }
    // cheek and hind-crown fluff
    for (let i = 0; i < 260; i++) { const u = lerp(UH + .005, UH + .10, r()), sg = r() < .5 ? 0 : Math.PI, th = sg + (sg ? 1 : -1) * r.r(-.1, .75); put(small, u, th, .030, .0055, .34, .25); }
    for (let i = 0; i < 190; i++) { const k = r(), u = lerp(UH - .012, UH + .085, k * k), th = Math.PI / 2 + r.s() * r.r(.1, .75); small.push([u, th, r.r(.036, .058) * (o.sex === 'she' ? 1.35 : 1), r.r(.0060, .0085), r.r(.30, .95) * (1 - .4 * k), r.s() * .25, r.r(-.5, -.1), r.r(.92, 1), ...V.lerp(this.plumCol(u, th), o.sex === 'he' ? C('#d9cfc0') : C('#f3dcc0'), r() * .6), r() * 10]); }
    this.itBig = mk(big, BLADE(6, 4, featherW)); this.itSmall = mk(small, BLADE(3, 2, featherW)); this.nFeathers = big.length + small.length;
    // ---- rigid head pieces, legs: bones. 0 head 1 jaw 2 eyeR 3 eyeL 4 lidUR 5 lidLR 6 lidUL 7 lidLL 8 thighR 9 shankR 10 footR 11 thighL 12 shankL 13 footL 14 tear 15 footWebR 16 footWebL 17.. arm sleeves 17 upR 18 foR 19 haR 20 upL 21 foL 22 haL
    const g = new Geo(); const B = k => { g.bone = [k, 0, 0, 0]; };
    this.eyeC = [.082, .036, .0585]; this.eyeR = .0315; this.eyeYaw = 40 * DEG; this.eyePitch = 6 * DEG;
    // upper mandible: a long flattened horn with a central ridge and a hooked nail
    B(0); { const Ls = [], n = 44; for (let i = 0; i <= n; i++) { const t = i / n, x = .140 + t * .395, hook = smooth(.90, 1, t); const w = lerp(.0405, .0205, smooth(0, .55, t)) + .006 * Math.exp(-(((t - .86) / .13) ** 2)) - .0185 * Math.pow(smooth(.90, 1, t), 2), h = lerp(.034, .0095, Math.pow(t, .55)) * (1 - .6 * smooth(.95, 1, t)); const y = .012 - .030 * t + .010 * Math.sin(t * Math.PI) - hook * hook * .026; Ls.push({ c: [x - hook * hook * .008, y, 0], f: [1, -.07 - hook * 1.3, 0], ry: h, rz: w, bot: .30, sq: .9 }); } const col = (p) => { const t = clamp((p[0] - .14) / .395); let c = V.lerp(V.lerp(o.bill, C('#e9b183'), .35 * smooth(.0, .5, t)), o.billTip, smooth(.90, .97, t)); const ridge = smooth(.012, .002, Math.abs(p[2])) * smooth(.0, .3, t); c = V.lerp(c, C('#b98a86'), ridge * .55); const edge = smooth(.62, 1, Math.abs(p[2]) / lerp(.0405, .0205, smooth(0, .55, t))); return V.lerp(c, C('#d4602f'), edge * .5); }; g.set(col, .36, 8, 0, .15); GK.loft(g, Ls, { seg: 26 }); }
    g.set(C('#5a1f1a'), .6, 22); GK.ellipsoid(g, [.118, -.012, 0], [.030, .026, .034], { seg: 14, rings: 10 });
    B(1); g.set(C('#c4604e'), .45, 22, 0, .3); GK.tube(g, [[.125, -.022, 0], [.17, -.019, 0], [.215, -.021, 0], [.25, -.026, 0]], t => .016 * (1 - t * .75), { seg: 10, ell: .5, steps: 12 }); B(0);
    // nostril slits
    for (const z of [-1, 1]) { g.set([.02, .01, .01], .8, 0); GK.tube(g, [[.20, .030, z * .019], [.222, .0285, z * .0185], [.245, .0265, z * .0180]], t => .0016 * Math.sin(t * Math.PI) + .0003, { seg: 6 }); }
    // lower mandible rami (jaw bone space = head space, rotated about the hinge)
    this.hinge = [.112, -.014, 0];
    B(1); for (const z of [-1, 1]) { const pts = []; for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push(this.ramus(t, z)); } g.set(p => V.lerp(C('#dc8a3c'), C('#c0563a'), smooth(.3, .52, p[0])), .4, 8, 0, .15); GK.tube(g, pts, t => lerp(.0085, .0045, t), { seg: 8, ell: 1.25 }); }
    // eyes: ball with cornea. uv = radial, angle about +X
    for (const [bi, z] of [[2, 1], [3, -1]]) { B(bi); g.set([1, 1, 1], .2, 11); const Rr = this.eyeR, P = []; const rings = 22, seg = 28, ids = []; for (let i = 0; i <= rings; i++) { const a = i / rings * Math.PI * .72, row = []; for (let j = 0; j <= seg; j++) { const b = j / seg * TAU; let rad = Rr * (1 + .035 * Math.exp(-((a / .55) ** 2))); const d = [Math.cos(a), Math.sin(a) * Math.sin(b), Math.sin(a) * Math.cos(b)]; row.push(g.v(V.mul(d, rad), d, [a / (Math.PI * .5) * 1.12, j / seg])); } ids.push(row); } for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) g.q(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]); }
    // lids: a bowl that swings about the eye's own side-to-side axis. closed = swung down over the pupil
    const lid = (bi, up) => { B(bi); const Rr = this.eyeR * 1.062, ids = []; const n = 14, s = 26; for (let i = 0; i <= n; i++) { const v = i / n, row = []; for (let j = 0; j <= s; j++) { const b = lerp(-1, 1, j / s) * Math.PI * .60; const el = lerp(-.02, 1.75, v) + .10 * (1 - Math.cos(b)) * (1 - v); const rr = Rr * (1 + .035 * smooth(.16, .0, v)); const d = [Math.cos(el) * Math.cos(b), Math.sin(el) * (up ? 1 : -1), Math.cos(el) * Math.sin(b)]; const rim = smooth(.10, .02, v); g.set(V.lerp(V.lerp(o.skin, V.mul(o.skin, .8), v), V.mul(C('#7a3a30'), .6), rim * .75), .5, 22, 0, .25); row.push(g.v(V.mul(d, rr), d, [j / s, v])); } ids.push(row); } for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) g.q(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]); };
    lid(4, true); lid(5, false); lid(6, true); lid(7, false);
    if (o.sex === 'she') { for (const bi of [4, 6]) { B(bi); g.set([.03, .02, .02], .6, 0); for (let k = 0; k < 7; k++) { const b = lerp(-.95, .95, k / 6), z = bi === 4 ? 1 : -1, Rr = this.eyeR * 1.08, el = .02 + .10 * (1 - Math.cos(b)); const p0 = [Rr * Math.cos(el) * Math.cos(b), Rr * Math.sin(el), Rr * Math.cos(el) * Math.sin(b)], d = V.norm([Math.cos(b), .35, Math.sin(b)]); GK.tube(g, [p0, V.mad(V.mad(p0, d, .007), [0, 1, 0], .0015), V.mad(V.mad(p0, d, .013), [0, 1, 0], .007)], t => .0011 * (1 - t) + .0001, { seg: 5 }); } } }
    // legs
    this.L1 = .335; this.L2 = .375;
    for (const [b0, z] of [[8, 1], [11, -1]]) {
      B(b0); g.set((p) => V.lerp(o.white, o.shade, smooth(0, .3, p[0]) * .6), .85, 17, 0, .25); const th = []; for (let i = 0; i <= 14; i++) { const t = i / 14; th.push({ c: [t * this.L1, .004 * Math.sin(t * 3), 0], f: [1, 0, 0], ry: lerp(.088, .030, Math.pow(t, .8)) * (1 + .10 * Math.sin(t * Math.PI)), rz: lerp(.072, .028, Math.pow(t, .8)) }); } GK.loft(g, th, { seg: 18 });
      B(b0 + 1); g.set(o.leg, .5, 9, 0, .1); GK.ellipsoid(g, [0, 0, 0], [.030, .027, .026], { seg: 14, rings: 10 }); GK.tube(g, [[0, 0, 0], [.10, .003, 0], [.24, .002, 0], [this.L2, 0, 0]], t => lerp(.0205, .0150, smooth(0, .5, t)) + .004 * smooth(.8, 1, t), { seg: 12, steps: 14 }); GK.ellipsoid(g, [this.L2, 0, 0], [.021, .020, .021], { seg: 12, rings: 8 });
      // foot: x forward, y up, sole at y = -.045. Four toes joined by web (totipalmate, like a real pelican)
      B(b0 + 2); const toes = [[.155, -.040, z * -.052], [.178, -.040, z * .010], [.148, -.040, z * .068], [-.02, -.040, z * -.085]]; const root = [.012, -.022, 0]; g.set(V.mul(o.leg, .95), .5, 9, 0, .12); GK.tube(g, [[0, 0, 0], [.006, -.012, 0], root], .019, { seg: 10 });
      for (const tp of toes) { const m = [lerp(root[0], tp[0], .5), -.024, lerp(root[2], tp[2], .5)]; GK.tube(g, [root, m, tp], t => lerp(.0135, .0075, t) + .003 * Math.exp(-(((t - .55) / .1) ** 2)), { seg: 8, steps: 10 }); g.set([.10, .06, .05], .4, 8); GK.tube(g, [V.add(tp, [0, .002, 0]), V.add(tp, V.mul(V.norm(V.sub(tp, root)), .014)), V.add(V.add(tp, V.mul(V.norm(V.sub(tp, root)), .022)), [0, -.006, 0])], t => .0045 * (1 - t) + .0004, { seg: 6 }); g.set(V.mul(o.leg, .95), .5, 9, 0, .12); }
      g.set(V.mul(o.leg, 1.0), .5, 9, 0, .7); const web = (A, Bp) => { const ids = []; for (let i = 0; i <= 8; i++) { const t = i / 8, row = []; for (let j = 0; j <= 6; j++) { const s = j / 6; const pa = V.lerp(root, A, t), pb = V.lerp(root, Bp, t), sag = 1 - .16 * Math.sin(s * Math.PI) * t; const p = V.lerp(pa, pb, s); const q = V.lerp(root, p, sag); row.push(g.v([q[0], lerp(-.020, -.0425, smooth(0, .6, t)), q[2]], [0, 1, 0], [t, s])); } ids.push(row); } for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) g.q(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]); }; web(toes[0], toes[1]); web(toes[1], toes[2]); web(toes[0], toes[3]);
    }
    // a tear (bone 14)
    B(14); g.set([.42, .44, .46], .03, 15); GK.ellipsoid(g, [0, 0, 0], [.0030, .0038, .0030], { seg: 12, rings: 10 });
    // arm sleeves: plumage over the arm bones (17..22), x along the bone, unit length baked
    this.A1 = .205; this.A2 = .225; this.A3 = .115;
    for (const [b0, z] of [[17, 1], [20, -1]]) { g.set(V.mul(o.white, .97), .85, 17, 0, .25); B(b0); const sl = (L, a, b) => { const S = []; for (let i = 0; i <= 10; i++) { const t = i / 10; S.push({ c: [t * L, 0, 0], f: [1, 0, 0], ry: lerp(a, b, t) * (1 + .12 * Math.sin(t * Math.PI)), rz: lerp(a, b, t) * 1.1 }); } GK.loft(g, S, { seg: 14 }); }; sl(this.A1, .062, .042); B(b0 + 1); sl(this.A2, .043, .028); B(b0 + 2); sl(this.A3, .029, .012); }
    this.itRig = R.add({ v: 'RIG', mesh: mesh(g), row: this.brow, hero: true, tint: [o.iris, 1, 0, 0] });
    // ---- big feathers (wings, tail, crest, brows): one buffer white, one dark
    const WF = (col, tipc) => { const g2 = BLADE(10, 4, featherW); for (let i = 0; i < g2.count; i++) { const t = g2.p[i * 3], s = g2.u[i * 2 + 1]; g2.p[i * 3 + 1] = -.06 * t * t + .035 * (1 - s * s); g2.n[i * 3] = .1 * t; g2.n[i * 3 + 2] = s * .4; g2.n[i * 3 + 1] = 1; const c = V.lerp(col, tipc, smooth(.55, 1, t)); g2.c[i * 4] = c[0]; g2.c[i * 4 + 1] = c[1]; g2.c[i * 4 + 2] = c[2]; g2.c[i * 4 + 3] = lerp(.6, 1, smooth(0, .4, t)); } return g2; };
    this.wfW = []; this.wfD = []; this.wfG = []; this.plan();
    this.bufW = new Float32Array(this.wfW.length * 12); this.bufD = new Float32Array(this.wfD.length * 12); this.bufG = new Float32Array(this.wfG.length * 12);
    this.itW = R.add({ v: 'WFEATHER', mesh: mesh(WF(o.white, V.mul(o.white, .97)), { inst: { data: this.bufW, n: 12, dynamic: true } }), hero: true }); this.itD = R.add({ v: 'WFEATHER', mesh: mesh(WF(o.dark, V.mul(o.dark, .65)), { inst: { data: this.bufD, n: 12, dynamic: true } }), hero: true });
    { const bc = o.sex === 'he' ? C('#7a6e64') : C('#a98d74'); this.itG = R.add({ v: 'WFEATHER', mesh: mesh(WF(bc, V.lerp(bc, o.white, .5)), { inst: { data: this.bufG, n: 12, dynamic: true } }), hero: true }); }
    // ---- pouch: live sheet
    this.PU = 34; this.PV = 20; { const g3 = new Geo(); g3.set(p => [1, 1, 1], .42, 10, 0, 1); for (let i = 0; i <= this.PU; i++) for (let j = 0; j <= this.PV; j++) { const u = i / this.PU; g3.col = V.lerp(V.lerp(o.pouch, C('#f0b46a'), smooth(.3, .0, u) * .5), V.lerp(o.skin, o.pouch, .4), smooth(.72, 1, u)); g3.v([0, 0, 0], [0, -1, 0], [u * 1.2, j / this.PV]); } const w = this.PV + 1; for (let i = 0; i < this.PU; i++) for (let j = 0; j < this.PV; j++) g3.q(i * w + j, (i + 1) * w + j, (i + 1) * w + j + 1, i * w + j + 1); this.pGeo = g3; this.itPouch = R.add({ v: '', mesh: mesh(g3, { dynamic: true }), hero: true }); this.pBuf = g3.pack(); this.pF = new Float32Array(this.pBuf); }
  }
  restR(u) { const [ry, rz] = this.radii(u); return (ry + rz) / 2; }
  // rest cross-section by u
  radii(u) {
    if (u <= UB) { const t = u / UB, K = [[0, [.016, .060]], [.10, [.036, .070]], [.24, [.092, .102]], [.42, [.178, .174]], [.62, [.222, .216]], [.80, [.205, .197]], [.92, [.150, .142]], [1, [.108, .102]]]; return keys(K, t, x => x); }
    if (u <= UH) { const t = (u - UB) / (UH - UB), K = [[0, [.108, .102]], [.15, [.092, .086]], [.35, [.076, .072]], [.65, [.066, .063]], [.88, [.066, .063]], [1, [.073, .069]]]; return keys(K, t, x => x); }
    const t = (u - UH) / (1 - UH), K = [[0, [.054, .051]], [.18, [.071, .064]], [.36, [.083, .073]], [.54, [.084, .076]], [.70, [.073, .070]], [.86, [.051, .056]], [1, [.034, .0435]]]; return keys(K, t, x => x).map(v => v * HS);
  }
  ramus(t, z) { const w = lerp(.0395, .0185, smooth(0, .6, t)) + .005 * Math.exp(-(((t - .86) / .13) ** 2)) - .0155 * smooth(.93, 1, t); return [.118 + t * .400, -.0055 - .026 * t + .010 * Math.sin(t * Math.PI) - .004 * smooth(.9, 1, t), z * w]; }
  plan() { // every big feather: {wing:0 R|1 L|-1, kind, a (along arm 0..1), len, wid, lay}
    const W = this.wfW, D = this.wfD;
    for (const w of [0, 1]) {
      for (let i = 0; i < 9; i++) D.push({ w, k: 'prim', i, n: 9, len: lerp(.30, .40, i / 8) * (i > 6 ? .94 : 1), wid: .040, lay: .000 });
      for (let i = 0; i < 11; i++) D.push({ w, k: 'sec', i, n: 11, len: lerp(.27, .25, i / 10), wid: .044, lay: .001 });
      for (let i = 0; i < 5; i++) W.push({ w, k: 'ter', i, n: 5, len: lerp(.20, .25, i / 4), wid: .050, lay: .004 });
      for (let i = 0; i < 18; i++) W.push({ w, k: 'gc', i, n: 18, len: lerp(.165, .150, i / 17), wid: .034, lay: .008 });
      for (let i = 0; i < 20; i++) W.push({ w, k: 'mc', i, n: 20, len: .112, wid: .030, lay: .014 });
      for (let i = 0; i < 22; i++) W.push({ w, k: 'lc', i, n: 22, len: .080, wid: .026, lay: .020 });
      for (let i = 0; i < 24; i++) W.push({ w, k: 'lc2', i, n: 24, len: .060, wid: .024, lay: .026 });
      for (let i = 0; i < 18; i++) W.push({ w, k: 'un', i, n: 18, len: .13, wid: .034, lay: -.010 });
      for (let i = 0; i < 84; i++) W.push({ w, k: 'arm', i, n: 84, len: lerp(.085, .050, (i / 84)), wid: .030, lay: 0, j: this.r(), b: this.r() });
      for (let i = 0; i < 40; i++) this.wfG.push({ w, k: 'brow', i, n: 40, len: .025 + .016 * this.r(), wid: .0074, lay: 0, j: this.r.s(), b: this.r() });
    }
    for (let i = 0; i < 13; i++) W.push({ w: -1, k: 'tail', i, n: 13, len: .20 * (1 - .22 * Math.abs(i - 6) / 6), wid: .045 });
    for (let i = 0; i < 12; i++) W.push({ w: -1, k: 'crest', i, n: 12, len: (.050 + .045 * this.r()) * (this.o.sex === 'she' ? 1.6 : 1.1), wid: .0065, j: this.r.s() * this.r(), b: this.r() });
    for (const w of [0, 1]) for (let i = 0; i < 46; i++) W.push({ w: -2 - w, k: 'thigh', i, n: 46, len: .075, wid: .030, j: this.r(), b: this.r() });
    for (let i = 0; i < 30; i++) W.push({ w: -1, k: 'rump', i, n: 30, len: .10, wid: .032, j: this.r.s(), b: this.r() });
  }
  // sample the live spine on the CPU
  at(u) { const x = clamp(u) * (PEL.NS - 1), i = Math.min(PEL.NS - 2, Math.floor(x)), f = x - i, a = this.sp[i], b = this.sp[i + 1]; return { c: V.lerp(a.c, b.c, f), q: Q.slerp(a.q, b.q, f), ry: lerp(a.ry, b.ry, f), rz: lerp(a.rz, b.rz, f), b: lerp(a.b, b.b, f) }; }
  surf(u, th, out = 0) { const s = this.at(u), sy = Math.sin(th), cz = Math.cos(th), ry = s.ry * (sy < 0 ? s.b : 1); const d = V.norm([0, sy / ry, cz / s.rz]); return V.add(s.c, Q.rot(s.q, V.mad([0, sy * ry, cz * s.rz], d, out))); }
  ik(a, t, l1, l2, pole) { let d = V.sub(t, a), L = V.len(d); const mx = (l1 + l2) * .9995; if (L > mx) { d = V.mul(d, mx / L); L = mx; t = V.add(a, d); } const n = V.mul(d, 1 / L), x = (L * L + l1 * l1 - l2 * l2) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)); let p = V.sub(pole, V.mul(n, V.dot(pole, n))); p = V.norm(p); return [V.mad(V.mad(a, n, x), p, h), t]; }
  // ------------------------------------------------------------------ POSE
  pose(P) {
    const o = this.o, S = o.scale, M = P.M, dt = clamp(P.dt ?? 1 / 60, 0, .05), t = P.t || 0; const W = p => M4.pt(M, [p[0] * S, p[1] * S, p[2] * S]), Wd = d => V.norm(M4.dir(M, d));
    const h = Object.assign({ yaw: 0, pitch: 0, roll: 0 }, P.head), nk = Object.assign({ up: 0, fwd: 0, side: 0, s: 0 }, P.neck);
    const br = P.breath || 0, lean = P.lean || 0, sq = P.squash || 0, shiver = P.shiver || 0; const shk = k => shiver * (.0035 * Math.sin(t * 61 + k * 2.1) + .003 * Math.sin(t * 47 + k));
    // root acceleration drives the soft parts
    const root = W([0, .2, 0]); let acc = [0, 0, 0]; if (this.last && dt > 1e-4) { const v = V.mul(V.sub(root, this.last), 1 / dt); if (V.len(V.sub(v, this.vel)) < 6) acc = V.mul(V.sub(v, this.vel), 1 / dt); this.vel = v; } this.last = root; const ay = clamp(acc[1], -30, 30);
    const s = this.s; s.belly.step(0, dt, -ay * .10); s.headY.step(0, dt, -ay * .06);
    // ---- body control points, hip space
    const cl = Math.cos(lean), sl = Math.sin(lean); const rot = p => [p[0] * cl - p[1] * sl * -1 * -1, p[0] * sl * -1 + p[1] * cl, p[2]]; // lean > 0 bows forward
    const rf = p => [p[0] * cl + p[1] * sl, -p[0] * sl + p[1] * cl, p[2]];
    const tw = P.twist || 0, sd = P.side || 0; const tws = (p, k) => { const a = tw * k, c = Math.cos(a), q = Math.sin(a); return [p[0] * c - p[2] * q, p[1], p[0] * q + p[2] * c + sd * k * p[1]]; };
    const by = s.belly.x * .5; const tl = P.tail || 0;
    const body = [[-.445, .035 + tl * .5, 0], [-.335, .055 + tl * .3, 0], [-.215, .070 + tl * .1, 0], [-.085, .108, 0], [.050, .175 + by * .4, 0], [.170, .275 + br * .010 + by * .3, 0], [.238, .375 + br * .016, 0]].map((p, i) => { let q = i < 2 ? p : rf(p); return tws(q, smooth(0, 6, i)); });
    const N0 = body[6], chestDir = V.norm(V.sub(body[6], body[5]));
    // ---- head frame. default head joint position relative to neck base, stretched by the acting
    const up = nk.up, fw = nk.fwd; const reach = [.070 + fw * .16 - up * .02, .318 + up * .085 - fw * .05, nk.side * .12 + sd * .1]; let HJ = V.add(N0, reach); HJ = [HJ[0], HJ[1] + s.headY.x * .3 + shk(1), HJ[2] + shk(2)];
    const qh = Q.mul(Q.euler(-h.yaw, h.pitch, 0), Q.axis([1, 0, 0], h.roll)); const HF = Q.rot(qh, [1, 0, 0]), HU = Q.rot(qh, [0, 1, 0]);
    // neck: cubic from chest to the nape with an S that tightens when drawn in
    const nape = V.add(HJ, Q.rot(qh, [-.050 * HS, -.018 * HS, 0])); const Lk = V.dist(N0, nape); const back = .10 + nk.s * .08 - up * .05; const n1 = V.add(N0, V.add(V.mul(chestDir, Lk * .40), [-.01, .02, 0])), n2 = V.add(nape, V.add(V.mul(HF, -.120 - back * .3), V.add(V.mul(HU, -.085), [-back * .25, -.03, 0])));
    const bez = k => { const i = 1 - k; return [0, 1, 2].map(j => i * i * i * N0[j] + 3 * i * i * k * n1[j] + 3 * i * k * k * n2[j] + k * k * k * nape[j]); };
    // ---- spine samples
    const NS = PEL.NS, pts = []; for (let i = 0; i < NS; i++) { const u = i / (NS - 1); let p; if (u <= UB) p = catmull(body, u / UB); else if (u <= UH) p = bez((u - UB) / (UH - UB)); else { const x = (u - UH) / (1 - UH); p = V.add(HJ, Q.rot(qh, [lerp(-.050, .165, x) * HS, (lerp(-.018, -.002, x) + .022 * Math.sin(Math.min(1, x * 1.15) * Math.PI)) * HS, 0])); } pts.push(p); }
    const zH = Q.rot(qh, [0, 0, 1]);
    for (let i = 0; i < NS; i++) { const u = i / (NS - 1), T = V.norm(V.sub(pts[Math.min(NS - 1, i + 1)], pts[Math.max(0, i - 1)])); const a = tw * smooth(0, UB, u); const kz = smooth(UB, UH - .02, u); let z = V.lerp(Q.rot(Q.axis([0, 1, 0], -(tw + (h.yaw - tw) * kz)), [0, 0, 1]), zH, smooth(UH - .10, UH + .01, u)); if (u <= UB) z = [-Math.sin(a), sd * .6 * smooth(0, UB, u), Math.cos(a)]; z = V.norm(V.sub(z, V.mul(T, V.dot(T, z)))); const y = V.cross(z, T); const q = Q.fromAxes(T, y, z); let [ry, rz] = this.radii(u); let bt = 1; const ch = Math.exp(-(((u - .27) / .09) ** 2)); ry *= 1 + ch * (.045 * br + sq * .05); rz *= 1 + ch * (.05 * br + sq * .08); bt = 1 + ch * (.05 * br + s.belly.x * .25 + sq * .1); if (u > UB && u < UH) { const th = Math.exp(-(((u - .64) / .10) ** 2)) * (P.throat || 0); ry *= 1 + th * .16; rz *= 1 + th * .12; } if (u >= UH) { const x = (u - UH) / (1 - UH); bt = lerp(1, .78, smooth(.2, .9, x)); const puff = (P.cheek || 0) * Math.exp(-(((x - .30) / .25) ** 2)); rz *= 1 + puff * .16; bt *= 1 + puff * .12; }
      const wp = W(pts[i]), wq = Q.norm(Q.mul(this.qOf(M), q)), sc = this.sp[i]; sc.c = wp; sc.q = wq; sc.ry = ry * S; sc.rz = rz * S; sc.b = bt; const k = (this.row * BONE_W + i * 3) * 4; boneData[k] = wp[0]; boneData[k + 1] = wp[1]; boneData[k + 2] = wp[2]; boneData[k + 3] = ry * S; boneData[k + 4] = wq[0]; boneData[k + 5] = wq[1]; boneData[k + 6] = wq[2]; boneData[k + 7] = wq[3]; boneData[k + 8] = rz * S; boneData[k + 9] = bt; boneData[k + 10] = 0; boneData[k + 11] = 0; }
    // ---- head bone (world)
    const qM = this.qOf(M), HM = this.headM = M4.trs(W(HJ), Q.norm(Q.mul(qM, qh)), S * HS); setBone(this.brow, 0, HM); const HX = p => M4.pt(HM, p);
    // jaw
    const jaw = (P.jaw || 0); const jq = Q.axis([0, 0, 1], -jaw); const JL = M4.mul(M4.trs(this.hinge, jq), M4.trs(V.mul(this.hinge, -1))); const JM = this.jawM = M4.mul(HM, JL); setBone(this.brow, 1, JM);
    // eyes
    const gz = P.gaze || [0, 0], lu = P.lidU ?? .18, ll = P.lidL ?? .08, bk = P.blink || 0; const eyes = [];
    for (const [z, be, bu, bl] of [[1, 2, 4, 5], [-1, 3, 6, 7]]) { const ec = [this.eyeC[0], this.eyeC[1], this.eyeC[2] * z]; const base = Q.mul(Q.axis([0, 1, 0], -this.eyeYaw * z), Q.axis([0, 0, 1], this.eyePitch)); const gq = Q.mul(base, Q.mul(Q.axis([0, 1, 0], clamp(-gz[0], -.6, .6)), Q.axis([0, 0, 1], clamp(gz[1], -.5, .5)))); setBone(this.brow, be, M4.mul(HM, M4.trs(ec, gq))); eyes.push(M4.pt(HM, ec)); const asym = (P.wink || 0) * z; const cu = clamp(Math.max(lu + asym, bk)), cl2 = clamp(Math.max(ll, bk * .35)); const tiltIn = (P.lidTilt || 0) * z; const lidB = lerp(-1.02, .02, cl2), lidA = lerp(1.22, Math.min(-.10, lidB + .05), cu); // closed upper lid drops just past centre
      setBone(this.brow, bu, M4.mul(HM, M4.trs(ec, Q.mul(base, Q.mul(Q.axis([1, 0, 0], tiltIn), Q.axis([0, 0, 1], lidA)))))); setBone(this.brow, bl, M4.mul(HM, M4.trs(ec, Q.mul(base, Q.mul(Q.axis([1, 0, 0], -tiltIn * .4), Q.axis([0, 0, 1], lidB)))))); }
    this.eyesW = eyes;
    // tear
    { const k = P.tear || 0; if (k > 0 && k < 1) { const path = [[.100, .010, .083], [.118, -.004, .078], [.145, -.012, .052], [.20, -.018, .043], [.26, -.028, .038]]; const p = catmull(path, smooth(.15, .9, k)); const q = k > .9 ? [p[0], p[1] - (k - .9) * (k - .9) * 30, p[2]] : p; setBone(this.brow, 14, M4.mul(HM, M4.trs(q, [0, 0, 0, 1], k < .15 ? k / .15 : 1))); } else setBone(this.brow, 14, M4.trs([0, -99, 0], [0, 0, 0, 1], .001)); }
    // ---- legs
    this.hipsW = []; const footT = P.feet || null; for (const [b0, z, key] of [[8, 1, 'R'], [11, -1, 'L']]) { const hip = W([.005, -.005, .098 * z]); this.hipsW.push(hip); let ank, fq; if (footT && footT[key]) { ank = footT[key].p; fq = footT[key].q || qM; } else { ank = W([.20, -.02, .13 * z]); fq = qM; } const pole = Wd([1, .25 + (P.kneeUp || 0), .22 * z + (P.kneeOut || 0) * z]); const [kn, an] = this.ik(hip, ank, this.L1 * S, this.L2 * S, pole); const up2 = Wd([0, 0, -z]); const TM = M4.trs(hip, Q.basis(V.sub(kn, hip), Wd([0, 1, 0])), S); (this.thM = this.thM || [])[z > 0 ? 0 : 1] = TM; setBone(this.brow, b0, TM); setBone(this.brow, b0 + 1, M4.trs(kn, Q.basis(V.sub(an, kn), pole), S)); setBone(this.brow, b0 + 2, M4.trs(an, fq, S)); }
    // ---- wings: shoulder, elbow, wrist, tip
    s.cape.step(0, dt, ay * .05); this.wing = []; let wi = 0;
    for (const z of [1, -1]) { const key = z > 0 ? 'R' : 'L', wg = Object.assign({ mode: 'fold', spread: 0 }, (P.wings || {})[key]); const sh = W(tws(rf([.135, .345, .150 * z]), .8)); const shr = Wd([0, wg.shrug || 0, 0]); const SH = V.mad(sh, Wd([0, 1, 0]), (wg.shrug || 0) * .03 + br * .006);
      let wr, tip, pole; const spread = wg.spread || 0, flap = wg.flap || 0;
      // folded: elbow back, wrist forward, hand back along the flank
      const fE = Wd([-1, -.25, .5 * z]); const fW = W(rf([.175, .225, .205 * z])), fT = W(rf([-.02, .145, .225 * z]));
      const oW = V.add(SH, V.add(V.mul(Wd([.10 + .25 * (wg.sweep || 0), .34 + flap * .62, .92 * z]), .40 * S), [0, 0, 0])), oT = V.add(oW, V.mul(Wd([.12 - .1 * spread, .22 + flap * .85, .95 * z]), this.A3 * S));
      if (wg.target) { wr = V.lerp(fW, wg.target, wg.k ?? 1); const dirT = wg.dir ? V.norm(wg.dir) : Wd([.55, -.35, -.25 * z]); tip = V.mad(wr, dirT, this.A3 * S); pole = V.norm(V.lerp(fE, Wd([-.55, -.45, .85 * z]), wg.k ?? 1)); } else { wr = V.lerp(fW, oW, spread); tip = V.lerp(fT, oT, spread); pole = V.norm(V.lerp(fE, Wd([-.4, .25, .3 * z]), spread)); }
      const [el, w2] = this.ik(SH, wr, this.A1 * S, this.A2 * S, pole); const hd = V.norm(V.sub(tip, w2)), tp = V.mad(w2, hd, this.A3 * S);
      const b0 = z > 0 ? 17 : 20, upv = Wd([0, 1, 0]); setBone(this.brow, b0, M4.trs(SH, Q.basis(V.sub(el, SH), upv), S)); setBone(this.brow, b0 + 1, M4.trs(el, Q.basis(V.sub(w2, el), upv), S)); setBone(this.brow, b0 + 2, M4.trs(w2, Q.basis(hd, upv), S));
      this.wing.push({ SH, el, wr: w2, tip: tp, hd, z, spread, grip: wg.target ? (wg.k ?? 1) : 0, flap, wg }); wi++; }
    this.bigFeathers(P, M, Wd, acc, dt, t);
    this.pouchPose(P, W, Wd, acc, dt, t);
    const wet = P.wet || 0, lift = (P.puff || 0) * .35; this.itBig.tint = [wet, 0, 0, lift]; this.itSmall.tint = [wet, 0, 0, lift * .8 + (P.chill || 0) * .1]; this.itRig.tint = [(P.pupil ?? o.iris), .6, 0, 0];
    const vis = P.vis !== false; for (const it of [this.itBody, this.itBig, this.itSmall, this.itRig, this.itW, this.itD, this.itG, this.itPouch]) { it.vis = vis; it.onlyRefl = !!P.onlyRefl; }
    this.billTip = HX([.53, -.03, 0]); this.crown = HX([.02, .09, 0]); this.neckU = u => this.at(u);
  }
  qOf(M) { if (this._qm === M) return this._q; const sx = Math.hypot(M[0], M[1], M[2]); this._qm = M; this._q = Q.fromAxes([M[0] / sx, M[1] / sx, M[2] / sx], [M[4] / sx, M[5] / sx, M[6] / sx], [M[8] / sx, M[9] / sx, M[10] / sx]); return this._q; }
  // write one big feather: root p, direction d, surface normal n, length, width
  wf(buf, k, p, d, n, L, w, curl = 0) { const X = V.norm(d), Z = V.norm(V.cross(X, n)), Y = V.cross(Z, X); const o = k * 12; buf[o] = X[0] * L; buf[o + 1] = Y[0] * L * .9; buf[o + 2] = Z[0] * w; buf[o + 3] = p[0]; buf[o + 4] = X[1] * L; buf[o + 5] = Y[1] * L * .9; buf[o + 6] = Z[1] * w; buf[o + 7] = p[1]; buf[o + 8] = X[2] * L; buf[o + 9] = Y[2] * L * .9; buf[o + 10] = Z[2] * w; buf[o + 11] = p[2]; }
  bigFeathers(P, M, Wd, acc, dt, t) {
    const S = this.o.scale, wind = P.wind || [0, 0, 0], gust = P.gust || 0; let kw = 0, kd = 0; const s = this.s; s.crest.step(0, dt, -acc[1] * .25 - acc[0] * .1); s.tail.step(0, dt, -acc[1] * .12);
    const arm = (w, a) => { // a 0..1 along shoulder-elbow-wrist-tip -> point, direction
      const l1 = .34, l2 = .40; if (a < l1) return [V.lerp(w.SH, w.el, a / l1), V.norm(V.sub(w.el, w.SH))]; if (a < l1 + l2) return [V.lerp(w.el, w.wr, (a - l1) / l2), V.norm(V.sub(w.wr, w.el))]; return [V.lerp(w.wr, w.tip, (a - l1 - l2) / (1 - l1 - l2)), w.hd]; };
    const right = Wd([0, 0, 1]), up = Wd([0, 1, 0]), fwd = Wd([1, 0, 0]);
    const nWing = this.wing.map(w => { // plane normal of the wing: up when spread, outward when folded or gripping
      const out = V.mul(right, w.z); const spr = V.norm(V.add(V.mul(up, 1), V.mul(fwd, .12))); return V.norm(V.lerp(V.add(out, V.mul(up, .35)), spr, smooth(.2, .9, w.spread))); });
    const one = (f, buf, k) => {
      const ru = hash1(f.i * 31 + f.w * 101 + f.k.length * 7);
      if (f.w >= 0 && f.k !== 'brow' && f.k !== 'thigh' && f.k !== 'arm') {
        const w = this.wing[f.w], n = nWing[f.w], sp = w.spread, g = w.grip, x = f.n > 1 ? f.i / (f.n - 1) : 0; let a, ph, len = f.len, lay = f.lay, back;
        if (f.k === 'prim') { a = lerp(.76, 1.0, x); ph = lerp(lerp(.62, 1.15, x), lerp(.30, 1.38, x), sp); } else if (f.k === 'sec') { a = lerp(.36, .745, x); ph = lerp(lerp(.35, .60, x), lerp(-.02, .28, x), sp); } else if (f.k === 'ter') { a = lerp(.12, .36, x); ph = lerp(.35, -.12, sp); }
        else if (f.k === 'gc') { a = lerp(.10, .97, x); ph = lerp(.45, lerp(-.02, 1.05, smooth(.6, 1, x)), sp); } else if (f.k === 'mc') { a = lerp(.07, .97, x); ph = lerp(.5, lerp(0, .95, smooth(.6, 1, x)), sp); } else if (f.k === 'lc') { a = lerp(.03, .98, x); ph = lerp(.55, lerp(.02, .9, smooth(.6, 1, x)), sp); } else if (f.k === 'lc2') { a = lerp(.0, .99, x); ph = lerp(.55, lerp(.05, .9, smooth(.6, 1, x)), sp); } else { a = lerp(.08, .95, x); ph = lerp(.4, lerp(0, .9, smooth(.6, 1, x)), sp); }
        const [p, d] = arm(w, a); // trailing edge direction: behind the arm
        let tr = V.sub(V.mul(fwd, -1), V.mul(d, V.dot(V.mul(fwd, -1), d))); if (V.len(tr) < .15) tr = V.mul(up, -1); tr = V.norm(tr); const grT = V.norm(V.add(V.mul(up, -.50), V.add(V.mul(fwd, -.85), V.mul(right, w.z * .10)))); tr = V.norm(V.lerp(tr, V.norm(V.sub(grT, V.mul(d, V.dot(grT, d) * .5))), g));
        const foldD = V.norm(V.add(V.mul(fwd, -1), V.mul(up, -.22 - .06 * x))); let dir = V.norm(V.add(V.mul(tr, Math.cos(ph)), V.mul(d, Math.sin(ph)))); dir = V.norm(V.lerp(dir, foldD, (1 - sp) * (1 - g) * .85));
        if (g > 0) { len *= lerp(1, f.k === 'prim' ? .34 : f.k === 'sec' ? .72 + .12 * ru : .85, g); if (f.k === 'prim') { // fingers: curl round the grip
            dir = V.norm(V.lerp(dir, V.norm(V.add(V.mul(w.hd, .85), V.add(V.mul(up, -.45 - .2 * x), V.mul(right, -w.z * (.5 - x) * .5)))), g)); } }
        // wind and follow-through
        const fl = (f.k === 'prim' || f.k === 'sec' ? 1 : .45) * (.05 + .28 * gust) * (Math.sin(t * (7 + 3 * ru) + f.i * .9) * .6 + Math.sin(t * 3.1 + ru * 9)); dir = V.norm(V.add(dir, V.mul(n, fl * .5 + s.cape.x * .6 + (f.k === 'un' ? -.1 : .03)))); const bend = w.flap * sp * -.25; dir = V.norm(V.add(dir, V.mul(up, bend * x)));
        this.wf(buf, k, V.mad(p, n, (f.lay + .012) * S * (f.k === 'un' ? 1 : 1)), dir, n, len * S, f.wid * S); return;
      }
      if (f.k === 'brow') { // a tuft rooted on the skull itself, laid along a line from the inner front corner up and back over the eye
        const z = f.w === 0 ? 1 : -1, x = (f.i + .5 * f.b) / f.n, br = Object.assign({ up: 0, tilt: 0 }, P.brow); // tilt + = worried (inner end up), - = stern
        const line = k => { const u = lerp(.968, .892, k), th = (43 + 13 * Math.sin(k * Math.PI * .85) + br.up * 9 + (.5 - k) * br.tilt * 20 + f.j * 3.2) * DEG; return this.surf(u, z > 0 ? th : Math.PI - th, .0055 * S); };
        const a = line(x), b2 = line(x + .10), d0 = V.norm(V.sub(b2, a)), cc = this.at(lerp(.968, .892, x)).c, nO = V.norm(V.sub(a, cc)); const dir = V.norm(V.add(d0, V.mul(nO, .40 + f.j * .16)));
        this.wf(buf, k, a, dir, nO, f.len * S * HS * .95, f.wid * S * HS); return; }
      if (f.k === 'arm') { const w = this.wing[f.w], x = f.i / f.n, a = lerp(.0, .80, x), ring = f.i % 8, th = (ring + f.j * .5 + (Math.floor(f.i / 8) % 2) * .5) / 8 * TAU; const [p, d] = arm(w, a); const sd2 = V.norm(V.cross(d, up)), u2 = V.cross(sd2, d); const n = V.add(V.mul(u2, Math.sin(th)), V.mul(sd2, Math.cos(th))); const R1 = (a < .34 ? lerp(.060, .043, a / .34) : lerp(.043, .028, (a - .34) / .40)) * S; this.wf(buf, k, V.mad(p, n, R1 * .92), V.norm(V.add(V.add(d, V.mul(n, .12)), V.mul(up, -.28))), n, f.len * S, f.wid * S); return; }
      if (f.k === 'tail') { const x = f.i / (f.n - 1) * 2 - 1, at = this.at(.06), fan = .32 + .5 * (P.tailFan || 0); const d = Q.rot(at.q, V.norm([-1, .06 - .05 * x * x + s.tail.x * .5, x * fan])), n = Q.rot(at.q, [0, 1, x * .25]); const p = V.add(at.c, Q.rot(at.q, [0, .006 - .006 * x * x, x * .050 * S])); this.wf(buf, k, p, d, n, f.len * S, f.wid * S); return; }
      if (f.k === 'crest') { const x = f.i / (f.n - 1), HM = this.headM, rz = P.crest || 0; const p = M4.pt(HM, [-.052 + .050 * x, .038 + .046 * Math.sin(x * 1.9) - .012 * f.j * f.j, f.j * .034]); const sw = s.crest.x * .6 + (.10 + .5 * gust) * .35 * Math.sin(t * (5 + 4 * f.b) + f.i); const d = V.norm([-.95 + .45 * rz, -.30 + .85 * rz + .42 * x + sw * .5 + (f.b - .5) * .18, f.j * .40 + sw * .2]); this.wf(buf, k, p, V.norm(V.add(M4.dir(HM, d), V.mul(wind, .05 + .05 * gust))), M4.dir(HM, [.3, 1, f.j * .6]), f.len * S, f.wid * S); return; }
      if (f.k === 'thigh') { const z = f.w === -2 ? 1 : -1, HMb = this.thM[z > 0 ? 0 : 1], a = f.i / f.n, u = (Math.floor(f.i / 8) + .2 * f.b) / 6, th = (f.i % 8 + (Math.floor(f.i / 8) % 2) * .5 + f.j * .3) / 8 * TAU; const R1 = lerp(.086, .034, Math.pow(u, .8)); const n = [0, Math.sin(th), Math.cos(th)]; this.wf(buf, k, M4.pt(HMb, [u * .29, n[1] * R1, n[2] * R1 * .86]), M4.dir(HMb, V.norm([1, n[1] * .10, n[2] * .10])), M4.dir(HMb, n), f.len * S * (1 - .3 * u), f.wid * S * (1 - .25 * u)); return; }
      if (f.k === 'rump') { const u = lerp(.085, .16, f.b), th = Math.PI / 2 + f.j * 1.5, p = this.surf(u, th, .002), at = this.at(u), n = Q.rot(at.q, [0, Math.sin(th), Math.cos(th)]); this.wf(buf, k, p, V.norm(V.add(Q.rot(at.q, [-1, 0, 0]), V.mul(n, .14))), n, f.len * S, f.wid * S); return; }
    };
    for (const f of this.wfW) one(f, this.bufW, kw++); for (const f of this.wfD) one(f, this.bufD, kd++); let kg = 0; for (const f of this.wfG) one(f, this.bufG, kg++);
    updInst(this.itW.mesh, this.bufW); updInst(this.itD.mesh, this.bufD); updInst(this.itG.mesh, this.bufG);
  }
  // the pouch hangs between the rami, runs back over the throat and answers gravity, song and the egg
  pouchPose(P, W, Wd, acc, dt, t) {
    const S = this.o.scale, PU = this.PU, PV = this.PV, fill = P.pouch || 0, JM = this.jawM, s = this.s; const jaw = P.jaw || 0; s.pouchY.step(0, dt, -acc[1] * .5); s.pouchZ.step(0, dt, -acc[2] * .4); const jig = clamp(s.pouchY.x, -.25, .25), jz = clamp(s.pouchZ.x, -.3, .3); const dn = V.norm(M4.dir(JM, [0, -1, 0])); const vib = P.vib || 0;
    const w = PV + 1, F = this.pF, pos = new Float32Array((PU + 1) * w * 3); const sing = P.sing || 0;
    for (let i = 0; i <= PU; i++) { const u = i / PU; // 0 tip .. .74 hinge .. 1 throat end
      for (let j = 0; j <= PV; j++) { const v = j / PV * 2 - 1, a = v * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a); let p;
        const th = .74; const x = Math.min(1, u / th), tt = 1 - x; // tt 1 tip .. 0 hinge
        // rami edge in jaw space
        const e = this.ramus(tt, 1), hw = e[2]; const bump = Math.exp(-(((x - .62) / .30) ** 2)); let sag = (.010 + .030 * Math.sin(Math.min(1, x * 1.02) * Math.PI) * Math.sqrt(x) + .012 * x) + (.015 + .055 * sing) * bump * (.4 + jaw) + fill * .128 * Math.exp(-(((x - .64) / .27) ** 2)); sag *= 1 + jig * .9; const bul = fill * .046 * Math.exp(-(((x - .60) / .27) ** 2)) + .010 * sing * bump; sag += vib * .0022 * Math.sin(t * 34 + x * 9) * bump;
        const yy = e[1] - ca * sag, zz = sa * hw + Math.sign(v) * bul * Math.sin(2 * Math.abs(a)) + jz * .06 * ca * x * (fill + .3); let pj = M4.pt(JM, [e[0], yy, zz]);
        // neck end: slide from the hinge down the front of the neck
        const k = smooth(th - .06, 1, u); if (k > 0) { const nu = lerp(.905, .77, smooth(.0, 1, (u - th + .06) / (1 - th + .06))); const ang = -Math.PI / 2 + v * lerp(1.05, .45, k); const q = this.surf(nu, ang, (.004 - .014 * smooth(.3, 1, k) + (fill * .010 + .006 * sing) * ca * Math.sin(k * Math.PI) + .006 * ca * (1 - k)) * S); p = V.lerp(pj, q, smooth(th - .04, th + .14, u)); } else p = pj;
        const o = (i * w + j) * 3; pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2]; } }
    for (let i = 0; i <= PU; i++) for (let j = 0; j <= PV; j++) { const o = (i * w + j), g = (a, b) => { const k = (clamp(a, 0, PU) * w + clamp(b, 0, PV)) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; }; const n = V.norm(V.cross(V.sub(g(i + 1, j), g(i - 1, j)), V.sub(g(i, j + 1), g(i, j - 1)))); const f = o * 11; F[f] = pos[o * 3]; F[f + 1] = pos[o * 3 + 1]; F[f + 2] = pos[o * 3 + 2]; F[f + 3] = n[0]; F[f + 4] = n[1]; F[f + 5] = n[2]; }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.itPouch.mesh.vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pBuf);
    // where an egg lies in the pouch
    this.pouchC = M4.pt(JM, [.118 + .400 * .40, -.030 - .066 * fill, jz * .04]); this.pouchQ = this.qOf2(JM);
  }
  qOf2(M) { const sx = Math.hypot(M[0], M[1], M[2]); return Q.fromAxes([M[0] / sx, M[1] / sx, M[2] / sx], [M[4] / sx, M[5] / sx, M[6] / sx], [M[8] / sx, M[9] / sx, M[10] / sx]); }
}
