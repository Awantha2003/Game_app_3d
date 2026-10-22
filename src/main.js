import * as THREE from 'three';
import './style.css';
import { loadModels } from './assets.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { MISSIONS } from './missions.js';
import { Unit } from './units.js';
import { World } from './world.js';

const $ = (s, r = document) => r.querySelector(s);
const MAG = 30;

class Game {
  constructor() {
    this.canvas = $('#game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);
    this.audio = new Audio();
    this.fx = new FX(this.scene);
    this.input = new Input(this.canvas, $('#touch'));
    this.clock = new THREE.Clock();
    this.state = 'loading';
    this.time = 0;
    this.difficulty = 1;
    this.units = [];
    this.progress = this.loadProgress();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing') this.pause();
    });
    this.bindUI();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ persistence

  loadProgress() {
    try { return JSON.parse(localStorage.getItem('wanni_front_progress')) || { unlocked: 0, done: [] }; }
    catch { return { unlocked: 0, done: [] }; }
  }

  saveProgress() {
    try { localStorage.setItem('wanni_front_progress', JSON.stringify(this.progress)); } catch { /* storage unavailable */ }
  }

  // ------------------------------------------------------------ UI

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show(name) {
    const screen = $('#screen');
    screen.classList.toggle('hidden', !name);
    screen.classList.toggle('clear', name === 'pause');
    for (const p of screen.querySelectorAll('.panel')) p.classList.toggle('hidden', p.dataset.screen !== name);
    $('#hud').classList.toggle('hidden', !['playing', 'pause'].includes(this.state) && name !== null);
    $('#touch').classList.toggle('hidden', !this.input.touch || name !== null);
    $('#clickToPlay').classList.add('hidden');
  }

