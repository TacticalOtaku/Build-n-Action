import type { FxFlavor } from "../flavors";

/** Uniforms every flavour shader declares; the stage sets them all each frame. */
export const SHADER_UNIFORMS = [
  "u_resolution", "u_scale", "u_time", "u_seed", "u_intensity", "u_color0", "u_color1", "u_color2"
] as const;

/** A full-screen triangle; the fragment shader does all the work. */
export const VERTEX_SOURCE = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
// Card size in CSS pixels; u_scale is device pixels per CSS pixel.
uniform vec2 u_resolution;
uniform float u_scale;
uniform float u_time;
uniform float u_seed;
uniform float u_intensity;
uniform vec3 u_color0;
uniform vec3 u_color1;
uniform vec3 u_color2;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotation = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotation * p;
    amplitude *= 0.5;
  }
  return value;
}

// Fragment position in CSS pixels, so effects look the same on any pixel density.
vec2 fragPx() {
  return gl_FragCoord.xy / u_scale;
}

// Distance in pixels to the nearest card edge.
float edgeDistance(vec2 px) {
  vec2 d = min(px, u_resolution - px);
  return min(d.x, d.y);
}

// Premultiplied output scaled by the effect level.
void emit(vec3 color, float alpha) {
  float a = clamp(alpha * u_intensity, 0.0, 1.0);
  outColor = vec4(color * a, a);
}
`;

const FRAGMENTS: Record<FxFlavor, string> = {
  // Domain-warped flames licking up from the base rule, with a hot core and a glowing rim.
  fire: `
void main() {
  vec2 px = fragPx();
  float t = u_time + u_seed * 17.0;
  vec2 flow = vec2(px.x / 34.0, px.y / 34.0 - t * 1.5);
  float warp = fbm(flow * 0.7 + vec2(t * 0.15, 0.0));
  float n = fbm(flow * 1.3 + warp * 1.7);
  float height = 16.0 + 30.0 * n + 6.0 * sin(px.x * 0.05 + t * 2.0);
  float body = smoothstep(height, height * 0.2, px.y);
  float heat = clamp(body * (0.55 + 0.8 * n), 0.0, 1.0);
  vec3 color = mix(u_color0, u_color1, smoothstep(0.12, 0.55, heat));
  color = mix(color, u_color2, smoothstep(0.55, 0.95, heat));
  float rim = smoothstep(9.0, 0.0, edgeDistance(px)) * (0.25 + 0.2 * sin(t * 3.0 + px.x * 0.03));
  emit(color, heat * 0.95 + rim * (1.0 - body) * 0.6);
}`,

  // Frost crystals creeping in from the edges and receding, with a cold haze and glints.
  cold: `
void main() {
  vec2 px = fragPx();
  float t = u_time * 0.35 + u_seed * 9.0;
  float reach = mix(12.0, 32.0, 0.5 + 0.5 * sin(t));
  vec2 p = px / 11.0;
  float jag = (fbm(p * 0.6 + 3.0) - 0.5) * 20.0;
  float frost = smoothstep(reach, 0.0, edgeDistance(px) + jag);
  float ridges = pow(1.0 - abs(noise(p * 1.2) * 2.0 - 1.0), 7.0);
  float fine = pow(1.0 - abs(noise(p * 3.3 + 11.0) * 2.0 - 1.0), 9.0);
  float crystal = max(ridges, fine * 0.9) * frost;
  float haze = frost * 0.3 + 0.08 * fbm(px / 60.0 + vec2(u_time * 0.04, 0.0));
  float glint = clamp(pow(noise(px * 0.35 + u_time * 1.5), 18.0) * frost * 4.0, 0.0, 1.0);
  vec3 color = mix(u_color0, u_color1, crystal);
  color = mix(color, u_color2, glint);
  emit(color, crystal + haze + glint);
}`,

  // Branching bolts arcing between random points on the border, with a flash on each strike.
  lightning: `
