// ============================================================================
// voice.js - the pelican sings. A physical model of a vocal tract, sample by sample: an LF glottis blowing into a
// travelling-wave tube (44 oral + 30 nasal sections, about 90-106 kHz) with sinuses, piriform and lateral pockets,
// yielding walls, quasi-static aerodynamics and turbulence at the constrictions. Three singers come out of it:
// HE (an old, warm, light baritone), SHE (a light mezzo) and, from a small syrinx of its own, the CHICK.
// Pure JavaScript, deterministic, no libraries, no samples. CGS units inside (cm, g, s).
//   VOICE.jobs() -> ids    VOICE.render(id) -> { id, who, t0, pcm, vis }    VOICE.reply(variant) -> { pcm, vis, dur, who }
// ============================================================================
const VOICE = (() => {
'use strict';
const SC = (typeof SCORE !== 'undefined') ? SCORE : require('../01_score.js');
const SR = 44100, TAU = Math.PI * 2, PI4 = Math.PI * .25;
const RHO = 0.00114, C0 = 35200, RC = RHO * C0, L0 = 16.3, LIP0 = 15.45;
const NSEC = 44, VSEC = 21, PIRI_SEC = 5, LAT_SEC = 34, PIRI_LEN = 5, LAT_LEN = 6, NN = 30;
const SUB = 4, BLK = 24, FRAME = SUB * BLK;
// the loudness scale: a line sung at dyn 0 sits here (dBFS RMS of its vowels, above 260 Hz)
const DB0 = -21.5, LREF = 106;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sstep = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10); };
const s3 = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- seeded noise
function rng(seed) {
  let a = (seed >>> 0) || 1, sp = 0, has = false;
  const u = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  u.g = () => { if (has) { has = false; return sp; } const r = Math.sqrt(-2 * Math.log(1 - u())), p = TAU * u(); sp = r * Math.sin(p); has = true; return r * Math.cos(p); };
  u.r = (lo, hi) => lo + (hi - lo) * u();
  return u;
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// two-pole low-passed random walk with about unit variance, times amp
function smoothNoise(n, dt, fc, R, amp) {
  const a = 1 - Math.exp(-TAU * fc * dt), g = amp / Math.sqrt(a / 2) / .72, out = new Float64Array(n); let x = 0, y = 0;
  for (let i = -Math.min(4000, Math.round(1.5 / (fc * dt))); i < n; i++) { x += a * (R.g() - x); y += a * (x - y); if (i >= 0) out[i] = y * g; }
  return out;
}

// ---------------------------------------------------------------- the tract: articulators -> diameters
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; let u = (x - x0) / (x1 - x0); u = u * u * (3 - 2 * u) * .5 + u * .5; return y0 + (y1 - y0) * u;
  }
  return pts[pts.length - 1][1];
}
const _D0 = [[-2, .80], [0, .80], [.7, .76], [1.5, .80], [2.0, .98], [2.5, 1.34], [3.2, 1.58], [4.5, 1.64], [6.2, 1.60], [7.6, 1.56], [9, 1.58], [10.5, 1.66], [12, 1.70], [13.4, 1.66], [14.4, 1.54], [15.1, 1.34], [15.5, 1.24], [19, 1.24]];
const _W = [[-2, 0], [1.8, 0], [2.6, .55], [3.8, 1.0], [12.6, 1.0], [14.0, .78], [14.9, .45], [15.5, .12], [16, 0], [19, 0]];
const _JW = [[-2, 0], [7.5, 0], [9.5, .22], [12, .62], [14, .92], [15.4, 1.0], [19, 1.0]];
const _TRW = [[-2, 0], [2.0, 0], [3.2, .8], [4.4, 1.0], [6.0, .7], [7.8, .1], [8.5, 0], [19, 0]];
const _EPW = [[-2, 1], [1.2, 1], [2.0, .7], [2.8, 0], [19, 0]];
const GS = 40, S_MIN = -1.5, S_MAX = 18.5, TN = Math.floor((S_MAX - S_MIN) * GS) + 2, PX = 11.75, LAM = 13.7;
const tab = fn => Float64Array.from({ length: TN }, (_, i) => fn(S_MIN + i / GS));
const T_D0 = tab(s => interp(_D0, s)), T_JW = tab(s => interp(_JW, s)), T_TR = tab(s => interp(_TRW, s)), T_EP = tab(s => interp(_EPW, s));
const T_FX = tab(s => interp(_W, s) * Math.cos(TAU * (s - PX) / LAM)), T_FY = tab(s => interp(_W, s) * Math.cos(TAU * (s - (PX - LAM / 4)) / LAM));

// fitted vowel and sonorant postures: J X Y TR TT BP LA LP LH EP, then F1 (Hz, 16.3 cm tract)
const BODY = ['J', 'X', 'Y', 'TR', 'TT', 'BP', 'LA', 'LP', 'LH', 'EP'];
const RAW = {
  A: [1, -0.248, -0.0676, -0.397, 0, 13.6, 2.2213, -0.2, 0, 0, 796],
  AA: [1, -0.3191, -0.1742, -0.5476, 0, 13.6, 2.0408, -0.2346, 0, 0, 783],
  AE: [1, 0.4323, -0.0048, -0.55, 0, 13.6, 2.8, -0.45, 0, 0, 744],
  AH: [0.6332, -0.2681, 0.0472, -0.1955, 0, 13.6, 1.4306, -0.0053, 0, 0, 694],
  AO: [0.7987, -0.4293, 0.1033, -0.55, 0, 13.6, 1.1438, 0.5, 0.5, 0, 604],
  AX: [0.2619, 0.461, 0.328, -0.1237, 0, 13.6, 1.0022, 0.0653, 0, 0, 520],
  EH: [0.488, 0.4091, 0.0289, -0.0015, 0, 13.6, 2.3254, -0.45, 0, 0, 614],
  ER: [0.2683, 0.0984, 0.0316, -0.5489, 1.2964, 11.8, 0.9406, 0.5143, 0, 0, 500],
  EY: [0.1702, 0.6479, -0.1343, 0.1918, 0, 13.6, 1.6334, -0.4356, 0, 0, 480],
  IH: [0.18, 0.8253, 0.2477, 0.1869, 0, 13.6, 1.4657, -0.1385, 0, 0, 427],
  IY: [0.0971, 1.0008, 0.1757, 0.8, 0, 13.6, 1.2576, -0.4275, -0.1744, 0, 334],
  L: [0.2639, -0.2292, 0.1905, 0.4454, 0, 13.6, 0.4226, 0.3189, 0, 0, 380],
  LD: [0.6001, -0.2479, 0.3928, -0.5486, 0, 13.6, 0.6109, 0.6174, 0, 0, 460],
  O: [0.567, -0.3494, 0.1983, -0.55, 0, 13.6, 0.7789, 0.4682, 0.5, 0, 525],
  OR: [0.6279, -0.4687, 0.0301, -0.5319, 0, 13.6, 0.7335, 0.3567, 0.5, 0, 505],
  R: [0.2075, 0.0646, -0.1439, -0.5457, 1.3099, 11.9938, 0.4564, 0.7867, 0, 0, 400],
  UH: [0.3715, -0.0405, 0.2375, -0.4471, 0, 13.6, 0.5952, 0.69, 0, 0, 460],
  UW: [0.1804, 0.5289, 0.398, -0.4407, 0, 13.6, 0.4, 0.9949, 0.2043, 0, 373],
  W: [0.6922, 0.8194, 0.6662, -0.4008, 0, 13.6, 0.4, 0.9523, 0.5, 0, 340],
  Y: [0.02, 1.0534, -0.5736, 0.5933, 0, 13.6, 1.304, -0.1453, -0.0672, 0, 300],
};
const SHAPES = {}, F1OF = {};
for (const k in RAW) { SHAPES[k] = {}; BODY.forEach((b, i) => { SHAPES[k][b] = RAW[k][i]; }); F1OF[k] = RAW[k][10]; }

// ---------------------------------------------------------------- the singers
// sp/so: pharynx and mouth length against the 16.3 cm reference. sd: tube width. rd: source tilt.
const SINGER = {
  he:  { sp: 1.095, so: 1.035, sd: 1.04, rd: .06, rdMin: .70, lowRef: 118, fscale: .94, mid: 58, jit: 1.0, shim: 1.25, flut: 8, grain: .35, vibRate: 5.45, lhRef: 185, gload: .45, hp: 62, shelf: [230, 2.2], lp: 8400, wr: .030, sigma: 1 },
  she: { sp: .868, so: .920, sd: .93, rd: .10, rdMin: .84, lowRef: 190, fscale: 1.11, mid: 67, jit: .9, shim: 1.1, flut: 9, grain: .05, vibRate: 5.75, lhRef: 330, gload: .42, hp: 110, shelf: [300, 1.5], lp: 9200, wr: .020, sigma: 1 },
};
for (const k in SINGER) { const V = SINGER[k]; V.len = V.sp * 8 + V.so * 8.3; V.Tn = V.len / (NSEC * C0); }

