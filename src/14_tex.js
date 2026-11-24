// ============================================================================
// 14_tex.js - baked textures: tiling noise, 3-D cloud noise, a wind-sea tile.
// ============================================================================
const VS_TRI = `out vec2 uv; void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); uv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const TEX = {};
function bakeNoise() {
  const P = finish(program('bakeNoise', VS_TRI, `in vec2 uv; out vec4 o;
float h(vec2 p,float n){ p=mod(p,n); return hash12(p+vec2(n*1.7,3.1)); }
vec2 gr(vec2 p,float n){ p=mod(p,n); float a=hash12(p+vec2(n*2.3,9.7))*6.2831853; return vec2(cos(a),sin(a)); }
float pn(vec2 p,float n){ vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.); return mix(mix(dot(gr(i,n),f),dot(gr(i+vec2(1,0),n),f-vec2(1,0)),u.x),mix(dot(gr(i+vec2(0,1),n),f-vec2(0,1)),dot(gr(i+vec2(1,1),n),f-vec2(1,1)),u.x),u.y); }
void main(){ float r=0.,g=0.,a=.5,n=6.; float b=pn(uv*4.,4.)*.7+pn(uv*9.,9.)*.35;
 for(int i=0;i<7;i++){ r+=a*pn(uv*n,n); float w=1.-abs(pn(uv*n+17.*0.,n)*1.6); g+=a*w*w; a*=.52; n*=2.; }
 o=vec4(sat(.5+r*.95),sat(g*.62),sat(.5+b*.75),hash12(floor(uv*512.)+.5)); }`));
  TEX.noise = tex2D(512, 512, 'rgba8', { wrap: gl.REPEAT, mips: true });
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, TEX.noise, 0); gl.viewport(0, 0, 512, 512); use(P); tri();
  gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, TEX.noise); gl.generateMipmap(gl.TEXTURE_2D);
  // 3-D
  const P3 = finish(program('bakeNoise3', VS_TRI, `in vec2 uv; uniform float uZ; out vec4 o;
vec3 h33(vec3 p,float n){ p=mod(p,n); p=fract(p*vec3(.1031,.1030,.0973)+n*.013); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
float wl(vec3 p,float n){ vec3 i=floor(p),f=fract(p); float d=9.; for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 c=vec3(x,y,z); vec3 r=c+h33(i+c,n)-f; d=min(d,dot(r,r)); } return 1.-sqrt(d); }
vec3 g3(vec3 p,float n){ return normalize(h33(p,n)*2.-1.+1e-4); }
float pn(vec3 p,float n){ vec3 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.); 
 #define G(x,y,z) dot(g3(i+vec3(x,y,z),n),f-vec3(x,y,z))
 return mix(mix(mix(G(0,0,0),G(1,0,0),u.x),mix(G(0,1,0),G(1,1,0),u.x),u.y),mix(mix(G(0,0,1),G(1,0,1),u.x),mix(G(0,1,1),G(1,1,1),u.x),u.y),u.z); }
void main(){ vec3 p=vec3(uv,uZ); float pf=0.,a=.5,n=4.; for(int i=0;i<4;i++){ pf+=a*pn(p*n,n); a*=.55; n*=2.; } pf=sat(.5+pf*.95);
 float w1=wl(p*4.,4.)*.6+wl(p*8.,8.)*.28+wl(p*16.,16.)*.14, w2=wl(p*6.,6.)*.5+wl(p*12.,12.)*.33+wl(p*24.,24.)*.17;
 float pw=sat(pf*.62+w1*.48-.06); o=vec4(pw,sat(w2),sat(w1),pf); }`));
  const S = 64; TEX.noise3 = gl.createTexture(); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_3D, TEX.noise3); gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, S, S, S);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);
  gl.viewport(0, 0, S, S); use(P3); for (let z = 0; z < S; z++) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, TEX.noise3, 0, z); U1(P3, 'uZ', (z + .5) / S); tri(); }
  gl.deleteFramebuffer(fb);
  // wind sea tile: inverse FFT of a directional spectrum, slope in rg, height in b, crest sharpness in a. Two time-shifted copies are scrolled apart.
  const n = 256, re = new Float64Array(n * n), im = new Float64Array(n * n), r = rng(77), L = 24;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const kx = TAU / L * (x < n / 2 ? x : x - n), ky = TAU / L * (y < n / 2 ? y : y - n), k = Math.hypot(kx, ky); if (k < 1e-6) continue; const c = kx / k, kp = .75; let P = Math.exp(-1 / Math.pow(k / kp, 2)) / Math.pow(k, 3.7) * (.12 + c * c) * Math.exp(-k * k * .0009); const A = Math.sqrt(P); re[y * n + x] = r.g() * A; im[y * n + x] = r.g() * A; }
  const fft1 = (R, I, o, s) => { for (let i = 0, j = 0; i < n; i++) { if (i < j) { let t = R[o + i * s]; R[o + i * s] = R[o + j * s]; R[o + j * s] = t; t = I[o + i * s]; I[o + i * s] = I[o + j * s]; I[o + j * s] = t; } let m = n >> 1; while (m >= 1 && j & m) { j ^= m; m >>= 1; } j |= m; } for (let len = 2; len <= n; len <<= 1) { const a = TAU / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k), p = o + (i + k) * s, q = o + (i + k + len / 2) * s, tr = R[q] * wr - I[q] * wi, ti = R[q] * wi + I[q] * wr; R[q] = R[p] - tr; I[q] = I[p] - ti; R[p] += tr; I[p] += ti; } } };
  for (let y = 0; y < n; y++) fft1(re, im, y * n, 1); for (let x = 0; x < n; x++) fft1(re, im, x, n);
  let sd = 0; for (let i = 0; i < n * n; i++) sd += re[i] * re[i]; sd = Math.sqrt(sd / (n * n)); const H = re.map(v => v / sd), d = new Uint8Array(n * n * 4), at = (x, y) => H[((y + n) % n) * n + (x + n) % n];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = (y * n + x) * 4, sx = (at(x + 1, y) - at(x - 1, y)) * .5, sy = (at(x, y + 1) - at(x, y - 1)) * .5, cr = -(at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1) - 4 * at(x, y)); d[o] = clamp(.5 + sx * .9) * 255; d[o + 1] = clamp(.5 + sy * .9) * 255; d[o + 2] = clamp(.5 + at(x, y) * .16) * 255; d[o + 3] = clamp(.5 + cr * 1.3) * 255; }
  TEX.wave = tex2D(n, n, 'rgba8', { data: d, wrap: gl.REPEAT, mips: true });
}
function bindGlobals() { bindTex('tNoise', TEX.noise); bindTex('tNoise3', TEX.noise3, gl.TEXTURE_3D); bindTex('tWave', TEX.wave); }
