// Vehicles the player can board: the Buffel APC, a gunship helicopter, a
// ground-attack jet and a navy Arrow boat. Each has a hull that soldiers on
// both sides can shoot, a main gun (with heat instead of ammunition) and a
// second weapon. The game drives them from the player's input; in co-op the
// driver's machine moves the vehicle and the host keeps its hull points.

import * as THREE from 'three';
import { models } from './assets.js';

// box: half width, half length, height and the box centre's offset along the hull (m)
export const VEHICLE_TYPES = {
  buffel: {
    name: 'Buffel APC', model: 'buffel', kind: 'ground', hp: 1600, armour: 0.3, top: 15, accel: 6, turn: 1.25, seats: 5,
    box: [1.25, 2.45, 3.1, 0.1], mount: [0, 3.35, -0.4], cam: [9.5, 3.6],
    gun: { name: '12.7 mm machine gun', interval: 0.12, body: 70, head: 140, spread: 0.008, noise: 150, heat: 0.035, sound: 'hmg' },
    alt: { name: 'Smoke dischargers', ammo: 3, smoke: true },
  },
  heli: {
    name: 'Bell 212 gunship', model: 'gunship', kind: 'air', hp: 1200, armour: 0.7, top: 26, accel: 9, seats: 5,
    box: [1.3, 3.0, 3.0, 0.6], mount: [1.4, 1.4, 2.15], cam: [15, 4.5],
    gun: { name: 'Door machine gun', interval: 0.09, body: 45, head: 110, spread: 0.012, noise: 160, heat: 0.03, sound: 'hmg' },
    alt: { name: 'Rocket pods', ammo: 16, rocket: true, pods: [[-2.1, 1.1, 1.4], [2.1, 1.1, 1.4]] },
  },
  jet: {
    name: 'Ground-attack jet', model: 'jet', kind: 'jet', hp: 750, armour: 0.6, top: 72, min: 32, accel: 14, seats: 0,
    box: [2.4, 6.0, 2.6, 0.7], mount: [0, 1.5, 6.8], cam: [21, 5.5],
    gun: { name: '30 mm cannon', interval: 0.075, body: 95, head: 160, spread: 0.012, noise: 200, heat: 0.022, sound: 'hmg', blast: true },
    alt: { name: 'Bombs', ammo: 6, bomb: true, pods: [[-2.4, 1.1, -2.2], [2.4, 1.1, -2.2]] },
  },
  boat: {
    name: 'Navy Arrow boat', model: 'arrow_boat', kind: 'water', hp: 1000, armour: 0.5, top: 19, accel: 7, turn: 1.0, seats: 3,
    box: [1.15, 3.0, 1.7, 0], mount: [0, 1.5, 2.6], cam: [10.5, 3.4],
    gun: { name: 'Bow machine gun', interval: 0.1, body: 55, head: 120, spread: 0.01, noise: 150, heat: 0.03, sound: 'hmg' },
    alt: null,
  },
};

