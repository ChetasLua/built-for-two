// ============================================================================
// 09_glsl.js - shader head: uniform blocks, noise, sky, light, fog, shadows.
// ============================================================================
const GLSL_HEAD = `
precision highp float; precision highp int; precision highp sampler3D; precision highp sampler2DShadow;
layout(std140) uniform Frame { vec4 F[96]; };
layout(std140) uniform View  { vec4 W[24]; };
uniform sampler2D tNoise, tRefl, tSky, tRipple, tBone, tWave, tMark, tA, tB, tC, tD, tDepth;
uniform sampler2DShadow tShadow, tShadowFar; uniform sampler3D tNoise3;
#define uTime F[0].x
#define uDt F[0].y
#define uFrame F[0].z
#define uPx F[0].w
#define uSun F[1].xyz
#define uSunCol F[2].xyz
#define uZenith F[3].xyz
#define uStars F[3].w
#define uUpper F[4].xyz
#define uHorizon F[5].xyz
#define uHazePow F[5].w
#define uHorSun F[6].xyz
#define uGlow F[6].w
#define uGround F[7].xyz
#define uAmb F[7].w
#define uFogCol F[8].xyz
#define uFogD F[8].w
#define uFogH F[9].x
#define uFogSun F[9].y
#define uMist F[9].z
#define uCl F[10]
#define uClLit F[11].xyz
#define uClSpeed F[11].w
#define uClDark F[12].xyz
#define uClScale F[12].w
#define uWaterY F[13].x
#define uWaveA F[13].y
#define uSea F[13].z
#define uWindR F[13].w
#define uDeep F[14].xyz
#define uFoam F[14].w
#define uScat F[15].xyz
#define uMirror F[15].w
#define uWind F[16].xyz
#define uGust F[16].w
#define uL0P F[17]
#define uL0C F[18]
#define uL0D F[19]
#define uL1P F[20]
#define uL1C F[21]
#define uFlash F[22].xyz
#define uRain F[22].w
#define uRip F[23]
#define uShM mat4(F[24],F[25],F[26],F[27])
#define uShF mat4(F[28],F[29],F[30],F[31])
#define uShP F[32]
#define uEgg F[33]
#define uEggQ F[34]
#define uEggS F[35]
#define uSandC F[36].xyz
#define uSandWet F[36].w
#define uHero F[38]
#define uBeam F[39]
#define uKeyKind F[40].x
#define uHeroD F[41].xyz
#define uPuddle F[42]
#define uRimC F[43].xyz
#define uSandLine F[44]
#define uVP mat4(W[0],W[1],W[2],W[3])
#define uViewM mat4(W[4],W[5],W[6],W[7])
#define uCam W[8].xyz
#define uPass W[8].w
#define uNear W[9].x
#define uFar W[9].y
#define uTan W[9].zw
#define uIVP mat4(W[10],W[11],W[12],W[13])
#define uRes W[14]
#define uClip W[15]
#define uPVP mat4(W[16],W[17],W[18],W[19])
#define PI 3.14159265359
#define sat(x) clamp(x,0.,1.)
float lum(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float hash13(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }
float remapc(float x,float a,float b,float c,float d){ return c+(d-c)*sat((x-a)/(b-a)); }
// baked tiling noise: r = fbm, g = ridged, b = value (soft), a = white
vec4 nz(vec2 p){ return texture(tNoise,p); }
vec3 qrot(vec4 q,vec3 v){ return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v); }

// ---------- sky, clear part -------------------------------------------------
vec3 skyClear(vec3 d){
  float up=max(d.y,0.);
  vec2 az=normalize(d.xz+1e-5), saz=normalize(uSun.xz+1e-5);
  float side=pow(sat(.5+.5*dot(az,saz)),2.2);
  vec3 hor=mix(uHorizon,uHorSun,side);
  float h1=1.-exp(-up*uHazePow), h2=smoothstep(.0,.55,up);
  vec3 c=mix(mix(hor,uUpper,h1),uZenith,h2);
  float mu=max(dot(d,uSun),0.);
  c+=uSunCol*uGlow*(.045*pow(mu,6.)+.10*pow(mu,32.)+.35*pow(mu,220.));
  if(d.y<0.) c=mix(c,uHorizon*.6,sat(-d.y*3.));
  return c;
}
float hgp(float c,float g){ return (1.-g*g)/pow(1.+g*g-2.*g*c,1.5)/(4.*PI); }
// cloud density at p (metres). uCl = cover, density, base, thickness
float cloudD(vec3 p,bool fine){
  float h=(p.y-uCl.z)/uCl.w; if(h<0.||h>1.) return 0.;
  vec3 q=p/(uClScale*1000.); q.xz+=vec2(uTime*.0011,uTime*.0003)*uClSpeed;
  vec2 cov=texture(tNoise,q.xz*.16).rb;
  float base=texture(tNoise3,q*vec3(1.,1.6,1.)).r;
  float shape=smoothstep(0.,.12,h)*(1.-smoothstep(.35,1.,h));
  float d=base*.62+cov.x*.55+cov.y*.18-(1.18-uCl.x);
  d=d*shape-(1.-shape)*.22;
  if(d<=0.) return 0.;
  if(fine){ float e=texture(tNoise3,q*5.1+vec3(0.,uTime*.0009,0.)).g; d-=(1.-e)*.16*(1.-sat(d*1.6)); }
  return sat(d*1.9)*uCl.y;
}
// returns premultiplied cloud colour and transmittance
vec4 clouds(vec3 ro,vec3 rd,float jit,int N){
  if(rd.y<.012||uCl.x<.01) return vec4(0.,0.,0.,1.);
  float t0=(uCl.z-ro.y)/rd.y, t1=(uCl.z+uCl.w-ro.y)/rd.y; t1=min(t1,t0+uCl.w*7.);
  float far=exp(-t0/14000.);
  float dt=(t1-t0)/float(N), t=t0+dt*jit; float T=1.; vec3 C=vec3(0.);
  float mu=dot(rd,uSun); float ph=mix(hgp(mu,.62)*1.6+hgp(mu,-.15)*.6,1./(4.*PI)*2.,.25)*4.;
  for(int i=0;i<N;i++){
    vec3 p=ro+rd*t; float d=cloudD(p,true);
    if(d>.003){
      float od=0.; vec3 ls=uSun*uCl.w*.11; vec3 lp=p;
      for(int k=0;k<4;k++){ lp+=ls; od+=cloudD(lp,false); ls*=1.55; }
      float sh=exp(-od*1.05)*.82+exp(-od*.28)*.18; float powd=1.-exp(-d*3.2);
      float h=sat((p.y-uCl.z)/uCl.w);
      vec3 L=uClLit*sh*ph*(.55+.45*powd)+uClDark*(.45+.75*h)+uFlash*(.35+.65*h)*.6;
      float a=1.-exp(-d*dt*.0105); C+=T*a*L; T*=1.-a; if(T<.02) break;
    }
    t+=dt;
  }
  vec3 hz=skyClear(normalize(vec3(rd.x,max(rd.y,.02),rd.z)));
  float A=(1.-T); C=mix(hz*A,C,mix(.25,1.,far)); 
  float fade=smoothstep(.012,.10,rd.y);
  return vec4(C*fade,mix(1.,T,fade));
}
vec3 starField(vec3 d){
  if(uStars<.01||d.y<-.05) return vec3(0.);
  float c=cos(uTime*.0012),s=sin(uTime*.0012); d.xy=mat2(c,-s,s,c)*d.xy;
  vec3 col=vec3(0.);
  for(int k=0;k<3;k++){
    float sc=90.+float(k)*130.; vec3 a=abs(d); vec2 uv; float fc;
    if(a.x>a.y&&a.x>a.z){ uv=d.yz/a.x; fc=d.x>0.?0.:1.; } else if(a.y>a.z){ uv=d.xz/a.y; fc=d.y>0.?2.:3.; } else { uv=d.xy/a.z; fc=d.z>0.?4.:5.; }
    uv=uv*sc*.5+fc*71.; vec2 id=floor(uv), f=fract(uv)-.5; vec2 h=hash22(id+float(k)*19.); float m=hash12(id+7.+float(k)*3.);
    float mag=pow(m,k==0?14.:8.); vec2 o=(h-.5)*.7; float r=length(f-o);
    float tw=.75+.25*sin(uTime*(2.+5.*h.x)+h.y*40.);
    vec3 tint=mix(vec3(1.,.78,.55),vec3(.62,.78,1.2),h.x);
    col+=tint*mag*tw*exp(-r*r*(k==0?190.:120.))*(k==0?3.4:1.3);
  }
  // the milky way: a band with dust
  vec3 ax=normalize(vec3(.32,.55,.77)); float b=dot(d,ax); float band=exp(-b*b*16.);
  vec2 mu=vec2(atan(d.z,d.x)*.6,b*1.3); float n1=texture(tNoise,mu*.55).r, n2=texture(tNoise,mu*1.7+.3).g;
  col+=vec3(.50,.56,.82)*band*(.10+.40*n1*n1)*sat(1.15-n2*1.1*exp(-b*b*60.))*.55+vec3(.9,.66,.5)*exp(-b*b*70.)*n1*n1*.10;
  return col*uStars*smoothstep(-.02,.22,d.y);
}
vec3 sunDisc(vec3 d){ float mu=dot(d,uSun); float r=acos(clamp(mu,-1.,1.)); float s=F[1].w; float disc=smoothstep(s,s*.86,r); return uSunCol*disc*F[2].w; }

// ---------- light -----------------------------------------------------------
// soft, coloured ambient from the same sky the eye sees
vec3 ambientL(vec3 n){
  vec2 saz=normalize(uSun.xz+1e-5); float side=.5+.5*dot(n.xz,saz);
  vec3 hor=mix(uHorizon,uHorSun,side*side);
  vec3 up=mix(uUpper,uZenith,.55);
  float y=n.y;
  vec3 c=mix(uGround,mix(hor*.92,up,smoothstep(-.15,1.,y)),smoothstep(-1.,.62,y));
  return c*uAmb+uFlash*(.25+.3*max(y,0.));
}
vec3 skySpec(vec3 r,float rough){
  vec3 c=skyClear(normalize(vec3(r.x,abs(r.y)*.94+.06*rough,r.z)));
  if(r.y<0.) c=mix(c,mix(c*.75,uGround,.6),sat(-r.y*2.)); 
  vec3 a=ambientL(r)/max(uAmb,.001); return mix(c,a,rough*rough);
}
const vec2 VOG[12]=vec2[12](vec2(.204,0.),vec2(-.261,.239),vec2(.040,-.456),vec2(.329,.429),vec2(-.604,-.107),vec2(.561,-.357),vec2(-.188,.710),vec2(-.353,-.706),vec2(.798,.277),vec2(-.837,.318),vec2(.389,-.850),vec2(.250,.947));
float shadowAt(vec3 wp,vec3 n,vec2 fc){
  vec3 q=wp+n*uShP.z; vec4 s=uShM*vec4(q,1.); s.xyz/=s.w; vec3 c=s.xyz*.5+.5; float sh=1.;
  float a=ign(fc)*6.283, ca=cos(a), sa=sin(a); mat2 R=mat2(ca,-sa,sa,ca);
  bool inside=all(greaterThan(c,vec3(.01)))&&all(lessThan(c,vec3(.99)))&&s.w>0.;
  if(inside){ float acc=0.; for(int i=0;i<12;i++) acc+=texture(tShadow,vec3(c.xy+R*VOG[i]*uShP.x,c.z-uShP.y)); sh=acc/12.; }
  else if(uKeyKind<.5){ vec4 f=uShF*vec4(wp+n*uShP.z*5.,1.); vec3 d=f.xyz*.5+.5; if(all(greaterThan(d,vec3(.005)))&&all(lessThan(d,vec3(.995)))){ float acc=0.; for(int i=0;i<8;i++) acc+=texture(tShadowFar,vec3(d.xy+R*VOG[i]*uShP.w,d.z-.0012)); sh=acc/8.; } }
  return sh;
}
// key light at a point: direction, colour (with cone and distance for a lamp)
vec3 keyDir(vec3 p){ return uKeyKind<.5?uSun:normalize(uL0P.xyz-p); }
vec3 keyCol(vec3 p){ if(uKeyKind<.5) return uSunCol; vec3 l=uL0P.xyz-p; float d2=dot(l,l); float cs=dot(normalize(-l),uL0D.xyz); float co=smoothstep(uL0C.w,mix(uL0C.w,1.,.25),cs); return uL0C.rgb*co/(1.+d2/(uL0P.w*uL0P.w)); }
float D_ggx(float nh,float a){ float a2=a*a, d=nh*nh*(a2-1.)+1.; return a2/(PI*d*d+1e-6); }
float V_sm(float nv,float nl,float a){ float a2=a*a; return .5/(nl*sqrt(nv*nv*(1.-a2)+a2)+nv*sqrt(nl*nl*(1.-a2)+a2)+1e-5); }
vec3 envBRDF(vec3 f0,float rough,float nv){ vec4 c0=vec4(-1.,-.0275,-.572,.022),c1=vec4(1.,.0425,1.04,-.04); vec4 r=rough*c0+c1; float a004=min(r.x*r.x,exp2(-9.28*nv))*r.x+r.y; vec2 AB=vec2(-1.04,1.04)*a004+r.zw; return f0*AB.x+AB.y; }
struct Mat { vec3 alb; float rough, metal, trans, ao, wrap, spec, coat; vec3 emit, tcol; };
vec3 lightOne(Mat m,vec3 N,vec3 Vv,vec3 L,vec3 col,float sh){
  vec3 H=normalize(L+Vv); float nl=dot(N,L), nv=max(dot(N,Vv),.02), nh=max(dot(N,H),0.), vh=max(dot(Vv,H),0.);
  float dif=sat((nl+m.wrap)/((1.+m.wrap)*(1.+m.wrap)));
  vec3 f0=mix(vec3(.04*m.spec),m.alb,m.metal); vec3 Fr=f0+(1.-f0)*pow(1.-vh,5.); float a=max(m.rough*m.rough,.012);
  vec3 s=Fr*D_ggx(nh,a)*V_sm(nv,max(nl,0.),a)*max(nl,0.);
  if(m.coat>0.){ float ac=.012; float fc=.04+.96*pow(1.-vh,5.); s=s*(1.-fc*m.coat)+m.coat*fc*D_ggx(nh,ac)*V_sm(nv,max(nl,0.),ac)*max(nl,0.); }
  vec3 c=(m.alb*(1.-m.metal)*dif+s*PI*.75)*sh;
  if(m.trans>0.){ float bk=sat((-nl+.25)/1.25); float fw=pow(sat(dot(-L,Vv)),3.); c+=m.tcol*m.trans*(bk*.75+fw*bk*1.5)*mix(1.,sh,.65); }
  return c*col;
}
vec3 shade(Mat m,vec3 N,vec3 Vv,vec3 wp,vec2 fc){
  float sh=shadowAt(wp,N,fc); vec3 L=keyDir(wp); vec3 c=lightOne(m,N,Vv,L,keyCol(wp),sh);
  // ambient
  vec3 amb=ambientL(N); if(m.trans>0.) amb=mix(amb,ambientL(-N),.22*m.trans);
  float nv=max(dot(N,Vv),.02); vec3 f0=mix(vec3(.04*m.spec),m.alb,m.metal);
  vec3 R=reflect(-Vv,N); float so=sat(pow(nv+m.ao,2.)-1.+m.ao);
  c+=m.alb*(1.-m.metal)*amb*m.ao+skySpec(R,m.rough)*envBRDF(f0,m.rough,nv)*so*(.35+.65*m.ao);
  if(m.coat>0.) c+=skySpec(R,.06)*(.04+.96*pow(1.-nv,5.))*m.coat*so;
  // two small lamps
  if(uL1C.a>0.){ vec3 l=uL1P.xyz-wp; float d=length(l); l/=d; float at=uL1C.a/(1.+d*d/(uL1P.w*uL1P.w)); if(at>.002) c+=lightOne(m,N,Vv,l,uL1C.rgb*at,1.); }
  // sky rim: a whisper of edge light that a camera operator would have rigged
  float rim=pow(1.-nv,3.5)*sat(.55+.45*dot(N,uSun)); c+=uRimC*rim*(.35+.65*m.alb)*m.ao;
  return c+m.emit;
}
// ---------- air -------------------------------------------------------------
vec3 airColor(vec3 rd){ vec2 az=normalize(rd.xz+1e-5), s=normalize(uSun.xz+1e-5); float mu=sat(dot(rd,uSun)); float side=pow(sat(.5+.5*dot(az,s)),2.2); return mix(uFogCol,uHorSun,side*uFogSun)+uSunCol*uGlow*uFogSun*(.03*pow(mu,5.)+.08*pow(mu,24.))+uFlash*.12; }
float fogAmt(vec3 wp){ vec3 d=wp-uCam; float l=length(d); float hy=uFogH; float y0=max(uCam.y-uWaterY,0.), y1=max(wp.y-uWaterY,0.); float dy=y1-y0; float ig=abs(dy)>.01?(exp(-y0*hy)-exp(-y1*hy))/(hy*dy):exp(-y0*hy); return 1.-exp(-l*uFogD*ig); }
vec3 applyAir(vec3 c,vec3 wp){ float f=fogAmt(wp); return mix(c,airColor(normalize(wp-uCam)),sat(f)); }
`;
