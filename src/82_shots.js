// ============================================================================
// 82_shots.js - the edit. Every shot: when, which lens, where it looks, why.
// Offsets are metres from the machine (x ahead, y up, z towards our side).
// ============================================================================
const SH = [];
const shot = (id, t0, t1, cam, o = {}) => SH.push(Object.assign({ id, t0, t1, cam }, o));
const up0 = [0, 1, 0];
// handheld: a tired human shoulder, amount in radians-ish
const hand = (t, a, seed = 1, f = .9) => [a * wob2(t * f, seed), a * wob2(t * f * 1.13 + 7, seed + 2), a * .6 * wob2(t * f * .9 + 3, seed + 4)];
const rel = (p) => [ST.b.x + p[0], ST.b.y + p[1], (ST.clock ? ST.b.z : 0) + p[2]];
const track = (t, p0, p1, l0, l1, u, e = ease.inOut) => ({ pos: rel(V.lerp(p0, p1, e(u))), look: rel(V.lerp(l0, l1, e(u))) });
const deg = DEG;
// the frame that returns three times: THEN, NOW, RIDE
const FRAME_A = { p: [.45, 1.05, 9.6], l: [.48, .70, 0], fov: 24.5 };
// ------------------------------------------------------------------ I. THEN
shot('reflection', 0, 6.65, (t, u) => { // we believe the water; then the water moves and the world turns over
  const r = smoother(3.0, 6.3, t), yl = lerp(-1.20, .70, r), yc = lerp(1.35, 1.05, r); const a = lerp(Math.PI, 0, smoother(3.1, 6.2, t)); const p = rel([lerp(.2, .45, r), yc, lerp(7.2, 9.6, r)]); return { pos: p, look: rel([lerp(.10, .48, r), yl, 0]), up: [Math.sin(a), Math.cos(a), 0], fov: lerp(17, 24.5, r) * deg, focus: lerp(5.2, 9.6, r), ap: lerp(.006, .05, r) }; });
