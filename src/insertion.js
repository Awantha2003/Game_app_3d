// Short in-engine insertion scenes at the start of a mission: the section
// arrives by helicopter, by navy boat or by armoured personnel carrier.
// Skippable with Space, Enter or Esc.

import * as THREE from 'three';
import { models } from './assets.js';

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const LINES = {
  heli: [['command', 'Skyhawk Two-Two on final approach. Thirty seconds to the landing zone.'], ['ruwan', 'Check your weapons. Off the skids and into the treeline.']],
  boat: [['command', 'Arrow boats closing the beach. Keep your heads down.'], ['ruwan', 'Ramp\'s down — go, go, go!']],
  apc: [['ruwan', 'Dismount! Spread out, five-metre spacing.']],
};

export class Insertion {
  constructor(game, type) {
    this.game = game;
    this.type = type;
    this.t = 0;
    this.done = false;
    this.landed = false;
    this.beat = 0;
    const g = game, p = g.player.pos;
    this.lz = p.clone();
    this.squad = g.units.filter((u) => u.team === 'army' && u.tag !== 'linkup');
    for (const u of this.squad) u.obj.visible = false;

    const name = type === 'heli' ? 'helicopter' : type === 'boat' ? 'arrow_boat' : 'buffel';
    this.obj = models[name].clone(true);
    g.scene.add(this.obj);
    this.rotor = this.obj.getObjectByName('Rotor');
    this.tail = this.obj.getObjectByName('TailRotor');

    if (type === 'heli') {
      this.from = new THREE.Vector3(p.x - 60, p.y + 45, p.z + 140);
      this.to = new THREE.Vector3(p.x + 1, g.world.height(p.x + 1, p.z + 7) + 0.1, p.z + 7);
      this.away = new THREE.Vector3(p.x + 120, p.y + 60, p.z + 60);
      this.duration = 12;
      this.landAt = 7;
    } else if (type === 'boat') {
      // come in from the sea on the west, beach right beside the start point
      let sx = p.x - 8;
      while (sx > p.x - 25 && !g.world.isWater(sx, p.z, 0.2)) sx -= 1;
      const water = g.world.water ?? 0;
      this.to = new THREE.Vector3(sx, water - 0.25, p.z);
      this.from = new THREE.Vector3(sx - 70, water - 0.25, p.z + 18);
      this.away = new THREE.Vector3(sx - 90, water - 0.25, p.z - 30);
      this.duration = 11;
      this.landAt = 6.5;
    } else {
      this.from = new THREE.Vector3(p.x - 4, 0, p.z + 45);
      this.to = new THREE.Vector3(p.x - 4, 0, p.z + 8);
      this.duration = 8;
      this.landAt = 5;
    }
    g.radio.clear();
    g.radio.say(LINES[type]);
    this.place(0);
    this.camSpots = this.pickCameraSpots();
  }

