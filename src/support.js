// Support on the radio (L, or CALL on a phone): a fire team of reinforcements,
// an artillery barrage, an air strike and a supply drop. Strikes go on the
// spot the crosshair points at, or on a target marked on the map, and are
// refused near civilians or your own soldiers. In co-op the host carries
// them out; the other players see the aircraft and the shells.

import * as THREE from 'three';
import { models } from './assets.js';
import { Unit } from './units.js';

export const SUPPORT = [
  { id: 'reinforce', name: 'Reinforcements', desc: 'A fire team of three soldiers moves up and joins the section', uses: 2, cooldown: 40 },
  { id: 'artillery', name: 'Artillery barrage', desc: 'Six shells on the target', uses: 1, cooldown: 60, target: true },
  { id: 'airstrike', name: 'Air strike', desc: 'A jet drops four bombs in a line across the target', uses: 1, cooldown: 90, target: true },
  { id: 'supply', name: 'Supply drop', desc: 'A helicopter drops ammunition and first aid beside you', uses: 2, cooldown: 30 },
];

const REINFORCEMENT_NAMES = ['Pte. Jayasinghe', 'Pte. Herath', 'L/Cpl. Wickrama', 'Pte. Gunawardena', 'Pte. Senanayake', 'Cpl. Ekanayake'];

