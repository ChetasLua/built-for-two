// ============================================================================
// 22_post.js - the lens and the lab: ambient occlusion, depth of field, motion
// blur, bloom, halation, shafts, beam, tone curve, print grade, grain, frame.
// ============================================================================
const POST = {};
const GLSL_DEPTH = `float linZ(float d){ return uNear*uFar/(uFar-d*(uFar-uNear)); } vec3 worldAt(vec2 uv,float d){ vec4 h=uIVP*vec4(vec3(uv,d)*2.-1.,1.); return h.xyz/h.w; }`;
POST.ao = program('ao', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; ${GLSL_DEPTH}
void main(){ float d=texture(tDepth,uv).r; if(d>=.99999){ o=vec4(1.,1.,0.,1.); return; } float z=linZ(d); vec3 P=vec3((uv*2.-1.)*uTan*z,-z); vec2 px=1./vec2(textureSize(tDepth,0));
 vec2 t=px*2.; vec3 pr=vec3(((uv+vec2(t.x,0.))*2.-1.)*uTan,-1.), pl=vec3(((uv-vec2(t.x,0.))*2.-1.)*uTan,-1.), pu=vec3(((uv+vec2(0.,t.y))*2.-1.)*uTan,-1.), pd=vec3(((uv-vec2(0.,t.y))*2.-1.)*uTan,-1.);
 pr*=linZ(texture(tDepth,uv+vec2(t.x,0.)).r); pl*=linZ(texture(tDepth,uv-vec2(t.x,0.)).r); pu*=linZ(texture(tDepth,uv+vec2(0.,t.y)).r); pd*=linZ(texture(tDepth,uv-vec2(0.,t.y)).r);
 vec3 dx=abs(pr.z-P.z)<abs(P.z-pl.z)?pr-P:P-pl, dy=abs(pu.z-P.z)<abs(P.z-pd.z)?pu-P:P-pd; vec3 N=normalize(cross(dx,dy));
 float R=.16+.012*z; float rs=R/(uTan.y*z)*.5; rs=min(rs,.14); float a=ign(gl_FragCoord.xy)*6.283, occ=0.; float asp=uRes.x/uRes.y;
 for(int i=0;i<14;i++){ float f=(float(i)+.5)/14.; float r=rs*f; float th=a+float(i)*2.399963; vec2 q=uv+vec2(cos(th)/asp,sin(th))*r; float zz=linZ(texture(tDepth,q).r); vec3 S=vec3((q*2.-1.)*uTan*zz,-zz)-P; float l2=dot(S,S); float v=dot(N,S)/sqrt(l2+1e-5); occ+=max(0.,v-.06)*(1.-smoothstep(R*R*.35,R*R*1.6,l2)); }
 o=vec4(sat(1.-occ/14.*2.3),z,0.,1.); }`);
POST.aoBlur = program('aoBlur', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform vec2 uDir; void main(){ vec2 t=uDir/vec2(textureSize(tA,0)); vec2 c=texture(tA,uv).rg; float s=c.r,w=1.; for(int i=-3;i<=3;i++){ if(i==0) continue; vec2 q=texture(tA,uv+t*float(i)).rg; float k=exp(-float(i*i)*.14)*exp(-abs(q.g-c.g)/(c.g*.02+.01)); s+=q.r*k; w+=k; } o=vec4(s/w,c.g,0.,1.); }`);
// scene + ao + circle of confusion, half res. a = signed coc in units of frame height
POST.coc = program('coc', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform vec4 uLens; ${GLSL_DEPTH}
float coc(float z){ float c=uLens.y*(1./uLens.x-1./z); return clamp(c,-uLens.z,uLens.z); }
void main(){ vec2 t=1./vec2(textureSize(tA,0)); vec3 s=vec3(0.); float mn=1e9,w=0.; float cc=0.; 
 for(int i=0;i<4;i++){ vec2 q=uv+t*(vec2(i&1,i>>1)*2.-1.)*.5; float z=linZ(texture(tDepth,q).r); float c=coc(z); vec3 k=texture(tA,q).rgb; float lw=1./(1.+lum(k)*.25); s+=k*lw; w+=lw; if(i==0||abs(c)>abs(cc)) cc=c; mn=min(mn,c); }
 o=vec4(s/w,mn<-uLens.z*.02?min(mn,cc):cc); }`);
POST.dof = program('dof', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform vec4 uLens; void main(){ vec4 c0=texture(tA,uv); float asp=uRes.x/uRes.y; float maxR=uLens.z; float a0=ign(gl_FragCoord.xy)*6.283; vec3 fs=vec3(0.); float fw_=0.; vec3 ns=vec3(0.); float nw=0.; float nc=0.; float cr=max(c0.a,0.);
 const int N=42; for(int i=0;i<N;i++){ float f=sqrt((float(i)+.5)/float(N)); float th=a0+float(i)*2.399963; float r=f*maxR; vec2 q=uv+vec2(cos(th)/asp,sin(th)*1.06)*r; vec4 s=texture(tA,q); float sc=abs(s.a); 
  float hi=1.+ .55*smoothstep(.8,4.,lum(s.rgb));
  if(s.a>0.){ float k=smoothstep(r-.0022,r+.0012,min(sc,cr+ (s.a<=c0.a+.0008?1.:0.)*sc))*hi; float ww=k/(sc*sc*900.+.06); fs+=s.rgb*ww; fw_+=ww; }
  else { float k=smoothstep(r-.0022,r+.0012,sc)*hi; float ww=k; ns+=s.rgb*ww; nw+=ww; nc+=k/hi; } }
 vec3 far=fw_>0.?fs/fw_:c0.rgb; float na=sat(nc/float(N)*2.4*sat(1.)); vec3 nr=nw>0.?ns/nw:c0.rgb; float fa=smoothstep(.0007,.0024,cr); vec3 c=mix(c0.rgb,far,fa); c=mix(c,nr,na); o=vec4(c,na); }`);
