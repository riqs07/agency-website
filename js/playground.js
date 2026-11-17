// Soft body playground.
//
// Each shape is a cloud of particles held together by shape matching: every
// step the particles are pulled back toward a rotated, slightly stretched copy
// of their rest pose. Contacts push particles of different shapes apart, so a
// shape dents where something presses on it and springs back afterwards.
// The smooth mesh you see is skinned to those particles.

import * as THREE from 'three';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';
import { mergeVertices } from './vendor/three/BufferGeometryUtils.js';

const canvas = document.getElementById('stage');
const hint = document.getElementById('hint');
const softnessInput = document.getElementById('softness');
const redropBtn = document.getElementById('redrop');
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------------------------------------------------------------- tuning

const VIEW_H = 10;          // world units visible top to bottom at z = 0
const FOV = 28;
const SUBSTEPS = 3;
const ITERATIONS = 2;
const DT = 1 / 60;
const GRAVITY = -26;
const FRICTION = 0.45;
const MAX_PARTICLES_PER_BODY = 80;
const SKIN_K = 8;
const BG = 0xe9e6ee;

let softness = softnessInput.value / 100;
const stiffness = () => 0.8 - 0.62 * softness;   // pull toward rest pose per iteration
const stretch = () => 0.3 + 0.4 * softness;     // how much whole-shape squash is allowed

// ---------------------------------------------------------------- cast

// shape, colour, finish. Order is the drop order.
const CAST = [
  ['donut', 0x8e7bef, 'satin'],
  ['slab',  0x2b4fe6, 'glitter'],
  ['cube',  0xf6a23c, 'satin'],
  ['pill',  0xf0564c, 'glossy'],
  ['ball',  0x2bb58a, 'glossy'],
  ['ball',  0xe63e7d, 'glossy'],
  ['cube',  0x6f86e8, 'matte'],
  ['donut', 0x4a5bd6, 'matte'],
  ['pill',  0xf3c3cb, 'matte'],
  ['ball',  0x74e2b8, 'glossy'],
  ['slab',  0xf7cf4a, 'satin'],
  ['pill',  0x19a7a0, 'glitter'],
  ['cube',  0xee6f9a, 'glossy'],
  ['ball',  0x8e7bef, 'matte'],
  ['donut', 0xf0564c, 'glossy'],
  ['slab',  0x2bb58a, 'satin'],
  ['ball',  0xf6a23c, 'glitter'],
  ['pill',  0x2b4fe6, 'glossy'],
  ['cube',  0x74e2b8, 'matte'],
  ['donut', 0xe63e7d, 'satin'],
  ['ball',  0xf3c3cb, 'satin'],
  ['pill',  0xf7cf4a, 'glossy'],
];

// Shapes are defined at size 1 and scaled. Each has a signed distance function
// in the same local frame as its mesh, used to fill it with particles.
const SHAPES = {
  ball(s) {
    const R = 0.5 * s;
    return {
      geometry: new THREE.IcosahedronGeometry(R, 14),
      sdf: (x, y, z) => Math.hypot(x, y, z) - R,
      bounds: [R, R, R], thin: R,
    };
  },
  donut(s) {
    const R = 0.36 * s, a = 0.185 * s;
    return {
      geometry: new THREE.TorusGeometry(R, a, 28, 80),
      sdf: (x, y, z) => Math.hypot(Math.hypot(x, y) - R, z) - a,
      bounds: [R + a, R + a, a], thin: a,
    };
  },
  pill(s) {
    const c = 0.29 * s, L = 0.62 * s;
    return {
      geometry: new THREE.CapsuleGeometry(c, L, 16, 40),
      sdf: (x, y, z) => Math.hypot(x, y - Math.max(-L / 2, Math.min(L / 2, y)), z) - c,
      bounds: [c, c + L / 2, c], thin: c,
    };
  },
  cube(s) { return roundedBox(0.43 * s, 0.43 * s, 0.43 * s, 0.14 * s); },
  slab(s) { return roundedBox(0.66 * s, 0.27 * s, 0.36 * s, 0.12 * s); },
};