// ---------------------------------------------------------------- the tube (flat generated source, one sample of delay per section)
const WALLS = [3, 8, 12, 16, 19, 24, 28, 32, 36, 39], HFL = [7, 15, 27, 36, 41], ASP = [2, 9];
const FRI = [26, 29, 31, 35, 37, 38, 39, 40, 41, 42, 43], WRAD = [8, 12, 36], NHF = [4, 9, 15, 21, 26], NVAR = 6, NSRC = 25;
const PJ = 33;                                        // junction where the throat pouch hangs (hum only)
const ORAL = []; for (let i = 1; i < NSEC; i++) if (i !== VSEC && i !== PIRI_SEC && i !== LAT_SEC) ORAL.push(i);
const COEF = ORAL.map(i => 'k' + i).concat(['v1', 'v2', 'v3', 'q1', 'q2', 'q3', 't1', 't2', 't3'], [1, 2, 3, 4, 5, 6].map(j => 'm' + j), ['ql', 'yl', 'z0']);
const GODD = []; for (let i = 1; i < NSEC; i += 2) GODD.push(i);
const CONST = GODD.map(i => 'g' + i).concat(WALLS.map(i => 'w' + i), ['hw', 'lq', 'rlq', 'dT'], FRI.map(i => 'n' + i), ASP.map(i => 'a' + i), ['wr', 'hf', 'an', 'pz', 'pw']);
const NC = COEF.length, NK = CONST.length;
const _NA = [[0, .9], [2, 1.7], [4, 2.8], [8, 4.0], [12, 4.8], [16, 5.0], [20, 4.2], [24, 2.4], [26, 1.3], [27, .95], [29, 1.0]];
const NAREA = Float64Array.from({ length: NN }, (_, j) => { for (let q = 1; q < _NA.length; q++) if (j <= _NA[q][0]) { const [x0, y0] = _NA[q - 1], [x1, y1] = _NA[q]; return y0 + (y1 - y0) * (j - x0) / (x1 - x0); } return 1; });
function radiation(A, T) { const Y = A / RC, G = Y * .694, q = T * 3 * Math.PI * Math.sqrt(Math.PI * A) / (8 * RHO), d = 1 / (Y + G + q); return [(Y - G - q) * d, d, q, Y]; }
function noseStatic(T) {
  const mk = new Float64Array(NN); for (let j = 1; j < NN; j++) mk[j] = (NAREA[j - 1] - NAREA[j]) / (NAREA[j - 1] + NAREA[j]);
  const sinus = (f, R, L, A) => { const C = 1 / ((TAU * f) ** 2 * L); return [T / L, R, T / C, RC / (2 * A)]; };
  return { mk, gn: .9925, rad: radiation(NAREA[NN - 1], T), s: [sinus(480, 3, .006, NAREA[12]), sinus(1150, 8, .009, NAREA[18])], hn: .15,
    hc: 1 - Math.exp(-TAU * 3600 * T), hb: 1 - Math.exp(-TAU * 700 * T), ha: 1 - Math.exp(-TAU * 5500 * T), hp: 1 - Math.exp(-TAU * 900 * T) };
}
// the pouch: a thin skin bag on the mouth, mass against spring, heard through its wall
function pouchStatic(T, f, Q, Lm) { const L = Lm, C = 1 / ((TAU * f) ** 2 * L); return [T / L, TAU * f * L / Q, T / C]; }
const SIN = [[12, 0], [18, 1]];
const num = x => '(' + (+x).toPrecision(15) + ')';
function tubeFn(T, pouch) {
  const NS = noseStatic(T), b = [], st = [], P = s => b.push(s);
  const S = n => st.push(n);
  for (let i = 0; i < NSEC; i++) { S('f' + i); S('b' + i); }
  for (let j = 0; j < NN; j++) { S('nf' + j); S('nb' + j); }
  WALLS.forEach(i => S('u' + i)); HFL.forEach(i => { S('lf' + i); S('lb' + i); });
  for (let i = 0; i < 2 * PIRI_LEN; i++) S('pq' + i);
  for (let i = 0; i < 2 * LAT_LEN; i++) S('lq' + i + '_');
  NHF.forEach(j => { S('nlf' + j); S('nlb' + j); });
  ['su0', 'su1', 'sp0', 'sp1', 'vg', 'uL', 'uN', 'Up', 'nl1', 'nl2'].forEach(S);
  if (pouch) ['pu', 'pp', 'pl1'].forEach(S);
  P('let ' + st.map((n, i) => n + '=st[' + i + ']').join(',') + ';');
  P('let ' + COEF.map((n, i) => n + '=K[ka+' + i + ']').join(',') + ';');
  P('const ' + COEF.map((n, i) => 'd_' + n + '=(K[kb+' + i + ']-' + n + ')*' + num(1 / BLK)).join(',') + ';');
  P('const ' + CONST.map((n, i) => n + '=C[co+' + i + ']').join(',') + ';');
  P('let x=0,y=0,p=0,r=0,e=0,w=0,nin=0,U=0,us=0,ag=0,na=0,nf=0;');
  P('for(let sb=0;sb<' + BLK + ';sb++){');
  P('const rl2=1/(1.694*yl+ql),rl1=(0.306*yl-ql)*rl2,rl3=rl2*ql;');
  P('for(let q=0;q<' + SUB + ';q++,pos++){');
  P('us=US[pos];ag=AG[pos];na=NA[pos];nf=NF[pos];');
  P('vg=(2*b0+us*z0+lq*vg)/(rlq+ag*z0);');
  P('x=f0;f0=b0+(us-ag*vg)*z0;');
  let cur = 'x', nxt = 'y';
  for (let i = 1; i < NSEC; i++) {
    const g = i % 2 === 1 ? 'g' + i : null;
    P(`${nxt}=f${i};`);
    if (i === VSEC) P(`p=v1*${cur}+v2*b${i}+v3*nb0;f${i}=p-b${i};b${i - 1}=p-${cur};nin=p-nb0;`);
    else if (i === PIRI_SEC) {
      P(`r=pq${2 * PIRI_LEN - 1}*.97;p=q1*${cur}+q2*b${i}+q3*r;f${i}=p-b${i};b${i - 1}=p-${cur};`);
      for (let q = 2 * PIRI_LEN - 1; q > 0; q--) P(`pq${q}=pq${q - 1};`); P('pq0=p-r;');
    } else if (i === LAT_SEC) {
      P(`r=lq${2 * LAT_LEN - 1}_*.95;p=t1*${cur}+t2*b${i}+t3*r;f${i}=p-b${i};b${i - 1}=p-${cur};`);
      for (let q = 2 * LAT_LEN - 1; q > 0; q--) P(`lq${q}_=lq${q - 1}_;`); P('lq0_=p-r;');
    } else {
      P(`w=k${i}*(${cur}-b${i});`);
      if (WALLS.includes(i)) P(`u${i}=hw*u${i}+${cur}+w+b${i};w-=u${i}*w${i};`);
      if (pouch && i === PJ) P(`pu+=${num(pouch[0])}*(${cur}+w+b${i}-pp-${num(pouch[1])}*pu);pp+=${num(pouch[2])}*pu;w-=pu*pz;`);
      let fo = `${cur}+w`, bo = `b${i}+w`;
      if (ASP.includes(i)) { P(`e=na*a${i};`); fo += '+e'; bo += '-e'; }
      if (FRI.includes(i)) { P(`e=nf*n${i};`); fo += '+e'; bo += '-e'; }
      if (HFL.includes(i)) {
        P(`p=${fo};lf${i}+=${num(NS.ha)}*(p-lf${i});f${i}=p-hf*(p-lf${i});`);
        P(`p=${bo};lb${i}+=${num(NS.ha)}*(p-lb${i});b${i - 1}=p-hf*(p-lb${i});`);
      } else if (g) P(`f${i}=(${fo})*${g};b${i - 1}=(${bo})*${g};`);
      else P(`f${i}=${fo};b${i - 1}=${bo};`);
    }
    [cur, nxt] = [nxt, cur];
  }
  P(`r=rl1*${cur}-rl3*uL;b${NSEC - 1}=r;uL+=${cur}+r;U=yl*(${cur}-r);`);
  P('x=nf0;nf0=nin;'); cur = 'x'; nxt = 'y';
  for (let j = 1; j < NN; j++) {
    P(`${nxt}=nf${j};`);
    P(`w=${j <= NVAR ? 'm' + j : num(NS.mk[j])}*(${cur}-nb${j});`);
    for (const [sj, id] of SIN) if (sj === j) { const s = NS.s[id]; P(`su${id}+=${num(s[0])}*(${cur}+w+nb${j}-sp${id}-${num(s[1])}*su${id});sp${id}+=${num(s[2])}*su${id};w-=su${id}*${num(s[3])};`); }
    let fo = `${cur}+w`, bo = `nb${j}+w`;
    if (j === NSRC) { P('e=na*an;'); fo += '+e'; bo += '-e'; }
    if (NHF.includes(j)) {
      P(`p=${fo};nlf${j}+=${num(NS.hb)}*(p-nlf${j});nf${j}=p-${num(NS.hn)}*(p-nlf${j});`);
      P(`p=${bo};nlb${j}+=${num(NS.hb)}*(p-nlb${j});nb${j - 1}=p-${num(NS.hn)}*(p-nlb${j});`);
    } else if (j % 2 === 0) P(`nf${j}=(${fo})*${num(NS.gn)};nb${j - 1}=(${bo})*${num(NS.gn)};`);
    else P(`nf${j}=${fo};nb${j - 1}=${bo};`);
    [cur, nxt] = [nxt, cur];
  }
  P(`r=${num(NS.rad[0])}*${cur}-${num(NS.rad[1])}*uN;nb${NN - 1}=r*.985;uN+=${num(NS.rad[2])}*(${cur}+r);nl1+=${num(NS.hc)}*(${num(NS.rad[3])}*(${cur}-r)-nl1);nl2+=${num(NS.hc)}*(nl1-nl2);U+=nl2;`);
  P('U+=wr*(' + WRAD.map(i => 'u' + i).join('+') + ');');
  if (pouch) P(`pl1+=${num(NS.hp)}*(pu-pl1);U+=pw*pl1;`);
  P('OUT[pos]=(U-Up)*dT;Up=U;}');
  P(COEF.map(c => c + '+=d_' + c).join(';') + ';}');
  P(st.map((n, i) => 'st[' + i + ']=' + n).join(';') + ';');
  const fn = new Function('st', 'K', 'ka', 'kb', 'C', 'co', 'US', 'AG', 'NA', 'NF', 'pos', 'OUT', '"use strict";' + b.join('\n'));
  return { fn, n: st.length };
}
// the same tube as plain loops, for pages whose security policy forbids new Function (slower, same numbers)
function tubeLoop(T, pouch) {
  const NS = noseStatic(T), cI = {}, kI = {}; COEF.forEach((n, i) => { cI[n] = i; }); CONST.forEach((n, i) => { kI[n] = i; });
  const oK = new Int32Array(NSEC).fill(-1), oG = new Int32Array(NSEC).fill(-1), oW = new Int32Array(NSEC).fill(-1), oA = new Int32Array(NSEC).fill(-1), oF = new Int32Array(NSEC).fill(-1), hl = new Uint8Array(NSEC), nh = new Uint8Array(NN), sn = new Int8Array(NN).fill(-1);
  ORAL.forEach(i => { oK[i] = cI['k' + i]; }); GODD.forEach(i => { oG[i] = kI['g' + i]; }); WALLS.forEach(i => { oW[i] = kI['w' + i]; }); ASP.forEach(i => { oA[i] = kI['a' + i]; }); FRI.forEach(i => { oF[i] = kI['n' + i]; }); HFL.forEach(i => { hl[i] = 1; }); NHF.forEach(j => { nh[j] = 1; }); SIN.forEach(([j, id]) => { sn[j] = id; });
  const F = 0, B = 44, NFo = 88, NBo = 118, Uo = 148, LF = 192, LB = 236, PQ = 280, LQ = 290, NLF = 302, NLB = 332, M = 362, n = 380, k = new Float64Array(NC), d = new Float64Array(NC);
  const fn = (st, K, ka, kb, C, co, US, AG, NA, NF, pos, OUT) => {
    for (let i = 0; i < NC; i++) { k[i] = K[ka + i]; d[i] = (K[kb + i] - k[i]) / BLK; }
    const hw = C[co + kI.hw], lq = C[co + kI.lq], rlq = C[co + kI.rlq], dT = C[co + kI.dT], wr = C[co + kI.wr], hf = C[co + kI.hf], an = C[co + kI.an], pz = C[co + kI.pz], pw = C[co + kI.pw], v = cI.v1, qo = cI.q1, to = cI.t1, mo = cI.m1, iz = cI.z0, iy = cI.yl, iq = cI.ql;
    for (let sb = 0; sb < BLK; sb++) {
      const ql = k[iq], yl = k[iy], z0 = k[iz], rl2 = 1 / (1.694 * yl + ql), rl1 = (.306 * yl - ql) * rl2, rl3 = rl2 * ql;
      for (let q = 0; q < SUB; q++, pos++) {
        const us = US[pos], ag = AG[pos], na = NA[pos], nf = NF[pos]; let nin = 0, w = 0, p = 0, r = 0;
        st[M] = (2 * st[B] + us * z0 + lq * st[M]) / (rlq + ag * z0); let x = st[F]; st[F] = st[B] + (us - ag * st[M]) * z0;
        for (let i = 1; i < NSEC; i++) {
          const y = st[F + i], bi = st[B + i];
          if (i === VSEC) { p = k[v] * x + k[v + 1] * bi + k[v + 2] * st[NBo]; st[F + i] = p - bi; st[B + i - 1] = p - x; nin = p - st[NBo]; }
          else if (i === PIRI_SEC) { r = st[PQ + 9] * .97; p = k[qo] * x + k[qo + 1] * bi + k[qo + 2] * r; st[F + i] = p - bi; st[B + i - 1] = p - x; for (let z = 9; z > 0; z--) st[PQ + z] = st[PQ + z - 1]; st[PQ] = p - r; }
          else if (i === LAT_SEC) { r = st[LQ + 11] * .95; p = k[to] * x + k[to + 1] * bi + k[to + 2] * r; st[F + i] = p - bi; st[B + i - 1] = p - x; for (let z = 11; z > 0; z--) st[LQ + z] = st[LQ + z - 1]; st[LQ] = p - r; }
          else {
            w = k[oK[i]] * (x - bi); if (oW[i] >= 0) { st[Uo + i] = hw * st[Uo + i] + x + w + bi; w -= st[Uo + i] * C[co + oW[i]]; }
            if (pouch && i === PJ) { st[M + 10] += pouch[0] * (x + w + bi - st[M + 11] - pouch[1] * st[M + 10]); st[M + 11] += pouch[2] * st[M + 10]; w -= st[M + 10] * pz; }
            let fo = x + w, bo = bi + w; if (oA[i] >= 0) { const e = na * C[co + oA[i]]; fo += e; bo -= e; } if (oF[i] >= 0) { const e = nf * C[co + oF[i]]; fo += e; bo -= e; }
            if (hl[i]) { st[LF + i] += NS.ha * (fo - st[LF + i]); st[F + i] = fo - hf * (fo - st[LF + i]); st[LB + i] += NS.ha * (bo - st[LB + i]); st[B + i - 1] = bo - hf * (bo - st[LB + i]); }
            else if (oG[i] >= 0) { const g = C[co + oG[i]]; st[F + i] = fo * g; st[B + i - 1] = bo * g; } else { st[F + i] = fo; st[B + i - 1] = bo; }
          }
          x = y;
        }
        r = rl1 * x - rl3 * st[M + 1]; st[B + NSEC - 1] = r; st[M + 1] += x + r; let U = yl * (x - r); x = st[NFo]; st[NFo] = nin;
        for (let j = 1; j < NN; j++) {
          const y = st[NFo + j], bj = st[NBo + j]; w = (j <= NVAR ? k[mo + j - 1] : NS.mk[j]) * (x - bj);
          const id = sn[j]; if (id >= 0) { const s = NS.s[id], o = M + 4 + id * 2; st[o] += s[0] * (x + w + bj - st[o + 1] - s[1] * st[o]); st[o + 1] += s[2] * st[o]; w -= st[o] * s[3]; }
          let fo = x + w, bo = bj + w; if (j === NSRC) { fo += na * an; bo -= na * an; }
          if (nh[j]) { st[NLF + j] += NS.hb * (fo - st[NLF + j]); st[NFo + j] = fo - NS.hn * (fo - st[NLF + j]); st[NLB + j] += NS.hb * (bo - st[NLB + j]); st[NBo + j - 1] = bo - NS.hn * (bo - st[NLB + j]); }
          else if (j % 2 === 0) { st[NFo + j] = fo * NS.gn; st[NBo + j - 1] = bo * NS.gn; } else { st[NFo + j] = fo; st[NBo + j - 1] = bo; }
          x = y;
        }
        r = NS.rad[0] * x - NS.rad[1] * st[M + 2]; st[NBo + NN - 1] = r * .985; st[M + 2] += NS.rad[2] * (x + r); st[M + 8] += NS.hc * (NS.rad[3] * (x - r) - st[M + 8]); st[M + 9] += NS.hc * (st[M + 8] - st[M + 9]); U += st[M + 9];
        U += wr * (st[Uo + WRAD[0]] + st[Uo + WRAD[1]] + st[Uo + WRAD[2]]); if (pouch) { st[M + 12] += NS.hp * (st[M + 10] - st[M + 12]); U += pw * st[M + 12]; }
        OUT[pos] = (U - st[M + 3]) * dT; st[M + 3] = U;
      }
      for (let i = 0; i < NC; i++) k[i] += d[i];
    }
  };
  return { fn, n };
}
const _tubes = {}; let plain = (() => { try { const u = typeof navigator !== 'undefined' ? navigator.userAgent : ''; return /AppleWebKit/.test(u) && !/Chrome|Chromium|Edg\//.test(u); } catch (e) { return false; } })();   // Safari's engine stalls for seconds compiling the flat function
function tube(who, hum) {
  const k = who + (hum ? 'h' : '');
  if (!_tubes[k]) { const V = SINGER[who]; const po = hum ? pouchStatic(V.Tn, 195, 2.4, .010) : null; if (!plain) try { _tubes[k] = tubeFn(V.Tn, po); } catch (e) { plain = true; } if (plain) _tubes[k] = tubeLoop(V.Tn, po); }
  return _tubes[k];
}
function frameCoefs(K, o, A, T, vel, lat, piri) {
  for (let q = 0; q < ORAL.length; q++) { const i = ORAL[q], a = A[i - 1], b = A[i]; K[o++] = (a - b) / (a + b); }
  let a = A[VSEC - 1], b = A[VSEC]; const n0 = vel > 1e-5 ? vel : 1e-5; let s = 2 / (a + b + n0);
  K[o++] = a * s; K[o++] = b * s; K[o++] = n0 * s;
  a = A[PIRI_SEC - 1]; b = A[PIRI_SEC]; s = 2 / (a + b + piri); K[o++] = a * s; K[o++] = b * s; K[o++] = piri * s;
  a = A[LAT_SEC - 1]; b = A[LAT_SEC]; const l0 = lat > 1e-6 ? lat : 1e-6; s = 2 / (a + b + l0); K[o++] = a * s; K[o++] = b * s; K[o++] = l0 * s;
  let pn = n0;
  for (let j = 1; j <= NVAR; j++) { const u = j / NVAR, an = Math.min(NAREA[j], n0 * (1 - u) + NAREA[j] * u + .05); K[o++] = (pn - an) / (pn + an); pn = an; }
  const r = radiation(A[NSEC - 1], T); K[o++] = r[2]; K[o++] = r[3]; K[o++] = RC / A[0];
}

// ---------------------------------------------------------------- the glottis: LF flow pulses in closed form
function lfRow(Rd) {
  const Ra = Math.max(.004, (-1 + 4.8 * Rd) / 100), Rk = (22.4 + 11.8 * Rd) / 100, Rg = 1 / (4 * ((.11 * Rd / (.5 + 1.2 * Rk)) - Ra) / Rk);
  let tp = 1 / (2 * Rg), te = tp * (1 + Rk); if (te > .96) { const s = .96 / te; tp *= s; te = .96; }
  const ta = Math.min(Ra, (1 - te) * .85), w = Math.PI / tp; let e = 1 / ta;
  for (let i = 0; i < 60; i++) { const q = Math.exp(-e * (1 - te)), g = 1 - q - e * ta, dg = (1 - te) * q - ta, e2 = e - g / dg; if (Math.abs(e2 - e) < 1e-9) { e = e2; break; } e = e2; }
  const q = Math.exp(-e * (1 - te)), ret = -(1 / (e * ta)) * ((1 - q) / e - (1 - te) * q), sw = Math.sin(w * te), cw = Math.cos(w * te);
  const opn = a => { const E0 = -1 / (Math.exp(a * te) * sw); return E0 / (a * a + w * w) * (Math.exp(a * te) * (a * sw - w * cw) + w); };
  let lo = -40, hi = 60; const flo = opn(lo) + ret;
  for (let i = 0; i < 70; i++) { const m = .5 * (lo + hi); if ((opn(m) + ret > 0) === (flo > 0)) lo = m; else hi = m; }
  const a = .5 * (lo + hi), E0 = -1 / (Math.exp(a * te) * sw), c = E0 / (a * a + w * w);
  return [a, w, c, te, opn(a), 1 / (e * ta), e, q, c * (Math.exp(a * tp) * (a * Math.sin(w * tp) - w * Math.cos(w * tp)) + w), tp];
}
const RD0 = .35, RDS = .01, RDN = Math.floor((3.2 - RD0) / RDS) + 1; let _lf = null;
function lfTable() { if (!_lf) { _lf = new Float64Array(RDN * 10); for (let i = 0; i < RDN; i++) _lf.set(lfRow(RD0 + i * RDS), i * 10); } return _lf; }

// ---------------------------------------------------------------- gestures: phones -> articulator trajectories
const VOW = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW', 'MM']);
const OPENTO = { IY: 'IH', Y: 'IH', IH: 'EH', EY: 'EH', UW: 'UH', UH: 'AH', O: 'AH', OR: 'AH', ER: 'AH', AX: 'AH' };
const LEAD = { J: .050, X: .055, Y: .055, TR: .050, TT: .045, BP: .04, LA: .060, LP: .110, LH: .06, EP: .06 };
const SETT = { J: .11, X: .130, Y: .130, TR: .130, TT: .09, BP: .08, LA: .09, LP: .09, LH: .15, EP: .14 };
const OPEN = 2.6;
const DIPH = { AY: ['A', 'IH', 1.0], OY: ['AO', 'IH', 1.0], AW: ['A', 'UH', 1.1], EY: ['EY', 'IY', .75], OW: ['O', 'UW', .62] };
const OFFG = { AE: ['AX', .22], EH: ['AX', .22], IH: ['AX', .18], AH: ['AX', .12], AO: ['AH', .16], AA: ['AH', .16], IY: ['Y', .30], UW: ['W', .16], ER: ['R', .18], UH: ['AX', .2] };
const mix = (a, b, u) => { const o = {}; for (const k of BODY) o[k] = a[k] + (b[k] - a[k]) * u; return o; };
// on high notes the mouth opens so that the first formant stays above the pitch
function opened(name, f0, fs) {
  let s = SHAPES[name]; const o = OPENTO[name];
  if (f0 && o) { const need = 1.20 * f0 - F1OF[name] * fs; if (need > 0) s = mix(s, SHAPES[o], Math.min(.75, need / Math.max(60, (F1OF[o] - F1OF[name]) * fs))); }
  return s;
}
class Track {
  constructor(v0) { this.v0 = v0; this.tr = []; }
  to(ts, te, v) { if (te < ts + .004) te = ts + .004; this.tr.push([ts, te, v, (te - ts) / 4.3]); }
  sample(times) {                                      // critically damped approach to each target; overlapping moves blend
    const tr = this.tr.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]), n = tr.length, out = new Float64Array(times.length); let i = 0, base = this.v0, act = [];
    for (let k = 0; k < times.length; k++) {
      const t = times[k];
      while (i < n && tr[i][0] <= t) act.push(tr[i++]);
      while (act.length && t - act[0][0] > 11 * act[0][3]) base = act.shift()[2];
      let v = base;
      for (let q = 0; q < act.length; q++) { const a = act[q], u = (t - a[0]) / a[3]; v += (a[2] - v) * (1 - (1 + u) * Math.exp(-u)); }
      out[k] = v;
    }
    return out;
  }
}
class Bumps {
  constructor(rest, mode) { this.rest = rest; this.b = []; this.mode = mode; }
  add(r0, r1, f0, f1, v) { if (r1 < r0 + .004) r1 = r0 + .004; if (f0 < r1) f0 = r1; if (f1 < f0 + .004) f1 = f0 + .004; this.b.push([r0, r1, f0, f1, v]); }
  sample(times) {
    const bs = this.b.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), R = this.rest, n = bs.length, out = new Float64Array(times.length), mode = this.mode; let i = 0, act = [];
    for (let k = 0; k < times.length; k++) {
      const t = times[k]; let v = R;
      while (i < n && bs[i][0] <= t) act.push(bs[i++]);
      if (act.length && act.some(b => b[3] <= t)) act = act.filter(b => b[3] > t);
      for (let q = 0; q < act.length; q++) {
        const [r0, r1, f0, f1, x] = act[q]; let u;
        if (t < r1) u = (t - r0) / (r1 - r0); else if (t < f0) u = 1; else { u = (f1 - t) / (f1 - f0); if (mode === 'min') { u = Math.pow(u, 2.2); v = Math.min(v, R + (x - R) * u); continue; } }
        u = u * u * u * (10 - u * (15 - 6 * u)); const y = R + (x - R) * u;
        if (mode === 'max') { if (y > v) v = y; } else if (mode === 'mul') v *= y; else if (y < v) v = y;
      }
      out[k] = v;
    }
    return out;
  }
}
const UV = new Set(['P', 'T', 'K', 'S', 'SH', 'F', 'HH', 'TH']);
class Gest {
  constructor(segs, o) {
    this.segs = segs; this.o = o; this.fs = o.fs || 1; const n = segs.length;
    // a final -ing is sung ON the ng: the tongue closes early and the note hums
    if (n > 1) { const a = segs[n - 2], b = segs[n - 1]; if (b.ph === 'NG' && a.ph === 'IH') { const tot = b.t1 - a.t0, m = a.t0 + Math.max(.24, (o.ng || .46) * tot); a.t1 = m; b.t0 = m; } }
    const first = segs.find(g => g.role === 'nuc'), s0 = first ? this.vt(first, null)[0] : SHAPES.AX;
    const rest = o.hum ? s0 : mix(SHAPES.AX, s0, .30); this.T = {}; for (const k of BODY) this.T[k] = new Track(rest[k]);
    const T = this.T; T.sTT = new Track(14.6); T.hTT = new Track(.25); T.sTD = new Track(9.4); T.hTD = new Track(.45);
    for (const k of ['cTT', 'cTD', 'cLI', 'cLD']) T[k] = new Bumps(OPEN, 'min');
    for (const k of ['GA', 'VEL', 'LAT', 'VST']) T[k] = new Bumps(0, 'max');
    T.AV = new Bumps(1, 'mul');
    this.build();
  }
  vt(g, nxt) {                                          // nucleus targets
    const p = g.ph, fz = g.f0 || 0, fs = this.fs;
    if (p === 'MM') { const u = clamp(((g.midi || 56) - 48) / 14, 0, 1); return [mix(mix(SHAPES.O, SHAPES.UH, u), SHAPES.AX, .35 + .25 * Math.sin((g.k || 0) * 2.1)), null]; }
    if (DIPH[p]) { const [a, b, u] = DIPH[p], A = opened(a, fz, fs); return [A, mix(A, opened(b, fz, fs), u)]; }
    let s;
    if (p === 'AH') s = opened(g.weak ? 'AX' : 'AH', fz, fs);
    else if (p === 'AO' && nxt && nxt.ph === 'R') s = opened('OR', fz, fs);
    else s = opened(SHAPES[p] ? p : 'AX', fz, fs);
    if (g.weak && p !== 'AH') s = mix(s, SHAPES.AX, .18);
    return [s, null];
  }
  build() {
    const S = this.segs, T = this.T, n = S.length, nuc = []; S.forEach((g, i) => { if (g.role === 'nuc') nuc.push(i); });
    this.claim = {};
    S.forEach((g, i) => { if (g.role !== 'nuc') this.cons(i, g); });
    for (let a = 0; a < nuc.length; a++) {
      const i = nuc[a], g = S[i], nx = i + 1 < n ? S[i + 1] : null, [v1, v2] = this.vt(g, nx); let j = i;
      while (j - 1 >= 0 && S[j - 1].role === 'on' && S[j - 1].syl === g.syl) j--;
      const c0 = S[j].t0, hi = j === i, slow = g.ph === 'MM' ? 1.7 : 1;
      for (const k of BODY) {
        let ld = LEAD[k] * slow; const se = SETT[k] * slow; if (a === 0 && hi) ld += .25;
        let ts = c0 - ld - (hi ? .045 : 0); const te = g.t0 + se;
        for (let q = j - 2; q < i; q++) if (q >= 0) { const c = this.claim[q + k]; if (c !== undefined && c > ts) ts = c; }
        if (a > 0) { const pg = S[nuc[a - 1]]; ts = Math.max(ts, pg.t0 + .45 * (pg.t1 - pg.t0)); }
        T[k].to(ts, te, v1[k]);
      }
      if (!v2) {                                        // a held vowel is never parked: it has its own off-glide and leans toward the next vowel
        const d = g.t1 - g.t0, nv = a + 1 < nuc.length ? this.vt(S[nuc[a + 1]], null)[0] : null, og = OFFG[g.ph], o = og ? SHAPES[og[0]] : v1, ou = og ? og[1] : 0;
        if (d > .16) for (const k of ['X', 'Y', 'J', 'TR', 'LA']) { let z = v1[k] + ou * (o[k] - v1[k]); if (nv) z += .14 * (nv[k] - v1[k]); T[k].to(g.t0 + .28 * d, g.t1 + .05, z); }
      } else {
        const d = g.t1 - g.t0, w = Math.min(.30, Math.max(.12, d * .52)), last = i + 1 >= n, te = g.t1 + (last ? -.05 : .02);
        for (const k of BODY) T[k].to(te - w * (k === 'LP' ? 1.15 : 1), te, v2[k]);
      }
    }
    for (let a = 1; a < nuc.length; a++) {              // vowel-vowel joins: a tiny glottal dip so the words stay separate
      const i = nuc[a];
      if (S[i - 1].role === 'nuc') { const t = S[i].t0; if (S[i].ph === 'MM') T.AV.add(t - .13, t - .035, t - .02, t + .12, .50 + .12 * Math.sin(a * 1.9)); else T.AV.add(t - .075, t - .015, t - .012, t + .06, .62); }
    }
    if (this.o.hum) {
      S.forEach((g, i) => { if (i === 0 || g.t0 - S[i - 1].t1 > .15) T.GA.add(g.t0 - .05, g.t0 + .01, g.t0 + .02, g.t0 + .13, .06); });
      const a = S[0].t0 - 3, b = S[n - 1].t1 + 3;
      T.cLI.add(a, a + .01, b, b + .1, -.22); T.VEL.add(a, a + .01, b, b + .1, this.o.hum);
    }
  }
  cons(i, g) {
    const S = this.segs, T = this.T, n = S.length, p = g.ph, t0 = g.t0, t1 = g.t1, d = t1 - t0, prev = i > 0 ? S[i - 1] : null, nxt = i + 1 < n ? S[i + 1] : null, on = g.role === 'on';
    let vi = null; if (on) { for (let q = i + 1; q < n; q++) if (S[q].role === 'nuc') { vi = S[q]; break; } } else for (let q = i; q >= 0; q--) if (S[q].role === 'nuc') { vi = S[q]; break; }
    const vs = vi ? this.vt(vi, null) : null, vsh = vs ? (on ? vs[0] : (vs[1] || vs[0])) : SHAPES.AX, nextvoiced = nxt && nxt.role === 'nuc';
    const W = (tgt, w) => { const o = {}; for (const k in tgt) o[k] = vsh[k] + (tgt[k] - vsh[k]) * w; return o; };
    const body = (tgt, lead = .045, at = .35, keys) => { for (const k of (keys || Object.keys(tgt))) { T[k].to(t0 - lead, t0 + at * d, tgt[k]); this.claim[i + k] = t0 + Math.min(.8, at + .22) * d; } };
    // the tip does not leave one consonant for the next before that one is finished
    const ptip = prev && 'T D N S Z L DH TH'.split(' ').includes(prev.ph) && t0 - prev.t1 < .03, tip = (l0, l1, pl, hw) => { let a = t0 - l0, b = t0 - l1; if (ptip) { a = Math.max(a, prev.t1 - .028); b = Math.max(b, a + .04); } T.sTT.to(a, b, pl); T.hTT.to(a, b, hw); };
    let cl = d; const nuv = nxt && UV.has(nxt.ph), puv = prev && UV.has(prev.ph), soft = this.o.soft || 0;
    const AV = (v, l = .04, e = .03) => T.AV.add(t0 - l, t0 + .02, t1 - .02, t1 + e, v);
    if (p === 'P' || p === 'B' || p === 'M') {
      if (p === 'P') { cl = d * (on ? .50 : (nextvoiced ? .80 : .92)); if (on && puv) cl = d * .85; } else if (p === 'B') cl = d * .88; else cl = d * .96;
      T.cLI.add(t0 - .080, t0 + .012, t0 + cl - .003, t0 + cl + .080, -.20); body({ J: vsh.J * .55 }, .05, .2);
    }
    if (p === 'T' || p === 'D' || p === 'N') {
      if (p === 'T') { cl = d * (on ? .50 : (nextvoiced ? .75 : .9)); if (nuv) cl = d * .8; } else if (p === 'D') cl = d * .86; else cl = d * .95;
      const gem = nxt && nxt.t0 - t1 < .03 && (nxt.ph === 'T' || nxt.ph === 'D' || nxt.ph === 'N'); if (gem) cl = d + .03;
      tip(.11, .05, 14.75, .28); T.cTT.add(t0 - .080, t0 + .012, t0 + cl - .003, t0 + cl + .070, -.18);
      body({ J: Math.min(vsh.J, .22) * .8 + .02 }, .05, .25); body(W({ X: .74, Y: .02, TR: .05 }, .68), .08, .45);
    }
    if (p === 'K' || p === 'G' || p === 'NG') {
      const pl = 9.5 + Math.max(-.3, Math.min(1, vsh.X)) * 1.3; cl = p === 'K' ? d * (on ? .46 : .8) : (p === 'G' ? d * .84 : d);
      T.sTD.to(t0 - .12, t0 - .04, pl); T.hTD.to(t0 - .12, t0 - .04, .55);
      if (p === 'NG' && !nxt) T.cTD.add(t0 - .09, t0 + .014, t1 + .20, t1 + .30, -.14); else T.cTD.add(t0 - .095, t0 + .014, t0 + cl - .003, t0 + cl + .150, -.14);
      body({ J: vsh.J * .7, Y: vsh.Y * .6 + .22 }, .07, .3);
    }
    if (p === 'M' || p === 'N' || p === 'NG') {
      const fin = p === 'NG' && !nxt;
      T.VEL.add(t0 - (on ? .075 : .11), t0 + (on ? 0 : .008), t1 - .012 + (fin ? .4 : 0), t1 + .065 + (fin ? .4 : 0), p === 'NG' ? .95 : .75); AV(.92);
    }
    if (p === 'P' || p === 'T' || p === 'K') {          // glottis opens, peaks at the release, closes as the vowel starts
      const pk = on ? ((prev && prev.ph === 'S' && prev.role === 'on') ? .10 : .20) : .12, f1 = nuv ? t1 + .06 : t1 + (on ? .036 : .022);
      const f0 = nuv ? t1 : (on ? Math.max(t0 + cl, t1 - .024) : Math.max(t0 + cl, t1 - .045)); T.GA.add(t0 - .012, t0 + Math.max(.03, cl * .9), f0, f1, pk);
    }
    if (p === 'B' || p === 'D' || p === 'G') { T.VST.add(t0 - .02, t0 + .01, t0 + cl, t0 + cl + .02, 1); T.AV.add(t0 - .01, t0 + .03, t0 + cl - .006, t0 + cl + .016, .55); }
    if (p === 'S' || p === 'Z') {
      tip(.12, .03, 14.92, .42); T.cTT.add(t0 - .080, t0 + .020, t1 - .012, t1 + .100, p === 'S' ? .30 : .33);
      body({ J: .10, LA: Math.min(1.35, Math.max(.95, vsh.LA)), X: vsh.X > 0 ? Math.max(vsh.X, .35) : vsh.X * .5 + .15 }, .06, .3);
      if (p === 'S') T.GA.add(t0 - .035, t0 + .35 * d, t1 - (nuv ? 0 : .055), t1 + (nuv ? .05 : .018), .24); else T.GA.add(t0 - .03, t0 + .4 * d, t1 - .04, t1 + .02, .055);
    }
    if (p === 'F' || p === 'V') {
      T.cLD.add(t0 - .075, t0 + .016, t1 - .012, t1 + .10, p === 'F' ? .27 : .40); body({ J: .12 }, .05, .3);
      if (p === 'F') T.GA.add(t0 - .035, t0 + .35 * d, t1 - .05, t1 + .018, .22); else { T.GA.add(t0 - .03, t0 + .4 * d, t1 - .04, t1 + .02, .035); AV(.85); }
    }
    if (p === 'DH' || p === 'TH') {
      tip(.10, .03, 15.25, .2); T.cTT.add(t0 - .075, t0 + .012, t1 - .010, t1 + .10, .38);
      body({ J: .14, X: Math.max(vsh.X, .2) }, .05, .3); T.GA.add(t0 - .03, t0 + .4 * d, t1 - .035, t1 + .02, .03); AV(.60);
    }
    if (p === 'HH') T.GA.add(t0 - .05, t0 + .45 * d, t1 - .03, t1 + .035, .19 + .03 * soft);
    if (p === 'L') {
      if (!on) { const t = SHAPES.LD; body({ X: t.X, Y: t.Y, TR: t.TR, J: t.J }, .09, .45); }
      else body({ X: vsh.X * .35 - .05, Y: vsh.Y * .4 + .12, J: Math.min(.30, vsh.J) }, .05, .4);
      tip(.12, .03, 14.5, .35); T.cTT.add(t0 - .085, t0 + (on ? .015 : .045), t1 - .008, t1 + .11, on ? .45 : .55); T.LAT.add(t0 - .05, t0 + .02, t1 - .02, t1 + .04, .6);
    }
    if (p === 'R') body(SHAPES[on ? 'R' : 'ER'], on ? .07 : .12, on ? .4 : .6, on ? BODY : BODY.filter(k => k !== 'LA'));
    if (p === 'W') body(SHAPES.W, .07, .40);
    if (p === 'Y') body(SHAPES.Y, .06, .40);
  }
}

