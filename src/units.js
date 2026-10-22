// Soldiers (player, allies, LTTE cadres) and civilians: model, animation and AI.

import * as THREE from 'three';
import { models } from './assets.js';

const ALLY_NAMES = ['Cpl. Perera', 'L/Cpl. Bandara', 'Pte. Silva', 'Pte. Rathnayake', 'Pte. Kumara', 'Sgt. Dissanayake'];
const SHIRTS = ['#d9d4c7', '#a8584a', '#5b7aa0', '#c9b26a', '#e6e2da', '#7a8a5a'];
const SARONGS = ['#2f4f75', '#6a2f3a', '#3f5f3a', '#5a4a7a', '#7a5a2a'];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Unit {
  constructor(game, team, x, z, opts = {}) {
    this.game = game;
    this.team = team; // 'army' | 'ltte' | 'civ'
    this.tag = opts.tag || null;
    this.isPlayer = !!opts.player;
    this.name = team === 'army' && !this.isPlayer ? ALLY_NAMES[opts.index % ALLY_NAMES.length] : null;
    this.pos = new THREE.Vector3(x, game.world.height(x, z), z);
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.pitch = 0;
    this.maxHp = this.isPlayer ? 100 : team === 'army' ? 160 : 100;
    this.hp = this.maxHp;
    this.alive = true;
    this.radius = 0.38;
    this.walkPhase = Math.random() * 6;
    this.deadTime = 0;

    const src = models[team === 'army' ? 'soldier_army' : team === 'ltte' ? 'soldier_ltte' : 'civilian'];
    this.obj = src.clone(true);
    const p = (n) => this.obj.getObjectByName(n);
    this.parts = { torso: p('Torso'), head: p('Head'), armL: p('ArmL'), armR: p('ArmR'), legL: p('LegL'), legR: p('LegR'), muzzle: p('Muzzle') };
    this.base = {};
    for (const [k, o] of Object.entries(this.parts)) if (o) this.base[k] = o.rotation.clone();
    if (team === 'civ') this.tintCivilian();
    game.scene.add(this.obj);

    // AI state
    this.state = team === 'civ' ? 'wait' : 'idle';
    this.target = null;
    this.lastSeen = null;
    this.thinkTimer = Math.random() * 0.3;
    this.fireTimer = 1 + Math.random();
    this.burst = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.home = this.pos.clone();
    this.followSlot = opts.index ?? 0;
    this.lastHurt = 0;
    this.sync(0);
  }

  tintCivilian() {
    const shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
    const sarong = SARONGS[Math.floor(Math.random() * SARONGS.length)];
    this.obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.name === 'shirt') { o.material = o.material.clone(); o.material.color.set(shirt); }
      if (o.material.name === 'sarong') { o.material = o.material.clone(); o.material.color.set(sarong); }
    });
  }

  // crouching civilians present a smaller target
  get bodyHeight() {
    return this.team === 'civ' && this.state === 'wait' ? 1.0 : 1.48;
  }

  get eye() {
    return _w.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
  }

  muzzleWorld(out) {
    if (this.parts.muzzle) return this.parts.muzzle.getWorldPosition(out);
    return out.copy(this.pos).setY(this.pos.y + 1.3);
  }

  remove() {
    this.game.scene.remove(this.obj);
  }

  damage(amount, from) {
    if (!this.alive) return;
    if (this.team === 'army' && !this.isPlayer) {
      // allies are wounded but never killed, so the squad stays with the player
      this.hp = Math.max(25, this.hp - amount);
    } else {
      this.hp -= amount;
    }
    this.lastHurt = this.game.time;
    if (this.state === 'idle' || this.state === 'wait') this.alert(from);
    if (this.hp <= 0) this.die(from);
  }

  alert(from) {
    if (this.team === 'civ') return;
    this.state = 'combat';
    if (from && from.alive) {
      this.target = from;
      this.lastSeen = from.pos.clone();
    }
  }

  die(killer = null) {
    this.killer = killer;
    this.alive = false;
    this.hp = 0;
    this.deadTime = 0;
    this.game.onUnitKilled(this);
  }

  // ------------------------------------------------------------- movement

  move(dx, dz, speed, dt) {
    const world = this.game.world;
    const len = Math.hypot(dx, dz);
    const sx = this.pos.x, sz = this.pos.z;
    if (len > 1e-3) {
      dx /= len; dz /= len;
      if (!this.isPlayer && this.avoidTimer > 0) {
        // walk around an obstacle by turning to one side for a moment
        this.avoidTimer -= dt;
        const a = this.avoidSign * 1.2, c = Math.cos(a), s = Math.sin(a);
        [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
      }
      const nx = this.pos.x + dx * speed * dt, nz = this.pos.z + dz * speed * dt;
      if (!world.isWater(nx, this.pos.z)) this.pos.x = nx;
      if (!world.isWater(this.pos.x, nz)) this.pos.z = nz;
      this.speed = speed;
    } else {
      this.speed = 0;
    }
    world.resolve(this.pos, this.radius);
    this.pos.y = world.height(this.pos.x, this.pos.z);
    if (!this.isPlayer && len > 1e-3 && speed > 0 && !(this.avoidTimer > 0)) {
      const moved = Math.hypot(this.pos.x - sx, this.pos.z - sz);
      if (moved < speed * dt * 0.35) {
        this.avoidTimer = 0.6 + Math.random() * 0.8;
        this.avoidSign = Math.random() < 0.5 ? 1 : -1;
      }
    }
  }

  faceTowards(x, z, dt, rate = 6) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, rate * dt);
    return Math.abs(diff);
  }

  // ------------------------------------------------------------- animation

  sync(dt) {
    const o = this.obj, P = this.parts, B = this.base;
    o.position.copy(this.pos);
    o.rotation.y = this.yaw;
    if (!this.alive) {
      // fall over, then sink away after a while
      this.deadTime += dt;
      const k = Math.min(1, this.deadTime * 2.5);
      o.rotation.x = -k * (Math.PI / 2) * 0.96;
      o.position.y = this.pos.y + k * 0.15 - Math.max(0, this.deadTime - 25) * 0.1;
      return;
    }
    const moving = (this.speed || 0) > 0.2;
    if (moving) this.walkPhase += dt * (this.speed * 2.1);
    const swing = moving ? Math.sin(this.walkPhase) * Math.min(0.75, 0.18 * this.speed) : 0;
    P.legL.rotation.x = B.legL.x + swing;
    P.legR.rotation.x = B.legR.x - swing;
    o.position.y = this.pos.y + (moving ? Math.abs(Math.cos(this.walkPhase)) * 0.04 : 0);
    if (this.team === 'civ') {
      P.armL.rotation.x = B.armL.x - swing * 0.8;
      P.armR.rotation.x = B.armR.x + swing * 0.8;
      if (this.state === 'wait') {
        P.torso.rotation.x = 0.35;
        P.legL.rotation.x = B.legL.x - 0.9;
        P.legR.rotation.x = B.legR.x - 0.9;
        o.position.y = this.pos.y - 0.32;
      } else P.torso.rotation.x = moving ? 0.12 : 0;
    } else {
      P.torso.rotation.x = B.torso.x - this.pitch * 0.85;
      P.head.rotation.x = B.head.x - this.pitch * 0.2;
    }
  }

  // ------------------------------------------------------------- AI

  update(dt) {
    if (!this.alive) { this.sync(dt); return; }
    if (this.isPlayer) return;
    if (this.team === 'civ') this.updateCivilian(dt);
    else this.updateSoldier(dt);
    this.sync(dt);
  }

  updateCivilian(dt) {
    const g = this.game;
    if (this.state === 'wait') {
      this.speed = 0;
      const obj = g.currentObjective();
      if (obj?.type === 'escort' && g.player.alive && g.player.pos.distanceTo(this.pos) < 12) {
        this.state = 'flee';
        g.toast('Civilians: "Thank you — we are coming!"');
      }
    } else if (this.state === 'flee') {
      const [zx, zz, zr] = g.currentObjective()?.zone || g.escortZone;
      // follow the player while near them, otherwise head for the safe zone
      const pl = g.player;
      let tx = zx, tz = zz;
      const toZone = Math.hypot(zx - this.pos.x, zz - this.pos.z);
      if (pl.alive && pl.pos.distanceTo(this.pos) > 9 && toZone > 30) { tx = pl.pos.x; tz = pl.pos.z; }
      this.faceTowards(tx, tz, dt, 5);
      this.move(Math.sin(this.yaw), Math.cos(this.yaw), 3.6, dt);
      this.separate(dt);
      if (Math.hypot(zx - this.pos.x, zz - this.pos.z) < zr) {
        this.state = 'safe';
        // walk on to a spot inside the zone so others are not blocked at its edge
        const a = Math.random() * Math.PI * 2, r = Math.random() * zr * 0.5;
        this.safeSpot = { x: zx + Math.cos(a) * r, z: zz + Math.sin(a) * r };
        g.onCivilianSafe(this);
      }
    } else if (this.safeSpot && Math.hypot(this.safeSpot.x - this.pos.x, this.safeSpot.z - this.pos.z) > 1) {
      this.faceTowards(this.safeSpot.x, this.safeSpot.z, dt, 5);
      this.move(Math.sin(this.yaw), Math.cos(this.yaw), 2, dt);
      this.separate(dt);
    } else {
      this.speed = 0;
    }
  }

  hostiles() {
    return this.game.units.filter((u) => u.alive && u.team !== 'civ' && u.team !== this.team);
  }

  canSee(u, range) {
    const d = u.pos.distanceTo(this.pos);
    if (d > range) return false;
    const a = this.eye.clone();
    _v.set(u.pos.x, u.pos.y + 1.4, u.pos.z);
    return this.game.world.lineOfSight(a, _v);
  }

  think() {
    // choose the nearest visible hostile
    const view = this.team === 'ltte' ? 60 : 70;
    let best = null, bestD = Infinity;
    for (const h of this.hostiles()) {
      const d = h.pos.distanceTo(this.pos);
      if (d > view || d > bestD) continue;
      if (this.state === 'idle' && d > 18) {
        // idle cadres only notice what is roughly in front of them
        const ang = Math.atan2(h.pos.x - this.pos.x, h.pos.z - this.pos.z) - this.yaw;
        if (Math.cos(ang) < 0.2 && d > 10) continue;
      }
      if (this.canSee(h, view)) { best = h; bestD = d; }
    }
    this.visible = best;
    if (best) {
      this.target = best;
      this.lastSeen = best.pos.clone();
      if (this.state === 'idle') {
        this.state = 'combat';
        this.fireTimer = 0.6 + Math.random() * 0.8;
        // shout to nearby comrades
        for (const u of this.game.units) {
          if (u.team === this.team && u.alive && u.state === 'idle' && u.pos.distanceTo(this.pos) < 30) u.alert(best);
        }
      }
    }
  }

  updateSoldier(dt) {
    const g = this.game;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this.think(); this.thinkTimer = 0.25 + Math.random() * 0.15; }
    if (this.target && !this.target.alive) { this.target = null; this.visible = null; }

    let mx = 0, mz = 0, speed = 0;

    if (this.state === 'idle') {
      if (this.team === 'army') {
        const f = this.followPoint();
        if (f) {
          const d = Math.hypot(f.x - this.pos.x, f.z - this.pos.z);
          if (d > 2) { this.faceTowards(f.x, f.z, dt); mx = f.x - this.pos.x; mz = f.z - this.pos.z; speed = d > 10 ? 6 : 4; }
        }
        if (g.alertLevel > 0) this.state = 'combat';
      } else {
        // look around slowly at the post
        this.yaw += Math.sin(g.time * 0.3 + this.walkPhase) * dt * 0.3;
      }
      this.pitch *= 0.9;
    } else {
      const tgt = this.visible;
      if (tgt) {
        const dist = tgt.pos.distanceTo(this.pos);
        this.faceTowards(tgt.pos.x, tgt.pos.z, dt, 8);
        this.pitch = Math.atan2(tgt.pos.y - this.pos.y, dist);
        // keep a fighting distance and side-step now and then
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) { this.strafe = -this.strafe; this.strafeTimer = 1.5 + Math.random() * 2.5; }
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const want = this.team === 'army' ? 18 : 22;
        const adv = dist > want + 8 ? 1 : dist < 8 ? -1 : 0;
        mx = fx * adv + -fz * this.strafe * 0.5;
        mz = fz * adv + fx * this.strafe * 0.5;
        speed = this.burst > 0 ? 0 : 2.2;
        this.fireAt(tgt, dist, dt);
      } else if (this.lastSeen) {
        const d = Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
        if (d > 4) {
          this.faceTowards(this.lastSeen.x, this.lastSeen.z, dt);
          mx = this.lastSeen.x - this.pos.x; mz = this.lastSeen.z - this.pos.z;
          speed = 3.8;
        } else this.lastSeen = null;
      } else if (this.team === 'army') {
        const f = this.followPoint();
        if (f && Math.hypot(f.x - this.pos.x, f.z - this.pos.z) > 3) {
          this.faceTowards(f.x, f.z, dt);
          mx = f.x - this.pos.x; mz = f.z - this.pos.z; speed = 5;
        }
        if (g.alertLevel <= 0) this.state = 'idle';
      } else {
        // alerted but nobody in sight: move towards the player's squad
        const p = g.player;
        if (p.alive && p.pos.distanceTo(this.pos) < 90) {
          this.faceTowards(p.pos.x, p.pos.z, dt, 2);
          mx = p.pos.x - this.pos.x; mz = p.pos.z - this.pos.z; speed = 2.5;
        }
      }
    }
    this.move(mx, mz, speed, dt);
    this.separate(dt);
  }

  followPoint() {
    if (this.tag === 'linkup') return null;
    const p = this.game.player;
    if (!p.alive) return null;
    const side = this.followSlot % 2 ? 1 : -1;
    const back = 4 + Math.floor(this.followSlot / 2) * 3;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    return { x: p.pos.x - fx * back - fz * side * 3, z: p.pos.z - fz * back + fx * side * 3 };
  }

  separate() {
    for (const u of this.game.units) {
      if (u === this || !u.alive) continue;
      const dx = this.pos.x - u.pos.x, dz = this.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 1e-3) {
        this.pos.x += (dx / d) * (0.8 - d) * 0.5;
        this.pos.z += (dz / d) * (0.8 - d) * 0.5;
      }
    }
  }

  fireAt(tgt, dist, dt) {
    const g = this.game;
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    if (this.burst <= 0) {
      this.burst = 2 + Math.floor(Math.random() * 4);
    }
    this.burst--;
    this.fireTimer = this.burst > 0 ? 0.11 : 0.9 + Math.random() * 1.2;

    const from = this.muzzleWorld(new THREE.Vector3());
    let chance;
    if (this.team === 'army') chance = THREE.MathUtils.clamp(0.45 - dist / 120, 0.1, 0.4);
    else {
      chance = THREE.MathUtils.clamp(0.42 - dist / 130, 0.05, 0.35);
      if (tgt.isPlayer) {
        if ((tgt.speed || 0) > 4.5) chance *= 0.55;
        else if ((tgt.speed || 0) > 0.5) chance *= 0.8;
        chance *= g.difficulty;
      }
    }
    const hit = Math.random() < chance;
    const aim = new THREE.Vector3(tgt.pos.x, tgt.pos.y + 1.2, tgt.pos.z);
    if (!hit) {
      aim.x += (Math.random() - 0.5) * 3;
      aim.y += (Math.random() - 0.3) * 1.5;
      aim.z += (Math.random() - 0.5) * 3;
    }
    const dir = aim.clone().sub(from).normalize();
    const res = g.world.raycast(from, dir, 200, this);
    const end = res ? res.point : from.clone().addScaledVector(dir, 200);
    g.fx.tracer(from, end, this.team === 'ltte' ? 0xffb060 : 0xfff2a0);
    g.fx.muzzle(from);
    g.audio.shot(from, false);
    if (res?.kind === 'unit') {
      if (res.unit.team === 'civ') return; // soldiers on both sides hold fire on civilians in this game
      const dmg = this.team === 'army' ? 26 : 7 + Math.random() * 6;
      res.unit.damage(res.head ? dmg * 1.6 : dmg, this);
      if (res.unit.isPlayer) g.onPlayerHit(from);
    } else if (res) {
      g.fx.impact(res.point, res.kind);
    }
    if (tgt.isPlayer && !hit && from.distanceTo(tgt.pos) < 60) g.audio.whiz();
  }
}
