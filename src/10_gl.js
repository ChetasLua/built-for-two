// ============================================================================
// 10_gl.js - a thin hand on WebGL2: programs, targets, textures, meshes, UBOs.
// ============================================================================
const canvas = document.getElementById('film');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
const oops = (what, detail) => { const L = document.getElementById('load'); if (!L) return; L.style.opacity = 1; L.style.background = '#14161a'; L.style.color = '#e8e2d4'; L.style.padding = '0 8vw'; L.style.textAlign = 'center'; L.textContent = what; if (detail) { const d = document.createElement('div'); d.style.cssText = 'margin-top:18px;font:12px ui-monospace,Menlo,monospace;opacity:.6;white-space:pre-wrap;max-width:900px'; d.textContent = String(detail).slice(0, 600); L.appendChild(d); L.style.alignContent = 'center'; } window.__oops = what + ' ' + (detail || ''); };
window.addEventListener('error', e => { if (window.__READY || window.__oops) return; oops('The film could not start in this viewer. Open the file in Chrome.', (e.message || '') + ' @' + e.lineno + '\n' + (e.error && e.error.stack || '')); });
if (!gl) { oops('This viewer has no WebGL2 (graphics acceleration). Open the file in Chrome with hardware acceleration on.'); throw new Error('no webgl2'); }
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); window.__lost = true; oops('The graphics card was taken away. Reloading.'); setTimeout(() => location.reload(), 1500); });
const RENDERER = (() => { try { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (x) { return ''; } })(), SOFTGL = /swiftshader|llvmpipe|software|basic render/i.test(RENDERER);
const CBF = !!gl.getExtension('EXT_color_buffer_float'), CBH = !!gl.getExtension('EXT_color_buffer_half_float'); gl.getExtension('OES_texture_float_linear');
const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

// ---------- per-frame and per-view uniform blocks ---------------------------
const FR = new Float32Array(96 * 4), VW = new Float32Array(24 * 4);
const uboF = gl.createBuffer(), uboV = gl.createBuffer();
gl.bindBuffer(gl.UNIFORM_BUFFER, uboF); gl.bufferData(gl.UNIFORM_BUFFER, FR.byteLength, gl.DYNAMIC_DRAW);
gl.bindBuffer(gl.UNIFORM_BUFFER, uboV); gl.bufferData(gl.UNIFORM_BUFFER, VW.byteLength, gl.DYNAMIC_DRAW);
gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, uboF); gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, uboV);
const F4 = (i, x = 0, y = 0, z = 0, w = 0) => { const o = i * 4; FR[o] = x; FR[o + 1] = y; FR[o + 2] = z; FR[o + 3] = w; };
const F3 = (i, v, w = 0) => F4(i, v[0], v[1], v[2], w);
const W4 = (i, x = 0, y = 0, z = 0, w = 0) => { const o = i * 4; VW[o] = x; VW[o + 1] = y; VW[o + 2] = z; VW[o + 3] = w; };
const pushFrame = () => { gl.bindBuffer(gl.UNIFORM_BUFFER, uboF); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, FR); };
const pushView = () => { gl.bindBuffer(gl.UNIFORM_BUFFER, uboV); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, VW); };

// ---------- texture units (one sampler name = one unit, forever) ------------
const UNITS = ['tNoise', 'tNoise3', 'tShadow', 'tShadowFar', 'tRefl', 'tSky', 'tRipple', 'tBone', 'tWave', 'tMark', 'tA', 'tB', 'tC', 'tD', 'tDepth', 'tShadowRaw'];
const UNIT = {}; UNITS.forEach((n, i) => UNIT[n] = i);
const bindTex = (name, tex, target = gl.TEXTURE_2D) => { gl.activeTexture(gl.TEXTURE0 + UNIT[name]); gl.bindTexture(target, tex); };

