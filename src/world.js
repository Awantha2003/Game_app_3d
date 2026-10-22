// Builds a mission's world: terrain, water, lighting, instanced props and the
// simple collision shapes used for movement and bullets.

import * as THREE from 'three';
import { meshParts, models } from './assets.js';
import { fbm, mulberry32 } from './noise.js';

// Collision shapes per model, in three.js model space before rotation/scale.
// c = vertical cylinder, b = box. h = height above the prop's base.
const COLLIDERS = {
  palm_coconut: [{ t: 'c', x: 0, z: 0, r: 0.3, h: 9 }],
  palm_palmyrah: [{ t: 'c', x: 0, z: 0, r: 0.3, h: 12 }],
  tree_jungle: [{ t: 'c', x: 0, z: 0, r: 0.45, h: 7 }],
  bush: [],
  rock_outcrop: [{ t: 'c', x: 0, z: 0, r: 12, h: 12 }, { t: 'c', x: 6, z: -4, r: 5.5, h: 14 }, { t: 'c', x: -7, z: 3, r: 5.5, h: 6 }],
  rock_small: [{ t: 'c', x: 0, z: 0, r: 1.1, h: 0.9 }],
  house: [{ t: 'b', x: 0, z: 0, hw: 3.5, hd: 2.5, h: 4.5 }],
  house_ruined: [{ t: 'b', x: 0, z: 0, hw: 3.5, hd: 2.5, h: 1.6 }],
  bunker: [{ t: 'c', x: 0, z: 0, r: 1.85, h: 1.6 }],
  sandbag_wall: [{ t: 'b', x: 0, z: 0, hw: 1.9, hd: 0.22, h: 0.75 }],
  earth_bund: [{ t: 'b', x: 0, z: 0, hw: 10, hd: 2.6, h: 2.9 }],
  buffel: [{ t: 'b', x: 0, z: 0.1, hw: 1.2, hd: 2.3, h: 3.1 }],
  seatiger_boat: [{ t: 'b', x: 0, z: -0.1, hw: 1.2, hd: 4, h: 1.6 }],
  water_tower: [{ t: 'c', x: 0, z: 0, r: 1.4, h: 7.5 }, { t: 'b', x: 0, z: 9.8, hw: 1.3, hd: 7, h: 2.5 }, { t: 'c', x: 0.6, z: 18.5, r: 4, h: 7 }],
  sluice_gate: [{ t: 'b', x: 0, z: 0, hw: 8.75, hd: 2, h: 4.2 }],
  supplies: [{ t: 'b', x: 0.4, z: 0, hw: 1.0, hd: 0.7, h: 1 }],
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(scene, mission, seed = 1234) {
    this.scene = scene;
    this.mission = mission;
    this.cfg = mission.world;
    this.size = this.cfg.size;
    this.water = this.cfg.water;
    this.rng = mulberry32(seed);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.placements = {};
    this.spawns = [];
    this.targets = [];
    this.supplies = [];
    this.units = [];

    this.buildEnvironment();
    this.buildTerrain();
    mission.layout(this.api());
    this.scatter(mission.world.border || 'palm_coconut', 90,
      { x0: -this.size - 50, x1: this.size + 50, z0: -this.size - 50, z1: this.size + 50 }, { ring: true });
    this.buildInstances();
    this.buildGrass();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.userData.ownGeometry) o.geometry.dispose();
    });
  }

  height(x, z) {
    return this.cfg.height(x, z);
  }

  isWater(x, z, depth = 0.5) {
    return this.water !== null && this.height(x, z) < this.water - depth;
  }

  // ---------------------------------------------------------------- scene

  buildEnvironment() {
    const c = this.cfg;
    this.scene.background = new THREE.Color(c.sky);
    this.scene.fog = new THREE.Fog(c.fog[0], c.fog[1], c.fog[2]);
    const hemi = new THREE.HemisphereLight(c.sky, '#5a5235', 1.1);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d8', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.sunOffset = new THREE.Vector3(-50, 90, 35);
    this.group.add(sun, sun.target);
    this.sun = sun;
  }

  followSun(pos) {
    this.sun.position.copy(pos).add(this.sunOffset);
    this.sun.target.position.copy(pos);
  }

  buildTerrain() {
    const S = (this.size + 70) * 2;
    const seg = 200;
    const geo = new THREE.PlaneGeometry(S, S, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const [ca, cb] = this.cfg.ground.map((h) => new THREE.Color(h));
    const sand = new THREE.Color('#b8a678');
    const mud = new THREE.Color('#5b513a');
    const dark = new THREE.Color('#4d6a26');
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.05 + 7, z * 0.05);
      col.copy(ca).lerp(cb, n);
      if (this.cfg.paddy) {
        const gx = Math.abs(((x + 1000) % 22) - 11), gz = Math.abs(((z + 1000) % 18) - 9);
        if (gx > 10.2 || gz > 8.2) col.lerp(dark, 0.6);
        else col.lerp(new THREE.Color('#9cbf48'), 0.25 * fbm(x * 0.2, z * 0.2));
      }
      col.multiplyScalar(0.85 + fbm(x * 0.4, z * 0.4, 2) * 0.3);
      if (this.water !== null) {
        if (h < this.water + 0.7) col.lerp(sand, Math.min(1, (this.water + 0.7 - h) * 1.5));
        if (h < this.water - 0.2) col.lerp(mud, 0.7);
      }
      colors.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    mesh.receiveShadow = true;
    mesh.userData.ownGeometry = true;
    this.group.add(mesh);

    if (this.water !== null) {
      const wgeo = new THREE.PlaneGeometry(S * 2, S * 2);
      wgeo.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({
        color: '#3d6f78', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82,
      }));
      water.position.y = this.water;
      water.userData.ownGeometry = true;
      this.group.add(water);
    }
  }

  // ---------------------------------------------------------------- layout API

  api() {
    const w = this;
    return {
      rng: () => w.rng(),
      prop: (type, x, z, rot = 0, scale = 1) => w.addProp(type, x, z, rot, scale),
      scatter: (type, n, area, opts) => w.scatter(type, n, area, opts),
      enemies: (n, x, z, spread, tag) => w.addSpawns('ltte', n, x, z, spread, tag),
      friendlies: (n, x, z, spread) => w.addSpawns('army', n, x, z, spread, 'linkup'),
      civilians: (n, x, z, spread) => w.addSpawns('civ', n, x, z, spread, 'civ'),
      target: (tag, x, z, opts = {}) => w.addTarget(tag, x, z, opts),
    };
  }

  addProp(type, x, z, rot = 0, scale = 1) {
    const y = this.height(x, z);
    (this.placements[type] ||= []).push({ x, y, z, rot, scale });
    this.addColliders(type, x, y, z, rot, scale);
    if (type === 'supplies') this.supplies.push({ x, z });
  }

  addColliders(type, x, y, z, rot, scale, ref = null) {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for (const s of COLLIDERS[type] || []) {
      const lx = s.x * scale, lz = s.z * scale;
      const c = {
        t: s.t, x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos,
        y0: y - 0.5, y1: y + s.h * scale, rot, ref,
      };
      if (s.t === 'c') c.r = s.r * scale;
      else { c.hw = s.hw * scale; c.hd = s.hd * scale; }
      this.colliders.push(c);
    }
  }

  blocked(x, z, margin) {
    for (const c of this.colliders) if (this.circleOverlap(c, x, z, margin)) return true;
    return false;
  }

  scatter(type, n, area, opts = {}) {
    const avoid = opts.avoid || [];
    const S = this.size;
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const x = area.x0 + this.rng() * (area.x1 - area.x0);
      const z = area.z0 + this.rng() * (area.z1 - area.z0);
      if (opts.ring && Math.abs(x) < S + 4 && Math.abs(z) < S + 4) continue;
      if (this.isWater(x, z, -0.3)) continue;
      if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
      if (type !== 'bush' && this.blocked(x, z, 2.5)) continue;
      this.addProp(type, x, z, this.rng() * Math.PI * 2, 0.8 + this.rng() * 0.45);
      i++;
    }
  }

  addSpawns(team, n, x, z, spread, tag) {
    for (let i = 0; i < n; i++) {
      let px = x, pz = z;
      for (let k = 0; k < 40; k++) {
        px = x + (this.rng() - 0.5) * spread * 2;
        pz = z + (this.rng() - 0.5) * spread * 2;
        if (!this.isWater(px, pz, 0.2) && !this.blocked(px, pz, 0.8)) break;
      }
      this.spawns.push({ team, x: px, z: pz, tag });
    }
  }

  addTarget(tag, x, z, opts) {
    const y = this.height(x, z);
    const t = { tag, x, y, z, label: opts.label || tag, time: opts.time || 2, plant: !!opts.plant, done: false, obj: null };
    if (opts.model) {
      const obj = models[opts.model].clone(true);
      obj.position.set(x, Math.max(y, this.water ?? y) - 0.2, z);
      obj.rotation.y = opts.rot || 0;
      this.group.add(obj);
      t.obj = obj;
      this.addColliders(opts.model, x, y, z, opts.rot || 0, 1, t);
    }
    this.targets.push(t);
  }

  buildInstances() {
    for (const [type, list] of Object.entries(this.placements)) {
      for (const part of meshParts(type)) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        im.castShadow = type !== 'bush';
        im.receiveShadow = true;
        list.forEach((p, i) => {
          tmpQ.setFromAxisAngle(UP, p.rot);
          tmpS.setScalar(p.scale);
          tmpP.set(p.x, p.y, p.z);
          tmpM.compose(tmpP, tmpQ, tmpS).multiply(part.matrix);
          im.setMatrixAt(i, tmpM);
        });
        im.computeBoundingSphere();
        this.group.add(im);
      }
    }
  }

  buildGrass() {
    // Simple crossed-blade grass tufts, instanced for cheap ground cover.
    const blade = new THREE.BufferGeometry();
    const verts = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.25, cz = Math.sin(a) * 0.25;
      const tri = [-cx, 0, -cz, cx, 0, cz, cx * 0.2, 0.32, cz * 0.2];
      // both windings so each side is front-facing and lit from above
      verts.push(...tri, ...tri.slice(3, 6), ...tri.slice(0, 3), ...tri.slice(6, 9));
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    // point every normal up so the blades are lit like the ground they grow from
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(verts.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    const count = 9000;
    const im = new THREE.InstancedMesh(blade, mat, count);
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const x = (this.rng() - 0.5) * (this.size + 20) * 2;
      const z = (this.rng() - 0.5) * (this.size + 20) * 2;
      if (this.isWater(x, z, -0.5)) continue;
      tmpQ.setFromAxisAngle(UP, this.rng() * 6.28);
      tmpS.set(0.8, 0.6 + this.rng() * 1.0, 0.8);
      tmpP.set(x, this.height(x, z) - 0.05, z);
      im.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS));
      im.setColorAt(n, col.set(this.cfg.ground[this.rng() < 0.5 ? 0 : 1]).multiplyScalar(0.8 + this.rng() * 0.35));
      n++;
    }
    im.count = n;
    im.receiveShadow = true;
    im.userData.ownGeometry = true;
    this.group.add(im);
  }

  // ---------------------------------------------------------------- collision

  circleOverlap(c, x, z, r) {
    if (c.t === 'c') return Math.hypot(x - c.x, z - c.z) < c.r + r;
    const dx = x - c.x, dz = z - c.z;
    const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
    const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    return Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r;
  }

  // Push a circle (x, z, radius) at height y out of all colliders. Mutates pos.
  resolve(pos, radius) {
    for (const c of this.colliders) {
      if (c.y1 < pos.y + 0.45 || c.y0 > pos.y + 1.6) continue;
      if (c.t === 'c') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + radius;
        if (d < min && d > 1e-4) {
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
        }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
        let lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        const ox = c.hw + radius - Math.abs(lx), oz = c.hd + radius - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) lx += Math.sign(lx || 1) * ox;
          else lz += Math.sign(lz || 1) * oz;
          pos.x = c.x + lx * cos + lz * sin;
          pos.z = c.z - lx * sin + lz * cos;
        }
      }
    }
    const lim = this.size - 2;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }

  // Ray test against terrain, water, props, targets and units.
  // Returns { t, point, kind: 'terrain'|'water'|'prop'|'unit', unit, head, target } or null.
  raycast(o, d, maxT = 300, ignore = null, withUnits = true) {
    let best = { t: maxT, kind: null };

    for (const c of this.colliders) {
      const t = c.t === 'c' ? rayCyl(o, d, c) : rayBox(o, d, c);
      if (t !== null && t < best.t) best = { t, kind: c.ref ? 'target' : 'prop', target: c.ref };
    }

    if (withUnits) {
      for (const u of this.units) {
        if (!u.alive || u === ignore) continue;
        const p = u.pos, bh = u.bodyHeight;
        const th = raySphere(o, d, p.x, p.y + bh + 0.14, p.z, 0.15);
        if (th !== null && th < best.t) best = { t: th, kind: 'unit', unit: u, head: true };
        const tb = rayCyl(o, d, { x: p.x, z: p.z, r: 0.3, y0: p.y, y1: p.y + bh });
        if (tb !== null && tb < best.t) best = { t: tb, kind: 'unit', unit: u, head: false };
      }
    }

    // march the terrain / water surface
    const step = 1.0;
    let prev = 0;
    for (let t = step; t <= best.t + step; t += step) {
      const tt = Math.min(t, best.t);
      const x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
      const ground = this.height(x, z);
      const surf = this.water !== null ? Math.max(ground, this.water) : ground;
      if (y < surf) {
        let lo = prev, hi = tt;
        for (let i = 0; i < 8; i++) {
          const m = (lo + hi) / 2;
          const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          const g = this.height(mx, mz);
          const s = this.water !== null ? Math.max(g, this.water) : g;
          if (my < s) hi = m; else lo = m;
        }
        const hx = o.x + d.x * hi, hz = o.z + d.z * hi;
        const kind = this.water !== null && this.height(hx, hz) < this.water ? 'water' : 'terrain';
        best = { t: hi, kind };
        break;
      }
      prev = tt;
      if (tt >= best.t) break;
    }

    if (!best.kind) return null;
    best.point = new THREE.Vector3(o.x + d.x * best.t, o.y + d.y * best.t, o.z + d.z * best.t);
    return best;
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    d.divideScalar(len);
    const hit = this.raycast(a, d, len, null, false);
    return !hit || hit.t > len - 0.3;
  }
}

