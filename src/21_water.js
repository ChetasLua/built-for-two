// ============================================================================
// 21_water.js - the tidal flat. One radial sheet that is wet sand, a centimetre
// of mirror, or a storm sea, plus a live ripple field that wheels, feet, rain
// and the viewer's finger all write into.
// ============================================================================
const WATER = { size: 22, n: 512, c: .85 };
WATER.step = program('ripStep', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform vec2 uOff; uniform float uK,uDamp; uniform vec4 uSrc[24]; uniform int uNS; uniform float uRainAmt,uSeed;
void main(){ vec2 t=1./vec2(textureSize(tA,0)); vec2 p=uv+uOff; bool inb=all(greaterThan(p,vec2(0.)))&&all(lessThan(p,vec2(1.)));
 vec2 c=inb?texture(tA,p).rg:vec2(0.); float l=texture(tA,p-vec2(t.x,0)).r,r=texture(tA,p+vec2(t.x,0)).r,d=texture(tA,p-vec2(0,t.y)).r,u=texture(tA,p+vec2(0,t.y)).r; if(!inb){ l=r=d=u=0.; }
 float lap=l+r+d+u-4.*c.r; float v=c.g+lap*uK; v*=uDamp; float h=c.r+v;
 vec2 w=uRip.xy+(uv-.5)*uRip.z;
 for(int i=0;i<uNS;i++){ vec2 e=(w-uSrc[i].xy)/uSrc[i].z; h+=uSrc[i].w*(1.-dot(e,e)*.5)*exp(-dot(e,e)); }
 if(uRainAmt>0.){ for(int k=0;k<2;k++){ vec2 g=floor(w*3.2+float(k)*17.3); vec2 f=fract(w*3.2+float(k)*17.3)-.5; vec2 hh=hash22(g+uSeed*7.13+float(k)); if(hash12(g+uSeed*3.7+float(k)*5.)<uRainAmt*.02){ vec2 e=(f-(hh-.5)*.7)/.09; h-=.0030*exp(-dot(e,e)); } } }
 vec2 ed=min(uv,1.-uv); float m=smoothstep(0.,.06,min(ed.x,ed.y)); o=vec4(h*m,v*m,0.,0.); }`);
WATER.init = () => { const mk = () => target(WATER.n, WATER.n, 'rg16f', { filter: gl.LINEAR }); WATER.a = mk(); WATER.b = mk(); for (const R of [WATER.a, WATER.b]) { bindTarget(R); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  // radial sheet: dense near the eye's target, reaching the horizon
  const A = 220, R = 170, g = new Geo(); const P = []; for (let r = 0; r <= R; r++) { const u = r / R, rad = .02 + 3.2 * u + 26 * Math.pow(u, 3.2) + 2600 * Math.pow(u, 11); for (let a = 0; a < A; a++) { const th = a / A * TAU; g.v([Math.cos(th) * rad, 0, Math.sin(th) * rad], [0, 1, 0], [rad, th]); } }
  for (let r = 0; r < R; r++) for (let a = 0; a < A; a++) { const b = (a + 1) % A; g.q(r * A + a, r * A + b, (r + 1) * A + b, (r + 1) * A + a); } WATER.mesh = mesh(g); };
WATER.cx = 0; WATER.cz = 0; WATER.src = []; WATER.center = [0, 0];
WATER.clear = () => { for (const R of [WATER.a, WATER.b]) { bindTarget(R); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } };
// drop(x, z, radius, height): queue a push on the surface
WATER.drop = (x, z, r, h) => { if (WATER.src.length < 48) WATER.src.push([x, z, r, h]); };
WATER.sim = (cx, cz, steps, rain, seed) => {
  const tx = WATER.size / WATER.n, nx = Math.round(cx / tx) * tx, nz = Math.round(cz / tx) * tx; let ox = (nx - WATER.center[0]) / WATER.size, oz = (nz - WATER.center[1]) / WATER.size; if (Math.abs(ox) > .9 || Math.abs(oz) > .9) { WATER.clear(); ox = oz = 0; }
  WATER.center = [nx, nz]; F4(23, nx, nz, WATER.size, 1 / WATER.size); pushFrame();
  const P = use(WATER.step), dt = 1 / 120, k = Math.pow(WATER.c * dt / tx, 2);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  for (let s = 0; s < steps; s++) {
    bindTarget(WATER.b); bindTex('tA', WATER.a.tex); U2(P, 'uOff', s ? 0 : ox, s ? 0 : oz); U1(P, 'uK', Math.min(.45, k)); U1(P, 'uDamp', .9935); U1(P, 'uRainAmt', rain); U1(P, 'uSeed', (seed + s * .37) % 97);
    const S = WATER.src, n = Math.min(24, S.length), arr = new Float32Array(96); for (let i = 0; i < n; i++) { arr[i * 4] = S[i][0]; arr[i * 4 + 1] = S[i][1]; arr[i * 4 + 2] = S[i][2]; arr[i * 4 + 3] = S[i][3] / steps; } gl.uniform4fv(P.u.uSrc, arr); gl.uniform1i(P.u.uNS, n); tri();
    const t = WATER.a; WATER.a = WATER.b; WATER.b = t;
  }
  WATER.src.length = 0; bindTex('tRipple', WATER.a.tex);
};
// ---------- waves: the same sum on GPU and CPU ------------------------------
// [dirx, dirz, wavelength, amplitude, steepness]
WATER.waves = []; { const r = rng(4242); for (let i = 0; i < 14; i++) { const f = Math.pow(i / 13, 1.1), L = lerp(34, 2.1, Math.pow(f, .55)), a = .55 * Math.pow(L / 34, 1.02) * (.75 + .5 * r()), an = 1.15 + (r() - .5) * 1.5 * (.35 + f); WATER.waves.push([Math.cos(an), Math.sin(an), L, a * (i < 3 ? .75 : .62), i < 4 ? .75 : .6]); } }
const GLSL_WAVE = `const int NWV=14; const vec4 WV[14]=vec4[14](${WATER.waves.map(w => `vec4(${w[0].toFixed(4)},${w[1].toFixed(4)},${w[2].toFixed(4)},${w[3].toFixed(4)})`).join(',')});
vec3 waveD(vec2 p,float amp,float far,out vec3 n,out float crest){ vec3 o=vec3(0.); n=vec3(0.,1.,0.); crest=0.; float grp=.72+.55*texture(tNoise,p*.0045+vec2(uTime*.006,uTime*-.004)).b; amp*=grp; for(int i=0;i<NWV;i++){ vec4 w=WV[i]; float k=6.2831853/w.z, ph=k*dot(w.xy,p)-sqrt(9.81*k)*uTime; float A=w.w*amp*(i<4?1.:mix(1.,.0,far)); float Q=.62/(k*max(A,.0001)*float(NWV))*min(1.,amp*1.5); Q=min(Q,3.2); float c=cos(ph),s=sin(ph); o.xz+=w.xy*(Q*A*c); o.y+=A*s; float wa=k*A; n.xz-=w.xy*wa*c; n.y-=Q*wa*s; crest+=wa*s; } n=normalize(n); return o; }`;
WATER.height = (x, z, t, amp) => { if (amp < 1e-4) return 0; let y = 0; for (const [dx, dz, L, a] of WATER.waves) { const k = TAU / L; y += a * amp * .95 * Math.sin(k * (dx * x + dz * z) - Math.sqrt(9.81 * k) * t); } return y; };
const GLSL_SAND = `
// sand relief in metres, without the fine grain. far fades the ripples before they alias.
float sandLow(vec2 p){ float a=texture(tNoise,p*.0105).r-.5, b=texture(tNoise,p*.043+.3).r-.5; return a*.10+b*.035; }
float sandRip(vec2 p,out float mask){ vec2 w=texture(tNoise,p*.06).rb-.5; float m=texture(tNoise,p*.021+.17).b; mask=smoothstep(.36,.60,m); vec2 q=p+w*1.1; float ph=(q.x*.93+q.y*.36)*TAU_/.17+ (texture(tNoise,p*.35).r-.5)*7.; float s=sin(ph); return (s*.5+.5*s*abs(s))*.0072*mask; }
float sandH(vec2 p){ float m; return sandLow(p)+sandRip(p,m); }`.replace(/TAU_/g, '6.2831853');
WATER.prog = program('flat', `layout(location=0) in vec3 aPos; layout(location=10) in vec2 aUV; out vec3 vW; out float vCrest; out vec3 vN; ${GLSL_WAVE} uniform vec2 uC;
void main(){ vec3 p=aPos; p.xz+=uC; vec3 n=vec3(0,1,0); float cr=0.; float y=uWaterY; vec3 o=vec3(0.);
 if(uWaveA>.0005){ float far=smoothstep(30.,160.,aUV.x); o=waveD(p.xz,uWaveA,far,n,cr); float cz=smoothstep(1.0,3.4,abs(p.z)), onC=smoothstep(156.,166.,p.x)*(1.-smoothstep(299.,306.,p.x)); float m=mix(1.,mix(.30,1.,cz),onC); o*=m; cr*=m; n=normalize(mix(vec3(0.,1.,0.),n,m)); }
 if(uSandLine.x>.01){ float d=(p.z+o.z-uSandLine.y-.8*sin(p.x*.18+1.)-.35*sin(p.x*.5))/uSandLine.z; float tp=exp(-pow((p.x-uHero.x)/22.,2.)); float g=uSandLine.x*tp*exp(-d*d)*(d>0.?1.:1.); float st=1./(1.+exp(-d*4.)); o.y+=g; o.z+=g*.45*smoothstep(-.2,.9,d)*0.+g*.30*exp(-d*d*2.); float gd=g*(-2.*d/uSandLine.z); n=normalize(vec3(n.x,n.y,n.z-gd*n.y)); cr+=g*.42*smoothstep(-.9,.3,d); }
 vW=vec3(p.x+o.x,y+o.y,p.z+o.z); vCrest=cr; vN=n; gl_Position=uVP*vec4(vW,1.); }`,
`in vec3 vW; in float vCrest; in vec3 vN; layout(location=0) out vec4 o; ${GLSL_WAVE} ${GLSL_SAND}
vec4 rip(vec2 p){ vec2 u=(p-uRip.xy)*uRip.w+.5; if(any(lessThan(u,vec2(.002)))||any(greaterThan(u,vec2(.998)))) return vec4(0.); float t=1./512.; float l=texture(tRipple,u-vec2(t,0)).r,r=texture(tRipple,u+vec2(t,0)).r,d=texture(tRipple,u-vec2(0,t)).r,b=texture(tRipple,u+vec2(0,t)).r; return vec4((l-r),(d-b),texture(tRipple,u).rg)*vec4(11.6,11.6,1.,1.); }
void main(){
 vec2 p=vW.xz; vec3 Vv=normalize(uCam-vW); float dist=length(uCam-vW); float px=length(fwidth(p));
 float nv=max(Vv.y,.004);
 vec4 rp=rip(p);
 // ---- sand
 float mask; float lowH=sandLow(p); float ripF=smoothstep(.06,.012,px); float rH=sandRip(p,mask)*ripF;
 float e=max(.004,px); float m2; vec2 gs=vec2(0.);
 if(ripF>.01){ float hx=sandLow(p+vec2(e,0.))+sandRip(p+vec2(e,0.),m2)*ripF, hz=sandLow(p+vec2(0.,e))+sandRip(p+vec2(0.,e),m2)*ripF; gs=vec2(hx-lowH-rH,hz-lowH-rH)/e; }
 float H=lowH+rH; float film=uPuddle.x; // water level above the mean sand
 film+=rp.z*.6; float depth=film-H; 
 // the sea's edge: slow swash
 float wet=smoothstep(-.035,.004,depth);
 vec4 gr=nz(p*2.7); float grain=nz(p*31.).a*smoothstep(.02,.002,px); float shell=smoothstep(.992,.998,nz(p*.83).a)*smoothstep(.04,.005,px);
 vec3 sand=uSandC*(.80+.30*gr.r+.16*(grain-.5)); sand=mix(sand,uSandC*vec3(.52,.50,.52),smoothstep(.52,.75,nz(p*.31).g)*.35); sand=mix(sand,vec3(.75,.70,.62),shell*.7);
 sand*=mix(1.,.40,wet);
 vec3 Ns=normalize(vec3(-gs.x*1.3,1.,-gs.y*1.3)); if(dot(Ns,Vv)<.02) Ns=normalize(Ns+Vv*.05);
 float sh=shadowAt(vec3(p.x,uWaterY+.01,p.y),vec3(0,1,0),gl_FragCoord.xy);
 Mat m; m.alb=sand; m.rough=mix(.92,.30,wet); m.metal=0.; m.trans=0.; m.ao=mix(.75,1.,sat(.5+rH*70.)); m.wrap=.08; m.spec=1.; m.coat=0.; m.emit=vec3(0.); m.tcol=vec3(0.);
 vec3 L=keyDir(vW); vec3 kc=keyCol(vW); vec3 cs=lightOne(m,Ns,Vv,L,kc,sh)+sand*ambientL(Ns)*m.ao;
 vec3 Rs=reflect(-Vv,Ns); cs+=skySpec(Rs,m.rough)*envBRDF(vec3(.04),m.rough,max(dot(Ns,Vv),.02))*wet*1.2;
 if(uL1C.a>0.){ vec3 l=uL1P.xyz-vW; float d=length(l); l/=d; float at=uL1C.a/(1.+d*d/(uL1P.w*uL1P.w)); if(at>.002) cs+=lightOne(m,Ns,Vv,l,uL1C.rgb*at,1.); }
 // ---- water surface normal
 vec2 wd=normalize(uWind.xz+1e-4); vec2 wt=uTime*wd;
 vec4 w1=texture(tWave,p*.31+wt*.055), w2=texture(tWave,p.yx*.73-wt.yx*.09+.3), w3=texture(tWave,p*.067+wt*.021);
 float patchy=smoothstep(.36,.66,texture(tNoise,p*.018-wt*.012).b+.14*texture(tNoise,p*.07-wt*.03).r);
 vec2 g=((w1.rg-.5)*.55+(w2.rg-.5)*.45)*smoothstep(.30,.02,px)+(w3.rg-.5)*.8*smoothstep(1.2,.1,px); g*=uWindR*mix(.18,1.,patchy);
 vec2 gm=g; g+=rp.xy*smoothstep(.12,.02,px);
 vec3 Nw=normalize(vec3(-g.x,1.,-g.y));
 float sea=uSea; float crest=0.; 
 if(uWaveA>.0005){ vec3 n2=normalize(vN); crest=vCrest; float far=smoothstep(30.,160.,dist); vec2 det=((w1.rg-.5)*1.5+(w2.rg-.5)*1.1+(w3.rg-.5)*1.6)*(.5+.8*uWindR); Nw=normalize(vec3(n2.x-det.x*n2.y,n2.y,n2.z-det.y*n2.y)+vec3(-rp.x,0.,-rp.y)); }
 if(dot(Nw,Vv)<.01) Nw=normalize(Nw+Vv*(.02-dot(Nw,Vv)));
 float nvw=max(dot(Nw,Vv),.003);
 // ---- reflection
 vec2 suv=gl_FragCoord.xy*uRes.zw; float k=.055*(1.+.6*sat(6./dist)); 
 vec2 off=vec2(Nw.x,Nw.z*.8)*k; vec2 ruv=suv+vec2(dot(Nw.xz,normalize(cross(vec3(0,1,0),Vv)).xz),dot(Nw.xz,normalize(Vv.xz)))*vec2(.10,-.16)*(.35+.65*sat(3./dist)*1.4);
 float blur=sat(length(gm)*1.4+px*.0); vec3 refl=texture(tRefl,ruv).rgb;
 { vec2 q=vec2(0.,1.)*uRes.zw*(2.+26.*blur*uWindR); refl=refl*.4+.2*texture(tRefl,ruv+q).rgb+.2*texture(tRefl,ruv-q).rgb+.1*texture(tRefl,ruv+q*2.3).rgb+.1*texture(tRefl,ruv-q*2.3).rgb; }
 vec3 Rw=reflect(-Vv,Nw); Rw.y=abs(Rw.y); vec3 rs=skySpec(Rw,.10+.25*uWindR); refl=mix(refl,rs,sat(sea*smoothstep(.02,.5,uWaveA)*1.2)*.82);
 float fre=.02+.98*pow(1.-nvw,5.); float frm=mix(fre,.06+.94*pow(1.-nvw,2.2),uMirror*(1.-sea)); frm=mix(frm,fre*.92,sea); frm=max(frm,uPuddle.y*(1.-sea));
 // ---- under the water
 float dp=max(depth,0.); float pathL=dp/max(nvw,.25); vec3 ext=mix(vec3(1.6,.75,.55),vec3(.9,.35,.28),sea); 
 vec3 under=cs*exp(-ext*pathL*2.2);
 vec3 deep=uDeep*(ambientL(vec3(0,1,0))*.55+kc*max(L.y,0.)*.25*sh); 
 float sss=pow(sat(dot(Vv,-L)*.5+.5),4.)*sat(crest*1.2+.2); vec3 scat=uScat*(ambientL(vec3(0,1,0))*.5+kc*sh*(.25+1.3*sss))*sat(.25+crest*1.1);
 vec3 body=deep+scat; under=mix(under,body,max(sea,1.-exp(-pathL*1.6)));
 // ---- sun glitter: energy-conserving lobe widened by the wavelets the pixel hides
 vec3 Hh=normalize(L+Vv); float rgh=mix(.045,.11,sat(uWindR))+px*.10+sea*.05; float a=rgh; float nh=max(dot(Nw,Hh),0.); float spk=D_ggx(nh,a)*V_sm(nvw,max(dot(Nw,L),.0),a)*max(dot(Nw,L),0.)*(.02+.98*pow(1.-max(dot(Vv,Hh),0.),5.)); vec3 glit=min(kc*sh*spk*.10,vec3(2.0));
 vec3 cw=mix(under,refl,sat(frm))+glit;
 if(uL1C.a>0.){ vec3 l=uL1P.xyz-vW; float d=length(l); l/=d; vec3 hh=normalize(l+Vv); float at=uL1C.a/(1.+d*d/(uL1P.w*uL1P.w)); cw+=uL1C.rgb*at*D_ggx(max(dot(Nw,hh),0.),.12)*.02; }
 // ---- foam
 float foam=0.; 
 if(uFoam>.001){ vec2 fp=p+vN.xz*.9; vec2 wp2=vec2(dot(fp,wd),dot(fp,vec2(-wd.y,wd.x))); float f1=nz(wp2*vec2(.05,.11)+vec2(uTime*.010,0.)).r, f3=nz(fp*1.1).r; vec4 w3=texture(tNoise3,vec3(wp2*vec2(.11,.17),uTime*.025)), w4=texture(tNoise3,vec3(wp2*vec2(.43,.52)+.3,uTime*.04)); float cells=w3.g*.6+w4.g*.4; float cov=smoothstep(.15,1.25,crest+ (f1-.5)*1.3)*.85+smoothstep(.60,.85,f1)*.22; float lace=smoothstep(1.-cov,1.-cov+.42,1.-cells*.95+.12*(f3-.5)); float fine=.55+.6*w4.b; foam=sat(lace*fine*smoothstep(.02,.25,cov))*uFoam; foam=max(foam,smoothstep(1.2,1.9,crest+(f1-.5))*.9*uFoam*(.6+.5*f3)); }
 // thin lip of foam where the film ends
 float lip=smoothstep(.010,.0,abs(depth-.004))*smoothstep(.45,.7,nz(p*1.3+wt*.05).r)*(1.-sea)*.22*smoothstep(.05,.01,px); foam=max(foam,lip);
 foam=sat(foam+rp.w*0.+sat(abs(rp.z)*9.-.35)*.25);
 vec3 fc=vec3(.74,.79,.80)*(ambientL(vec3(0,1,0))*.80+kc*sh*max(L.y,.12)*.75);
 float cover=smoothstep(-.002,.007,depth+ (gr.r-.5)*.004); cover=max(cover,sea);
 vec3 c=mix(cs,cw,cover); c=mix(c,fc,foam*max(cover,.6)*.72);
 c=applyAir(c,vec3(p.x,max(vW.y,uWaterY),p.y));
 o=vec4(max(c,0.),1.); }`);