// ---------------------------------------------------------------- the actor: score + direction -> a performance
const ON = { P: .115, B: .085, T: .100, D: .070, K: .110, G: .085, S: .125, Z: .090, SH: .125, F: .105, V: .075, TH: .10, DH: .060, HH: .085, M: .085, N: .078, NG: .085, L: .080, R: .085, W: .085, Y: .075 };
const OFF = { P: .085, B: .07, T: .075, D: .065, K: .085, G: .07, S: .115, Z: .095, SH: .12, F: .095, V: .080, TH: .09, DH: .07, HH: .06, M: .100, N: .095, NG: .150, L: .105, R: .110, W: .07, Y: .07 };
const VOBS = new Set(['B', 'D', 'G', 'V', 'Z', 'DH']), WEAK = new Set(['the', 'and', 'it', 'is', 'a', 'that', 'in', 'tle', 'ly', 'bon', 'ning']);
// what each place does to the same throat: joy, grief, courage, tenderness, a question, joy again
const MOOD = {
  then:  { soft: .10, inhRel: 17, air: 1.00, open: 1.04, tune: .015, age: .22, port: .90, scoop: .45, att: .55, rub: .7, cons: 1.0, wob: 1.0, sw: 3.1, pos: .50, ten: .06, rough: 0, lh: -.04, fall: .25, relax: 2.2, inhD: .34 },
  now:   { soft: .18, inhRel: 13, air: 2.10, open: .84, tune: -.05, age: 1.0, port: 1.35, scoop: .75, att: .10, rub: 1.5, cons: 1.08, wob: 1.7, sw: 3.0, pos: .30, ten: -.24, rough: .0, lh: .12, fall: .55, relax: 3.0, inhD: .50 },
  storm: { soft: .06, inhRel: 17.5, air: 1.50, open: 1.12, tune: .03, age: .45, port: .85, scoop: 1.1, att: 1.0, rub: .5, cons: 1.12, wob: .8, sw: 1.6, pos: .60, ten: .16, rough: .5, lh: -.12, fall: .9, relax: 1.4, inhD: .26 },
  night: { soft: .30, inhRel: 14, air: 3.00, open: 1, tune: -.02, age: .85, port: 1.30, scoop: .6, att: .0, rub: 1.1, cons: 1, wob: 1.5, sw: 3.6, pos: .42, ten: .10, rough: 0, lh: .16, fall: .4, relax: 2.6, inhD: .60 },
  dawn:  { soft: .17, inhRel: 9, air: 3.00, open: .88, tune: -.04, age: 1.15, port: 1.0, scoop: .6, att: .12, rub: 1.2, cons: .95, wob: 1.8, sw: 1.8, pos: .30, ten: -.08, rough: .25, lh: .05, fall: .3, relax: 3.0, inhD: .60 },
  ride:  { soft: .10, inhRel: 17, air: 1.10, open: 1.08, tune: .02, age: .30, port: .95, scoop: .5, att: .60, rub: .8, cons: 1.0, wob: 1.0, sw: 3.3, pos: .52, ten: .09, rough: .12, lh: 0, fall: .25, relax: 2.2, inhD: .34 },
};
// line by line direction. arc = dB at start, peak, end, and where the peak sits. Everything is indexed by syllable.
const ACT = {
  // THEN: he offers, she answers, they roll along together
  t1:  { arc: [-2.2, .8, -1.6, .62], scoop: .8, rise: .45, emph: { 1: .8, 3: 1.2 }, late: { 3: .02 }, mess: { 3: 2.0 }, inh: [.42, .55] },
  t1a: { arc: [.2, .8, -2.5, .25], scoop: .35, lagx: -.015, emph: { 0: .6 }, lift: { 0: .80 }, laugh: [{ n: 1, at: .42, k: 3, rate: 5.7, amt: .75 }], inh: [.26, .5] },
  t2:  { arc: [-2.6, 1.8, .4, .72], scoop: 1.1, emph: { 1: 1.0 }, scoopN: { 3: 1.3 }, mess: { 3: 3.4 }, mord: [{ n: 3, at: .74, st: 2.0, dur: .11 }], vibx: 1.25, inh: [.40, .8] },
  t2a: { arc: [.4, .9, -1.8, .3], lagx: .055, slide: { 1: .26 }, scoop: 1.0, fall: -.1, von: { 1: .30 }, inh: [.26, .5] },
  t3:  { br: { 5: [.15, .45] }, arc: [-1.4, 1.2, -1.4, .55], emph: { 0: -1, 1: 1.5, 4: 1.1, 7: 1.7, 10: 1.2 }, scoopN: { 1: .4, 7: .4 }, inh: [.40, .7] },
  t3h: { br: { 5: [.15, .4] }, arc: [-1.6, 1.0, -1.6, .50], emph: { 0: -1, 1: 1.2, 4: 1.0, 7: 1.4, 10: 1.0 }, lagx: .012, inh: [.36, .6] },
  t4:  { br: { 5: [.21, .6] }, arc: [-3.6, 2.4, .8, .74], emph: { 2: .8, 5: 1.0, 7: 1.6 }, late: { 7: .05 }, scoopN: { 7: .9 }, mess: { 7: 2.2 }, vibx: 1.1, cutAt: 'matchCut', inh: [.2, .6] },
  t4h: { br: { 5: [.21, .5] }, arc: [-3.6, 2.2, .6, .74], emph: { 2: .6, 5: .8, 7: 1.3 }, late: { 7: .03 }, lagx: .01, scoopN: { 7: .5 }, mess: { 7: 1.6 }, cutAt: 'matchCut', inh: [.2, .5] },
  // NOW: to himself; over his shoulder; to the egg; and then the sentence he cannot finish
  n1:  { arc: [-2.5, .6, -4.0, .50], scoop: 1.0, pianto: { 1: .5, 3: .8 }, late: { 1: .03, 3: .09, 4: .05 }, ext: .42, thin: { deep: 9, from: .28, br: .30 }, ng: .30, fall: .15, inh: [.62, .55], endFry: .25 },
  n2:  { arc: [-3.0, 2.0, -1.0, .60], scoop: .9, emph: { 1: 1.6, 3: 1.4 }, late: { 1: .02, 3: .10 }, scoopN: { 3: 1.1 }, thin: { deep: 17, from: .26, br: .50, air: .62 }, straight: { 3: .55 }, fall: .25, inh: [.60, .75] },
  n3:  { br: { 5: [.36, .6] }, arc: [-1.8, 1.2, -2.2, .45], scoop: .5, emph: { 0: -1.0, 1: 1.8, 2: -.6, 4: 1.8, 5: -.6, 7: 2.0, 8: -.8, 10: 1.4 }, late: { 1: .05, 4: .06, 7: .07, 10: .10 }, port: 1.15, lh: .16, thin: { deep: 6, from: .35, br: .18 }, inh: [.55, .6] },
  n4:  { br: { 2: [.26, .6], 5: [.40, .95] }, arc: [-4.5, 3.2, 2.4, .80], scoop: .7, emph: { 2: .6, 5: 1.4 }, late: { 1: .02, 2: .05, 4: .03, 5: .10, 6: .13 }, pianto: { 2: .5, 5: 1.1 }, growTrem: 1, stop: { at: .60 }, catch_: [{ n: 6, at: -.01, dur: .13 }], creak: [{ n: 6, at: .12, dur: .15, hz: 78 }], crack: [{ n: 6, at: .29, st: 3.6, dur: .05, drop: .5 }], inh: [.46, .85] },
  // STORM: a father being brave out loud
  s1:  { br: { 1: [.13, .7], 4: [.20, .9] }, arc: [-.8, 1.0, -.6, .45], emph: { 0: 1.2, 1: .8, 4: 1.4, 6: 1.2 }, scoopN: { 0: 1.6, 1: .9, 4: 1.0, 6: .9 }, falls: { 4: .5, 10: .9 }, inh: [.40, .9], sharp: { 1: .12 } },
  s2:  { br: { 4: [.19, .9] }, arc: [-.8, 1.2, -.4, .42], emph: { 1: 1.0, 4: 1.8, 7: 1.0, 9: .8 }, scoopN: { 1: .9, 3: .6, 4: 1.3, 7: .8, 9: .6 }, falls: { 4: .7, 10: 1.0 }, inh: [.28, .95] },
  s3:  { br: { 1: [.25, 1.0], 3: [.25, 1.1] }, arc: [-1.8, 1.8, 2.0, .85], emph: { 1: .6, 3: 1.0, 5: 1.4 }, scoopN: { 0: 1.4, 1: .8, 2: 1.4, 3: 1.0, 4: 1.5, 5: 1.6 }, sharp: { 3: .12, 5: .30 }, shake: { 5: .8 }, mess: { 5: 1.6 }, roughN: { 5: .9 }, cutAt: 'wave', inh: [.26, 1.0] },
  // NIGHT: hummed through a closed bill
  h1:  { scoopN: { 1: .35, 2: .4, 3: .7, 4: .25 }, br: { 2: [.30, .5] }, arc: [-2.6, 1.0, -2.2, .55], scoop: .6, late: { 3: .07, 4: .05 }, puff: .9, thin: { deep: 6, from: .35, br: .15 }, inh: [.75, .7] },
  h1a: { arc: [-4.0, .0, -3.0, .60], scoop: 1.3, late: { 0: .10, 1: .12 }, soft: .34, pianto: { 1: .6 }, thin: { deep: 9, from: .40, br: .25 }, catch_: [{ n: 1, at: -.07, dur: .07, soft: .035 }], inh: [.80, .55], vibx: .8 },
  h2:  { scoopN: { 1: .4, 2: .45, 3: .8 }, arc: [-2.6, 1.0, -1.2, .65], late: { 3: .07 }, mess: { 3: 2.4 }, thin: { deep: 5, from: .5, br: .12 }, inh: [.62, .6] },
  h2a: { arc: [-.8, .9, -2.0, .45], slide: { 1: .30 }, mess: { 1: 2.0 }, rise: .1, vibx: 1.25, thin: { deep: 7, from: .5, br: .14 }, smile: .35, inh: [.40, .55] },
  h3:  { br: { 1: [.42, .45] }, arc: [-.6, .0, -6.0, .12], late: { 1: .06, 2: .12, 3: .20 }, fall: .8, ext: .25, thin: { deep: 13, from: .22, br: .40 }, endFry: .8, port: 1.2, inh: [.80, .5] },
  // DAWN: hoarse, unused, afraid to ask
  d1:  { arc: [-3.0, 1.6, -1.6, .58], scoop: 1.2, late: { 1: .03, 3: .06, 4: .04 }, rise: .75, soft: .16, croak: 1, catch_: [{ n: 1, at: -.03, dur: .04 }], crack: [{ n: 3, at: .30, st: 5.2, dur: .07, drop: .75 }], pianto: { 3: .6 }, emph: { 3: 1.0 }, thin: { deep: 6, from: .45, br: .25 }, ng: .34, inh: [.10, .3], endFry: .2 },
  // RIDE: the old voice, young again
  r1:  { arc: [-2.0, 1.2, -1.2, .60], scoop: .9, rise: .35, emph: { 1: 1.0, 3: 1.2 }, laugh: [{ n: 0, at: .30, k: 2, rate: 6.2, amt: .40 }, { n: 4, at: .46, k: 3, rate: 5.5, amt: .60 }], mess: { 3: 2.2 }, inh: [.42, .7] },
  r2:  { arc: [-2.2, 2.0, .8, .72], scoop: 1.1, emph: { 1: 1.2, 3: .8 }, scoopN: { 3: 1.2 }, mess: { 3: 3.2 }, vibx: 1.2, inh: [.40, .85] },
  r3:  { br: { 5: [.15, .55] }, arc: [-1.6, 1.8, -.4, .55], emph: { 0: -1, 1: 1.8, 4: 1.2, 7: 2.0, 10: 1.6 }, scoopN: { 1: .7, 7: .6 }, inh: [.40, .9] },
  r4:  { br: { 5: [.20, .8] }, arc: [-3.4, 3.0, .8, .74], emph: { 2: 1.0, 5: 1.4, 7: 1.8, 9: -1.6, 10: 1.0 }, late: { 7: .03 }, hold: { 7: .17 }, scoopN: { 5: .6, 7: 1.5 }, mess: { 7: 2.6 }, vibx: 1.15, von: { 7: .24 }, inh: [.2, 1.0] },
  r5:  { br: { 2: [.22, .45], 5: [.32, .6] }, arc: [-2.6, 1.4, -.6, .56], late: { 2: .04, 5: .06, 7: .09, 8: .05, 10: .12 }, emph: { 7: 1.2, 8: -.8, 9: -2.4, 10: 1.6 }, mess: { 7: 1.8, 10: .4 }, port: 1.25, lh: .08, thin: { deep: 11, from: .34, br: .30 }, fall: .1, smile: .8, inh: [.2, .75] },
  r5h: { br: { 5: [.28, .4] }, arc: [-2.6, 1.2, -1.4, .58], emph: { 9: -1.6, 10: 1 }, lagx: .05, late: { 7: .05, 10: .08 }, port: 1.45, thin: { deep: 14, from: .30, br: .35 }, fall: .05, soft: .18, inh: [.5, .5] },
};
const CR = 400;
const lineById = id => SC.lines.find(l => l.id === id);
const f0of = m => 440 * Math.pow(2, (m - 69) / 12);
// how much a line's last note gives up so the same singer can breathe before the next one
function breathCut(L) {
  let nx = null; for (const q of SC.lines) if (q.who === L.who && q !== L && q.t0 > L.t0 + .5 && (!nx || q.t0 < nx.t0)) nx = q;
  if (!nx) return 0;
  const gap = nx.t0 + ((nx.feel && nx.feel.lag) || 0) - L.t1, ln = L.notes[L.notes.length - 1], storm = L.sec === 'storm';
  return clamp((storm ? .31 : .36) - gap, 0, .45 * (ln.t1 - ln.t0));
}
function perform(L) {
  const F = L.feel || {}, A = L.act || ACT[L.id] || {}, M = MOOD[L.sec] || MOOD.then, V = SINGER[L.who], R = rng(hash('perf' + L.id)), n = L.notes.length;
  const dyn = F.dyn || 0, breath0 = F.breath === undefined ? .3 : F.breath, smile = (F.smile || 0) + (A.smile || 0) * (F.smile ? 0 : 1), vib = F.vib || 0, tremor = F.tremor || 0, eff = F.effort || 0, lag = (F.lag || 0) + (A.lagx || 0);
  const hum = !!F.hum, spoken = F.spoken || 0, ghost = !!F.ghost, age = L.who === 'he' ? M.age : M.age * .25, port = M.port * (A.port || 1);
  const cutT = A.cutAt ? SC.TIME[A.cutAt] : null;
  // ---- rubato
  const on = [], end = [];
  for (let i = 0; i < n; i++) { const N = L.notes[i], d = i === 0 ? ((A.late && A.late[0]) || 0) : clamp(R.g() * .013 * M.rub + .003, -.03, .04) + ((A.late && A.late[i]) || 0); on.push(N.t0 + lag + Math.min(d, .45 * (N.t1 - N.t0))); }
  if (A.hold) for (const k in A.hold) { const i = +k; if (i + 1 < n) on[i + 1] += A.hold[k]; }
  for (let i = 0; i < n - 1; i++) end.push(L.notes[i + 1].t0 - L.notes[i].t1 < .17 ? on[i + 1] : L.notes[i].t1 + lag);
  const lastN = L.notes[n - 1]; let eL = lastN.t1 + Math.min(lag, .05) + (A.ext || 0) - (L.act ? 0 : breathCut(L));
  if (cutT) eL = cutT + .5;
  if (A.stop) eL = on[n - 1] + (lastN.t1 - on[n - 1]) * A.stop.at;
  end.push(eL);
  const br = A.br || {}, gaps = []; for (const k in br) { const i = +k; if (i + 1 < n) end[i] = on[i + 1] - br[k][0] - .05; }
  // ---- phones. consonants sit before the beat so that the vowel lands on it
  const segs = [], cs = M.cons, info = L.notes.map(N => { const v = N.ph.findIndex(p => VOW.has(p)); return [N.ph.slice(0, v), N.ph[v], N.ph.slice(v + 1)]; });
  const onD = info.map(([o]) => { const f = [1, 1, .80, .70][Math.min(3, o.length)]; return o.map(p => ON[p] * R.r(.94, 1.08) * f * cs); });
  for (let i = 0; i < n; i++) { const room = i ? on[i] - on[i - 1] : 1, s = onD[i].reduce((a, b) => a + b, 0); if (s > .42 * room) onD[i] = onD[i].map(d => d * .42 * room / s); }
  for (let i = 0; i < n; i++) {
    const [o, nuc, c] = info[i], t = on[i], N = L.notes[i], weak = WEAK.has(N.syl);
    const sumOn = i < n - 1 ? onD[i + 1].reduce((a, b) => a + b, 0) : 0, e = i === n - 1 || br[i] ? end[i] - (br[i] ? sumOn : 0) : (end[i] === on[i + 1] ? on[i + 1] - sumOn : Math.min(end[i], on[i + 1] - sumOn));
    let off = c.map((p, q) => OFF[p] * R.r(.94, 1.08) * cs * ((p === 'Z' || p === 'S') && q === c.length - 1 && q > 0 ? 1.28 : 1)); if (i === n - 1) off = off.map(d => d * 1.25);
    if (A.stop && i === n - 1) off = [];
    const f = [1, 1, .84, .66][Math.min(3, off.length)]; off = off.map(d => d * f);
    const avail = e - t, vmin = Math.max(.10, .42 * avail), so = off.reduce((a, b) => a + b, 0);
    if (avail - so < vmin && off.length) { const q = Math.max(.35, (avail - vmin) / so); off = off.map(d => d * q); }
    let x = t - onD[i].reduce((a, b) => a + b, 0);
    o.forEach((p, k) => { segs.push({ ph: p, t0: x, t1: x + onD[i][k], syl: i, role: 'on' }); x += onD[i][k]; });
    const vend = e - off.reduce((a, b) => a + b, 0);
    segs.push({ ph: nuc, t0: t, t1: vend, syl: i, role: 'nuc', weak, last: i === n - 1, midi: N.midi, k: i });
    x = vend; if (!(A.stop && i === n - 1)) c.forEach((p, k) => { segs.push({ ph: p, t0: x, t1: x + off[k], syl: i, role: 'off' }); x += off[k]; });
  }
  segs.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i + 1 < segs.length; i++) if (segs[i].t1 > segs[i + 1].t0) segs[i].t1 = segs[i + 1].t0;
  const tOn = segs[0].t0, tOff = segs[segs.length - 1].t1;
  for (const k in br) { const a = Math.max(...segs.filter(g => g.syl === +k).map(g => g.t1)), b = Math.min(...segs.filter(g => g.syl === +k + 1).map(g => g.t0)); if (b - a > .08) gaps.push([a, b, br[k][1]]); }
  // ---- the breath before the line
  const prev = SC.lines.filter(q => q.who === L.who && q !== L && q.t1 < tOn + .1 && q.t0 < L.t0).sort((a, b) => b.t1 - a.t1)[0];
  const pend = prev && !L.act ? prev.t1 - breathCut(prev) + .06 : tOn - 2, inhA = A.inh || [M.inhD, .6], inhD = Math.min(inhA[0], Math.max(.17, tOn - .03 - pend));
  const bk = clamp(Math.pow(10, (dyn + 3) / 46), .5, 1.25), breaths = L.noBreath ? [] : [{ t0: tOn - .035 - inhD, t1: tOn - .035, depth: inhA[1] * bk, d0: inhA[1], nose: hum ? 1 : 0 }];
  for (const [a, b, dep] of gaps) breaths.push({ t0: a + .025, t1: b - .012, depth: dep * bk, d0: dep * .8, nose: hum ? 1 : 0 });
  const tail = cutT ? .02 : (A.stop ? .06 : .55 + (A.thin ? .25 : 0)), T0 = (breaths.length ? breaths[0].t0 : tOn) - .08, T1 = tOff + tail;
  // ---- control tracks
  const m = Math.ceil((T1 - T0) * CR) + 4, mk = () => new Float64Array(m), f0 = mk(), db = mk(), ten = mk(), bre = mk(), fry = mk(), rough = mk(), gaX = mk(), avX = mk().fill(1), fals = mk();
  const drift = smoothNoise(m, 1 / CR, .7, R, .055 + .05 * age), wob = smoothNoise(m, 1 / CR, 1.4, R, .55 * M.wob), w2 = smoothNoise(m, 1 / CR, 3.2, R, .35 * M.wob);
  const tr1 = smoothNoise(m, 1 / CR, .9, R, .55), tr2 = smoothNoise(m, 1 / CR, .8, R, .5); let trp = R.r(0, 6.28);
  const note = L.notes.map((N, i) => { const nxt = i + 1 < n ? on[i + 1] : end[i], dur = nxt - on[i], vonD = R.r(.16, .40);
    return { m: N.midi, t: on[i], dur, weak: WEAK.has(N.syl), rate: V.vibRate * R.r(.955, 1.06) - .30 * age, ph: R.r(0, 6.28), ext: dur > .5 && !(A.straight && A.straight[i] === 0) ? (.05 + .42 * vib) * R.r(.82, 1.18) * (A.vibx || 1) * clamp((dur - .3) / .7, .35, 1) : 0,
      von: A.von && A.von[i] !== undefined ? A.von[i] : vonD * (L.who === 'she' ? .9 : 1), rw: R.r(.15, .35), rp: R.r(0, 6.28) }; });
  const top = Math.max(...note.map(x => x.m)), cent = note.map(() => R.g() * .035 + M.tune);
  const loud = clamp((dyn + 6) / 10, -1.1, 1.1), ten0 = .42 + .12 * loud + .26 * eff + .05 * smile + M.ten + (F.push || 0) * 2, bre0 = ghost ? .62 : breath0;
  const arc = A.arc || [-2, .6, -1.5, .5], fallE = A.rise !== undefined ? -A.rise : (A.fall !== undefined ? A.fall : M.fall), scoop0 = A.scoop !== undefined ? A.scoop : M.scoop;
  for (let i = 0; i < m; i++) {
    const t = T0 + i / CR; let k = 0; while (k + 1 < n && t >= note[k + 1].t - .10 * port) k++;
    const nt = note[k], x = t - nt.t, u = x / Math.max(.1, nt.dur); let p = nt.m;
    if (k > 0) {                                        // portamento, overshoot, settle
      const a = note[k - 1].m, iv = nt.m - a; let w = clamp(.066 + .012 * Math.abs(iv), .06, .17) * port; if (A.slide && A.slide[k]) w = A.slide[k];
      p = a + iv * sstep((t - (nt.t - .62 * w)) / w); const sg = Math.sign(iv), st = (t - nt.t - .38 * w - .03);
      if (Math.abs(iv) >= 2 && !hum) p += sg * (.10 + .035 * Math.min(7, Math.abs(iv))) * Math.exp(-(((st - .02) / .045) ** 2)) * (sg < 0 ? .7 : 1);
    } else p -= scoop0 * (1 - sstep((x + .10) / (.20 + .06 * (1 - M.att))));
    const sN = (A.scoopN && A.scoopN[k]) || 0; if (sN) p -= sN * (1 - sstep((x + .05) / .15)) * (x > -.09 ? 1 : 0) * (k > 0 ? sstep((x + .09) / .05) : 1);
    const pi = (A.pianto && A.pianto[k]) || 0; if (pi) { p -= pi * Math.exp(-(((x - .035) / .045) ** 2)); }
    if (A.sharp && A.sharp[k]) p += A.sharp[k] * sstep((u - .2) / .8);
    const fl = (A.falls && A.falls[k]) || 0; if (fl) p -= fl * sstep((x - nt.dur + .22) / .20);
    if (A.mord) for (const q of A.mord) if (q.n === k) { const z = (u - q.at) * nt.dur / q.dur; p += q.st * sstep(z / .28) * (1 - sstep((z - .72) / .28)); }
    if (nt.ext > 0) {                                   // vibrato arrives late, its rate drifts, it relaxes at the end
      let e = nt.ext * sstep((x - nt.von) / .45) * (1 - .7 * sstep((x - nt.dur + .28) / .26)); if (A.straight && A.straight[k]) e *= 1 - sstep((u - A.straight[k]) / .3);
      const r = nt.rate * (1 - .05 * sstep((u - .6) / .4)); p += e * Math.sin(nt.ph + TAU * r * x + nt.rw * 2.2 * Math.sin(nt.rp + TAU * .55 * x));
    }
    if (spoken) { const z = clamp(u, 0, 1); p += spoken * (2.2 * Math.sin(Math.PI * Math.pow(z, .8)) - 2.4 * z + .4) * (k === n - 1 ? .25 : 1) - spoken * 1.2 * clamp((t - tOn) / (tOff - tOn), 0, 1); }
    // tremor: an old hand on the pitch. It grows inside a held note and toward the end of a hard line
    const uL = clamp((t - tOn) / (tOff - tOn), 0, 1), grow = A.growTrem ? .12 + .88 * uL * uL : 1;
    trp += TAU * (5.35 + .55 * tr1[i]) / CR; const env = clamp(.60 + .45 * tr2[i], .12, 1.35), ta = (tremor * grow + .13 * age + ((A.shake && A.shake[k]) || 0) * sstep((u - .25) / .5)) * env * (.35 + .65 * sstep(x / .45));
    p += .58 * ta * Math.sin(trp) + drift[i] + cent[k];
    p -= fallE * sstep((t - (tOff - .20)) / .20) * (cutT || A.stop ? 0 : 1);
    let rg = 0; if (A.crack) for (const q of A.crack) if (q.n === k) { const z = (x - q.at) / q.dur; if (z > 0 && z < 1) { p += q.st * Math.pow(Math.sin(Math.PI * clamp(z, 0, 1)), .5); rg = 1; } const zz = (x - q.at - q.dur) / .06; if (zz > 0 && zz < 1) avX[i] *= 1 - q.drop * Math.sin(Math.PI * zz); if (zz > -.35 && zz <= .1) avX[i] *= 1 - .6 * q.drop; }
    fals[i] = rg;
    f0[i] = f0of(p);
    // ---- loudness: phrase arc, note swell, metre, breath
    const pk = arc[3]; let lev = uL < pk ? arc[0] + (arc[1] - arc[0]) * sstep(uL / pk) : arc[1] + (arc[2] - arc[1]) * sstep((uL - pk) / (1 - pk));
    lev += .17 * (nt.m - V.mid);
    if (nt.dur > .45) { const z = clamp(u, 0, 1), sw = z < M.pos ? Math.sin(Math.PI / 2 * z / M.pos) : Math.cos(Math.PI / 2 * (z - M.pos) / (1 - M.pos)), am = M.sw * clamp(nt.dur / .9, .4, 1) + ((A.mess && A.mess[k]) || 0); lev += am * (sw - .55); }
    else lev -= M.relax * .5 * sstep((u - .45) / .55);
    lev += 1.25 * ((A.emph && A.emph[k]) || 0); if (nt.weak) lev += nt.m === top ? .4 : -2.3;
    lev += wob[i] * .75 + w2[i] * .5 + ta * 2.7 * Math.sin(trp + .7);
    if (hum && A.puff) lev += A.puff * 1.6 * Math.sin(TAU * 2.1 * (t - tOn) + 1) * (1 - uL);
    let th = 0; if (A.thin && k === n - 1) { th = clamp((u - A.thin.from) / (1 - A.thin.from), 0, 1); th = .7 * s3(th) + .3 * th; lev -= A.thin.deep * th; }
    else if (k === n - 1 && nt.dur > 1.4 && !cutT && !A.stop) { th = .5 * s3((u - .45) / .55); lev -= 8 * th; }
    const soft = A.soft || M.soft;
    if (!A.stop && !cutT) lev -= 10 * sstep((t - (tOff - .24)) / .24);
    lev -= (13 - 5 * M.att) * (1 - sstep((t - tOn) / soft));
    db[i] = dyn + lev;
    const q = lev * .022;
    let b = bre0 - q * .9 + .22 * sstep((t - (tOff - .35)) / .35) + ((A.thin && A.thin.br) || .18) * th; ten[i] = clamp(ten0 + q + wob[i] * .015 - .15 * th, .05, .98);
    if (!M.att && x < .18) b += .10 * (1 - x / .18);
    // thinning into air: the folds open and only the vowel's breath is left
    if (A.thin && A.thin.air && k === n - 1) { const z = s3((u - A.thin.air) / (1 - A.thin.air)); gaX[i] = .085 * z; b += .3 * z; }
    if (A.laugh) for (const q of A.laugh) if (q.n === k) { const z = (x - q.at * nt.dur) * q.rate; if (z > 0 && z < q.k) { const w = .5 - .5 * Math.cos(TAU * z), d = q.amt * (1 - .18 * Math.floor(z)); avX[i] *= 1 - d * (1 - w) * sstep(z / .25); gaX[i] = Math.max(gaX[i], .075 * d * (1 - w) * sstep(z / .25)); f0[i] *= Math.pow(2, (.9 * d * (w - .4) - .25 * Math.floor(z)) / 12); } }
    for (const [ga, gb] of gaps) if (t > ga - .10 && t < gb + .06) { const z = t < gb - .03 ? 1 - s3((t - ga + .10) / .12) : s3((t - gb + .03) / .075); avX[i] *= z; b += .25 * (1 - z); if (t < gb - .03) { f0[i] *= Math.pow(2, -.35 * (1 - z) / 12); db[i] -= 5 * (1 - z); } }
    if (A.lift && A.lift[k]) { const z = sstep((u - A.lift[k]) / .16); avX[i] *= 1 - .85 * z * (u < 1.05 ? 1 : 0); }
    if (A.catch_) for (const q of A.catch_) if (q.n === k || (q.n === k + 1 && t > note[k + 1].t - .2)) { const z = t - note[q.n].t - q.at, e0 = q.soft || .010, e1 = (q.soft || .008) * 1.2; if (z > -e0 && z < q.dur + e1) avX[i] *= z < 0 ? s3(-z / e0) : z > q.dur ? s3((z - q.dur) / e1) : 0; }
    if (A.creak) for (const q of A.creak) if (q.n === k) { const z = (x - q.at) / q.dur; if (z > 0 && z < 1) { fry[i] = 1; f0[i] = q.hz * (1 + .12 * Math.sin(19 * z)); db[i] -= 4; } }
    if (A.croak) { const z = (t - tOn) / .34; if (z < 1) { fry[i] = Math.max(fry[i], .8 * (1 - z)); rough[i] = .6 * (1 - clamp(z, 0, 1)); } rough[i] = Math.max(rough[i], .22); }
    rough[i] = Math.max(rough[i], V.grain * age * .45 + M.rough * clamp((lev + .5) / 4, 0, 1) * (.3 + .7 * eff) + ((A.roughN && A.roughN[k]) || 0) * sstep((u - .15) / .4) * .5);
    bre[i] = clamp(b, .03, .97);
  }
  for (const g of segs) if (VOBS.has(g.ph)) {           // consonant microprosody
    const c = (g.t0 + g.t1) / 2, w = (g.t1 - g.t0) * .6 + .02; for (let i = Math.max(0, Math.floor((c - 3 * w - T0) * CR)); i < Math.min(m, (c + 3 * w - T0) * CR); i++) f0[i] *= Math.pow(2, -.28 * Math.exp(-(((T0 + i / CR - c) / w) ** 2)) / 12);
  }
  for (const g of segs) if (g.role === 'nuc') { const q = []; for (let i = Math.floor((g.t0 + .05 - T0) * CR); i < (g.t1 - T0) * CR; i += 4) if (i >= 0 && i < m) q.push(f0[i]); q.sort((a, b) => a - b); g.f0 = q.length ? q[Math.floor(q.length * .6)] : f0of(g.midi); }
  return { id: L.id, who: L.who, V, seed: hash('v' + L.id), T0, T1, tOn, tOff, segs, breaths, exh: L.exh || [], CR, f0, db, ten, bre, fry, rough, gaX, avX, fals, eff, smile, hum, ghost, age, att: M.att, lh: A.lh !== undefined ? A.lh : M.lh,
    open: M.open, noise: (L.who === 'he' ? M.air : 1) * (A.air || 1), softOn: Math.max(.04, (A.soft || M.soft) * .6), hardEnd: !!A.stop, longTail: !!A.thin, cutT, endFry: A.endFry !== undefined ? A.endFry : .10 + .30 * age * (dyn < -6 ? 1 : .3), spoken, sc: new Gest(segs, { fs: V.fscale, hum: hum ? .95 : 0, ng: A.ng, soft: clamp(-dyn / 12, 0, 1) }), lev: .85, dyn, inhRel: M.inhRel };
}

