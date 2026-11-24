// ============================================================================
// 60_fx.js - everything wet and airborne: ballistic droplets, splash crowns,
// spray sheets, rain with ground rings, breath mist, lens rain, petals, motes.
// Particles are closed-form in time, so the film can be scrubbed.
// ============================================================================
const FX = {};
FX.MAX = 5200;
FX.prog = program('fx', `layout(location=0) in vec3 aPos; layout(location=5) in vec4 aI0; layout(location=6) in vec4 aI1; layout(location=7) in vec4 aI2; out vec2 vP; out vec4 vCol; out vec3 vW; flat out float vKind; out float vZ;
void main(){ // aI0 = pos, size ; aI1 = velocity (streak), kind ; aI2 = rgba
 vec3 f=normalize(aI0.xyz-uCam); vec3 vel=aI1.xyz; float l=length(vel); vec3 up=vec3(uViewM[0][1],uViewM[1][1],uViewM[2][1]), rt=vec3(uViewM[0][0],uViewM[1][0],uViewM[2][0]); float st=0.;
 if(l>.0001){ vec3 s=vel-f*dot(vel,f); float sl=length(s); if(sl>1e-5){ up=s/sl; rt=normalize(cross(up,f)); st=sl*.5; } }
 vec2 c=aPos.xy; vP=c; vKind=aI1.w; vCol=aI2; vec3 w=aI0.xyz+rt*c.x*aI0.w+up*(c.y*(aI0.w+st)); vW=w; gl_Position=uVP*vec4(w,1.); vZ=gl_Position.w; }`,
`in vec2 vP; in vec4 vCol; in vec3 vW; flat in float vKind; in float vZ; layout(location=0) out vec4 o;
void main(){ float r=length(vP); float a=0.; vec3 c=vCol.rgb; vec3 rd=normalize(vW-uCam); int k=int(vKind+.5);
 if(k==0){ // droplet: a small lens, dark rim, bright glint, sky upside down
  if(r>1.) discard; float z=sqrt(1.-r*r); vec3 rt=vec3(uViewM[0][0],uViewM[1][0],uViewM[2][0]), up=vec3(uViewM[0][1],uViewM[1][1],uViewM[2][1]), bk=vec3(uViewM[0][2],uViewM[1][2],uViewM[2][2]); vec3 N=normalize(rt*vP.x+up*vP.y+bk*z); vec3 L=keyDir(vW); vec3 refr=skySpec(normalize(refract(rd,N,.75)),.1); vec3 refl=skySpec(reflect(rd,N),.05); float fr=.04+.96*pow(1.-z,4.); c=mix(refr*.85,refl,fr)+keyCol(vW)*(pow(max(dot(reflect(rd,N),L),0.),90.)*1.6+pow(max(dot(rd,L),0.),8.)*.10*smoothstep(1.,.3,r)); c*=vCol.rgb; a=vCol.a*smoothstep(1.,.85,r); }
 else if(k==1){ // spray / mist puff
  float n=texture(tNoise,vP*.16+vCol.xy*3.+uTime*.02).r; float d=smoothstep(1.,.0,r+ (n-.5)*.9); a=vCol.a*d*d; vec3 L=keyDir(vW); float ph=.35+1.6*pow(max(dot(rd,L),0.),5.); c=vCol.rgb*(ambientL(vec3(0,1,0))*1.9+keyCol(vW)*ph*.6+uFlash*.6); }
 else if(k==2){ // rain streak
  float x=abs(vP.x), y=abs(vP.y); a=vCol.a*smoothstep(1.,.2,x)*smoothstep(1.,.4,y); c=vCol.rgb*(ambientL(vec3(0,1,0))*1.7+uFlash+keyCol(vW)*.8); }
 else if(k==3){ // emissive glow
  a=vCol.a*exp(-r*r*4.); }
 else if(k==4){ // petal
  float bend=vP.y*vP.y*.35; vec2 q=vec2((vP.x+bend)*2.7/(.35+.65*smoothstep(-1.,.4,vP.y)),vP.y); if(length(q)>1.) discard; float sh4=smoothstep(.10,.0,abs(vP.x+bend)); a=vCol.a*(.75+.25*sh4); c=vCol.rgb*(ambientL(vec3(0,1,0))+keyCol(vW)*.45)*(.85+.25*sh4+.10*sin((vP.y-abs(vP.x))*40.)); }
 else if(k==5){ // foam fleck, matte
  if(r>1.) discard; a=vCol.a*smoothstep(1.,.5,r); c=vCol.rgb*(ambientL(vec3(0,1,0))*1.0+keyCol(vW)*.4); }
 if(k!=3) c=mix(c,airColor(rd),fogAmt(vW)); a*=smoothstep(.06,.35,vZ);
 o=vec4(c*a,k==3?0.:a*1.); }`);
