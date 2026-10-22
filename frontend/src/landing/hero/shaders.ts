// GLSL for the voxel eye; colours arrive as raw sRGB vec3 uniforms and are written without conversion

const shapeChunk = /* glsl */ `
uniform vec4 uShape; // A, top, bottom, p (world units)
uniform float uOpen;
float shapeF(float x) {
  float u = clamp(x / uShape.x, -1.0, 1.0);
  return pow(max(1.0 - u * u, 0.0), uShape.w);
}
// signed distance outside the almond (positive = on a lid)
float lidDistance(vec2 c) {
  float f = shapeF(c.x);
  float eps = 0.04;
  float fd = (shapeF(c.x + eps) - shapeF(c.x - eps)) / (2.0 * eps);
  float seam = -0.18 * uShape.z;
  float topK = mix(seam, uShape.y, uOpen);
  float botK = mix(seam, -uShape.z, uOpen);
  float top = topK * f;
  float bot = botK * f;
  float d;
  if (c.y >= top) d = (c.y - top) / sqrt(1.0 + topK * topK * fd * fd);
  else if (c.y <= bot) d = (bot - c.y) / sqrt(1.0 + botK * botK * fd * fd);
  else d = -min(top - c.y, c.y - bot);
  d = max(d, abs(c.x) - uShape.x);
  return d;
}
float apertureGap(float x) {
  float seam = -0.18 * uShape.z;
  return (mix(seam, uShape.y, uOpen) - mix(seam, -uShape.z, uOpen)) * shapeF(x);
}
`;

const pulseChunk = /* glsl */ `
uniform float uTime;
uniform vec4 uPulse[4]; // x, y, t0, amp
float pulseAt(vec2 c) {
  float acc = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 P = uPulse[i];
    float age = uTime - P.z;
    if (P.w > 0.0 && age > 0.0 && age < 2.4) {
      float r = age * 8.0;
      float dd = length(c - P.xy) - r;
      acc += exp(-dd * dd / 0.45) * (1.0 - age / 2.4) * P.w;
    }
  }
  return acc;
}
`;

export const lidVertex = /* glsl */ `
${shapeChunk}
${pulseChunk}
uniform float uCell;
uniform float uMaxH;
uniform float uRamp;
uniform vec3 uCursor; // x, y, strength
attribute vec2 aCell;
attribute float aSeed;
varying vec3 vN;
varying vec3 vLocal;
varying float vZ;
varying float vH;
varying float vEdge;
varying float vGlow;
varying float vSeed;
void main() {
  float d = lidDistance(aCell);
  if (apertureGap(aCell.x) < uCell * 0.9) d = max(d, uCell * 0.5);
  float grow = smoothstep(-0.32 * uCell, 0.04 * uCell, d);
  float t = clamp(d / uRamp, 0.0, 1.0);
  float h = 0.16 + uMaxH * pow(t, 1.35) + aSeed * 0.34 * smoothstep(0.0, 0.5, t);
  h = floor(h / 0.14 + 0.5) * 0.14;
  vec2 dc = aCell - uCursor.xy;
  float att = exp(-dot(dc, dc) / 1.1) * uCursor.z;
  float pulse = pulseAt(aCell);
  h += att * 0.62 + pulse * 0.55;
  h *= grow;
  vec3 p = position;
  float w = uCell * 0.95 * grow;
  vec3 world = vec3(aCell + p.xy * w, mix(-2.3, h, p.z));
  if (grow < 0.002) world = vec3(aCell, -60.0);
  vN = normal;
  vLocal = p;
  vZ = world.z;
  vH = h;
  vEdge = d;
  vGlow = att * 0.22 + pulse;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

export const lidFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uSide;
uniform vec3 uSideDeep;
uniform vec3 uRim;
varying vec3 vN;
varying vec3 vLocal;
varying float vZ;
varying float vH;
varying float vEdge;
varying float vGlow;
varying float vSeed;
void main() {
  vec3 n = normalize(vN);
  vec3 col;
  if (n.z > 0.5) {
    col = uTop * (0.95 + 0.07 * vSeed);
    // gentle depth cue: faces nearer the aperture sit slightly cooler
    col *= 0.94 + 0.06 * smoothstep(0.0, 2.2, vH);
    vec2 q = vLocal.xy;
    float e = max(abs(q.x), abs(q.y));
    float bevel = smoothstep(0.41, 0.5, e);
    float lit = step(q.x, q.y);
    col = mix(col, col * mix(0.86, 1.1, lit), bevel * 0.75);
    float rim = 1.0 - smoothstep(0.0, 1.5, vEdge);
    col = mix(col, uRim, rim * 0.3);
  } else {
    float l = clamp(0.62 + 0.38 * n.y - 0.1 * n.x, 0.0, 1.0);
    col = mix(uSideDeep, uSide, l);
    float ao = smoothstep(-2.0, max(vH, 0.2), vZ);
    col *= mix(0.42, 1.0, ao);
    float rim = 1.0 - smoothstep(0.0, 1.2, vEdge);
    col = mix(col, uRim * 0.9, rim * 0.18 * ao);
  }
  col += vec3(1.0, 0.86, 0.95) * min(vGlow, 1.2) * 0.32;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const irisVertex = /* glsl */ `
