// ============================================================================
// 80_stage.js - where everyone is at time t: machine, actors, acting, cloth,
// egg, weather. Pure functions of film time plus small springs.
// ============================================================================
const ST = {}; const TM = SCORE.TIME, BT = SCORE.T;
const have = n => { try { return eval('typeof ' + n + ' !== "undefined"'); } catch (e) { return false; } };
ST.clock = null;
const SPD = t => ST.clock ? ST.clock.v : SCORE.speed(t), CRK = t => ST.clock ? ST.clock.crank : SCORE.crank(t), DST = t => ST.clock ? ST.clock.dist : SCORE.dist(t);
// ---------- the machine -----------------------------------------------------
const X0 = -33, RIDE_X = 314;
const nookPos = () => (have('SET') && SET.nook) ? SET.nook : { sit: [301, .42, -2.6], bike: [298.6, .42, -2.0], ledge: [301, .42, -2.6] };
ST.bikeX = t => ST.clock ? (ST.clock.x0 || 322) + (ST.clock.dist - (ST.clock.d0 || 0)) - ST.clock.v * Math.max(0, (ST.now || t) - t) : t < 112 ? SCORE.dist(t) + X0 : t < 184 ? nookPos().bike[0] : RIDE_X + SCORE.dist(t) - SCORE.dist(185.4);
ST.bike = t => {
  const x = ST.bikeX(t), v = SPD(t), c = CRK(t) * TAU; let y = 0, z = 0, pitch = 0, lean = 0, yaw = 0, steer = 0, bump = 0;
  if (t >= 112 && t < 184) { const n = nookPos().bike; return { x: n[0], y: n[1], z: n[2], pitch: 0, lean: have('TANDEM') ? TANDEM.standLean : -.09, yaw: .12, steer: .28, v: 0, bump: 0, stand: 1 }; }
  const yf = groundY(x + .92), yr = groundY(x - .86); y = (yf + yr) / 2; pitch = Math.atan2(yf - yr, 1.78);
  const cob = y > .2 ? 1 : .12; bump = cob * Math.min(1, v / 2); y += bump * (.006 * wob(x * 5.3, 3) + .004 * wob(x * 11.7, 5)); pitch += bump * .006 * wob(x * 4.1, 9);
  lean = .020 * Math.sin(c) * Math.min(1, v) + .012 * wob2(t * .7, 4); z = .05 * wob2(t * .32, 11); steer = -.03 * Math.sin(c) - .02 * wob2(t * .9, 6); yaw = .012 * wob2(t * .4, 21);
  if (t > 85 && t < 108) { const k = smooth(86, 95, t); lean += k * (.07 * wob2(t * 1.15, 31) + .045); z += k * .16 * wob2(t * .6, 32); steer += k * .10 * wob2(t * 1.5, 33); yaw += k * .04 * wob2(t * .8, 34); pitch += k * .015 * wob2(t * 2.1, 36); }
  if (t > TM.wave - .45 && t < 112) { const a = t - (TM.wave - .10), k = smooth(0, .75, a); lean += -1.32 * k * k * (3 - 2 * k) * .9; z += .55 * smooth(-.2, 1.1, a); yaw += -.35 * smooth(-.4, .6, a); steer += .7 * smooth(-.3, .2, a); y += .10 * Math.sin(Math.PI * clamp(a / .55)) ; }
  if (ST.clock) { z += ST.clock.z || 0; const sv = ST.clock.sv || 0; yaw += sv * .30; lean += sv * .16; steer -= sv * .15; }
  return { x, y, z, pitch, lean, yaw, steer, v, bump, stand: 0 };
};
ST.bikeM = b => { const q = Q.mul(Q.mul(Q.axis([0, 1, 0], -b.yaw), Q.axis([0, 0, 1], b.pitch)), Q.axis([1, 0, 0], b.lean)); return M4.trs([b.x, b.y, b.z], q); };
ST.pedal = (M, bb, crank, z, phase) => { const a = crank * TAU + phase; return M4.pt(M, [bb[0] - Math.sin(a) * DIM.crank, bb[1] - Math.cos(a) * DIM.crank, z * DIM.pedalZ]); };
// ---------- voice -> face ---------------------------------------------------
// VIS[id] = {t0, dt, jaw, level, f0, breath}. Real tracks arrive from the voice worker; until then a drawn-from-score stand-in.
ST.VIS = {};
const OPENV = { AA: 1, AE: .85, AO: .75, AY: .9, AW: .9, AH: .6, EH: .6, OW: .55, ER: .4, EY: .5, IH: .38, IY: .34, UW: .28, UH: .4, MM: .0 };
ST.stand = L => { if (L._v) return L._v; const t0 = L.t0 - .6, n = Math.ceil((L.t1 + .5 - t0) * 100), jaw = new Float32Array(n), level = new Float32Array(n), breath = new Float32Array(n), f0 = new Float32Array(n), round = new Float32Array(n); for (const N of L.notes) { const ph = N.ph.find(p => p in OPENV) || 'AH', o = OPENV[ph]; for (let i = 0; i < n; i++) { const t = t0 + i / 100; const k = smooth(N.t0 - .09, N.t0 + .06, t) * (1 - smooth(N.t1 - .10, N.t1 + .02, t)); jaw[i] = Math.max(jaw[i], o * k); level[i] = Math.max(level[i], k); if (t >= N.t0 && t < N.t1) f0[i] = 440 * Math.pow(2, (N.midi - 69) / 12); } } for (let i = 0; i < n; i++) { const t = t0 + i / 100; breath[i] = pulse(t, L.t0 - .55, L.t0 - .35, L.t0 - .15, L.t0 - .02); } return L._v = { t0, dt: .01, jaw, level, breath, f0, round }; };
ST.vis = (who, t) => { const o = { jaw: 0, level: 0, breath: 0, f0: 0, vib: 0, line: null, u: 0 }; for (const L of SCORE.lines) { if (L.who !== who || t < L.t0 - 1.2 || t > L.t1 + 1) continue; const v = ST.VIS[L.id] || ST.stand(L), x = (t - v.t0) / v.dt; if (x < 0 || x >= v.jaw.length - 1) continue; const i = Math.floor(x), f = x - i, g = a => a[i] + (a[i + 1] - a[i]) * f; const lv = g(v.level); if (g(v.jaw) >= o.jaw) o.jaw = g(v.jaw); if (lv >= o.level) { o.level = lv; o.line = L; o.f0 = v.f0[i]; } const b = g(v.breath); if (Math.abs(b) > Math.abs(o.breath)) o.breath = b; } return o; };
// lungs: fill before each line, empty through it, idle in between
ST.lungs = (who, t, rate = .28) => { let b = .30 + .28 * Math.sin(t * TAU * rate); for (const L of SCORE.lines) { if (L.who !== who) continue; const a = L.t0 - .75; if (t < a || t > L.t1 + 1.2) continue; const inn = smooth(a, L.t0 - .05, t), out = smooth(L.t0, L.t1, t); const v = lerp(b, 1.15, inn) * (1 - out) + out * lerp(-.25, b, smooth(L.t1, L.t1 + 1.2, t)); b = v; } return b; };
// ---------- acting tracks: [t, v] keys. Yaw + = to his right (towards our lens). ----------------------------------------
const A = {};
A.yaw = [[0, .05], [6.5, .05], [8.4, .10], [9.8, .25], [10.6, 1.75], [12.2, 1.7], [13.2, .35], [14.6, .1], [16.6, .2], [17.2, 1.25], [19.2, 1.35], [20.4, .25], [21.2, .05], [24, .30], [27.4, .15], [29, .9], [31.2, 1.0], [32.2, .35], [34.83, .2],
  [34.84, .0], [44, .05], [46, .0], [49.2, .10], [50.6, .55], [51.5, 2.75], [53.9, 2.70], [54.9, .25], [56.5, .1], [58.8, .75], [59.6, 1.15], [61.9, 1.05], [62.9, .25], [64, .0], [66, -.34], [69, -.40], [72, -.10], [75, .1], [77.4, .5], [78.6, .85], [80.4, .5], [82.2, .05],
  [84, -.10], [85.5, .1], [88, -.25], [91, .10], [95, .15], [96.8, -.35], [99, -.2], [101.2, .2], [103, .05], [104.8, -.6], [105.8, -1.9], [107.1, -2.0], [107.4, -.4]];