POST.mb = program('mblur', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform float uShut; ${GLSL_DEPTH} uniform mat4 uPrevHero;
void main(){ vec4 c0=texture(tA,uv); float d=texture(tDepth,uv).r; vec3 wp=worldAt(uv,d); float hero=1.-c0.a; vec4 pw=uPVP*vec4(wp,1.); vec4 ph=uPVP*vec4(wp-uHeroD,1.); vec2 vw=uv-(pw.xy/pw.w*.5+.5), vh=uv-(ph.xy/ph.w*.5+.5); vec2 v=(hero>.5?vh:vw)*uShut; float l=length(v*vec2(uRes.x/uRes.y,1.)); if(l<.0006){ o=c0; return; } if(l>.05) v*=.05/l; 
 vec3 s=c0.rgb; float w=1.; float j=ign(gl_FragCoord.xy)-.5; for(int i=0;i<9;i++){ float f=(float(i)+.5+j)/9.-.5; vec4 q=texture(tA,uv+v*f); float k=(abs(q.a-c0.a)<.5)?1.:.0; s+=q.rgb*k; w+=k; } o=vec4(s/w,c0.a); }`);
POST.down = program('bloomDown', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform float uFirst; void main(){ vec2 t=1./vec2(textureSize(tA,0)); 
 vec3 a=texture(tA,uv+t*vec2(-2,-2)).rgb,b=texture(tA,uv+t*vec2(0,-2)).rgb,c=texture(tA,uv+t*vec2(2,-2)).rgb,d=texture(tA,uv+t*vec2(-2,0)).rgb,e=texture(tA,uv).rgb,f=texture(tA,uv+t*vec2(2,0)).rgb,g=texture(tA,uv+t*vec2(-2,2)).rgb,h=texture(tA,uv+t*vec2(0,2)).rgb,i=texture(tA,uv+t*vec2(2,2)).rgb,j=texture(tA,uv+t*vec2(-1,-1)).rgb,k=texture(tA,uv+t*vec2(1,-1)).rgb,l=texture(tA,uv+t*vec2(-1,1)).rgb,m=texture(tA,uv+t*vec2(1,1)).rgb;
 vec3 s=(j+k+l+m)*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+e*.125; if(uFirst>.5){ s=min(s,vec3(16.)); float L=lum(s); s*=mix(.10,1.,smoothstep(.7,2.6,L)); } o=vec4(s,1.); }`);
