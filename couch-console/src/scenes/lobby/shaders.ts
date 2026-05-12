
export const CRT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;

export const CRT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  varying vec2 vUv;

  vec2 curve(vec2 uv){
    uv=(uv-0.5)*2.0;
    uv*=1.07;
    uv.x*=1.0+pow(abs(uv.y)/5.0,2.0);
    uv.y*=1.0+pow(abs(uv.x)/4.5,2.0);
    return uv*0.5+0.5;
  }

  float rand(vec2 co){
    return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
  }

  void main(){
    vec2 uv = vUv;

    // subtle CRT wobble
    uv.x += sin(uv.y * 10.0 + time * 1.5) * 0.002;
    uv.y += sin(uv.x * 8.0  + time * 1.2) * 0.0015;

    uv = curve(uv);

    // =========================
    // VIGNETTE (weaker / more transparent feel)
    // =========================
    float vig = 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);

    // was 0.12 → now softer edge falloff
    float vignette = pow(vig, 0.08);

    // =========================
    // VHS SYNC TEAR
    // =========================
    float t = floor(time * 6.0);
    float r1 = rand(vec2(t, 1.0));
    float r2 = rand(vec2(t, 2.0));
    float r3 = rand(vec2(t, 3.0));

    float tearOn = step(0.92, r1);
    float tearY = r2;

    float band = smoothstep(0.03, 0.0, abs(uv.y - tearY));

    float shift = (r3 - 0.5) * 0.25;
    float vJitter = (rand(vec2(t, uv.y * 10.0)) - 0.5) * 0.01;

    vec2 uvT = uv;
    uvT.x += shift * band * tearOn;
    uvT.y += vJitter * band * tearOn;

    // =========================
    // CHROMA SEPARATION (VHS)
    // =========================
    float caBase = 0.0012;
    float caTear = caBase + tearOn * band * 0.01;

    float driftR = sin(time * 10.0) * 0.002 * tearOn;
    float driftB = cos(time * 9.0)  * 0.002 * tearOn;

    vec3 col;

    col.r = texture2D(tDiffuse, vec2(uvT.x + caTear + driftR, uvT.y)).r;
    col.g = texture2D(tDiffuse, uvT).g;
    col.b = texture2D(tDiffuse, vec2(uvT.x - caTear - driftB, uvT.y)).b;

    // scanlines
    float scan = sin(uvT.y * 780.0 + time * 2.0) * 0.035;
    col -= scan;

    // apply vignette early (stable framing)
    col *= vignette;

    // flicker (slightly stronger for analog feel)
    col *= 1.0 + 0.01 * sin(120.0 * time);

    // =========================
    // NOISE BOOST (requested)
    // =========================
    float n1 = rand(uvT * (time * 60.0));
    float n2 = rand(uvT * 120.0 + time);

    float noise = (n1 + n2 - 1.0) * 0.06; // stronger + denser

    // extra grain during tear
    noise *= (1.0 + 0.5 * tearOn * band);

    col += noise;

    gl_FragColor = vec4(col, 1.0);
  }
`;