function roundedBox(hx, hy, hz, rho) {
  return {
    geometry: new RoundedBoxGeometry(hx * 2, hy * 2, hz * 2, 10, rho),
    sdf: (x, y, z) => {
      const qx = Math.abs(x) - (hx - rho), qy = Math.abs(y) - (hy - rho), qz = Math.abs(z) - (hz - rho);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0))
        + Math.min(Math.max(qx, qy, qz), 0) - rho;
    },
    bounds: [hx, hy, hz], thin: Math.min(hx, hy, hz),
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fill a shape with evenly spread particles: scatter points inside, let them
// repel each other, and keep pushing strays back inside the surface.
function fillWithParticles(shape, rng) {
  const { sdf, bounds: [bx, by, bz], thin } = shape;
  let r = thin * 0.27, n = 0, spacing = 0, inset = 0;
  for (;;) {
    inset = r * 0.9;
    spacing = r * 1.3;
    let inside = 0;
    const tries = 4000;
    for (let i = 0; i < tries; i++) {
      if (sdf((rng() * 2 - 1) * bx, (rng() * 2 - 1) * by, (rng() * 2 - 1) * bz) <= -inset) inside++;
    }
    n = Math.round((inside / tries) * 8 * bx * by * bz / (spacing ** 3 * 0.8));
    if (n <= MAX_PARTICLES_PER_BODY) break;
    r *= 1.06;
  }
  n = Math.max(n, 8);

  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n;) {
    const x = (rng() * 2 - 1) * bx, y = (rng() * 2 - 1) * by, z = (rng() * 2 - 1) * bz;
    if (sdf(x, y, z) <= -inset) { pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z; i++; }
  }

  const reach = spacing * 1.35, e = thin * 0.01;
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pts[i * 3] - pts[j * 3], dy = pts[i * 3 + 1] - pts[j * 3 + 1], dz = pts[i * 3 + 2] - pts[j * 3 + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d < reach && d > 1e-9) {
          const k = 0.25 * (reach - d) / d;
          pts[i * 3] += dx * k; pts[i * 3 + 1] += dy * k; pts[i * 3 + 2] += dz * k;
          pts[j * 3] -= dx * k; pts[j * 3 + 1] -= dy * k; pts[j * 3 + 2] -= dz * k;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      for (let pass = 0; pass < 2; pass++) {
        const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        const d = sdf(x, y, z) + inset;
        if (d <= 0) break;
        let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
        let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
        let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
        const gl = Math.hypot(gx, gy, gz) || 1;
        pts[i * 3] -= (gx / gl) * d; pts[i * 3 + 1] -= (gy / gl) * d; pts[i * 3 + 2] -= (gz / gl) * d;
      }
    }
  }
  return { pts, n, r, spacing };
}

// ---------------------------------------------------------------- renderer

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('fallback').hidden = false;
  hint.hidden = true;
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 80);
const CAM_DIST = (VIEW_H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
camera.position.set(0, 0, CAM_DIST);

scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6e2, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.3);
key.position.set(-7, 10, 16);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.radius = 9;
key.shadow.blurSamples = 16;
key.shadow.bias = -0.0008;
key.shadow.normalBias = 0.04;
scene.add(key);

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: BG, roughness: 1, metalness: 0 })
);
backdrop.receiveShadow = true;
scene.add(backdrop);

function lighten(hex, amount) {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), amount);
}