  bindUI() {
    $('#screen').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      this.audio.init();
      if (act === 'begin') this.beginMission();
      if (act === 'menu') this.showMenu();
      if (act === 'resume') this.resume();
      if (act === 'restart') { this.startMission(this.missionIndex); this.beginMission(); }
      if (act === 'next') {
        if (this.missionIndex + 1 < MISSIONS.length) this.openBriefing(this.missionIndex + 1);
        else this.showEpilogue();
      }
    });
    $('#difficulty').addEventListener('change', (e) => { this.difficulty = parseFloat(e.target.value); });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
    if (this.input.touch) $('#hud').classList.add('touch-mode');
  }

  showMenu() {
    this.state = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    const list = $('.missions');
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'mcard';
      b.disabled = i > this.progress.unlocked;
      b.innerHTML = `<div class="n">MISSION ${i + 1}</div><div class="t">${m.name}</div><div class="s">${m.si}</div><div class="d">${m.date}</div>${this.progress.done.includes(m.id) ? '<div class="done">✔ Completed</div>' : ''}`;
      b.addEventListener('click', () => { this.audio.init(); this.openBriefing(i); });
      list.appendChild(b);
    });
    this.show('menu');
  }

  openBriefing(i) {
    const m = MISSIONS[i];
    this.startMission(i);
    this.state = 'briefing';
    $('.b-date').textContent = `Mission ${i + 1} · ${m.date}`;
    $('.b-title').textContent = `Operation: ${m.name}`;
    $('.b-si').textContent = m.si;
    $('.b-place').textContent = m.place;
    $('.b-text').innerHTML = m.briefing.map((p) => `<p>${p}</p>`).join('');
    $('.b-objs').innerHTML = m.objectives.map((o) => `<li>${o.text}</li>`).join('');
    this.show('briefing');
  }

  beginMission() {
    this.state = 'playing';
    this.show(null);
    this.input.requestLock();
    this.input.resetLook();
    this.toast(`${this.mission.name.toUpperCase()} — ${this.mission.date}`, true);
    this.activateObjective(0);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'pause';
    this.show('pause');
    $('#hud').classList.remove('hidden');
  }

  resume() {
    this.input.resetLook();
    this.state = 'playing';
    this.show(null);
    this.input.requestLock();
    if (!this.input.locked) $('#clickToPlay').classList.remove('hidden');
  }

  showEpilogue() {
    this.state = 'epilogue';
    if (document.pointerLockElement) document.exitPointerLock();
    $('.e-text').innerHTML = MISSIONS[MISSIONS.length - 1].epilogue.map((p) => `<p>${p}</p>`).join('');
    this.show('epilogue');
  }

  toast(text, big = false) {
    const el = document.createElement('div');
    el.className = `toast${big ? ' big' : ''}`;
    el.textContent = text;
    $('.toasts').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  killfeed(text) {
    const el = document.createElement('div');
    el.textContent = text;
    $('.killfeed').prepend(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ------------------------------------------------------------ mission setup

  startMission(i) {
    $('.toasts').innerHTML = '';
    $('.killfeed').innerHTML = '';
    this.missionIndex = i;
    this.mission = MISSIONS[i];
    this.clearMission();
    this.world = new World(this.scene, this.mission, 1000 + i * 77);
    const m = this.mission;
    this.player = new Unit(this, 'army', m.player.x, m.player.z, { player: true, yaw: Math.PI });
    this.units = [this.player];
    for (let k = 0; k < m.allies; k++) {
      const a = new Unit(this, 'army', m.player.x + (k % 2 ? 3 : -3), m.player.z + 4 + k * 2, { index: k, yaw: Math.PI });
      this.units.push(a);
    }
    let idx = 10;
    for (const s of this.world.spawns) {
      const u = new Unit(this, s.team, s.x, s.z, { tag: s.tag, index: idx++, yaw: s.team === 'ltte' ? Math.random() * 6.28 : Math.PI });
      if (s.team === 'ltte') u.yaw = Math.atan2(m.player.x - s.x, m.player.z - s.z) + (Math.random() - 0.5) * 1.8;
      this.units.push(u);
    }
    this.world.units = this.units;
    this.escortZone = m.objectives.find((o) => o.type === 'escort')?.zone || [0, 0, 10];
    this.civTotal = this.units.filter((u) => u.team === 'civ').length;
    this.civSafe = 0;

    this.yaw = Math.PI;
    this.pitch = 0;
    this.ammo = MAG;
    this.reserve = 240;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.bloom = 0;
    this.objIndex = -1;
    this.alertLevel = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.missionTime = 0;
    this.interactProgress = 0;
    this.charges = [];
    this.endTimer = 0;
    this.shellTimer = 8;
    this.supplyCooldown = 0;
    this.lastPlayerHit = -10;
    this.camPos = new THREE.Vector3();
    this.updateCamera(0, true);
  }

  clearMission() {
    for (const u of this.units) u.remove();
    this.units = [];
    this.fx.clear();
    if (this.world) this.world.dispose();
    this.world = null;
  }

  // ------------------------------------------------------------ objectives

  currentObjective() {
    return this.mission?.objectives[this.objIndex];
  }

  activateObjective(i) {
    this.objIndex = i;
    const o = this.currentObjective();
    if (!o) return;
    for (const s of o.spawn || []) {
      for (let k = 0; k < s.n; k++) {
        const x = s.x + (Math.random() - 0.5) * 10, z = s.z + (Math.random() - 0.5) * 10;
        if (this.world.isWater(x, z, 0)) continue;
        const u = new Unit(this, 'ltte', x, z, { tag: s.tag, index: 50 + k });
        u.state = 'combat';
        u.lastSeen = this.player.pos.clone();
        this.units.push(u);
      }
    }
    $('.obj-mission').textContent = `${this.mission.name} · Objective ${i + 1}/${this.mission.objectives.length}`;
    $('.obj-text').textContent = o.text;
    if (i > 0) this.toast(`New objective: ${o.text}`);
  }

  checkObjective() {
    const o = this.currentObjective();
    if (!o || this.endTimer > 0) return;
    let done = false, sub = '';
    if (o.type === 'reach') {
      const d = Math.hypot(this.player.pos.x - o.pos[0], this.player.pos.z - o.pos[1]);
      done = d < o.r;
    } else if (o.type === 'clear') {
      const rest = this.units.filter((u) => u.alive && u.team === 'ltte' && u.tag === o.tag);
      const left = rest.length;
      sub = `Hostiles remaining: ${left}`;
      done = left === 0;
      // the last few stragglers come looking for the squad instead of hiding forever
      if (left <= 2) {
        for (const u of rest) {
          if (u.state === 'idle' || !u.lastSeen) { u.state = 'combat'; u.lastSeen = this.player.pos.clone(); }
        }
      }
    } else if (o.type === 'interact') {
      const ts = this.world.targets.filter((t) => t.tag === o.tag);
      const n = ts.filter((t) => t.done).length;
      sub = ts.length > 1 ? `${n} / ${ts.length}` : '';
      done = ts.every((t) => t.done && !t.pending);
    } else if (o.type === 'escort') {
      const waiting = this.units.filter((u) => u.team === 'civ' && u.state === 'wait').length;
      sub = waiting ? `Reach the civilians (${waiting} waiting)` : `Civilians safe: ${this.civSafe} / ${this.civTotal}`;
      done = this.civSafe >= this.civTotal;
    }
    $('.obj-sub').textContent = sub;
    if (done) {
      this.toast('Objective complete', true);
      if (this.objIndex + 1 < this.mission.objectives.length) this.activateObjective(this.objIndex + 1);
      else this.missionComplete();
    }
  }

  objectiveWaypoint() {
    const o = this.currentObjective();
    if (!o) return null;
    const p = this.player.pos;
    if (o.type === 'reach') return new THREE.Vector3(o.pos[0], this.world.height(o.pos[0], o.pos[1]) + 1.5, o.pos[1]);
    if (o.type === 'clear') {
      const es = this.units.filter((u) => u.alive && u.team === 'ltte' && u.tag === o.tag);
      if (!es.length) return null;
      es.sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
      if (es.length > 2 && es[0].pos.distanceTo(p) < 25) return null; // in contact: no marker
      return es[0].pos.clone().setY(es[0].pos.y + 2);
    }
    if (o.type === 'interact') {
      const ts = this.world.targets.filter((t) => t.tag === o.tag && !t.done);
      ts.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      return ts[0] ? new THREE.Vector3(ts[0].x, ts[0].y + 1.5, ts[0].z) : null;
    }
    if (o.type === 'escort') {
      const waiting = this.units.find((u) => u.team === 'civ' && u.state === 'wait');
      if (waiting) return waiting.pos.clone().setY(waiting.pos.y + 2);
      return new THREE.Vector3(o.zone[0], this.world.height(o.zone[0], o.zone[1]) + 2, o.zone[1]);
    }
    return null;
  }

  missionComplete() {
    this.endTimer = 2.5;
    this.endAction = () => {
      const m = this.mission;
      if (!this.progress.done.includes(m.id)) this.progress.done.push(m.id);
      this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(MISSIONS.length - 1, this.missionIndex + 1));
      this.saveProgress();
      this.state = 'complete';
      if (document.pointerLockElement) document.exitPointerLock();
      $('.c-title').textContent = `${m.name} — ${m.date}`;
      $('.c-text').textContent = m.debrief;
      const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
      const mins = Math.floor(this.missionTime / 60), secs = Math.floor(this.missionTime % 60).toString().padStart(2, '0');
      $('.c-stats').textContent = `Time ${mins}:${secs} · Hostiles neutralised ${this.kills} · Accuracy ${acc}%`;
      $('[data-act="next"]').textContent = this.missionIndex + 1 < MISSIONS.length ? 'Next mission' : 'Epilogue';
      this.show('complete');
    };
  }

  missionFailed(reason) {
    if (this.endTimer > 0) return;
    this.endTimer = 2;
    this.endAction = () => {
      this.state = 'failed';
      if (document.pointerLockElement) document.exitPointerLock();
      $('.f-title').textContent = reason;
      this.show('failed');
    };
  }

  // ------------------------------------------------------------ events

  onUnitKilled(u) {
    if (u.isPlayer) { this.missionFailed('You were killed in action.'); return; }
    if (u.team === 'civ') { this.missionFailed('A civilian was killed. Protecting civilians is your first duty.'); return; }
    if (u.team === 'ltte') this.killfeed('LTTE cadre neutralised');
  }

  onCivilianSafe() {
    this.civSafe++;
    this.toast(`Civilian reached safety (${this.civSafe}/${this.civTotal})`);
  }

  onPlayerHit(from) {
    this.lastPlayerHit = this.time;
    $('.vignette').style.opacity = String(Math.min(1, 0.35 + (1 - this.player.hp / 100) * 0.6));
    this.alertLevel = 8;
    void from;
  }

  noise(pos, radius) {
    // gunfire wakes up everyone nearby, except groups that belong to a later objective
    this.alertLevel = 8;
    const later = new Set(this.mission.objectives.slice(this.objIndex + 1).map((o) => o.tag).filter(Boolean));
    for (const u of this.units) {
      if (u.team !== 'ltte' || !u.alive || u.state !== 'idle') continue;
      const d = u.pos.distanceTo(pos);
      if (d < (later.has(u.tag) ? 25 : radius)) u.alert(this.player);
    }
  }

  // ------------------------------------------------------------ player

  updatePlayer(dt) {
    const inp = this.input, p = this.player;
    if (!p.alive) { p.update(dt); p.sync(dt); return; }

    const look = inp.consumeLook();
    const sens = (inp.aim ? 0.0011 : 0.0022);
    this.yaw -= look.x * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * sens, -1.0, 0.75);

    const mv = inp.moveVec;
    const sprint = inp.sprint && mv.y > 0 && !inp.aim && this.reloading <= 0;
    const speed = inp.aim ? 2.4 : sprint ? 6.8 : 4.3;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    p.move(fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x, speed * Math.min(1, Math.hypot(mv.x, mv.y)), dt);
    p.separate();
    p.yaw = this.yaw;
    p.pitch = this.pitch;
    p.sync(dt);

    // health regeneration
    if (this.time - this.lastPlayerHit > 5) p.hp = Math.min(100, p.hp + 9 * dt);

    // reload
    if ((inp.hit('KeyR') || (this.ammo === 0 && inp.fire)) && this.reloading <= 0 && this.ammo < MAG && this.reserve > 0) {
      this.reloading = 2.2;
      this.audio.click();
      this.toastReload = true;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const take = Math.min(MAG - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.audio.click();
      }
    }

    // fire
    this.fireCooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    if (inp.fire && !sprint && this.reloading <= 0 && this.fireCooldown <= 0) {
      if (this.ammo > 0) this.shoot();
      else if (this.reserve <= 0) { this.audio.click(); this.fireCooldown = 0.3; }
    }

    // resupply
    this.supplyCooldown -= dt;
    for (const s of this.world.supplies) {
      if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 3 && this.reserve < 240 && this.supplyCooldown <= 0) {
        this.reserve = 240;
        this.supplyCooldown = 3;
        this.toast('Ammunition resupplied');
      }
    }

    this.updateInteraction(dt);
  }

  shoot() {
    const p = this.player;
    this.ammo--;
    this.shots++;
    this.fireCooldown = 0.1; // ~600 rounds per minute
    const moving = (p.speed || 0) > 0.5;
    const spread = (this.input.aim ? 0.003 : 0.012) + (moving ? 0.012 : 0) + this.bloom;
    this.bloom = Math.min(0.04, this.bloom + 0.006);

    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const aimDir = dir.clone();
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    // start the ray level with the player so nothing behind them is hit
    const origin = cam.position.clone();
    const toPlayer = new THREE.Vector3().subVectors(p.pos, origin);
    origin.addScaledVector(dir, Math.max(0, toPlayer.dot(dir)));
    const res = this.world.raycast(origin, dir, 350, p);
    const muzzle = p.muzzleWorld(new THREE.Vector3());
    const end = res ? res.point : origin.clone().addScaledVector(dir, 350);
    this.fx.tracer(muzzle, end);
    this.fx.muzzle(muzzle);
    this.audio.shot(null, true);
    this.noise(p.pos, 70);

    if (res?.kind === 'unit') {
      const u = res.unit;
      if (u.team === 'army') {
        this.toast('Check your fire — friendly!');
      } else if (u.team === 'civ') {
        // only shots aimed straight at a civilian hurt them; stray rounds are a warning
        const aimed = this.world.raycast(origin, aimDir, 350, p);
        if (aimed?.unit === u) u.damage(40, p);
        if (u.alive) this.toast('HOLD FIRE — civilians!', true);
      } else {
        this.hits++;
        const dmg = res.head ? 120 : 36;
        u.damage(dmg, p);
        this.fx.hitPuff(res.point);
        const killed = !u.alive;
        if (killed && u.team === 'ltte') this.kills++;
        this.flashHitmarker(killed);
      }
    } else if (res) {
      this.fx.impact(res.point, res.kind);
    }

    // recoil
    this.pitch = Math.min(0.75, this.pitch + 0.006 + Math.random() * 0.006);
    this.yaw += (Math.random() - 0.5) * 0.006;
  }

  flashHitmarker(kill) {
    const h = $('.hitmarker');
    h.classList.toggle('kill', kill);
    h.classList.add('on');
    clearTimeout(this.hmTimer);
    this.hmTimer = setTimeout(() => h.classList.remove('on'), 90);
    this.audio.hitmark();
  }

  updateInteraction(dt) {
    const o = this.currentObjective();
    const prompt = $('.prompt');
    let target = null;
    if (o?.type === 'interact') {
      const p = this.player.pos;
      target = this.world.targets.find((t) => t.tag === o.tag && !t.done && Math.hypot(t.x - p.x, t.z - p.z) < (t.obj ? 7 : 3.5));
    }
    if (!target) {
      prompt.classList.remove('on');
      this.interactProgress = 0;
      return;
    }
    prompt.classList.add('on');
    const key = this.input.touch ? 'E button' : 'E';
    $('.prompt-text').textContent = `Hold ${key}: ${target.plant ? 'Plant charge on' : 'Operate'} ${target.label}`;
    if (this.input.action) {
      this.interactProgress += dt / target.time;
      if (this.interactProgress >= 1) {
        this.interactProgress = 0;
        target.done = true;
        if (target.plant) {
          target.pending = true;
          this.toast('Charge set — move away! (4 s)');
          this.charges.push({ target, timer: 4 });
        } else {
          this.toast('The sluice gates are open — water is flowing to the paddy fields again', true);
        }
      }
    } else {
      this.interactProgress = Math.max(0, this.interactProgress - dt);
    }
    $('.prompt-bar div').style.width = `${Math.min(100, this.interactProgress * 100)}%`;
  }

  detonate(t) {
    const pos = new THREE.Vector3(t.x, Math.max(t.y, this.world.water ?? t.y), t.z);
    this.fx.explosion(pos);
    this.audio.explosion(pos);
    this.fx.shake = Math.max(this.fx.shake, 1.2 - pos.distanceTo(this.player.pos) / 40);
    if (t.obj) this.world.group.remove(t.obj);
    this.world.colliders = this.world.colliders.filter((c) => c.ref !== t);
    for (const u of this.units) {
      const d = u.pos.distanceTo(pos);
      if (u.alive && d < 7) u.damage(u.isPlayer ? 70 * (1 - d / 7) : 200, null);
    }
    t.pending = false;
    this.killfeed('Sea Tiger boat destroyed');
  }

  // ------------------------------------------------------------ camera

  updateCamera(dt, snap = false) {
    const p = this.player;
    const aim = this.input.aim && p.alive;
    const d = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = p.pos.clone().add(new THREE.Vector3(0, p.alive ? 1.78 : 0.8, 0));
    const dist = aim ? 1.6 : 3.2;
    const side = aim ? 0.6 : 0.85;
    let want = pivot.clone().addScaledVector(right, side).addScaledVector(d, -dist);
    // keep the camera out of walls
    const toCam = want.clone().sub(pivot);
    const len = toCam.length();
    toCam.divideScalar(len);
    const hit = this.world.raycast(pivot, toCam, len, null, false);
    if (hit && hit.t < len) want = pivot.clone().addScaledVector(toCam, Math.max(0.3, hit.t - 0.25));
    const gh = this.world.height(want.x, want.z) + 0.3;
    if (want.y < gh) want.y = gh;
    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, Math.min(1, dt * 18));
    this.camera.position.copy(this.camPos);
    if (this.fx.shake > 0) {
      const s = this.fx.shake * 0.15;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camPos.clone().add(d));
    const fov = aim ? 48 : 70;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12 || 1);
    this.camera.updateProjectionMatrix();
    this.audio.setListener(p.pos, this.yaw);
  }

  // ------------------------------------------------------------ HUD

  updateHUD() {
    const p = this.player;
    const hp = $('.hp-bar div');
    hp.style.width = `${Math.max(0, p.hp)}%`;
    hp.classList.toggle('low', p.hp < 35);
    $('.ammo-mag').textContent = this.reloading > 0 ? '··' : this.ammo;
    $('.ammo-res').textContent = `/ ${this.reserve}`;
    $('.ammo').classList.toggle('low', this.ammo <= 5);
    const vig = $('.vignette');
    const base = p.hp < 40 ? (1 - p.hp / 40) * 0.6 : 0;
    const cur = parseFloat(vig.style.opacity || 0);
    vig.style.opacity = String(Math.max(base, cur - 0.02));
    const gap = 5 + ((this.input.aim ? 0.003 : 0.012) + ((p.speed || 0) > 0.5 ? 0.012 : 0) + this.bloom) * 380;
    $('.crosshair').style.setProperty('--gap', `${gap}px`);

    // squad status
    const allies = this.units.filter((u) => u.team === 'army' && !u.isPlayer && u.tag !== 'linkup');
    $('.squad').innerHTML = allies.map((a) => `${a.name} ${a.hp < 60 ? '· wounded' : ''}`).join('<br>');

    // waypoint
    const wp = this.objectiveWaypoint();
    const el = $('.waypoint');
    if (!wp) el.style.display = 'none';
    else {
      el.style.display = 'flex';
      const v = wp.clone().project(this.camera);
      const W = window.innerWidth, H = window.innerHeight;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (v.z > 1) { x = W - x; y = H - 40; }
      x = Math.max(30, Math.min(W - 30, x));
      y = Math.max(70, Math.min(H - 60, y));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      $('.wp-dist').textContent = `${Math.round(wp.distanceTo(p.pos))} m`;
    }
    this.updateCompass(wp);
  }

  updateCompass(wp) {
    const strip = $('.compass-strip');
    const width = strip.parentElement.clientWidth;
    // heading in degrees clockwise from north (north is -Z)
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(Math.sin(this.yaw), -Math.cos(this.yaw))) + 360) % 360;
    if (!this.compassBuilt) {
      const marks = [];
      for (let a = 0; a < 360; a += 15) {
        const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[a];
        marks.push({ a, label: label || String(a), minor: !label });
      }
      strip.innerHTML = '';
      this.compassMarks = marks.map((m) => {
        const s = document.createElement('span');
        s.textContent = m.label;
        if (m.minor) s.className = 'minor';
        strip.appendChild(s);
        return { ...m, el: s };
      });
      this.compassObj = document.createElement('span');
      this.compassObj.className = 'obj';
      this.compassObj.textContent = '◆';
      strip.appendChild(this.compassObj);
      this.compassBuilt = true;
    }
    const pxPerDeg = 3;
    const place = (el, a) => {
      let diff = ((a - heading + 540) % 360) - 180;
      el.style.left = `${width / 2 + diff * pxPerDeg}px`;
      el.style.display = Math.abs(diff) * pxPerDeg > width / 2 + 20 ? 'none' : '';
    };
    for (const m of this.compassMarks) place(m.el, m.a);
    if (wp) {
      const a = (THREE.MathUtils.radToDeg(Math.atan2(wp.x - this.player.pos.x, -(wp.z - this.player.pos.z))) + 360) % 360;
      place(this.compassObj, a);
    } else this.compassObj.style.display = 'none';
  }

  // ------------------------------------------------------------ main loop

  updateShelling(dt) {
    if (!this.mission.shelling) return;
    this.shellTimer -= dt;
    if (this.shellTimer > 0) return;
    this.shellTimer = 6 + Math.random() * 10;
    const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 70;
    const x = this.player.pos.x + Math.cos(a) * r, z = this.player.pos.z + Math.sin(a) * r;
    const pos = new THREE.Vector3(x, this.world.height(x, z), z);
    this.fx.explosion(pos, Math.random() < 0.5);
    this.audio.explosion(pos);
    this.fx.shake = Math.max(this.fx.shake, 0.35 - r / 400);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    if (this.world) this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    if (this.state === 'playing') {
      this.time += dt;
      this.missionTime += dt;
      if (this.input.hit('Escape') || this.input.hit('KeyP')) this.pause();
      this.updatePlayer(dt);
      for (const u of this.units) if (!u.isPlayer) u.update(dt);
      this.alertLevel = Math.max(0, this.alertLevel - dt);
      this.updateShelling(dt);
      for (const c of this.charges) if ((c.timer -= dt) <= 0) this.detonate(c.target);
      this.charges = this.charges.filter((c) => c.timer > 0);
      this.checkObjective();
      if (this.endTimer > 0) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.endAction();
      }
      this.updateCamera(dt);
      this.updateHUD();
      this.fx.update(dt);
      // remove bodies that have sunk away
      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        if (!u.alive && !u.isPlayer && u.deadTime > 30) { u.remove(); this.units.splice(i, 1); }
      }
    } else if (this.world && ['briefing', 'menu', 'complete', 'failed', 'epilogue'].includes(this.state)) {
      // slow orbit behind menus
      this.time += dt;
      const p = this.player.pos;
      const a = this.time * 0.05;
      this.camera.position.set(p.x + Math.sin(a) * 22, p.y + 9, p.z + Math.cos(a) * 22);
      this.camera.lookAt(p.x, p.y + 2, p.z);
      for (const u of this.units) u.sync(0);
      this.fx.update(dt);
    }
    if (this.world) this.world.followSun(this.player.pos);
    this.input.endFrame();
  }
}

const game = new Game();
window.__game = game;
loadModels((k) => { $('.loading-bar div').style.width = `${Math.round(k * 100)}%`; })
  .then(() => {
    game.startMission(Math.min(game.progress.unlocked, MISSIONS.length - 1));
    game.showMenu();
  })
  .catch((err) => {
    console.error(err);
    $('.loading-text').textContent = `Could not load models: ${err.message}`;
  });