FX.init = () => { const g = new Geo(); for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.v([x, y, 0], [0, 0, 1]); g.q(0, 1, 2, 3); FX.data = new Float32Array(FX.MAX * 12); FX.mesh = mesh(g, { inst: { data: FX.data, n: 12, dynamic: true } }); FX.n = 0; R.extra.push(pass => FX.draw(pass)); };
FX.begin = () => { FX.n = 0; };
FX.put = (p, size, v, kind, c, a) => { if (FX.n >= FX.MAX) return; const o = FX.n++ * 12, d = FX.data; d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = size; d[o + 4] = v[0]; d[o + 5] = v[1]; d[o + 6] = v[2]; d[o + 7] = kind; d[o + 8] = c[0]; d[o + 9] = c[1]; d[o + 10] = c[2]; d[o + 11] = a; };
FX.draw = pass => { if (!FX.n) return; gl.bindBuffer(gl.ARRAY_BUFFER, FX.mesh.ivbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FX.data.subarray(0, FX.n * 12)); use(FX.prog); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); gl.depthMask(false); draw(FX.mesh, FX.n); gl.depthMask(true); gl.disable(gl.BLEND); };
// ---- wheel spray: each wheel throws droplets and a thin sheet, closed form: emitted every 1/R s along the path
// pathX(t) gives the contact's world x; k = strength
FX.wheel = (t, contactAt, speedAt, side, k, seed, waterY) => {
  const rate = 70, life = .62, n0 = Math.floor((t - life) * rate), n1 = Math.floor(t * rate); for (let i = n0; i <= n1; i++) { const te = i / rate, a = t - te; if (a < 0 || a > life) continue; const h = j => hash3(i, seed, j); const v = speedAt(te); if (v < .25) continue; const s = Math.min(1.6, v / 2.8) * k; const c = contactAt(te); if (!c || c.dry) continue; const back = -v * (.15 + .55 * h(1)) * s, upv = (.5 + 1.75 * h(2) * h(2) + .5 * h(8)) * s, lat = (h(3) - .5) * 1.5 * s; const x = c[0] + (v * .55 + back) * a, y = c[1] + upv * a - 4.9 * a * a, z = c[2] + lat * a + (h(4) - .5) * .03; if (y < (waterY ?? c[1]) - .01) continue; FX.put([x, y, z], .0022 + .0052 * h(5) * h(5), [(v * .55 + back) * .010, (upv - 9.8 * a) * .010, lat * .010], 0, [1, 1, 1], .95); }
};
// ---- a splash crown at (x,z) born at t0
FX.crown = (t, t0, p, k, seed, n = 46) => { const a = t - t0; if (a < 0 || a > 1.1 * Math.sqrt(k) + .3) return; for (let i = 0; i < n; i++) { const h = j => hash3(i, seed, j); const an = h(0) * TAU, v = (.5 + 1.1 * h(1)) * k, up = (1.2 + 1.9 * h(2)) * k; const y = p[1] + up * a - 4.9 * a * a; if (y < p[1] - .01) continue; FX.put([p[0] + Math.cos(an) * (.03 + v * a), y, p[2] + Math.sin(an) * (.03 + v * a)], (.0025 + .007 * h(3) * h(3)) * Math.sqrt(k), [Math.cos(an) * v * .012, (up - 9.8 * a) * .012, Math.sin(an) * v * .012], 0, [1, 1, 1], .95); } for (let i = 0; i < 7; i++) { const h = j => hash3(i + 90, seed, j); const g = a * (1.2 + h(0)); FX.put([p[0] + (h(1) - .5) * .3 * k * (1 + g), p[1] + .10 * k + .35 * k * g - .3 * g * g, p[2] + (h(2) - .5) * .3 * k * (1 + g)], (.10 + .26 * g) * k, [0, 0, 0], 1, [.95, .97, 1], .16 * Math.exp(-a * 4)); } };
// ---- rain in a box that travels with the camera (wraps), density 0..1
FX.rain = (t, cam, wind, k) => { if (k < .01) return; const n = Math.floor(2100 * k), B = [13, 8, 13], vy = -9.2; for (let i = 0; i < n; i++) { const h = j => hash3(i, 771, j); const vx = wind[0] * 2.1 + (h(5) - .5), vz = wind[2] * 2.1 + (h(6) - .5); let x = h(0) * B[0] + vx * t, y = h(1) * B[1] + vy * t * (.85 + .3 * h(3)), z = h(2) * B[2] + vz * t; x = ((x - cam[0]) % B[0] + B[0]) % B[0] + cam[0] - B[0] / 2; y = ((y - cam[1]) % B[1] + B[1]) % B[1] + cam[1] - B[1] / 2; z = ((z - cam[2]) % B[2] + B[2]) % B[2] + cam[2] - B[2] / 2; if (y < -.2) continue; FX.put([x, y, z], .0042, [vx * .030, vy * .030, vz * .030], 2, [.80, .86, .88], .46 * (.4 + .6 * h(4))); } };
// ---- water thrown up where a wave meets the causeway: puffs + drops, born at t0 at (x, y, z) leaning along dir
FX.burst = (t, t0, p, dir, k, seed) => { const a = t - t0, L = 1.9; if (a < 0 || a > L) return; for (let i = 0; i < 70; i++) { const h = j => hash3(i, seed, j); const sp = 1.6 * k; const vx = (h(0) - .5) * 2.6 * sp + dir[0] * sp * (.6 + h(6)), vy = (1.6 + 3.4 * h(1)) * Math.sqrt(k) * 1.2, vz = (h(2) - .5) * 1.6 * sp + dir[2] * sp * (.6 + h(7)); const dl = h(5) * .15, b = a - dl; if (b < 0) continue; const y = p[1] + vy * b - 4.9 * b * b; if (y < p[1] - .4) continue; FX.put([p[0] + (h(3) - .5) * 1.6 * k + vx * b, y, p[2] + vz * b], (.004 + .014 * h(4) * h(4)), [vx * .016, (vy - 9.8 * b) * .016, vz * .016], 0, [1, 1, 1], .9); } for (let i = 0; i < 26; i++) { const h = j => hash3(i + 300, seed, j); const b = a - h(5) * .2; if (b < 0) continue; const vy = (1.0 + 2.4 * h(1)) * Math.sqrt(k) * 1.15, dr = 1 - Math.exp(-b * 1.6); FX.put([p[0] + (h(3) - .5) * 1.8 * k + ((h(0) - .5) * 1.4 + dir[0] * 1.6) * dr * k, p[1] + vy * b * .9 - 3.2 * b * b * .8, p[2] + ((h(2) - .5) * 1.2 + dir[2] * 1.6) * dr * k], (.14 + .46 * b) * k, [0, 0, 0], 1, [.95, 1.0, 1.0], .62 * Math.exp(-b * 1.9) * smooth(0, .08, b)); } };
// ---- slow motes / sea mist drifting near the lens
FX.motes = (t, cam, k, col = [1, .85, .6]) => { if (k < .01) return; for (let i = 0; i < 90; i++) { const h = j => hash3(i, 55, j), B = [9, 3.2, 9]; let x = h(0) * B[0] + t * (.08 + .1 * h(3)) * -1, y = h(1) * B[1] + .12 * Math.sin(t * .5 + i), z = h(2) * B[2] + .15 * Math.sin(t * .31 + i * 2.1); x = ((x - cam[0]) % B[0] + B[0]) % B[0] + cam[0] - B[0] / 2; z = ((z - cam[2]) % B[2] + B[2]) % B[2] + cam[2] - B[2] / 2; FX.put([x, y * .9 + .05, z], .0035 + .004 * h(4), [0, 0, 0], 3, col, .5 * k * (.4 + .6 * Math.sin(t * (1 + 2 * h(5)) + i) ** 2)); } };
