// Weather around the camera: rain streaks, low ground mist, sunlit dust,
// distant smoke columns and lightning with delayed thunder.

import * as THREE from 'three';
import { WIND } from './assets.js';

function softSprite(r = 1, g = 1, b = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  // a lumpy cloud: several overlapping soft discs
  for (let i = 0; i < 9; i++) {
    const px = 64 + Math.cos(i * 2.4) * 22 * (i % 3) / 2, py = 64 + Math.sin(i * 2.4) * 16 * (i % 3) / 2, rad = 30 + (i % 4) * 7;
    const gr = x.createRadialGradient(px, py, 0, px, py, rad);
    gr.addColorStop(0, `rgba(${r * 255},${g * 255},${b * 255},0.35)`);
    gr.addColorStop(1, `rgba(${r * 255},${g * 255},${b * 255},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Weather {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.cfg = world.atm.weather;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.flashT = 0;
    this.nextBolt = 6 + Math.random() * 8;
    this.thunderIn = -1;
    const q = world.quality;
    WIND.strength.value = this.cfg.wind ?? 1;

    if (this.cfg.rain) {
      const n = q === 'low' ? 1200 : q === 'medium' ? 2500 : 4000;
      this.rainBox = { w: 44, h: 26 };
      const pos = new Float32Array(n * 6);
      this.drops = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        this.drops[i * 3] = (Math.random() - 0.5) * this.rainBox.w;
        this.drops[i * 3 + 1] = Math.random() * this.rainBox.h;
        this.drops[i * 3 + 2] = (Math.random() - 0.5) * this.rainBox.w;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#c4ccd4', transparent: true, opacity: 0.32, depthWrite: false }));
      this.rain.frustumCulled = false;
      this.group.add(this.rain);
    }

    // low banks of mist and, for the last battles, smoke over the horizon
    this.puffs = [];
    const mistN = Math.round((this.cfg.mist || 0) * (q === 'low' ? 14 : 30));
    if (mistN) {
      const tex = softSprite(1, 1, 1);
      const fog = new THREE.Color(world.atm.fog[0]);
      for (let i = 0; i < mistN; i++) {
        const m = new THREE.SpriteMaterial({ map: tex, color: fog.clone().lerp(new THREE.Color('#ffffff'), 0.3), transparent: true, opacity: 0.16 + Math.random() * 0.14, depthWrite: false });
        const s = new THREE.Sprite(m);
        const k = 10 + Math.random() * 10;
        s.scale.set(k * 2.4, k * 0.55, 1);
        s.userData = { a: Math.random() * 6.28, r: 25 + Math.random() * 70, v: (Math.random() - 0.5) * 0.02, rise: 0.5 + Math.random() * 1.6 };
        this.group.add(s);
        this.puffs.push(s);
      }
    }
    this.plumes = [];
    if (this.cfg.smoke) {
      const tex = softSprite(0.32, 0.3, 0.28);
      for (let p = 0; p < this.cfg.smoke; p++) {
        const a = (p / this.cfg.smoke) * Math.PI * 2 + 0.7, R = world.size + 60 + Math.random() * 80;
        const base = new THREE.Vector3(Math.cos(a) * R, world.height(Math.cos(a) * world.size, Math.sin(a) * world.size), Math.sin(a) * R);
        for (let i = 0; i < 9; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, fog: true }));
          s.userData = { base, k: i / 9, speed: 0.012 + Math.random() * 0.008 };
          this.group.add(s);
          this.plumes.push(s);
        }
      }
    }

    if (this.cfg.dust) {
      const n = Math.round(this.cfg.dust * (q === 'low' ? 250 : 600));
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 40;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
        color: '#f3e2c0', size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
      }));
      this.dust.frustumCulled = false;
      this.group.add(this.dust);
    }
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.game.postfx.flash = 0;
  }

  update(dt, camera) {
    const cp = camera.position, w = this.world;
    const t = this.game.time;
    WIND.time.value = t;

    if (this.rain) {
      const a = this.rain.geometry.attributes.position.array, d = this.drops, { w: bw, h: bh } = this.rainBox;
      const fall = 19 * dt, slant = 0.18;
      for (let i = 0; i < d.length; i += 3) {
        d[i + 1] -= fall;
        d[i] += fall * slant;
        if (d[i + 1] < 0) { d[i + 1] += bh; d[i] = (Math.random() - 0.5) * bw; d[i + 2] = (Math.random() - 0.5) * bw; }
        if (d[i] > bw / 2) d[i] -= bw;
        const x = cp.x + d[i], y = cp.y - 6 + d[i + 1], z = cp.z + d[i + 2];
        const j = i * 2;
        a[j] = x; a[j + 1] = y; a[j + 2] = z;
        a[j + 3] = x - 0.6 * slant; a[j + 4] = y + 0.6; a[j + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    for (const s of this.puffs) {
      const u = s.userData;
      u.a += u.v * dt;
      const x = cp.x + Math.cos(u.a) * u.r, z = cp.z + Math.sin(u.a) * u.r;
      s.position.set(x, w.height(x, z) + u.rise, z);
    }
    for (const s of this.plumes) {
      const u = s.userData;
      u.k = (u.k + u.speed * dt) % 1;
      const h = u.k * 70, sc = 10 + u.k * 40;
      s.position.set(u.base.x + u.k * 25, u.base.y + h, u.base.z + u.k * 8);
      s.scale.set(sc, sc, 1);
      s.material.opacity = 0.75 * Math.sin(Math.PI * Math.min(1, u.k * 1.2));
    }
    if (this.dust) {
      this.dust.position.set(Math.floor(cp.x / 40) * 40, cp.y - 4, Math.floor(cp.z / 40) * 40);
      this.dust.rotation.y = t * 0.01;
    }

    // lightning: a bright double flash, thunder a couple of seconds later
    if (this.cfg.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flashT = 0.35;
        this.nextBolt = 9 + Math.random() * 14;
        this.thunderIn = 1 + Math.random() * 2.5;
      }
      if (this.thunderIn > 0 && (this.thunderIn -= dt) <= 0) this.game.audio.thunder();
      this.flashT = Math.max(0, this.flashT - dt);
      const f = this.flashT > 0 ? (this.flashT > 0.22 || this.flashT < 0.12 ? this.flashT * 2.6 : 0.1) : 0;
      w.hemi.intensity = w.baseLight.hemi + f * 3;
      this.game.postfx.flash = f * 0.35;
    }
  }
}