const _v = new THREE.Vector3();
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Vehicle {
  constructor(game, type, x, z, yaw, index) {
    const c = VEHICLE_TYPES[type];
    this.game = game;
    this.world = game.world;
    this.type = type;
    this.cfg = c;
    this.index = index;
    this.kind = c.kind;
    this.name = c.name;
    this.obj = models[c.model].clone(true);
    game.scene.add(this.obj);
    this.pos = new THREE.Vector3(x, this.groundAt(x, z), z);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.hp = c.hp;
    this.alive = true;
    this.driver = null; // the unit driving (the player, or a co-op partner's soldier)
    this.driverNid = null; // co-op id of whoever drives it
    this.occupants = new Set();
    this.heat = 0;
    this.overheat = 0;
    this.fireCd = 0;
    this.altCd = 0;
    this.altAmmo = c.alt?.ammo || 0;
    this.podSide = 0;
    this.spin = 0;
    this.airborne = false;
    this.home = { x, z, yaw };
    this.rotor = this.obj.getObjectByName('Rotor');
    this.tailRotor = this.obj.getObjectByName('TailRotor');
    this.muzzleObj = this.obj.getObjectByName('Muzzle');
    const [hw, hd, h] = c.box;
    // the hull is also a collider, so soldiers walk round a parked vehicle
    this.box = { t: 'b', x, z, rot: yaw, hw, hd, y0: 0, y1: h, type: 'vehicle', vehicle: this };
    this.world.colliders.push(this.box);
    this.world.vehicles.push(this);
    this.sync();
  }

  get size() { return Math.max(this.cfg.box[0], this.cfg.box[1]) * 0.8; }

  get forward() { return _v.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)); }

  groundAt(x, z) {
    const w = this.world, g = w.height(x, z);
    if (this.kind === 'water') return (w.water ?? g) + 0.05;
    if (this.kind === 'ground') return g;
    return w.water !== null ? Math.max(g, w.water) : g;
  }

  // world position of a point given in the hull's own frame (x right, y up, z forward)
  local(x, y, z, out = new THREE.Vector3()) {
    out.set(x, y, z).applyEuler(this.obj.rotation).add(this.obj.position);
    return out;
  }

  muzzle(out = new THREE.Vector3()) {
    const m = this.cfg.mount;
    return this.local(m[0], m[1], m[2], out);
  }

  // where the vehicle is aimed at: soldiers aim here
  get centre() { return _v.set(this.pos.x, this.pos.y + this.cfg.box[2] * 0.5, this.pos.z); }

  sync() {
    const o = this.obj;
    o.position.copy(this.pos);
    o.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    const [, hd, h, bz] = this.cfg.box, b = this.box;
    b.x = this.pos.x + Math.sin(this.yaw) * bz;
    b.z = this.pos.z + Math.cos(this.yaw) * bz;
    b.rot = this.yaw;
    b.y0 = this.pos.y - 0.2;
    b.y1 = this.pos.y + h;
    b.hd = hd;
    if (this.rotor) this.rotor.rotation.y += this.spin * 0.7;
    if (this.tailRotor) this.tailRotor.rotation.x += this.spin * 0.9;
    for (const u of this.occupants) {
      u.pos.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
      u.obj.visible = false;
    }
  }

  // bullets are stopped by the armour; blasts (blast = true) hurt every hull
  damage(amount, from, blast = false) {
    if (!this.alive) return;
    const g = this.game;
    if (g.net?.active && g.net.role === 'guest') return; // the host keeps the hull points
    this.hp -= amount * (blast ? 1 : this.cfg.armour);
    this.lastHit = g.time;
    if (this.driver?.isPlayer) g.onPlayerHit?.(from?.pos || null);
    if (this.hp <= 0) this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    const g = this.game;
    g.fx.explosion(this.centre.clone());
    g.audio.explosion(this.pos);
    // a burnt-out hulk is left where it stopped
    this.obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.multiplyScalar(0.18);
      o.material.map = null;
    });
    this.spin = 0;
    g.onVehicleDestroyed?.(this);
  }

  // ------------------------------------------------------------- driving

  // c: { throttle, steer, up, down, aimYaw, aimPitch }
  drive(dt, c) {
    if (!this.alive) return;
    if (this.kind === 'air') this.fly(dt, c);
    else if (this.kind === 'jet') this.flyJet(dt, c);
    else this.roll_(dt, c);
    this.sync();
  }

  // wheels and hulls: throttle and steering
  roll_(dt, c) {
    const k = this.cfg, w = this.world;
    const target = c.throttle * (c.throttle > 0 ? k.top : k.top * 0.4);
    this.speed += THREE.MathUtils.clamp(target - this.speed, -k.accel * 1.6 * dt, k.accel * dt);
    if (Math.abs(c.throttle) < 0.1) this.speed *= 1 - dt * 0.9;
    this.yaw -= c.steer * k.turn * dt * THREE.MathUtils.clamp(this.speed / 5, -1, 1);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const ok = this.kind === 'water' ? w.isWater(nx, nz, 0.6) : !w.isWater(nx, nz, 0.8);
    if (ok) { this.pos.x = nx; this.pos.z = nz; } else this.speed *= -0.25;
    if (this.collide()) this.speed *= 0.6;
    const hd = k.box[1] * 0.8, hw = k.box[0] * 0.8;
    if (this.kind === 'water') {
      const t = this.game.time;
      this.pos.y = (w.water ?? 0) + 0.05 + Math.sin(t * 2.1 + this.index) * 0.06;
      this.pitch = THREE.MathUtils.clamp(this.speed * 0.012, -0.05, 0.2) + Math.sin(t * 1.7) * 0.015;
      this.roll = c.steer * Math.min(1, Math.abs(this.speed) / 8) * 0.12 + Math.sin(t * 1.3 + 1) * 0.02;
    } else {
      this.pos.y = w.height(this.pos.x, this.pos.z);
      const hf = w.height(this.pos.x + fx * hd, this.pos.z + fz * hd), hb = w.height(this.pos.x - fx * hd, this.pos.z - fz * hd);
      const hr = w.height(this.pos.x - fz * hw, this.pos.z + fx * hw), hl = w.height(this.pos.x + fz * hw, this.pos.z - fx * hw);
      this.pitch += (Math.atan2(hf - hb, hd * 2) - this.pitch) * Math.min(1, dt * 8);
      this.roll += (Math.atan2(hl - hr, hw * 2) - this.roll) * Math.min(1, dt * 8);
    }
  }

  // push the hull out of walls, trees and other vehicles (two circles along it)
  collide() {
    const w = this.world, k = this.cfg, r = k.box[0] * 0.9;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let hit = false;
    this.box.off = true;
    for (const s of [-1, 1]) {
      const off = k.box[1] * 0.5 * s;
      const p = new THREE.Vector3(this.pos.x + fx * off, this.pos.y, this.pos.z + fz * off);
      const bx = p.x, bz = p.z;
      w.resolve(p, r);
      if (Math.abs(p.x - bx) + Math.abs(p.z - bz) > 1e-4) { this.pos.x += p.x - bx; this.pos.z += p.z - bz; hit = true; }
    }
    this.box.off = false;
    return hit;
  }

  // helicopter: lift with Space, down with C, flies where the camera looks
  fly(dt, c) {
    const k = this.cfg, w = this.world;
    this.spin += ((this.driver ? 1 : 0) - this.spin) * Math.min(1, dt * 0.6);
    const ground = this.groundAt(this.pos.x, this.pos.z);
    const ready = this.spin > 0.75;
    const lift = ready ? (c.up ? 1 : 0) - (c.down ? 1 : 0) : 0;
    if (this.airborne) this.yaw += angleTo(this.yaw, c.aimYaw) * Math.min(1, dt * 1.8);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const fwd = this.airborne ? c.throttle * k.top : 0, side = this.airborne ? c.steer * k.top * 0.6 : 0;
    // with no one at the controls it settles to the ground
    const want = new THREE.Vector3(fx * fwd - fz * side, this.driver ? lift * 7 : -4, fz * fwd + fx * side);
    this.vel.lerp(want, Math.min(1, dt * 1.4));
    if (!ready && this.vel.y > 0) this.vel.y = 0;
    this.pos.addScaledVector(this.vel, dt);
    const lim = w.size + 40;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
    this.pos.y = Math.min(this.pos.y, ground + 90);
    if (this.pos.y <= ground) {
      if (this.vel.y < -9) this.damage(-this.vel.y * 30, null, true);
      this.pos.y = ground;
      this.vel.set(0, Math.max(0, this.vel.y), 0);
    }
    this.airborne = this.pos.y > ground + 0.4;
    if (this.airborne) this.collide();
    const lf = this.vel.x * fx + this.vel.z * fz, ls = this.vel.x * -fz + this.vel.z * fx;
    this.pitch += (-lf / k.top * 0.22 - this.pitch) * Math.min(1, dt * 3);
    this.roll += (ls / k.top * 0.3 - this.roll) * Math.min(1, dt * 3);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
  }

  // jet: throttle with W/S, steer with the camera (A/D roll), takes off by itself
  flyJet(dt, c) {
    const k = this.cfg, w = this.world;
    const ground = this.groundAt(this.pos.x, this.pos.z);
    if (!this.airborne) {
      // taxi and take-off roll
      const target = c.throttle > 0 ? k.top * 0.5 : 0;
      this.speed += THREE.MathUtils.clamp(target - this.speed, -k.accel * dt, k.accel * dt);
      this.yaw -= c.steer * 0.8 * dt * Math.min(1, this.speed / 5);
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      this.pos.y = ground;
      this.pitch += ((this.speed > 14 ? 0.12 : 0) - this.pitch) * Math.min(1, dt * 3);
      if (this.speed > 18) {
        this.airborne = true;
        this.climb = 2.5;
        this.pos.y = ground + 1.5;
        this.pitch = Math.max(this.pitch, 0.2);
        this.game.toast?.('Airborne — steer with the camera, W / S for speed');
      }
      else this.collide();
      this.spin = this.speed / k.top;
      return;
    }
    // in the air: never slower than the stall speed
    const target = k.min + (k.top - k.min) * THREE.MathUtils.clamp(0.5 + c.throttle * 0.5, 0, 1);
    this.speed += THREE.MathUtils.clamp(target - this.speed, -k.accel * dt, k.accel * dt);
    let aimYaw = c.aimYaw, aimPitch = THREE.MathUtils.clamp(c.aimPitch, -0.7, 0.6);
    // keep to the area of operations
    const R = w.size + 170;
    if (Math.hypot(this.pos.x, this.pos.z) > R) {
      aimYaw = Math.atan2(-this.pos.x, -this.pos.z);
      if (!this.turningBack) this.game.toast?.('Leaving the area — turning back');
      this.turningBack = true;
    } else this.turningBack = false;
    if (this.climb > 0) { this.climb -= dt; aimPitch = Math.max(aimPitch, 0.32); }
    const dy = angleTo(this.yaw, aimYaw);
    const rate = THREE.MathUtils.clamp(dy * 1.6, -1.1, 1.1) - c.steer * 0.5;
    this.yaw += rate * dt;
    this.pitch += THREE.MathUtils.clamp(aimPitch - this.pitch, -0.9 * dt, 0.9 * dt);
    this.roll += (THREE.MathUtils.clamp(-rate * 0.75 + c.steer * 0.5, -1.2, 1.2) - this.roll) * Math.min(1, dt * 3);
    this.pos.addScaledVector(this.forward, this.speed * dt);
    this.pos.y = Math.min(this.pos.y, 320);
    this.spin = this.speed / k.top;
    this.lowAlt = this.pos.y + this.forward.y * this.speed * 2 < ground + 6;
    if (this.pos.y < ground + (this.climb > 0 ? 0.2 : 0.6)) this.crash();
  }

  crash() {
    if (!this.alive) return;
    this.game.toast?.(`${this.name} crashed!`, true);
    this.destroy();
  }

  // no one at the controls
  idle(dt) {
    if (!this.alive) {
      // wreck falls to the ground
      const ground = this.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y > ground) { this.vel.y -= 9.8 * dt; this.pos.y = Math.max(ground, this.pos.y + this.vel.y * dt); this.sync(); }
      return;
    }
    this.speed *= 1 - Math.min(1, dt * 2);
    this.spin = Math.max(0, this.spin - dt * 0.3);
    if (this.kind === 'air' && this.pos.y > this.groundAt(this.pos.x, this.pos.z)) this.fly(dt, { throttle: 0, steer: 0, up: false, down: true, aimYaw: this.yaw });
    else if (this.kind === 'water') this.roll_(dt, { throttle: 0, steer: 0 });
    this.sync();
  }

  // co-op: glide towards the pose the network last reported
  netSync(dt) {
    if (!this.netPose) return;
    const [x, y, z, yaw, pitch, roll, spin] = this.netPose;
    _v.set(x, y, z);
    if (this.pos.distanceTo(_v) > 12) this.pos.copy(_v);
    else this.pos.lerp(_v, Math.min(1, dt * 10));
    this.yaw += angleTo(this.yaw, yaw) * Math.min(1, dt * 10);
    this.pitch = pitch;
    this.roll = roll;
    this.spin = spin;
    this.sync();
  }

  pose() {
    const r = (v) => Math.round(v * 100) / 100;
    return [r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.yaw), r(this.pitch), r(this.roll), r(this.spin)];
  }

  remove() {
    this.game.scene.remove(this.obj);
  }
}