A.pitch = [[0, -.06], [8.2, -.06], [9.6, .10], [10.6, .02], [12.3, .16], [13.4, -.02], [14.9, .02], [16.4, .16], [18.0, .12], [19.4, .0], [21, -.02], [24, .10], [26, .02], [28, .12], [30.2, .20], [32.2, .36], [34.83, .28],
  [34.84, -.16], [38, -.20], [42, -.16], [46, -.14], [48.5, -.02], [50.8, .02], [51.5, -.06], [53.8, -.12], [55, -.16], [57, .05], [59.8, .14], [61.4, -.02], [63.2, -.26], [65, -.46], [67.4, -.50], [69.6, -.44], [72, -.30], [74, -.06], [76.2, .10], [77.7, .04], [78.6, -.20], [80.2, -.46], [81.8, -.30],
  [82.8, .05], [84.4, .22], [85.8, .10], [88, -.18], [91, -.10], [94, .02], [96, -.02], [99, .10], [101.3, -.05], [104, .22], [105.4, .30], [106.4, .42], [107.3, .5]];
A.roll = [[0, 0], [10.8, .0], [11.6, -.18], [13, .05], [18.2, -.15], [20, .0], [30, .12], [33, .06], [34.83, 0], [34.84, 0], [51.4, -.10], [53.5, -.16], [55, 0], [60, -.10], [63, 0], [66, .12], [69, .16], [72, .04], [78, .0], [80, .10], [82, 0], [88, -.08], [92, .06], [98, -.1], [105, 0]];
A.up = [[0, .1], [9.8, .4], [12, .2], [14.8, .3], [16.6, .75], [19, .3], [21, .25], [26, .4], [28, .3], [30.4, .75], [34.83, .6], [34.84, -.45], [46, -.40], [49, -.05], [51.4, .10], [54.5, -.45], [57, .2], [59.8, .4], [62.4, -.4], [65, -.2], [69, -.15], [73, .05], [76.4, .40], [78, .0], [80.4, -.42], [82.5, -.3], [84, .25], [86, -.3], [91, -.2], [95, .1], [99, .2], [101.5, .1], [104.5, .6], [106.8, .9], [107.4, .2]];
A.fwd = [[0, .1], [34.83, .1], [34.84, .25], [51, .0], [54, .25], [63, .25], [66, .45], [69.6, .40], [72.5, .25], [78, .2], [80.4, .5], [82.5, .1], [85.5, .4], [88, .8], [96, .6], [104, .35], [107, .1]];
A.lean = [[0, .10], [8, .10], [14.6, .06], [17, -.04], [20, .10], [34.83, .04], [34.84, .20], [46, .20], [57, .10], [63, .22], [67, .32], [72, .22], [76, .10], [80, .30], [82.4, .18], [85.6, .34], [88, .46], [95, .44], [104, .34], [106.8, .05], [107.4, -.2]];
// lids: 0 wide open 1 closed (upper); lower lid lifts with a smile
A.lidU = [[0, .22], [9, .20], [10.6, .06], [12, .30], [14, .22], [17, .12], [18.2, .45], [20, .24], [27, .26], [31, .35], [33.2, .86], [34.83, .92], [34.84, .50], [38, .52], [42, .50], [46, .46], [49, .34], [51.2, .18], [52.6, .20], [53.8, .52], [55, .50], [57, .28], [59.8, .12], [60.8, .20], [62, .60], [63.4, .52], [65, .48], [67, .40], [69, .46], [72, .42], [75, .34], [77, .28], [77.8, .55], [79, .88], [80.4, .97], [81.6, .62], [82.6, .25], [83.6, .05], [85.5, .12], [88, .40], [90, .22], [94, .34], [96, .18], [99, .28], [101.4, .22], [104, .10], [105.6, .0], [107.3, .0]];
A.lidL = [[0, .30], [10.6, .34], [12, .55], [14, .35], [18.2, .60], [20, .4], [27, .42], [31, .5], [34.83, .55], [34.84, .10], [51.2, .06], [53.8, .22], [57, .10], [62, .24], [65, .20], [67, .34], [69.4, .42], [72, .26], [76, .12], [77.8, .34], [79, .42], [81.6, .22], [83, .05], [88, .40], [92, .28], [96, .12], [100, .3], [105.6, .0]];
A.bu = [[0, .25], [9.8, .8], [12.2, .3], [16.4, .95], [19, .4], [24, .4], [30, .9], [33.5, .4], [34.83, .4], [34.84, -.1], [46, .0], [49, .45], [51.2, .95], [53, .8], [54, .1], [57, .5], [59.9, .95], [61.4, .7], [62.4, .0], [65, .25], [68, .6], [72, .4], [76, .7], [77.8, .55], [80, .1], [82.6, .5], [83.6, .9], [85.5, .2], [88, -.5], [91, .0], [94, -.3], [96, .3], [99, -.1], [104, .5], [105.6, 1.0], [107.3, 1]];
// tilt + worried, - stern
A.bt = [[0, .0], [34.83, .1], [34.84, .75], [46, .7], [51.2, .85], [53.8, 1.0], [57, .7], [62, 1.0], [65, .5], [68, .25], [72, .5], [76, .9], [78, 1.1], [81, 1.0], [83.6, .6], [86, -.1], [88, -.8], [92, -.3], [96, .2], [99, -.5], [101.5, .1], [104, .8], [105.6, 1.1]];
A.gx = [[0, 0], [9.8, .25], [12.5, .0], [17, .3], [19.5, 0], [34.83, 0], [34.84, 0], [50.4, .3], [51.6, .35], [53.6, .25], [54.2, 0], [59.4, .3], [62, .1], [63, 0], [77.6, .25], [80, .1], [82, 0], [105, -.2], [105.8, -.4], [107, -.4]];
A.gy = [[0, 0], [34.83, 0], [34.84, -.12], [50.8, -.06], [53.8, -.34], [56, -.1], [59.8, .05], [62, -.32], [64.4, -.40], [69, -.36], [73, -.10], [77, .02], [78.8, -.36], [81.4, -.25], [83.6, .25], [86, 0], [91, -.22], [94, -.05], [105.8, .3]];
A.cheek = [[0, .5], [12, .9], [14, .5], [18.4, .9], [20, .5], [34.83, .6], [34.84, 0], [64, .0], [68, .35], [72, .1], [107, 0]];
A.crest = [[0, .2], [10, .5], [17, .7], [20, .3], [34.83, .4], [34.84, .02], [51.3, .30], [54, .02], [59.8, .35], [62.5, .0], [83.6, .7], [86, .2], [105.6, .9], [107, 1]];
A.pupil = [[0, .38], [34.83, .42], [34.84, .36], [51.2, .46], [54, .38], [59.8, .47], [62, .40], [66, .48], [72, .42], [77.6, .46], [82, .40], [83.6, .30], [95, .34], [105.6, .24], [107.3, .24]];
const at = (n, t) => keys(A[n], t);
const blinkAt = (t, seed, every = 3.4) => { let b = 0; for (let k = Math.floor(t / every) - 1; k <= Math.floor(t / every) + 1; k++) { const c = (k + .2 + .6 * hash1(k * 13 + seed)) * every; b = Math.max(b, pulse(t, c - .07, c - .01, c + .03, c + .15)); } return b; };
// ---------- init ------------------------------------------------------------
ST.init = () => {
  ST.he = new Pelican({ sex: 'he', seed: 11 });
  ST.she = new Pelican({ sex: 'she', seed: 29, scale: .94, white: C('#f4ede2'), blush: C('#f6cdb8'), skin: C('#eda58f'), bill: C('#eea94a'), pouch: C('#f0a544'), iris: .34 });
  ST.scA = new Scarf({ len: 1.02, n: 26 }); ST.scB = new Scarf({ len: 1.75, n: 40 });
  if (have('TANDEM')) TANDEM.init(); if (have('SET')) SET.init(); if (have('CHICK') && CHICK.init) CHICK.init();
  FX.init();
  if (have('CHICK')) { const Z = M4.trs([0, -50, 0]); CHICK.egg.pose({ M: Z, vis: true, crack: 1, cap: .4, hole: 1, rock: 0, t: 0, dt: 1 / 60 }); CHICK.egg.pose({ M: Z, vis: false, crack: 0, cap: 0, hole: 0, rock: 0, t: 0, dt: 1 / 60 }); }
  // stand-in egg until the chick lane lands
  ST.lastT = -1;
};
ST.egg = { pos: [0, -9, 0], q: [0, 0, 0, 1], vis: 0, kick: 0 };
// ---------- one moment ------------------------------------------------------
ST.pose = (t, dt, env, camPos, cut) => {
  const he = ST.he, she = ST.she, b = ST.bike(t), M = ST.bikeM(b), ck = CRK(t), wheel = DST(t) / (TAU * SCORE.WHEEL_R); ST.b = b; ST.now = t; ST.M = M;
  const act = t < TM.matchCut ? 'then' : t < 108.2 ? 'now' : t < TM.nightIn - .6 ? 'catch' : t < TM.nightEnd ? 'night' : t < 184 ? 'dawn' : 'ride'; ST.act = act; const onBike = act === 'then' || act === 'now' || act === 'ride';
  if (cut) { he.last = null; she.last = null; }
  // --- tandem
  const bellK = ST.bellLever(t); const ts = ST.ts = { M, crank: ck, wheel, wheelF: wheel, steer: b.steer, saddleF: .012 + .006 * Math.sin(ck * TAU * 2) + b.bump * .006 * wob(t * 9, 2), saddleR: act === 'then' ? .011 + .005 * Math.sin(ck * TAU * 2 + .4) : act === 'ride' ? .003 : .0008, bell: bellK, bellShake: ST.bellShake(t), daisy: act === 'then' ? 1 : act === 'ride' ? 1 : t < 101 ? .5 : 0, lampOn: t > 84 && t < 108 ? smooth(84, 87, t) : 0, stand: b.stand, basketK: [.02 * b.bump * wob(t * 6, 8), .03 * b.bump * wob(t * 5, 9)], vis: act !== 'catch', speed: b.v, bump: b.bump, dt, t };
  let pts; if (have('TANDEM')) { TANDEM.pose(ts); pts = TANDEM.points(ts); } if (!pts || !pts.pedals) pts = { pedals: { FL: ST.pedal(M, DIM.bbF, ck, -1, 0), FR: ST.pedal(M, DIM.bbF, ck, 1, Math.PI), RL: ST.pedal(M, DIM.bbR, ck, -1, 0), RR: ST.pedal(M, DIM.bbR, ck, 1, Math.PI) }, gripFR: M4.pt(M, DIM.gripF), gripFL: M4.pt(M, [DIM.gripF[0], DIM.gripF[1], -DIM.gripF[2]]), gripRR: M4.pt(M, DIM.gripR), gripRL: M4.pt(M, [DIM.gripR[0], DIM.gripR[1], -DIM.gripR[2]]), seatF: M4.pt(M, DIM.seatF), seatR: M4.pt(M, DIM.seatR), bell: M4.pt(M, DIM.bell), basket: M4.pt(M, DIM.basket), contactF: [b.x + .92, b.y, b.z], contactR: [b.x - .86, b.y, b.z] };
  ST.pts = pts;
  const foot = (p, ph) => ({ p: V.add(p, M4.dir(M, [-.028, .058, 0])), q: Q.mul(he.qOf2(M), Q.axis([0, 0, 1], -.10 - .16 * Math.sin(ck * TAU + ph))) });
  const wind = V.add(env.wind, ST.live.wind), gust = env.gust + V.len(ST.live.wind) * .4; const relW = V.sub(wind, [b.v, 0, 0]);
  // ================= HE =================
  const vis = ST.vis('he', t), sing = vis.level, jaw = vis.jaw; let P = null;
  if (onBike || act === 'catch') P = ST.heRide(t, dt, M, b, pts, foot, vis, act, env); else if (act === 'night') P = ST.heNight(t, dt, vis); else P = ST.heDawn(t, dt, vis);
  P.wind = relW; P.gust = P.gust ?? clamp(gust * .6 + b.v * .06, 0, 1.6); P.t = t; P.dt = cut ? 0 : dt; he.pose(P); ST.P = P;
  // ================= SHE =================
  const ghost = !ST.clock && t > 217.0 && t < 226.5; ST.ghost = ghost; if (act === 'then' || ghost) { const S = ST.sheRide(t, dt, M, b, pts, foot, env, ghost); S.wind = relW; S.gust = P.gust; S.t = t; S.dt = cut ? 0 : dt; S.onlyRefl = ghost; she.pose(S); } else for (const it of [she.itBody, she.itBig, she.itSmall, she.itRig, she.itW, she.itD, she.itG, she.itPouch]) it.vis = false;
  // ================= EGG, NEST, CHICK =================
  ST.small(t, dt, M, b, pts, act, vis, env);
  // ================= SCARF =================
  ST.cloth(t, dt, M, b, pts, act, wind, gust, cut);
  // ================= SET =================
  const sw = ((t - SCORE.SWEEP.t0) / SCORE.SWEEP.P) * Math.PI; const beamA = sw; ST.beamA = beamA;
  if (have('SET')) SET.pose(t, env, { bikeX: b.x, bikeZ: b.z, camPos, wind, gust, beamAngle: beamA, lampOn: act === 'night' ? 1 : t > 82 && t < 109 ? .8 : act === 'dawn' ? .25 * (1 - smooth(152, 160, t)) : 0, windows: act === 'night' ? 1 : t > 82 && t < 109 ? .7 : 0, speed: b.v });
};
ST.bellLever = t => { let k = 0; for (const c of SCORE.cues) if (c.kind === 'bell') k = Math.max(k, pulse(t, c.t - .12, c.t, c.t + .02, c.t + .16)); for (const c of ST.live.bells) k = Math.max(k, pulse(t, c - .06, c, c + .02, c + .16)); return k; };
ST.bellShake = t => { let a = 0; const one = (c, g) => { const x = t - c; if (x > 0 && x < 2.5) a += g * Math.exp(-x * 3.2) * Math.sin(x * 74); }; for (const c of SCORE.cues) if (c.kind === 'bell') one(c.t, .035); for (const c of ST.live.bells) one(c, .04); return a; };
// ---------- HE on the machine ----------------------------------------------
ST.heRide = (t, dt, M, b, pts, foot, vis, act, env) => {
  const ride = act === 'ride', ck = CRK(t), beat = ck * 3, tt = ride ? null : t; const g = n => ride ? ST.rideTrack(n, t) : at(n, t);
  const seat = M4.trs(V.add(pts.seatF, M4.dir(M, [0, .004, 0])), he_q(M));
  let hy = g('yaw'), hp = g('pitch'), hr = g('roll'); const musical = (act === 'then' ? 1 : ride ? 1 : 0);
  hp += musical * .035 * Math.sin(beat / 3 * TAU + .6) + .018 * wob2(t * .8, 51); hy += .03 * wob2(t * .55, 53); hr += musical * .05 * Math.sin(ck * TAU * .5) + .02 * wob2(t * .7, 55);
  if (act === 'then' && t > 12.1 && t < 14 || ride && ST.laughK(t) > 0) { const k = act === 'then' ? pulse(t, 12.1, 12.4, 13.2, 13.9) : ST.laughK(t); hp += k * .05 * Math.sin(t * 34); hr += k * .02 * Math.sin(t * 34 + 1); }
  // he answers the viewer's bell: ears up, a look back, a smile he did not plan
  const L = ST.live.heard(t); hy = lerp(hy, Math.max(hy, 2.7), L.look); hp = lerp(hp, hp + .05, L.look); hr += L.look * -.12; const j = vis.jaw, lv = vis.level;
  const wet = act === 'now' ? smooth(88, 94, t) * .9 : ride ? 0 : 0; const storm = act === 'now' ? smooth(85.5, 90, t) : 0;
  const br = ST.lungs('he', t, act === 'now' ? .24 : .30), P = { M: seat, lean: g('lean') + b.pitch * -.6 + .012 * Math.sin(ck * TAU * 2), side: .05 * Math.sin(ck * TAU) - b.lean * .5, twist: hy * .07, head: { yaw: hy * .86, pitch: hp, roll: hr }, neck: { up: g('up'), fwd: g('fwd'), side: .25 * Math.sin(hy) * .3, s: g('fwd') < .2 ? .3 : 0 }, jaw: .02 + j * .34 + .05 * storm * wob2(t * 7, 3) * .3, sing: lv, vib: lv * smooth(0, 1, vis.f0 / 300), throat: lv * .5 + Math.max(0, vis.breath) * .4, breath: br, gaze: [g('gx'), g('gy')], lidU: lerp(g('lidU'), .12, L.look), lidL: lerp(g('lidL'), .45, L.warm), blink: blinkAt(t, 5), brow: { up: lerp(g('bu'), .95, L.look) + lv * .12, tilt: lerp(g('bt'), .25, L.warm) }, cheek: lerp(g('cheek'), .7, L.warm), crest: lerp(g('crest'), .6, L.look), pupil: lerp(g('pupil'), .5, L.look), tail: .03 * Math.sin(ck * TAU * 2) + .1 * musical, wet, chill: storm * .5, shiver: storm * .35, squash: lv * .3 + L.look * .1 };
  P.feet = { R: foot(pts.pedals.FR, Math.PI), L: foot(pts.pedals.FL, 0) };
  const grip = z => ({ target: V.add(z > 0 ? pts.gripFR : pts.gripFL, M4.dir(M, [-.03, .012, 0])), k: 1, shrug: .25 * br + .5 * storm });
  P.wings = { R: grip(1), L: grip(-1) };
  // storm: the right wing comes off the bar to shelter the basket
  const sh = act === 'now' ? pulse(t, 90.2, 91.4, 95.6, 96.6) + pulse(t, 101.0, 102.0, 104.6, 105.4) : 0; if (sh > 0) P.wings.R = { target: V.lerp(P.wings.R.target, V.add(pts.basket, M4.dir(M, [.02, .20, .16])), sh), k: 1, dir: M4.dir(M, [.5, -.4, -.75]), shrug: .4 };
  // egg scene: the wing tip smooths the wool
  const tu = act === 'now' ? pulse(t, 66.2, 67.2, 70.6, 71.6) : 0; if (tu > 0) P.wings.R = { target: V.lerp(P.wings.R.target, V.add(pts.basket, M4.dir(M, [-.05 + .03 * Math.sin(t * 2.6), .16, .14])), tu), k: 1, dir: M4.dir(M, [.6, -.55, -.5]) };
  if (ride) { const fl = ST.rideWings(t); if (fl.k > 0) { for (const s of ['R', 'L']) { P.wings[s] = { spread: fl.k, flap: fl.flap + .05 * wob2(t * 1.3, 8), sweep: -.3, target: null }; } } }
  // the wave: thrown, wings out; then the catch
  if (act !== 'then' && !ride && t > TM.wave - .5) { ST.heCatch(t, P, M, b); }
  return P;
};
const he_q = M => ST.he.qOf2(M);
ST.live = { bells: [], chirps: [], touch: [], wind: [0, 0, 0], heard: t => ({ look: 0, warm: 0 }) };
ST.laughK = t => pulse(t, TM.answer2 + .9, TM.answer2 + 1.2, 185.4, 186.4) + pulse(t, BT('ride', 6, 2), BT('ride', 6, 2.4), BT('ride', 7, 1), BT('ride', 7, 2)) + pulse(t, BT('ride', 10, 2.4), BT('ride', 11), BT('ride', 11, 1), BT('ride', 11, 2));
// RIDE acting
const AR = {
  yaw: [[184, .3], [187, 1.5], [188.6, 1.4], [189.6, .1], [190.4, .1], [192.6, .3], [193.5, 2.75], [195.4, 2.7], [196.4, .2], [198.6, .25], [199.8, 2.6], [202, 2.6], [203, .1], [206, .0], [209.4, .1], [212, .18], [213.2, .30], [215.0, .34], [216.2, .34], [216.8, .4], [219, .3], [221.6, 1.35], [225, 1.45], [228, .6], [230, .1]],
  pitch: [[184, .1], [190, .0], [192, .14], [193.4, .04], [196, .06], [198.4, .20], [200, .12], [203, .0], [205, .20], [208, .30], [211, .10], [213, .20], [215, .14], [217, .04], [222, .10], [226, -.05], [230, .05]],
  roll: [[184, 0], [193.6, -.18], [196, 0], [200, -.14], [203, 0], [213, .05], [222, -.20], [226, -.14], [230, 0]], up: [[184, .2], [192, .5], [198.4, .9], [201, .5], [206, .7], [213.2, 1.1], [216, .5], [222, .3], [230, .2]], fwd: [[184, .1], [230, .05]], lean: [[184, .14], [190, .10], [198, -.02], [204, .06], [213, -.08], [218, .08], [230, .08]],
  lidU: [[184, .12], [193, .14], [194.4, .4], [197, .2], [199, .10], [200.6, .45], [204, .25], [208, .4], [211, .26], [212.7, .30], [213.15, .98], [214.7, .98], [215.3, .34], [217, .3], [221, .40], [225, .46], [228, .30], [230, .22]], lidL: [[184, .4], [194.4, .62], [197, .4], [200.6, .62], [204, .45], [212.6, .4], [213.2, .55], [214.8, .5], [221, .5], [230, .5]], bu: [[184, .8], [193, .9], [196, .4], [198.4, 1], [204, .6], [213, 1], [217, .4], [222, .6], [230, .5]], bt: [[184, .5], [192, .1], [204, .0], [212, .5], [214, .6], [218, .2], [222, .5], [230, .3]], gx: [[184, .1], [193, .3], [196, 0], [200, .3], [203, 0], [221, .25], [226, .2], [230, 0]], gy: [[184, 0], [193.6, -.2], [196, 0], [200, -.2], [203, 0], [222, -.2], [230, 0]], cheek: [[184, .6], [230, .7]], crest: [[184, .5], [198, .8], [204, .4], [213, .9], [220, .3], [230, .3]], pupil: [[184, .46], [230, .42]],
};
ST.rideTrack = (n, t) => ST.clock ? keys(AR[n], 190.4 + ((t - 400) % 25.7)) : keys(AR[n], t);
ST.rideWings = t => { const a = pulse(t, BT('ride', 13, 1), BT('ride', 13, 2.4), BT('ride', 15, 1), BT('ride', 15, 2.4)); return { k: a, flap: .12 + .16 * Math.sin((t - BT('ride', 13)) * 3.6) }; };
// ---------- the fall and the catch -----------------------------------------
// slow clock: world time runs at 1 until the wave, then stretches
ST.slow = t => { const a = t - (TM.wave + 1.1); return a <= 0 ? t : TM.wave + 1.1 + a * lerp(1, .16, smooth(0, .6, a)); };
ST.eggPath = t => { // film time -> egg centre, spin. flies from the basket at the wave, up and over, into the pouch at TIME.catch_
  const t0 = TM.wave + .10, t1 = TM.catch_, u = clamp((t - t0) / (t1 - t0)); const c0 = ST.crashX || 233; const a = [c0 + .75, 1.15, .1], z = [c0 + 2.55, 1.22, .35]; const e = u < .12 ? u * 2.2 : .264 + (u - .12) * (1 - .264) / .88; const p = V.lerp(a, z, e); p[1] = lerp(a[1], z[1], e) + 4 * e * (1 - e) * 1.05; return { p, u, e, q: Q.mul(Q.axis(V.norm([.3, .2, 1]), -u * 9.4), Q.axis([0, 1, 0], u * 3)) }; };