// ---------- programs --------------------------------------------------------
const PROGS = new Set(); let curProg = null;
function program(name, vs, fs, defs = {}) {
  const head = '#version 300 es\n' + Object.entries(defs).map(([k, v]) => `#define ${k} ${v === true ? 1 : v}`).join('\n') + '\n';
  const P = { name, prog: gl.createProgram(), u: {}, ready: false, src: [head + GLSL_HEAD + vs, head + GLSL_HEAD + fs] };
  P.sh = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((t, i) => { const s = gl.createShader(t); gl.shaderSource(s, P.src[i]); gl.compileShader(s); gl.attachShader(P.prog, s); return s; });
  ['aPos', 'aNrm', 'aCol', 'aMat', 'aBone', 'aI0', 'aI1', 'aI2', 'aI3', 'aI4', 'aUV'].forEach((n, i) => gl.bindAttribLocation(P.prog, i, n));
  gl.linkProgram(P.prog); PROGS.add(P); return P;
}
function finish(P) {
  if (P.ready) return P;
  if (!gl.getProgramParameter(P.prog, gl.LINK_STATUS)) {
    P.sh.forEach((s, i) => { const log = gl.getShaderInfoLog(s); if (log) { const m = /ERROR: \d+:(\d+)/.exec(log); const L = P.src[i].split('\n'); console.error('SHADER ' + P.name + ' ' + (i ? 'FS' : 'VS') + '\n' + log.slice(0, 600) + (m ? '\n> ' + L.slice(Math.max(0, m[1] - 3), +m[1] + 1).join('\n> ') : '')); } });
    throw new Error('BOOT link ' + P.name + ' ' + gl.getProgramInfoLog(P.prog));
  }
  const n = gl.getProgramParameter(P.prog, gl.ACTIVE_UNIFORMS);
  gl.useProgram(P.prog); curProg = P;
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(P.prog, i), nm = a.name.replace('[0]', ''); const loc = gl.getUniformLocation(P.prog, a.name); if (!loc) continue; if (nm in UNIT) gl.uniform1i(loc, UNIT[nm]); else P.u[nm] = loc; }
  ['Frame', 'View'].forEach((b, i) => { const x = gl.getUniformBlockIndex(P.prog, b); if (x !== gl.INVALID_INDEX) gl.uniformBlockBinding(P.prog, x, i); });
  P.ready = true; return P;
}
const use = P => { if (!P.ready) finish(P); if (curProg !== P) { gl.useProgram(P.prog); curProg = P; } return P; };
const U1 = (P, n, x) => { if (P.u[n]) gl.uniform1f(P.u[n], x); }, U2 = (P, n, x, y) => { if (P.u[n]) gl.uniform2f(P.u[n], x, y); }, U3 = (P, n, v) => { if (P.u[n]) gl.uniform3f(P.u[n], v[0], v[1], v[2]); }, U4 = (P, n, v) => { if (P.u[n]) gl.uniform4f(P.u[n], v[0], v[1], v[2], v[3]); }, UM = (P, n, m) => { if (P.u[n]) gl.uniformMatrix4fv(P.u[n], false, m); };

// ---------- textures and targets --------------------------------------------
const FMT = { rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT], rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], rg16f: [gl.RG16F, gl.RG, gl.HALF_FLOAT], r16f: [gl.R16F, gl.RED, gl.HALF_FLOAT], r8: [gl.R8, gl.RED, gl.UNSIGNED_BYTE], r11: [gl.R11F_G11F_B10F, gl.RGB, gl.HALF_FLOAT], rgba32f: [gl.RGBA32F, gl.RGBA, gl.FLOAT], d24: [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT] };
function tex2D(w, h, fmt, { data = null, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, mips = false } = {}) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + 15); gl.bindTexture(gl.TEXTURE_2D, t);
  const [i, f, ty] = FMT[fmt]; gl.texImage2D(gl.TEXTURE_2D, 0, i, w, h, 0, f, ty, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mips) { gl.generateMipmap(gl.TEXTURE_2D); if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8); }
  return t;
}
// some viewers cannot draw into every format: fall back along a chain, once
const FBK = { r11: 'rgba16f', rg16f: 'rgba16f', rgba16f: 'rgba8' }, FOK = {};
function canDraw(fmt) { if (fmt in FOK) return FOK[fmt]; if (window.__nofmt && window.__nofmt.includes(fmt)) return FOK[fmt] = false; const t = tex2D(4, 4, fmt), f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.deleteFramebuffer(f); gl.deleteTexture(t); if (!ok) console.warn('no drawing into ' + fmt); return FOK[fmt] = ok; }
const drawable = fmt => { let f = fmt; while (f && !canDraw(f) && FBK[f]) f = FBK[f]; return f; };
function msaaFor(fmt, want) { try { const s = gl.getInternalformatParameter(gl.RENDERBUFFER, FMT[fmt][0], gl.SAMPLES), d = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES); const mx = Math.min(s && s.length ? s[0] : 0, d && d.length ? d[0] : 0); return Math.min(want, mx); } catch (e) { return 0; } }
// target: {w,h,fbo,tex,depth}. opts: depth:'tex'|'rb'|false, msaa
function target(w, h, fmt, o = {}) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0); if (fmt) fmt = drawable(fmt);
  const R = { w, h, fbo: gl.createFramebuffer() }; gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo);
  if (fmt) {
    if (o.msaa) { R.rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, R.rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, o.msaa, FMT[fmt][0], w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, R.rb); }
    else { R.tex = tex2D(w, h, fmt, o); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R.tex, 0); }
  } else { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
  if (o.depth === 'tex') { R.depth = tex2D(w, h, 'd24', { filter: gl.NEAREST }); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, R.depth, 0); }
  else if (o.depth) { R.drb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, R.drb); if (o.msaa) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, o.msaa, gl.DEPTH_COMPONENT24, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, R.drb); }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('BOOT fbo incomplete ' + fmt + ' ' + st);
  return R;
}
function freeTarget(R) { if (!R) return; gl.deleteFramebuffer(R.fbo); if (R.tex) gl.deleteTexture(R.tex); if (R.depth) gl.deleteTexture(R.depth); if (R.rb) gl.deleteRenderbuffer(R.rb); if (R.drb) gl.deleteRenderbuffer(R.drb); }
const bindTarget = R => { gl.bindFramebuffer(gl.FRAMEBUFFER, R ? R.fbo : null); gl.viewport(0, 0, R ? R.w : canvas.width, R ? R.h : canvas.height); };
const emptyVAO = gl.createVertexArray();
const tri = () => { gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); };