POST.up = program('bloomUp', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform float uR; void main(){ vec2 t=uR/vec2(textureSize(tA,0)); vec3 s=texture(tA,uv).rgb*4.; s+=2.*(texture(tA,uv+t*vec2(1,0)).rgb+texture(tA,uv+t*vec2(-1,0)).rgb+texture(tA,uv+t*vec2(0,1)).rgb+texture(tA,uv+t*vec2(0,-1)).rgb); s+=texture(tA,uv+t).rgb+texture(tA,uv-t).rgb+texture(tA,uv+t*vec2(1,-1)).rgb+texture(tA,uv+t*vec2(-1,1)).rgb; o=vec4(s/16.,1.); }`);
POST.shaft = program('shafts', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform vec4 uSunS; void main(){ vec2 d=(uSunS.xy-uv); float j=ign(gl_FragCoord.xy); vec3 s=vec3(0.); for(int i=0;i<26;i++){ float f=(float(i)+j)/26.; vec2 q=uv+d*f*.92; float m=texture(tDepth,q).r>.99999?1.:0.; vec3 k=texture(tA,q).rgb*m; s+=min(k,vec3(8.))*(1.-f); } float r=length(d*vec2(uRes.x/uRes.y,1.)); o=vec4(s/26.*exp(-r*1.7)*uSunS.z,1.); }`);
POST.final = program('final', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; ${GLSL_DEPTH}
uniform vec4 uLens,uGr0,uGr1,uGr2,uGr3,uMatte,uFx,uFx2; uniform vec3 uTintS,uTintH;
// AgX (T. Sobotka) sigmoid fit
vec3 agx(vec3 v){ const mat3 M=mat3(.842479062,.0423282422,.0423756549,.0784335999,.878468636,.0784336,.0792237451,.0791661274,.879142973); v=M*max(v,1e-6); v=clamp(log2(v),-12.47393,4.026069); v=(v+12.47393)/16.5; vec3 x2=v*v,x4=x2*x2; v=15.5*x4*x2-40.14*x4*v+31.96*x4-6.868*x2*v+.4298*x2+.1191*v-.00232; return v; }
vec3 agxOut(vec3 v){ const mat3 M=mat3(1.19687900512,-.0528968517574,-.0529716355144,-.0980208811401,1.15190312990,-.0980434501171,-.0990297440797,-.0989611768448,1.15107367264); return clamp(M*v,0.,1.); }
float gr(vec2 p,float s){ vec2 i=floor(p); return hash12(i+s*13.7); }
void main(){
 vec2 px=1./uRes.xy; vec2 q=uv; 
 // frame: matte aspect -> bars
 float asp=uRes.x/uRes.y; float want=uMatte.x; vec2 hb=vec2(1.); if(want<asp) hb.x=want/asp; else hb.y=asp/want; vec2 m2=abs(uv*2.-1.); float rx=uMatte.y*2./uRes.y; vec2 e=(m2-hb)*uRes.xy*.5; float rad=uMatte.y; vec2 ee=e+rad; float sd=length(max(ee,0.))+min(max(ee.x,ee.y),0.)-rad; float bar=smoothstep(.75,-.75,sd);
 vec2 cc=(uv-.5)*vec2(asp,1.); float r2=dot(cc,cc);
 float ca=uFx.z*r2*.0016; vec3 c; vec4 ctr=texture(tA,q);
 c.r=texture(tA,q+(uv-.5)*ca).r; c.g=ctr.g; c.b=texture(tA,q-(uv-.5)*ca).b;
 // dof composite (full-res where sharp)
 vec4 df=texture(tB,uv); float ff=0.; { vec2 ip=1./vec2(textureSize(tDepth,0)); for(int i=0;i<9;i++){ vec2 oo=vec2(float(i%3)-1.,float(i/3)-1.)*.8; float z=linZ(texture(tDepth,uv+oo*ip).r); float cz=clamp(uLens.y*(1./uLens.x-1./z),-uLens.z,uLens.z); float w=(i==4?.28:.09); ff+=smoothstep(.00075,.0026,max(cz,0.))*w; } }
 float fm=max(ff,smoothstep(.12,.75,df.a)); c=mix(c,df.rgb,fm);
 vec3 bl=texture(tC,uv).rgb; c=mix(c,bl,uFx.x); c+=bl*uFx.x*.35; c+=bl*vec3(1.,.32,.10)*uFx2.x;          // bloom + halation
 c+=texture(tD,uv).rgb*uFx.y;                                                                              // shafts
 // a lens veil
 c=c*uGr0.x; c+=uFx2.w;
 vec3 x=agx(c); 
 // grade in the log-ish display space
 x=pow(x,vec3(uGr0.y)); float L=lum(x); x=mix(vec3(L),x,uGr0.z);
 x=x*(1.+(uGr1.rgb-.5)*2.*.5)+ (uGr2.rgb-.5)*.22*(1.-x)*(1.-x);
 x=mix(x,x*mix(uTintS,uTintH,smoothstep(.12,.78,L)),uGr0.w);
 x=agxOut(x); x=clamp((x-uGr3.x)/(uGr3.y-uGr3.x),0.,1.); x=pow(x,vec3(1.)); 
 float vg=1.-uFx.w*smoothstep(.12,1.15,r2*1.25); x*=vg;
 // grain: two sizes, more in the mids
 float fs=uFrame; vec2 gp=gl_FragCoord.xy*(1080./uRes.y); float g1=gr(gp*1.,mod(fs,61.)), g2=texture(tNoise,gp*.0031+hash22(vec2(mod(fs,61.),3.))).a; float g=(g1*.5+g2*.5-.5); float lx=lum(x); x+=g*uFx2.y*(.35+1.3*lx*(1.-lx)*2.)*mix(vec3(1.),vec3(1.06,1.,.9),.5);
 x=mix(uFx2.zzz*vec3(.9,.92,1.),x,bar); x+= (ign(gl_FragCoord.xy+fs*2.7)-.5)/255.;
 o=vec4(x*uMatte.z,1.); }`);
// lighthouse beam / lamp cone in the air: integral of an inverse-square-ish cone along the ray
POST.air = program('airfx', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; ${GLSL_DEPTH} uniform vec4 uBm0,uBm1,uBm2;
float beam(vec3 ro,vec3 rd,float tm,vec3 a,vec3 ax,float spread,out vec3 at){ float acc=0.; float n=20.; 
 // march only where the ray is near the axis
 vec3 w=ro-a; float b=dot(rd,ax),d=dot(rd,w),e=dot(ax,w); float den=1.-b*b; float tc=den>1e-4?(b*e-d)/den:0.; float s=e+tc*b; tc=clamp(tc,0.,tm); float rad=.5+max(s,0.)*spread; float ext=min(rad*6./max(sqrt(den),.06),tm); float t0=max(0.,tc-ext),t1=min(tm,tc+ext); float dt=(t1-t0)/n; float j=ign(gl_FragCoord.xy+mod(uFrame,8.)*3.1); 
 for(float i=0.;i<n;i++){ vec3 p=ro+rd*(t0+dt*(i+j)); vec3 v=p-a; float ss=dot(v,ax); if(ss<0.) continue; float r=length(v-ax*ss); float R=.45+ss*spread; float k=exp(-r*r/(R*R)*2.2); float dens=.55+.9*texture(tNoise3,p*.013+vec3(uTime*.01,0.,0.)).r*texture(tNoise3,p*.05-vec3(0.,0.,uTime*.03)).g; dens*=exp(-max(p.y-uWaterY,0.)*.018)+uRain*1.2; acc+=k*dens*dt*(.5/R+.012)*exp(-ss*.0035); } at=vec3(tc); return acc; }
void main(){ float d=texture(tDepth,uv).r; vec3 wp=worldAt(uv,min(d,.99999)); vec3 rd=wp-uCam; float tm=length(rd); rd/=tm; if(d>=.99999) tm=900.; vec3 at; float g=beam(uCam,rd,tm,uBm0.xyz,uBm1.xyz,uBm1.w,at); float g2=beam(uCam,rd,tm,uBm0.xyz,-uBm1.xyz,uBm1.w,at); 
 float head=pow(sat(dot(normalize(uBm0.xyz-uCam),-uBm1.xyz)),900.)*uBm2.w; 
 o=vec4(uBm2.rgb*(g+g2)*uBm0.w,0.); }`);