function makeMaterial(hex, finish) {
  const base = { color: hex, metalness: 0 };
  if (finish === 'glossy') {
    return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
  }
  if (finish === 'matte') {
    return new THREE.MeshPhysicalMaterial({
      ...base, roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: lighten(hex, 0.55), envMapIntensity: 0.6,
    });
  }
  if (finish === 'satin') {
    return new THREE.MeshPhysicalMaterial({
      ...base, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.5, sheenRoughness: 0.6,
      sheenColor: lighten(hex, 0.4),
    });
  }
  // glitter: glossy shell with tiny flecks that catch the light as the surface turns
  const m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 rest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest;
        vec3 fleckHash(vec3 p) {
          p = fract(p * vec3(0.1031, 0.1030, 0.0973));
          p += dot(p, p.yxz + 33.33);
          return fract((p.xxy + p.yxx) * p.zyx);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 gp = vRest * 26.0;
          vec3 cell = floor(gp);
          vec3 h = fleckHash(cell);
          vec3 tilt = normalize(fleckHash(cell + 19.0) * 2.0 - 1.0);
          float dotMask = smoothstep(0.42, 0.12, length(fract(gp) - 0.5 - (h - 0.5) * 0.5));
          float glint = pow(max(dot(normalize(normal + tilt * 0.85), normalize(vViewPosition)), 0.0), 18.0);
          totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * step(0.45, h.x) * dotMask * glint * 1.6;
        }`);
  };
  return m;
}

// ---------------------------------------------------------------- world state

let W = 10, D = 3;                 // container width and depth
let floorY = -VIEW_H / 2;
let N = 0;                         // particle count
let pos, prev, vel, rest, rad, invMass;
let bodies = [];
let layoutKey = '';
let clock = 0;
let floorOpenUntil = -1;
let pairs = new Int32Array(4096), pairCount = 0;

function layoutFor(aspect) {
  const w = VIEW_H * aspect;
  const size = THREE.MathUtils.clamp(w * 0.42, 1.9, 2.7);
  const count = THREE.MathUtils.clamp(Math.round((w * VIEW_H * 0.6) / (size * size * 0.8)), 6, CAST.length);
  return { w, size, count };
}

function build() {
  for (const b of bodies) {
    scene.remove(b.mesh);
    b.mesh.geometry.dispose();
    b.mesh.material.dispose();
  }
  bodies = [];
  grabs.clear();

  const aspect = window.innerWidth / window.innerHeight;
  const { size, count } = layoutFor(aspect);
  layoutKey = count + ':' + size.toFixed(1);
  D = size * 1.2;

  const rng = mulberry32(7);
  const built = [];
  N = 0;
  for (let i = 0; i < count; i++) {
    const [shapeName, hex, finish] = CAST[i];
    const shape = SHAPES[shapeName](size * (0.92 + 0.16 * rng()));
    const fill = fillWithParticles(shape, rng);
    built.push({ shape, fill, hex, finish });
    N += fill.n;
  }

  pos = new Float32Array(N * 3);
  prev = new Float32Array(N * 3);
  vel = new Float32Array(N * 3);
  rest = new Float32Array(N * 3);
  rad = new Float32Array(N);
  invMass = new Float32Array(N);

  let start = 0;
  built.forEach(({ shape, fill, hex, finish }, index) => {
    const { pts, n, r, spacing } = fill;

    // rest pose relative to the centre of mass
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += pts[i * 3]; cy += pts[i * 3 + 1]; cz += pts[i * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
    const aqq = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let reach = 0;
    for (let i = 0; i < n; i++) {
      const p = start + i;
      const x = pts[i * 3] - cx, y = pts[i * 3 + 1] - cy, z = pts[i * 3 + 2] - cz;
      rest[p * 3] = x; rest[p * 3 + 1] = y; rest[p * 3 + 2] = z;
      rad[p] = r;
      invMass[p] = 1 / (r * r * r);
      aqq[0] += x * x; aqq[1] += x * y; aqq[2] += x * z;
      aqq[4] += y * y; aqq[5] += y * z; aqq[8] += z * z;
      reach = Math.max(reach, Math.hypot(x, y, z));
    }
    aqq[3] = aqq[1]; aqq[6] = aqq[2]; aqq[7] = aqq[5];

    // mesh: closed, smooth, skinned to the particles
    let geometry = shape.geometry;
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    geometry = mergeVertices(geometry, 1e-4);
    const P = geometry.attributes.position;
    const V = P.count;
    const restVerts = new Float32Array(P.array);
    geometry.setAttribute('rest', new THREE.BufferAttribute(restVerts, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    P.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);

    const skinIdx = new Uint16Array(V * SKIN_K);
    const skinW = new Float32Array(V * SKIN_K);
    const skinOff = new Float32Array(V * 3);
    const support = spacing * 2.3, support2 = support * support;
    const cand = [];
    for (let v = 0; v < V; v++) {
      const vx = restVerts[v * 3] - cx, vy = restVerts[v * 3 + 1] - cy, vz = restVerts[v * 3 + 2] - cz;
      cand.length = 0;
      let nearest = 0, nearestD = Infinity;
      for (let i = 0; i < n; i++) {
        const p = start + i;
        const dx = vx - rest[p * 3], dy = vy - rest[p * 3 + 1], dz = vz - rest[p * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < nearestD) { nearestD = d2; nearest = i; }
        if (d2 < support2) { const t = 1 - d2 / support2; cand.push([i, t * t * t]); }
      }
      if (!cand.length) cand.push([nearest, 1]);
      cand.sort((a, b) => b[1] - a[1]);
      const k = Math.min(SKIN_K, cand.length);
      // subtract the first dropped weight so influence fades to zero smoothly
      const floorW = cand.length > SKIN_K ? cand[SKIN_K][1] : 0;
      let sum = 0;
      for (let j = 0; j < k; j++) sum += cand[j][1] - floorW;
      if (sum < 1e-9) { cand[0][1] = 1 + floorW; sum = 1; }
      let ox = vx, oy = vy, oz = vz;
      for (let j = 0; j < k; j++) {
        const i = cand[j][0], w = (cand[j][1] - floorW) / sum, p = start + i;
        skinIdx[v * SKIN_K + j] = i;
        skinW[v * SKIN_K + j] = w;
        ox -= w * rest[p * 3]; oy -= w * rest[p * 3 + 1]; oz -= w * rest[p * 3 + 2];
      }
      skinOff[v * 3] = ox; skinOff[v * 3 + 1] = oy; skinOff[v * 3 + 2] = oz;
    }

    const mesh = new THREE.Mesh(geometry, makeMaterial(hex, finish));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);

    bodies.push({
      index, start, n, r, reach: reach + r,
      aqqInv: invert3(aqq),
      quat: [0, 0, 0, 1],
      T: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      cm: [0, 0, 0], bound: reach + r,
      active: false, spawnAt: 0,
      mesh, skinIdx, skinW, skinOff,
    });
    start += n;
  });

  resizeWorld();
  scheduleDrop(0.25);
}

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const s = 1 / det;
  return [A * s, (c * h - b * i) * s, (b * f - c * e) * s,
          B * s, (a * i - c * g) * s, (c * d - a * f) * s,
          C * s, (b * g - a * h) * s, (a * e - b * d) * s];
}

const dropRng = mulberry32((Math.random() * 1e9) | 0);

function scheduleDrop(delay) {
  bodies.forEach((b, i) => {
    b.active = false;
    b.mesh.visible = false;
    b.spawnAt = clock + delay + i * 0.24;
  });
}

function spawn(b) {
  // random orientation
  let qx = dropRng() * 2 - 1, qy = dropRng() * 2 - 1, qz = dropRng() * 2 - 1, qw = dropRng() * 2 - 1;
  const ql = Math.hypot(qx, qy, qz, qw) || 1;
  qx /= ql; qy /= ql; qz /= ql; qw /= ql;
  b.quat = [qx, qy, qz, qw];
  const R = rotationOf(b.quat);
  b.T = R.slice();

  const spanX = Math.max(0, W / 2 - b.reach);
  const spanZ = Math.max(0, D / 2 - b.reach);
  const cx = (dropRng() * 2 - 1) * spanX;
  const cy = VIEW_H / 2 + b.reach + 0.4;
  const cz = (dropRng() * 2 - 1) * spanZ;
  const vx = (dropRng() * 2 - 1) * 2, vy = -5;
  for (let i = 0; i < b.n; i++) {
    const p = (b.start + i) * 3;
    const x = rest[p], y = rest[p + 1], z = rest[p + 2];
    pos[p] = cx + R[0] * x + R[1] * y + R[2] * z;
    pos[p + 1] = cy + R[3] * x + R[4] * y + R[5] * z;
    pos[p + 2] = cz + R[6] * x + R[7] * y + R[8] * z;
    prev[p] = pos[p]; prev[p + 1] = pos[p + 1]; prev[p + 2] = pos[p + 2];
    vel[p] = vx; vel[p + 1] = vy; vel[p + 2] = 0;
  }
  b.cm = [cx, cy, cz];
  b.active = true;
  b.mesh.visible = true;
}

function rotationOf(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

// ---------------------------------------------------------------- physics

function shapeMatch(b, alpha, beta) {
  const { start, n } = b;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { const p = (start + i) * 3; cx += pos[p]; cy += pos[p + 1]; cz += pos[p + 2]; }
  cx /= n; cy /= n; cz /= n;
  b.cm[0] = cx; b.cm[1] = cy; b.cm[2] = cz;

  // Apq = sum of (current offset)(rest offset)^T
  let a00 = 0, a01 = 0, a02 = 0, a10 = 0, a11 = 0, a12 = 0, a20 = 0, a21 = 0, a22 = 0;
  for (let i = 0; i < n; i++) {
    const p = (start + i) * 3;
    const px = pos[p] - cx, py = pos[p + 1] - cy, pz = pos[p + 2] - cz;
    const qx = rest[p], qy = rest[p + 1], qz = rest[p + 2];
    a00 += px * qx; a01 += px * qy; a02 += px * qz;
    a10 += py * qx; a11 += py * qy; a12 += py * qz;
    a20 += pz * qx; a21 += pz * qy; a22 += pz * qz;
  }

  // Rotation part, tracked as a quaternion and nudged toward the best fit
  // (Müller et al., "A robust method to extract the rotational part of deformations").
  let [x, y, z, w] = b.quat;
  let R;
  for (let it = 0; it < 4; it++) {
    R = rotationOf([x, y, z, w]);
    const ox = (R[3] * a20 - R[6] * a10) + (R[4] * a21 - R[7] * a11) + (R[5] * a22 - R[8] * a12);
    const oy = (R[6] * a00 - R[0] * a20) + (R[7] * a01 - R[1] * a21) + (R[8] * a02 - R[2] * a22);
    const oz = (R[0] * a10 - R[3] * a00) + (R[1] * a11 - R[4] * a01) + (R[2] * a12 - R[5] * a02);
    const denom = Math.abs(R[0] * a00 + R[3] * a10 + R[6] * a20 + R[1] * a01 + R[4] * a11 + R[7] * a21
      + R[2] * a02 + R[5] * a12 + R[8] * a22) + 1e-9;
    const wx = ox / denom, wy = oy / denom, wz = oz / denom;
    const angle = Math.hypot(wx, wy, wz);
    if (angle < 1e-9) break;
    const s = Math.sin(angle / 2) / angle, c = Math.cos(angle / 2);
    const dx = wx * s, dy = wy * s, dz = wz * s;
    const nx = c * x + dx * w + dy * z - dz * y;
    const ny = c * y + dy * w + dz * x - dx * z;
    const nz = c * z + dz * w + dx * y - dy * x;
    const nw = c * w - dx * x - dy * y - dz * z;
    const l = Math.hypot(nx, ny, nz, nw);
    x = nx / l; y = ny / l; z = nz / l; w = nw / l;
  }
  b.quat[0] = x; b.quat[1] = y; b.quat[2] = z; b.quat[3] = w;
  R = rotationOf(b.quat);

  // Linear part: lets the whole shape squash and bulge while keeping its volume.
  const m = b.aqqInv, T = b.T;
  let l00 = a00 * m[0] + a01 * m[3] + a02 * m[6], l01 = a00 * m[1] + a01 * m[4] + a02 * m[7], l02 = a00 * m[2] + a01 * m[5] + a02 * m[8];
  let l10 = a10 * m[0] + a11 * m[3] + a12 * m[6], l11 = a10 * m[1] + a11 * m[4] + a12 * m[7], l12 = a10 * m[2] + a11 * m[5] + a12 * m[8];
  let l20 = a20 * m[0] + a21 * m[3] + a22 * m[6], l21 = a20 * m[1] + a21 * m[4] + a22 * m[7], l22 = a20 * m[2] + a21 * m[5] + a22 * m[8];
  const det = l00 * (l11 * l22 - l12 * l21) - l01 * (l10 * l22 - l12 * l20) + l02 * (l10 * l21 - l11 * l20);
  let bl = beta;
  if (det > 0.25 && det < 4) {
    const s = 1 / Math.cbrt(det);
    l00 *= s; l01 *= s; l02 *= s; l10 *= s; l11 *= s; l12 *= s; l20 *= s; l21 *= s; l22 *= s;
  } else {
    bl = 0;
  }
  const br = 1 - bl;
  T[0] = bl * l00 + br * R[0]; T[1] = bl * l01 + br * R[1]; T[2] = bl * l02 + br * R[2];
  T[3] = bl * l10 + br * R[3]; T[4] = bl * l11 + br * R[4]; T[5] = bl * l12 + br * R[5];
  T[6] = bl * l20 + br * R[6]; T[7] = bl * l21 + br * R[7]; T[8] = bl * l22 + br * R[8];

  for (let i = 0; i < n; i++) {
    const p = (start + i) * 3;
    const qx = rest[p], qy = rest[p + 1], qz = rest[p + 2];
    pos[p] += alpha * (cx + T[0] * qx + T[1] * qy + T[2] * qz - pos[p]);
    pos[p + 1] += alpha * (cy + T[3] * qx + T[4] * qy + T[5] * qz - pos[p + 1]);
    pos[p + 2] += alpha * (cz + T[6] * qx + T[7] * qy + T[8] * qz - pos[p + 2]);
  }
}

// Particle pairs from different shapes that are close enough to touch this substep.
function findPairs() {
  pairCount = 0;
  for (const b of bodies) {
    if (!b.active) continue;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < b.n; i++) { const p = (b.start + i) * 3; cx += pos[p]; cy += pos[p + 1]; cz += pos[p + 2]; }
    cx /= b.n; cy /= b.n; cz /= b.n;
    let far = 0;
    for (let i = 0; i < b.n; i++) {
      const p = (b.start + i) * 3;
      far = Math.max(far, (pos[p] - cx) ** 2 + (pos[p + 1] - cy) ** 2 + (pos[p + 2] - cz) ** 2);
    }
    b.cm[0] = cx; b.cm[1] = cy; b.cm[2] = cz;
    b.bound = Math.sqrt(far) + b.r;
  }
  for (let ai = 0; ai < bodies.length; ai++) {
    const a = bodies[ai];
    if (!a.active) continue;
    for (let bi = ai + 1; bi < bodies.length; bi++) {
      const b = bodies[bi];
      if (!b.active) continue;
      const reach = a.bound + b.bound;
      const dx = a.cm[0] - b.cm[0], dy = a.cm[1] - b.cm[1], dz = a.cm[2] - b.cm[2];
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      const margin = (a.r + b.r) * 0.25;
      const touch = a.r + b.r + margin, touch2 = touch * touch;
      const nearB = b.bound + a.r + margin, nearB2 = nearB * nearB;
      for (let i = a.start, ie = a.start + a.n; i < ie; i++) {
        const ix = pos[i * 3], iy = pos[i * 3 + 1], iz = pos[i * 3 + 2];
        const ex = ix - b.cm[0], ey = iy - b.cm[1], ez = iz - b.cm[2];
        if (ex * ex + ey * ey + ez * ez > nearB2) continue;
        for (let j = b.start, je = b.start + b.n; j < je; j++) {
          const px = ix - pos[j * 3], py = iy - pos[j * 3 + 1], pz = iz - pos[j * 3 + 2];
          if (px * px + py * py + pz * pz < touch2) {
            if (pairCount * 2 + 2 > pairs.length) {
              const bigger = new Int32Array(pairs.length * 2);
              bigger.set(pairs);
              pairs = bigger;
            }
            pairs[pairCount * 2] = i; pairs[pairCount * 2 + 1] = j;
            pairCount++;
          }
        }
      }
    }
  }
}

function solveContacts() {
  for (let k = 0; k < pairCount; k++) {
    const i = pairs[k * 2], j = pairs[k * 2 + 1];
    const i3 = i * 3, j3 = j * 3;
    let dx = pos[i3] - pos[j3], dy = pos[i3 + 1] - pos[j3 + 1], dz = pos[i3 + 2] - pos[j3 + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    const touch = rad[i] + rad[j];
    if (d2 >= touch * touch || d2 < 1e-12) continue;
    const d = Math.sqrt(d2);
    const pen = touch - d;
    dx /= d; dy /= d; dz /= d;
    const wi = invMass[i], wj = invMass[j], ws = wi + wj;
    const si = wi / ws, sj = wj / ws;
    pos[i3] += dx * pen * si; pos[i3 + 1] += dy * pen * si; pos[i3 + 2] += dz * pen * si;
    pos[j3] -= dx * pen * sj; pos[j3 + 1] -= dy * pen * sj; pos[j3 + 2] -= dz * pen * sj;

    // friction: cancel some of the sideways slip that happened this substep
    let rx = (pos[i3] - prev[i3]) - (pos[j3] - prev[j3]);
    let ry = (pos[i3 + 1] - prev[i3 + 1]) - (pos[j3 + 1] - prev[j3 + 1]);
    let rz = (pos[i3 + 2] - prev[i3 + 2]) - (pos[j3 + 2] - prev[j3 + 2]);
    const rn = rx * dx + ry * dy + rz * dz;
    rx -= dx * rn; ry -= dy * rn; rz -= dz * rn;
    const slip = Math.hypot(rx, ry, rz);
    if (slip > 1e-9) {
      const f = Math.min(1, (FRICTION * pen) / slip);
      pos[i3] -= rx * f * si; pos[i3 + 1] -= ry * f * si; pos[i3 + 2] -= rz * f * si;
      pos[j3] += rx * f * sj; pos[j3 + 1] += ry * f * sj; pos[j3 + 2] += rz * f * sj;
    }
  }
}

function solveWalls(floorOpen) {
  const hw = W / 2, hd = D / 2;
  for (const b of bodies) {
    if (!b.active) continue;
    for (let i = b.start, e = b.start + b.n; i < e; i++) {
      const p = i * 3, r = rad[i];
      if (pos[p] < -hw + r) pos[p] = -hw + r;
      else if (pos[p] > hw - r) pos[p] = hw - r;
      if (pos[p + 2] < -hd + r) pos[p + 2] = -hd + r;
      else if (pos[p + 2] > hd - r) pos[p + 2] = hd - r;
      if (!floorOpen && pos[p + 1] < floorY + r) {
        pos[p + 1] = floorY + r;
        pos[p] -= (pos[p] - prev[p]) * 0.35;
        pos[p + 2] -= (pos[p + 2] - prev[p + 2]) * 0.35;
      }
    }
  }
}

function step(dt) {
  clock += dt;
  const floorOpen = clock < floorOpenUntil;
  for (const b of bodies) {
    if (!b.active && clock >= b.spawnAt && !floorOpen) spawn(b);
    else if (b.active && b.cm[1] < floorY - b.reach * 2.5) { b.active = false; b.mesh.visible = false; }
  }

  const h = dt / SUBSTEPS;
  const alpha = stiffness(), beta = stretch();
  const drag = Math.exp(-0.5 * h);
  for (let s = 0; s < SUBSTEPS; s++) {
    for (const b of bodies) {
      if (!b.active) continue;
      const vmax = (0.85 * b.r) / h, vmax2 = vmax * vmax;
      for (let i = b.start, e = b.start + b.n; i < e; i++) {
        const p = i * 3;
        let vx = vel[p] * drag, vy = (vel[p + 1] + GRAVITY * h) * drag, vz = vel[p + 2] * drag;
        const v2 = vx * vx + vy * vy + vz * vz;
        if (v2 > vmax2) { const k = vmax / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }
        prev[p] = pos[p]; prev[p + 1] = pos[p + 1]; prev[p + 2] = pos[p + 2];
        pos[p] += vx * h; pos[p + 1] += vy * h; pos[p + 2] += vz * h;
      }
    }
    advanceGrabs();
    findPairs();
    for (let it = 0; it < ITERATIONS; it++) {
      for (const b of bodies) if (b.active) shapeMatch(b, alpha, beta);
      applyGrabs();
      solveContacts();
      solveWalls(floorOpen);
    }
    const inv = 1 / h;
    for (const b of bodies) {
      if (!b.active) continue;
      for (let p = b.start * 3, e = (b.start + b.n) * 3; p < e; p++) vel[p] = (pos[p] - prev[p]) * inv;
    }
  }
}

// ---------------------------------------------------------------- mesh skinning

function updateMeshes() {
  for (const b of bodies) {
    if (!b.active) continue;
    const g = b.mesh.geometry;
    const P = g.attributes.position.array, Nrm = g.attributes.normal.array, idx = g.index.array;
    const { skinIdx, skinW, skinOff, T, start } = b;
    const V = P.length / 3;
    for (let v = 0; v < V; v++) {
      const v3 = v * 3, vk = v * SKIN_K;
      const ox = skinOff[v3], oy = skinOff[v3 + 1], oz = skinOff[v3 + 2];
      let x = T[0] * ox + T[1] * oy + T[2] * oz;
      let y = T[3] * ox + T[4] * oy + T[5] * oz;
      let z = T[6] * ox + T[7] * oy + T[8] * oz;
      for (let k = 0; k < SKIN_K; k++) {
        const w = skinW[vk + k];
        if (w === 0) break;
        const p = (start + skinIdx[vk + k]) * 3;
        x += w * pos[p]; y += w * pos[p + 1]; z += w * pos[p + 2];
      }
      P[v3] = x; P[v3 + 1] = y; P[v3 + 2] = z;
    }
    Nrm.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, c = idx[t + 1] * 3, d = idx[t + 2] * 3;
      const e1x = P[c] - P[a], e1y = P[c + 1] - P[a + 1], e1z = P[c + 2] - P[a + 2];
      const e2x = P[d] - P[a], e2y = P[d + 1] - P[a + 1], e2z = P[d + 2] - P[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      Nrm[a] += nx; Nrm[a + 1] += ny; Nrm[a + 2] += nz;
      Nrm[c] += nx; Nrm[c + 1] += ny; Nrm[c + 2] += nz;
      Nrm[d] += nx; Nrm[d + 1] += ny; Nrm[d + 2] += nz;
    }
    for (let v = 0; v < Nrm.length; v += 3) {
      const l = Math.hypot(Nrm[v], Nrm[v + 1], Nrm[v + 2]) || 1;
      Nrm[v] /= l; Nrm[v + 1] /= l; Nrm[v + 2] /= l;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- grabbing

// pointerId -> { target, goal, list: [particle, weight, ox, oy, oz], depth }
const grabs = new Map();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function rayFrom(ev) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}

function pick(ray) {
  const o = ray.origin, d = ray.direction;
  let bestT = Infinity, best = null;
  for (const b of bodies) {
    if (!b.active) continue;
    for (let i = b.start, e = b.start + b.n; i < e; i++) {
      const p = i * 3, r = rad[i] * 1.12;
      const mx = pos[p] - o.x, my = pos[p + 1] - o.y, mz = pos[p + 2] - o.z;
      const along = mx * d.x + my * d.y + mz * d.z;
      const off2 = mx * mx + my * my + mz * mz - along * along;
      if (off2 > r * r) continue;
      const t = along - Math.sqrt(r * r - off2);
      if (t > 0 && t < bestT) { bestT = t; best = b; }
    }
  }
  return best ? { body: best, t: bestT } : null;
}

function pointOnDepth(ray, z) {
  const t = (z - ray.origin.z) / ray.direction.z;
  return [ray.origin.x + ray.direction.x * t, ray.origin.y + ray.direction.y * t, z];
}

function startGrab(ev) {
  const ray = rayFrom(ev);
  const hit = pick(ray);
  if (!hit) return;
  const b = hit.body;
  const hx = ray.origin.x + ray.direction.x * hit.t;
  const hy = ray.origin.y + ray.direction.y * hit.t;
  const hz = ray.origin.z + ray.direction.z * hit.t;
  const reach = Math.max(b.reach * 0.7, b.r * 3);
  const list = [];
  for (let i = b.start, e = b.start + b.n; i < e; i++) {
    const p = i * 3;
    const ox = pos[p] - hx, oy = pos[p + 1] - hy, oz = pos[p + 2] - hz;
    const d = Math.hypot(ox, oy, oz);
    if (d < reach) { const t = 1 - d / reach; list.push(i, t * t * (3 - 2 * t), ox, oy, oz); }
  }
  if (!list.length) return;
  grabs.set(ev.pointerId, { body: b, list, depth: hz, target: [hx, hy, hz], goal: [hx, hy, hz] });
  canvas.setPointerCapture(ev.pointerId);
  canvas.classList.add('grabbing');
  hint.classList.add('gone');
  ev.preventDefault();
}

function moveGrab(ev) {
  const g = grabs.get(ev.pointerId);
  if (g) {
    g.goal = pointOnDepth(rayFrom(ev), g.depth);
  } else if (ev.pointerType === 'mouse') {
    canvas.classList.toggle('can-grab', !!pick(rayFrom(ev)));
  }
}

function endGrab(ev) {
  if (!grabs.delete(ev.pointerId)) return;
  if (!grabs.size) canvas.classList.remove('grabbing');
}

// Move each held point toward the pointer, limited per substep so a fast flick
// can't drag particles straight through a neighbour.
function advanceGrabs() {
  for (const g of grabs.values()) {
    if (!g.body.active) continue;
    const dx = g.goal[0] - g.target[0], dy = g.goal[1] - g.target[1];
    const d = Math.hypot(dx, dy), maxStep = g.body.r * 0.8;
    const k = d > maxStep ? maxStep / d : 1;
    g.target[0] += dx * k; g.target[1] += dy * k;
  }
}

function applyGrabs() {
  for (const g of grabs.values()) {
    if (!g.body.active) continue;
    const { list, target } = g;
    for (let k = 0; k < list.length; k += 5) {
      const p = list[k] * 3, w = list[k + 1] * 0.7;
      pos[p] += (target[0] + list[k + 2] - pos[p]) * w;
      pos[p + 1] += (target[1] + list[k + 3] - pos[p + 1]) * w;
      pos[p + 2] += (target[2] + list[k + 4] - pos[p + 2]) * w;
    }
  }
}

canvas.addEventListener('pointerdown', startGrab);
canvas.addEventListener('pointermove', moveGrab);
canvas.addEventListener('pointerup', endGrab);
canvas.addEventListener('pointercancel', endGrab);
canvas.addEventListener('lostpointercapture', endGrab);
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

softnessInput.addEventListener('input', () => { softness = softnessInput.value / 100; });

redropBtn.addEventListener('click', () => {
  // open the floor, let everything fall out, then drop it all back in
  grabs.clear();
  canvas.classList.remove('grabbing');
  floorOpenUntil = clock + 1.3;
  bodies.forEach((b, i) => { b.spawnAt = floorOpenUntil + 0.1 + i * 0.24; });
});

// ---------------------------------------------------------------- sizing

function resizeWorld() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Walls and floor sit where the screen edges fall near the front of the pile,
  // so shapes resting against them stay in view.
  const inset = (CAM_DIST - D / 4) / CAM_DIST;
  W = VIEW_H * camera.aspect * inset;
  floorY = -(VIEW_H / 2) * (CAM_DIST - D / 2) / CAM_DIST;

  const backZ = -D / 2;
  const scale = (CAM_DIST - backZ) / CAM_DIST;
  backdrop.position.set(0, 0, backZ);
  backdrop.scale.set(VIEW_H * camera.aspect * scale * 1.2 + 4, VIEW_H * scale * 1.2 + 4, 1);

  const sc = key.shadow.camera;
  sc.left = -W / 2 - 4; sc.right = W / 2 + 4;
  sc.top = VIEW_H / 2 + 5; sc.bottom = -VIEW_H / 2 - 4;
  sc.near = 1; sc.far = 50;
  sc.updateProjectionMatrix();
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  resizeWorld();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const { size, count } = layoutFor(window.innerWidth / window.innerHeight);
    if (count + ':' + size.toFixed(1) !== layoutKey) build();
  }, 250);
});

// ---------------------------------------------------------------- loop

let last = performance.now(), acc = 0;
let debugEl = null, simMs = 0;
if (DEBUG) {
  debugEl = document.createElement('pre');
  debugEl.style.cssText = 'position:fixed;left:12px;bottom:12px;margin:0;font:12px ui-monospace,monospace;pointer-events:none';
  document.body.appendChild(debugEl);
  window.__squish = { get bodies() { return bodies; }, get pos() { return pos; }, step, get simMs() { return simMs; } };
}

function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min((now - last) / 1000, 0.05);
  last = now;
  const t0 = performance.now();
  let steps = 0;
  while (acc >= DT && steps < 3) { step(DT); acc -= DT; steps++; }
  if (steps === 3) acc = 0;
  if (steps) updateMeshes();
  if (DEBUG) {
    simMs += (performance.now() - t0 - simMs) * 0.05;
    debugEl.textContent = `${N} particles, ${pairCount} pairs, ${simMs.toFixed(2)} ms sim+skin`;
  }
  renderer.render(scene, camera);
}

build();
requestAnimationFrame(frame);