export class Support {
  constructor(game) {
    this.game = game;
    this.el = document.querySelector('.support');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sup]');
      if (b) this.call(b.dataset.sup);
      if (e.target.closest('.sup-close')) this.toggle(false);
    });
    this.reset();
  }

  reset() {
    this.uses = Object.fromEntries(SUPPORT.map((s) => [s.id, s.uses]));
    this.ready = Object.fromEntries(SUPPORT.map((s) => [s.id, 0]));
    this.events = [];
    this.craft = [];
    this.reinforced = 0;
    this.toggle(false);
  }

  clear() {
    for (const c of this.craft) this.game.scene.remove(c.obj);
    this.craft = [];
    this.events = [];
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
  }

  render() {
    const g = this.game, t = g.time;
    const key = g.input.touch ? '' : '<small>1–4 to call · L to close</small>';
    this.el.innerHTML = `<div class="sup-head">RADIO · SUPPORT ${key}<button class="btn small sup-close">✕</button></div>`
      + SUPPORT.map((s, i) => {
        const wait = Math.ceil(this.ready[s.id] - t), left = this.uses[s.id];
        const status = left <= 0 ? 'used' : wait > 0 ? `ready in ${wait} s` : `${left} left`;
        return `<button class="sup-row" data-sup="${s.id}"${left <= 0 || wait > 0 ? ' disabled' : ''}><b>${i + 1} · ${s.name}</b><small>${s.desc}${s.target ? ' — aim at the target or mark it on the map' : ''}</small><em>${status}</em></button>`;
      }).join('')
      + `<div class="sup-note">${g.strikeMark ? `Target marked on the map, ${Math.round(g.strikeMark.distanceTo(g.player.pos))} m away.` : 'Strikes land where your crosshair points, or on a spot you mark on the map (Orders: strike target).'}</div>`;
  }

  // number keys while the menu is open
  keys(inp) {
    SUPPORT.forEach((s, i) => { if (inp.hit(`Digit${i + 1}`)) this.call(s.id); });
    if (Math.floor(this.game.time) !== this.lastRender) { this.lastRender = Math.floor(this.game.time); this.render(); }
  }

  // where a strike goes: the map mark, else the point under the crosshair
  aimPoint() {
    const g = this.game;
    if (g.strikeMark) return g.strikeMark.clone();
    const d = new THREE.Vector3();
    g.camera.getWorldDirection(d);
    const hit = g.world.raycast(g.camera.position, d, 600, g.player, true);
    return hit && hit.kind !== 'water' ? hit.point : null;
  }

  call(id) {
    const g = this.game, s = SUPPORT.find((x) => x.id === id);
    if (!s || g.state !== 'playing') return;
    if (this.uses[id] <= 0) { g.toast(`${s.name}: none left this mission`); return; }
    if (this.ready[id] > g.time) { g.toast(`${s.name}: ready in ${Math.ceil(this.ready[id] - g.time)} s`); return; }
    let point = null;
    if (s.target) {
      point = this.aimPoint();
      if (!point) { g.toast('Aim at the ground (or mark a target on the map) first'); return; }
      const why = this.unsafe(point, id === 'airstrike' ? 30 : 26);
      if (why) { g.radio.say([['command', why]]); g.toast(why, true); return; }
    }
    this.uses[id]--;
    this.ready[id] = g.time + s.cooldown;
    g.strikeMark = null;
    this.toggle(false);
    if (g.net.active && g.net.role === 'guest') {
      g.net.send({ t: 'support', id, p: point ? point.toArray() : null });
      this.radioCall(id);
      return;
    }
    this.execute(id, point, g.player);
  }

  // strikes are refused close to civilians and to your own soldiers
  unsafe(p, r) {
    const g = this.game;
    const civ = g.units.some((u) => u.alive && u.team === 'civ' && u.pos.distanceTo(p) < r + 10);
    if (civ) return 'Negative — civilians near that target. Strike denied.';
    const own = g.units.some((u) => u.alive && u.team === 'army' && u.pos.distanceTo(p) < r);
    if (own) return 'Negative — danger close, too near our own troops.';
    return null;
  }

  radioCall(id) {
    const g = this.game;
    const lines = {
      reinforce: [['ruwan', 'Command, this is Alpha. Request a fire team at our position.'], ['command', 'Roger, Alpha. Fire team on the way to you.']],
      artillery: [['ruwan', 'Fire mission! Grid as marked, six rounds.'], ['command', 'Six rounds, shot over. Keep your heads down.']],
      airstrike: [['ruwan', 'Request air support on the marked target.'], ['command', 'Air strike approved. Jet inbound, thirty seconds.']],
      supply: [['ruwan', 'Running low. Request a supply drop at our position.'], ['command', 'Roger. Helicopter inbound with a crate.']],
    }[id];
    g.radio.say(lines);
  }

  // host (or single player): carry the call out
  execute(id, point, by, quiet = false) {
    const g = this.game;
    if (!quiet) this.radioCall(id);
    if (g.net.active) g.net.send({ t: 'supfx', id, p: point ? point.toArray() : null, at: g.player.pos.toArray() });
    if (id === 'reinforce') this.reinforce(by);
    else if (id === 'artillery') this.barrage(point, false);
    else if (id === 'airstrike') this.airstrike(point, false);
    else if (id === 'supply') this.supplyDrop((by || g.player).pos.clone(), false);
  }

  // other players: show the aircraft and shells (the host's blasts arrive as explosions)
  showFx(m) {
    const p = m.p ? new THREE.Vector3(...m.p) : null;
    if (m.id === 'artillery') this.barrage(p, true);
    else if (m.id === 'airstrike') this.airstrike(p, true);
    else if (m.id === 'supply') this.supplyDrop(new THREE.Vector3(...m.at), true);
  }

  later(t, fn) { this.events.push({ t: this.game.time + t, fn }); }

  // three soldiers come up from the start of the mission (or from behind you)
  reinforce(by) {
    const g = this.game, w = g.world, me = (by || g.player).pos, start = g.mission.player;
    let ox = start.x, oz = start.z;
    if (Math.hypot(ox - me.x, oz - me.z) < 50) {
      const a = Math.atan2(me.x, me.z); // further from the map centre
      ox = me.x + Math.sin(a) * 45; oz = me.z + Math.cos(a) * 45;
    }
    ox = THREE.MathUtils.clamp(ox, -w.size + 6, w.size - 6);
    oz = THREE.MathUtils.clamp(oz, -w.size + 6, w.size - 6);
    const slot0 = g.units.filter((u) => u.team === 'army' && !u.isPlayer && !u.remote).length;
    for (let k = 0; k < 3; k++) {
      let x = ox + (k - 1) * 2.5, z = oz;
      if (w.isWater(x, z, -0.2) || w.blocked(x, z, 0.5)) { x = me.x + (k - 1) * 2; z = me.z + 3; }
      const u = new Unit(g, 'army', x, z, { index: slot0 + k, name: REINFORCEMENT_NAMES[(this.reinforced * 3 + k) % REINFORCEMENT_NAMES.length] });
      u.reinforcement = true;
      u.order = 'follow';
      u.followSlot = slot0 + k;
      u.nid = g.nextNid++;
      g.units.push(u);
    }
    this.reinforced++;
    g.toast('Reinforcements are moving up to you', true);
  }

  barrage(p, visualOnly) {
    const g = this.game;
    for (let k = 0; k < 6; k++) {
      this.later(6 + k * 1.3 + Math.random() * 0.6, () => {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 12;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const pos = new THREE.Vector3(x, g.world.height(x, z), z);
        g.audio.whiz();
        if (!visualOnly) g.explode(pos, 9, 320, g.player);
      });
    }
    this.later(5, () => g.toast('Shot, over — rounds landing!'));
  }

  // a jet visual flying a straight line; drop(i) fires along the way
  flyCraft(model, from, to, speed, alt, onPass) {
    const g = this.game, obj = models[model].clone(true);
    const dir = to.clone().sub(from).setY(0).normalize();
    obj.position.copy(from).setY(alt);
    obj.rotation.y = Math.atan2(dir.x, dir.z);
    g.scene.add(obj);
    this.craft.push({ obj, dir, speed, life: from.distanceTo(to) / speed, onPass, passed: new Set(), t: 0 });
  }

  airstrike(p, visualOnly) {
    const g = this.game, w = g.world;
    const a = Math.atan2(p.x - g.player.pos.x, p.z - g.player.pos.z) + Math.PI / 2;
    const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const from = p.clone().addScaledVector(d, -420), to = p.clone().addScaledVector(d, 420);
    const alt = Math.max(w.height(p.x, p.z), w.water ?? -99) + 55;
    this.later(8, () => {
      this.flyCraft('jet', from, to, 85, alt, (c) => {
        // bombs leave the jet about 26 m before each aim point and fall forward onto it
        for (let k = 0; k < 4; k++) {
          const along = (k - 1.5) * 9;
          if (c.passed.has(k)) continue;
          const pos = c.obj.position, ahead = p.clone().addScaledVector(d, along - 26);
          if ((pos.x - ahead.x) * d.x + (pos.z - ahead.z) * d.z < 0) continue;
          c.passed.add(k);
          if (k === 0) g.audio.flyby(pos);
          if (!visualOnly) g.fireRocket(pos.clone().setY(pos.y - 1.5), null, g.player, { bomb: true, vel: d.clone().multiplyScalar(8.5).setY(-4), r: 12, dmg: 450, ignore: g.player });
        }
      });
    });
    this.later(6, () => g.toast('Jet inbound — air strike!'));
  }

  supplyDrop(at, visualOnly) {
    const g = this.game, w = g.world;
    let x = at.x + 5, z = at.z + 3;
    for (let k = 0; k < 10 && (w.isWater(x, z, -0.2) || w.blocked(x, z, 1.4)); k++) { x = at.x + Math.cos(k) * (4 + k); z = at.z + Math.sin(k) * (4 + k); }
    const drop = new THREE.Vector3(x, w.height(x, z), z);
    const from = drop.clone().add(new THREE.Vector3(-260, 0, -120)), to = drop.clone().add(new THREE.Vector3(260, 0, 120));
    const alt = drop.y + 28;
    this.later(7, () => {
      this.flyCraft('helicopter', from, to, 40, alt, (c) => {
        if (c.passed.has(0)) return;
        const pos = c.obj.position;
        if ((pos.x - drop.x) * c.dir.x + (pos.z - drop.z) * c.dir.z < 0) return;
        c.passed.add(0);
        const crate = models.supplies.clone(true);
        crate.position.set(x, pos.y - 3, z);
        g.world.group.add(crate);
        this.events.push({ t: 0, crate, y0: drop.y, landed: false, visualOnly });
      });
    });
    void visualOnly;
  }

  update(dt) {
    const g = this.game;
    for (const e of [...this.events]) {
      if (e.crate) {
        // the crate falls on its parachute, then it is a supply point
        e.crate.position.y -= 7 * dt;
        if (e.crate.position.y <= e.y0) {
          e.crate.position.y = e.y0;
          this.events.splice(this.events.indexOf(e), 1);
          const { x, z } = e.crate.position;
          g.world.addColliders('supplies', x, e.y0, z, 0, 1);
          g.world.supplies.push({ x, z });
          g.toast('Supply crate down — walk up to it to resupply', true);
        }
        continue;
      }
      if (g.time >= e.t) { this.events.splice(this.events.indexOf(e), 1); e.fn(); }
    }
    for (const c of [...this.craft]) {
      c.t += dt;
      c.obj.position.addScaledVector(c.dir, c.speed * dt);
      const rotor = c.obj.getObjectByName('Rotor');
      if (rotor) rotor.rotation.y += dt * 30;
      c.onPass?.(c);
      if (c.t > c.life) { g.scene.remove(c.obj); this.craft.splice(this.craft.indexOf(c), 1); }
    }
  }
}
