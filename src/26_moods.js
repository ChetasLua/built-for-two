// ============================================================================
// 26_moods.js - the colour script. Every light, sky, sea and lab value of the
// film, as a small set of moods that are mixed in time.
// ============================================================================
const C = h => { const n = parseInt(h.slice(1), 16), f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)]; };
const CK = (h, k) => C(h).map(v => v * k);
const sunV = (az, el) => { const a = az * DEG, e = el * DEG; return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)]; };     // az 0 = straight behind the riders (-Z), +90 = ahead (+X)
const MOOD = {};
MOOD.then = {
  sun: sunV(15.5, 4.6), sunCol: [9.6, 4.7, 1.75], sunSize: .024, disc: 1.3,
  zenith: CK('#2f5a96', .60), upper: CK('#7f9bb4', .60), horizon: CK('#8f8196', .48), horSun: CK('#f39a43', 1.08), haze: 8.0, glow: .030, ground: CK('#7f6f72', .34), amb: .74, stars: 0,
  fogCol: CK('#b98a6a', .55), fogD: .0016, fogH: .035, fogSun: .9, mist: .2,
  cloud: [.62, 1.05, 900, 560], clScale: 2.4, clSpeed: 1, clLit: [4.2, 2.1, .95], clDark: [.22, .20, .27],
  waterY: 0, waveA: 0, sea: 0, windR: .16, deep: CK('#3b5a5c', .5), scat: CK('#5f8f86', .5), foam: 0, mirror: .92,
  wind: [-1, 0, .25], gust: .18, sand: CK('#c9a173', 1.0), sandWet: .4, film: .030, rim: [.42, .22, .08], rain: 0, shafts: .12, ao: .85,
  exp: .70, contrast: 1.22, sat: 1.02, split: .55, gain: [.52, .505, .48], lift: [.495, .495, .515], black: .060, white: .90, tintS: [.95, .98, 1.10], tintH: [1.07, 1.0, .90], bloom: .22, ca: .5, vig: .18, hal: .035, grain: .030, veil: .0, moon: [0, 1, 0, 0],
};
MOOD.now = Object.assign({}, MOOD.then, {
  sun: sunV(24, 3.0), sunCol: [.62, .66, .74], sunSize: .05, disc: 0,
  zenith: CK('#5b6b7c', .62), upper: CK('#8f9aa4', .70), horizon: CK('#b9bec0', .80), horSun: CK('#cfcac2', .86), haze: 3.0, glow: .03, ground: CK('#6f7478', .6), amb: 1.05, stars: 0,
  fogCol: CK('#b4babd', .78), fogD: .0085, fogH: .05, fogSun: .35, mist: 1,
  cloud: [.74, .7, 700, 420], clScale: 2.2, clSpeed: .8, clLit: [.95, 1.0, 1.08], clDark: [.36, .39, .43],
  windR: .05, film: .034, mirror: .95, sand: CK('#8b857c', 1.0), rim: [.05, .06, .08], shafts: 0, gust: .10,
  exp: .92, contrast: 1.04, sat: .72, split: .6, gain: [.485, .50, .52], lift: [.495, .50, .515], black: .045, white: .88, tintS: [.90, .98, 1.12], tintH: [.99, 1.0, 1.02], bloom: .22, vig: .26, hal: .015, grain: .042, veil: .010,
});
MOOD.front = Object.assign({}, MOOD.now, {
  sunCol: [.55, .58, .62], zenith: CK('#3c4650', .5), upper: CK('#5c6a72', .55), horizon: CK('#a7afac', .62), horSun: CK('#c8c2a8', .78), fogCol: CK('#8b9694', .62), fogD: .0052, cloud: [.86, 1.15, 600, 560], clLit: [.75, .78, .80], clDark: [.16, .19, .21], windR: .55, waveA: .05, sea: .35, film: .06, wind: [-1, 0, .5], gust: .75, deep: CK('#22403f', .5), scat: CK('#3f7468', .5), foam: .25, mirror: .55,
  exp: .98, contrast: 1.10, sat: .78, black: .04,
});
MOOD.storm = Object.assign({}, MOOD.front, {
  sun: sunV(60, 24), sunCol: [.36, .42, .46], zenith: CK('#161d21', .36), upper: CK('#2c3936', .38), horizon: CK('#66776c', .42), horSun: CK('#9aa588', .56), haze: 2.6, fogCol: CK('#5f6e66', .38), fogD: .0085, fogH: .02, ground: CK('#2d3b38', .5), amb: 1.1,
  cloud: [.98, 1.5, 420, 620], clScale: 1.9, clSpeed: 6, clLit: [.34, .38, .37], clDark: [.055, .072, .072],
  waveA: 1.0, sea: 1, windR: 1.0, film: .4, foam: 1.0, deep: CK('#14302b', .55), scat: CK('#3c8371', .8), mirror: .1, wind: [-1.6, 0, .8], gust: 1.6, rain: 1, sandWet: 1, rim: [.10, .13, .13],
  exp: 1.30, contrast: 1.26, sat: .84, gain: [.49, .505, .505], lift: [.49, .505, .505], tintS: [.86, 1.02, 1.0], tintH: [1.0, 1.02, .96], black: .04, white: .84, bloom: .22, vig: .34, grain: .055, hal: .02, veil: .006,
});
MOOD.catch = Object.assign({}, MOOD.storm, { sun: sunV(56, 26), sunCol: [3.4, 4.0, 4.3], glow: .04, fogD: .0045, horSun: CK('#c9d6cc', .62), rain: .5, wind: [-.5, 0, .3], gust: .5, exp: 1.05, contrast: 1.30, sat: .78, rim: [.5, .58, .6], bloom: .30, shafts: .25 });
MOOD.night = Object.assign({}, MOOD.then, {
  sun: sunV(-40, 34), sunCol: [.085, .105, .165], sunSize: .02, disc: 0, glow: .02,
  zenith: CK('#0c1426', .18), upper: CK('#18233c', .22), horizon: CK('#39465e', .24), horSun: CK('#455064', .26), haze: 3.4, ground: CK('#1c222c', .18), amb: .9, stars: 1,
  fogCol: CK('#28314a', .18), fogD: .0035, fogH: .03, fogSun: .1, cloud: [.40, .7, 900, 420], clScale: 2.6, clSpeed: 1, clLit: [.20, .24, .36], clDark: [.018, .022, .040],
  waveA: .13, sea: 1, windR: .30, film: .5, foam: .12, deep: CK('#0c1a2c', .4), scat: CK('#1f4a5a', .25), mirror: .3, wind: [-.6, 0, .2], gust: .12, rain: 0, rim: [.012, .018, .035], shafts: 0, sand: CK('#5f5348', 1), sandWet: .8,
  exp: 2.25, contrast: 1.12, sat: .92, split: .6, gain: [.50, .50, .51], lift: [.495, .498, .512], tintS: [.84, .94, 1.22], tintH: [1.08, 1.0, .88], black: .045, white: .84, bloom: .26, vig: .36, hal: .04, grain: .045, veil: .002, moon: [...sunV(-40, 34), 0],
});
MOOD.dawn = Object.assign({}, MOOD.then, {
  sun: sunV(34, 2.2), sunCol: [3.9, 2.05, 1.25], sunSize: .028, disc: .6, zenith: CK('#5f7699', .58), upper: CK('#c7a7ac', .70), horizon: CK('#f0b7a0', .86), horSun: CK('#ffbd8d', 1.25), haze: 3.6, glow: .06, ground: CK('#9a7f7a', .55), amb: 1.0,
  fogCol: CK('#e0b3a8', .80), fogD: .0048, fogH: .06, fogSun: .6, mist: 1, cloud: [.52, .75, 900, 380], clLit: [2.0, 1.15, .95], clDark: [.40, .34, .42], windR: .04, film: .030, mirror: .95, gust: .05, wind: [-.5, 0, .1], rim: [.22, .12, .09], sand: CK('#b0937e', 1), shafts: .22,
  exp: .86, contrast: 1.05, sat: 1.0, split: .5, gain: [.515, .50, .495], lift: [.50, .495, .51], tintS: [.96, .95, 1.10], tintH: [1.06, 1.0, .95], black: .04, white: .89, bloom: .34, vig: .22, hal: .04, grain: .036, veil: .008,
});
MOOD.ride = Object.assign({}, MOOD.then, {
  sun: sunV(16, 8.5), sunCol: [9.0, 6.0, 3.4], disc: 1.1, zenith: CK('#2f6ab4', .66), upper: CK('#8fb3d0', .70), horizon: CK('#a9adbd', .60), horSun: CK('#f7c07c', 1.05), haze: 7.0, glow: .026, fogCol: CK('#c9b3a4', .62), fogD: .0013, cloud: [.58, 1.0, 900, 600], clLit: [4.2, 3.1, 2.2], clDark: [.27, .30, .38], windR: .12, film: .032, gust: .22, rim: [.34, .23, .12], shafts: .10, amb: .82, sand: CK('#c7a67f', 1),
  exp: .66, contrast: 1.19, sat: 1.04, tintS: [.94, .98, 1.10], tintH: [1.05, 1.0, .93], bloom: .24, grain: .028, black: .055,
});
MOOD.studio = Object.assign({}, MOOD.then, { sun: sunV(140, 34), sunCol: [3.2, 2.95, 2.6], disc: 0, glow: .02, zenith: CK('#8fa3b5', .62), upper: CK('#aab4b8', .62), horizon: CK('#c9c6be', .66), horSun: CK('#d8d0c2', .7), ground: CK('#8a8378', .5), fogCol: CK('#c2c0ba', .62), fogD: .010, cloud: [.0, 0, 900, 400], windR: .05, film: -.2, sand: CK('#a39a8c', .8), rim: [.10, .10, .11], shafts: 0, exp: .95, sat: 1.05, split: .2, gain: [.5, .5, .5], lift: [.5, .5, .5], tintS: [1, 1, 1], tintH: [1, 1, 1], bloom: .14, vig: .10, hal: 0, grain: .0, veil: 0, black: .03, white: .88 });
function mixMood(a, b, t) { if (t <= 0) return a; if (t >= 1) return b; const o = {}; for (const k in a) { const x = a[k], y = b[k]; o[k] = Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * t) : x + (y - x) * t; } const l = V.norm(o.sun); o.sun = l; return o; }
// push a mood into the uniform block and return what the renderer needs on the CPU
function applyMood(m, t, x = {}) {
  const sc = x.sunMul ?? 1;
  F3(1, m.sun, m.sunSize); F3(2, V.mul(m.sunCol, sc), m.disc); F3(3, m.zenith, m.stars); F3(4, m.upper); F3(5, m.horizon, m.haze); F3(6, m.horSun, m.glow); F3(7, m.ground, m.amb * (x.amb ?? 1));
  F3(8, m.fogCol, m.fogD * (x.fog ?? 1)); F4(9, m.fogH, m.fogSun, m.mist, 0); F4(10, ...m.cloud); F3(11, m.clLit, m.clSpeed); F3(12, m.clDark, m.clScale);
  const wy = x.waterY ?? m.waterY; F4(13, wy, m.waveA * (x.wave ?? 1), m.sea, m.windR); F3(14, m.deep, m.foam); F3(15, m.scat, m.mirror); F3(16, m.wind, m.gust);
  const z = [0, 0, 0]; F3(17, x.l0 ? x.l0.pos : z, x.l0 ? x.l0.r : 1); F3(18, x.l0 ? x.l0.col : z, x.l0 ? x.l0.cone : 0); F3(19, x.l0 ? x.l0.dir : [0, -1, 0]); F3(20, x.l1 ? x.l1.pos : z, x.l1 ? x.l1.r : 1); F3(21, x.l1 ? x.l1.col : z, x.l1 ? (x.l1.k ?? 1) : 0);
  F3(22, x.flash || z, m.rain); F3(36, m.sand, m.sandWet); F4(42, x.film ?? m.film, x.top || 0, 0, 0); F3(43, m.rim);
  return { sunDir: m.sun, waterY: wy, mirror: 1, shafts: m.shafts, ao: m.ao, moon: m.moon, keyLamp: x.l0 && x.l0.key ? x.l0 : null, beam: x.beam || null, waveA: m.waveA * (x.wave ?? 1), rain: m.rain, wind: m.wind, gust: m.gust,
    grade: { exp: m.exp, contrast: m.contrast, sat: m.sat, split: m.split, gain: m.gain, lift: m.lift, black: m.black, white: m.white, tintS: m.tintS, tintH: m.tintH, bloom: m.bloom, ca: m.ca, vig: m.vig, hal: m.hal, grain: m.grain, veil: m.veil } };
}