// ---------------------------------------------------------------- the engine: gestures -> areas -> air -> folds -> tube -> 44.1 kHz
const CFG = { nv: .75, nu: .95, nm: .28, Kf: 1, Ka: 1, Ks: 1, hf: .16, pw: 2.2 };
const at = (a, x) => { if (x <= 0) return a[0]; const i = x | 0; if (i >= a.length - 1) return a[a.length - 1]; return a[i] + (a[i + 1] - a[i]) * (x - i); };
function engine(sp, dbg) {
  const V = sp.V, R = rng(sp.seed), { T0, T1, tOn, tOff, CR } = sp, tk = sp.sc.T, eff = sp.eff || 0, smile = sp.smile || 0;
  // ---- tract length through time gives the sample clock
  const gn = Math.ceil((T1 - T0) * 1000) + 6, gt = new Float64Array(gn); for (let i = 0; i < gn; i++) gt[i] = T0 + i * .001;
  const LPg = tk.LP.sample(gt), LHg = tk.LH.sample(gt), wobL = smoothNoise(gn, .001, 1.5, R, .02), Lg = new Float64Array(gn), LHo = new Float64Array(gn);
  { let z = 0; for (let i = 0; i < gn; i++) {
    const f = at(sp.f0, i * .001 * CR), ff = f > 60 ? f : (z || V.lhRef); z = z ? z + .02 * (ff - z) : ff;
    LHo[i] = clamp(-.36 * Math.log2(z / V.lhRef), -.24, .20) - .20 * smile - .24 * eff + (sp.lh || 0);      // the larynx rides with pitch, smile, shout
    LPg[i] -= .20 * smile * clamp(1 - LPg[i] * 1.2, 0, 1);
    Lg[i] = V.sp * (8 + LHg[i] + LHo[i]) + V.so * (8.3 + LPg[i]) + wobL[i];
  } }
  const tm = [], Tl = []; let t = T0; while (t < T1) { const L = at(Lg, (t - T0) * 1000), T = L / (NSEC * C0); tm.push(t); Tl.push(T); t += FRAME * T; } tm.push(t); Tl.push(Tl[Tl.length - 1]);
  const times = Float64Array.from(tm), Ts = Float64Array.from(Tl), nf = Ts.length - 1, S = {};
  for (const k in tk) S[k] = tk[k].sample(times);
  for (const [k, amp, fc] of [['J', .045, 1.6], ['X', .045, 2.0], ['Y', .045, 2.0], ['TR', .045, 1.4], ['LA', .055, 1.8], ['EP', .022, 2.2]]) { const w = smoothNoise(nf + 1, .001, fc, R, amp), a = S[k]; for (let i = 0; i <= nf; i++) a[i] += w[i]; }   // living drift
  const pt = a => { const o = new Float64Array(nf + 1); for (let i = 0; i <= nf; i++) o[i] = at(a, (times[i] - T0) * CR); return o; };
  const f0 = pt(sp.f0), db = pt(sp.db), ten = pt(sp.ten), bre = pt(sp.bre), fryT = pt(sp.fry), rouT = pt(sp.rough), gaX = pt(sp.gaX), avX = pt(sp.avX), fals = pt(sp.fals);
  { const w = smoothNoise(nf + 1, .001, 5, R, V.flut * (1 + .5 * sp.age)); for (let i = 0; i <= nf; i++) f0[i] *= Math.pow(2, w[i] / 1200); }
  for (let i = 0; i <= nf; i++) S.GA[i] = Math.max(S.GA[i], 0) + gaX[i];
  // ---- breath that is not voice: mouth / nose air in (+) and out (-)
  const air = new Float64Array(nf + 1), nose = new Float64Array(nf + 1), sign = new Float64Array(nf + 1), bright = new Float64Array(nf + 1);
  for (const b of sp.breaths) for (let i = 0; i <= nf; i++) { const u = (times[i] - b.t0) / (b.t1 - b.t0); if (u > 0 && u < 1) { const e = b.depth * (b.win ? b.win(u) : Math.pow(Math.sin(Math.PI * Math.pow(u, .75)), 1.2) * (b.env ? b.env(u, times[i]) : 1)); air[i] += e; nose[i] = b.nose; sign[i] = 1; bright[i] = 1; } }
  for (const b of sp.exh) for (let i = 0; i <= nf; i++) { const u = (times[i] - b.t0) / (b.t1 - b.t0); if (u > 0 && u < 1) { const e = b.depth * (b.env ? b.env(u, times[i]) : Math.pow(Math.sin(Math.PI * Math.pow(u, .45)), 1.1)); air[i] += e; nose[i] = b.nose; sign[i] = -1; } }
  // ---- areas, coefficients, aerodynamics, one frame (about 1 ms) at a time
  const K = new Float64Array((nf + 1) * NC), C = new Float64Array((nf + 1) * NK), Ps = new Float64Array(nf + 1), Pio_ = new Float64Array(nf + 1), fcs = new Float64Array(nf + 1), fhs = new Float64Array(nf + 1), frm = new Float64Array(nf + 1);
  const A = new Float64Array(NSEC), D = new Float64Array(NSEC), sN = new Float64Array(NSEC), gains = new Float64Array(FRI.length), jawV = new Float32Array(nf + 1), rndV = new Float32Array(nf + 1);
  let Pio = 0, trE = 0, pAc = 9; const cAd = [0, 0, 0], cPl = [0, 0, 0], ac = [0, 0, 0];
  for (let i = 0; i <= nf; i++) {
    const T = Ts[i], dx = T * C0, gi = (times[i] - T0) * 1000, LH = S.LH[i] + at(LHo, gi), xb = V.sp * (8 + LH), iso = 1 / V.so, isp = 1 / V.sp;
    let J = S.J[i], LA = S.LA[i]; const X = S.X[i], Y = S.Y[i], TRa = S.TR[i], TT = S.TT[i], BP = S.BP[i], EP = S.EP[i] - .05 * eff;
    const loud = Math.max(0, (db[i] + 12) / 12); J = (J * (1 + .10 * loud + .16 * eff) + .03 * loud + .07 * eff) * (sp.open || 1); LA *= 1 + .05 * loud + .10 * eff + .10 * smile;
    if (air[i] > 0 && !nose[i]) { J += .12 * air[i]; LA += .15 * air[i]; }
    const LIPs = LIP0 - .3;
    for (let n = 0; n < NSEC; n++) {
      const xp = (n + .5) * dx, s = xp < xb ? xp * isp - LH : 8 + (xp - xb) * iso, q = ((s - S_MIN) * GS + .5) | 0; sN[n] = s;
      let d = T_D0[q] + 1.15 * J * T_JW[q] - X * T_FX[q] - Y * T_FY[q] + TRa * T_TR[q] + EP * T_EP[q];
      if (s > 9) {
        if (TT > .01) { const u = (s - BP) / 1.15; d -= TT * Math.exp(-u * u); }
        if (s > LIPs) { let u = (s - LIPs) / .6; if (u > 1) u = 1; d += (LA - d) * u * u * (3 - 2 * u); }
      }
      if (d < .24) d = .12 + .12 * Math.exp((d - .24) / .12);
      D[n] = d;
    }
    for (let c = 0; c < 2; c++) {                        // tongue tip, tongue body
      const cn = c ? S.cTD[i] : S.cTT[i], pl = c ? S.sTD[i] : S.sTT[i], hw = c ? S.hTD[i] : S.hTT[i], sf = c ? .62 : 1.5, sb = c ? .62 : .55;
      cAd[c] = 9; cPl[c] = pl;
      if (cn < 2.4) {
        let am = 9; for (let n = 8; n < NSEC; n++) { const e = sN[n] - pl; if (e < -2.6 || e > 1.6) continue; const a = Math.abs(e) - hw, lim = cn + (a > 0 ? a * (e > 0 ? sf : sb) : 0); let d = D[n]; const df = d - lim; d = .5 * (d + lim - Math.sqrt(df * df + .012)); D[n] = d; if (d < am && a < .35) am = d; }
        cAd[c] = Math.max(0, am);
      }
    }
    const cl = Math.min(S.cLI[i], S.cLD[i]); cAd[2] = 9; cPl[2] = sN[NSEC - 1] + .5 * dx * iso - .3;
    if (cl < 2.4) { let am = 9; const Lt = sN[NSEC - 1] + .5 * dx * iso; for (let n = NSEC - 4; n < NSEC; n++) { const a = Math.abs(sN[n] - (Lt - .45)) - .32, lim = cl + (a > 0 ? a * 2.2 : 0); let d = D[n]; const df = d - lim; d = .5 * (d + lim - Math.sqrt(df * df + .012)); D[n] = d; if (d < am) am = d; } cAd[2] = Math.max(0, am); }
    for (let n = 0; n < NSEC; n++) { const d = D[n] * V.sd; A[n] = d > .012 ? PI4 * d * d : 1.1e-4; }
    let vel = Math.max(0, S.VEL[i]); if (air[i] > 0 && nose[i]) vel = Math.max(vel, .75 * nose[i] * Math.min(1, air[i] * 4));
    frameCoefs(K, i * NC, A, T, vel + .004, Math.max(0, S.LAT[i]), .85);
    const lipD = Math.sqrt(A[NSEC - 1] / PI4); jawV[i] = clamp(.46 * (lipD - .12) / 1.9 + .34 * clamp(J, 0, 1.3) * clamp((lipD - .05) / .35, 0, 1), 0, 1); rndV[i] = clamp(.75 * (S.LP[i] - .05) + .5 * clamp(1.0 - lipD, 0, 1) * (lipD > .06 ? 1 : 0), 0, 1);
    // ---- quasi-static air with compliance
    const ga = Math.max(0, S.GA[i]); let inv = 1 / (Math.min(A[NSEC - 1], 3) ** 2 + 1e-7);
    for (let c = 0; c < 3; c++) { ac[c] = cAd[c] < 8 ? PI4 * cAd[c] * cAd[c] : 9; inv += 1 / (ac[c] * ac[c] + 1e-7); }
    const Act = 1 / Math.sqrt(inv) + vel * .9, Ag = .030 + .03 * bre[i] + ga; Ps[i] = 4400 + 5400 * clamp((db[i] + 26) / 26, 0, 1) + 3000 * eff * clamp((db[i] + 10) / 12, 0, 1);
    const PS = Ps[i]; let Pq = PS * Ag * Ag / (Ag * Ag + Act * Act);
    const dUg = Ag * 1324.5 / (2 * Math.sqrt(Math.max(60, PS - Pio))), dUc = Act * 1324.5 / (2 * Math.sqrt(Math.max(60, Pio))), vst = S.VST[i];
    if (vst > 0 && Act < .02) Pq *= 1 - .42 * vst;
    let tau = clamp((ga < .03 ? 6e-3 : 3.5e-4) / (dUg + dUc + 1e-6), .0012, .16); if (vst > 0 && Act < .02) tau = Math.max(tau, .030 * vst);
    const dtf = FRAME * T; if (sp.hum) Pio = 0; else Pio += (Pq - Pio) * (1 - Math.exp(-dtf / tau));
    if (pAc < .006 && Act >= .006 && Pio > 600) trE = Math.sqrt(Pio / 8000); pAc = Act; trE *= Math.exp(-dtf / .0030);
    gains.fill(0); let fcut = 6000, gb = 0;
    for (let c = 0; c < 3 && !sp.hum; c++) if (ac[c] < 1.2) {
      const a = ac[c], dP = Pio * (1 / (a * a + 1e-7)) / inv; let amp = Math.pow(Math.max(0, dP / (1 + 8 * vel) - 350) / 8000, 1.5) * Math.sqrt(Math.min(a, .35) / .1); if (a < .0012) amp *= a / .0012;
      let ob, fc, trg, tgt; const pl = cPl[c];
      if (c === 0) { if (pl > 14.8 && pl < 15.12) { ob = 2.9; fc = 3500; trg = .6; } else if (pl < 14.2) { ob = 1.25; fc = 2700; trg = .6; } else if (pl < 14.8) { ob = .75; fc = 3900; trg = 1.1; } else { ob = .42; fc = 4200; trg = .3; } tgt = pl > 14.2 ? 15.50 : 15.1; }
      else if (c === 1) { ob = 1.3; fc = 2600; trg = 1.5; tgt = pl + .9; }
      else if (S.cLD[i] < S.cLI[i]) { ob = 14; fc = 4200; trg = .5; tgt = pl + .15; } else { ob = 1.2; fc = 2000; trg = 1.6; tgt = pl + .15; }
      const g = amp * ob * (ga < .08 ? (fc === 3500 ? 2.2 : .7) : 1) + trE * trg; if (g > gb) { gb = g; fcut = fc; }
      const x = (tgt < 8 ? (tgt + LH) * V.sp : xb + (tgt - 8) * V.so) / dx; let best = 0; for (let q = 1; q < FRI.length; q++) if (Math.abs(FRI[q] - x) < Math.abs(FRI[best] - x)) best = q;
      gains[best] += .65 * g; if (best > 0) gains[best - 1] += .22 * g; if (best < FRI.length - 1) gains[best + 1] += .22 * g;
    }
    frm[i] = ga > .08 ? 0 : 1; fcs[i] = fcut; fhs[i] = fcut === 3500 ? 3600 : (fcut < 2750 && fcut > 2650 ? 1500 : 500); Pio_[i] = Pio;
    // ---- per-frame constants
    let o = i * NK; const q15 = 1.5 / T, hw = q15 / (1500 + q15), Gw = 1 / (1500 + q15);
    for (let n = 1; n < NSEC; n += 2) { const d = D[n]; C[o++] = 1 - Math.min(.06, .0021 / (d > .05 ? d : .05)); }
    for (let q = 0; q < WALLS.length; q++) { const w = WALLS[q], a = Math.max(.25, A[w - 1]), b = Math.max(.25, A[w]); C[o++] = Gw * 2 * Math.sqrt(Math.PI * b) * 6 * dx * RC / (a + b); }
    const Lq = RHO * .30 / T, Rg = Math.sqrt(2 * RHO * Math.max(1500, PS - Pio)) * 1.15;
    C[o++] = hw; C[o++] = Lq; C[o++] = Rg + Lq; C[o++] = 1 / T;
    const KFr = 480 * CFG.Kf * Math.pow(10, clamp((sp.dyn || 0) + 2, -16, 3) * .40 / 20); for (let q = 0; q < FRI.length; q++) C[o++] = KFr * gains[q];
    const ns = nose[i] * Math.min(1, air[i] * 6); C[o++] = 1 - .88 * ns; C[o++] = .5 - .44 * ns; C[o++] = V.wr * Gw * 90; C[o++] = CFG.hf; C[o++] = 1.25 * ns;
    const pa = A[PJ - 1] + A[PJ]; C[o++] = RC / pa; C[o++] = CFG.pw;
    if (dbg && dbg.A) dbg.A.push([times[i], Float64Array.from(A)]);
  }
  // ---- source
  const N = nf * FRAME, US = new Float64Array(N), AG = new Float32Array(N), NA = new Float32Array(N), NF = new Float32Array(N), FS = new Float32Array(N), arcA = new Float64Array(nf + 1), vis0 = new Float32Array(nf + 1);
  const nucs = sp.segs.filter(g => g.role === 'nuc');
  if (nucs.length) { let nk = 0; for (let i = 0; i <= nf; i++) {         // syllable envelope: how softly each vowel is begun and left
    const tt = times[i]; while (nk + 1 < nucs.length && tt >= nucs[nk + 1].t0 - .02) nk++;
    const g = nucs[nk], d = Math.max(.12, g.t1 - g.t0), u = (tt - g.t0) / d; if (tt < g.t0 - .02) continue;
    const a0 = sp.hum ? .18 : .13 - .07 * sp.att, z = s3((tt - g.t0 + .02) / Math.min(a0, .35 * d)); let v = -(sp.hum ? 2.2 : 3.6 - 1.6 * sp.att) * (1 - z); if (u > .6) { const w = Math.min(1, (u - .6) / .4); v -= (sp.hum ? 1.2 : 2.2 - .8 * sp.att) * w * w; } arcA[i] = v;
  } }
  const LF = lfTable(), fl = FRAME; t = T0 + .01; let pn = 0, jl = 0, sl = 0, fi = 0;
  const onL = sp.softOn || (.085 - .045 * sp.att), offL = sp.hardEnd ? .012 : .16, offP = sp.hardEnd ? 0 : .05, rdMin = V.rdMin - .10 * eff, hasV = nucs.length > 0;
  while (hasV && t < T1 - .015) {
    while (fi < nf - 1 && times[fi + 1] <= t) fi++;
    const base = f0[fi]; jl += .22 * (R.g() - jl); sl += .25 * (R.g() - sl);
    const hi = clamp((base - 240) / 130, 0, 1), j = V.jit * (1 + .8 * sp.age + (sp.who === 'she' ? 0 : .6) * hi) * (.0022 * R.g() + .0046 * jl), sh = V.shim * (1 + .6 * sp.age) * (.012 * R.g() + .030 * sl);
    let fry = fryT[fi]; const fr0 = tOff - (sp.endFry > .5 ? .30 : .12); if (t > fr0 && sp.endFry > .15) fry = Math.max(fry, sp.endFry * Math.min(1, (t - fr0) / .2));
    const alt = pn % 2 ? 1 : -1, ro = rouT[fi] * (.6 + .4 * Math.sin(pn * .37)), T_0 = 1 / base * (1 + j + fry * (.05 * alt + .10) + ro * .006 * alt);
    const ga = S.GA[fi], PS = Ps[fi], trans = Math.max(0, (PS - Pio_[fi]) / PS); let gate = 1; if (ga > .04) gate = s3(1 - (ga - .04) / .09);
    let ons = clamp((t - (tOn - .03)) / onL, 0, 1); const ofs = clamp((tOff + offP - t) / offL, 0, 1); if (t < tOn - .03 || t > tOff + offP) ons = 0;
    const lev = Math.pow(10, (db[fi] + arcA[fi]) / 20), AVv = S.AV[fi], ax = avX[fi];
    const amp = lev * gate * Math.pow(trans, 1.2) * AVv * ax * ons * ofs * (1 + sh) * (1 - .38 * fry * (alt > 0 ? 1 : 0)) * (1 + .20 * ro * alt) * (1 - .25 * fals[fi]);
    const loudn = (db[fi] + 1.6 * arcA[fi] + 12) / 12;
    let Rd = 1.12 + V.rd + .30 * clamp((V.lowRef - base) / 45, 0, 1) - .95 * (ten[fi] - .35) + 1.0 * (bre[fi] - .30) - .16 * loudn + 7 * Math.max(0, ga - .01) + .55 * (1 - ons) * (1 - .7 * sp.att) + .5 * (1 - ofs) + .05 * sl + .9 * (1 - trans) + .35 * (1 - AVv) + .3 * (1 - ax) - .35 * fry + .95 * fals[fi];
    Rd = clamp(Rd, rdMin, 2.9);
    const ri = clamp(Math.round((Rd - RD0) / RDS), 0, RDN - 1) * 10, a_ = LF[ri], w_ = LF[ri + 1], c_ = LF[ri + 2], te = LF[ri + 3], Fte = LF[ri + 4], rk = LF[ri + 5], e_ = LF[ri + 6], q_ = LF[ri + 7], Fm = LF[ri + 8];
    const scale = amp * 4e5 * CFG.Ks * Math.pow(base / 200, .15) * T_0, tend = t + T_0; let n = Math.ceil((t - times[fi]) / Ts[fi]) + fi * fl;
    const agm = (.045 + .05 * bre[fi] + .05 * Math.min(1, lev)) / Fm * Math.min(1, amp * 6), iT = 1 / T_0, iF = 1 / Fm;
    vis0[fi] = amp > .0008 ? base : 0;
    for (;;) {
      const kk = (n / fl) | 0; if (kk >= nf) break; const tn = times[kk] + (n - kk * fl) * Ts[kk]; if (tn >= tend) break;
      const u = (tn - t) * iT; let F; if (u < te) F = c_ * (Math.exp(a_ * u) * (a_ * Math.sin(w_ * u) - w_ * Math.cos(w_ * u)) + w_); else { const v = u - te; F = Fte - rk * ((1 - Math.exp(-e_ * v)) / e_ - v * q_); }
      if (F < 0 && F > -1e-3) F = 0; US[n] = scale * F; AG[n] = agm * F; FS[n] = F * iF; n++;
    }
    t = tend; pn++;
  }
  // ---- leak and turbulence
  let lp1 = 0, lp2 = 0, lp3 = 0, lp4 = 0, lp5 = 0, hp = 0, lkp = -1, sd = (sp.seed ^ 0x9E3779B9) | 0 || 1; const a4 = 1 - Math.exp(-TAU * ((sp.noise || 1) > 1.4 ? 3000 : 4200) * Ts[0]), Ka = 4200 * CFG.Ka, offW = sp.hardEnd ? .02 : sp.longTail ? .45 : .24;
  for (let k = 0; k < nf; k++) {
    const T = Ts[k], n0 = k * fl, ga = Math.max(0, S.GA[k]), i0 = air[k], dP = Math.max(0, Ps[k] - Pio_[k]) / 8000, lev = Math.pow(10, db[k] / 20), vo = hasV && times[k] > tOn - .05 && times[k] < tOff + offW ? 1 : 0;
    let fade = 1; if (times[k] > tOff - .05) fade = Math.pow(Math.max(0, 1 - (times[k] - tOff + .05) / (sp.hardEnd ? .05 : sp.longTail ? .42 : .26)), sp.longTail ? 2 : 1.4);
    const von = hasV ? clamp((times[k] - tOn + .05) / .04, 0, 1) : 0, ax = avX[k] * .85 + .15, nv = vo * von * (sp.noise || 1) * (.13 + .52 * bre[k]) * Math.pow(lev, .55) * .34 * CFG.nv * fade * (ax < .3 && ga < .02 ? ax : 1) * (sp.ghost ? .80 : 1);
    const nu = vo * von * fade * (ga > .004 ? Math.pow(dP, 1.5) * Math.sqrt(Math.min(ga, .35) / .2) * .14 * CFG.nu * (sp.nuK || 1) * (gaX[k] > .02 ? .45 * Math.pow(lev, .35) : 1) : 0), ni = .085 * i0 * i0 + .010 * i0 * (sign[k] < 0 ? 1 : 0), fm = frm[k];
    const fa = i0 > .01 ? (nose[k] ? (sp.noseHz || (bright[k] ? 2100 : 1200)) : bright[k] ? 3300 : 2200) : (sp.hum ? 2200 : 3400), a1 = 1 - Math.exp(-TAU * fa * T), a2 = 1 - Math.exp(-TAU * fcs[k] * T), cg = .42 / a2, a3 = 1 - Math.exp(-TAU * fhs[k] * T);
    const lk = (.006 + .022 * bre[k] + ga) * vo * (ax < .3 && ga < .02 ? ax : 1) + .22 * Math.min(1.2, i0); if (lkp < 0) lkp = lk; const dlk = (lk - lkp) / fl; let lkc = lkp; lkp = lk; const nm = CFG.nm;
    for (let n = n0, e = n0 + fl; n < e; n++) {
      const F = FS[n]; sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; let w = sd * 2.3283064365386963e-10;
      lp1 += a1 * (w - lp1); hp += a1 * (lp1 - hp); lp5 += a4 * (hp - lp5); NA[n] = Ka * lp5 * (nv * (nm + (1 - nm) * F) + nu + ni);
      lkc += dlk; AG[n] = (AG[n] + lkc) * V.gload;
      sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; w = sd * 2.3283064365386963e-10;
      lp2 += a2 * (w - lp2); lp3 += a2 * (lp2 - lp3); lp4 += a3 * (lp3 - lp4); NF[n] = cg * (lp3 - lp4) * (1 - fm * .65 * (1 - F));
    }
  }
  // ---- the tube
  const tb = tube(sp.who, sp.hum), st = new Float64Array(tb.n), OUT = new Float64Array(N + 64), fn = tb.fn;
  for (let k = 0; k < nf; k++) fn(st, K, k * NC, (k + 1) * NC, C, k * NK, US, AG, NA, NF, k * fl, OUT);
  // ---- back to 44.1 kHz on the true clock
  const n0 = Math.ceil(times[0] * SR); let y = resample(OUT, times, Ts, nf, N);
  if (sp.lev > 0 && hasV) y = effort(y, n0, sp.segs.filter(g => g.role === 'nuc' || (g.role === 'off' && g.t1 - g.t0 > .05 && 'L R N M NG'.split(' ').includes(g.ph))), times, nf, db, arcA, sp.lev);
  if (hasV && sp.inhRel) for (const b of sp.breaths) if (b.d0) {    // how loud a breath is belongs to the acting, not to the plumbing
    const i0 = Math.max(0, Math.round(b.t0 * SR) - n0), i1 = Math.min(y.length, Math.round(b.t1 * SR) - n0), W = 1764; let mx = 1e-12; for (let i = i0; i + W <= i1; i += 441) { let e = 0; for (let q = i; q < i + W; q++) e += y[q] * y[q]; if (e / W > mx) mx = e / W; }
    const g = Math.pow(10, clamp(DB0 + sp.dyn - sp.inhRel + 20 * Math.log10(b.d0 / .6) - 10 * Math.log10(mx), -14, 20) / 20), ed = Math.min(1100, (i1 - i0) * .3); for (let i = i0; i < i1; i++) y[i] *= 1 + (g - 1) * s3((i - i0) / ed) * s3((i1 - i) / ed);
  }
  post(y, V);
  return { n0, y, times, nf, jawV, rndV, vis0, air, sign, bre, db, S, Pio_, dbgA: dbg && dbg.A };
}
const OPENV = { AA: 1.2, AE: 1.0, AO: .8, AW: 1.2, AY: 1.2, OY: .6, EH: .6, AH: .6, OW: .2, ER: -.3, EY: 0, IH: -.8, UH: -.8, IY: -1.6, UW: -1.6, MM: -1 };
// a singer aims at loudness, not at glottal amplitude: slowly correct the vowel-to-vowel level the tract produces
function effort(y, n0, nucs, times, nf, db, arcA, amount) {
  const n = y.length, e = new Float64Array(n + 1), a = Math.exp(-TAU * 260 / SR); let px = 0, py = 0, c = 0;
  for (let i = 0; i < n; i++) { py = a * (py + y[i] - px); px = y[i]; c += py * py; e[i + 1] = c; }
  const pts = [], T0 = times[0], fT = (times[nf] - T0) / nf;
  for (const g of nucs) {
    const d = Math.min(.05, .25 * (g.t1 - g.t0)), a0 = g.t0 + d, b0 = g.t1 - d, i = clamp(Math.floor(a0 * SR) - n0, 0, n - 1), j = clamp(Math.floor(b0 * SR) - n0, i + 1, n), Lm = 10 * Math.log10((e[j] - e[i]) / (j - i) + 1e-9);
    const k0 = clamp(Math.floor((a0 - T0) / fT), 0, nf - 1), k1 = clamp(Math.floor((b0 - T0) / fT), k0 + 1, nf); let Pm = 0; for (let k = k0; k < k1; k++) Pm += Math.pow(10, (db[k] + arcA[k]) / 10);
    const off = g.role === 'off', er = clamp(10 * Math.log10(Pm / (k1 - k0)) + (off ? (g.ph === 'L' || g.ph === 'R' ? -2.2 : -5) : OPENV[g.ph] || 0) + LREF - Lm, -14, 14) * amount;
    pts.push([a0, b0, off && pts.length ? Math.min(pts[pts.length - 1][2], er) : er]);
  }
  let q = 0, gp = -1; const np = pts.length, sc = Math.pow(10, (DB0 - LREF) / 20);
  for (let m = 0; m < n; m += 64) {
    const t = (n0 + m) / SR; while (q + 1 < np && t > pts[q + 1][0]) q++;
    const [a0, b0, gv] = pts[q]; let gd; if (t <= b0 || q === np - 1) gd = gv; else { const u = s3((t - b0) / Math.max(1e-3, pts[q + 1][0] - b0)); gd = gv + (pts[q + 1][2] - gv) * u; }
    const lin = Math.pow(10, gd / 20) * sc; if (gp < 0) gp = lin; const d = (lin - gp) / 64; let g = gp, e2 = Math.min(n, m + 64); for (let i = m; i < e2; i++) { g += d; y[i] *= g; } gp = lin;
  }
  return y;
}
const HALF = 26, PH = 256; let _ker = null;
function kernel() {
  if (!_ker) { _ker = new Float64Array((PH + 1) * 2 * HALF); const fc = 19500 / 95000 * 2;
    for (let p = 0; p <= PH; p++) { const fr = p / PH; let g = 0; for (let k = 0; k < 2 * HALF; k++) { const x = k - HALF + 1 - fr, s = Math.abs(x) < 1e-9 ? fc : Math.sin(Math.PI * fc * x) / (Math.PI * x), z = x / (HALF + .5), w = Math.abs(z) < 1 ? .42 + .5 * Math.cos(Math.PI * z) + .08 * Math.cos(TAU * z) : 0; g += (_ker[p * 2 * HALF + k] = s * w); } for (let k = 0; k < 2 * HALF; k++) _ker[p * 2 * HALF + k] /= g; } }
  return _ker;
}
function resample(x, times, Ts, nf, N) {
  const ker = kernel(), n0 = Math.ceil(times[0] * SR), n1 = Math.floor(times[nf] * SR) - 1, pad = new Float64Array(N + 2 * HALF + 8); pad.set(x.subarray(0, N), HALF);
  const out = new Float64Array(Math.max(0, n1 - n0 + 1)); let k = 0;
  for (let n = n0; n <= n1; n++) { const t = n / SR; while (k < nf - 1 && times[k + 1] <= t) k++; const pos = k * FRAME + (t - times[k]) / Ts[k], i = pos | 0, p = (((pos - i) * PH + .5) | 0) * 2 * HALF; if (i + 1 + 2 * HALF > pad.length) break; let s = 0; for (let q = 0, b = i + 1; q < 2 * HALF; q++) s += pad[b + q] * ker[p + q]; out[n - n0] = s; }
  return out;
}
function biq(x, b0, b1, b2, a1, a2) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = x[i], z = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = z; x[i] = z; } }
function hpf(x, f, q) { const w = TAU * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al; biq(x, (1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0); }
function lpf(x, f, q) { const w = TAU * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al; biq(x, (1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0); }
function lowShelf(x, f, g) { const A = Math.pow(10, g / 40), w = TAU * f / SR, c = Math.cos(w), r = 2 * Math.sqrt(A) * Math.sin(w) / 2 * Math.SQRT2, a0 = (A + 1) + (A - 1) * c + r; biq(x, A * ((A + 1) - (A - 1) * c + r) / a0, 2 * A * ((A - 1) - (A + 1) * c) / a0, A * ((A + 1) - (A - 1) * c - r) / a0, -2 * ((A - 1) + (A + 1) * c) / a0, ((A + 1) + (A - 1) * c - r) / a0); }
function post(y, V) { lpf(y, V.lp, .62); hpf(y, V.hp, .7); lowShelf(y, V.shelf[0], V.shelf[1]); }        // the microphone

// ---------------------------------------------------------------- what the picture needs to know, 100 Hz
function visOf(r, pcm, n0, span) {
  const t0 = n0 / SR, n = Math.max(1, Math.ceil(pcm.length / SR * 100)), mk = () => new Float32Array(n), v = { t0, dt: .01, jaw: mk(), round: mk(), level: mk(), f0: mk(), breath: mk() }; let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * .01; while (k < r.nf - 1 && r.times[k + 1] <= t) k++;
    const c = i * 441, a = Math.max(0, c - 551), b = Math.min(pcm.length, c + 551); let s = 0; for (let q = a; q < b; q++) s += pcm[q] * pcm[q]; const L = 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
    v.level[i] = clamp((L + 54) / 42, 0, 1); v.jaw[i] = r.jawV[k]; v.round[i] = r.rndV[k];
    let f = 0; for (let q = Math.max(0, k - 9); q <= Math.min(r.nf, k + 9); q++) if (r.vis0[q] > 0) { f = r.vis0[q]; if (q >= k) break; } v.f0[i] = v.level[i] > .02 ? f : 0;
    v.breath[i] = clamp(r.air[k] > .01 ? r.sign[k] * Math.min(1, r.air[k] * 1.2) : (f > 0 ? -(.10 + .40 * r.bre[k] * v.level[i]) : 0), -1, 1);
  }
  if (span) for (let i = 0; i < n; i++) { const t = t0 + i * .01, e = Math.min(s3((t - span[0] + .10) / .22), s3((span[1] + .55 - t) / .40)); v.jaw[i] *= e; v.round[i] *= e; }
  return v;
}
function finish(sp, r, gain = 1) {
  let y = r.y, n0 = r.n0; if (gain !== 1) for (let i = 0; i < y.length; i++) y[i] *= gain;
  let end = y.length; if (sp.cutT) end = Math.min(end, Math.round(sp.cutT * SR) - n0);
  const pcm = new Float32Array(end); for (let i = 0; i < end; i++) pcm[i] = y[i];
  const fi = Math.min(end, 441), fo = sp.cutT ? 88 : 882; for (let i = 0; i < fi; i++) pcm[i] *= i / fi; for (let i = 0; i < Math.min(fo, end); i++) pcm[end - 1 - i] *= (i / fo);
  let pk = 0; for (let i = 0; i < end; i++) { const a = Math.abs(pcm[i]); if (a > pk) pk = a; } if (pk > .70) for (let i = 0; i < end; i++) pcm[i] *= .70 / pk;
  return { id: sp.id, who: sp.who, t0: n0 / SR, pcm, vis: visOf(r, pcm, n0, [Math.min(sp.tOn, ...sp.breaths.concat(sp.exh).map(b => b.t0)), Math.max(sp.segs.length ? sp.tOff : -1, ...sp.breaths.concat(sp.exh).map(b => b.t1))]) };
}
function renderLine(id, dbg) { const L = typeof id === 'string' ? lineById(id) : id, sp = perform(L), r = engine(sp, dbg); if (dbg) { dbg.sp = sp; dbg.r = r; } return finish(sp, r); }

// ---------------------------------------------------------------- breaths, a sniff, a gasp, a laugh: the same throat with the folds apart
function shiver(seed, r0, r1, deep) { const n = 2400, R = rng(seed), w = smoothNoise(n, .002, 2.2, R, 1), am = smoothNoise(n, .002, 1.3, R, .35); let ph = R.r(0, 6); const tb = new Float64Array(n); for (let i = 0; i < n; i++) { const x = i / n; ph += TAU * (r0 + (r1 - r0) * Math.min(1, x * 2.4) + 1.1 * w[i]) * .002; tb[i] = 1 - deep * (.5 + .5 * Math.sin(ph)) * clamp(.85 + am[i], .2, 1); } return t => at(tb, t / .002); }
function airSpec(id, t0, t1, shape, o) {
  const V = SINGER.he, T0 = t0 - .06, T1 = t1 + .14, m = Math.ceil((T1 - T0) * CR) + 4, mk = v => new Float64Array(m).fill(v || 0), sc = new Gest([], { fs: V.fscale });
  for (const k of BODY) sc.T[k].v0 = shape[k];
  if (o.to) for (const k of BODY) sc.T[k].to(t0 - .02, t0 + (o.by || .3), o.to[k]);
  if (o.closed) { sc.T.cLI.add(T0 - 9, T0 - 8, T1 + 8, T1 + 9, -.22); }
  return { id, who: 'he', V, seed: hash('air' + id), T0, T1, tOn: T1 + 9, tOff: T1 + 9, segs: [], breaths: [], exh: [], CR, f0: mk(120), db: mk(-20), ten: mk(.3), bre: mk(.8), fry: mk(), rough: mk(), gaX: mk(), avX: mk(1), fals: mk(), eff: 0, smile: o.smile || 0, hum: !!o.closed, age: .8, att: .1, lh: o.lh || 0, sc, lev: 0, endFry: 0 };
}
function voicedSpec(id, t0, notes, feel, act, sec) { return perform({ id, who: 'he', sec: sec || 'now', feel, act: Object.assign({ arc: [0, 0, -2, .3] }, act), notes, t0, t1: notes[notes.length - 1].t1, noBreath: true }); }
function renderSound(j) {
  const s = SC.sounds[j], id = 'snd' + j, t = s.t, d = s.dur, sd = hash(id + s.kind); let sp;
  const openAX = mix(SHAPES.AX, SHAPES.AH, .5), one = (ph, midi, a, b) => [{ syl: 'ah', ph, midi, t0: a, t1: b }];
  if (s.kind === 'shaky-exhale') {
    const sh = shiver(sd, 4.4, 6.6, .86); sp = voicedSpec(id, t, one(['AH'], 47, t + .02, t + d * .72), { dyn: -22, breath: .95, tremor: 1.6 }, { arc: [-2, 1, -8, .2], scoop: -1.5, fall: 2.2, thin: { deep: 12, from: .3, br: .3 }, soft: .12 }, 'now');
    sp.T1 = t + d + .15; for (let i = 0; i < sp.avX.length; i++) { const x = sp.T0 + i / CR - t, e = sh(Math.max(0, x)); sp.avX[i] *= Math.pow(e, 3) * clamp(1 - x / (d * .62), 0, 1); sp.gaX[i] = .075 + .05 * (1 - e); sp.fry[i] = .5; }
    sp.exh = [{ t0: t, t1: t + d, depth: .95, nose: 0, env: u => Math.pow(Math.min(1, u / .06), 1.2) * Math.pow(1 - u, .75) * (.18 + .82 * sh(u * d)) }]; sp.lev = 0;
  } else if (s.kind === 'inhale-shaky') {
    const sh = shiver(sd, 5.2, 6.4, .62); sp = airSpec(id, t, t + d, mix(SHAPES.AX, SHAPES.EH, .3), { to: openAX, by: d }); sp.breaths = [{ t0: t, t1: t + d, depth: .95, nose: 0, env: u => .25 + .75 * sh(u * d) }];
  } else if (s.kind === 'sniff') {
    sp = airSpec(id, t, t + d, SHAPES.AX, { closed: 1 }); const fl = shiver(sd, 34, 46, .55), wn = u => Math.pow(Math.min(1, u / .22), 1.3) * (.55 + .45 * u) * s3((1 - u) / .10); sp.breaths = [{ t0: t, t1: t + d * .40, depth: 1, nose: 1, win: u => wn(u) * fl(u * d * .4) }, { t0: t + d * .54, t1: t + d, depth: .85, nose: 1, win: u => wn(u) * fl(.3 + u * d * .46) }]; sp.noseHz = 4200; sp.hpHz = 900;
  } else if (s.kind === 'nose-pant') {
    sp = airSpec(id, t, t + d, mix(SHAPES.O, SHAPES.AX, .5), { closed: 1 }); const R = rng(sd); let x = t, k = 0;
    while (x < t + d - .2) { const a = .15 + .012 * k + R.r(-.01, .012), b = .19 + .022 * k + R.r(-.012, .02), g = Math.pow(.90, k) * R.r(.85, 1.08); if (x + a + b > t + d + .12) break; sp.breaths.push({ t0: x, t1: x + a, depth: .95 * g, nose: 1 }); sp.exh.push({ t0: x + a + .02, t1: x + a + .02 + b, depth: .85 * g, nose: 1 }); x += a + b + .04 + .012 * k; k++; }
  } else if (s.kind === 'gasp' || s.kind === 'gasp-soft') {
    const soft = s.kind === 'gasp-soft', D = soft ? .34 : .42;
    if (soft) { sp = airSpec(id, t, t + D, mix(SHAPES.AX, SHAPES.IH, .4), { to: mix(SHAPES.AX, SHAPES.EH, .5), by: D * .8 }); sp.breaths = [{ t0: t, t1: t + D, depth: .8, nose: 0, env: u => .5 + .5 * u }]; }
    else { sp = voicedSpec(id, t, one(['AH'], 60, t + .03, t + .20), { dyn: -13, breath: .9, effort: .3 }, { arc: [0, 0, -3, .3], scoop: 5, fall: -2, soft: .07 }, 'storm'); sp.T1 = t + D + .2; sp.breaths = [{ t0: t, t1: t + D, depth: 1.15, nose: 0, env: u => .55 + .45 * Math.sin(Math.PI * u) }]; for (let i = 0; i < sp.gaX.length; i++) sp.gaX[i] = .035; sp.lev = 0; }
  } else if (s.kind === 'sigh') {
    sp = voicedSpec(id, t, one(['HH', 'AH'], 49, t + .09, t + d * .55), { dyn: -15, breath: .85, tremor: .3 }, { arc: [0, .5, -6, .15], scoop: .5, fall: 4.5, thin: { deep: 16, from: .15, br: .4, air: .35 }, soft: .12, endFry: .4 }, 'now');
    sp.T1 = t + d + .15; sp.exh = [{ t0: t + .02, t1: t + d, depth: .8, nose: 0, env: u => Math.pow(Math.min(1, u / .10), 1.2) * Math.pow(1 - u, 1.1) }]; sp.lev = 0;
  } else {                                              // laugh: an old chest shaking, five or six "ha", the air running out
    const R = rng(sd), notes = [], P = [59, 62, 60, 58, 55, 52]; let x = t + .13; for (let k = 0; k < 6; k++) { const q = .178 + .012 * k + R.r(-.012, .012); notes.push({ syl: 'ha', ph: ['HH', k % 3 === 1 ? 'AH' : 'AA'], midi: P[k] + R.r(-.4, .4), t0: x, t1: x + q * .52 }); x += q; }
    sp = voicedSpec(id, t, notes, { dyn: -7, breath: .42, smile: .9 }, { arc: [-1, 1.5, -11, .18], scoop: 1.6, fall: 1.0, late: { 0: 0 }, soft: .05 }, 'ride'); sp.nuK = 5; sp.exh = [{ t0: t - .02, t1: t + .13, depth: .5, nose: 0 }]; sp.T0 = Math.min(sp.T0, t - .08);
    sp.breaths = [{ t0: x + .06, t1: x + .34, depth: .55, nose: 0 }]; sp.T1 = x + .45;
    for (const g of sp.segs) if (g.role === 'nuc') for (let i = 0; i < sp.f0.length; i++) { const z = (sp.T0 + i / CR - g.t0) / (g.t1 - g.t0); if (z > 0 && z < 1.3) { sp.f0[i] *= Math.pow(2, (.9 * (1 - z) - .9 * z) / 12); sp.avX[i] *= 1 - .92 * s3((z - .55) / .4); sp.gaX[i] = Math.max(sp.gaX[i], .12 * s3((z - .55) / .4)); } }
  }
  fitTracks(sp); const r = engine(sp); if (sp.hum) { hpf(r.y, sp.hpHz || 240, .6); lpf(r.y, 5200, .6); } let pk = 0; for (let i = 0; i < r.y.length; i++) pk = Math.max(pk, Math.abs(r.y[i]));
  const out = finish(sp, r, pk > 0 ? Math.pow(10, s.db / 20) / pk : 0); out.kind = s.kind; return out;
}
// after T0/T1 of a performance have been widened, stretch its tracks to match
function fitTracks(sp) { const m = Math.ceil((sp.T1 - sp.T0) * CR) + 4; for (const k of ['f0', 'db', 'ten', 'bre', 'fry', 'rough', 'gaX', 'avX', 'fals']) { const a = sp[k]; if (a.length < m) { const b = new Float64Array(m); b.set(a); b.fill(a[a.length - 1], a.length); sp[k] = b; } } }

// ---------------------------------------------------------------- the chick: a syrinx with two lips, a short windpipe, a beak
// Two notes. "w" is a closed beak opening while the syrinx tightens (the pitch leaps up), "ee" is a wide beak and a short
// tube (second harmonic rings), "t" is a closure, "oo" is a rounded, longer tube (only the fundamental gets out).
const CHICK = {
  c0:  { db: -12, bright: .60, sub: .24, flut: 1.3, air: .75, wet: 1, sure: .45, wee: -.25, end: -1.0, push: 0 },
  c00: { db: -6.5, bright: 1.0, sub: .20, flut: .7, air: .40, wet: .25, sure: 1, wee: 0, end: -.5, push: .12 },
  r1a: { db: -1.5, bright: 1.3, sub: .18, flut: .6, air: .35, wet: 0, sure: 1, wee: .1, end: .4, push: .30 },
  r2a: { db: -3, bright: 1.1, sub: .18, flut: .6, air: .35, wet: 0, sure: 1, wee: 0, end: .2, push: .12, trill: 1 },
  r5c: { db: -4.5, bright: .85, sub: .20, flut: .8, air: .50, wet: 0, sure: .9, wee: 0, end: -1.4, push: 0, slow: 1 },
};
function chick(o) {
  const c = o.c, R = rng(o.seed), w0 = o.w0, w1 = o.w1, u0 = o.u0, u1 = o.u1, fw = f0of(o.mw) , fu = f0of(o.mu), pre = .13, T0 = w0 - pre - (c.wet ? .10 : 0), T1 = u1 + .30, n = Math.ceil((T1 - T0) * SR), y = new Float64Array(n), nv = Math.ceil((T1 - T0) * 100) + 1;
  const vis = { t0: T0, dt: .01, jaw: new Float32Array(nv), round: new Float32Array(nv), level: new Float32Array(nv), f0: new Float32Array(nv), breath: new Float32Array(nv) };
  const Cn = 32, m = Math.ceil(n / Cn) + 2, fl = smoothNoise(m, Cn / SR, 8, R, 1), fl2 = smoothNoise(m, Cn / SR, 11, R, 1), dr = smoothNoise(m, Cn / SR, 1.6, R, 1), wr = smoothNoise(m, Cn / SR, 3, R, 1); let wph = R() * TAU, nm = 0, nm1 = 0;
  const tc0 = u0 - .060, tc1 = u0 - .010;               // the "t" closure
  let ph = R() * TAU, ph2 = R() * TAU, sd = (o.seed ^ 0x5bd1e995) | 0 || 7, n1 = 0, n2 = 0, n3 = 0, n4 = 0, b1 = 0, b2 = 0, pa = new Float64Array(6), tri = 0;
  const res = (f, F, Q) => { const r = f / F, a = 1 - r * r, b = r / Q; return 1 / Math.sqrt(a * a + b * b); };
  for (let q = 0; q < m - 1; q++) {
    const t = T0 + q * Cn / SR, wD = .105; let f = fw, amp = 0, R1 = 1700, R2 = 3600, asp = 0, jaw = 0, rnd = 0, br = c.bright;
    if (t < tc0 + .004) {                                // "wee"
      const g = sstep((t - (w0 - wD)) / (wD + .035)), x = t - w0, dur = tc0 - w0, z = clamp(x / dur, 0, 1);
      f = fw * Math.pow(2, (-9.5 * (1 - g) + .75 * Math.exp(-(((x - .055) / .035) ** 2)) + c.wee * (1 - z) + (1 - c.sure) * .5 * Math.sin(Math.PI * z) - .35 * s3((z - .45) / .3) + .9 * s3((z - .80) / .2)) / 12);
      amp = Math.pow(sstep((t - (w0 - wD)) / (wD + .05)), 1.3) * (1 - .25 * z) * s3((tc0 - t) / .022); if (x < 0) amp *= .55 + .45 * g;
      R1 = 950 + 780 * g; R2 = 1500 + 2150 * sstep((t - w0 + .05) / .09); br *= .35 + .65 * sstep((t - w0 + .03) / .06); jaw = .12 + .78 * sstep((t - w0 + .06) / .10) * s3((tc0 + .01 - t) / .05); rnd = 1 - sstep((t - w0 + .06) / .08);
      asp = .05 * amp;
    } else if (t >= tc1 - .004) {                        // "two"
      const x = t - u0, dur = u1 - u0, z = clamp(x / dur, 0, 1);
      f = fu * Math.pow(2, (1.7 * Math.exp(-Math.max(0, x + .01) / .026) - .30 * s3((z - .25) / .5) + (1 - c.sure) * .35 * Math.sin(2.2 * Math.PI * z) + c.end * s3((z - .70) / .35)) / 12);
      amp = s3((t - tc1) / .022) * (.82 + .30 * Math.sin(Math.PI * Math.min(1, z * 1.1))) * s3((u1 + .06 - t) / (.16 + .12 * (c.slow || 0)));
      if (c.trill) { const w = s3((z - .28) / .25); tri += TAU * (13.5 + 2 * z) * Cn / SR; f *= Math.pow(2, w * 1.0 * (1 + Math.sin(tri)) / 12); amp *= 1 + .22 * w * Math.sin(tri + 1.2); }
      const k = 1 - sstep((x - .0) / .085); R1 = 1480 + 120 * k; R2 = 1750 + 1150 * k; br *= .30 + .45 * k; asp = .30 * Math.exp(-Math.max(0, x + .012) / .016) + .025 * amp; jaw = .14 + .30 * s3((t - tc1) / .05) * s3((u1 + .1 - t) / .15); rnd = .35 + .65 * (1 - k);
    } else { const x = t - (u0 - .022); asp = x > 0 ? .55 * Math.exp(-x / .008) * Math.min(1, x / .0025) : 0; jaw = .06; }
    wph += TAU * (21 + 2.5 * wr[q]) * Cn / SR; const held = t < tc0 ? s3((t - w0 - .07) / .10) : s3((t - u0 - .09) / .16); f *= Math.pow(2, (held * (.10 + .12 * c.flut) * Math.sin(wph) * (.7 + .3 * wr[q]) + c.flut * .14 * fl[q] + .05 * dr[q] + .18 * c.push * Math.sin(t * 31)) / 12); amp *= clamp(1 + c.flut * .09 * fl2[q] + held * .09 * Math.sin(wph + 1.1), .2, 1.6);
    if (c.sure < .6 && t > w0 - .02 && t < w0 + .045) amp *= .35 + .65 * Math.abs(Math.sin((t - w0) * 120));          // not sure: the first lip catches late
    const G = new Float64Array(6);                        // h1..h4 of the voice, then the half-rate companion (1/2, 3/2)
    const roll = [1, .34 * br, .13 * br * br, .05 * br * br]; for (let h = 0; h < 4; h++) { const fh = f * (h + 1); G[h] = fh < 9000 ? amp * roll[h] * (.55 * res(fh, R1, 2.6) + .55 * res(fh, R2, 3.6)) : 0; }
    G[4] = amp * c.sub * .8 * res(f * .5, 1000, 2); G[5] = amp * c.sub * .62 * res(f * 1.5, R2, 2.6);
    const k0 = q * Cn, dph = TAU * f / SR; for (let i = 0; i < Cn && k0 + i < n; i++) {
      const a = i / Cn; ph += dph; ph2 += dph * .5; if (ph > TAU * 64) { ph -= TAU * 64; }
      const s = (pa[0] + (G[0] - pa[0]) * a) * Math.sin(ph) + (pa[1] + (G[1] - pa[1]) * a) * Math.sin(2 * ph + .6) + (pa[2] + (G[2] - pa[2]) * a) * Math.sin(3 * ph + 1.1) + (pa[3] + (G[3] - pa[3]) * a) * Math.sin(4 * ph) + (pa[4] + (G[4] - pa[4]) * a) * Math.sin(ph2) + (pa[5] + (G[5] - pa[5]) * a) * Math.sin(3 * ph2 + .4);
      sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; const w = sd * 4.6566e-10; nm1 += .075 * (w - nm1); nm += .075 * (nm1 - nm); n1 += .42 * (w - n1); n2 += .42 * (n1 - n2); n3 += .18 * (n2 - n3); y[k0 + i] = s * (1 + 5 * c.air * nm) + (n2 - n3) * asp * .30;
    }
    pa = G; const vi = Math.min(nv - 1, Math.round((t - T0) * 100)); vis.jaw[vi] = jaw; vis.round[vi] = rnd; vis.f0[vi] = amp > .03 ? f : 0; vis.breath[vi] = amp > .03 ? -.5 * amp : (t > w0 - pre - .05 && t < w0 - .11 ? .8 : 0);
  }
  if (c.wet) for (let b = 0; b < 4; b++) {               // the shell is still in its throat: a few tiny rising bubbles
    const tb = b < 2 ? w0 - .20 + .07 * b + R.r(-.015, .015) : (b === 2 ? tc0 + .02 : u1 + .05 + R.r(0, .05)), fb = R.r(620, 1050), k0 = Math.round((tb - T0) * SR); let p = 0;
    for (let i = 0; i < 900; i++) { const x = i / SR, e = Math.exp(-x / .0052) * Math.min(1, x / .0012); p += TAU * fb * (1 + x * 26) / SR; if (k0 + i >= 0 && k0 + i < n) y[k0 + i] += .11 * c.wet * e * Math.sin(p); }
  }
  lpf(y, 8200, .6); hpf(y, 420, .7);
  let e = 0, k = 0; const ia = Math.max(0, Math.round((w0 + .03 - T0) * SR)), ib = Math.min(n, Math.round((u1 - .05 - T0) * SR)); for (let i = ia; i < ib; i++) { e += y[i] * y[i]; k++; }
  const g = Math.pow(10, (DB0 - 1 + c.db) / 20) / Math.sqrt(e / Math.max(1, k) + 1e-12); const pcm = new Float32Array(n); for (let i = 0; i < n; i++) pcm[i] = y[i] * g; for (let i = 0; i < 300; i++) { pcm[i] *= i / 300; pcm[n - 1 - i] *= i / 300; }
  for (let i = 0; i < nv; i++) { const cc = i * 441, a = Math.max(0, cc - 441), b = Math.min(n, cc + 441); let s = 0; for (let q = a; q < b; q++) s += pcm[q] * pcm[q]; vis.level[i] = clamp((10 * Math.log10(s / Math.max(1, b - a) + 1e-12) + 54) / 42, 0, 1); }
  return { t0: T0, pcm, vis };
}
function renderChick(L) { const [a, b] = L.notes, c = CHICK[L.id] || CHICK.c00, r = chick({ c, seed: hash('chick' + L.id), w0: a.t0, w1: a.t1, u0: b.t0, u1: b.t1, mw: a.midi, mu: b.midi }); return { id: L.id, who: 'chick', t0: r.t0, pcm: r.pcm, vis: r.vis }; }
// her answer on demand: 0-3 in D, 4-7 in E, each one a different mood
function reply(variant = 0) {
  const v = ((variant % 8) + 8) % 8, R = rng(hash('reply' + v)), base = [CHICK.c00, CHICK.r1a, CHICK.r5c, CHICK.r2a][v % 4], c = Object.assign({}, base, { db: -2.5 + R.r(-1, 1), flut: base.flut + R.r(0, .4), end: base.end + R.r(-.5, .5), wee: R.r(-.2, .2), wet: 0 }), k = R.r(.9, 1.12), w = .30 * k, u = .36 * k, d = (.55 + .12 * (v % 4 === 3 ? 1.6 : R())) * k;
  const r = chick({ c, seed: hash('rp' + v), w0: .2, w1: .2 + w, u0: .2 + u, u1: .2 + u + d, mw: v < 4 ? 93 : 95, mu: v < 4 ? 90 : 92 }); r.vis.t0 = 0; return { id: 'reply' + v, who: 'chick', t0: 0, pcm: r.pcm, vis: r.vis, dur: r.pcm.length / SR, lead: .2 - r.t0 };
}

// ---------------------------------------------------------------- the API
const cost = id => { const L = lineById(id); if (L) return L.who === 'chick' ? .1 : L.t1 - L.t0 + 1; const s = SC.sounds[+id.slice(3)]; return s ? s.dur : 1; };
const jobs = () => SC.lines.map(l => l.id).concat(SC.sounds.map((_, i) => 'snd' + i)).sort((a, b) => cost(b) - cost(a));
function render(id) {
  if (id.slice(0, 3) === 'snd') return renderSound(+id.slice(3));
  const L = lineById(id); if (!L) throw new Error('VOICE: no line ' + id);
  return L.who === 'chick' ? renderChick(L) : renderLine(id);
}
return { SR, jobs, render, reply, cost, _: { set plain(v) { plain = v; for (const k in _tubes) delete _tubes[k]; }, CFG, perform, engine, renderLine, SINGER, SHAPES, tube, F1OF, MOOD, ACT } };
})();
if (typeof module !== 'undefined') module.exports = VOICE;