shot('two', 6.65, 11.36, (t, u) => { const k = ease.inOut(u); return { pos: rel(V.lerp([.75, 1.15, 8.2], [.40, 1.22, 6.6], k)), look: rel(V.lerp([.42, .92, 0], [.20, 1.06, 0], k)), fov: lerp(21.5, 22.5, k) * deg, focus: lerp(8.2, 6.6, k), ap: .05 }; });
shot('answer', 11.36, 14.72, (t, u) => ({ pos: V.add(rel([1.05, 1.36, 4.1]), hand(t, .012, 3)), look: rel([-.16, 1.20, .02]), fov: 23 * deg, focus: 4.25, ap: .085 }));
shot('head-on', 14.72, 20.80, (t, u) => { const rf = smooth(17.75, 18.35, t) * (1 - smooth(20.0, 20.6, t) * .0); const k = ease.inOut(u); return { pos: rel([lerp(6.6, 6.1, k), 1.30, lerp(1.75, 1.62, k)]), look: rel([-.05, 1.30, .05]), fov: 16.5 * deg, focus: lerp(6.35, 7.05, rf), ap: .17, maxCoc: .022 }; });
shot('from-above', 20.80, 24.30, (t, u) => { const a = lerp(-.25, .45, ease.sine(u)); return { pos: rel([Math.sin(a) * 1.2 - .2, lerp(7.6, 9.6, ease.inOut(u)), 1.6 + Math.cos(a) * .6]), look: rel([.2, .3, .0]), up: [Math.sin(a * .8), 0, -Math.cos(a * .8)], fov: 30 * deg, focus: 8.4, ap: .02 }; });
shot('four-feet', 24.30, 27.62, (t, u) => ({ pos: V.add(rel([lerp(.15, -.10, u), .34, 2.05]), hand(t, .004, 5)), look: rel([lerp(0.02, -.08, u), .34, 0]), fov: 26 * deg, focus: 2.02, ap: .07 }));
shot('turns', 27.62, TM.matchCut, (t, u) => { const k = smoother(0, .86, u); return { pos: rel(V.lerp([.95, 1.22, 5.6], FRAME_A.p, k)), look: rel(V.lerp([.30, 1.22, 0], FRAME_A.l, k)), fov: lerp(17, FRAME_A.fov, k) * deg, focus: lerp(5.6, 9.6, k), ap: .06 }; });
// ------------------------------------------------------------------ II. NOW
shot('match', TM.matchCut, 41.05, (t, u) => ({ pos: rel(FRAME_A.p), look: rel(FRAME_A.l), fov: FRAME_A.fov * deg, focus: 9.6, ap: .06 }));
shot('rear-pedals', 41.05, 43.70, (t, u) => ({ pos: rel([lerp(-.16, -.24, u), .33, 1.32]), look: rel([-.36, .31, 0]), fov: 22 * deg, focus: 1.22, ap: .05, maxCoc: .028 }));
shot('rear-saddle', 43.70, 46.02, (t, u) => ({ pos: rel([lerp(.30, .22, u), 1.10, 1.75]), look: rel([-.66, .95, -.02]), fov: 22 * deg, focus: lerp(1.95, 1.95, u), ap: .06, maxCoc: .026 }));
shot('now-who', 46.02, 50.62, (t, u) => ({ pos: V.add(rel([lerp(2.35, 2.20, u), 1.48, 1.95]), hand(t, .006, 7)), look: rel([.40, 1.45, .05]), fov: 19 * deg, focus: 2.75, ap: .10, maxCoc: .024 }));
shot('gap-1', 50.62, 55.00, (t, u) => ({ pos: V.add(rel([lerp(-.98, -.93, u), 1.11, lerp(.86, .82, u)]), hand(t, .003, 9)), look: rel([.14, 1.24, .02]), fov: 37 * deg, focus: lerp(1.02, 1.62, smooth(51.5, 52.3, t)) - .55 * smooth(53.4, 54.2, t), ap: .034, maxCoc: .024 }));
shot('now-wakes', 55.00, 60.15, (t, u) => ({ pos: rel([lerp(-2.0, 1.2, u), 1.5, 27]), look: rel([lerp(-.6, .9, u), 1.75, 0]), fov: 11.5 * deg, focus: 27, ap: .08 }));
shot('gap-2', 60.15, 63.20, (t, u) => ({ pos: V.add(rel([lerp(1.25, 1.18, u), 1.52, 2.25]), hand(t, .004, 11)), look: rel([.52, 1.50, .02]), fov: 17.5 * deg, focus: 2.30, ap: .10, maxCoc: .024 }));
shot('looks-down', 63.20, 66.55, (t, u) => ({ pos: V.add(rel([lerp(2.30, 2.2, u), lerp(1.12, 1.16, u), 1.35]), hand(t, .004, 13)), look: rel([.52, lerp(1.30, 1.22, u), .03]), fov: 23 * deg, focus: 2.35, ap: .07 }));
shot('the-egg', 66.55, 70.30, (t, u) => { const k = ease.inOut(u); return { pos: rel(V.lerp([1.46, 1.36, .50], [1.34, 1.28, .40], k)), look: rel([1.0, .925, .015]), fov: 24 * deg, focus: lerp(.78, .62, k), ap: .024, maxCoc: .026 }; });
shot('two-of-them', 70.30, 73.70, (t, u) => ({ pos: V.add(rel([lerp(3.0, 2.85, u), .98, .85]), hand(t, .004, 15)), look: rel([.75, 1.20, .05]), fov: 21 * deg, focus: 2.35, ap: .09 }));
shot('and-it-turns', 73.70, 80.30, (t, u) => { const k = ease.inOut(clamp(u * 1.1)); return { pos: V.add(rel(V.lerp([1.95, 1.52, 2.35], [1.50, 1.54, 1.62], k)), hand(t, .004, 17)), look: rel([lerp(.42, .50, k), lerp(1.49, 1.50, k) - .16 * smooth(78.2, 80.0, t), .04]), fov: 18 * deg, focus: lerp(2.75, 1.86, k), ap: .085, maxCoc: .026 }; });
shot('the-road', 80.30, 83.00, (t, u) => ({ pos: rel([lerp(-7.5, -8.5, u), 1.75, 1.6]), look: rel([8, 2.35, -1.2]), fov: 25 * deg, focus: 8.3, ap: .05 }));
shot('wind', 83.00, 85.50, (t, u) => ({ pos: V.add(rel([lerp(2.5, 2.35, u), .95, 2.1]), hand(t, .016, 19, 1.4)), look: rel([.45, 1.45, .0]), fov: 27 * deg, focus: 2.9, ap: .06 }));
// ------------------------------------------------------------------ III. STORM
shot('storm-wide', 85.50, 91.00, (t, u) => ({ pos: V.add(rel([lerp(6.5, 3.0, u), lerp(2.1, 1.7, u), 16.5]), hand(t, .10, 21, .7)), look: V.add(rel([lerp(1.5, .6, u), 1.55, 0]), hand(t, .10, 22, .8)), fov: 19 * deg, focus: 17, ap: .06 }));
shot('hold-on', 91.00, 95.95, (t, u) => ({ pos: V.add(rel([2.55, 1.32, 2.05]), hand(t, .050, 23, 1.6)), look: V.add(rel([.50, 1.34, .03]), hand(t, .035, 24, 1.8)), fov: 22 * deg, focus: 2.95, ap: .08 }));
shot('wheels', 95.95, 98.70, (t, u) => ({ pos: V.add(rel([lerp(2.2, 1.6, u), .18, 1.55]), hand(t, .03, 25, 1.9)), look: V.add(rel([lerp(.55, .2, u), .55, -.1]), hand(t, .02, 26, 2)), fov: 34 * deg, focus: 1.9, ap: .035 }));
shot('tide', 98.70, 101.90, (t, u) => ({ pos: V.add(rel([lerp(-3.2, -2.2, u), 1.25, 9.4]), hand(t, .07, 27, 1.1)), look: V.add(rel([lerp(.2, .6, u), 1.25, 0]), hand(t, .06, 28, 1.2)), fov: 16 * deg, focus: 9.6, ap: .09 }));
shot('egg-storm', 101.90, 104.60, (t, u) => ({ pos: V.add(rel([1.75, 1.36, .62]), hand(t, .022, 29, 2.2)), look: V.add(rel([1.0, .94, .02]), hand(t, .016, 30, 2.4)), fov: 27 * deg, focus: .92, ap: .028, maxCoc: .024 }));
shot('the-wall', 104.60, 107.42, (t, u) => ({ pos: V.add(rel([lerp(4.2, 3.6, u), lerp(.95, .80, u), lerp(3.0, 2.7, u)]), hand(t, .07, 31, 1.7)), look: V.add(rel([.1, lerp(1.35, 1.85, ease.in(u)), -.6]), hand(t, .05, 32, 1.9)), fov: 34 * deg, focus: 4.6, ap: .03 }));
// ------------------------------------------------------------------ CATCH
shot('crash', 107.42, 108.70, (t, u) => ({ pos: V.add([ST.crashX + 1.9, .95, 4.2], hand(t, .22 * (1 - u), 33, 3.2)), look: V.add([ST.crashX + .3, .9, 0], hand(t, .18 * (1 - u), 34, 3.4)), fov: 30 * deg, focus: 4.5, ap: .03 }));
shot('egg-flies', 108.70, 110.35, (t, u) => { const e = ST.eggPath(t).p; return { pos: V.add(e, [lerp(.55, .35, u), lerp(-.30, -.22, u), lerp(1.0, .86, u)]), look: V.add(e, [.02, -.02, 0]), fov: 26 * deg, focus: 1.1, ap: .035, maxCoc: .03 }; });
shot('reach', 110.35, 111.25, (t, u) => { const e = ST.eggPath(TM.catch_).p, h = ST.P && ST.P.M ? [ST.P.M[12], ST.P.M[13], ST.P.M[14]] : e; return { pos: V.add(h, V.lerp([1.1, -.15, 3.5], [1.0, -.05, 3.2], u)), look: V.add(h, [.62, .34, 0]), fov: 31 * deg, focus: 3.4, ap: .03 }; });
shot('snap', 111.25, 112.30, (t, u) => { const e = ST.eggPath(Math.min(t, TM.catch_)).p; const k = ease.inOut(u); return { pos: V.add(e, V.lerp([.25, .00, 1.95], [.10, .02, 1.70], k)), look: V.add(e, V.lerp([-.16, -.05, 0], [-.18, -.04, 0], k)), fov: 30 * deg, focus: 1.85, ap: .035 }; });
shot('caught', 112.30, TM.nightIn, (t, u) => { const h = ST.he.headM ? M4.pt(ST.he.headM, [.20, -.02, 0]) : [0, 0, 0]; return { pos: V.add(h, [.35, .05, 1.30]), look: V.add(h, [.02, -.05, 0]), fov: 25 * deg, focus: 1.32, ap: .035 }; });
// ------------------------------------------------------------------ IV. NIGHT
const nk = (p) => V.add(nookPos().sit, p);
const HEADN = () => ST.he.headM ? M4.pt(ST.he.headM, [.16, .0, 0]) : nk([.3, .8, 0]);
shot('stars', TM.nightIn, 122.10, (t, u) => { const k = smoother(.10, .95, u); return { pos: nk(V.lerp([-6.5, 1.0, 15.5], [-4.6, 1.1, 13.2], k)), look: nk(V.lerp([2.2, 12.5, -10], [1.2, 2.2, -2], k)), fov: lerp(34, 30, k) * deg, focus: 15, ap: .006 }; });
shot('hum', 122.10, 128.55, (t, u) => { const h = HEADN(); return { pos: V.add(nk([1.1, .70, 2.65]), hand(t, .003, 41, .5)), look: nk([.40, .66, .02]), fov: 19.5 * deg, focus: 2.6, ap: .07 }; });
shot('waits', 128.55, 131.00, (t, u) => ({ pos: V.add(nk([2.35, .84, .85]), hand(t, .003, 43, .5)), look: nk([.30, .80, .02]), fov: 18 * deg, focus: 2.2, ap: .085, maxCoc: .024 }));
shot('her-notes', 131.00, 135.55, (t, u) => { const c = ST.he.pouchC || nk([.6, .5, 0]); const k = ease.inOut(u); return { pos: V.add(c, V.lerp([.10, -.02, 1.05], [.04, .02, .82], k)), look: V.add(c, [-.06, .045, 0]), fov: 27 * deg, focus: lerp(1.05, .84, k), ap: .030, maxCoc: .026 }; });
shot('inside', 135.55, 139.80, (t, u) => { const c = ST.he.pouchC || nk([.6, .5, 0]); const J = p => ST.he.jawM ? M4.pt(ST.he.jawM, p) : c; return { pos: J([lerp(.176, .184, u), -.070, .012]), look: J([.30, -.098, -.004]), fov: 84 * deg, focus: .10, ap: .0016, maxCoc: .014, near: .006, inside: 1 }; });
shot('under-the-lamp', 139.80, 145.70, (t, u) => ({ pos: nk(V.lerp([2.1, 1.02, 5.0], [1.7, .92, 4.2], ease.inOut(u))), look: nk([.55, .72, -.1]), fov: 19 * deg, focus: lerp(5.1, 4.35, u), ap: .08 }));
shot('asleep', 145.70, TM.nightEnd, (t, u) => ({ pos: V.add(nk(V.lerp([1.00, .62, 2.30], [.86, .58, 2.00], ease.inOut(u))), hand(t, .002, 45, .4)), look: nk([.44, lerp(.60, .53, u), .05]), fov: 22.5 * deg, focus: lerp(2.3, 1.98, u), ap: .06 }));
// ------------------------------------------------------------------ V. DAWN
const NC = p => V.add(ST.nestC || nk([.76, .006, .05]), p);
shot('low-tide', TM.nightEnd, 157.0, (t, u) => { const k = ease.inOut(u); return { pos: nk(V.lerp([-4.2, .95, 17.5], [-3.0, .95, 14.5], k)), look: nk(V.lerp([3.4, 4.6, -6], [2.2, 3.2, -4], k)), fov: 40 * deg, focus: lerp(18, 15, k), ap: .03 }; });
shot('first-crack', 157.0, 160.85, (t, u) => ({ pos: NC(V.lerp([.40, .115, .46], [.36, .10, .42], ease.inOut(u))), look: NC(V.lerp([-.02, .105, -.02], [-.02, .125, -.02], u)), fov: 33 * deg, focus: lerp(.60, .54, u) + smooth(160.0, 160.7, t) * .42, ap: .018, maxCoc: .026 }));
shot('wakes', 160.85, 163.05, (t, u) => ({ pos: V.add(nk([1.10, .56, 2.05]), hand(t, .003, 47, .6)), look: nk([.42, .60, .02]), fov: 22 * deg, focus: 2.1, ap: .07 }));
shot('hatching', 163.05, 168.40, (t, u) => ({ pos: NC(V.lerp([.34, .17, .44], [.37, .19, .48], u)), look: NC(V.lerp([0, .07, 0], [.02, .12, .01], smooth(.35, .7, u))), fov: 33 * deg, focus: .58, ap: .016, maxCoc: .026 }));
shot('asks', 168.40, 174.10, (t, u) => ({ pos: V.add(nk(V.lerp([1.15, .76, 2.15], [.98, .76, 1.82], ease.inOut(u))), hand(t, .003, 49, .6)), look: nk([.54, .71, .04]), fov: 22.5 * deg, focus: lerp(2.2, 1.86, u), ap: .075 }));
shot('only-looks', 174.10, 177.20, (t, u) => ({ pos: NC([lerp(.40, .36, u), .23, .50]), look: NC([.01, .165, 0]), fov: 32 * deg, focus: .62, ap: .016, maxCoc: .026 }));
shot('silence', 177.20, 182.62, (t, u) => ({ pos: V.add(nk(V.lerp([1.42, .60, 1.85], [1.22, .64, 1.62], ease.inOut(u))), hand(t, .002, 51, .5)), look: nk(V.lerp([.40, .60, .02], [.36, .66, .02], smooth(180.4, 182, t))), fov: 22 * deg, focus: lerp(2.1, 1.86, u), ap: .07 }));
shot('wee-two', 182.62, 184.0, (t, u) => ({ pos: NC([.34, .20, .46]), look: NC([.01, .165, 0]), fov: 31 * deg, focus: .57, ap: .016, maxCoc: .026 }));
// ------------------------------------------------------------------ VI. RIDE
shot('go-wheel', 184.0, 187.1, (t, u) => ({ pos: V.add(rel([lerp(-1.5, -2.6, ease.in(u)), .16, 1.5]), hand(t, .006, 53)), look: rel([lerp(-.5, -.2, u), .42, 0]), fov: 32 * deg, focus: 1.8, ap: .03 }));
shot('go-chick', 187.1, 190.40, (t, u) => ({ pos: V.add(rel([lerp(.55, .48, u), 1.08, 1.9]), hand(t, .008, 55)), look: rel([-.46, 1.02, .0]), fov: 21 * deg, focus: 2.1, ap: .065 }));
shot('frame-again', 190.40, 196.80, (t, u) => ({ pos: rel(V.lerp([FRAME_A.p[0], 1.10, 8.8], [FRAME_A.p[0], 1.14, 7.7], ease.inOut(u))), look: rel(V.lerp([.55, 1.06, 0], [.42, 1.12, 0], ease.inOut(u))), fov: 17.5 * deg, focus: lerp(8.8, 7.7, u), ap: .05 }));
shot('dangle', 196.80, 203.25, (t, u) => { const k = ease.inOut(u); return { pos: V.add(rel(V.lerp([-.10, .26, 1.75], [-.02, .34, 1.62], k)), hand(t, .004, 57)), look: rel(V.lerp([-.46, .52, 0], [-.50, .86, 0], smooth(.15, .8, u))), fov: 33 * deg, focus: 1.72, ap: .035 }; });
shot('birds', 203.25, 209.60, (t, u) => { const k = smoother(0, 1, u); return { pos: rel(V.lerp([-4.2, 1.1, 6.0], [-8.5, 8.2, 11.5], k)), look: rel(V.lerp([2.2, 1.8, -1], [9, 1.6, -7], k)), fov: lerp(28, 36, k) * deg, focus: lerp(8, 18, k), ap: .02 }; });
shot('you', 209.60, 216.10, (t, u) => { const k = ease.inOut(u); return { pos: V.add(rel(V.lerp([2.35, 1.42, 2.2], [1.75, 1.48, 1.85], k)), hand(t, .005, 59)), look: rel([.36, lerp(1.46, 1.52, k), .03]), fov: 19.5 * deg, focus: lerp(2.95, 2.32, k), ap: .08 }; });
shot('the-water-remembers', 216.10, 226.55, (t, u) => { const k = smoother(.0, .42, u), h = smoother(.66, 1, u); return { pos: rel(V.lerp(V.lerp([.50, 1.15, 8.2], [.20, 1.25, 8.4], k), [.1, 1.2, 9.6], h)), look: rel(V.lerp(V.lerp([.30, .95, 0], [.06, -1.05, 0], k), [.05, -.70, 0], h)), fov: lerp(20, 17.5, k) * deg, focus: lerp(8.2, 5.6, k), ap: lerp(.05, .007, k) }; });
shot('ting', 226.55, 228.70, (t, u) => ({ pos: V.add(rel([lerp(.20, .16, u), 1.12, 1.12]), hand(t, .004, 61)), look: rel([-.225, 1.075, .20]), fov: 25.5 * deg, focus: 1.0, ap: .030, maxCoc: .026 }));
shot('away', 228.70, 400, (t, u) => { const a = t - 228.7; const x0 = 228.7; const bx = ST.bikeX(228.7); return { pos: [bx - 3.2, lerp(1.1, 1.6, smooth(0, 10, a)), 4.6], look: [bx + lerp(2.5, 30, smooth(0, 9, a)), lerp(1.45, 4.6, smooth(0, 7, a)), lerp(0, -6, smooth(0, 9, a))], fov: lerp(25, 27, smooth(0, 10, a)) * deg, focus: lerp(6, 30, smooth(0, 6, a)), ap: .03 }; });
SH.sort((a, b) => a.t0 - b.t0);
const shotAt = t => { let s = SH[0]; for (const q of SH) if (t >= q.t0 - 1e-6) s = q; return s; };
// ------------------------------------------------------------------ the colour script in time
const moodAt = t => {
  if (t < TM.matchCut) return mixMood(MOOD.then, MOOD.then, 0);
  if (t < 78) { const w = ST.live.heard(t).warm; return w > .01 && t > 46 ? mixMood(MOOD.now, MOOD.warmed, w * smooth(46, 48, t) * .75) : MOOD.now; } if (t < 85.2) return mixMood(MOOD.now, MOOD.front, smooth(78, 84.6, t)); if (t < 93) return mixMood(MOOD.front, MOOD.storm, smooth(85.2, 92, t));
  if (t < TM.nightIn - .35) return mixMood(MOOD.storm, MOOD.catch, smooth(108.3, 108.75, t)); if (t < TM.nightEnd) return MOOD.night;
  if (t < 180.4) return mixMood(MOOD.predawn, MOOD.dawn, smooth(152, 169, t)); if (t < 184) return mixMood(MOOD.dawn, MOOD.ride, smooth(180.4, 183.8, t) * .55); return mixMood(mixMood(MOOD.dawn, MOOD.ride, .55), MOOD.ride, smooth(184, 190, t));
};
MOOD.warmed = Object.assign({}, mixMood(MOOD.now, MOOD.then, .42), { sun: MOOD.now.sun, film: MOOD.now.film, wind: MOOD.now.wind, fogD: .006, exp: .92 });
MOOD.predawn = Object.assign({}, mixMood(MOOD.night, MOOD.dawn, .55), { sun: MOOD.dawn.sun, sea: 0, waveA: 0, film: .030, mirror: .95, stars: .15, moon: [0, 1, 0, 0], exp: 1.15, windR: .04, sandWet: .4, sunCol: [.9, .55, .42], wind: MOOD.dawn.wind });
// weather and light that belong to moments rather than moods
const flashAt = t => { let f = 0; for (const c of [79.28, 88.28, 94.81, 101.70, 105.2]) { const a = t - c; if (a > 0 && a < .7) f += (Math.exp(-a * 9) * (.6 + .4 * Math.sin(a * 60)) + .5 * Math.exp(-Math.abs(a - .22) * 30)) * (c < 80 ? .25 : c < 90 ? .6 : 1); } return f; };
const SLAPS = [[87.32, .16, -.5], [90.5, .22, .45], [92.32, .28, -.2], [94.59, .34, .6], [96.86, .42, -.6], [98.68, .5, .3], [100.5, .6, -.35], [102.77, .68, .55], [104.14, .78, -.5], [105.5, .88, .25], [106.86, 1, 0]];
function weatherAt(t, m) {
  const x = {}; const k = smooth(84, 92, t) * (t < TM.nightIn ? 1 : 0);
  if (t > 216.1 && t < 226.6) { x.film = lerp(.032, .10, smooth(216.1, 218, t)); x.top = .34 * smooth(216.4, 218.4, t); x.sunMul = lerp(1, .42, smooth(216.4, 218.6, t)); } if (t > 20.4 && t < 24.6) x.top = .86 * pulse(t, 20.5, 20.8, 24.29, 24.31); x.waterY = t < 82 ? 0 : t < TM.nightIn ? lerp(0, .06, smooth(83, 92, t)) + .17 * smooth(92, 106, t) : t < TM.nightEnd ? .12 : 0; x.wave = t < TM.nightIn ? lerp(.16, .46, smooth(86, 104, t)) : t < TM.nightEnd ? .62 : 1; if (t < 84) x.wave = 0;
  const f = flashAt(t); if (f > .004) x.flash = [1.5 * f, 1.8 * f, 2.1 * f];
  // rogue wave: amplitude, z of the crest, width
  F4(44, 0, 0, 1, 0); if (t > 103.8 && t < 109) { const u = (t - 103.8) / (TM.wave - 103.8); F4(44, 4.0 * smooth(0, .6, u) * (1 - smooth(1.0, 1.25, u)), lerp(-20, -.8, Math.pow(clamp(u, 0, 1.2), 1.35)), 3.8, 0); }
  if (t >= TM.nightIn - .35 && t < TM.nightEnd) { // the beam is the key light; a lantern in the cottage window is the fill
    const n = nookPos().sit, ph = ((t - SCORE.SWEEP.t0) / SCORE.SWEEP.P); const d = ph - Math.round(ph), s = Math.exp(-Math.pow(d * SCORE.SWEEP.P / .52, 2)); const side = d * 22; x.l0 = { key: true, pos: V.add(n, [1.4 + side * .55, 1.35, -3.6]), r: 3.4, col: [8.2 * s + .03, 5.7 * s + .03, 3.1 * s + .045], cone: .30, dir: V.norm([-1.0 - side * .4, -.75, 3.6]) }; x.sweep = s;
    x.l1 = { pos: V.add(n, [-1.9, 1.35, -.55]), r: 1.15, col: [1.25, .66, .27], k: 1.0 * (.92 + .08 * wob2(t * 3, 3)) };
    if (have('SET') && SET.beam) { const B = SET.beam(ST.beamA || 0); x.beam = { pos: B.pos, dir: B.dir, gain: .030, spread: .035, col: [1.0, .78, .50] }; }
  }
  if (t > 135.5 && t < 139.85 && ST.he && ST.he.jawM) x.l1 = { pos: M4.pt(ST.he.jawM, [.265, -.030, .085]), r: .10, col: [1.7, .80, .30], k: .22 + 1.1 * (x.sweep || 0) };
  if (t < 5.6) x.sunMul = lerp(.30, 1, smooth(3.2, 5.4, t));
  if (t > 84 && t < 108) { x.l1 = { pos: rel ? V.add([ST.b ? ST.b.x : 0, ST.b ? ST.b.y : 0, 0], [1.25, .66, 0]) : [0, 0, 0], r: .9, col: [1.5, .95, .42], k: .5 * smooth(84.5, 88, t) }; }
  return x;
}
// aspect of the frame: 2.39 -> 1.85 -> 1.33 -> square -> opens to the whole window
const matteAt = (t, asp) => { const full = Math.max(asp, 1.2); const a = keys([[0, 2.39], [TM.matchCut + 1.5, 2.39], [47, 1.85], [85, 1.85], [104, 1.40], [TM.nightIn, 1.33], [124, 1.06], [180.42, 1.06], [184.2, full, ease.inOut5]], t, ease.inOut); return Math.abs(a - full) < .004 ? asp : a; };
const fadeAt = t => Math.min(smooth(.15, 2.2, t), 1 - smooth(234.5, 238.8, t), 1 - pulse(t, 113.5, 114.4, 115.15, 117.0), 1 - pulse(t, 150.6, 151.95, 152.05, 154.0) * .92, 1);
