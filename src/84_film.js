// ============================================================================
// 84_film.js - one moment of film: mood, weather, staging, lens, ripples, air.
// ============================================================================
const FILM = { last: -99, shot: null };
FILM.init = () => { R.init(); ST.init(); };
FILM.orbit = { yaw: 0, pitch: 0, zoom: 0 };
FILM.cam = (t, s0) => {
  const s = s0 || shotAt(t), u = clamp((t - s.t0) / ((s.rideon ? s.t1 : Math.min(s.t1, DURX)) - s.t0)); const c = s.cam(t, u); c.fov = c.fov || 24 * DEG; const asp = canvas.width / canvas.height;
  // compositions are made for 16:9; on a taller window keep the width
  if (asp < 1.6) c.fov = 2 * Math.atan(Math.tan(c.fov / 2) * Math.min(2.2, 1.6 / asp));
  const o = FILM.orbit; if (Math.abs(o.yaw) + Math.abs(o.pitch) + Math.abs(o.zoom) > 1e-4 && !c.inside) { const v = V.sub(c.pos, c.look), l = V.len(v); let yaw = Math.atan2(v[0], v[2]) + o.yaw, pit = clamp(Math.asin(v[1] / l) + o.pitch, -.2, 1.35); const L = l * Math.exp(o.zoom * .5); c.pos = [c.look[0] + L * Math.cos(pit) * Math.sin(yaw), Math.max(.06 + (FILM.wy || 0), c.look[1] + L * Math.sin(pit)), c.look[2] + L * Math.cos(pit) * Math.cos(yaw)]; c.focus *= Math.exp(o.zoom * .5); c.pos[1] = Math.max(c.pos[1], groundY(c.pos[0]) * (Math.abs(c.pos[2]) < 1.6 ? 1 : 0) + .08); }
  c.shot = s; return c;
};
const DURX = 240;
FILM.frame = (t, o = {}) => {
  const s = o.rideon ? FILM.roShot(t) : shotAt(t); if (o.rideon && FILM.shot !== s) { const k = Math.floor((t - 400) / 12.86); ST.clock.x0 = 324 + (k * 41 % 84); ST.clock.d0 = ST.clock.dist; ST.now = t; for (let q = 0; q < 16; q++) FILM.stage(t, 1 / 60, q === 0); FILM.last = t; } const jump = Math.abs(t - FILM.last) > .25 || t < FILM.last - 1e-6; const cut = jump || FILM.shot !== s;  let dt = jump ? 1 / 60 : Math.max(0, t - FILM.last); const act0 = ST.act;
  if (jump && !o.norelax) { // settle springs, cloth and water into this moment
    FILM.shot = s; for (let k = 26; k > 0; k--) { const tq = Math.max(0, t - k / 30); if (k < 26 && !o.rideon && shotAt(tq) !== s && k > 2 && (tq < s.t0)) { /* same staging runs through cuts */ } FILM.stage(tq, 1 / 30, k === 26); if (ST.b.y < .05 && !(ST.act === 'night' || ST.act === 'dawn' || ST.act === 'catch')) FILM.ripples(tq, 1 / 30, k > 4 ? 4 : 4); } R.prevVP = null; }
  const x = FILM.stage(t, dt, cut && (ST.actBefore !== undefined && jump)); const env = FILM.env;
  // a staging change without a jump (cut between acts) also resets cloth
  const c = FILM.cam(t, s); if (FILM.dbg) { const d = FILM.dbg, o2 = d[7] ? nookPos().sit : [ST.b.x, 0, 0]; c.pos = V.add(o2, d.slice(0, 3)); c.look = V.add(o2, d.slice(3, 6)); c.fov = d[6] * DEG; c.ap = 0; c.up = d[8] ? [0, 0, -1] : undefined; c.inside = 0; } FILM.lastCam = c.pos; FILM.wy = env.waterY;
  FILM.ripples(t, dt, Math.max(1, Math.min(6, Math.round(dt * 120))));
  FILM.air(t, dt, c, env);
  env.hero = ST.act === 'night' || ST.act === 'dawn' ? V.add(nookPos().sit, [.4, .5, .1]) : ST.act === 'catch' ? V.add(ST.P.M ? [ST.P.M[12], ST.P.M[13], ST.P.M[14]] : [0, 0, 0], [.5, 0, 0]) : [ST.b.x + .05, ST.b.y + .85, 0]; env.heroBase = ST.act === 'night' || ST.act === 'dawn' ? [0, 0, 0] : [ST.b.x, ST.b.y, ST.b.z];
  const dist = V.dist(c.pos, env.hero); env.shR = ST.act === 'night' || ST.act === 'dawn' ? 1.5 : dist > 6 ? 2.3 : 1.9; env.shRF = 34; env.shSoft = ST.act === 'night' ? 1.6 : 2.4;
  F3(38, env.hero, 1); pushFrame();
  if (c.inside) { env.shR = .6; }
  const asp = canvas.width / canvas.height; R.time = t;
  R.render(c, env, { cut, dt, matte: o.matte ?? matteAt(t, asp), matteR: 0, fade: o.rideon ? (o.fadeIn ?? 1) : fadeAt(t), still: !!o.still, exp: FILM.expo(t, c), cloudN: o.cloudN });
  if (!o.rideon) FILM.titles(t); FILM.last = t; FILM.shot = s;
};
FILM.stage = (t, dt, cut) => { R.time = t; const m = moodAt(t); const x = weatherAt(t, m); const env = FILM.env = applyMood(m, t, x); env.sweep = x.sweep || 0; env.mood = m; env.heroX = 0; const bx0 = t >= TM.nightIn - .6 && t < 184 ? 301 : ST.bikeX(t), c0 = FILM.lastCam && Math.abs(FILM.lastCam[0] - bx0) < 60 ? FILM.lastCam : [bx0, 1, 8]; const a0 = ST.act; const ph = t < 112 ? 0 : t < 184 ? 1 : 2; const actJump = FILM.ph !== undefined && FILM.ph !== ph || (a0 === 'then') !== (t < TM.matchCut) || (a0 === 'night' && t >= TM.nightEnd) || (a0 === 'catch' && t >= TM.nightIn - .6); FILM.ph = ph; ST.pose(t, dt, env, c0, cut || actJump); return x; };
// ride on: a slow rotation of good seats in the house
FILM.roShots = [
  (t, u) => ({ pos: rel(V.lerp([.6, 1.1, 8.8], [.3, 1.15, 7.6], u)), look: rel([.40, .86, 0]), fov: 22 * DEG, focus: 8.2, ap: .05 }),
  (t, u) => ({ pos: V.add(rel([2.6, 1.35, lerp(2.4, 1.7, u)]), hand(t, .006, 3)), look: rel([-.05, 1.22, 0]), fov: 25 * DEG, focus: 3.2, ap: .06 }),
  (t, u) => ({ pos: V.add(rel([lerp(-.1, .2, u), .30, 1.8]), hand(t, .004, 5)), look: rel([-.42, .62, 0]), fov: 34 * DEG, focus: 1.8, ap: .03 }),
  (t, u) => ({ pos: rel([lerp(-5.5, -7.5, u), lerp(1.5, 2.6, u), lerp(2.2, 3.4, u)]), look: rel([3, 1.2, -.6]), fov: 28 * DEG, focus: 7, ap: .03 }),
  (t, u) => ({ pos: V.add(rel([lerp(.55, .4, u), 1.15, 1.7]), hand(t, .004, 7)), look: rel([-.50, 1.02, 0]), fov: 22 * DEG, focus: 2.0, ap: .06 }),
  (t, u) => ({ pos: rel([lerp(5.2, 4.4, u), .8, lerp(-3.2, -2.4, u)]), look: rel([0, 1.05, .2]), fov: 24 * DEG, focus: 5.6, ap: .05 }),
];
FILM.roShot = t => { const P = 12.86, k = Math.floor((t - 400) / P); FILM._ro = FILM._ro || {}; return FILM._ro[k] || (FILM._ro[k] = { id: 'ro' + k, rideon: true, t0: 400 + k * P, t1: 400 + (k + 1) * P, cam: FILM.roShots[((k % 6) + 6) % 6] }); };
FILM.ripples = (t, dt, steps) => {
  const flat = ST.b.y < .05 && (ST.act === 'then' || ST.act === 'now' || ST.act === 'ride') && FILM.env.waterY < .02; const b = ST.b;
  if (flat && b.v > .1) { for (let k = 0; k < Math.min(4, steps); k++) { const back = dt * k / Math.max(1, steps) * b.v; const h = -.0042 * Math.min(1.5, b.v / 2.5); WATER.drop(b.x + .92 - back + .02, b.z, .075, h); WATER.drop(b.x - .86 - back + .02, b.z, .075, h * .9); } }
  for (const p of ST.live.touch || []) WATER.drop(p[0], p[1], .10, p[2]); if (ST.live.touch) ST.live.touch.length = 0;
  const cx = ST.act === 'night' || ST.act === 'dawn' ? nookPos().sit[0] : b.x - 2; WATER.sim(cx, 0, steps, FILM.env.rain > .05 ? FILM.env.rain : 0, Math.floor(t * 60));
};
// spray, rain, bursts, light in the air
FILM.air = (t, dt, c, env) => {
  FX.begin(); const b = ST.b, act = ST.act;
  if (act === 'then' || act === 'now' || act === 'ride') {
    const cf = k => q => { const x = ST.bikeX(q); const gy = groundY(x + k); return { 0: x + k, 1: gy + .012, 2: 0, dry: false }; }; const ph = t > 85 && t < 107.4; const st = act === 'ride' ? 1.15 : act === 'then' ? .85 : ph ? 1.7 : .45;
    if (t < 107.4 || act === 'ride') { FX.wheel(t, q => { const z = cf(.80)(q); return [z[0], z[1], b.z, z.dry]; }, SPD, 1, st, 3, 0); FX.wheel(t, q => { const z = cf(-.98)(q); return [z[0], z[1], b.z, z.dry]; }, SPD, 1, st, 7, 0); }
    for (const [k, t0, s] of [[0, 190.43, 1], [1, 196.86, 1.25], [2, 203.29, 1.6]]) FX.crown(t, t0, [ST.bikeX(t0) + .9, .01, .0], s * .75, 40 + k, 70);
  }
  if (act === 'catch') { // drops hanging in slow time
    const sl = ST.slow(t), e = ST.eggPath(TM.catch_).p; const s = sl - (TM.wave + 1.1); for (let i = 0; i < 900; i++) { const h = j => hash3(i, 612, j); const vy = (h(1) - .25) * 2.2, y = .25 + 2.3 * h(4) + vy * s - 4.9 * s * s; if (y < .1) continue; FX.put([ST.crashX - .9 + 5.2 * h(0) + (h(5) - .3) * 1.6 * s, y, -1.8 + 4.4 * h(2) + (h(6) - .4) * .9 * s], .0025 + .012 * h(3) * h(3) * h(3), [(h(5) - .3) * .012, (vy - 9.8 * s) * .006, 0], 0, [1.25, 1.3, 1.3], .95); } }
  if (env.rain > .03 && act !== 'catch') FX.rain(t, c.pos, env.wind, env.rain * smooth(87, 93, t)); if (act === 'catch') FX.rain(ST.slow(t), c.pos, env.wind, .35);
  if (t > 86 && t < 112) { for (const [t0, s, pan] of SLAPS) { const x0 = ST.bikeX(t0) + 1.2 + pan * 3.5; FX.burst(t, t0, [x0, .20 + FILM.env.waterY * .6, -1.45], [-.2, 0, .9], .45 + s * .95, Math.round(t0 * 10)); FX.burst(t, t0 + .12, [x0 + 2.4 * pan + 1.5, .2 + FILM.env.waterY * .6, -1.5], [-.2, 0, .7], .3 + s * .7, Math.round(t0 * 10) + 5); if (s > .4) FX.burst(t, t0 + .3, [x0 - 3, .2, 1.5], [0, 0, -.5], .25 + s * .5, Math.round(t0 * 10) + 9); } const w = TM.wave; for (let k = 0; k < 6; k++) FX.burst(t, w - .10 + k * .05, [ST.bikeX(w) - 2.5 + k * 1.1, .55, -.7], [.3, 0, 1.3], 2.0, 900 + k * 13); }
  if (act === 'then' || act === 'ride') FX.motes(t, c.pos, act === 'ride' ? .25 * smooth(186, 192, t) : .35, [1.6, 1.0, .5]);
  if (act === 'dawn') FX.motes(t, c.pos, .16, [1.2, .85, .7]);
  // breath that shows in the cold
  if (act === 'night' || act === 'dawn' && t < 165) { const he = ST.he; if (he.headM) for (let i = 0; i < 10; i++) { const per = 3.6, b0 = Math.floor(t / per) * per + 1.2 + i * .07, a = t - b0; if (a > 0 && a < 1.8) { const p = M4.pt(he.headM, [.23 + a * .10, .04 + a * .05, (hash1(i) - .5) * .03]); FX.put(V.add(p, [a * .05, a * .06, 0]), .03 + a * .09, [0, 0, 0], 1, [.9, .92, 1], .05 * Math.exp(-a * 1.8) * smooth(0, .2, a)); } } }
  // feathers shaken loose by the fall
  if (t > TM.wave && t < 114.5) { const sl = ST.slow(t) - TM.wave; for (let i = 0; i < 16; i++) { const h = j => hash3(i, 88, j); FX.put([ST.crashX - .3 + 2.4 * h(0) + sl * (h(1) - .2), .8 + h(2) * 1.2 + sl * (.9 - .35 * sl) * h(3) + .1 * Math.sin(sl * 3 + i), -.6 + 1.6 * h(4)], .034 + .02 * h(5), [.05 * Math.sin(sl * 4 + i * 2), .06 * Math.cos(sl * 3 + i), .02], 4, [.9, .88, .85], .9); } }
};
FILM.expo = (t, c) => { let e = 1; const a = t - TM.wave; if (a > -.03 && a < 1.2) e *= 1 + 5.5 * Math.exp(-Math.max(0, a) * 5) * smooth(-.03, .02, a); if (t > 109 && t < 114.4) e *= .9; if (c.inside) e *= 1.25; if (t > 229.3 && t < 240) e *= lerp(1, .50, smooth(229.3, 232.2, t)); return e; };
FILM.titles = t => {
  const k = pulse(t, 36.9, 38.2, 40.3, 41.0); if (k > .002) TYPE.draw('title' + Math.round(clamp((t - 36.9) / 2.3) * 60), (g, w, h) => { const s = Math.min(w / 1920, h / 1080 * 1.4) * 46; const hb = Math.min(1, (w / h) / matteAt(t, w / h)); TYPE.center(g, 'BUILT FOR TWO', w * .30, h * (.5 - .335 * hb), s * .92, { tr: .62, k: clamp((t - 36.9) / 2.3), w: .056 }); }, [.97, .98, 1.0], k * .96);
  const e1 = pulse(t, 229.6, 230.6, 238.0, 239.2); if (e1 > .002) { const kk = clamp((t - 229.6) / 1.8), k2 = clamp((t - 231.6) / 2.2), k3 = clamp((t - 234.8) / 1.6); TYPE.draw('end' + Math.round(kk * 40) + '_' + Math.round(k2 * 50) + '_' + Math.round(k3 * 40), (g, w, h) => { const s = Math.min(w / 1920, h / 1080 * 1.4) * 29; TYPE.center(g, 'IN 1961 A COMPUTER LEARNED TO SING.', w * .5, h * .40, s, { tr: .5, k: kk, w: .062 }); if (k2 > 0) TYPE.center(g, 'THE SONG WAS ABOUT A BICYCLE BUILT FOR TWO.', w * .5, h * .40 + s * 2.5, s, { tr: .5, k: k2, w: .062 }); if (k3 > 0) TYPE.center(g, 'WRITTEN, SUNG AND DRAWN IN CODE', w * .5, h * .40 + s * 7.2, s * .60, { tr: .62, k: k3, w: .075 }); }, [.96, .93, .86], e1 * .95); }
};