  // camera positions near the landing zone with a clear view (not inside a tree)
  pickCameraSpots() {
    const w = this.game.world, lz = this.lz;
    const target = new THREE.Vector3(lz.x, lz.y + 2, lz.z + 4);
    const spots = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.6;
      for (const [r, h] of [[24, 10], [18, 7], [30, 14]]) {
        const x = lz.x + Math.cos(a) * r, z = lz.z + Math.sin(a) * r;
        if (w.isWater(x, z, -0.5)) continue;
        const c = new THREE.Vector3(x, w.height(x, z) + h, z);
        if (w.blocked(x, z, 5.5) || !w.lineOfSight(c, target)) continue;
        spots.push(c);
        break;
      }
      if (spots.length >= 2) break;
    }
    while (spots.length < 2) spots.push(new THREE.Vector3(lz.x + 6, lz.y + 26, lz.z + 14 + spots.length * 6));
    return spots;
  }

  place(t) {
    const g = this.game, o = this.obj;
    let pos, yaw;
    if (this.type === 'heli') {
      if (t < this.landAt) {
        const k = ease(t / this.landAt);
        pos = new THREE.Vector3().lerpVectors(this.from, this.to, k);
        pos.y = lerp(this.from.y, this.to.y, Math.pow(k, 1.8));
        yaw = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
        o.rotation.x = -0.18 * (1 - k);
      } else if (t < this.landAt + 2.2) {
        pos = this.to.clone();
        yaw = Math.PI;
        o.rotation.x = 0;
      } else {
        const k = ease(Math.min(1, (t - this.landAt - 2.2) / (this.duration - this.landAt - 2.2)));
        pos = new THREE.Vector3().lerpVectors(this.to, this.away, k);
        pos.y = lerp(this.to.y, this.away.y, Math.sqrt(k));
        yaw = Math.atan2(this.away.x - this.to.x, this.away.z - this.to.z);
        o.rotation.x = 0.15 * k;
      }
      if (this.rotor) this.rotor.rotation.y += 0.9;
      if (this.tail) this.tail.rotation.x += 1.2;
    } else if (this.type === 'boat') {
      if (t < this.landAt) {
        const k = ease(t / this.landAt);
        pos = new THREE.Vector3().lerpVectors(this.from, this.to, k);
        yaw = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
      } else {
        const k = ease(Math.min(1, (t - this.landAt - 1.5) / (this.duration - this.landAt - 1.5)));
        pos = new THREE.Vector3().lerpVectors(this.to, this.away, Math.max(0, k));
        yaw = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
      }
      pos.y += Math.sin(t * 3) * 0.08;
      o.rotation.z = Math.sin(t * 2.3) * 0.04;
    } else {
      const k = ease(Math.min(1, t / this.landAt));
      pos = new THREE.Vector3().lerpVectors(this.from, this.to, k);
      pos.y = g.world.height(pos.x, pos.z);
      yaw = Math.PI;
    }
    o.position.copy(pos);
    o.rotation.y = yaw;
    return pos;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const pos = this.place(this.t);

    // engine sound and dust
    this.beat -= dt;
    if (this.beat <= 0) {
      if (this.type === 'heli') { g.audio.burst({ dur: 0.07, freq: 220, vol: 0.5, thump: 70 }); this.beat = 0.13; }
      else if (this.type === 'boat') { g.audio.burst({ dur: 0.05, freq: 500, vol: 0.12 }); this.beat = 0.06; }
      else { g.audio.burst({ dur: 0.08, freq: 260, vol: 0.12 }); this.beat = 0.09; }
      if (this.type === 'heli' && pos.y - g.world.height(pos.x, pos.z) < 8) g.fx.impact(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 6, g.world.height(pos.x, pos.z), pos.z + (Math.random() - 0.5) * 6), 'terrain');
    }

    // the section climbs out
    if (!this.landed && this.t >= this.landAt) {
      this.landed = true;
      const exit = this.type === 'boat' ? new THREE.Vector3(this.to.x + 4, 0, this.to.z) : this.to.clone();
      this.squad.forEach((u, i) => {
        if (u.isPlayer) return;
        const a = (i / this.squad.length) * Math.PI * 2;
        u.pos.set(exit.x + Math.cos(a) * 2, 0, exit.z + Math.sin(a) * 2);
        u.pos.y = g.world.height(u.pos.x, u.pos.z);
        u.obj.visible = true;
      });
      g.player.obj.visible = true;
    }
    for (const u of this.squad) {
      if (u.isPlayer || !this.landed) continue;
      const f = u.followPoint();
      if (f) { u.faceTowards(f.x, f.z, dt); u.move(f.x - u.pos.x, f.z - u.pos.z, 4, dt); }
    }

    // camera: wide shot of the approach, then over the landing zone
    const cam = g.camera, lz = this.lz, [a, b] = this.camSpots;
    if (this.t < this.landAt) {
      cam.position.copy(a);
      cam.lookAt(pos);
    } else {
      const k = ease(Math.min(1, (this.t - this.landAt) / 3));
      cam.position.lerpVectors(a, b, k);
      cam.lookAt(lz.x, lz.y + 1.5, lz.z + 4);
    }
    cam.fov = 55;
    cam.updateProjectionMatrix();
    if (this.t >= this.duration) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    if (!this.landed) {
      this.t = this.landAt;
      this.update(0);
    }
    g.scene.remove(this.obj);
    for (const u of this.squad) u.obj.visible = true;
    g.camera.fov = 70;
    g.camera.updateProjectionMatrix();
  }
}
