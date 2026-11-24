// ============================================================================
// 13_std.js - the one surface shader. Vertex variants: RIG (bones), LOFT (spine
// surfaces), FEATHER (instanced on a spine or a bone), INST (placed copies).
// ============================================================================
// tBone rows: each "rig" owns rows. A bone = 3 texels (3x4 matrix rows). Spine sample = 3 texels too.
const VS_STD = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aMat; layout(location=4) in vec4 aBone; layout(location=10) in vec2 aUV;
#if defined(INST)||defined(FEATHER)||defined(WFEATHER)
layout(location=5) in vec4 aI0; layout(location=6) in vec4 aI1; layout(location=7) in vec4 aI2;
#endif
#ifdef INST
layout(location=8) in vec4 aI3;
#endif
uniform mat4 uM; uniform float uRow; uniform vec4 uTint; uniform float uWindK;
out vec3 vW,vN,vO; out vec4 vC; out vec4 vMt; out vec2 vUV; out vec3 vT; out float vHero;
mat4x3 boneAt(int k,float row){ int y=int(row); vec4 a=texelFetch(tBone,ivec2(k*3,y),0),b=texelFetch(tBone,ivec2(k*3+1,y),0),c=texelFetch(tBone,ivec2(k*3+2,y),0); return mat4x3(a.x,b.x,c.x,a.y,b.y,c.y,a.z,b.z,c.z,a.w,b.w,c.w); }
#if defined(LOFT)||defined(FEATHER)
// spine sample k: texel0 = centre xyz, rY ; texel1 = quaternion ; texel2 = rZ, belly, squash, free
uniform float uSpineN;
void spine(float u,out vec3 c,out vec4 q,out vec3 r){ float x=clamp(u,0.,1.)*(uSpineN-1.); int i=int(min(floor(x),uSpineN-2.)); float f=x-float(i); int y=int(uRow);
  vec4 a0=texelFetch(tBone,ivec2(i*3,y),0),a1=texelFetch(tBone,ivec2(i*3+3,y),0); vec4 q0=texelFetch(tBone,ivec2(i*3+1,y),0),q1=texelFetch(tBone,ivec2(i*3+4,y),0); vec4 r0=texelFetch(tBone,ivec2(i*3+2,y),0),r1=texelFetch(tBone,ivec2(i*3+5,y),0);
  c=mix(a0.xyz,a1.xyz,f); if(dot(q0,q1)<0.) q1=-q1; q=normalize(mix(q0,q1,f)); r=vec3(mix(a0.w,a1.w,f),mix(r0.x,r1.x,f),mix(r0.y,r1.y,f)); }