// ---------- the foyer: an empty tandem on the mirror before dawn, both seats free, the sound being made behind it
FILM.foyer = (t, prog, want, stage, silent) => {
  const tt = 186 + 0; const m = mixMood(MOOD.predawn, MOOD.now, .12); R.time = t; const x = {}; const env = applyMood(Object.assign({}, m, { exp: m.exp * 1.0, gust: .10 }), t, x); FILM.env = env; const bx = 30; const b = ST.b = { x: bx, y: 0, z: 0, pitch: 0, lean: have('TANDEM') ? TANDEM.standLean : -.085, yaw: 0, steer: .30, v: 0, bump: 0, stand: 1 }, M = ST.M = ST.bikeM(b); ST.act = 'foyer';
  if (have('TANDEM')) { const ts = { M, crank: .12, wheel: 0, wheelF: 0, steer: b.steer, saddleF: 0, saddleR: 0, bell: ST.bellLever(t), bellShake: ST.bellShake(t), daisy: 1, lampOn: .0, stand: 1, basketK: [0, 0], vis: true, speed: 0, bump: 0, dt: 1 / 60, t }; TANDEM.pose(ts); ST.pts = TANDEM.points(ts); }
  for (const P of [ST.he, ST.she]) for (const it of [P.itBody, P.itBig, P.itSmall, P.itRig, P.itW, P.itD, P.itG, P.itPouch]) it.vis = false; ST.scA.it.vis = false;
  if (have('CHICK')) { CHICK.nest.pose({ M: M4.trs([0, -50, 0]), vis: false, t, dt: 1 / 60 }); CHICK.egg.pose({ M: M4.trs([0, -50, 0]), vis: false, crack: 0, cap: 0, hole: 0, rock: 0, t, dt: 1 / 60 }); CHICK.pose({ vis: false, M: M4.trs([0, -50, 0]), t, dt: 1 / 60, head: {}, wind: [0, 0, 0] }); }
  // the scarf lies over the front saddle and hangs, waiting
  const sc = ST.scB; sc.it.vis = true; const A = { c: M4.pt(M, [.16, .93, .02]), up: M4.dir(M, [0, 0, 1]) }; sc.step(1 / 60, A, null, { wind: V.add([-.35, 0, .1], ST.live.wind), gust: .12 + V.len(ST.live.wind) * .4, t }, [[M4.pt(M, [.02, .77, 0]), .115], [M4.pt(M, [-.2, .72, 0]), .05]], { reset: !FILM.foy, dir: V.norm([-.6, -.4, .55]), ground: .02, drag: 1.3 }); sc.hideWrap(0); sc.hideWrap(1); sc.hideWrap(2); sc.flush(null, 1 / 60, true); FILM.foy = true;
  if (have('SET')) SET.pose(t, env, { bikeX: bx, bikeZ: 0, camPos: [bx, 1, 9], wind: env.wind, gust: .1, beamAngle: t * .9, lampOn: 1, windows: .8, speed: 0 }); F4(33, 0, -9, 0, 0);
  for (const p of ST.live.touch) WATER.drop(p[0], p[1], .10, p[2]); ST.live.touch.length = 0; if (Math.random() < .012) WATER.drop(bx + (Math.random() - .5) * 8, 1 + Math.random() * 4, .05, -.02); WATER.sim(bx, 0, 2, 0, Math.floor(t * 60)); R.time = t; applyMood(m, t, x); FX.begin(); FX.motes(t, [bx, 1, 8], .10, [.9, .8, .9]);
  const k = .5 + .5 * Math.sin(t * .11), c = { pos: [bx + lerp(-.6, .9, k), 1.0, 7.6], look: [bx + .05 + lerp(-.1, .1, k), .92, 0], fov: 24 * DEG, focus: 7.6, ap: .05 }; const asp = canvas.width / canvas.height; if (asp < 1.6) c.fov = 2 * Math.atan(Math.tan(c.fov / 2) * Math.min(2.2, 1.6 / asp)); const o2 = FILM.orbit; if (Math.abs(o2.yaw) + Math.abs(o2.pitch) > 1e-4) { const v = V.sub(c.pos, c.look), l = V.len(v), yaw = Math.atan2(v[0], v[2]) + o2.yaw, pit = clamp(Math.asin(v[1] / l) + o2.pitch, .0, 1.2); c.pos = [c.look[0] + l * Math.cos(pit) * Math.sin(yaw), Math.max(.1, c.look[1] + l * Math.sin(pit)), c.look[2] + l * Math.cos(pit) * Math.cos(yaw)]; }
  env.hero = [bx, .7, 0]; env.heroBase = [bx, 0, 0]; env.shR = 2.2; env.shRF = 34; env.shSoft = 2.6; FILM.wy = 0; if (!FILM.warm) { FILM.warm = 1; for (const it of R.items) { it._v = it.vis; it._o = it.onlyRefl; it.vis = true; it.onlyRefl = false; } env.beam = { pos: [bx, 9, -20], dir: [1, 0, 0], gain: .001, spread: .03, col: [1, 1, 1] }; FX.put([bx, 1, 0], .01, [0, 0, 0], 0, [1, 1, 1], .01); R.render(c, env, { cut: true, dt: 1 / 60, matte: asp, fade: 0 }); for (const it of R.items) { it.vis = it._v; it.onlyRefl = it._o; } env.beam = null; } R.render(c, env, { cut: false, dt: 1 / 60, matte: asp, fade: smooth(0, 1.6, t - (FILM.ft0 = FILM.ft0 || t)) });
  const T1 = FILM.ft0, kk = clamp((t - T1 - .6) / 3.2); TYPE.draw('foy' + Math.round(kk * 90) + '_' + Math.round(prog * 120) + (want ? 'w' : '') + (stage || '') + (silent ? 's' : ''), (g, w, h) => { const u = Math.min(w / 1920, h / 1080 * 1.4); TYPE.center(g, 'BUILT FOR TWO', w * .5, h * .155, u * 64, { tr: .62, k: kk, w: .050 }); if (kk > .7) { if (prog < .999) { const s = u * 13; TYPE.center(g, (stage || 'the band is tuning').toUpperCase(), w * .5, h * .915, s * 1.2, { tr: .6, w: .09 }); g.lineWidth = u * 2; g.lineCap = 'round'; const L = u * 300; g.globalAlpha = .30; g.beginPath(); g.moveTo(w * .5 - L / 2, h * .948); g.lineTo(w * .5 + L / 2, h * .948); g.stroke(); g.globalAlpha = 1; g.beginPath(); g.moveTo(w * .5 - L / 2, h * .948); g.lineTo(w * .5 - L / 2 + L * prog, h * .948); g.stroke(); g.globalAlpha = 1; } else TYPE.center(g, silent ? 'TAP TO RIDE, NO SOUND IN THIS VIEWER' : 'TAP TO RIDE', w * .5, h * .925, u * 21, { tr: .7, w: .08 }); } }, [.97, .95, .92], .95 * smooth(.3, 1.2, t - T1));
};