${pulseChunk}
uniform float uPupilR;
uniform float uIrisR;
uniform vec4 uRead[4]; // angle, t0, tone, amp
attribute vec4 aPolar; // r, theta, dr, dtheta
attribute vec2 aRnd; // spoke noise, block noise
varying vec3 vN;
varying vec3 vLocal;
varying float vT;
varying float vSpoke;
varying float vRnd;
varying float vGlow;
varying float vRead;
varying float vReadTone;
varying float vZ;
varying float vH;
void main() {
  float r = aPolar.x;
  float th = aPolar.y;
  vec2 dir = vec2(cos(th), sin(th));
  vec2 tg = vec2(-dir.y, dir.x);
  float w = r * aPolar.w * 0.9;
  float L = aPolar.z * 0.9;
  float tt = (r - uPupilR) / (uIrisR - uPupilR);
  float h = 0.05 + aRnd.x * 0.2 + aRnd.y * 0.03 + 0.05 * smoothstep(0.5, 0.0, tt);
  vec2 c = dir * r;
  float pulse = pulseAt(c);
  float read = 0.0;
  float tone = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 R = uRead[i];
    float age = uTime - R.y;
    if (R.w > 0.0 && age > 0.0 && age < 1.6) {
      float da = atan(sin(th - R.x), cos(th - R.x));
      float k = exp(-da * da / 0.02) * smoothstep(0.0, 0.15, age) * (1.0 - age / 1.6);
      if (k > read) { read = k; tone = R.z; }
    }
  }
  h += pulse * 0.45 + read * 0.35;
  vec3 p = position;
  vec2 xy = dir * (r + p.y * L) + tg * (p.x * w);
  vec3 local = vec3(xy, p.z * h);
  vN = vec3(tg * normal.x + dir * normal.y, normal.z);
  vLocal = p;
  vT = tt;
  vSpoke = aRnd.x;
  vRnd = aRnd.y;
  vGlow = pulse;
  vRead = read;
  vReadTone = tone;
  vZ = p.z;
  vH = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

export const irisFragment = /* glsl */ `
uniform vec3 uInner;
uniform vec3 uMid;
uniform vec3 uOuter;
uniform vec3 uLimbal;
uniform vec3 uFadeTo;
uniform float uFade;
uniform vec3 uToneOk;
uniform vec3 uToneWarn;
uniform vec3 uToneBad;
varying vec3 vN;
varying vec3 vLocal;
varying float vT;
varying float vSpoke;
varying float vRnd;
varying float vGlow;
varying float vRead;
varying float vReadTone;
varying float vZ;
varying float vH;
void main() {
  vec3 n = normalize(vN);
  vec3 c = mix(uInner, uMid, smoothstep(0.0, 0.55, vT));
  c = mix(c, uOuter, smoothstep(0.4, 0.85, vT));
  c *= 0.94 + 0.26 * vSpoke + 0.05 * vRnd;
  c = mix(c, uLimbal, smoothstep(0.8, 1.0, vT) * 0.25);
  c = mix(c, uLimbal, smoothstep(0.1, 0.0, vT) * 0.55);
  if (n.z > 0.5) {
    vec2 q = vLocal.xy;
    float e = max(abs(q.x), abs(q.y));
    c = mix(c, c * 1.12, smoothstep(0.38, 0.5, e) * step(0.0, q.y) * 0.6);
  } else {
    c *= 0.7 + 0.15 * n.y + 0.15 * vZ;
  }
  vec3 toneCol = vReadTone < 0.5 ? uToneOk : (vReadTone < 1.5 ? uToneWarn : uToneBad);
  c = mix(c, toneCol, vRead * 0.55);
  c += vec3(1.0, 0.9, 0.97) * min(vGlow, 1.2) * 0.3;
  c = mix(c, uFadeTo, uFade);
  gl_FragColor = vec4(c, 1.0);
}
`;

export const lensVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const lensFragment = /* glsl */ `
uniform vec3 uLens;
uniform vec3 uEdge;
uniform vec3 uRuff;
uniform float uScale;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0) * uScale;
  float body = 1.0 - smoothstep(0.9, 1.0, r);
  vec3 col = mix(uLens, uEdge, smoothstep(0.35, 1.0, r) * 0.55);
  float ruff = exp(-pow((r - 0.985) / 0.022, 2.0));
  col = mix(col, uRuff, ruff * 0.65);
  float a = max(body * 0.95, ruff * 0.85);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}
`;

export const scleraVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

export const scleraFragment = /* glsl */ `
${shapeChunk}
uniform vec2 uHalf;
uniform float uCamY;
uniform vec3 uPeach;
uniform vec3 uApricot;
uniform vec3 uRose;
uniform vec3 uLilac;
uniform vec3 uGlow;
uniform vec3 uShade;
varying vec2 vNdc;
void main() {
  vec2 w = vec2(vNdc.x * uHalf.x, vNdc.y * uHalf.y + uCamY);
  float s = vNdc.y * 0.5 + 0.5;
  vec3 c = mix(uLilac, uRose, smoothstep(0.0, 0.34, s));
  c = mix(c, uApricot, smoothstep(0.32, 0.68, s));
  c = mix(c, uPeach, smoothstep(0.64, 1.0, s));
  float g = length(w / vec2(uShape.x * 0.75, uShape.y * 1.1));
  c = mix(c, uGlow, (1.0 - smoothstep(0.0, 1.0, g)) * 0.75);
  float f = shapeF(w.x);
  float top = uShape.y * f * uOpen;
  float bot = -uShape.z * f * uOpen;
  float dt = max(top - w.y, 0.0);
  float db = max(w.y - bot, 0.0);
  c = mix(c, uShade, exp(-dt / 0.55) * 0.3 + exp(-db / 0.4) * 0.12);
  gl_FragColor = vec4(c, 1.0);
}
`;