vec3 loftP(float u,float th){ vec3 c,r; vec4 q; spine(u,c,q,r); float sy=sin(th),cz=cos(th); float ry=r.x*(sy<0.?r.z:1.); return c+qrot(q,vec3(0.,sy*ry,cz*r.y)); }
#endif
void main(){
  vec3 P=aPos,N=aNrm,T=vec3(0.); vUV=aUV; vO=aPos; vC=aCol; vC.rgb*=vC.rgb; vMt=aMat; vHero=0.;
#ifdef RIG
  mat4x3 B=boneAt(int(aBone.x),uRow); if(aBone.z>0.){ mat4x3 B1=boneAt(int(aBone.y),uRow); float w=aBone.z/255.; B=B*(1.-w)+B1*w; }
  P=B*vec4(P,1.); N=mat3(B)*N; T=mat3(B)*vec3(1.,0.,0.);
#endif
#ifdef LOFT
  // aPos.x = u along the spine, aPos.y = angle, aPos.z = push outward
  float e=.004; vec3 p0=loftP(aPos.x,aPos.y); vec3 du=loftP(aPos.x+e,aPos.y)-loftP(aPos.x-e,aPos.y), dv=loftP(aPos.x,aPos.y+.02)-loftP(aPos.x,aPos.y-.02);
  N=normalize(cross(dv,du)); vec3 cc,rr; vec4 qq; spine(aPos.x,cc,qq,rr); if(dot(N,p0-cc)<0.) N=-N; P=p0+N*aPos.z; T=normalize(du); vO=vec3(aPos.x,aPos.y,0.);
#endif
#ifdef FEATHER
  // instance: aI0 = u, theta, length, width ; aI1 = lift, twist, curl, shade ; aI2 = tint rgb, seed
  float e=.006; vec3 p0=loftP(aI0.x,aI0.y); vec3 du=normalize(loftP(aI0.x+e,aI0.y)-loftP(aI0.x-e,aI0.y)), dv=normalize(loftP(aI0.x,aI0.y+.03)-loftP(aI0.x,aI0.y-.03));
  vec3 nn=normalize(cross(dv,du)); vec3 cc,rr; vec4 qq; spine(aI0.x,cc,qq,rr); if(dot(nn,p0-cc)<0.) nn=-nn;
  float gust=texture(tNoise,p0.xz*.35+uTime*vec2(.31,.17)*(1.+uGust)).b-.5; float lift=aI1.x+gust*.35*uGust*uWindK+uTint.w;
  vec3 dir=normalize(-du*cos(lift)+nn*sin(lift)+dv*aI1.y); vec3 side=normalize(cross(nn,dir)); vec3 up=normalize(cross(dir,side));
  float t=aPos.x, s=aPos.z; // blade: t 0..1 along, s -1..1 across
  float cur=aI1.z; vec3 q=dir*(t*aI0.z)+side*(s*aI0.w*(1.-.42*uTint.x))+up*(-cur*t*t*aI0.z*.5+ (1.-s*s)*aI0.w*.22);
  P=p0+nn*.002+q; N=normalize(up+dir*cur*t*.6+side*s*.55); T=dir; vO=vec3(t,s,aI2.w); vC.rgb=aI2.rgb*(1.-.30*uTint.x*(.6+.4*sin(aI2.w*9.))); vC.a=mix(.62,1.,smoothstep(0.,.75,t))*aI1.w;
#endif
#ifdef WFEATHER
  // big feathers: aI0..aI2 = rows of a 3x4 matrix; blade length is scaled in the matrix x axis. aCol.a etc from instance colour in uTint? colour by aI3
  mat4x3 B=mat4x3(aI0.x,aI1.x,aI2.x,aI0.y,aI1.y,aI2.y,aI0.z,aI1.z,aI2.z,aI0.w,aI1.w,aI2.w);
  P=B*vec4(P,1.); N=normalize(mat3(B)*(N/vec3(dot(B[0],B[0]),dot(B[1],B[1]),dot(B[2],B[2])))); T=normalize(B[0]);
#endif
#ifdef INST
  vec4 q=aI1; float sc=aI0.w; vec3 pp=P*aI2.xyz*sc; 
  #ifdef SWAY
  float sw=(texture(tNoise,aI0.xz*.02+uTime*.05*normalize(uWind.xz+1e-4)).b-.35)*(.25+1.6*uGust)+.06*sin(uTime*2.3+aI0.x*3.+aI0.z*5.); float k=pp.y*pp.y*aI3.w; pp.xz+=normalize(uWind.xz+1e-4)*sw*k; pp.y-=abs(sw)*k*.25;
  #endif
  P=qrot(q,pp)+aI0.xyz; N=qrot(q,N/aI2.xyz); vC.rgb*=aI3.rgb; vO=aPos*aI2.xyz*sc+aI0.xyz*.13;
#endif
#ifdef CLOTH
  T=normalize(vec3(aBone.xyz)/127.5-1.);
#endif
  vec4 w=uM*vec4(P,1.); vW=w.xyz; vN=normalize(mat3(uM)*N); vT=mat3(uM)*T;
#ifdef ISHERO
  vHero=1.;
#endif
  if(uPass>.5&&uPass<1.5) gl_ClipDistanceEmu=0.;
  gl_Position=uVP*w;
}`.replace('if(uPass>.5&&uPass<1.5) gl_ClipDistanceEmu=0.;', '');

// surface recipes by id. vO = object-space position, vUV = surface coordinates.
const GLSL_MATS = `
in vec3 vW,vN,vO,vT; in vec4 vC,vMt; in vec2 vUV; in float vHero;
uniform vec4 uTint; uniform float uFade;
float fw(float x){ return max(fwidth(x),1e-5); }
vec4 tri3(vec3 p,vec3 n){ vec3 a=pow(abs(n),vec3(4.)); a/=a.x+a.y+a.z; return nz(p.yz)*a.x+nz(p.xz)*a.y+nz(p.xy)*a.z; }
vec3 bump(vec3 N,vec3 p,float h,float k){ vec3 dx=dFdx(p),dy=dFdy(p); vec3 r1=cross(dy,N),r2=cross(N,dx); float det=dot(dx,r1); vec3 g=sign(det)*(dFdx(h)*r1+dFdy(h)*r2); return normalize(abs(det)*N-g*k); }
// the egg: soft shadow of an ellipsoid between p and the light, plus the life inside it when candled
float eggThrough(vec3 p,vec3 l,out float life){
  life=0.; if(uEgg.w<.01) return 0.; vec4 q=vec4(-uEggQ.xyz,uEggQ.w); vec3 o=qrot(q,p-uEgg.xyz)/uEggS.xyx, d=qrot(q,l)/uEggS.xyx;
  float a=dot(d,d),b=dot(o,d),c=dot(o,o)-1.,h=b*b-a*c; if(h<0.) return 0.; h=sqrt(h); float t1=(-b+h)/a,t0=(-b-h)/a; if(t1<0.) return 0.; float th=(t1-max(t0,0.))*length(l*1.)/uEggS.x*.5;
  // the embryo: a curled blob that breathes and kicks
  float ph=uEggS.z; vec3 m=o+d*((-b)/a); vec2 e=vec2(dot(m,normalize(vec3(0.,1.,0.))),dot(m,normalize(cross(d,vec3(0.,1.,0.)))));
  float k=uEggS.w; vec2 head=vec2(.22+.10*sin(ph*1.3)+.14*k,-.16+.18*k), body=vec2(-.20,.06+.06*sin(ph*.8));
  float s1=length((e-head)*vec2(1.,1.1))-.23, s2=length((e-body)*vec2(.85,1.))-.40; float u=sat(.5+.5*(s2-s1)/.22); float sd=mix(s2,s1,u)-.22*u*(1.-u); float wing=length((e-body-vec2(.12+.12*k,.26+.05*sin(ph*2.)))*vec2(.7,1.6))-.18; sd=min(sd,wing);
  life=smoothstep(.10,-.12,sd); return sat(th*.9);
}
Mat surface(inout vec3 N,vec3 Vv){
  Mat m; m.alb=vC.rgb; m.rough=vMt.x; m.metal=vMt.y; m.trans=vMt.z; m.ao=vC.a; m.wrap=0.; m.spec=1.; m.coat=0.; m.emit=vec3(0.); m.tcol=vC.rgb; int id=int(vMt.w*255.+.5);
  float px=length(fwidth(vW));
  if(id==1){ // enamel paint
    vec4 n=tri3(vO*3.1,N); vec4 n2=tri3(vO*23.,N); m.coat=.85; m.rough=.42; float chip=smoothstep(.71,.76,n.g*.55+n2.r*.45)*smoothstep(.02,.002,px); m.alb*=.92+.16*n.r; m.alb=mix(m.alb,vec3(.10,.075,.06),chip); m.coat*=1.-chip; m.metal=mix(0.,.3,chip); m.rough=mix(m.rough,.65,chip);
  } else if(id==2){ // bright metal with a little age
    vec4 n=tri3(vO*9.,N); m.metal=1.; m.rough=mix(.14,.38,n.r); m.alb=mix(m.alb,vec3(.30,.20,.13),smoothstep(.66,.86,n.g)*.55);
  } else if(id==3){ // rubber
    m.rough=.82; m.spec=.6; m.alb*=.8+.4*nz(vUV*vec2(40.,4.)).a*smoothstep(.02,.0,px);
  } else if(id==4){ // leather
    vec4 n=tri3(vO*11.,N); float h=tri3(vO*28.,N).r; N=bump(N,vW,h,.0012*smoothstep(.008,.0008,px)); m.rough=.48+.25*n.r; m.alb*=.7+.55*n.r; m.spec=1.2;
  } else if(id==5){ // wicker: over-under weave from uv
    vec2 u=vUV*vec2(44.,11.); float row=floor(u.y); float o=mod(row,2.)*.5; float a=sin((u.x+o*1.)*PI), b=abs(fract(u.y)-.5)*2.; float h=(1.-b*b)*(.55+.45*a); N=bump(N,vW,h,.010*smoothstep(.02,.002,px)); m.alb*=.45+.75*h+.25*(hash12(vec2(floor(u.x),row))-.5); m.ao*=.45+.55*h; m.rough=.7; m.wrap=.2;
  } else if(id==6){ // weathered wood
    vec3 p=vO; float g=nz(vec2(p.x*.9+p.z*.35,p.y*6.+p.z*5.)*.6).r, g2=nz(vec2(p.x*3.1,p.y*31.+p.z*27.)).g; m.alb*=.62+.5*g+.25*(g2-.5); N=bump(N,vW,g2,.004*smoothstep(.06,.004,px)); m.rough=.86; m.ao*=.8+.2*g;
  } else if(id==7){ // stone
    vec4 n=tri3(vO*.55,N), n2=tri3(vO*3.3,N), n3=tri3(vO*14.,N); float h=n.r*.5+n2.r*.32+n3.r*.18; N=bump(N,vW,h,.16*smoothstep(.2,.004,px)); m.alb*=.45+1.0*h; m.alb=mix(m.alb,m.alb*vec3(.9,1.02,.80),smoothstep(.45,.75,n.b)*.6); m.rough=.9; float wet=sat(uSandWet*.6+uRain*.5)+smoothstep(.55,.0,vW.y-uWaterY); wet=sat(wet); m.alb*=mix(1.,.42,wet); m.rough=mix(m.rough,.28,wet); float weed=smoothstep(.42,.05,vW.y-uWaterY-n.r*.3)*smoothstep(.3,.6,n2.b); m.alb=mix(m.alb,vec3(.035,.05,.018),weed); m.ao*=.6+.4*h;
  } else if(id==8){ // bill keratin: layered horn, warm translucence, a pink-to-gold drift
    float l=nz(vec2(vUV.x*2.2,vUV.y*3.)).r, l2=nz(vec2(vUV.x*9.,vUV.y*2.)).g; m.alb*=.86+.22*l; m.alb=mix(m.alb,m.alb*vec3(.80,.55,.42),smoothstep(.6,.95,l2)*.35); m.rough=.34+.12*l; m.coat=.25; m.wrap=.28; m.trans=max(m.trans,.12); m.tcol=m.alb*vec3(1.4,.6,.3);
  } else if(id==9){ // orange leg and foot skin, scutes
    vec2 u=vUV*vec2(26.,6.); u.y+=mod(floor(u.x),2.)*.5; vec2 f=abs(fract(u)-.5); float h=1.-smoothstep(.30,.5,max(f.x,f.y)); float far9=smoothstep(.0045,.0006,px); N=bump(N,vW,h,.0022*far9); m.alb*=mix(.96,.80+.24*h,far9); m.rough=.5; m.wrap=.3; m.coat=.12; m.trans=max(m.trans,.1); m.tcol=m.alb*vec3(1.4,.5,.25);
  } else if(id==10){ // the pouch: thin wet skin with veins, lit from behind; the egg inside throws its shadow on it
    vec2 u=vUV*vec2(2.6,1.7); float w=nz(u*.7).r; float v1=abs(nz(u*.55+w*.12).r-.5), v2=abs(nz(u*1.5+7.3+w*.08).r-.5); float vein=smoothstep(.045,.0,v1)*.7+smoothstep(.03,.0,v2)*.4; float fold=sin(vUV.y*34.+w*9.)*.5+.5; N=bump(N,vW,fold*.35+w*1.6,.0035*(1.-.6*uEgg.w)*smoothstep(.006,.0008,px)); m.alb=mix(m.alb,m.alb*vec3(.80,.40,.30),vein*.45)*(.9+.15*w); m.rough=.55; m.coat=.05; m.wrap=.42; m.trans=1.; m.tcol=vec3(1.0,.40,.10)*(1.-vein*.45);
    float life; float th=eggThrough(vW,keyDir(vW),life); vec3 eggT=mix(vec3(1.),vec3(.62,.30,.12),sat(th*1.4)); eggT*=1.-.82*life*sat(th*3.); m.tcol*=mix(vec3(1.),eggT,step(.001,th)); 
  } else if(id==11){ // eye: handled in its own program path by uv: x = radial distance from the optic axis
    float r=vUV.x; float a=vUV.y; float fib=nz(vec2(a*1.6,r*.35)).r*.6+nz(vec2(a*5.,r*.8)).r*.4; float pup=uTint.x; vec3 iris=mix(vec3(.085,.034,.012),vec3(.30,.135,.040),fib)*(.5+1.1*smoothstep(.25,.62,r)); iris*=1.-smoothstep(.60,.72,r)*.85; float p=smoothstep(pup-.02,pup+.02,r); m.alb=mix(vec3(.004),iris,p); m.alb=mix(m.alb,vec3(.78,.70,.62)*(.75+.25*nz(vec2(a,r)).r),smoothstep(.70,.76,r)); m.rough=.30; m.coat=1.; m.spec=1.; m.wrap=.25; m.ao*=mix(.45,1.,smoothstep(1.05,.55,r));
    { vec3 Rr=reflect(-Vv,N); vec3 rt=vec3(uViewM[0][0],uViewM[1][0],uViewM[2][0]), upv=vec3(uViewM[0][1],uViewM[1][1],uViewM[2][1]), bk=vec3(uViewM[0][2],uViewM[1][2],uViewM[2][2]); float cl=smoothstep(.955,.985,dot(Rr,normalize(bk*.62+upv*.62-rt*.48))); float cl2=smoothstep(.985,.995,dot(Rr,normalize(bk*.8-upv*.45+rt*.40)))*.25; m.emit+=(cl*1.1+cl2)*(ambientL(upv)*1.6+keyCol(vW)*.06); }
  } else if(id==12){ // eggshell: chalky, pores, faint speckle; candles when lit from behind
    float n=nz(vO.xy*vec2(5.,5.)+vO.z*3.).r, s=nz(vO.xz*13.+vO.y*9.).g, por=nz(vO.xy*90.+vO.z*70.).a; m.alb*=.90+.14*n; m.alb=mix(m.alb,vec3(.42,.36,.28),smoothstep(.74,.88,s)*.5); N=bump(N,vW,por,.0005*smoothstep(.004,.0005,px)); m.rough=.62; m.wrap=.30; m.trans=mix(.14,.55,step(.01,uEgg.w)); m.tcol=vec3(1.,.55,.28)*.8; float life; float th=eggThrough(vW-keyDir(vW)*.002,keyDir(vW),life); m.tcol*=1.-.75*life;
  } else if(id==13){ // knitted wool: interlocking V stitches, fuzz
    vec2 u=vUV*vec2(150.,18.); float col=floor(u.y); vec2 f=fract(u); float s=abs(f.y-.5); float v=fract(u.x+ s*1.1); float h=(1.-smoothstep(.0,.42,abs(s-.22)))*(.5+.5*cos((v-.5)*TAU_)); float far=smoothstep(.010,.0016,px); N=bump(N,vW,h,.0052*far); m.alb*=mix(.84,.55+.62*h,far); m.ao*=mix(.9,.55+.45*h,far); m.rough=.95; m.spec=.3; m.wrap=.35; m.trans=.35; m.tcol=m.alb; float fz=pow(1.-sat(dot(N,Vv)),2.2); m.emit+=m.alb*ambientL(N)*fz*.9; m.alb*=.9+.2*nz(vUV*vec2(3.,9.)).r;
  } else if(id==14){ // whitewash plaster, rain streaks, salt
    vec4 n=tri3(vO*.23,N), n2=tri3(vO*2.1,N); float st=nz(vec2((vO.x+vO.z)*.35,vO.y*.035)).r; m.alb*=.78+.22*n.r+.12*(n2.r-.5); m.alb=mix(m.alb,vec3(.42,.34,.26),smoothstep(.56,.85,st)*.45); N=bump(N,vW,n2.r,.02*smoothstep(.15,.01,px)); m.rough=.85; m.wrap=.15;
  } else if(id==15){ // window / lamp glass, glows when uTint.y>0
    m.rough=.08; m.coat=1.; m.emit=vC.rgb*uTint.y;
  } else if(id==16){ // rope
    float t=fract(vUV.x*38.+vUV.y*3.); float h=sin(t*PI); m.alb*=.55+.6*h; N=bump(N,vW,h,.006); m.rough=.95; m.wrap=.25;
  } else if(id==17){ // down: soft fuzz with a bright fringe
    float n=nz(vO.xy*9.+vO.z*5.).r, n2=nz(vO.yz*31.).a; m.alb*=.86+.22*n; N=bump(N,vW,n+n2*.3,.006*smoothstep(.01,.001,px)); m.rough=1.; m.spec=.2; m.wrap=.55; m.trans=.5; m.tcol=m.alb; float fz=pow(1.-sat(dot(N,Vv)),1.8); m.emit+=m.alb*(ambientL(N)*1.1+keyCol(vW)*.22*sat(dot(N,keyDir(vW))*.5+.5))*fz*.55;
  } else if(id==18){ // feather: barbs off a shaft, soft sheen, light comes through it
    float t=vO.x,s=vO.y; float shaft=smoothstep(.09,.02,abs(s)); float barb=sin((t*1.0-abs(s)*.55)*140.+vO.z*9.); float far=smoothstep(.006,.0008,px); m.alb*=.93+.07*barb*far; m.alb=mix(m.alb,m.alb*vec3(.93,.90,.84),shaft*.5*far); m.alb*=.94+.10*nz(vec2(t*.7,s*.4)+vO.z).r; m.rough=.72; m.spec=.55; m.wrap=.36; m.trans=min(m.trans,.42); m.tcol=m.alb*vec3(1.06,.98,.88);
    float fz=pow(1.-sat(dot(N,Vv)),2.4); m.emit+=m.alb*ambientL(N)*fz*.35;
  } else if(id==19){ // grass, leaf
    m.rough=.7; m.wrap=.3; m.trans=.7; m.tcol=m.alb*vec3(1.2,1.25,.5); m.ao*=mix(.35,1.,vUV.x);
  } else if(id==20){ m.emit=vC.rgb*uTint.z; m.alb=vec3(0.); }
  else if(id==21){ // plumage under the feathers: short dense vane pattern on the loft itself
    vec2 u=vUV*vec2(32.5,18.85); u.y+=mod(floor(u.x),2.)*.5; vec2 f=fract(u)-vec2(.5); float h=1.-smoothstep(.0,.55,length(f*vec2(.8,1.1))); float far=smoothstep(.008,.001,px); N=bump(N,vW,h,.0022*far); m.alb*=mix(1.,.84+.20*h,far); m.rough=.85; m.spec=.4; m.wrap=.45; m.trans=.25; m.tcol=m.alb; float fz=pow(1.-sat(dot(N,Vv)),2.2); m.emit+=m.alb*ambientL(N)*fz*.4; }
  else if(id==22){ // bare face skin: pinkish, fine-grained
    float n=nz(vUV*vec2(5.,5.)).r,n2=nz(vUV*24.).a; N=bump(N,vW,n2,.0010*smoothstep(.006,.0006,px)); m.alb*=.88+.2*n; m.rough=.55; m.wrap=.45; m.trans=.25; m.tcol=m.alb*vec3(1.3,.45,.3); }
  else if(id==23){ // painted planks / boats
    float pl=fract(vO.y*9.); float seam=smoothstep(.0,.08,pl)*smoothstep(1.,.92,pl); vec4 n=tri3(vO*1.7,N); m.alb*=(.65+.35*seam)*(.8+.35*n.r); m.alb=mix(m.alb,vec3(.30,.24,.18),smoothstep(.66,.8,n.g)*.8); m.rough=.75; }
  else if(id==24){ // slate roof
    vec2 u=vUV; u.y+=mod(floor(u.x),2.)*.5; vec2 f=fract(u); float h=f.x*.7+.3*hash12(floor(u)); N=bump(N,vW,h,.03); m.alb*=.6+.6*hash12(floor(u)+3.); m.rough=.6; }
  return m;
}
`.replace(/TAU_/g, '6.2831853');
const FS_STD = GLSL_MATS + `
layout(location=0) out vec4 o;
void main(){
#ifdef SHADOWPASS
  o=vec4(1.); return;
#else
  if(uPass>.5&&uPass<1.5&&vW.y<uClip.x) discard;
  vec3 Vv=normalize(uCam-vW), N=normalize(vN); vec3 Ng=cross(dFdx(vW),dFdy(vW)); if(dot(Ng,Vv)<0.) Ng=-Ng; if(dot(N,Ng)<0.) N=-N;
  Mat m=surface(N,Vv); if(dot(N,Vv)<0.02) N=normalize(N+Vv*(.03-dot(N,Vv)));
  m.alb*=uTint.w>0.?1.:1.;
  // contact darkening just above the ground
  m.ao*=mix(1.,smoothstep(-.02,.22,vW.y-uWaterY),.25*vHero);
  vec3 c=shade(m,N,Vv,vW,gl_FragCoord.xy);
  c=applyAir(c,vW);
  o=vec4(max(c,0.),1.-vHero);
#endif
}`;
const STD = {};
function stdProg(v, hero) { const k = v + (hero ? 'H' : ''); if (!STD[k]) { const d = {}; v.split('+').forEach(x => { if (x) d[x] = true; }); if (hero) d.ISHERO = true; STD[k] = program('std ' + k, VS_STD, FS_STD, d); STD[k + 's'] = program('std ' + k + ' shadow', VS_STD, FS_STD, Object.assign({ SHADOWPASS: true }, d)); } return STD[k]; }
