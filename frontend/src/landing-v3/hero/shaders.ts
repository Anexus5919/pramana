// GLSL for the block ground; the block material is v1's lid material laid flat, colours arrive as raw sRGB

export const groundVertex = /* glsl */ `
uniform float uCell;
uniform vec3 uCursor; // x, z, strength
uniform vec4 uHole[3]; // x, z, rx, rz
uniform vec4 uHoleK[3]; // disturb, sink, glow, opening
uniform float uFlow; // distance the floor has travelled toward the viewer
uniform vec2 uSpan; // nearest block depth, depth span the blocks wrap over
uniform float uHalfW; // visible half width per unit of depth
attribute vec2 aCell; // world x, resting world z
attribute float aSeed;
varying vec3 vN;
varying vec3 vLocal;
varying float vY;
varying float vH;
varying float vRim;
varying float vGlow;
varying float vSeed;
varying float vDist;
const float BOTTOM = -0.7;
void main() {
  // treadmill: blocks slide toward the viewer and wrap from below the screen edge back into the far haze
  float d = uSpan.x + mod(-aCell.y - uSpan.x - uFlow, uSpan.y);
  vec2 c = vec2(aCell.x, -d);
  // blocks outside the view at their current depth are dropped before any further work
  if (abs(c.x) > d * uHalfW + 1.2) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  // relief and seed travel with the block, so the moving floor never shimmers
  float relief = 0.5 + 0.5 * sin(aCell.x * 0.41 + aCell.y * 0.29) * cos(aCell.y * 0.33 - aCell.x * 0.17);
  float h = 0.04 + aSeed * 0.05 + relief * 0.15;
  h = floor(h / 0.05 + 0.5) * 0.05;
  vec2 dc = c - uCursor.xy;
  float att = exp(-dot(dc, dc) / (uCell * uCell * 7.0)) * uCursor.z;
  h += att * 0.2;
  vec2 push = vec2(0.0);
  float slide = 0.0;
  float gone = 0.0;
  float rim = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 H = uHole[i];
    vec4 K = uHoleK[i];
    vec2 q = (c - H.xy) / H.zw;
    float r = length(q);
    float ring = exp(-pow((r - 1.15) / 0.5, 2.0));
    float inside = 1.0 - smoothstep(0.55, 1.0, r);
    // an opening just wide enough for the hand; the flow slides around it like water around a rock
    float open = K.y * K.w;
    gone = max(gone, (1.0 - smoothstep(0.62, 1.0, r)) * open);
    slide += sign(q.x) * exp(-r * r * 0.7) * open * H.z * 0.38;
    h += K.x * ring * (0.28 + 0.12 * aSeed) - inside * K.y * 0.03 * (1.0 - K.w);
    push += (q / max(r, 0.001)) * K.x * ring;
    rim += K.z * exp(-r * r * 0.32);
  }
  h = mix(h, -0.12, gone);
  vec3 p = position;
  float w = uCell * 0.95 * (1.0 - 0.9 * gone);
  float y = mix(BOTTOM, h, p.z);
  // parted blocks tilt away from whatever pushed through them
  vec2 tilt = push * 0.42 * (y - BOTTOM) / (h - BOTTOM + 0.001) * p.z;
  vec3 world = vec3(c.x + slide + p.x * w + tilt.x, y, c.y - p.y * w + tilt.y);
  vN = vec3(normal.x, -normal.y, normal.z);
  vLocal = p;
  vY = y;
  vH = h;
  vRim = min(rim, 1.0);
  vGlow = att * 0.22;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const groundFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uSide;
uniform vec3 uSideDeep;
uniform vec3 uRim;
uniform vec3 uFog;
uniform vec2 uFogRange;
varying vec3 vN;
varying vec3 vLocal;
varying float vY;
varying float vH;
varying float vRim;
varying float vGlow;
varying float vSeed;
varying float vDist;
void main() {
  vec3 n = normalize(vN);
  vec3 col;
  if (n.z > 0.5) {
    col = uTop * (0.95 + 0.07 * vSeed);
    col *= 0.94 + 0.06 * smoothstep(0.0, 0.3, vH);
    vec2 q = vLocal.xy;
    float e = max(abs(q.x), abs(q.y));
    float bevel = smoothstep(0.41, 0.5, e);
    float lit = step(q.x, q.y);
    col = mix(col, col * mix(0.86, 1.1, lit), bevel * 0.75);
    col = mix(col, uRim, vRim * 0.34);
  } else {
    float l = clamp(0.62 + 0.38 * n.y - 0.1 * n.x, 0.0, 1.0);
    col = mix(uSideDeep, uSide, l);
    float ao = smoothstep(-0.62, max(vH, 0.12), vY);
    col *= mix(0.42, 1.0, ao);
    col = mix(col, uRim * 0.9, vRim * 0.2 * ao);
  }
  col += vec3(1.0, 0.86, 0.95) * min(vGlow, 1.2) * 0.32;
  float f = smoothstep(uFogRange.x, uFogRange.y, vDist);
  col = mix(col, uFog, f);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const skyVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

// v1's sky ramp, peach overhead through apricot and rose down to lilac haze at the horizon
export const skyFragment = /* glsl */ `
uniform float uHorizon; // ndc y of the horizon
uniform vec2 uAspect;
uniform vec2 uGlowAt; // ndc centre of the soft light behind the copy
uniform vec3 uPeach;
uniform vec3 uApricot;
uniform vec3 uRose;
uniform vec3 uLilac;
uniform vec3 uHaze;
uniform vec3 uGlow;
varying vec2 vNdc;
void main() {
  float s = clamp((vNdc.y - uHorizon) / (1.0 - uHorizon), 0.0, 1.0);
  vec3 c = mix(uHaze, uLilac, smoothstep(0.0, 0.1, s));
  c = mix(c, uRose, smoothstep(0.06, 0.4, s));
  c = mix(c, uApricot, smoothstep(0.36, 0.72, s));
  c = mix(c, uPeach, smoothstep(0.68, 1.0, s));
  vec2 g = (vNdc - uGlowAt) * uAspect;
  c = mix(c, uGlow, (1.0 - smoothstep(0.0, 1.0, length(g / vec2(0.95, 0.8)))) * 0.55);
  gl_FragColor = vec4(c, 1.0);
}
`;

export const quadVertex = /* glsl */ `
varying vec2 vUv;
varying vec2 vP;
void main() {
  vUv = uv;
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const quadFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}
`;

// The v2 almond eye, drawn analytically so the pupil and lids move without texture uploads
export const eyeFragment = /* glsl */ `
uniform vec2 uPupil; // hand units, y down
uniform float uOpen;
uniform float uScale;
uniform vec3 uInk;
varying vec2 vP;
void main() {
  vec2 p = vec2(vP.x, -vP.y) / uScale;
  float aa = max(fwidth(p.x), 0.001) * 0.8;
  float u = clamp(p.x / 40.0, -1.0, 1.0);
  float f = 24.75 * pow(max(1.0 - u * u, 0.0), 0.74) * uOpen;
  float dEdge = max(abs(p.y) - f, abs(p.x) - 40.0);
  float inA = 1.0 - smoothstep(-aa, aa, dEdge);
  vec3 col = vec3(1.0);
  float dp = length(p - uPupil) - 15.5;
  col = mix(col, uInk, 1.0 - smoothstep(-aa, aa, dp));
  float dh = length(p - uPupil - vec2(-5.0, -6.0)) - 4.6;
  col = mix(col, vec3(1.0), 1.0 - smoothstep(-aa, aa, dh));
  float t = clamp((p.x + 36.0) / 72.0, 0.0, 1.0);
  float ly = 1.0 + 28.0 * t * (1.0 - t);
  float dl = max(abs(p.y - ly) - 2.5, abs(p.x) - 36.0);
  float lash = (1.0 - smoothstep(-aa, aa, dl)) * clamp((0.32 - uOpen) / 0.2, 0.0, 1.0);
  float a = max(inA, lash);
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(col, uInk, lash), a);
}
`;
