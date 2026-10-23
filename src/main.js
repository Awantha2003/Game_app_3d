import * as THREE from 'three';
import './style.css';
import { loadModels } from './assets.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { MISSIONS } from './missions.js';
import { Prologue } from './cinematic.js';
import { Profile } from './profile.js';
import { Radio } from './radio.js';
import {
  CHARACTERS, CLOSING, HISTORY_TIMELINE, HUMAN_COST, MEDALS, PROLOGUE, RANKS, SOURCES, SQUAD_EPILOGUE, STORY, nextRank,
} from './story.js';
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

  applyQuality() {
    const low = this.profile.settings.quality === 'low';
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    if (this.world) this.world.sun.castShadow = !low;
    this.resize();
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
    this.toast(`${this.mission.name.toUpperCase()} — ${this.mission.date}`, true);
    this.audio.stinger(true);
    this.radio.clear();
    this.radio.say(STORY[this.mission.id].intro);
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
    this.world = new World(this.scene, this.mission, 1000 + i * 77);
    const m = this.mission;
    this.player = new Unit(this, 'army', m.player.x, m.player.z, { player: true, yaw: Math.PI });
    this.units = [this.player];
    const squad = STORY[m.id].squad;
    for (let k = 0; k < m.allies; k++) {
      const name = squad[k] ? CHARACTERS[squad[k]].short : undefined;
      const a = new Unit(this, 'army', m.player.x + (k % 2 ? 3 : -3), m.player.z + 4 + k * 2, { index: k, yaw: Math.PI, name });
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
    this.civIncidents = 0;
    this.flags = {};
    this.radio.clear();
    this.applyQuality();

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
    this.radio.say(STORY[this.mission.id].outro);
    this.endTimer = Math.min(10, Math.max(2.5, this.radio.remaining + 0.6));
    this.endAction = () => {
      const m = this.mission;
      const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
      const rec = this.profile.recordMission(this.missionIndex, {
        objectives: m.objectives.length, accuracy: acc, difficulty: this.difficulty,
        hasCivilians: this.civTotal > 0, civilianIncidents: this.civIncidents,
      });
      this.lastRecord = rec;
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
    if (u.team === 'ltte') this.killfeed('LTTE cadre neutralised');
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
    const sens = (inp.aim ? 0.0011 : 0.0022) * this.profile.settings.sensitivity;
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
        this.civIncidents++;
        this.storyEvent('civilianWarning');
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
      this.radio.update(dt);
      if (!this.flags.contact && this.units.some((u) => u.team === 'ltte' && u.alive && u.state === 'combat')) this.storyEvent('contact');
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
    } else if (this.state === 'cinematic' && this.cinematic) {
      this.time += dt;
      this.cinematic.update(dt);
      for (const u of this.units) u.sync(0);
      this.fx.update(dt);
    } else if (this.world && this.player && this.state !== 'pause') {
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
    game.startMission(Math.min(game.profile.data.unlocked, MISSIONS.length - 1));
    game.state = 'start';
    game.show('start');
    game.focusFirst();
  })
  .catch((err) => {
    console.error(err);
    $('.loading-text').textContent = `Could not load models: ${err.message}`;
  });