vec2 perimeterPoint(float s) {
  float w = u_resolution.x;
  float h = u_resolution.y;
  float d = s * 2.0 * (w + h);
  if (d < w) return vec2(d, 0.0);
  d -= w;
  if (d < h) return vec2(w, d);
  d -= h;
  if (d < w) return vec2(w - d, h);
  d -= w;
  return vec2(0.0, h - d);
}

float bolt(vec2 px, vec2 a, vec2 b, float seed) {
  vec2 ab = b - a;
  float len = max(length(ab), 1.0);
  vec2 dir = ab / len;
  vec2 normal = vec2(-dir.y, dir.x);
  float s = clamp(dot(px - a, dir) / len, 0.0, 1.0);
  float offset = (fbm(vec2(s * 7.0, seed)) - 0.5) * 0.4 * len * sin(3.14159 * s);
  float branch = (fbm(vec2(s * 19.0, seed + 3.0)) - 0.5) * 0.12 * len * sin(3.14159 * s);
  float d = length(px - (a + ab * s + normal * (offset + branch)));
  return exp(-d * 0.75) + 0.3 * exp(-d * 0.1);
}

void main() {
  vec2 px = fragPx();
  float time = u_time * 2.4 + u_seed * 5.0;
  float cycle = floor(time);
  float phase = fract(time);
  float strike = step(phase, 0.34) * (1.0 - phase * 1.6);
  float glow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 a = perimeterPoint(hash(vec2(cycle, fi * 3.1 + 1.0)));
    vec2 b = perimeterPoint(hash(vec2(cycle, fi * 7.7 + 2.0)));
    glow += bolt(px, a, b, cycle + fi * 13.0) * step(0.3 * fi, hash(vec2(cycle, fi + 9.0)));
  }
  glow = clamp(glow, 0.0, 1.0);
  float rim = smoothstep(6.0, 0.0, edgeDistance(px)) * (0.12 + 0.3 * noise(vec2(px.x * 0.1 + px.y * 0.1, u_time * 7.0)));
  vec3 color = mix(u_color0, u_color2, glow);
  emit(color, glow * strike + strike * 0.12 + rim);
}`,

  // Slowly turning god rays from above with twinkling four-point stars.
  radiant: `
float star(vec2 px, float size, float salt) {
  vec2 cell = px / size;
  vec2 id = floor(cell);
  vec2 jitter = vec2(hash(id + salt), hash(id + salt + 7.0)) - 0.5;
  vec2 f = fract(cell) - 0.5 - jitter * 0.6;
  float twinkle = pow(0.5 + 0.5 * sin(u_time * 2.6 + hash(id + salt + 3.0) * 6.2831), 6.0);
  float core = exp(-length(f) * 26.0);
  float spikes = exp(-abs(f.x) * 90.0) * exp(-abs(f.y) * 9.0) + exp(-abs(f.y) * 90.0) * exp(-abs(f.x) * 9.0);
  return (core + spikes * 0.6) * twinkle * step(0.72, hash(id + salt + 1.0));
}

void main() {
  vec2 px = fragPx();
  vec2 source = vec2(u_resolution.x * (0.5 + 0.25 * sin(u_time * 0.2 + u_seed * 6.0)), u_resolution.y + 50.0);
  vec2 d = px - source;
  float angle = atan(d.x, -d.y);
  float rays = pow(0.5 + 0.5 * sin(angle * 16.0 + u_time * 0.45 + u_seed * 3.0), 3.0);
  rays *= 0.5 + 0.5 * noise(vec2(angle * 10.0, u_time * 0.35));
  float falloff = smoothstep(u_resolution.y * 2.2, u_resolution.y * 0.3, length(d));
  float halo = smoothstep(u_resolution.y * 1.2, 0.0, length(d)) * 0.35;
  float stars = clamp(star(px, 22.0, u_seed * 31.0) + star(px + 11.0, 15.0, u_seed * 57.0 + 5.0) * 0.7, 0.0, 1.0);
  vec3 color = mix(u_color0, u_color1, rays);
  color = mix(color, u_color2, stars);
  emit(color, rays * falloff * 0.6 + halo + stars);
}`,

  // Heavy, twisting smoke rising from the base with a sickly inner glow.
  necrotic: `