// ---------- meshes ----------------------------------------------------------
// static vertex: pos 3f, nrm 3f, col 4ub (albedo, ao), mat 4ub (rough, metal, trans, id), bone 4ub (b0, b1, w1, free), uv 2f  = 44 bytes
const STRIDE = 44;
class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.m = []; this.b = []; this.u = []; this.i = []; this.col = [1, 1, 1]; this.ao = 1; this.mat = [.6, 0, 0, 0]; this.bone = [0, 0, 0, 0]; this.X = null; }
  set(col, rough = .6, id = 0, metal = 0, trans = 0) { this.col = col; this.mat = [rough, metal, trans, id]; return this; }
  v(p, n, u = [0, 0], ao = 1) { if (this.X) { p = M4.pt(this.X, p); n = V.norm(M4.dir(this.X, n)); } this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); const c = typeof this.col === 'function' ? this.col(p, n, u) : this.col; this.c.push(c[0], c[1], c[2], ao * this.ao); const m = this.mat; this.m.push(m[0], m[1], m[2], m[3]); const b = typeof this.bone === 'function' ? this.bone(p, u) : this.bone; this.b.push(b[0], b[1] || 0, b[2] || 0, b[3] || 0); this.u.push(u[0], u[1]); return this.p.length / 3 - 1; }
  t(a, b, c) { this.i.push(a, b, c); } q(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  get count() { return this.p.length / 3; }
  pack() {
    const n = this.count, buf = new ArrayBuffer(n * STRIDE), f = new Float32Array(buf), u8 = new Uint8Array(buf);
    const g = x => Math.round(clamp(Math.sqrt(clamp(x))) * 255), l = x => Math.round(clamp(x) * 255);
    for (let k = 0; k < n; k++) { const o = k * 11, y = k * STRIDE;
      for (let j = 0; j < 3; j++) { f[o + j] = this.p[k * 3 + j]; f[o + 3 + j] = this.n[k * 3 + j]; u8[y + 24 + j] = g(this.c[k * 4 + j]); }   // albedo stored as sqrt(linear)
      u8[y + 27] = l(this.c[k * 4 + 3]); u8[y + 28] = l(this.m[k * 4]); u8[y + 29] = l(this.m[k * 4 + 1]); u8[y + 30] = l(this.m[k * 4 + 2]); u8[y + 31] = this.m[k * 4 + 3];
      u8[y + 32] = this.b[k * 4]; u8[y + 33] = this.b[k * 4 + 1]; u8[y + 34] = l(this.b[k * 4 + 2]); u8[y + 35] = l(this.b[k * 4 + 3]); f[o + 9] = this.u[k * 2]; f[o + 10] = this.u[k * 2 + 1]; }
    return buf;
  }
}
function attrs(vbo) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const A = (l, n, t, nz, o, int) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, t, nz, STRIDE, o); };
  A(0, 3, gl.FLOAT, false, 0); A(1, 3, gl.FLOAT, false, 12); A(2, 4, gl.UNSIGNED_BYTE, true, 24); A(3, 4, gl.UNSIGNED_BYTE, true, 28); A(4, 4, gl.UNSIGNED_BYTE, false, 32); A(10, 2, gl.FLOAT, false, 36);
}
// inst: {data: Float32Array, n: floats per instance (multiple of 4, up to 20), dynamic}
function mesh(geo, { inst = null, dynamic = false } = {}) {
  const R = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), ibo: gl.createBuffer(), count: geo.i.length, inst: 0 };
  gl.bindVertexArray(R.vao); gl.bindBuffer(gl.ARRAY_BUFFER, R.vbo); gl.bufferData(gl.ARRAY_BUFFER, geo.pack(), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); attrs(R.vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.ibo); R.u32 = geo.count > 65535; gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, R.u32 ? new Uint32Array(geo.i) : new Uint16Array(geo.i), gl.STATIC_DRAW);
  if (inst) addInst(R, inst);
  gl.bindVertexArray(null); return R;
}
function addInst(R, { data, n, dynamic = false }) {
  R.ivbo = gl.createBuffer(); gl.bindVertexArray(R.vao); gl.bindBuffer(gl.ARRAY_BUFFER, R.ivbo); gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  for (let k = 0; k < n / 4; k++) { gl.enableVertexAttribArray(5 + k); gl.vertexAttribPointer(5 + k, 4, gl.FLOAT, false, n * 4, k * 16); gl.vertexAttribDivisor(5 + k, 1); }
  R.inst = data.length / n; R.stride = n;
}
const updInst = (R, data, count) => { gl.bindBuffer(gl.ARRAY_BUFFER, R.ivbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); if (count !== undefined) R.inst = count; };
function draw(R, n) { gl.bindVertexArray(R.vao); const t = R.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; if (R.ivbo) { const k = n ?? R.inst; if (k > 0) gl.drawElementsInstanced(gl.TRIANGLES, R.count, t, 0, k); } else gl.drawElements(gl.TRIANGLES, R.count, t, 0); }
