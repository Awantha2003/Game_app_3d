import * as THREE from 'three';
import './style.css';
import { loadModels, models } from './assets.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { MISSIONS } from './missions.js';
import { Prologue } from './cinematic.js';
import { Insertion } from './insertion.js';
import { PostFX } from './postfx.js';
import { Weather } from './weather.js';
import { Profile } from './profile.js';
import { Radio } from './radio.js';
import {
  CHARACTERS, CLOSING, HISTORY_TIMELINE, HUMAN_COST, MEDALS, PROLOGUE, RANKS, SOURCES, SQUAD_EPILOGUE, STORY, nextRank,
} from './story.js';
import { Unit } from './units.js';
import { World } from './world.js';

const $ = (s, r = document) => r.querySelector(s);

// The player's weapons. Noise is how far (m) the shot is heard.
const WEAPONS = [
  { id: 't56', name: 'T-56 rifle', mag: 30, reserve: 240, interval: 0.1, auto: true, body: 36, head: 120, spreadHip: 0.012, spreadAim: 0.003, recoil: 0.009, noise: 70, reload: 2.2 },
  { id: 'pistol', name: 'Pistol · suppressed', mag: 8, reserve: 48, interval: 0.25, auto: false, body: 34, head: 110, spreadHip: 0.01, spreadAim: 0.004, recoil: 0.014, noise: 9, reload: 1.6, suppressed: true },
  { id: 'svd', name: 'SVD Dragunov', mag: 10, reserve: 40, interval: 0.45, auto: false, body: 110, head: 200, spreadHip: 0.03, spreadAim: 0.0004, recoil: 0.03, noise: 130, reload: 2.8, scope: true },
];

class Game {
  constructor() {
    this.canvas = $('#game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1100);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.audio = new Audio();
    this.fx = new FX(this.scene);
    this.input = new Input(this.canvas, $('#touch'));
    this.clock = new THREE.Clock();
    this.state = 'loading';
    this.time = 0;
    this.units = [];
    this.profile = new Profile(MISSIONS.map((m) => m.id));
    this.difficulty = this.profile.settings.difficulty;
    this.audio.setVolume(this.profile.settings.volume);
    this.radio = new Radio($('.radio'), this.audio);
    this.prologue = new Prologue(this);
    this.cinematic = null;
    this.flags = {};
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing') this.pause();
    });
    this.bindUI();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ settings

