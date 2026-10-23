// Soldiers (player, allies, LTTE cadres) and civilians: model, animation and AI.

import * as THREE from 'three';
import { models } from './assets.js';
import { TOWER_HEIGHT } from './world.js';

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
    this.name = team === 'army' && !this.isPlayer ? opts.name || ALLY_NAMES[opts.index % ALLY_NAMES.length] : null;
    this.role = opts.role || 'rifleman';
    this.sentry = !!opts.sentry;
    this.patrol = !!opts.patrol;
    this.elev = this.sentry ? TOWER_HEIGHT : 0;
    this.pos = new THREE.Vector3(x, game.world.height(x, z) + this.elev, z);
    this.towerCenter = this.sentry ? new THREE.Vector3(x, 0, z) : null;
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.pitch = 0;
    this.stance = 'stand';
    this.maxHp = this.isPlayer ? 100 : team === 'army' ? 160 : 100;
    this.hp = this.maxHp;
    this.alive = true;
    this.radius = 0.38;
    this.walkPhase = Math.random() * 6;
    this.deadTime = 0;
    this.detect = 0;
    this.marked = false;

    const modelName = opts.model || (team === 'army' ? 'soldier_army' : team === 'ltte' ? 'soldier_ltte' : 'civilian');
    this.obj = (models[modelName] || models.soldier_army).clone(true);
    const p = (n) => this.obj.getObjectByName(n);
    this.parts = { torso: p('Torso'), head: p('Head'), armL: p('ArmL'), armR: p('ArmR'), legL: p('LegL'), legR: p('LegR'), muzzle: p('Muzzle'), rifle: p('Rifle') };
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
    this.patrolPoint = this.pos.clone();
    this.patrolWait = Math.random() * 3;
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

  // smaller target when crouched, prone or hiding
  get bodyHeight() {
    if (this.team === 'civ' && this.state === 'wait') return 1.0;
    return this.stance === 'prone' ? 0.45 : this.stance === 'crouch' ? 1.0 : 1.48;
  }

  get eyeHeight() {
    return this.stance === 'prone' ? 0.4 : this.stance === 'crouch' ? 1.05 : 1.55;
  }

  get eye() {
    return _w.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  // how visible this soldier is to an observer (stance, movement, vegetation)
  get exposure() {
    let e = this.stance === 'prone' ? 0.3 : this.stance === 'crouch' ? 0.6 : 1;
    const s = this.speed || 0;
    if (s > 5) e *= 1.4;
    else if (s < 0.2) e *= 0.8;
    if (this.game.world.inBush(this.pos.x, this.pos.z)) e *= 0.55;
    return e;
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
      this.underFire = 6;
    } else {
      this.hp -= amount;
    }
    this.lastHurt = this.game.time;
    if (this.team === 'ltte' && this.state !== 'combat' && this.state !== 'alarm') {
      if (from?.pos) this.lastSeen = from.pos.clone();
      this.enterCombat(from);
    }
    if (this.hp <= 0) this.die(from);
  }

  // kept for callers outside the AI (explosions, reinforcements)
  alert(from) {
    if (this.team === 'ltte') this.enterCombat(from);
  }

  enterCombat(from) {
    if (!this.alive || this.team !== 'ltte') return;
    const wasCalm = this.state !== 'combat' && this.state !== 'alarm';
    this.detect = 1;
    if (from && from.alive) {
      this.target = from;
      this.lastSeen = from.pos.clone();
    }
    if (this.state !== 'alarm') this.state = 'combat';
    this.lostTime = 0;
    if (!wasCalm) return;
    this.fireTimer = 0.6 + Math.random() * 0.8;
    this.game.onEnemyAlerted?.(this);
    for (const u of this.game.units) {
      if (u !== this && u.alive && u.team === 'ltte' && u.state !== 'combat' && u.state !== 'alarm' && u.pos.distanceTo(this.pos) < 30) {
        u.lastSeen = this.lastSeen?.clone() || null;
        u.enterCombat(from);
      }
    }
  }

  // a sound at pos: gunshots alarm cadres, footsteps make them curious
  hear(pos, radius, gunshot) {
    if (!this.alive || this.team !== 'ltte' || this.state === 'combat' || this.state === 'alarm') return;
    const d = this.pos.distanceTo(pos);
    if (d > radius) return;
    if (this.game.isLaterGroup?.(this.tag) && d > 25) return; // groups for later objectives stay put
    this.lastSeen = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * d * 0.2, 0, (Math.random() - 0.5) * d * 0.2));
    if (gunshot) {
      this.detect = Math.max(this.detect, 0.75);
      if (d < radius * 0.5) this.enterCombat(this.game.player);
      else { this.state = 'search'; this.searchTime = 14; }
    } else if (this.state === 'idle') {
      this.detect = Math.max(this.detect, 0.4);
      this.state = 'suspicious';
      this.suspiciousTime = 0;
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
    if (this.towerCenter) {
      // stay on the tower platform
      const ox = this.pos.x - this.towerCenter.x, oz = this.pos.z - this.towerCenter.z, d = Math.hypot(ox, oz);
      if (d > 1.1) { this.pos.x = this.towerCenter.x + (ox / d) * 1.1; this.pos.z = this.towerCenter.z + (oz / d) * 1.1; }
    } else {
      world.resolve(this.pos, this.radius);
    }
    this.pos.y = world.height(this.pos.x, this.pos.z) + this.elev;
    if (!this.isPlayer && len > 1e-3 && speed > 0 && !(this.avoidTimer > 0) && !this.towerCenter) {
      const moved = Math.hypot(this.pos.x - sx, this.pos.z - sz);
      if (moved < speed * dt * 0.35) {
        this.avoidTimer = 0.6 + Math.random() * 0.8;
        this.avoidSign = Math.random() < 0.5 ? 1 : -1;
      }
    }
  }

  // climb onto / down from a watchtower (player)
  setTower(tower) {
    if (tower) {
      this.elev = TOWER_HEIGHT;
      this.towerCenter = new THREE.Vector3(tower.x, 0, tower.z);
      this.pos.set(tower.x, tower.y + TOWER_HEIGHT, tower.z);
    } else if (this.towerCenter) {
      const c = this.towerCenter;
      this.elev = 0;
      this.towerCenter = null;
      this.pos.set(c.x + 2.4, this.game.world.height(c.x + 2.4, c.z), c.z);
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
    o.rotation.x = 0;
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
      return;
    }
    let pitch = this.pitch;
    if (this.stance === 'crouch') {
      // kneel: one foot planted forward, the other leg back, body lowered
      P.legL.rotation.x = B.legL.x + 0.98 + swing * 0.3;
      P.legR.rotation.x = B.legR.x - 0.62 - swing * 0.3;
      o.position.y = this.pos.y - 0.42;
    } else if (this.stance === 'prone') {
      // lie on the stomach; the torso tilts back up to aim
      o.rotation.x = 1.42;
      o.position.y = this.pos.y + 0.18;
      P.legL.rotation.x = B.legL.x + swing * 0.3;
      P.legR.rotation.x = B.legR.x - swing * 0.3;
      pitch = this.pitch + 1.25;
    }
    P.torso.rotation.x = B.torso.x - pitch * 0.85;
    P.head.rotation.x = B.head.x - pitch * 0.2;
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
    _v.set(u.pos.x, u.pos.y + Math.min(1.3, u.bodyHeight - 0.15), u.pos.z);
    return this.game.world.lineOfSight(a, _v);
  }

  think(dt) {
    const alert = this.state === 'combat' || this.state === 'search' || this.state === 'alarm';
    const view = this.sentry ? 95 : this.role === 'marksman' ? 110 : this.team === 'ltte' ? 62 : 75;
    let best = null, bestD = Infinity;
    for (const h of this.hostiles()) {
      const d = h.pos.distanceTo(this.pos);
      const exposure = this.team === 'ltte' ? h.exposure : 1;
      if (d > view * (0.5 + 0.5 * Math.min(1, exposure)) || d > bestD) continue;
      if (this.team === 'ltte' && !alert && d > 4) {
        // calm cadres only see inside their field of view
        const ang = Math.atan2(h.pos.x - this.pos.x, h.pos.z - this.pos.z) - this.yaw;
        if (Math.cos(ang) < 0.42) continue;
      }
      if (this.canSee(h, view)) { best = h; bestD = d; }
    }
    this.visible = best;

    if (this.team === 'army') return;

    if (best) {
      if (this.state === 'combat' || this.state === 'alarm') {
        this.target = best;
        this.lastSeen = best.pos.clone();
        this.lostTime = 0;
        return;
      }
      // fill the detection meter: faster when close, standing, moving or out in the open
      const rate = Math.pow(best.exposure, 1.5) * THREE.MathUtils.clamp(20 / Math.max(1, bestD), 0.25, 4) * this.game.difficulty * 0.6;
      this.detect = Math.min(1, this.detect + rate * dt);
      if (bestD < 3.5) this.detect = 1;
      this.lastSeen = best.pos.clone();
      if (this.detect >= 1) this.enterCombat(best);
      else if (this.detect > 0.3 && this.state === 'idle') { this.state = 'suspicious'; this.suspiciousTime = 0; }
    } else if (this.state !== 'combat' && this.state !== 'alarm') {
      this.detect = Math.max(0, this.detect - 0.3 * dt);
    }
  }

  updateSoldier(dt) {
    const g = this.game;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      const step = 0.25 + Math.random() * 0.1;
      this.think(step);
      this.thinkTimer = step;
    }
    if (this.target && !this.target.alive) { this.target = null; this.visible = null; }
    if (this.team === 'army') { this.updateAlly(dt); return; }

    let mx = 0, mz = 0, speed = 0;
    const flat = (p) => Math.hypot(p.x - this.pos.x, p.z - this.pos.z);

    switch (this.state) {
      case 'idle':
        this.pitch *= 0.9;
        if (this.patrol && !this.sentry) {
          if (flat(this.patrolPoint) < 1.2) {
            this.patrolWait -= dt;
            this.yaw += Math.sin(g.time * 0.5 + this.walkPhase) * dt * 0.5;
            if (this.patrolWait <= 0) {
              const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 12;
              const px = this.home.x + Math.cos(a) * r, pz = this.home.z + Math.sin(a) * r;
              if (!g.world.isWater(px, pz, 0) && !g.world.blocked(px, pz, 0.6)) this.patrolPoint.set(px, 0, pz);
              this.patrolWait = 2 + Math.random() * 4;
            }
          } else {
            this.faceTowards(this.patrolPoint.x, this.patrolPoint.z, dt, 3);
            mx = this.patrolPoint.x - this.pos.x; mz = this.patrolPoint.z - this.pos.z; speed = 1.4;
          }
        } else {
          // guards and sentries scan their sector
          this.yaw += Math.sin(g.time * (this.sentry ? 0.25 : 0.3) + this.walkPhase) * dt * (this.sentry ? 0.6 : 0.3);
        }
        break;

      case 'suspicious':
        this.suspiciousTime += dt;
        if (this.lastSeen) this.faceTowards(this.lastSeen.x, this.lastSeen.z, dt, 3);
        if (this.suspiciousTime > 1.5 && this.lastSeen && !this.sentry && flat(this.lastSeen) > 2) {
          mx = this.lastSeen.x - this.pos.x; mz = this.lastSeen.z - this.pos.z; speed = 1.8;
        }
        if (this.detect <= 0.05) this.state = 'idle';
        break;

      case 'search':
        this.searchTime -= dt;
        if (this.lastSeen && flat(this.lastSeen) > 3 && !this.sentry) {
          this.faceTowards(this.lastSeen.x, this.lastSeen.z, dt, 4);
          mx = this.lastSeen.x - this.pos.x; mz = this.lastSeen.z - this.pos.z; speed = 3.2;
        } else this.yaw += dt * 0.9;
        if (this.searchTime <= 0) {
          this.state = 'idle';
          this.detect = 0.5;
          this.home = this.pos.clone();
          this.patrolPoint = this.pos.clone();
        }
        break;

      case 'alarm': {
        const a = g.alarmFor?.(this);
        if (!a || a.disabled || a.triggered) { this.state = 'combat'; break; }
        this.faceTowards(a.x, a.z, dt, 8);
        mx = a.x - this.pos.x; mz = a.z - this.pos.z; speed = 5.2;
        if (flat(a) < 1.8) g.triggerAlarm(a);
        break;
      }

      default: { // combat
        const tgt = this.visible;
        if (tgt) {
          const dist = tgt.pos.distanceTo(this.pos);
          this.faceTowards(tgt.pos.x, tgt.pos.z, dt, 8);
          this.pitch = Math.atan2(tgt.pos.y - this.pos.y, dist);
          // keep a fighting distance and side-step now and then
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0) { this.strafe = -this.strafe; this.strafeTimer = 1.5 + Math.random() * 2.5; }
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          const adv = dist > 30 ? 1 : dist < 8 ? -1 : 0;
          mx = fx * adv + -fz * this.strafe * 0.5;
          mz = fz * adv + fx * this.strafe * 0.5;
          speed = this.burst > 0 ? 0 : 2.2;
          this.fireAt(tgt, dist, dt);
        } else {
          this.lostTime = (this.lostTime || 0) + dt;
          const p = this.lastSeen || (g.player.alive ? g.player.pos : null);
          if (p && flat(p) > 4) {
            this.faceTowards(p.x, p.z, dt, 3);
            mx = p.x - this.pos.x; mz = p.z - this.pos.z; speed = 3.2;
          } else if (this.lastSeen) this.lastSeen = null;
          if (this.lostTime > 12) { this.state = 'search'; this.searchTime = 12; this.lastSeen = g.player.pos.clone(); }
        }
      }
    }
    if (this.sentry) speed = 0;
    this.move(mx, mz, speed, dt);
    this.separate(dt);
  }

  // allies follow, hold or move on the player's orders and keep their weapons tight until told otherwise
  updateAlly(dt) {
    const g = this.game, order = g.squadOrders || { mode: 'follow', fire: 'tight' };
    this.underFire = Math.max(0, (this.underFire || 0) - dt);
    let mx = 0, mz = 0, speed = 0;
    const tgt = this.visible;
    const engaged = tgt && (order.fire === 'free' || tgt.state === 'combat' || tgt.state === 'alarm' || g.alertLevel > 0 || this.underFire > 0);
    const pl = g.player;
    const myOrder = this.order || 'follow';

    if (myOrder === 'follow') this.stance = pl.stance === 'stand' ? 'stand' : pl.stance;
    else this.stance = engaged ? 'crouch' : (pl.stance === 'prone' ? 'prone' : 'crouch');

    if (engaged) {
      const dist = tgt.pos.distanceTo(this.pos);
      this.faceTowards(tgt.pos.x, tgt.pos.z, dt, 8);
      this.pitch = Math.atan2(tgt.pos.y - this.pos.y, dist);
      this.fireAt(tgt, dist, dt);
      if (myOrder === 'follow' && dist > 40) { mx = Math.sin(this.yaw); mz = Math.cos(this.yaw); speed = 2.5; }
    } else {
      this.pitch *= 0.9;
      let dest = null;
      if (myOrder === 'follow') dest = this.followPoint();
      else if (this.orderPos) dest = this.orderPos;
      if (dest) {
        const d = Math.hypot(dest.x - this.pos.x, dest.z - this.pos.z);
        if (d > (myOrder === 'follow' ? 2 : 1)) {
          this.faceTowards(dest.x, dest.z, dt);
          mx = dest.x - this.pos.x; mz = dest.z - this.pos.z;
          speed = d > 12 ? 6 : d > 5 ? 4.2 : 2.5;
          if (this.stance === 'crouch') speed = Math.min(speed, 2.6);
          if (this.stance === 'prone') speed = Math.min(speed, 1);
        } else if (myOrder !== 'follow') {
          this.yaw += Math.sin(g.time * 0.3 + this.walkPhase) * dt * 0.3; // watch the sector
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
    if (this.towerCenter) return;
    for (const u of this.game.units) {
      if (u === this || !u.alive || u.towerCenter) continue;
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
    const marksman = this.role === 'marksman';
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    if (this.burst <= 0) this.burst = marksman || this.sentry ? 1 : 2 + Math.floor(Math.random() * 4);
    this.burst--;
    this.fireTimer = this.burst > 0 ? 0.11 : marksman ? 2.2 + Math.random() : 0.9 + Math.random() * 1.2;

    const from = this.muzzleWorld(new THREE.Vector3());
    let chance;
    if (this.team === 'army') chance = marksman ? THREE.MathUtils.clamp(0.75 - dist / 300, 0.35, 0.7) : THREE.MathUtils.clamp(0.45 - dist / 120, 0.1, 0.4);
    else {
      chance = THREE.MathUtils.clamp((this.sentry ? 0.5 : 0.42) - dist / (this.sentry ? 220 : 130), 0.05, 0.4);
      chance *= THREE.MathUtils.clamp(tgt.exposure ?? 1, 0.35, 1.3);
      if (tgt.isPlayer) chance *= g.difficulty;
    }
    const hit = Math.random() < chance;
    const aim = new THREE.Vector3(tgt.pos.x, tgt.pos.y + Math.min(1.2, tgt.bodyHeight - 0.2), tgt.pos.z);
    if (!hit) {
      aim.x += (Math.random() - 0.5) * 3;
      aim.y += (Math.random() - 0.3) * 1.5;
      aim.z += (Math.random() - 0.5) * 3;
    }
    const dir = aim.clone().sub(from).normalize();
    const res = g.world.raycast(from, dir, 250, this);
    const end = res ? res.point : from.clone().addScaledVector(dir, 250);
    g.fx.tracer(from, end, this.team === 'ltte' ? 0xffb060 : 0xfff2a0);
    g.fx.muzzle(from);
    g.audio.shot(from, false);
    if (res?.kind === 'unit') {
      if (res.unit.team === 'civ') return; // soldiers on both sides hold fire on civilians in this game
      if (res.unit.team === this.team) return; // no friendly fire from AI soldiers
      const dmg = this.team === 'army' ? (marksman ? 90 : 26) : 7 + Math.random() * 6;
      res.unit.damage(res.head ? dmg * 1.6 : dmg, this);
      if (res.unit.isPlayer) g.onPlayerHit(from);
    } else if (res) {
      g.fx.impact(res.point, res.kind);
    }
    if (tgt.isPlayer && !hit && from.distanceTo(tgt.pos) < 60) g.audio.whiz();
  }
}