// A motor pool near the mission start: the APC, the gunship and the jet on
// open ground beside the start (not on the way to the objectives), and the
// boat on the nearest open water.
export function placeVehicles(game) {
  const w = game.world, m = game.mission, sx = m.player.x, sz = m.player.z;
  const placed = [];
  const flat = (x, z, r) => {
    const h = w.height(x, z);
    return [[r, 0], [-r, 0], [0, r], [0, -r]].every(([a, b]) => Math.abs(w.height(x + a, z + b) - h) < r * 0.25);
  };
  const clear = (x, z, r) => Math.abs(x) < w.size - r - 4 && Math.abs(z) < w.size - r - 4 && !w.isWater(x, z, -0.5)
    && !w.blocked(x, z, r) && flat(x, z, r) && placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 2)
    && Math.hypot(x - sx, z - sz) > r + 4;
  // beside and a little behind the start: the objectives lie ahead (towards the map centre)
  const toCentre = Math.atan2(-sx, -sz);
  const spot = (r, d0, d1) => {
    for (let d = d0; d <= d1; d += 3) {
      for (let k = 0; k < 16; k++) {
        const a = toCentre + Math.PI / 2 * (k % 2 ? 1 : -1) + (Math.floor(k / 2) * 0.22) * (k % 4 < 2 ? 1 : -1);
        const x = sx + Math.sin(a) * d, z = sz + Math.cos(a) * d;
        if (clear(x, z, r)) { placed.push({ x, z, r }); return { x, z }; }
      }
    }
    return null;
  };
  const out = [];
  const add = (type, p) => { if (p) out.push(new Vehicle(game, type, p.x, p.z, toCentre, out.length)); };
  add('buffel', spot(3, 9, 40));
  add('heli', spot(7, 14, 60));
  add('jet', spot(8, 20, 80));
  if (w.water !== null) {
    let best = null, bd = 130;
    for (let x = -w.size + 12; x <= w.size - 12; x += 4) {
      for (let z = -w.size + 12; z <= w.size - 12; z += 4) {
        const d = Math.hypot(x - sx, z - sz);
        if (d >= bd || !w.isWater(x, z, 1.0)) continue;
        if (![[7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, -5], [5, -5], [-5, 5]].every(([a, b]) => w.isWater(x + a, z + b, 0.6))) continue;
        best = { x, z }; bd = d;
      }
    }
    add('boat', best);
  }
  return out;
}