  // low: no shadows or post effects, fewer grass cards; medium: 1024 shadows,
  // grade only; high: 2048 shadows, 4x MSAA, bloom and the densest foliage
  applyQuality() {
    const q = this.profile.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(dpr, q === 'medium' ? 1.5 : 2));
    if (this.world) {
      this.world.sun.castShadow = q !== 'low';
      this.renderer.toneMappingExposure = this.world.atm.exposure;
      this.postfx.setGrade(this.world.atm.grade);
    }
    this.resize();
    this.postfx.setup(q);
  }

  // cinematic framing: letterbox bars, a fade up from black and a title card
  cinema(on, title = null) {
    $('#letterbox').classList.toggle('on', on);
    if (title) {
      const tc = $('#titlecard');
      tc.querySelector('.tc-name').textContent = title[0];
      tc.querySelector('.tc-sub').textContent = title[1];
      tc.classList.remove('on');
      void tc.offsetWidth;
      tc.classList.add('on');
    }
  }

  fadeIn() {
    const f = $('#fade');
    f.classList.remove('up');
    void f.offsetWidth;
    f.classList.add('up');
  }

  // ------------------------------------------------------------ UI

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx?.resize();
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
      this.audio.click();
      const actions = {
        start: () => this.startGame(),
        begin: () => this.beginMission(),
        menu: () => this.showMenu(),
        resume: () => this.resume(),
        restart: () => { this.startMission(this.missionIndex); this.beginMission(); },
        next: () => this.afterDebrief(),
        'promo-next': () => this.nextAfterMission(),
        continue: () => this.continueCampaign(),
        newcampaign: () => this.playPrologue(() => this.openBriefing(0)),
        prologue: () => this.playPrologue(() => this.showMenu()),
        missions: () => this.showMissions(),
        squad: () => this.showSquad(),
        profile: () => this.showProfile(),
        archive: () => this.showArchive(),
        settings: () => this.showSettings(),
        credits: () => this.show('credits'),
        reset: () => {
          if (window.confirm('Reset all campaign progress, XP and commendations? Settings are kept.')) {
            this.profile.reset();
            this.showProfile();
          }
        },
      };
      actions[act]?.();
    });
    const bindRange = (id, out, key, fmt) => {
      const el = $(id);
      el.addEventListener('input', () => {
        this.profile.setSetting(key, parseFloat(el.value));
        $(out).textContent = fmt(parseFloat(el.value));
        if (key === 'volume') this.audio.setVolume(this.profile.settings.volume);
      });
    };
    bindRange('#set-sens', '#out-sens', 'sensitivity', (v) => `${v.toFixed(2)}×`);
    bindRange('#set-vol', '#out-vol', 'volume', (v) => `${Math.round(v * 100)}%`);
    $('#set-diff').addEventListener('change', (e) => {
      this.profile.setSetting('difficulty', parseFloat(e.target.value));
      this.difficulty = this.profile.settings.difficulty;
    });
    $('#set-quality').addEventListener('change', (e) => {
      this.profile.setSetting('quality', e.target.value);
      this.applyQuality();
    });
    // arrow keys move between the buttons of the open menu
    window.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp'].includes(e.code) || $('#screen').classList.contains('hidden')) return;
      const panel = [...document.querySelectorAll('#screen .panel')].find((p) => !p.classList.contains('hidden'));
      const btns = [...(panel?.querySelectorAll('button:not(:disabled)') || [])];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement);
      const n = e.code === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[i < 0 ? 0 : n].focus();
      e.preventDefault();
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
    if (this.input.touch) $('#hud').classList.add('touch-mode');
  }

  focusFirst() {
    const panel = [...document.querySelectorAll('#screen .panel')].find((p) => !p.classList.contains('hidden'));
    panel?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  startGame() {
    this.audio.init();
    if (!this.profile.data.seenPrologue) this.playPrologue(() => this.showMenu());
    else this.showMenu();
  }

  playPrologue(then) {
    this.profile.data.seenPrologue = true;
    this.profile.save();
    this.prologue.play(then);
  }

  continueCampaign() {
    const d = this.profile.data;
    const next = MISSIONS.findIndex((m) => !d.done.includes(m.id));
    if (next === -1) this.showEpilogue();
    else this.openBriefing(next);
  }

  // ------------------------------------------------------------ menu screens

  rankCardHTML() {
    const xp = this.profile.xp, r = this.profile.rank, nx = nextRank(xp);
    const pct = nx ? Math.round(((xp - r.xp) / (nx.xp - r.xp)) * 100) : 100;
    return `<div class="insignia">${this.insignia(r)}</div>
      <div class="rc-name">${r.short} Awan</div>
      <div class="rc-sub">${r.name} · ${xp.toLocaleString()} XP</div>
      <div class="xpbar"><div style="width:${pct}%"></div></div>
      <div class="rc-sub">${nx ? `${(nx.xp - xp).toLocaleString()} XP to ${nx.name}` : 'Highest rank reached'}</div>`;
  }

  insignia(rank) {
    if (rank.emblem) {
      return '<svg viewBox="0 0 120 60"><circle cx="60" cy="30" r="20" fill="#e0b84a" stroke="#7a5a1a" stroke-width="2"/><text x="60" y="37" text-anchor="middle" font-size="20" fill="#3a2a0a">🦁</text></svg>';
    }
    const pips = [];
    for (let i = 0; i < rank.pips; i++) {
      const cx = 60 + (i - (rank.pips - 1) / 2) * 34;
      pips.push(`<g transform="translate(${cx},30)"><polygon points="0,-16 4,-5 16,-5 6,2 10,14 0,7 -10,14 -6,2 -16,-5 -4,-5" fill="#e0b84a" stroke="#7a5a1a" stroke-width="1.5"/></g>`);
    }
    return `<svg viewBox="0 0 120 60">${pips.join('')}</svg>`;
  }

  showMissions() {
    const list = $('.missions');
    list.innerHTML = '';
    const d = this.profile.data;
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'mcard';
      b.disabled = i > d.unlocked;
      const best = d.best[m.id];
      b.innerHTML = `<div class="n">MISSION ${i + 1}</div><div class="t">${m.name}</div><div class="s">${m.si}</div><div class="d">${m.date}</div>${d.done.includes(m.id) ? `<div class="done">✔ Completed · best ${best} XP</div>` : ''}`;
      b.addEventListener('click', () => { this.audio.init(); this.openBriefing(i); });
      list.appendChild(b);
    });
    this.show('missions');
    this.focusFirst();
  }

  showSquad() {
    $('.squad-list').innerHTML = ['ruwan', 'nimal', 'kasun', 'prakash', 'sunil'].map((k) => {
      const c = CHARACTERS[k];
      return `<div class="squad-card"><div class="n" style="color:${c.color}">${c.name}</div><div class="r">${c.role}</div><p>${c.bio}</p></div>`;
    }).join('');
    this.show('squad');
    this.focusFirst();
  }

  showProfile() {
    const d = this.profile.data;
    $('.profile-head').innerHTML = `<div class="insignia">${this.insignia(this.profile.rank)}</div><div style="flex:1">${this.rankCardHTML().replace(/<div class="insignia">.*?<\/div>/, '')}</div>`;
    $('.profile-missions').innerHTML = MISSIONS.map((m, i) => `<div class="pm ${d.done.includes(m.id) ? 'done' : ''}"><b>${i + 1}. ${m.name}</b>${d.done.includes(m.id) ? `✔ best ${d.best[m.id] || 0} XP` : i <= d.unlocked ? 'Unlocked' : 'Locked'}</div>`).join('');
    $('.medal-grid').innerHTML = Object.entries(MEDALS).map(([id, m]) => `<div class="medal ${d.medals.includes(id) ? 'on' : ''}"><div class="ico"></div><div><b>${m.name}</b>${m.desc}</div></div>`).join('');
    this.show('profile');
    this.focusFirst();
  }

  showArchive() {
    $('.archive-body').innerHTML = `
      <p>Wanni Front separates <span class="tag history">Historical record</span> from <span class="tag fiction">Fiction</span>. Dates, places, formations and outcomes come from the sources below. The squad, its dialogue and its individual firefights are invented. Where sources disagree — for example on whether the Mavil Aru gates reopened on 8 or 10 August 2006 — the game says so. Many accounts from 2008–2009 are official or government-aligned; others, including the UN Panel of Experts, are strongly disputed by the government. Read widely.</p>
      <h3>Timeline</h3>
      <ul class="timeline">${HISTORY_TIMELINE.map(([d, t], i) => `<li style="animation-delay:${i * 0.06}s"><b>${d}</b>${t}</li>`).join('')}</ul>
      <h3>The human cost</h3>
      ${HUMAN_COST.map((t) => `<p>${t}</p>`).join('')}
      <h3>Sources</h3>
      <ol class="sources">${SOURCES.map(([t, u]) => `<li>${u ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : t}</li>`).join('')}</ol>`;
    this.show('archive');
    this.focusFirst();
  }

  showSettings() {
    const st = this.profile.settings;
    $('#set-sens').value = st.sensitivity;
    $('#out-sens').textContent = `${st.sensitivity.toFixed(2)}×`;
    $('#set-vol').value = st.volume;
    $('#out-vol').textContent = `${Math.round(st.volume * 100)}%`;
    $('#set-diff').value = String(st.difficulty);
    $('#set-quality').value = st.quality;
    this.show('settings');
    this.focusFirst();
  }

  showMenu() {
    if (this.state === 'cinematic') return;
    this.state = 'menu';
    this.radio.clear();
    this.audio.siren(false);
    this.toggleMap(false);
    if (document.pointerLockElement) document.exitPointerLock();
    const d = this.profile.data;
    const next = MISSIONS.findIndex((m) => !d.done.includes(m.id));
    $('.m-continue').textContent = d.done.length === 0 ? 'Begin at Mavil Aru, 2006'
      : next === -1 ? 'Campaign complete — view the epilogue' : `Next: Mission ${next + 1} — ${MISSIONS[next].name}`;
    $('.rank-card').innerHTML = this.rankCardHTML();
    this.show('menu');
    this.focusFirst();
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
    const st = STORY[m.id];
    $('.b-fiction').textContent = `${this.profile.rank.short} Awan. ${st.briefing}`;
    $('.b-squad').innerHTML = st.squad.map((k) => `<span class="chip" style="border-color:${CHARACTERS[k].color}">${CHARACTERS[k].short} · ${CHARACTERS[k].role}</span>`).join('');
    this.show('briefing');
    this.focusFirst();
  }

  beginMission() {
    this.state = 'playing';
    this.show(null);
    this.input.requestLock();
    this.input.resetLook();
    this.fadeIn();
    this.cinema(!!this.mission.insertion, [this.mission.name, `${this.mission.place} · ${this.mission.date}`]);
    this.audio.stinger(true);
    this.audio.rain(this.world.atm.weather.rain > 0);
    this.radio.clear();
    if (this.mission.insertion) {
      this.insertion = new Insertion(this, this.mission.insertion);
      $('.insert-skip').classList.add('on');
      $('#hud').classList.add('cinema');
    } else this.startOperations();
  }

  // gameplay proper begins once the squad is on the ground
  startOperations() {
    this.cinema(false);
    $('.insert-skip').classList.remove('on');
    $('#hud').classList.remove('cinema');
    this.radio.say(STORY[this.mission.id].intro);
    this.activateObjective(0);
  }

  skipInsertion() {
    if (!this.insertion) return;
    this.insertion.finish();
    this.insertion = null;
    this.radio.clear();
    this.startOperations();
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
    this.radio.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    $('.e-text').innerHTML = `
      <span class="tag history">Historical record</span>
      <ul class="timeline">${HISTORY_TIMELINE.map(([d, t], i) => `<li style="animation-delay:${0.3 + i * 0.45}s"><b>${d}</b>${t}</li>`).join('')}</ul>
      ${HUMAN_COST.map((t) => `<p>${t}</p>`).join('')}
      <span class="tag fiction">Your section — fiction</span>
      <ul class="e-squad">${SQUAD_EPILOGUE.map(([k, t]) => `<li><b style="color:${CHARACTERS[k].color}">${k === 'awan' ? `${this.profile.rank.short} Awan` : CHARACTERS[k].short}</b> — ${t}</li>`).join('')}</ul>
      <div class="closing">${CLOSING}</div>`;
    this.show('epilogue');
    this.focusFirst();
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
    this.world = new World(this.scene, this.mission, 1000 + i * 77, { renderer: this.renderer, quality: this.profile.settings.quality });
    this.weather = new Weather(this, this.world);
    this.outro = null;
    const m = this.mission;
    this.player = new Unit(this, 'army', m.player.x, m.player.z, { player: true, yaw: Math.PI, model: 'soldier_sf' });
    this.units = [this.player];
    const squad = STORY[m.id].squad;
    for (let k = 0; k < m.allies; k++) {
      const c = squad[k] ? CHARACTERS[squad[k]] : {};
      const a = new Unit(this, 'army', m.player.x + (k % 2 ? 3 : -3), m.player.z + 4 + k * 2, { index: k, yaw: Math.PI, name: c.short, model: c.model, role: c.ai });
      this.units.push(a);
    }
    let idx = 10;
    for (const s of this.world.spawns) {
      const u = new Unit(this, s.team, s.x, s.z, { tag: s.tag, index: idx++, yaw: s.team === 'ltte' ? Math.random() * 6.28 : Math.PI, patrol: s.patrol, sentry: s.sentry });
      if (s.team === 'ltte') u.yaw = Math.atan2(m.player.x - s.x, m.player.z - s.z) + (Math.random() - 0.5) * 1.8;
      this.units.push(u);
    }
    this.world.units = this.units;
    this.escortZone = m.objectives.find((o) => o.type === 'escort')?.zone || [0, 0, 10];
    this.civTotal = this.units.filter((u) => u.team === 'civ').length;
    this.civSafe = 0;
    this.civIncidents = 0;
    this.flags = {};
    this.radio.clear();
    this.applyQuality();

    this.yaw = Math.PI;
    this.pitch = 0;
    this.wi = 0;
    this.wstate = WEAPONS.map((w) => ({ ammo: w.mag, reserve: w.reserve }));
    this.ammo = WEAPONS[0].mag;
    this.reserve = WEAPONS[0].reserve;
    this.grenades = 3;
    this.projectiles = [];
    this.binos = false;
    this.breath = 1;
    this.swayT = 0;
    this.stepDist = 0;
    this.wasFiring = false;
    this.insertion = null;
    this.mapBase = null;
    this.squadOrders = { mode: 'follow', fire: 'tight', bravo: 'follow' };
    this.equipVisuals();
    $('.obj-mission').textContent = '';
    $('.f-title').textContent = '';
    $('.obj-text').textContent = '';
    $('.obj-sub').textContent = '';
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
    this.audio.siren(false);
    for (const g of this.projectiles || []) this.scene.remove(g.obj);
    this.projectiles = [];
    this.insertion?.finish();
    this.insertion = null;
    this.toggleMap(false);
    for (const u of this.units) u.remove();
    this.units = [];
    this.fx.clear();
    this.weather?.dispose();
    this.weather = null;
    this.audio.rain(false);
    this.cinema(false);
    $('#hud').classList.remove('cinema');
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
    $('.obj-mission').textContent = `${this.profile.rank.short} Awan · ${this.mission.name} · Objective ${i + 1}/${this.mission.objectives.length}`;
    $('.obj-text').textContent = o.text;
    if (i > 0) this.toast(`New objective: ${o.text}`);
    this.radio.say(STORY[this.mission.id].objectives[i]);
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
    } else if (o.type === 'alarm') {
      const alarms = this.world.alarms.filter((a) => a.tag === o.tag);
      if (alarms.some((a) => a.triggered && !a.disabled)) { done = true; this.toast('The alarm was raised — fight your way through!'); }
      else done = alarms.every((a) => a.disabled);
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
    if (o.type === 'alarm') {
      const a = this.world.alarms.find((a) => a.tag === o.tag && !a.disabled);
      return a ? new THREE.Vector3(a.x, a.y + 3.5, a.z) : null;
    }
    if (o.type === 'escort') {
      const waiting = this.units.find((u) => u.team === 'civ' && u.state === 'wait');
      if (waiting) return waiting.pos.clone().setY(waiting.pos.y + 2);
      return new THREE.Vector3(o.zone[0], this.world.height(o.zone[0], o.zone[1]) + 2, o.zone[1]);
    }
    return null;
  }

  missionComplete() {
    this.radio.say(STORY[this.mission.id].outro);
    this.endTimer = Math.min(10, Math.max(2.5, this.radio.remaining + 0.6));
    // outro shot: the camera pulls away from the section while the radio plays
    this.outro = { t: 0, a: this.yaw + Math.PI * 0.75 };
    this.cinema(true);
    $('#hud').classList.add('cinema');
    this.toggleMap(false);
    this.endAction = () => {
      this.outro = null;
      this.cinema(false);
      $('#hud').classList.remove('cinema');
      this.audio.rain(false);
      const m = this.mission;
      const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
      const rec = this.profile.recordMission(this.missionIndex, {
        objectives: m.objectives.length, accuracy: acc, difficulty: this.difficulty,
        hasCivilians: this.civTotal > 0, civilianIncidents: this.civIncidents,
      });
      this.lastRecord = rec;
      this.audio.siren(false);
      this.toggleMap(false);
      this.state = 'complete';
      this.radio.clear();
      this.audio.stinger(m.id !== 'nandikadal');
      if (document.pointerLockElement) document.exitPointerLock();
      $('.c-title').textContent = `${m.name} — ${m.date}`;
      $('.c-text').textContent = m.debrief;
      $('.c-fiction').textContent = STORY[m.id].debrief;
      const mins = Math.floor(this.missionTime / 60), secs = Math.floor(this.missionTime % 60).toString().padStart(2, '0');
      $('.c-stats').textContent = `Time ${mins}:${secs} · Hostiles neutralised ${this.kills} · Accuracy ${acc}%`;
      const nx = nextRank(rec.totalXP);
      $('.xp-box').innerHTML = `${rec.lines.map(([t, v]) => `<div class="xp-line"><span>${t}</span><span>+${v}</span></div>`).join('')}
        <div class="xp-line total"><span>Mission XP</span><span>${rec.missionXP}</span></div>
        <div class="xp-line"><span>${rec.previousBest ? `Previous best ${rec.previousBest} · counted once` : 'First completion'}</span><span>+${rec.gained} total</span></div>
        <div class="xpbar"><div style="width:${nx ? Math.round(((rec.totalXP - rec.newRank.xp) / (nx.xp - rec.newRank.xp)) * 100) : 100}%"></div></div>
        <div class="xp-line"><span>${rec.newRank.name} · ${rec.totalXP.toLocaleString()} XP</span><span>${nx ? `${(nx.xp - rec.totalXP).toLocaleString()} to ${nx.short}` : ''}</span></div>
        ${rec.newMedals.map((id) => `<div class="new-medal">★ Commendation: ${MEDALS[id].name}</div>`).join('')}`;
      $('[data-act="next"]').textContent = this.missionIndex + 1 < MISSIONS.length ? 'Continue' : 'Epilogue';
      this.show('complete');
      this.focusFirst();
    };
  }

  afterDebrief() {
    const rec = this.lastRecord;
    if (rec && rec.newRank.id !== rec.oldRank.id && this.missionIndex + 1 < MISSIONS.length) this.showPromotion(rec.newRank);
    else this.nextAfterMission();
  }

  nextAfterMission() {
    this.stopConfetti = true;
    if (this.missionIndex + 1 < MISSIONS.length) this.openBriefing(this.missionIndex + 1);
    else this.showEpilogue();
  }

  showPromotion(rank) {
    this.state = 'promotion';
    $('.panel[data-screen="promotion"] .insignia').innerHTML = this.insignia(rank);
    $('.promo-rank').textContent = `${rank.name} Awan`;
    const lines = {
      lt: [['ruwan', 'Two pips now, Sir. Don\'t let it go to your head — it\'s heavy enough already.'], ['nimal', 'I found a pot of kiribath in the cookhouse. Nobody ask me how.'], ['kasun', 'Congratulations, Sir. I\'m writing to my sister about this.']],
      capt: [['ruwan', 'Captain Awan. My brother will want to hear this.'], ['nimal', 'Kiribath, lunu miris and tea for everyone — the Captain is paying!'], ['prakash', 'Tonight we celebrate. Tomorrow we go north again.']],
      maj: [['ruwan', 'Major. I always knew, Sir.']],
    }[rank.id] || [];
    $('.promo-lines').innerHTML = lines.map(([k, t]) => `<p><b style="color:${CHARACTERS[k].color}">${CHARACTERS[k].short}:</b> ${t}</p>`).join('')
      + '<p class="note">The section celebrates at camp with kiribath and tea.</p>';
    this.show('promotion');
    this.audio.stinger(true);
    this.confetti($('.confetti'));
    this.focusFirst();
  }

  confetti(cv) {
    const ctx = cv.getContext('2d');
    const colors = ['#e0b84a', '#9bd16a', '#e0573a', '#7fc8e8', '#f2eedf'];
    const bits = Array.from({ length: 140 }, () => ({
      x: Math.random(), y: -Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.004, vy: 0.003 + Math.random() * 0.005,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, c: colors[Math.floor(Math.random() * colors.length)],
    }));
    this.stopConfetti = false;
    const tick = () => {
      if (this.stopConfetti || this.state !== 'promotion') return;
      cv.width = cv.clientWidth;
      cv.height = cv.clientHeight;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.r += b.vr;
        if (b.y > 1.05) { b.y = -0.05; b.x = Math.random(); }
        ctx.save();
        ctx.translate(b.x * cv.width, b.y * cv.height);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  missionFailed(reason) {
    if (this.endTimer > 0) return;
    this.endTimer = 2;
    this.endAction = () => {
      this.audio.siren(false);
      this.audio.rain(false);
      this.state = 'failed';
      if (document.pointerLockElement) document.exitPointerLock();
      $('.f-title').textContent = reason;
      this.show('failed');
    };
  }

  // ------------------------------------------------------------ events

  onUnitKilled(u) {
    if (u.isPlayer) { this.radio.clear(); this.missionFailed('You were killed in action.'); return; }
    if (u.team === 'civ') { this.missionFailed('A civilian was killed. Protecting civilians is your first duty.'); return; }
    if (u.team === 'ltte') {
      this.killfeed('LTTE cadre neutralised');
      for (const a of this.world.alarms) if (a.runner === u) { a.runner = null; this.toast('Alarm runner stopped'); }
    }
  }

  onCivilianSafe() {
    this.civSafe++;
    this.toast(`Civilian reached safety (${this.civSafe}/${this.civTotal})`);
    if (this.civSafe >= this.civTotal) this.storyEvent('allSafe');
  }

  // play a mission's event dialogue once per mission
  storyEvent(name) {
    if (this.flags[name]) return;
    this.flags[name] = true;
    this.radio.say(STORY[this.mission.id].events?.[name]);
  }

  onPlayerHit(from) {
    this.lastPlayerHit = this.time;
    if (this.player.hp < 70) this.storyEvent('hurt');
    $('.vignette').style.opacity = String(Math.min(1, 0.35 + (1 - this.player.hp / 100) * 0.6));
    this.alertLevel = 8;
    void from;
  }

  // gunfire and footsteps; groups belonging to a later objective only react up close
  noise(pos, radius, gunshot = true) {
    if (gunshot && radius > 20) this.alertLevel = 8;
    for (const u of this.units) u.hear(pos, radius, gunshot);
  }

  isLaterGroup(tag) {
    const objs = this.mission.objectives;
    if (objs.slice(0, this.objIndex + 1).some((o) => o.tag === tag)) return false;
    return objs.slice(this.objIndex + 1).some((o) => o.tag === tag);
  }

  // ------------------------------------------------------------ alarms

  onEnemyAlerted(u) {
    if (u.sentry || !this.world) return;
    let best = null;
    for (const a of this.world.alarms) {
      if (a.disabled || a.triggered || (a.runner && a.runner.alive)) continue;
      const d = Math.hypot(a.x - u.pos.x, a.z - u.pos.z);
      if (d < 90 && (!best || d < Math.hypot(best.x - u.pos.x, best.z - u.pos.z))) best = a;
    }
    if (!best) return;
    best.runner = u;
    u.state = 'alarm';
    u.marked = true;
    this.toast('A cadre is running for the alarm — stop him!', true);
  }

  alarmFor(u) {
    return this.world.alarms.find((a) => a.runner === u);
  }

  triggerAlarm(a) {
    if (a.triggered || a.disabled) return;
    a.triggered = true;
    this.audio.siren(true);
    this.toast('ALARM! Reinforcements are coming', true);
    this.radio.say([['ruwan', 'That\'s the siren — they know we\'re here! Get to cover!']]);
    for (const u of this.units) if (u.alive && u.team === 'ltte') { u.lastSeen = this.player.pos.clone(); u.enterCombat(this.player); }
    let away = new THREE.Vector3(a.x - this.player.pos.x, 0, a.z - this.player.pos.z);
    away = away.lengthSq() > 0.01 ? away.normalize() : new THREE.Vector3(0, 0, -1);
    const S = this.world.size - 6;
    for (let k = 0; k < 4; k++) {
      let x = THREE.MathUtils.clamp(a.x + away.x * 40 + (Math.random() - 0.5) * 12, -S, S);
      let z = THREE.MathUtils.clamp(a.z + away.z * 40 + (Math.random() - 0.5) * 12, -S, S);
      if (this.world.isWater(x, z, 0)) { x = a.x + (Math.random() - 0.5) * 8; z = a.z + (Math.random() - 0.5) * 8; }
      const u = new Unit(this, 'ltte', x, z, { tag: a.tag, index: 80 + k });
      this.units.push(u);
      u.lastSeen = this.player.pos.clone();
      u.enterCombat(this.player);
    }
  }

  // ------------------------------------------------------------ weapons

  get W() {
    return WEAPONS[this.wi];
  }

  equipVisuals() {
    const p = this.player, rifle = p.parts.rifle;
    if (!rifle) return;
    const attach = (name) => {
      const o = models[name].clone(true);
      o.position.copy(rifle.position);
      o.rotation.copy(rifle.rotation);
      rifle.parent.add(o);
      return o;
    };
    this.weaponObjs = { t56: rifle, svd: attach('wpn_svd'), pistol: attach('wpn_pistol') };
    this.weaponObjs.pistol.position.set(-0.26, -0.3, 0.17);
    this.showWeapon();
  }

  showWeapon() {
    if (!this.weaponObjs) return;
    for (const [id, o] of Object.entries(this.weaponObjs)) o.visible = id === this.W.id;
    this.player.parts.muzzle = this.weaponObjs[this.W.id].getObjectByName('Muzzle');
  }

  switchWeapon(i) {
    if (i === this.wi || i < 0 || i >= WEAPONS.length) return;
    this.wstate[this.wi] = { ammo: this.ammo, reserve: this.reserve };
    this.wi = i;
    ({ ammo: this.ammo, reserve: this.reserve } = this.wstate[i]);
    this.reloading = 0;
    this.fireCooldown = 0.4;
    this.binos = false;
    this.showWeapon();
    this.audio.click();
  }

  resupply() {
    this.wstate[this.wi] = { ammo: this.ammo, reserve: this.reserve };
    WEAPONS.forEach((w, i) => { this.wstate[i].reserve = w.reserve; });
    this.reserve = this.W.reserve;
    this.grenades = 3;
  }

  isScoped() {
    return this.W.scope && this.input.aim && this.reloading <= 0 && this.player.alive && !this.binos;
  }

  // ------------------------------------------------------------ player

  updatePlayer(dt) {
    const inp = this.input, p = this.player;
    if (!p.alive) { p.update(dt); p.sync(dt); return; }

    const look = inp.consumeLook();
    const zoom = this.camera.fov / 70;
    const sens = 0.0022 * zoom * this.profile.settings.sensitivity;
    this.yaw -= look.x * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * sens, -1.0, 0.75);

    // stance
    if (inp.hit('KeyC')) p.stance = p.stance === 'crouch' ? 'stand' : 'crouch';
    if (inp.hit('KeyZ')) p.stance = p.stance === 'prone' ? 'stand' : 'prone';
    if (inp.hit('Space')) p.stance = 'stand';

    const scoped = this.isScoped();
    const mv = inp.moveVec;
    const sprint = inp.sprint && mv.y > 0 && !inp.aim && this.reloading <= 0 && p.stance === 'stand' && !this.binos;
    let speed = p.stance === 'prone' ? 0.9 : p.stance === 'crouch' ? 2.2 : sprint ? 6.8 : 4.3;
    if (inp.aim || this.binos) speed = Math.min(speed, p.stance === 'stand' ? 2.4 : speed * 0.7);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const sx = p.pos.x, sz = p.pos.z;
    p.move(fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x, speed * Math.min(1, Math.hypot(mv.x, mv.y)), dt);
    p.separate();
    p.yaw = this.yaw;
    p.pitch = this.pitch;
    p.sync(dt);

    // footsteps can be heard
    this.stepDist += Math.hypot(p.pos.x - sx, p.pos.z - sz);
    if (this.stepDist > (sprint ? 2.4 : 1.8)) {
      this.stepDist = 0;
      const r = sprint ? 14 : p.stance === 'stand' ? 6 : p.stance === 'crouch' ? 2.5 : 0.8;
      this.noise(p.pos, r, false);
      if (p.stance !== 'prone') this.audio.burst({ dur: 0.06, freq: 500, vol: sprint ? 0.12 : 0.06 });
    }

    // breath for the scope
    if (scoped && inp.sprint) this.breath = Math.max(0, this.breath - dt / 4);
    else this.breath = Math.min(1, this.breath + dt / 6);

    // health regeneration
    if (this.time - this.lastPlayerHit > 5) p.hp = Math.min(100, p.hp + 9 * dt);

    // weapons
    if (inp.hit('Digit1')) this.switchWeapon(0);
    if (inp.hit('Digit2')) this.switchWeapon(1);
    if (inp.hit('Digit3')) this.switchWeapon(2);
    const wheel = inp.consumeWheel();
    if (wheel) this.switchWeapon((this.wi + (wheel > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length);
    if (inp.hit('KeyB')) { this.binos = !this.binos; this.audio.click(); }
    if (inp.hit('KeyG') && this.grenades > 0 && !this.binos) this.throwGrenade();

    const W = this.W;
    if ((inp.hit('KeyR') || (this.ammo === 0 && inp.fire)) && this.reloading <= 0 && this.ammo < W.mag && this.reserve > 0) {
      this.reloading = W.reload;
      this.binos = false;
      this.audio.click();
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const take = Math.min(W.mag - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.audio.click();
      }
    }

    this.fireCooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    const pull = inp.fire && (W.auto || !this.wasFiring);
    this.wasFiring = inp.fire;
    if (pull && !sprint && !this.binos && this.reloading <= 0 && this.fireCooldown <= 0) {
      if (this.ammo > 0) this.shoot();
      else if (this.reserve <= 0) { this.audio.click(); this.fireCooldown = 0.3; }
    }
    if (this.binos) this.markWithBinoculars();

    // squad orders
    if (inp.hit('KeyT')) this.orderSquad();
    if (inp.hit('KeyV')) this.orderBravo();
    if (inp.hit('KeyX')) this.toggleFire();

    // resupply
    this.supplyCooldown -= dt;
    for (const s of this.world.supplies) {
      const low = this.reserve < W.reserve || this.grenades < 3;
      if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 3 && low && this.supplyCooldown <= 0) {
        this.resupply();
        this.supplyCooldown = 3;
        this.toast('Ammunition and grenades resupplied');
      }
    }

    this.updateInteraction(dt);
  }

  shoot() {
    const p = this.player, W = this.W;
    this.ammo--;
    this.shots++;
    this.fireCooldown = W.interval;
    const moving = (p.speed || 0) > 0.5;
    const stanceMul = p.stance === 'prone' ? 0.5 : p.stance === 'crouch' ? 0.7 : 1;
    const spread = ((this.input.aim ? W.spreadAim : W.spreadHip) + (moving ? 0.012 : 0) + this.bloom) * stanceMul;
    this.bloom = Math.min(0.04, this.bloom + W.recoil * 0.6);

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
    const res = this.world.raycast(origin, dir, 450, p);
    const muzzle = p.muzzleWorld(new THREE.Vector3());
    const end = res ? res.point : origin.clone().addScaledVector(dir, 450);
    if (!W.suppressed || Math.random() < 0.3) this.fx.tracer(muzzle, end);
    if (!W.suppressed) this.fx.muzzle(muzzle);
    this.audio.weapon(W.id);
    this.noise(p.pos, W.noise, true);

    if (res?.kind === 'unit') {
      const u = res.unit;
      if (u.team === 'army') {
        this.toast('Check your fire — friendly!');
      } else if (u.team === 'civ') {
        // only shots aimed straight at a civilian hurt them; stray rounds are a warning
        const aimed = this.world.raycast(origin, aimDir, 450, p);
        if (aimed?.unit === u) u.damage(40, p);
        if (u.alive) this.toast('HOLD FIRE — civilians!', true);
        this.civIncidents++;
        this.storyEvent('civilianWarning');
      } else {
        this.hits++;
        u.damage(res.head ? W.head : W.body, p);
        this.fx.hitPuff(res.point);
        const killed = !u.alive;
        if (killed && u.team === 'ltte') this.kills++;
        this.flashHitmarker(killed);
      }
    } else if (res) {
      this.fx.impact(res.point, res.kind);
    }

    // recoil
    this.pitch = Math.min(0.75, this.pitch + W.recoil * (0.6 + Math.random() * 0.6) * stanceMul);
    this.yaw += (Math.random() - 0.5) * W.recoil * 0.6;
  }

  throwGrenade() {
    this.grenades--;
    const p = this.player, d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    const pos = p.pos.clone().add(new THREE.Vector3(0, p.eyeHeight, 0)).addScaledVector(d, 0.6);
    const vel = d.multiplyScalar(15).add(new THREE.Vector3(0, 4, 0));
    const obj = models.grenade.clone(true);
    obj.scale.setScalar(1.6);
    this.scene.add(obj);
    this.projectiles.push({ obj, pos, vel, fuse: 3 });
    this.toast('Grenade out!');
  }

  updateProjectiles(dt) {
    for (const g of this.projectiles) {
      g.vel.y -= 18 * dt;
      g.pos.addScaledVector(g.vel, dt);
      const h = this.world.height(g.pos.x, g.pos.z);
      if (g.pos.y < h + 0.06) {
        g.pos.y = h + 0.06;
        g.vel.y = Math.abs(g.vel.y) * 0.3;
        g.vel.x *= 0.55; g.vel.z *= 0.55;
      }
      for (const c of this.world.colliders) {
        if (c.y1 > g.pos.y && this.world.circleOverlap(c, g.pos.x, g.pos.z, 0.05)) { g.vel.x *= -0.4; g.vel.z *= -0.4; break; }
      }
      g.obj.position.copy(g.pos);
      g.obj.rotation.x += dt * 8;
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.scene.remove(g.obj);
        this.explode(g.pos, 7.5, 220, this.player);
      }
    }
    this.projectiles = this.projectiles.filter((g) => g.fuse > 0);
  }

  explode(pos, radius, damage, source) {
    this.fx.explosion(pos);
    this.audio.explosion(pos);
    this.fx.shake = Math.max(this.fx.shake, 1.2 - pos.distanceTo(this.player.pos) / 40);
    const from = pos.clone().add(new THREE.Vector3(0, 0.4, 0));
    for (const u of this.units) {
      if (!u.alive) continue;
      const chest = u.pos.clone().add(new THREE.Vector3(0, Math.min(1, u.bodyHeight * 0.6), 0));
      const d = chest.distanceTo(from);
      if (d > radius || !this.world.lineOfSight(from, chest)) continue;
      u.damage((u.isPlayer ? damage * 0.35 : damage) * (1 - d / radius), source);
      if (u.isPlayer) this.onPlayerHit(pos);
      if (source === this.player && u.team === 'ltte' && !u.alive) this.kills++;
    }
    this.noise(pos, 120, true);
  }

  markWithBinoculars() {
    const cam = this.camera, d = new THREE.Vector3();
    cam.getWorldDirection(d);
    for (const u of this.units) {
      if (!u.alive || u.team !== 'ltte' || u.marked) continue;
      const to = u.eye.clone().sub(cam.position);
      if (to.length() > 400 || to.normalize().angleTo(d) > 0.045) continue;
      if (!this.world.lineOfSight(cam.position, u.eye.clone())) continue;
      u.marked = true;
      this.toast('Hostile marked');
      this.audio.hitmark();
    }
  }

  // ------------------------------------------------------------ squad orders

  squadAllies() {
    return this.units.filter((u) => u.team === 'army' && !u.isPlayer && u.tag !== 'linkup' && u.alive);
  }

  orderSquad() {
    const holding = this.squadOrders.mode === 'follow';
    this.squadOrders.mode = holding ? 'hold' : 'follow';
    for (const a of this.squadAllies()) {
      a.order = holding ? 'hold' : 'follow';
      a.orderPos = holding ? a.pos.clone() : null;
    }
    const first = this.squadAllies()[0];
    this.radio.say([[this.speakerKey(first), holding ? 'Holding here, Sir.' : 'On you, Sir. Moving.']]);
  }

  orderBravo() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    const hit = this.world.raycast(this.camera.position, d, 160, this.player, false);
    if (!hit) { this.toast('Aim at the ground to send Bravo team'); return; }
    const allies = this.squadAllies();
    const bravo = allies.length > 1 ? allies.filter((a) => a.followSlot % 2 === 1) : allies;
    bravo.forEach((a, i) => {
      a.order = 'move';
      a.orderPos = hit.point.clone().add(new THREE.Vector3((i - (bravo.length - 1) / 2) * 2.5, 0, 0));
    });
    this.squadOrders.bravo = 'move';
    this.radio.say([[this.speakerKey(bravo[0]), `Bravo moving — ${Math.round(hit.t)} metres.`]]);
  }

  toggleFire() {
    this.squadOrders.fire = this.squadOrders.fire === 'tight' ? 'free' : 'tight';
    const first = this.squadAllies()[0];
    this.radio.say([[this.speakerKey(first), this.squadOrders.fire === 'free' ? 'Weapons free!' : 'Weapons tight — we fire only if they spot us.']]);
  }

  speakerKey(u) {
    const squad = STORY[this.mission.id].squad;
    const k = squad.find((s) => CHARACTERS[s].short === u?.name);
    return k || 'ruwan';
  }

  // ------------------------------------------------------------ interaction

  flashHitmarker(kill) {
    const h = $('.hitmarker');
    h.classList.toggle('kill', kill);
    h.classList.add('on');
    clearTimeout(this.hmTimer);
    this.hmTimer = setTimeout(() => h.classList.remove('on'), 90);
    this.audio.hitmark();
  }

  findInteraction() {
    const o = this.currentObjective(), p = this.player.pos;
    const near = (x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
    if (o?.type === 'interact') {
      const t = this.world.targets.find((t) => t.tag === o.tag && !t.done && near(t.x, t.z, t.obj ? 7 : 3.5));
      if (t) {
        return {
          label: `${t.plant ? 'Plant charge on' : 'Operate'} ${t.label}`, time: t.time,
          done: () => {
            t.done = true;
            if (t.plant) { t.pending = true; this.toast('Charge set — move away! (4 s)'); this.charges.push({ target: t, timer: 4 }); }
            else this.toast('The sluice gates are open — water is flowing to the paddy fields again', true);
          },
        };
      }
    }
    const a = this.world.alarms.find((a) => !a.disabled && near(a.x, a.z, 2.6));
    if (a) {
      return {
        label: 'Sabotage the alarm', time: 3,
        done: () => { a.disabled = true; if (a.triggered) this.audio.siren(false); this.toast('Alarm sabotaged', true); },
      };
    }
    const pl = this.player;
    if (pl.towerCenter) return { label: 'Climb down the tower', time: 0.8, done: () => pl.setTower(null) };
    const tw = this.world.towers.find((t) => near(t.x, t.z, 2.8));
    if (tw) return { label: 'Climb the watchtower', time: 0.8, done: () => pl.setTower(tw) };
    return null;
  }

  updateInteraction(dt) {
    const it = this.findInteraction();
    const prompt = $('.prompt');
    if (!it) {
      prompt.classList.remove('on');
      this.interactProgress = 0;
      return;
    }
    prompt.classList.add('on');
    const key = this.input.touch ? 'E button' : 'E';
    $('.prompt-text').textContent = `Hold ${key}: ${it.label}`;
    if (this.input.action) {
      this.interactProgress += dt / it.time;
      if (this.interactProgress >= 1) {
        this.interactProgress = 0;
        it.done();
      }
    } else {
      this.interactProgress = Math.max(0, this.interactProgress - dt);
    }
    $('.prompt-bar div').style.width = `${Math.min(100, this.interactProgress * 100)}%`;
  }

  detonate(t) {
    const pos = new THREE.Vector3(t.x, Math.max(t.y, this.world.water ?? t.y), t.z);
    if (t.obj) this.world.group.remove(t.obj);
    this.world.colliders = this.world.colliders.filter((c) => c.ref !== t);
    this.explode(pos, 7, 200, this.player);
    t.pending = false;
    this.killfeed('Sea Tiger boat destroyed');
  }

  // ------------------------------------------------------------ camera

  updateCamera(dt, snap = false) {
    const p = this.player, inp = this.input;
    const scoped = this.isScoped(), binos = this.binos && p.alive;
    // rifle sway when looking through the scope; holding breath (Shift) steadies it
    let sx = 0, sy = 0;
    if (scoped) {
      this.swayT += dt;
      const t = this.swayT;
      const amp = (inp.sprint && this.breath > 0 ? 0.0006 : this.breath <= 0 ? 0.009 : 0.004)
        * (p.stance === 'prone' ? 0.4 : p.stance === 'crouch' ? 0.7 : 1);
      sx = amp * (Math.sin(t * 0.9) + 0.5 * Math.sin(t * 2.3));
      sy = amp * (Math.cos(t * 1.1) + 0.5 * Math.sin(t * 1.7));
    }
    const yaw = this.yaw + sx, pitch = this.pitch + sy;
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let fov;
    if (scoped || binos) {
      // look through the optic from the soldier's eye
      const eye = p.pos.clone().add(new THREE.Vector3(0, p.eyeHeight + 0.05, 0)).addScaledVector(d, 0.35);
      this.camPos.copy(eye);
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(d));
      p.obj.visible = false;
      fov = binos ? 7 : 11;
    } else {
      p.obj.visible = true;
      const aim = inp.aim && p.alive;
      const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
      const pivot = p.pos.clone().add(new THREE.Vector3(0, p.alive ? p.eyeHeight + 0.23 : 0.8, 0));
      const dist = aim ? 1.6 : p.stance === 'prone' ? 2.5 : 3.2;
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
      this.camera.lookAt(this.camPos.clone().add(d));
      fov = aim ? 48 : 70;
    }
    if (this.fx.shake > 0) {
      const s = this.fx.shake * 0.15;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.fov = scoped || binos ? fov : this.camera.fov + (fov - this.camera.fov) * Math.min(1, dt * 12 || 1);
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
    $('.squad').innerHTML = allies.map((a) => `${a.name}${a.role === 'marksman' ? ' (marksman)' : ''} · ${(a.order || 'follow').toUpperCase()}${a.hp < 60 ? ' · wounded' : ''}`).join('<br>');

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
    this.updateTacticalHUD();
  }

  // ------------------------------------------------------------ tactical HUD

  updateTacticalHUD() {
    const p = this.player, cam = this.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const scoped = this.isScoped(), binos = this.binos && p.alive;
    $('.ammo-name').textContent = this.W.name.toUpperCase();
    $('.ammo-gren').textContent = `GRENADES ${this.grenades} (G)`;
    $('.stance-ind').textContent = `${p.stance.toUpperCase()}${p.towerCenter ? ' · TOWER' : ''}${this.world.inBush(p.pos.x, p.pos.z) ? ' · IN COVER' : ''}`;
    $('.scope').classList.toggle('on', scoped);
    $('.binos').classList.toggle('on', binos);
    $('.crosshair').style.display = scoped || binos ? 'none' : '';
    $('.breath div').style.width = `${this.breath * 100}%`;
    if (binos) {
      const d = new THREE.Vector3();
      cam.getWorldDirection(d);
      const hit = this.world.raycast(cam.position, d, 600, p);
      $('.binos-range').textContent = `RANGE ${hit ? Math.round(hit.t) : '---'} m`;
    }

    // stealth status
    const lt = this.units.filter((u) => u.team === 'ltte' && u.alive);
    const alarm = this.world.alarms.some((a) => a.triggered && !a.disabled);
    const spotted = lt.some((u) => (u.state === 'combat' || u.state === 'alarm') && u.pos.distanceTo(p.pos) < 90);
    const sus = lt.some((u) => u.state === 'suspicious' || u.state === 'search' || u.detect > 0.3);
    const st = $('.stealth');
    st.textContent = alarm ? 'ALARM' : spotted ? 'SPOTTED' : sus ? 'SUSPICIOUS' : 'HIDDEN';
    st.dataset.level = alarm || spotted ? 'red' : sus ? 'amber' : 'green';
    $('.alarm-banner').classList.toggle('on', alarm);

    // detection arcs around the crosshair
    const yawDeg = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)));
    const arcs = lt.filter((u) => (u.detect > 0.05 || u.state === 'combat' || u.state === 'alarm') && u.pos.distanceTo(p.pos) < 100);
    const box = $('.detect');
    while (box.children.length < arcs.length) box.appendChild(document.createElement('i'));
    [...box.children].forEach((el, i) => {
      const u = arcs[i];
      if (!u) { el.style.display = 'none'; return; }
      const ang = THREE.MathUtils.radToDeg(Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z)) - yawDeg;
      const k = u.state === 'combat' || u.state === 'alarm' ? 1 : u.detect;
      el.style.display = '';
      el.style.width = `${16 + 30 * k}px`;
      el.style.background = k >= 1 ? '#e0573a' : k > 0.3 ? '#e8a23a' : '#e8d86a';
      el.style.transform = `translate(-50%, -50%) rotate(${-ang}deg) translateY(-96px)`;
    });

    // markers over marked hostiles
    const marked = lt.filter((u) => u.marked);
    const mk = $('.markers');
    while (mk.children.length < marked.length) mk.appendChild(document.createElement('i'));
    const v = new THREE.Vector3();
    [...mk.children].forEach((el, i) => {
      const u = marked[i];
      if (!u) { el.style.display = 'none'; return; }
      v.set(u.pos.x, u.pos.y + u.bodyHeight + 0.7, u.pos.z).project(cam);
      if (v.z > 1) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.left = `${(v.x * 0.5 + 0.5) * W}px`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * H}px`;
      el.className = u.state === 'alarm' ? 'runner' : '';
    });

    // squad orders
    const o = this.squadOrders;
    $('.orders').textContent = `SQUAD ${o.mode.toUpperCase()} · BRAVO ${o.bravo === 'move' ? 'POSITIONED' : 'WITH YOU'} · WEAPONS ${o.fire.toUpperCase()}`;
  }

  // ------------------------------------------------------------ tactical map

  toggleMap(force) {
    this.mapOpen = force ?? !this.mapOpen;
    $('#map').classList.toggle('hidden', !this.mapOpen);
    if (this.mapOpen) this.drawMap();
  }

  buildMapBase() {
    const S = this.world.size, N = 360;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const ground = this.mission.world.ground.map((h) => new THREE.Color(h));
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i / N) * 2 * S - S, z = (j / N) * 2 * S - S;
        const h = this.world.height(x, z);
        let col;
        if (this.world.water !== null && h < this.world.water) col = [40, 78, 88];
        else {
          const g = ground[0].clone().lerp(ground[1], 0.5).multiplyScalar(0.55 + Math.min(0.45, Math.max(0, h) * 0.06));
          col = [g.r * 255, g.g * 255, g.b * 255];
        }
        const k = (j * N + i) * 4;
        img.data.set([col[0], col[1], col[2], 255], k);
      }
    }
    ctx.putImageData(img, 0, 0);
    const toMap = (x, z) => [((x + S) / (2 * S)) * N, ((z + S) / (2 * S)) * N];
    for (const [type, list] of Object.entries(this.world.placements)) {
      for (const pl of list) {
        const [mx, my] = toMap(pl.x, pl.z);
        if (/house|bunker|bund|tower|gate|buffel|supplies|sandbag|rock_outcrop/.test(type)) {
          ctx.fillStyle = type.includes('bund') ? '#6e4a2c' : '#2a2620';
          const r = type === 'earth_bund' ? 7 : type === 'rock_outcrop' ? 14 : 2.5;
          ctx.fillRect(mx - r, my - (type === 'earth_bund' ? 2 : r), r * 2, type === 'earth_bund' ? 4 : r * 2);
        } else if (type !== 'bush') {
          ctx.fillStyle = 'rgba(12,28,8,0.8)';
          ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, 6.28); ctx.fill();
        }
      }
    }
    this.mapBase = c;
  }

  drawMap() {
    if (!this.mapBase) this.buildMapBase();
    const cv = $('#map canvas'), ctx = cv.getContext('2d');
    const N = Math.min(window.innerWidth - 32, window.innerHeight - 140, 720);
    if (cv.width !== N) { cv.width = cv.height = N; }
    ctx.drawImage(this.mapBase, 0, 0, N, N);
    const S = this.world.size;
    const toMap = (x, z) => [((x + S) / (2 * S)) * N, ((z + S) / (2 * S)) * N];
    const dot = (x, z, color, r = 4) => { const [a, b] = toMap(x, z); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28); ctx.fill(); };
    const glyph = (x, z, g, color, size = 16) => { const [a, b] = toMap(x, z); ctx.fillStyle = color; ctx.font = `${size}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, a, b); };
    for (const s of this.world.supplies) glyph(s.x, s.z, '✚', '#9bd16a', 14);
    for (const t of this.world.towers) glyph(t.x, t.z, '▲', '#b9b39c', 13);
    for (const a of this.world.alarms) glyph(a.x, a.z, '⚑', a.disabled ? '#777' : '#e0573a', 18);
    const o = this.currentObjective();
    if (o?.type === 'escort') { const [a, b] = toMap(o.zone[0], o.zone[1]); ctx.strokeStyle = '#e0b84a'; ctx.beginPath(); ctx.arc(a, b, (o.zone[2] / (2 * S)) * N, 0, 6.28); ctx.stroke(); }
    for (const u of this.units) {
      if (!u.alive || u.isPlayer) continue;
      if (u.team === 'army') dot(u.pos.x, u.pos.z, '#9bd16a', 4);
      else if (u.team === 'civ') dot(u.pos.x, u.pos.z, '#7fc8e8', 3);
      else if (u.marked) glyph(u.pos.x, u.pos.z, '◆', '#e0573a', 14);
    }
    const wp = this.objectiveWaypoint();
    if (wp) glyph(wp.x, wp.z, '◇', '#e0b84a', 22);
    const [px, py] = toMap(this.player.pos.x, this.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.yaw + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    $('.map-info').innerHTML = `<b>${this.mission.name.toUpperCase()}</b> · ${o ? o.text : ''}<br><span>▲ you · ● squad · ◆ marked hostile · ⚑ alarm · ▲ tower · ✚ supplies · ◇ objective · N is up · M to close</span>`;
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
    if (!this.world) return;
    this.world.update(dt, this.camera, this.time);
    this.weather?.update(dt, this.camera);
    this.postfx.render(dt);
  }

  // slow camera move over the real mission ground behind the menus
  menuCamera(dt) {
    const w = this.world, p = this.mission.player, t = this.time * 0.035;
    const R = Math.min(70, w.size * 0.55);
    const x = p.x * 0.4 + Math.sin(t) * R, z = p.z * 0.4 + Math.sin(t * 0.63 + 1) * R;
    const ahead = t + 0.25;
    const lx = p.x * 0.4 + Math.sin(ahead) * R, lz = p.z * 0.4 + Math.sin(ahead * 0.63 + 1) * R;
    let ground = 0;
    for (let k = -1; k <= 1; k++) ground = Math.max(ground, w.height(x + k * 6, z + k * 6));
    const y = Math.max(ground, w.water ?? -99) + 15 + Math.sin(t * 1.7) * 3;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(lx, Math.max(w.height(lx, lz), w.water ?? -99) + 6, lz);
    if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
  }

  outroCamera(dt) {
    const o = this.outro, p = this.player.pos;
    o.t += dt;
    o.a += dt * 0.12;
    const r = 5 + o.t * 1.4, h = 1.8 + o.t * 0.6;
    const head = new THREE.Vector3(p.x, p.y + 1.5, p.z);
    let cam = new THREE.Vector3(p.x + Math.sin(o.a) * r, p.y + h, p.z + Math.cos(o.a) * r);
    if (!this.world.lineOfSight(head, cam)) cam = new THREE.Vector3(p.x, p.y + 6 + o.t, p.z + 0.5);
    this.camera.position.lerp(cam, Math.min(1, dt * 3));
    this.camera.lookAt(head);
    if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
  }

  update(dt) {
    if (this.state === 'playing') {
      this.time += dt;
      this.missionTime += dt;
      if (this.insertion) {
        if (this.input.hit('Space') || this.input.hit('Enter') || this.input.hit('Escape')) this.skipInsertion();
        else {
          this.insertion.update(dt);
          for (const u of this.units) u.sync(dt);
          if (this.insertion.done) { this.insertion = null; this.startOperations(); }
        }
        this.radio.update(dt);
        this.fx.update(dt);
        this.world.followSun(this.player.pos);
        this.input.endFrame();
        return;
      }
      if (!this.outro && (this.input.hit('Escape') || this.input.hit('KeyP'))) this.pause();
      if (!this.outro && this.input.hit('KeyM')) this.toggleMap();
      if (this.outro) { this.player.sync(dt); this.input.consumeLook(); } else this.updatePlayer(dt);
      this.updateProjectiles(dt);
      for (const u of this.units) if (!u.isPlayer) u.update(dt);
      this.alertLevel = Math.max(0, this.alertLevel - dt);
      this.updateShelling(dt);
      this.radio.update(dt);
      if (!this.flags.contact && this.units.some((u) => u.team === 'ltte' && u.alive && u.state === 'combat')) this.storyEvent('contact');
      for (const c of this.charges) if ((c.timer -= dt) <= 0) this.detonate(c.target);
      this.charges = this.charges.filter((c) => c.timer > 0);
      this.checkObjective();
      if (this.endTimer > 0) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.endAction();
      }
      if (this.outro) this.outroCamera(dt);
      else {
        if (this.camera.fov === 55) { this.camera.fov = 70; this.camera.updateProjectionMatrix(); }
        this.updateCamera(dt);
      }
      this.updateHUD();
      if (this.mapOpen) this.drawMap();
      this.fx.update(dt);
      // remove bodies that have sunk away
      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        if (!u.alive && !u.isPlayer && u.deadTime > 30) { u.remove(); this.units.splice(i, 1); }
      }
    } else if (this.state === 'cinematic' && this.cinematic) {
      this.time += dt;
      this.cinematic.update(dt);
      for (const u of this.units) u.sync(0);
      this.fx.update(dt);
    } else if (this.world && this.player && this.state !== 'pause') {
      this.time += dt;
      this.menuCamera(dt);
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
    game.startMission(Math.min(game.profile.data.unlocked, MISSIONS.length - 1));
    game.state = 'start';
    game.show('start');
    game.focusFirst();
  })
  .catch((err) => {
    console.error(err);
    $('.loading-text').textContent = `Could not load models: ${err.message}`;
  });
