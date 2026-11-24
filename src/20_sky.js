// ============================================================================
// 20_sky.js - the sky picture (half resolution: clear sky, sun, moon, clouds,
// stars) and the composite that puts it behind everything.
// ============================================================================
const SKY = {};
SKY.prog = program('sky', VS_TRI, `in vec2 uv; layout(location=0) out vec4 o; uniform float uN; uniform vec4 uMoon;
vec3 moon(vec3 d){ if(uMoon.w<.001) return vec3(0.); float r=acos(clamp(dot(d,uMoon.xyz),-1.,1.)); float R=.021; vec3 c=vec3(0.); if(r<R){ vec3 x=normalize(cross(vec3(0,1,0),uMoon.xyz)),y=cross(uMoon.xyz,x); vec2 p=vec2(dot(d,x),dot(d,y))/R; float z=sqrt(max(0.,1.-dot(p,p))); float n=texture(tNoise,p*.21+.3).r; float mare=smoothstep(.42,.62,texture(tNoise,p*.10+.71).r); float lit=smoothstep(-.1,.35,dot(normalize(vec3(p,z)),normalize(vec3(.55,.25,.55)))); c=vec3(1.,.94,.84)*(.55+.6*n)*(1.-.38*mare)*lit*1.4; c*=smoothstep(R,R*.96,r); } c+=vec3(.75,.82,1.)*(.06*exp(-r*18.)+.018*exp(-r*4.)); return c*uMoon.w; }
void main(){ vec2 q=uv*2.-1.; vec4 h=uIVP*vec4(q,1.,1.); vec3 rd=normalize(h.xyz/h.w-uCam);
 vec3 c=skyClear(rd); c+=starField(rd)+moon(rd)+sunDisc(rd)*(uPass>.5?.07:1.);
 vec4 cl=clouds(uCam,rd,ign(gl_FragCoord.xy+5.588238*mod(uFrame,64.)),int(uN)); 
 c=c*cl.a+cl.rgb;
 // a horizon veil: haze always lies on the sea
 c=mix(c,airColor(rd),exp(-max(rd.y,0.)*30.)*sat(uFogD*60.+.25));
 o=vec4(c,cl.a); }`);
SKY.comp = program('skyComp', `out vec2 uv; void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); uv=p; gl_Position=vec4(p*2.-1.,1.,1.); }`, `in vec2 uv; layout(location=0) out vec4 o; void main(){ vec2 t=1./vec2(textureSize(tSky,0)); vec3 c=texture(tSky,uv).rgb*.4; c+=(texture(tSky,uv+t*vec2(.7,.5)).rgb+texture(tSky,uv+t*vec2(-.7,.5)).rgb+texture(tSky,uv+t*vec2(.7,-.5)).rgb+texture(tSky,uv+t*vec2(-.7,-.5)).rgb)*.15; o=vec4(c,1.); }`);