ST.heCatch = (t, P, M, b) => {
  const c0 = ST.crashX = ST.bikeX(TM.wave) + 0; const a = t - TM.wave, E = ST.eggPath(t); const u = clamp((t - (TM.wave + .35)) / (TM.catch_ - TM.wave - .35)); if (a < -.02) { return; }
  // root flies: off the saddle, forward and up, stretched out like a goalkeeper
  const k = smoother(0, 1, u); const p0 = V.add(ST.pts.seatF, [0, .1, 0]); const target = ST.eggPath(TM.catch_).p; const hipEnd = [target[0] - 1.15, 1.05, target[2] + .02]; const hip = V.lerp([c0 - .05, 1.02, .10], hipEnd, k); hip[1] += .42 * Math.sin(Math.PI * Math.min(1, k * 1.02)) * (1 - .3 * k); const after = smooth(TM.catch_ + .05, TM.catch_ + 1.6, t); hip[1] -= after * .46; hip[0] += after * .25;
  const rp = lerp(.05, -.62, smooth(.05, .65, u)) * (1 - after * .75); const q = Q.mul(Q.axis([0, 1, 0], -.12), Q.axis([0, 0, 1], rp)); P.M = M4.trs(hip, q);
  const hc = V.sub(E.p, hip); const yaw = Math.atan2(hc[2], hc[0]), el = Math.atan2(hc[1] - .62, Math.hypot(hc[0], hc[2])); const near = smooth(.62, .99, u), closed = smooth(TM.catch_ - .02, TM.catch_ + .14, t);
  P.lean = lerp(.2, .62, smooth(.1, .8, u)) * (1 - after * .5) + after * .45; P.head = { yaw: yaw * .8, pitch: lerp(el * .9 + .10, .02, smooth(.7, 1, u)) - rp * .95 - after * .45, roll: 0 }; P.neck = { up: lerp(.5, 1.5, k) * (1 - after) - after * .6, fwd: lerp(.2, 1.35, k) * (1 - after * .6), side: 0, s: 0 };
  P.jaw = lerp(.05 + .5 * near, .02, closed); P.sing = near * (1 - closed); P.pouch = smooth(TM.catch_ - .03, TM.catch_ + .22, t) * (1 + .16 * Math.exp(-Math.max(0, t - TM.catch_) * 3) * Math.sin(Math.max(0, t - TM.catch_) * 20)); P.vib = 0;
  P.lidU = lerp(.0, .95, smooth(TM.catch_ + .5, TM.catch_ + 1.4, t)); P.lidL = lerp(.0, .4, closed); P.brow = { up: 1 - after * .7, tilt: 1.1 }; P.pupil = lerp(.24, .40, k); P.gaze = [0, .1 * (1 - closed)]; P.blink = 0; P.crest = 1 - after; P.wet = 1; P.shiver = .25 + .4 * after; P.puff = 0;
  const sp = smooth(.0, .28, u) * (1 - smooth(TM.catch_ + .1, TM.catch_ + 1.2, t)); P.wings = { R: { spread: sp, flap: .5 - .5 * k + .25 * Math.sin(u * 5), sweep: -.6 }, L: { spread: sp, flap: .55 - .5 * k + .25 * Math.sin(u * 5 + .4), sweep: -.6 } }; P.feet = { R: { p: V.add(hip, Q.rot(q, [-.58, -.10 - .25 * after, .13])), q: Q.mul(q, Q.axis([0, 0, 1], -1.5)) }, L: { p: V.add(hip, Q.rot(q, [-.48, -.20 - .25 * after, -.13])), q: Q.mul(q, Q.axis([0, 0, 1], -1.3)) } }; P.tailFan = 1; P.kneeUp = -.6; P.gust = .9;
};
// ---------- NIGHT -----------------------------------------------------------
const AN = { // head while he sits under the light
  pitch: [[115, -.42], [119, -.40], [121.6, -.22], [125, -.12], [128.2, -.16], [129, -.02], [130.4, -.04], [130.95, -.30], [132, -.34], [134, -.30], [138, -.10], [139.6, -.06], [141.3, -.22], [143.8, -.30], [146, -.36], [150, -.48], [152, -.52]],
  yaw: [[115, .15], [121.5, .25], [128.4, .30], [129.2, -.55], [130.5, -.45], [131.2, .35], [134, .40], [139, .30], [143.7, .35], [144.3, .55], [146, .35], [152, .30]],
  roll: [[115, .05], [128.5, .0], [131, .14], [134, .10], [141, .0], [143.9, .18], [146.2, .10], [152, .16]],
  lidU: [[115, .62], [119, .78], [121.4, .55], [125, .62], [128.2, .44], [129.1, .16], [130.4, .26], [130.9, .74], [132.6, .90], [134, .62], [137, .50], [139, .58], [141.2, .66], [141.5, .30], [143.6, .52], [143.95, .12], [145.4, .34], [146.6, .62], [149, .86], [150.6, .97], [152, 1]],
  lidL: [[115, .2], [128, .18], [130.9, .42], [134, .34], [143.9, .30], [145, .5], [148, .40], [152, .35]], bu: [[115, .0], [124, .3], [128.8, .85], [130.3, .5], [130.9, .4], [134, .3], [138, .5], [141.4, .7], [143.9, .95], [146, .4], [152, .1]], bt: [[115, .9], [128, .8], [129.2, 1.0], [131, 1.15], [134, .9], [138, .6], [143.9, .5], [146, .35], [152, .3]], cheek: [[115, 0], [139, .1], [144, .6], [152, .5]], up: [[115, -.55], [122, -.30], [128.8, .15], [130.6, -.25], [134, -.2], [138, .0], [141, -.3], [152, -.75]],
};
ST.heNight = (t, dt, vis) => {
  const n = nookPos().sit, g = k => keys(AN[k], t), br = ST.lungs('he', t, .22); const q = Q.mul(Q.axis([0, 1, 0], -.35), Q.axis([0, 0, 1], .05)); const hip = [n[0], n[1] + .175 + .006 * br, n[2]]; const M = M4.trs(hip, q); const D = p => M4.pt(M, p); const hum = vis.level;
  return { M, lean: .02 + .03 * br * .3, head: { yaw: g('yaw') + .02 * wob2(t * .5, 3), pitch: g('pitch') + .012 * Math.sin(t * 1.3) + hum * .02, roll: g('roll') }, neck: { up: g('up'), fwd: .30, side: 0, s: 1.0 }, jaw: .02, sing: 0, pouch: 1 + .05 * hum + .015 * Math.sin(t * 1.9) + ST.kick(t) * .05, vib: hum * 1.2, throat: hum * .6, breath: br, gaze: [.1 * Math.sin(t * .6), g('lidU') > .6 ? -.2 : 0], lidU: g('lidU'), lidL: g('lidL'), blink: blinkAt(t, 9, 4.6) * .9, brow: { up: g('bu'), tilt: g('bt') }, cheek: g('cheek'), crest: .05, pupil: .46, shiver: .30 * (1 - smooth(117, 126, t)), wet: .9 * (1 - smooth(116, 140, t)) + .1, puff: smooth(120, 134, t) * .5, tear: t > 132.2 && t < 136 ? clamp((t - 132.2) / 3.4) : 0,
    feet: { R: { p: D([.36, -.125, .13]), q: Q.mul(q, Q.axis([0, 1, 0], -.25)) }, L: { p: D([.40, -.125, -.10]), q: Q.mul(q, Q.axis([0, 1, 0], .2)) } }, kneeUp: 1.2, kneeOut: .3, wings: { R: { target: D([.34, .30 + .01 * br, .17]), k: .92, dir: Q.rot(q, [.45, .25, -.75]), shrug: .3 }, L: { target: D([.36, .28 + .01 * br, -.16]), k: .92, dir: Q.rot(q, [.45, .25, .75]), shrug: .3 } }, gust: .12, t };
};
ST.kick = t => { let k = 0; for (const c of [131.9, 137.8, 141.3, 143.8, 144.1, 150.2]) k = Math.max(k, pulse(t, c - .08, c + .05, c + .12, c + .7)); return k; };
// ---------- DAWN ------------------------------------------------------------
const AD = {
  pitch: [[152, -.62], [160.2, -.60], [161.2, -.42], [163.2, -.46], [165.2, -.40], [168, -.34], [169.6, -.20], [171, -.16], [173, -.10], [174.2, -.14], [176, -.18], [177.4, -.42], [178.6, -.62], [180.3, -.60], [180.75, -.50], [181.6, -.36], [182.6, -.26], [183.4, -.12], [184, -.05]],
  yaw: [[152, -.42], [160.4, -.42], [161.0, .10], [161.4, .24], [163.0, .2], [163.1, -.30], [168, -.30], [168.6, .16], [173, .14], [173.9, .0], [174.2, -.35], [176.6, -.35], [177.6, .0], [178.8, -.65], [180.2, -.85], [181.0, -.80], [182.4, .30], [184, .36]], roll: [[152, .16], [161, .05], [163, .12], [166, -.10], [168.4, .08], [171, .0], [174, .10], [177, .0], [180.3, -.05], [182.6, .16], [184, .05]],
  lidU: [[152, 1], [157.5, 1], [157.8, .93], [159, .99], [160.45, .97], [160.9, .40], [161.4, .22], [163.2, .12], [165.2, .04], [167, .14], [169, .28], [171, .34], [173.2, .18], [175, .20], [176.6, .46], [178, .68], [179.6, .90], [180.42, .92], [180.62, .10], [181.0, .0], [182.2, .12], [183.2, .45], [184, .5]], lidL: [[152, .35], [161, .1], [165, .05], [168, .30], [171, .12], [174, .1], [178, .35], [180.5, .3], [181, .0], [182.4, .25], [183.4, .6], [184, .6]],
  bu: [[152, 0], [160.6, .1], [161.2, .7], [165.2, 1], [168, .6], [171, .6], [173.4, .95], [176, .6], [178.5, .1], [180.4, .0], [180.8, .9], [181.6, 1.15], [183, .8], [184, .7]], bt: [[152, .4], [161, .8], [165, .7], [168, .5], [171, .95], [174, 1.1], [178, 1.2], [180.4, 1.2], [181, .9], [182.6, .7], [183.6, .2], [184, .1]], cheek: [[152, .2], [167, .3], [168.5, .5], [171, .1], [180, 0], [182.2, .3], [183.2, .9], [184, .9]], up: [[152, -.8], [160.6, -.75], [161.6, -.25], [165.4, -.05], [168, -.35], [170, -.15], [173, .1], [176, -.2], [178.6, -.75], [180.4, -.8], [181.2, -.35], [182.6, -.1], [183.4, .2], [184, .3]], pupil: [[152, .40], [165, .48], [174, .46], [180.4, .38], [180.9, .56], [182, .54], [184, .48]],
};
ST.heDawn = (t, dt, vis) => {
  const n = nookPos().sit, g = k => keys(AD[k], t), br = ST.lungs('he', t, .17); const q = Q.mul(Q.axis([0, 1, 0], -.35), Q.axis([0, 0, 1], .02)); const hip = [n[0] - .06, n[1] + .172 + .008 * br, n[2]]; const M = M4.trs(hip, q), D = p => M4.pt(M, p); const lv = vis.level, lk = ST.laughK(t);
  return { M, lean: .10, head: { yaw: g('yaw') + .015 * wob2(t * .5, 3), pitch: g('pitch') + lk * .05 * Math.sin(t * 33), roll: g('roll') + lk * .03 * Math.sin(t * 33 + 1) }, neck: { up: g('up'), fwd: .42, side: 0, s: .7 }, jaw: .015 + vis.jaw * .24 + lk * (.10 + .05 * Math.sin(t * 33)), sing: lv * .7, pouch: 0, vib: lv * .6, throat: lv * .4 + pulse(t, 176.1, 176.4, 176.5, 176.9) * .9, breath: br + lk * .2 * Math.sin(t * 33), gaze: [.05 * Math.sin(t * .7) + pulse(t, 173.8, 174, 176, 176.4) * .12 * Math.sin(t * 2.4), g('pitch') * .25], lidU: g('lidU'), lidL: g('lidL'), blink: t > 161 && !(t > 178 && t < 182.2) ? blinkAt(t, 21, 2.9) : 0, brow: { up: g('bu'), tilt: g('bt') }, cheek: g('cheek'), crest: pulse(t, 180.5, 180.7, 182, 184) * .6 + .06, pupil: g('pupil'), wet: 0, puff: .25, tear: t > 181.0 && t < 184 ? clamp((t - 181.0) / 2.6) : 0,
    feet: { R: { p: D([.34, -.125, .14]), q: Q.mul(q, Q.axis([0, 1, 0], -.25)) }, L: { p: D([.38, -.125, -.10]), q: Q.mul(q, Q.axis([0, 1, 0], .2)) } }, kneeUp: 1.2, kneeOut: .3, wings: { R: { target: D([.28, .08, .30]), k: .85, dir: Q.rot(q, [.85, -.25, -.35]) }, L: { target: D([.30, .08, -.30]), k: .85, dir: Q.rot(q, [.85, -.25, .35]) } }, gust: .06, t };
};
// ---------- SHE -------------------------------------------------------------
const AS = { yaw: [[0, .5], [8, .6], [10.6, .5], [11.4, .62], [12.8, .9], [14.6, .55], [17.6, .55], [18.1, .6], [19.6, .9], [21, .5], [24, .7], [27, .55], [30, .5], [33, .62], [34.83, .62]], pitch: [[0, 0], [10.6, .05], [11.6, .24], [13, .10], [17.6, .0], [18.3, .28], [20, .05], [24, .18], [27, .08], [30, .10], [32.4, -.18], [34.83, -.28]], roll: [[0, 0], [11.6, .2], [13.4, -.05], [18.4, -.2], [20, .0], [26, .1], [31, .0], [33, .22], [34.83, .24]], up: [[0, .0], [11.6, .5], [13.6, .1], [18.4, .6], [20.4, .2], [28, .4], [31, .1], [34.83, -.35]], fwd: [[0, -.55], [10, -.55], [27, -.5], [31, .3], [33, .80], [34.83, .85]], lidU: [[0, .25], [11.4, .1], [12, .62], [13.4, .25], [18.2, .15], [19, .62], [20.6, .25], [27, .3], [31, .4], [33, .9], [34.83, .98]], lidL: [[0, .4], [12, .6], [14, .4], [19, .6], [21, .4], [33, .55], [34.83, .6]], bu: [[0, .3], [11.4, .9], [14, .4], [18.2, 1], [21, .5], [34.83, .4]], lean: [[0, .10], [28, .10], [31, .24], [33, .40], [34.83, .42]] };
ST.sheRide = (t, dt, M, b, pts, foot, env, ghost) => {
  const ck = CRK(t), tx = ghost ? 33.6 + .4 * Math.sin(t) * 0 : t, g = k => keys(AS[k], tx), v = ST.vis('she', t), br = ST.lungs('she', t, .33); const seat = M4.trs(V.add(pts.seatR, M4.dir(M, [.01, .004, 0])), he_q(M));
  const hold = k => V.add(k > 0 ? pts.gripRR : pts.gripRL, M4.dir(M, [-.03, .012, 0])); const lk = pulse(t, 12.4, 12.8, 13.6, 14.3) + pulse(t, 19.2, 19.6, 20.2, 20.8);
  const ring = ghost ? 0 : Math.max(pulse(t, 10.9, 11.35, 12.2, 12.9), pulse(t, 17.6, 18.0, 18.9, 19.6)), spread = ghost ? .0 : pulse(t, 21.6, 22.6, 24.2, 25.4);
  const P = { M: seat, lean: g('lean') + .012 * Math.sin(ck * TAU * 2 + .5), side: -.05 * Math.sin(ck * TAU) - b.lean * .5, twist: g('yaw') * .08, head: { yaw: g('yaw') + .03 * wob2(t * .6, 73), pitch: g('pitch') + .03 * Math.sin(ck * TAU + 1.6) + lk * .05 * Math.sin(t * 36), roll: g('roll') + .05 * Math.sin(ck * TAU * .5 + 1) }, neck: { up: g('up'), fwd: g('fwd'), side: 0, s: .1 }, jaw: .02 + v.jaw * .32 + lk * .08, sing: v.level, vib: v.level * .6, throat: v.level * .4, breath: br, gaze: [.1, 0], lidU: g('lidU'), lidL: g('lidL'), blink: blinkAt(t, 33, 3.1), brow: { up: g('bu'), tilt: .1 }, cheek: .6, crest: .25 + .3 * v.level, pupil: .44, tail: .05, feet: { R: foot(pts.pedals.RR, Math.PI), L: foot(pts.pedals.RL, 0) } };
  const bellHand = V.add(pts.bell, M4.dir(M, [-.05 + .03 * ST.bellLever(t), .03, .05])); P.wings = { R: { target: V.lerp(hold(1), bellHand, ring), k: 1, shrug: .2 * br, dir: ring > .2 ? M4.dir(M, [.7, -.2, -.5]) : null }, L: { target: hold(-1), k: 1, shrug: .2 * br } };
  if (ghost) { P.lean = .10; P.head = { yaw: .55 + .05 * wob2(t * .5, 7), pitch: -.10 + .03 * Math.sin(ck * TAU + 1.6), roll: .10 }; P.neck = { up: .25, fwd: -.62, side: 0, s: .1 }; P.lidU = .42; P.lidL = .5; P.wings.R = { target: M4.pt(M, [DIM.seatR[0] + .24, DIM.seatR[1] + .24, .16]), k: 1, dir: M4.dir(M, [.8, -.1, -.5]) }; }
  if (spread > 0) { P.wings = { R: { spread, flap: .10 + .12 * Math.sin(t * 3.1), sweep: -.1 }, L: { spread, flap: .10 + .12 * Math.sin(t * 3.1 + .5), sweep: -.1 } }; }
  return P;
};
// ---------- egg, nest, chick ------------------------------------------------
ST.small = (t, dt, M, b, pts, act, vis, env) => {
  const E = ST.egg; const n = nookPos(); let eggM = null, nestM = null, crack = 0, cap = 0, hole = 0, rock = 0, cvis = false; const he = ST.he; E.vis = 0; E.kick = 0;
  const bq = he.qOf2(M);
  if (act === 'now' && t < TM.wave + .1) { const jol = b.bump * .012 + smooth(86, 92, t) * .012; const BM = pts.basketM ? M4.mul(pts.basketM, M4.trs(DIM.basket)) : M4.trs(pts.basket, bq), bm = M4.pt(BM, [0, 0, 0]); nestM = BM; const ep = V.add(bm, M4.dir(M, [.005 + jol * wob(t * 5, 3), .050 + Math.abs(jol * wob(t * 7, 5)), jol * wob(t * 6, 7)])); eggM = M4.trs(ep, Q.mul(bq, Q.mul(Q.axis([0, 0, 1], 1.18 + .06 * wob2(t * .5, 3) + jol * 8 * wob(t * 4, 9)), Q.axis([0, 1, 0], .8)))); }
  else if (act === 'now' || act === 'catch') { const p = ST.eggPath(t); if (t < TM.catch_ + .02) eggM = M4.trs(p.p, p.q); else { E.vis = 1; } nestM = t < TM.wave + 1.4 ? M4.trs(pts.basket, bq) : null; }
  if (act === 'night' || (act === 'catch' && t >= TM.catch_)) { E.vis = 1; E.pos = he.pouchC; E.q = Q.mul(he.pouchQ, Q.axis([0, 0, 1], -Math.PI / 2 + .12 * Math.sin(t * .7) + ST.kick(t) * .10)); E.kick = ST.kick(t); eggM = M4.trs(E.pos, E.q); }
  const led = n.ledge || n.sit; const nestC = ST.nestC = V.add(n.sit, [.76, .006, .05]);
  if (act === 'dawn') { crack = keys([[152, 0], [TM.crack1 - .05, 0], [TM.crack1 + .1, .22], [TM.crack2 - .05, .26], [TM.crack2 + .12, .50], [TM.crack3 - .1, .58], [TM.crack3 + .2, .80], [TM.hatch - .1, .9], [TM.hatch + .2, 1]], t, x => x); hole = smooth(TM.crack3 - .1, TM.crack3 + .5, t); cap = smooth(TM.hatch - .05, TM.hatch + .9, t); rock = pulse(t, 156.6, 156.9, 157.2, 157.6) + pulse(t, 159.4, 159.8, 160.6, 161) + pulse(t, 162.2, 162.6, 165, 166); eggM = M4.trs(V.add(nestC, [0, .062, 0]), Q.mul(Q.axis([0, 1, 0], -.5), Q.axis([0, 0, 1], -.95))); E.pos = V.add(nestC, [0, .062, 0]); E.q = [0, 0, 0, 1]; E.vis = t < TM.hatch ? .8 : 0; }
  if (have('CHICK')) {
    CHICK.nest.pose({ M: nestM || M4.trs([0, -50, 0]), vis: !!nestM, t, dt }); CHICK.egg.pose({ M: eggM || M4.trs([0, -50, 0]), vis: !!eggM && act !== 'ride', crack, cap, hole, rock, t, dt });
    let C0 = null; const cv = ST.vis('chick', t), sg = cv.level;
    if (act === 'dawn' && t > TM.hatch - .25) { const u = clamp((t - TM.hatch) / 4.6); const base = { M: M4.trs(V.add(nestC, [0, .035, 0]), Q.axis([0, 1, 0], ST.chickYaw(t))), fluff: .10 + .35 * smooth(167, 180, t), size: 1, t, dt, vis: true, wind: [0, 0, 0] }; const a = CHICK.act; let pose = {}; if (t < 170.2) pose = a.hatch(u); else if (t < 174.4) pose = a.wonder(clamp((t - 170.2) / 4.2)); else if (t < 179.6) pose = a.wonder(.35 + .4 * clamp((t - 174.4) / 5.2)); else { const c = t < TM.answer2 - .25 ? clamp((t - (TM.answer - .35)) / 1.9) : clamp((t - (TM.answer2 - .3)) / 1.7); pose = a.weetwo(c); } C0 = Object.assign(base, pose); if (sg > 0) C0.bill = Math.max(C0.bill || 0, cv.jaw); }
    if (act === 'ride') { const perch = !ST.clock && t > 226.3 && t < 228.72; const sM = perch ? M4.trs(V.add(pts.gripRR, M4.dir(M, [-.085, .014, -.016])), Q.mul(bq, Q.axis([0, 1, 0], .10))) : M4.trs(V.add(pts.seatR, M4.dir(M, [.02, .0, 0])), bq); const base = { M: sM, fluff: 1, size: 1, t, dt, vis: true, feet: 'dangle', footSwing: 1, wind: V.sub(env.wind, [b.v, 0, 0]), head: { yaw: .35 * wob2(t * .5, 91), pitch: .05 + .1 * wob2(t * .7, 92), roll: .2 * wob2(t * .45, 93) }, neck: .55 + .2 * wob2(t * .4, 95), lids: .95, bill: 0, wings: .2 + .5 * smooth(.2, 1, wob2(t * .6, 97)), bob: Math.sin(CRK(t) * TAU * 2) };
      let pose = {}; const w = [[BT('ride', 6) - .35, 1.9], [BT('ride', 10) - .35, 2.2], [BT('ride', 24, 1) - .4, 2.2]]; for (const [c, d] of w) if (t > c && t < c + d) pose = CHICK.act.weetwo((t - c) / d); const pk = [[BT('ride', 6) - .25, 1.5]]; if (t > TM.bellEnd - 1.1 && t < TM.bellEnd + 1.4) { const pb = CHICK.act.peckBell((t - (TM.bellEnd - 1.1)) / 2.5), pk = Math.max(pulse(t, TM.bellEnd - .26, TM.bellEnd - .02, TM.bellEnd + .05, TM.bellEnd + .30), pulse(t, TM.bellEnd + .31, TM.bellEnd + .53, TM.bellEnd + .60, TM.bellEnd + .95)); pose = Object.assign({}, pb, { feet: 'stand', lean: [.04 + .52 * pk, 0], reach: [.0, -.02 * pk, 0], neck: lerp(.5, .62, pk), head: { yaw: 0, pitch: -.95 * pk + .05, roll: 0 } }); base.M = M4.mul(sM, M4.trs([.0, 0, 0], Q.axis([0, 0, 1], -.22 * pk))); } else if (t > 187.2 && t < 189.0) pose = CHICK.act.hopUp((t - 187.2) / 1.8); else if (t > BT('ride', 12) && t < BT('ride', 14)) pose = CHICK.act.wonder((t - BT('ride', 12)) / (BT('ride', 14) - BT('ride', 12))); C0 = Object.assign(base, pose); for (const c of ST.live.chirps || []) { if (t > c && t < c + 1.5) Object.assign(C0, CHICK.act.weetwo((t - c) / 1.5)); } if (sg > 0) C0.bill = Math.max(C0.bill || 0, cv.jaw); }
    if (C0) CHICK.pose(C0); else CHICK.pose({ vis: false, M: M4.trs([0, -50, 0]), t, dt, head: {}, wind: [0, 0, 0] });
    ST.chickOn = !!C0;
  }
  F3(33, E.pos, E.vis); F4(34, ...E.q); F4(35, .0425, .0625, t * 1.7, E.kick);
};
ST.chickYaw = t => keys([[165, -.2], [168, .35], [174, .30], [178, .1], [180, .35], [184, .35]], t);
// ---------- cloth -----------------------------------------------------------
ST.cloth = (t, dt, M, b, pts, act, wind, gust, cut) => {
  const he = ST.he, she = ST.she, A0 = ST.scA, B0 = ST.scB; const ws = { wind, gust, t };
  const anchor = (p, th, u = .515, out = .030) => { const c = p.surf(u, th, out * p.o.scale), s = p.at(u); return { c, up: Q.rot(s.q, [1, 0, 0]) }; };
  const balls = [[he.at(.22).c, .24], [he.at(.30).c, .215], [he.at(.10).c, .14], [V.add(pts.seatR, [0, -.05, 0]), .115]];
  const front = p => { const c = p.surf(.505, -Math.PI / 2 + .35, .03), s = p.at(.46); return { c, dir: V.norm(V.add(Q.rot(s.q, [-1, 0, 0]), [.10, -.35, 0])), out: Q.rot(s.q, V.norm([0, -1, .35])), sx: -.05 * b.v - .12 * gust * wob2(t * 2, 3), sz: .2 * gust * wob2(t * 1.7, 5) }; };
  if (act === 'then') {
    B0.it.vis = false; A0.it.vis = true; balls.push([she.at(.28).c, .20]); A0.step(dt, anchor(he, Math.PI * .5, .515), anchor(she, -Math.PI * .5 + .3, .515), ws, balls.slice(0, 3), { reset: cut, dir: [-1, 0, 0], ground: b.y, drag: 1.5 }); A0.wrapNeck(0, he, .515); A0.wrapNeck(1, she, .515); A0.hideWrap(2); A0.flush(front(he), dt, true);
  } else {
    A0.it.vis = false; B0.it.vis = true; const ghostRing = null; let B = null, o = { reset: cut, dir: V.norm([-1, .12, .05]), ground: groundY(b.x), drag: t < 84 ? 4.4 : act === 'ride' ? 2.6 : 3.2, grav: t < 84 ? .55 : .8 }; let A1 = anchor(he, Math.PI * .5, .515);
    if (act === 'now' && t > 107.0) { o.ground = -1; }
    if (act === 'catch') { o.ground = -2; o.grav = .12; o.drag = 1.2; balls.length = 3; }
    if (act === 'night') { balls.pop(); o.ground = nookPos().sit[1]; o.dir = V.norm([.35, -.75, .45]); o.drag = 1.2; }
    if (act === 'dawn') { balls.length = 0; o.ground = nookPos().sit[1]; o.nest = { c: ST.nestC, from: .34 }; o.dir = V.norm([.6, -.5, .35]); o.drag = 1.4; }
    if (act === 'ride' && have('CHICK') && ST.chickOn) { const r = CHICK.neckRing(); B0.wrapRing(1, r); if (r) { const ax = V.norm(r.axis || r.ax); B = { c: V.add(r.c || r.pos, V.mul(V.norm(M4.dir(M, [.55, .35, -.75])), (r.r ?? r.radius) * 1.15)), up: ax, k: .5 }; } } else B0.hideWrap(1);
    B0.lenK = act === 'ride' && B ? .66 : 1; if (act === 'ride' && B) { const cr = CHICK.neckRing(); balls.push([V.add(cr.c || cr.pos, [0, -.03, .05]), .165]); balls.push([V.add(cr.c || cr.pos, [.12, .04, .10]), .15]); ws.wind = V.add(wind, [0, .5, -2.2]); } B0.hideWrap(2); B0.step(act === 'catch' ? dt * .22 : dt, A1, B, ws, balls, o); B0.wrapNeck(0, he, .515); B0.flush(front(he), dt, true);
  }
};