void main() {
  vec2 px = fragPx();
  vec2 uv = px / u_resolution;
  vec2 p = px / 42.0;
  float t = u_time * 0.3 + u_seed * 11.0;
  vec2 q = vec2(fbm(p + vec2(0.0, -t)), fbm(p + vec2(5.2, -t * 1.3)));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, -t * 1.8)), fbm(p + 3.0 * q + vec2(8.3, -t * 1.5)));
  float n = fbm(p + 3.5 * r);
  float mask = smoothstep(1.05, 0.0, uv.y);
  float smoke = smoothstep(0.35, 0.8, n) * mask;
  float embers = smoothstep(0.7, 0.9, n) * smoothstep(0.65, 0.0, uv.y);
  vec3 color = mix(u_color0, u_color1, embers);
  color = mix(color, u_color2, smoothstep(0.85, 1.0, n) * embers);
  emit(color, smoke * 0.8 + embers * 0.85);
}`,

  // A simmering pool along the base: wobbling surface, rising bubbles and falling drops.
  acid: `
void main() {
  vec2 px = fragPx();
  float t = u_time + u_seed * 7.0;
  float surface = 16.0 + 4.0 * sin(px.x * 0.06 + t * 2.1) + 5.0 * (noise(vec2(px.x * 0.04, t * 0.8)) - 0.5);
  float liquid = smoothstep(surface + 1.5, surface - 1.5, px.y);
  float meniscus = exp(-abs(px.y - surface) * 0.6);
  vec2 cell = vec2(px.x / 13.0, px.y / 13.0 - t * 1.3);
  cell.y += hash(vec2(floor(cell.x), 4.0)) * 5.0;
  vec2 id = floor(cell);
  vec2 f = fract(cell) - 0.5;
  float radius = 0.12 + 0.18 * hash(id);
  float ring = smoothstep(radius, radius - 0.07, length(f)) - smoothstep(radius - 0.1, radius - 0.16, length(f));
  float bubbles = ring * step(0.62, hash(id + 3.0)) * smoothstep(surface + 34.0, surface, px.y);
  float column = floor(px.x / 34.0);
  float dripX = (column + 0.5) * 34.0 + (hash(vec2(column, 1.0)) - 0.5) * 18.0;
  float dripY = u_resolution.y * (1.0 - fract(t * 0.35 + hash(vec2(column, 2.0))));
  float drip = exp(-length(vec2((px.x - dripX) * 1.4, (px.y - dripY) * 0.6)) * 0.45) * step(0.5, hash(vec2(column, 3.0)));
  vec3 color = mix(u_color0, u_color1, meniscus);
  color = mix(color, u_color2, clamp(bubbles + drip, 0.0, 1.0));
  emit(color, liquid * 0.55 + meniscus * 0.6 + bubbles * 0.9 + drip * 0.8);
}`,

  // A toxic fog slowly swirling around the centre.
  poison: `
void main() {
  vec2 px = fragPx();
  vec2 p = (px - u_resolution * 0.5) / 46.0;
  float t = u_time * 0.25 + u_seed * 6.0;
  float angle = t * 0.6 + length(p) * 0.6;
  mat2 spin = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 swirl = spin * p;
  float n = fbm(swirl * 1.4 + fbm(swirl + t) * 1.8);
  float tone = fbm(swirl * 2.3 - t);
  float mist = smoothstep(0.36, 0.82, n);
  float edge = smoothstep(28.0, 0.0, edgeDistance(px)) * 0.4;
  vec3 color = mix(u_color0, u_color1, tone);
  color = mix(color, u_color2, smoothstep(0.7, 0.9, n));
  emit(color, mist * 0.75 + edge * mist);
}`,

  // Shockwave rings bursting from random points, with a trailing wake and ringing bands.
  thunder: `
