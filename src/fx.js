// Visual effects: muzzle flashes, tracers, dust impacts and explosions.

import * as THREE from 'three';

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.flashTex = radialTexture('rgba(255,240,180,1)', 'rgba(255,140,20,0)');
    this.smokeTex = radialTexture('rgba(200,190,170,0.9)', 'rgba(160,150,130,0)');
    this.fireTex = radialTexture('rgba(255,230,150,1)', 'rgba(255,80,0,0)');
    this.light = new THREE.PointLight('#ffb050', 0, 12, 2);
    scene.add(this.light);
    this.lightTime = 0;
    this.shake = 0;
  }

  sprite(tex, pos, size, life, opts = {}) {
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      color: opts.color || 0xffffff, fog: true,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.items.push({ obj: s, life, age: 0, grow: opts.grow || 0, rise: opts.rise || 0, size, fade: true });
  }

  muzzle(pos) {
    this.sprite(this.flashTex, pos, 0.55 + Math.random() * 0.3, 0.05, { additive: true });
    this.light.position.copy(pos);
    this.light.intensity = 25;
    this.lightTime = 0.05;
  }

  tracer(from, to, color = 0xfff2a0) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 1) return;
    // draw a short streak partway along the path
    const a = from.clone().addScaledVector(dir, 0.15 + Math.random() * 0.3);
    const b = a.clone().addScaledVector(dir.normalize(), Math.min(6, len * 0.4));
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.06, age: 0, fade: true, ownGeo: true });
  }

  impact(pos, kind) {
    const color = kind === 'water' ? 0xd8eef0 : kind === 'prop' ? 0xc9c0ac : 0xa8916a;
    for (let i = 0; i < 3; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.3, (Math.random() - 0.5) * 0.3));
      this.sprite(this.smokeTex, p, 0.35, 0.6 + Math.random() * 0.4, { color, grow: 1.4, rise: kind === 'water' ? 1.5 : 0.4 });
    }
  }

  hitPuff(pos) {
    this.sprite(this.smokeTex, pos, 0.3, 0.35, { color: 0x6b3a28, grow: 0.8 });
  }

  explosion(pos, big = true) {
    const s = big ? 1 : 0.6;
    this.sprite(this.fireTex, pos.clone().setY(pos.y + 1.5 * s), 6 * s, 0.45, { additive: true, grow: 6 });
    for (let i = 0; i < 10; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3 * s, Math.random() * 2 * s, (Math.random() - 0.5) * 3 * s));
      this.sprite(this.smokeTex, p, 2.5 * s, 2.5 + Math.random() * 2, { color: 0x4a4440, grow: 2.2, rise: 2 });
    }
    this.light.position.copy(pos).setY(pos.y + 2);
    this.light.intensity = 400 * s;
    this.lightTime = 0.25;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const k = it.age / it.life;
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.obj.material.dispose();
        if (it.ownGeo) it.obj.geometry.dispose();
        this.items.splice(i, 1);
        continue;
      }
      if (it.grow) it.obj.scale.setScalar(it.size * (1 + it.grow * k));
      if (it.rise) it.obj.position.y += it.rise * dt;
      it.obj.material.opacity = 1 - k;
    }
    if (this.lightTime > 0) {
      this.lightTime -= dt;
      if (this.lightTime <= 0) this.light.intensity = 0;
    }
    this.shake = Math.max(0, this.shake - dt * 2);
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.obj);
      it.obj.material.dispose();
      if (it.ownGeo) it.obj.geometry.dispose();
    }
    this.items = [];
  }
}
