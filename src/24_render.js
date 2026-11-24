// ============================================================================
// 24_render.js - one frame: ripples, shadows, sky, mirror, picture, lens, lab.
// ============================================================================
const R = { w: 0, h: 0, scale: 1, list: [], time: 0, frame: 0, msaa: 4 };
// draw items: {prog:'RIG', mesh, M, row, hero, shadow, reflect, tint, n, spineN, windK, vis}
R.items = []; R.add = it => { it.M = it.M || M4.id(); it.tint = it.tint || [0, 0, 0, 0]; if (it.shadow === undefined) it.shadow = true; if (it.reflect === undefined) it.reflect = true; it.vis = it.vis === undefined ? true : it.vis; it.P = stdProg(it.v || '', it.hero); it.PS = STD[(it.v || '') + (it.hero ? 'H' : '') + 's']; R.items.push(it); return it; };
R.extra = [];           // functions (pass) => draw custom things after opaque: 'main' | 'refl'
// bone texture: one row per rig. 96 bones wide
const BONE_W = 64 * 3, BONE_H = 24, boneData = new Float32Array(BONE_W * BONE_H * 4); let boneTex, boneRows = 0;
const newRow = (k = 1) => { const r = boneRows; boneRows += k; return r; };
function setBone(row, k, m) { const o = (row * BONE_W + k * 3) * 4; boneData[o] = m[0]; boneData[o + 1] = m[4]; boneData[o + 2] = m[8]; boneData[o + 3] = m[12]; boneData[o + 4] = m[1]; boneData[o + 5] = m[5]; boneData[o + 6] = m[9]; boneData[o + 7] = m[13]; boneData[o + 8] = m[2]; boneData[o + 9] = m[6]; boneData[o + 10] = m[10]; boneData[o + 11] = m[14]; }
R.initTargets = (w, h) => {
  if (R.w === w && R.h === h && R.main) return; R.w = w; R.h = h;
  for (const k of ['main', 'res', 'skyT', 'refl', 'aoA', 'aoB', 'half', 'dofT', 'mbT', 'shaftT', 'airT', 'comp']) freeTarget(R[k]); (R.bl || []).forEach(freeTarget);
  if (R.ms === undefined) R.ms = msaaFor(drawable('rgba16f'), R.msaa); R.main = target(w, h, 'rgba16f', { msaa: R.ms, depth: 'rb' }); R.res = target(w, h, 'rgba16f', { depth: 'tex' });
  const h2 = [Math.ceil(w / 2), Math.ceil(h / 2)], h4 = [Math.ceil(w / 4), Math.ceil(h / 4)];
  R.skyT = target(h2[0], h2[1], 'rgba16f'); R.refl = target(Math.ceil(w * .5), Math.ceil(h * .5), 'rgba16f', { depth: 'rb', mips: false }); R.aoA = target(h2[0], h2[1], 'rg16f'); R.aoB = target(h2[0], h2[1], 'rg16f');
  R.half = target(h2[0], h2[1], 'rgba16f'); R.dofT = target(h2[0], h2[1], 'rgba16f'); R.mbT = target(w, h, 'rgba16f'); R.comp = target(w, h, 'rgba16f'); R.shaftT = target(h4[0], h4[1], 'rgba16f'); R.airT = target(h2[0], h2[1], 'rgba16f');
  R.bl = []; let bw = h2[0], bh = h2[1]; for (let i = 0; i < 6; i++) { R.bl.push(target(bw, bh, 'r11')); bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); }
};
R.init = () => {
  bakeNoise(); WATER.init();
  boneTex = tex2D(BONE_W, BONE_H, 'rgba32f', { filter: gl.NEAREST });
  R.sh = target(2048, 2048, null, { depth: 'tex' }); R.shF = target(1536, 1536, null, { depth: 'tex' });
  for (const S of [R.sh, R.shF]) { gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, S.depth); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); }
};
function setView(vp, view, cam, pass, near, far, tx, ty, w, h, pvp) { VW.set(vp, 0); VW.set(view, 16); W4(8, cam[0], cam[1], cam[2], pass); W4(9, near, far, tx, ty); VW.set(M4.inv(vp), 40); W4(14, w, h, 1 / w, 1 / h); W4(15, R.clipY || 0, 0, 0, 0); VW.set(pvp || vp, 64); pushView(); }
function drawItems(pass, shadow) {
  for (const it of R.items) { if (!it.vis || (shadow && !it.shadow) || (pass === 'refl' && !it.reflect) || (pass !== 'refl' && it.onlyRefl) || (it.only && it.only !== pass)) continue; const P = use(shadow ? it.PS : it.P); UM(P, 'uM', it.M); U1(P, 'uRow', it.row || 0); U4(P, 'uTint', it.tint); U1(P, 'uSpineN', it.spineN || 2); U1(P, 'uWindK', it.windK ?? 1); const n = it.n !== undefined ? it.n : undefined; draw(it.mesh, pass === 'refl' && it.nRefl ? it.nRefl : n); }
}
// cam: {pos, look, up, fov(vertical, rad), near, far, focus, ap (aperture in frame heights), maxCoc}
R.render = (cam, env, o = {}) => {
  const w = R.w, h = R.h, asp = w / h;
  gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.colorMask(true, true, true, true);
  bindGlobals();
  gl.activeTexture(gl.TEXTURE0 + UNIT.tBone); gl.bindTexture(gl.TEXTURE_2D, boneTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BONE_W, BONE_H, gl.RGBA, gl.FLOAT, boneData);
  F4(0, R.time, o.dt || 1 / 60, R.frame, h / 1080); R.frame++;
  // ---- key shadow
  const hero = env.hero, kp = env.keyLamp; let smN;
  if (kp) { const l = kp.pos, d = V.dist(l, hero), f = Math.atan2(env.shR || 1.8, d) * 2; const P = M4.persp(f, 1, Math.max(.5, d - 3.5), d + 5), v = M4.look(l, hero, Math.abs(V.norm(V.sub(hero, l))[1]) > .95 ? [1, 0, 0] : [0, 1, 0]); smN = M4.mul(P, v); }
  else { const r = env.shR || 2.2, e = V.mad(hero, env.sunDir, 30), v = M4.look(e, hero, [0, 1, .01]); smN = M4.mul(M4.ortho(-r, r, -r, r, 1, 60), v); }
  const rF = env.shRF || 30, eF = V.mad(hero, env.sunDir, 160), smF = M4.mul(M4.ortho(-rF, rF, -rF, rF, 1, 320), M4.look(eF, hero, [0, 1, .01]));
  FR.set(smN, 24 * 4); FR.set(smF, 28 * 4); F4(32, (env.shSoft || 2.2) / 2048, kp ? .0009 : .00045, kp ? .006 : .008, 1.6 / 1536); F4(40, kp ? 1 : 0, 0, 0, 0);
  pushFrame();
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 2.5);
  bindTarget(R.sh); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); bindTex('tShadow', null); bindTex('tShadowFar', null); setView(smN, M4.id(), cam.pos, 2, .1, 100, 1, 1, 2048, 2048); drawItems('shadow', true);
  bindTarget(R.shF); gl.clear(gl.DEPTH_BUFFER_BIT); if (!kp) { setView(smF, M4.id(), cam.pos, 2, .1, 100, 1, 1, 1536, 1536); drawItems('shadowFar', true); }
  gl.disable(gl.POLYGON_OFFSET_FILL); bindTex('tShadow', R.sh.depth); bindTex('tShadowFar', R.shF.depth);
  // ---- camera
  const near = cam.near || .05, far = cam.far || 4000, ty = Math.tan(cam.fov / 2), tx = ty * asp, P = M4.persp(cam.fov, asp, near, far), Vm = M4.look(cam.pos, cam.look, cam.up || [0, 1, 0]), VP = M4.mul(P, Vm);
  const pvp = (R.prevVP && !o.cut) ? R.prevVP : VP; R.prevVP = VP; R.VP = VP;
  const hd = (R.prevHero && !o.cut) ? V.sub(env.heroBase, R.prevHero) : [0, 0, 0]; R.prevHero = env.heroBase; F4(41, hd[0], hd[1], hd[2], 0); pushFrame();
  // ---- sky
  setView(VP, Vm, cam.pos, 0, near, far, tx, ty, R.skyT.w, R.skyT.h, pvp);
  gl.disable(gl.DEPTH_TEST); bindTarget(R.skyT); let S = use(SKY.prog); U1(S, 'uN', o.cloudN || 34); U4(S, 'uMoon', env.moon || [0, 1, 0, 0]); tri();
  // ---- mirror
  const wy = env.waterY; R.clipY = wy - .01; const mir = p => [p[0], 2 * wy - p[1], p[2]]; const rp = mir(cam.pos), rl = mir(cam.look), ru = [(cam.up || [0, 1, 0])[0], -(cam.up || [0, 1, 0])[1], (cam.up || [0, 1, 0])[2]];
  if (env.mirror > 0) {
    // reflected view: mirror the world about y = wy and keep the same camera, so screen uv line up
    const Mr = M4.id(); Mr[5] = -1; Mr[13] = 2 * wy; const Vr = M4.mul(Vm, Mr), VPr = M4.mul(P, Vr);
    setView(VPr, Vr, rp, 1, near, far, tx, ty, R.refl.w, R.refl.h, VPr); bindTarget(R.refl); gl.disable(gl.DEPTH_TEST); bindTex('tRefl', null);
    S = use(SKY.prog); U1(S, 'uN', 18); U4(S, 'uMoon', env.moon || [0, 1, 0, 0]); tri();
    gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT); drawItems('refl', false); for (const f of R.extra) f('refl');
  }
  // ---- picture
  setView(VP, Vm, cam.pos, 0, near, far, tx, ty, w, h, pvp);
  bindTex('tRefl', R.refl.tex); bindTex('tSky', R.skyT.tex); bindTarget(R.main); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawItems('main', false);
  S = use(WATER.prog); U2(S, 'uC', cam.pos[0], cam.pos[2]); draw(WATER.mesh);
  gl.depthFunc(gl.LEQUAL); use(SKY.comp); gl.depthMask(false); tri(); gl.depthMask(true);
  for (const f of R.extra) f('main');
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.main.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.res.fbo); gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  // ---- lens
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); bindTex('tDepth', R.res.depth);
  S = use(POST.ao); bindTarget(R.aoA); tri(); S = use(POST.aoBlur); bindTarget(R.aoB); bindTex('tA', R.aoA.tex); U2(S, 'uDir', 1, 0); tri(); bindTarget(R.aoA); bindTex('tA', R.aoB.tex); U2(S, 'uDir', 0, 1); tri();
  // ao + air into comp
  if (env.beam) { S = use(POST.air); bindTarget(R.airT); U4(S, 'uBm0', [...env.beam.pos, env.beam.gain]); U4(S, 'uBm1', [...env.beam.dir, env.beam.spread]); U4(S, 'uBm2', [...env.beam.col, env.beam.flare || 0]); tri(); }
  S = use(R.compP); bindTarget(R.comp); bindTex('tA', R.res.tex); bindTex('tB', R.aoA.tex); bindTex('tC', R.airT.tex); U2(S, 'uK', env.ao ?? .8, env.beam ? 1 : 0); tri();
  S = use(POST.mb); bindTarget(R.mbT); bindTex('tA', R.comp.tex); U1(S, 'uShut', o.still ? 0 : (o.shut ?? .5)); tri();
  const lens = [cam.focus || 6, cam.ap || .0, cam.maxCoc || .018, 0];
  S = use(POST.coc); bindTarget(R.half); bindTex('tA', R.mbT.tex); U4(S, 'uLens', lens); tri();
  S = use(POST.dof); bindTarget(R.dofT); bindTex('tA', R.half.tex); U4(S, 'uLens', lens); setView(VP, Vm, cam.pos, 0, near, far, tx, ty, R.dofT.w, R.dofT.h, pvp); tri();
  // bloom
  S = use(POST.down); let src = R.dofT.tex; R.bl.forEach((b, i) => { if (i === 0) return; bindTarget(b); bindTex('tA', i === 1 ? R.dofT.tex : R.bl[i - 1].tex); U1(S, 'uFirst', i === 1 ? 1 : 0); tri(); });
  S = use(POST.up); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); for (let i = R.bl.length - 1; i > 1; i--) { bindTarget(R.bl[i - 1]); bindTex('tA', R.bl[i].tex); U1(S, 'uR', 1.1); tri(); } gl.disable(gl.BLEND);
  // shafts
  const sp = M4.pt(VP, V.mad(cam.pos, env.sunDir, 1000)), sw = VP[3] * (cam.pos[0] + env.sunDir[0] * 1000) + VP[7] * (cam.pos[1] + env.sunDir[1] * 1000) + VP[11] * (cam.pos[2] + env.sunDir[2] * 1000) + VP[15]; let sv = 0, su = [0, 0]; if (sw > 0) { su = [sp[0] / sw * .5 + .5, sp[1] / sw * .5 + .5]; sv = env.shafts * (1 - smooth(.55, 1.3, Math.max(Math.abs(su[0] - .5), Math.abs(su[1] - .5)))); }
  S = use(POST.shaft); bindTarget(R.shaftT); if (sv > .001) { bindTex('tA', R.bl[1].tex); U4(S, 'uSunS', [su[0], su[1], 1, 0]); tri(); } else { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  // ---- lab
  setView(VP, Vm, cam.pos, 0, near, far, tx, ty, canvas.width, canvas.height, pvp);
  const g = env.grade; S = use(POST.final); bindTarget(null); bindTex('tA', R.mbT.tex); bindTex('tB', R.dofT.tex); bindTex('tC', R.bl[1].tex); bindTex('tD', R.shaftT.tex);
  U4(S, 'uLens', lens); U4(S, 'uGr0', [g.exp * (o.exp ?? 1), g.contrast, g.sat, g.split]); U4(S, 'uGr1', [...g.gain, 0]); U4(S, 'uGr2', [...g.lift, 0]); U4(S, 'uGr3', [g.black, g.white, 0, 0]); U3(S, 'uTintS', g.tintS); U3(S, 'uTintH', g.tintH);
  U4(S, 'uMatte', [o.matte || asp, o.matteR || 0, o.fade ?? 1, 0]); U4(S, 'uFx', [g.bloom / 5 * (1), sv, g.ca, g.vig]); U4(S, 'uFx2', [g.hal, g.grain, o.barCol || 0.0, g.veil || 0]); tri();
};
R.compP = program('aoComp', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform vec2 uK; void main(){ vec4 c=texture(tA,uv); float a=texture(tB,uv).r; c.rgb*=mix(vec3(1.),mix(vec3(a),pow(vec3(a),vec3(.80,.9,1.)),.6),uK.x); if(uK.y>.5) c.rgb+=texture(tC,uv).rgb; o=c; }`);