// ---------------------------------------------------------------- ray helpers

function rayCyl(o, d, c) {
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  let t = null;
  if (a > 1e-8) {
    const b = 2 * (ox * d.x + oz * d.z);
    const cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const t0 = (-b - s) / (2 * a);
      const t1 = (-b + s) / (2 * a);
      for (const tc of [t0, t1]) {
        if (tc > 0.01) {
          const y = o.y + d.y * tc;
          if (y >= c.y0 && y <= c.y1) { t = tc; break; }
        }
      }
    }
  }
  if (d.y < 0) {
    const tt = (c.y1 - o.y) / d.y;
    if (tt > 0.01 && (t === null || tt < t)) {
      const x = ox + d.x * tt, z = oz + d.z * tt;
      if (x * x + z * z <= c.r * c.r) t = tt;
    }
  }
  return t;
}

function rayBox(o, d, c) {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  const dx = o.x - c.x, dz = o.z - c.z;
  const lo = [dx * cos - dz * sin, o.y, dx * sin + dz * cos];
  const ld = [d.x * cos - d.z * sin, d.y, d.x * sin + d.z * cos];
  const mn = [-c.hw, c.y0, -c.hd], mx = [c.hw, c.y1, c.hd];
  let tmin = 0.01, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-9) {
      if (lo[i] < mn[i] || lo[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - lo[i]) / ld[i], t2 = (mx[i] - lo[i]) / ld[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0.01 ? t : null;
}