float wave(vec2 px, float offset) {
  float time = u_time * 0.7 + u_seed * 3.0 + offset;
  float cycle = floor(time);
  float phase = fract(time);
  vec2 origin = vec2(hash(vec2(cycle, 2.0)), hash(vec2(cycle, 5.0))) * u_resolution;
  float radius = phase * max(u_resolution.x, u_resolution.y) * 1.1;
  float dist = length(px - origin);
  float front = exp(-abs(dist - radius) * 0.22) * (1.0 - phase);
  float wake = exp(-abs(dist - radius * 0.82) * 0.12) * (1.0 - phase) * 0.35;
  return front + wake;
}

void main() {
  vec2 px = fragPx();
  float energy = wave(px, 0.0) + wave(px, 0.5) * 0.7;
  float bands = 0.08 * (0.5 + 0.5 * sin(px.y * 0.35 + u_time * 8.0)) * smoothstep(0.1, 0.6, energy);
  vec3 color = mix(u_color0, u_color1, clamp(energy, 0.0, 1.0));
  color = mix(color, u_color2, smoothstep(0.8, 1.2, energy));
  emit(color, energy * 0.9 + bands);
}`,

  // A hexagonal barrier with pulses rolling across it and a charged rim.
  force: `
float hexDistance(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}

void main() {
  vec2 px = fragPx();
  vec2 p = px / 15.0;
  vec2 spacing = vec2(1.0, 1.7320508);
  vec2 a = mod(p, spacing) - spacing * 0.5;
  vec2 b = mod(p - spacing * 0.5, spacing) - spacing * 0.5;
  vec2 cell = (dot(a, a) < dot(b, b)) ? a : b;
  float lines = smoothstep(0.07, 0.0, 0.5 - hexDistance(cell));
  vec2 center = vec2(u_resolution.x * (0.5 + 0.4 * sin(u_time * 0.5 + u_seed * 4.0)), u_resolution.y * 0.5);
  float pulse = pow(0.5 + 0.5 * sin(length(px - center) * 0.07 - u_time * 3.2), 6.0);
  float rim = smoothstep(14.0, 0.0, edgeDistance(px));
  vec3 color = mix(u_color0, u_color1, pulse);
  color = mix(color, u_color2, rim * 0.5);
  emit(color, lines * (0.14 + 0.75 * pulse) + rim * 0.45 + pulse * 0.1);
}`,

  // Two drifting sources whose waves interfere into shifting, mirage-like bands.
  psychic: `
void main() {
  vec2 px = fragPx();
  float t = u_time + u_seed * 8.0;
  vec2 source = u_resolution * vec2(0.5 + 0.3 * sin(t * 0.23), 0.5 + 0.35 * cos(t * 0.19));
  float warp = fbm(px / 38.0 + vec2(t * 0.15, -t * 0.1)) * 5.0;
  float field = length(px - source) * 0.075 - t * 1.4 + warp;
  float contour = pow(0.5 + 0.5 * cos(field * 3.14159), 22.0);
  float echo = pow(0.5 + 0.5 * cos((field + 0.5) * 3.14159), 40.0) * 0.3;
  float haze = smoothstep(0.35, 0.9, fbm(px / 45.0 - vec2(t * 0.08, 0.0)));
  float fade = smoothstep(0.0, 70.0, length(px - source));
  vec3 color = mix(u_color0, u_color1, 0.5 + 0.5 * sin(field * 0.7 + t));
  color = mix(color, u_color2, contour);
  emit(color, (contour * 0.6 + echo) * fade + haze * 0.22);
}`
};

export function buildFragment(flavor: FxFlavor): string {
  return `${COMMON}${FRAGMENTS[flavor]}`;
}
