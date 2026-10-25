import * as THREE from 'three';
import './style.css';
import { loadModels, models } from './assets.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { MISSIONS } from './missions.js';
import { Prologue } from './cinematic.js';
import { Insertion } from './insertion.js';
import { MAX_PLAYERS, Net, cleanName } from './net.js';
import { PostFX } from './postfx.js';
import { Weather } from './weather.js';
import { Profile } from './profile.js';
import { Radio } from './radio.js';
import {
  CHARACTERS, CLOSING, HISTORY_TIMELINE, HUMAN_COST, LOADOUT, MEDALS, PROLOGUE, RANKS, SOURCES, SQUAD_EPILOGUE, STORY, nextRank, rankIndex,
} from './story.js';
import { Unit } from './units.js';
import { placeVehicles } from './vehicles.js';
import { Support } from './support.js';
import { World } from './world.js';

const $ = (s, r = document) => r.querySelector(s);

// The player's weapons. Noise is how far (m) the shot is heard.
// which weapon slot a weapon goes into (1 primary, 2 pistol, 3 marksman, 4 launcher)
const SLOT = { t56: 0, lmg: 0, pistol: 1, svd: 2, rpg: 3 };
// scope and binocular magnifications (field of view = 70° / zoom)
const SCOPE_ZOOM = [4, 8, 12];
const BINO_ZOOM = [4, 8];
// what G throws or places
const THROWABLES = { frag: 'Frag grenade', smoke: 'Smoke grenade', c4: 'C4 charge' };

const WEAPONS = [
  { id: 'lmg', name: 'Light machine gun', mag: 100, reserve: 300, interval: 0.085, auto: true, body: 40, head: 120, spreadHip: 0.026, spreadAim: 0.007, recoil: 0.011, noise: 90, reload: 5.2, heavy: true },
  { id: 't56', name: 'T-56 rifle', mag: 30, reserve: 240, interval: 0.1, auto: true, body: 36, head: 120, spreadHip: 0.012, spreadAim: 0.003, recoil: 0.009, noise: 70, reload: 2.2 },
  { id: 'pistol', name: 'Pistol · suppressed', mag: 8, reserve: 48, interval: 0.25, auto: false, body: 34, head: 110, spreadHip: 0.01, spreadAim: 0.004, recoil: 0.014, noise: 9, reload: 1.6, suppressed: true },
  { id: 'svd', name: 'SVD Dragunov', mag: 10, reserve: 40, interval: 0.45, auto: false, body: 110, head: 200, spreadHip: 0.03, spreadAim: 0.0004, recoil: 0.03, noise: 130, reload: 2.8, scope: true },
  { id: 'rpg', name: 'RPG-7 launcher', mag: 1, reserve: 4, interval: 0.8, auto: false, body: 0, head: 0, spreadHip: 0.02, spreadAim: 0.004, recoil: 0.06, noise: 150, reload: 3.2, rocket: true },
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
    this.net = new Net(this);
    this.net.onStatus = (t) => { const el = $('.coop-status'); if (el) el.textContent = t; };
    this.net.onInvite = (link) => { $('.coop-link').value = link; $('.coop-invite').classList.remove('hidden'); };
    this.net.onConnect = () => this.refreshCoop();
    this.net.onRoster = () => this.refreshCoop();
    this.partners = new Map();
    this.chatLog = [];
    this.audio = new Audio();
    this.fx = new FX(this.scene);
    this.input = new Input(this.canvas, $('#touch'));
    this.clock = new THREE.Clock();
    this.state = 'loading';
    this.time = 0;
    this.units = [];
    this.vehicles = [];
    this.profile = new Profile(MISSIONS.map((m) => m.id));
    this.difficulty = this.profile.settings.difficulty;
    this.audio.setVolume(this.profile.settings.volume);
    this.radio = new Radio($('.radio'), this.audio);
    this.prologue = new Prologue(this);
    this.support = new Support(this);
    this.cinematic = null;
    this.flags = {};
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && !this.mapOpen) this.pause();
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
    if (name && name !== 'pause' && this.nvg) this.setNVG(false);
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
      const item = e.target.closest('.lo-item');
      if (item && !item.disabled) {
        this.profile.data.loadout[item.dataset.slot] = item.dataset.item;
        this.profile.save();
        this.audio.click();
        this.showLoadout(this.loadoutBack);
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      this.audio.init();
      this.audio.click();
      const actions = {
        start: () => this.startGame(),
        begin: () => this.beginMission(),
        menu: () => this.showMenu(),
        resume: () => this.resume(),
        restart: () => {
          if (this.net.active) { if (this.net.role === 'host') this.coopHostStart(this.missionIndex); else this.toast('Only the host can restart the mission'); return; }
          this.startMission(this.missionIndex); this.beginMission();
        },
        next: () => (this.net.active ? this.showCoop() : this.afterDebrief()),
        'promo-next': () => this.nextAfterMission(),
        continue: () => this.continueCampaign(),
        newcampaign: () => this.playPrologue(() => this.openBriefing(0)),
        prologue: () => this.playPrologue(() => this.showMenu()),
        missions: () => this.showMissions(),
        squad: () => this.showSquad(),
        profile: () => this.showProfile(),
        archive: () => this.showArchive(),
        settings: () => this.showSettings(),
        loadout: () => this.showLoadout('menu'),
        coop: () => this.showCoop(),
        'coop-host': () => { this.saveCoopName(); this.net.host($('.coop-via').value); this.refreshCoop(); },
        'coop-copy': () => { navigator.clipboard?.writeText($('.coop-link').value).then(() => this.toast('Invite link copied'), () => {}); $('.coop-link').select(); },
        'coop-share': () => this.shareInvite(),
        'coop-whatsapp': () => window.open(`https://wa.me/?text=${encodeURIComponent(this.inviteText())}`, '_blank', 'noopener'),
        'coop-mic': () => this.net.setMic(!this.net.micOn),
        'chat-send': () => this.sendChatFrom($('.coop-chat-input')),
        'coop-start': () => this.coopHostStart(parseInt($('.coop-mission').value, 10)),
        'coop-leave': () => { this.net.leave(); this.net.setStatus('Not connected.'); $('.coop-invite').classList.add('hidden'); this.refreshCoop(); },
        'quick-chat': () => {},
        'loadout-brief': () => this.showLoadout('briefing'),
        'loadout-back': () => (this.loadoutBack === 'briefing' ? this.openBriefing(this.missionIndex) : this.showMenu()),
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
    $('#map canvas').addEventListener('click', (e) => this.mapOrder(e));
    // chat: Enter sends, Escape closes; quick messages for phones
    const chatInput = $('.chat-box input');
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.sendChatFrom(chatInput); this.closeChat(); }
      if (e.key === 'Escape') this.closeChat();
      e.stopPropagation();
    });
    $('.chat-box').addEventListener('click', (e) => {
      const q = e.target.closest('[data-quick]');
      if (q) { this.net.chat(q.dataset.quick); this.closeChat(); }
      if (e.target.closest('.chat-send')) { this.sendChatFrom(chatInput); this.closeChat(); }
      if (e.target.closest('.chat-close')) this.closeChat();
    });
    $('.coop-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.sendChatFrom(e.target); });
    $('.coop-name').addEventListener('change', () => this.saveCoopName());
    for (const b of document.querySelectorAll('.coop-quick [data-quick]')) b.addEventListener('click', () => this.net.chat(b.dataset.quick));
    const tc = $('.btn-chat'), tm = $('.btn-mic');
    tc.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.openChat(); }, { passive: false });
    tm.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.net.setMic(!this.net.micOn); }, { passive: false });
    $('.wbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (b && this.state === 'playing' && !this.vehicle) this.switchWeapon(Number(b.dataset.slot));
    });
    $('.map-mode').addEventListener('click', () => { this.mapMode = { bravo: 'all', all: 'strike', strike: 'bravo' }[this.mapMode] || 'bravo'; this.drawMap(); });
    $('.map-close').addEventListener('click', () => this.toggleMap(false));
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
    if (this.mission.insertion && !this.net.active) {
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
      const a = new Unit(this, 'army', m.player.x + (k % 2 ? 3 : -3), m.player.z + 4 + k * 2, { index: k, yaw: Math.PI, name: c.short, model: c.model, role: c.ai, weapon: c.ai === 'gunner' ? 'wpn_lmg' : null });
      this.units.push(a);
    }
    let idx = 10;
    for (const s of this.world.spawns) {
      // cadres carry T-56 rifles; sentries an SVD and every sixth a machine gun
      const wid = s.team !== 'ltte' ? null : s.sentry ? 'svd' : idx % 6 === 0 ? 'lmg' : idx % 9 === 4 ? 'rpg' : 't56';
      const u = new Unit(this, s.team, s.x, s.z, {
        tag: s.tag, index: idx++, yaw: s.team === 'ltte' ? Math.random() * 6.28 : Math.PI, patrol: s.patrol, sentry: s.sentry,
        weapon: wid && wid !== 't56' ? `wpn_${wid}` : null, role: wid === 'lmg' ? 'gunner' : undefined,
      });
      u.weaponId = wid;
      if (s.team === 'ltte') u.yaw = Math.atan2(m.player.x - s.x, m.player.z - s.z) + (Math.random() - 0.5) * 1.8;
      this.units.push(u);
    }
    // network ids: the same construction order on both machines gives the same ids
    this.units.forEach((u, i) => { u.nid = i; });
    this.nextNid = 1000;
    this.partners = new Map();
    if (this.net.active) {
      this.player.nid = this.net.myNid;
      this.net.roster.filter((r) => r.nid !== this.net.myNid).forEach((r) => this.addPartner(r.nid, r.name));
    }
    this.world.units = this.units;
    this.vehicles = placeVehicles(this);
    this.vehicle = null;
    this.support.clear();
    this.support.reset();
    this.strikeMark = null;
    document.body.classList.remove('invehicle');
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
    this.applyLoadout();
    this.projectiles = [];
    this.pickups = [];
    this.viaDone = false;
    this.jumpH = 0;
    this.jumpV = 0;
    this.mapMode = this.mapMode || 'bravo';
    this.binos = false;
    this.scopeZoom = 1;
    this.binoZoom = 1;
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
    for (const v of this.vehicles || []) v.remove();
    this.vehicles = [];
    this.vehicle = null;
    this.audio.engine(null);
    for (const g of this.projectiles || []) this.scene.remove(g.obj);
    for (const c of this.c4Placed || []) c.obj.parent?.remove(c.obj);
    this.c4Placed = [];
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
    if (o.type === 'defend') this.defendState = { left: o.time, elapsed: 0, wave: 0 };
    if (this.net.role !== 'guest' || !this.net.active) for (const s of o.spawn || []) this.spawnGroup(s);
    $('.obj-mission').textContent = `${this.profile.rank.short} Awan · ${this.mission.name} · Objective ${i + 1}/${this.mission.objectives.length}`;
    $('.obj-text').textContent = o.text;
    if (i > 0) this.toast(`New objective: ${o.text}`);
    this.radio.say(STORY[this.mission.id].objectives[i]);
  }

  // reinforcements that arrive already fighting
  spawnGroup(s) {
    for (let k = 0; k < s.n; k++) {
      const x = s.x + (Math.random() - 0.5) * 10, z = s.z + (Math.random() - 0.5) * 10;
      if (this.world.isWater(x, z, 0)) continue;
      const u = new Unit(this, 'ltte', x, z, { tag: s.tag, index: 50 + k });
      u.nid = this.nextNid++;
      u.state = 'combat';
      u.lastSeen = this.player.pos.clone();
      this.units.push(u);
    }
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
          // stragglers are marked and leave cover to close in, so nobody hides forever
          if (!u.straggler) { u.straggler = true; u.marked = true; }
          if (!u.visible && !u.sentry) u.lastSeen = this.nearestHuman(u.pos).pos.clone();
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
    } else if (o.type === 'defend') {
      // hold the position while counter-attack waves come in
      const st = this.defendState, [zx, zz, zr] = o.zone;
      st.elapsed += this.frameDt || 0;
      const w = o.waves[st.wave];
      if (w && st.elapsed >= w.at) {
        this.spawnGroup({ ...w, tag: o.tag });
        st.wave++;
        this.radio.say([[this.speakerKey(this.squadAllies()[0]), st.wave === 1 ? 'Here they come — hold the junction!' : 'More of them — another direction!']]);
      }
      const inside = Math.hypot(this.player.pos.x - zx, this.player.pos.z - zz) < zr;
      if (inside) st.left -= this.frameDt || 0;
      sub = inside ? `Hold the position: ${Math.max(0, Math.ceil(st.left))} s` : 'Get back to the position!';
      done = st.left <= 0;
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
    if (o.type === 'defend') return new THREE.Vector3(o.zone[0], this.world.height(o.zone[0], o.zone[1]) + 2, o.zone[1]);
    if (o.type === 'escort') {
      const waiting = this.units.find((u) => u.team === 'civ' && u.state === 'wait');
      if (waiting) return waiting.pos.clone().setY(waiting.pos.y + 2);
      // lead the families through the gap first (e.g. the breach in a bund)
      if (o.via && !this.viaDone) {
        if (Math.hypot(p.x - o.via[0], p.z - o.via[1]) < 4) this.viaDone = true;
        else return new THREE.Vector3(o.via[0], this.world.height(o.via[0], o.via[1]) + 2, o.via[1]);
      }
      return new THREE.Vector3(o.zone[0], this.world.height(o.zone[0], o.zone[1]) + 2, o.zone[1]);
    }
    return null;
  }

  missionComplete() {
    if (this.net.active && this.net.role === 'host') this.net.send({ t: 'end', ok: true });
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
        alarmRaised: this.world.alarms.some((a) => a.triggered && !a.disabled),
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
    if (this.net.active) { this.showCoop(); return; }
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
    if (this.net.active && this.net.role === 'host') this.net.send({ t: 'end', ok: false, reason });
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
    if (u.isPlayer) {
      this.radio.clear();
      if (this.net.active && this.net.role === 'guest') this.net.send({ t: 'dead' });
      this.missionFailed('You were killed in action.');
      return;
    }
    if (u.team === 'civ') { this.missionFailed('A civilian was killed. Protecting civilians is your first duty.'); return; }
    if (u.team === 'army') this.killfeed(`${u.name || 'A soldier'} was killed in action`);
    if (u.team === 'ltte') {
      this.dropWeapon(u);
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

  // rounds landing near cadres pin them down
  suppress(point, radius, time) {
    for (const u of this.units) {
      if (!u.alive || u.team !== 'ltte') continue;
      if (Math.abs(u.pos.x - point.x) > radius || Math.abs(u.pos.z - point.z) > radius) continue;
      if (u.pos.distanceTo(point) < radius) u.suppressed = Math.max(u.suppressed, time);
    }
  }

  onFlank(u) {
    if (this.time - (this.lastFlankCall || -99) < 25) return;
    const pl = this.player.pos;
    const side = Math.sin(this.yaw) * (u.pos.z - pl.z) - Math.cos(this.yaw) * (u.pos.x - pl.x) > 0 ? 'left' : 'right';
    const spotter = this.squadAllies().find((a) => a.canSee(u, 120));
    if (!spotter) return;
    this.lastFlankCall = this.time;
    this.radio.say([[this.speakerKey(spotter), `They're flanking — ${side} side!`]]);
  }

  callMedic() {
    const medic = this.squadAllies().find((a) => a.role === 'medic');
    if (!medic) { this.toast('No medic with the section — find a supply crate'); return; }
    if (medic.kits <= 0) { this.radio.say([[this.speakerKey(medic), 'I\'m out of dressings, Sir.']]); return; }
    this.medicCalled = true;
    medic.patient = null;
    this.radio.say([[this.speakerKey(medic), 'Coming, Sir — stay down!']]);
  }

  onMedic(medic, patient, phase) {
    const who = this.speakerKey(medic);
    if (phase === 'coming' && patient.isPlayer && !this.medicCalled) this.radio.say([[who, 'Hold on, Sir, I\'m coming to you.']]);
    if (phase === 'done') {
      if (patient.isPlayer) this.medicCalled = false;
      this.toast(`${medic.name} treated ${patient.isPlayer ? 'you' : patient.name} · ${medic.kits} dressings left`);
    }
  }

  onAllyDown(u) {
    const other = this.squadAllies().find((a) => a !== u && !a.downed);
    const medic = this.squadAllies().find((a) => a.role === 'medic' && !a.downed && a.kits > 0);
    this.killfeed(`${u.name} is down`);
    this.radio.say([[this.speakerKey(other || u), `Man down! ${u.name} is hit!`]].concat(medic && medic !== u ? [[this.speakerKey(medic), 'I\'m on him — cover me!']] : []));
    if (!medic) this.toast(`${u.name} is down — hold E next to him to patch him up`, true);
  }

  onAllyRevived(u, by) {
    this.toast(`${u.name} is back on his feet${by && by !== this.player ? ` (${by.name})` : ''}`);
  }

  // the player patches up a downed soldier (in co-op the host does it)
  revive(u) {
    if (this.net.active && this.net.role === 'guest') { this.net.send({ t: 'interact', kind: 'revive', nid: u.nid }); u.downed = false; return; }
    u.downed = false;
    u.hp = Math.max(u.hp, u.maxHp * 0.45);
    u.stance = 'crouch';
    this.onAllyRevived(u, this.player);
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
    return this.weapons[this.wi];
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
    this.weaponObjs = { t56: rifle, lmg: attach('wpn_lmg'), svd: attach('wpn_svd'), pistol: attach('wpn_pistol'), rpg: attach('wpn_rpg') };
    this.weaponObjs.pistol.position.set(-0.26, -0.3, 0.17);
    this.weaponObjs.rpg.position.y += 0.08;
    this.weaponObjs.rpg.position.x -= 0.06;
    this.showWeapon();
  }

  showWeapon() {
    if (!this.weaponObjs) return;
    for (const [id, o] of Object.entries(this.weaponObjs)) o.visible = id === this.W.id;
    this.player.parts.muzzle = this.weaponObjs[this.W.id].getObjectByName('Muzzle');
  }

  switchWeapon(i) {
    if (i === this.wi || i < 0 || i >= this.weapons.length) return;
    this.wstate[this.wi] = { ammo: this.ammo, reserve: this.reserve };
    this.wi = i;
    ({ ammo: this.ammo, reserve: this.reserve } = this.wstate[i]);
    this.reloading = 0;
    this.fireCooldown = 0.4;
    this.binos = false;
    this.showWeapon();
    this.audio.click();
    this.renderWeaponBar();
  }

  // the four weapon slots along the bottom of the screen; tap or click one to change
  renderWeaponBar() {
    const el = $('.wbar');
    if (!el || !this.weapons) return;
    el.innerHTML = this.weapons.map((w, i) => {
      const st = i === this.wi ? { ammo: this.ammo, reserve: this.reserve } : this.wstate[i];
      return `<button class="wslot${i === this.wi ? ' on' : ''}" data-slot="${i}"><b>${i + 1}</b> ${w.name.replace(/ ·.*/, '')}<small>${st.ammo} / ${st.reserve}</small></button>`;
    }).join('');
    this.wbarKey = `${this.wi}:${this.ammo}:${this.reserve}:${this.weapons.map((w) => w.id).join()}`;
  }

  // ------------------------------------------------------------ explosives

  cycleThrowable() {
    const kinds = Object.keys(THROWABLES);
    for (let k = 1; k <= kinds.length; k++) {
      const next = kinds[(kinds.indexOf(this.throwType) + k) % kinds.length];
      if (this.explosives[next] > 0 || k === kinds.length) { this.throwType = next; break; }
    }
    this.toast(`${THROWABLES[this.throwType]} ready (${this.explosives[this.throwType]})`);
    this.audio.click();
  }

  useThrowable() {
    const kind = this.throwType;
    if (this.explosives[kind] <= 0) { this.toast(`No ${THROWABLES[kind].toLowerCase()}s left — Y to switch`); return; }
    this.explosives[kind]--;
    if (kind === 'c4') { this.placeC4(); return; }
    const p = this.player, d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    const pos = p.pos.clone().add(new THREE.Vector3(0, p.eyeHeight, 0)).addScaledVector(d, 0.6);
    const vel = d.multiplyScalar(15).add(new THREE.Vector3(0, 4, 0));
    const obj = models[kind === 'smoke' ? 'smoke_grenade' : 'grenade'].clone(true);
    obj.scale.setScalar(1.6);
    this.scene.add(obj);
    this.projectiles.push({ kind, obj, pos, vel, fuse: kind === 'smoke' ? 1.6 : 3 });
    this.toast(kind === 'smoke' ? 'Smoke out!' : 'Grenade out!');
  }

  get grenades() { return this.explosives?.frag ?? 0; }

  set grenades(n) { if (this.explosives) this.explosives.frag = n; }

  placeC4() {
    const p = this.player, f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const x = p.pos.x + f.x * 0.7, z = p.pos.z + f.z * 0.7;
    const obj = models.c4.clone(true);
    obj.position.set(x, this.world.height(x, z) + 0.02, z);
    obj.rotation.y = this.yaw;
    obj.scale.setScalar(1.5);
    this.world.group.add(obj);
    this.c4Placed.push({ obj, pos: obj.position.clone() });
    document.body.classList.add('c4armed');
    this.toast(`C4 placed (${this.c4Placed.length}) — press ${this.input.touch ? 'DET' : 'U'} to detonate from a safe distance`);
    this.audio.click();
  }

  detonateC4() {
    if (!this.c4Placed.length) { this.toast('No charges placed'); return; }
    this.audio.click();
    for (const c of this.c4Placed) {
      this.world.group.remove(c.obj);
      this.explode(c.pos.clone().setY(c.pos.y + 0.3), 8.5, 320, this.player);
    }
    this.c4Placed = [];
    document.body.classList.remove('c4armed');
  }

  // smoke blocks sight lines for both sides for about 25 seconds
  addSmoke(pos, send = true) {
    this.fx.smokeCloud(pos, 24);
    this.world.smokes.push({ x: pos.x, y: pos.y + 1.5, z: pos.z, r: 5.5, t: 25 });
    if (send && this.net.active) this.net.send({ t: 'smoke', p: pos.toArray().map((v) => Math.round(v * 10) / 10) });
  }

  fireRocket(from, dir, source, opts = {}) {
    if (!this.rocketMesh) {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#4b5230', roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).rotateX(Math.PI / 2), m);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8).rotateX(Math.PI / 2), m);
      nose.position.z = 0.38;
      g.add(body, nose);
      this.rocketMesh = g;
    }
    const obj = this.rocketMesh.clone();
    this.scene.add(obj);
    this.projectiles.push({
      kind: opts.bomb ? 'bomb' : 'rocket', obj, pos: from.clone(), vel: opts.vel || dir.clone().multiplyScalar(opts.speed || 75),
      fuse: 1, life: opts.bomb ? 12 : 4, r: opts.r || 6.5, dmg: opts.dmg || 260, source, ignore: opts.ignore || source,
    });
    if (opts.bomb) obj.scale.setScalar(3);
  }

  resupply() {
    this.wstate[this.wi] = { ammo: this.ammo, reserve: this.reserve };
    this.weapons.forEach((w, i) => { this.wstate[i].reserve = Math.max(this.wstate[i].reserve, w.reserve); });
    this.reserve = this.wstate[this.wi].reserve;
    this.grenades = Math.max(this.grenades, this.maxGrenades);
    this.explosives.smoke = Math.max(this.explosives.smoke, 2);
    this.explosives.c4 = Math.max(this.explosives.c4, 2);
    // the crate's first-aid kit
    this.player.hp = Math.max(this.player.hp, 80);
    for (const a of this.squadAllies()) if (a.role === 'medic') a.kits = Math.max(a.kits, 3);
  }

  // weapons and equipment from the player's loadout (locked items fall back to standard issue)
  applyLoadout() {
    const lo = this.loadoutChoice();
    const mags = lo.gear === 'mags' ? 1.5 : 1;
    const byId = (id) => ({ ...WEAPONS.find((w) => w.id === id) });
    this.weapons = [byId(lo.primary), byId('pistol'), byId('svd'), byId('rpg')].map((w) => ({ ...w, reserve: Math.round(w.reserve * mags) }));
    this.wstate = this.weapons.map((w) => ({ ammo: w.mag, reserve: w.reserve }));
    this.ammo = this.weapons[0].mag;
    this.reserve = this.weapons[0].reserve;
    this.maxGrenades = lo.gear === 'pouch' ? 5 : 3;
    this.explosives = { frag: this.maxGrenades, smoke: 2, c4: 2 };
    this.throwType = 'frag';
    this.c4Placed = [];
    document.body.classList.remove('c4armed');
    this.wbarKey = null;
    this.renderWeaponBar();
    this.hasNVG = !!this.mission.night || lo.optics === 'nvg';
    this.setNVG(false);
  }

  unlocked(item) {
    return rankIndex(this.profile.rank.id) >= rankIndex(item.rank);
  }

  loadoutChoice() {
    const out = {};
    for (const [slot, items] of Object.entries(LOADOUT)) {
      const it = items.find((o) => o.id === this.profile.data.loadout[slot]);
      out[slot] = it && this.unlocked(it) ? it.id : items[0].id;
    }
    return out;
  }

  showLoadout(back = 'menu') {
    this.loadoutBack = back;
    const lo = this.loadoutChoice();
    const titles = { primary: 'Primary weapon', gear: 'Equipment', optics: 'Optics' };
    $('.loadout').innerHTML = Object.entries(LOADOUT).map(([slot, items]) => `<h3>${titles[slot]}</h3><div class="lo-row">${items.map((it) => {
      const ok = this.unlocked(it), on = lo[slot] === it.id;
      const rank = RANKS.find((r) => r.id === it.rank);
      return `<button class="lo-item${on ? ' on' : ''}" data-slot="${slot}" data-item="${it.id}"${ok ? '' : ' disabled'}>
        <b>${it.name}</b><small>${ok ? it.desc : `Unlocks at ${rank.name}`}</small></button>`;
    }).join('')}</div>`).join('')
      + '<p class="note">Always carried: suppressed pistol (2), SVD sniper rifle (3), RPG-7 launcher (4), binoculars (B), smoke grenades and C4 charges (Y to switch, G to use).</p>';
    this.show('loadout');
    this.focusFirst();
  }

  toggleNVG() {
    if (!this.hasNVG) { this.toast('No night-vision goggles in your loadout'); return; }
    this.setNVG(!this.nvg);
    this.audio.click();
  }

  setNVG(on) {
    this.nvg = on;
    document.body.classList.toggle('nvg', on);
    this.renderer.toneMappingExposure = (this.world?.atm.exposure ?? 1) * (on ? 3.2 : 1);
  }

  isScoped() {
    return this.W.scope === true && this.input.aim && this.reloading <= 0 && this.player.alive && !this.binos && !this.vehicle;
  }

  // mouse wheel, + / - keys or the phone's + / - buttons change the optic's zoom
  changeZoom(dir) {
    const binos = this.binos, list = binos ? BINO_ZOOM : SCOPE_ZOOM, key = binos ? 'binoZoom' : 'scopeZoom';
    const i = THREE.MathUtils.clamp(this[key] + dir, 0, list.length - 1);
    if (i === this[key]) return;
    this[key] = i;
    this.audio.click();
  }

  get opticZoom() {
    return this.binos ? BINO_ZOOM[this.binoZoom] : SCOPE_ZOOM[this.scopeZoom];
  }

  // ------------------------------------------------------------ player

  updatePlayer(dt) {
    const inp = this.input, p = this.player;
    if (!p.alive) { p.update(dt); p.sync(dt); return; }
    if (this.vehicle) { this.updateVehicle(dt); return; }
    if (inp.hit('KeyF')) { const v = this.nearestVehicle(); if (v) this.enterVehicle(v); }

    const look = inp.consumeLook();
    const zoom = this.camera.fov / 70;
    const sens = 0.0022 * zoom * this.profile.settings.sensitivity;
    this.yaw -= look.x * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * sens, -1.0, 0.75);

    // stance
    if (inp.hit('KeyC')) p.stance = p.stance === 'crouch' ? 'stand' : 'crouch';
    if (inp.hit('KeyZ')) p.stance = p.stance === 'prone' ? 'stand' : 'prone';
    if (inp.hit('Space')) {
      // Space stands up; when already standing, it jumps
      if (p.stance !== 'stand') p.stance = 'stand';
      else if (!this.jumpH && !p.towerCenter) { this.jumpV = 4.6; this.jumpH = 0.001; this.audio.burst({ dur: 0.05, freq: 300, vol: 0.08 }); }
    }

    const scoped = this.isScoped();
    const mv = inp.moveVec;
    const sprint = inp.sprint && mv.y > 0 && !inp.aim && this.reloading <= 0 && p.stance === 'stand' && !this.binos;
    let speed = p.stance === 'prone' ? 0.9 : p.stance === 'crouch' ? 2.2 : sprint ? 6.8 : 4.3;
    if (inp.aim || this.binos) speed = Math.min(speed, p.stance === 'stand' ? 2.4 : speed * 0.7);
    if (this.W.heavy) speed *= 0.86;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const sx = p.pos.x, sz = p.pos.z;
    p.move(fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x, speed * Math.min(1, Math.hypot(mv.x, mv.y)), dt);
    p.separate();
    if (this.jumpH > 0) {
      this.jumpV -= 14 * dt;
      this.jumpH = Math.max(0, this.jumpH + this.jumpV * dt);
      p.pos.y += this.jumpH;
      if (this.jumpH === 0) this.noise(p.pos, 5, false);
    }
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

    // health: wounds slowly close up to 60%; above that it takes the medic
    if (this.time - this.lastPlayerHit > 5 && p.hp < 60) p.hp = Math.min(60, p.hp + 9 * dt);
    if (inp.hit('KeyH')) this.callMedic();

    // support menu: while it is open the number keys call support
    if (inp.hit('KeyL')) this.support.toggle();
    if (this.support.open) this.support.keys(inp);
    // weapons
    if (inp.hit('Digit1')) this.switchWeapon(0);
    if (inp.hit('Digit2')) this.switchWeapon(1);
    if (inp.hit('Digit3')) this.switchWeapon(2);
    if (inp.hit('Digit4')) this.switchWeapon(3);
    const wheel = inp.consumeWheel();
    const optic = scoped || this.binos;
    if (optic) {
      if (wheel) this.changeZoom(wheel > 0 ? -1 : 1);
    } else if (wheel) this.switchWeapon((this.wi + (wheel > 0 ? 1 : this.weapons.length - 1)) % this.weapons.length);
    if (inp.hit('Equal') || inp.hit('NumpadAdd')) this.changeZoom(1);
    if (inp.hit('Minus') || inp.hit('NumpadSubtract')) this.changeZoom(-1);
    if (inp.hit('KeyY')) this.cycleThrowable();
    if (inp.hit('KeyU')) this.detonateC4();
    if (inp.hit('KeyN')) this.toggleNVG();
    if (inp.hit('KeyQ')) this.switchWeapon((this.wi + 1) % this.weapons.length);
    if (this.net.active) {
      if (inp.hit('Enter')) this.openChat();
      if (inp.hit('KeyK')) this.net.setMic(!this.net.micOn);
    }
    if (inp.hit('KeyB')) { this.binos = !this.binos; this.audio.click(); }
    if (inp.hit('KeyG') && !this.binos) this.useThrowable();

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
    // a quick tap fires even when it is shorter than a frame, and a tap during
    // the bolt cycle (SVD, pistol) fires as soon as the weapon is ready
    if (inp.consumeFireTap()) this.fireQueued = 0.5;
    this.fireQueued = Math.max(0, (this.fireQueued || 0) - dt);
    const pull = (inp.fire && (W.auto || !this.wasFiring)) || this.fireQueued > 0;
    this.wasFiring = inp.fire;
    if (pull && !sprint && !this.binos && this.reloading <= 0 && this.fireCooldown <= 0) {
      if (this.ammo > 0) { this.shoot(); this.fireQueued = 0; }
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
      const low = this.reserve < W.reserve || this.grenades < this.maxGrenades || p.hp < 80;
      if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 3 && low && this.supplyCooldown <= 0) {
        this.resupply();
        this.supplyCooldown = 3;
        this.toast('Ammunition, grenades and first aid resupplied');
      }
    }

    this.updateInteraction(dt);
  }

  shoot() {
    const p = this.player, W = this.W;
    this.ammo--;
    this.shots++;
    this.fireCooldown = W.interval;
    if (W.rocket) { this.shootRocket(); return; }
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

    const guest = this.net.active && this.net.role === 'guest';
    if (this.net.active) {
      const v = (x) => x.toArray().map((n) => Math.round(n * 100) / 100);
      this.net.send(guest ? { t: 'shot', a: v(muzzle), b: v(end), noise: W.noise, quiet: !!W.suppressed } : { t: 'fx', a: v(muzzle), b: v(end), c: 0xfff2a0 });
    }
    this.suppress(end, W.id === 'lmg' ? 4 : 2.5, W.id === 'lmg' ? 2.5 : 1.2);
    this.bulletHit(res, W.body, W.head, () => this.world.raycast(origin, aimDir, 450, p)?.unit);

    // recoil
    this.pitch = Math.min(0.75, this.pitch + W.recoil * (0.6 + Math.random() * 0.6) * stanceMul);
    this.yaw += (Math.random() - 0.5) * W.recoil * 0.6;
  }

  // what a bullet does to whatever it hit. aimedAt() tells which unit the
  // un-spread aim line points at: only shots aimed at a civilian hurt them.
  bulletHit(res, body, head, aimedAt) {
    const p = this.player;
    const guest = this.net.active && this.net.role === 'guest';
    if (res?.kind === 'unit' && res.unit.team === 'army' && (!guest || res.unit.remote)) {
      // friendly fire wounds your own soldiers (never the other players)
      const u = res.unit;
      if (!u.remote) u.damage(body * 0.5, p);
      this.fx.hitPuff(res.point);
      this.toast('Check your fire — friendly!', true);
      this.friendlyHits = (this.friendlyHits || 0) + 1;
    } else if (guest && res?.kind === 'unit') {
      // the host owns every unit: report the hit and let it apply the damage
      const u = res.unit, aimed = aimedAt() === u;
      this.net.send({ t: 'hit', nid: u.nid, dmg: res.head ? head : body, aimed });
      if (u.team === 'army') this.toast('Check your fire — friendly!', true);
      else if (u.team === 'civ') { this.toast('HOLD FIRE — civilians!', true); this.civIncidents++; this.storyEvent('civilianWarning'); }
      else { this.hits++; this.fx.hitPuff(res.point); this.flashHitmarker(false); }
    } else if (res?.kind === 'unit') {
      const u = res.unit;
      if (u.team === 'civ') {
        if (aimedAt() === u) u.damage(40, p);
        if (u.alive) this.toast('HOLD FIRE — civilians!', true);
        this.civIncidents++;
        this.storyEvent('civilianWarning');
      } else {
        this.hits++;
        u.damage(res.head ? head : body, p);
        this.fx.hitPuff(res.point);
        const killed = !u.alive;
        if (killed && u.team === 'ltte') this.kills++;
        this.flashHitmarker(killed);
      }
    } else if (res) {
      this.fx.impact(res.point, res.kind === 'vehicle' ? 'prop' : res.kind);
    }
  }

  // ------------------------------------------------------------ vehicles

  nearestVehicle() {
    const p = this.player.pos;
    let best = null, bd = Infinity;
    for (const v of this.vehicles) {
      if (!v.alive || v.driverNid != null) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - v.size;
      if (d < 2.2 && d < bd && Math.abs(v.pos.y - p.y) < 4) { bd = d; best = v; }
    }
    return best;
  }

  enterVehicle(v) {
    if (!v.alive || v.driverNid != null) { this.toast('Someone is already at the controls'); return; }
    const p = this.player;
    if (p.towerCenter) p.setTower(null);
    this.binos = false;
    this.reloading = 0;
    this.jumpH = 0;
    p.stance = 'stand';
    this.vehicle = v;
    v.driver = p;
    v.driverNid = this.net.active ? this.net.myNid : 'me';
    p.vehicle = v;
    v.occupants.add(p);
    // the section climbs in with you (the host runs the AI soldiers)
    if (v.cfg.seats && !(this.net.active && this.net.role === 'guest')) {
      const near = this.squadAllies().filter((a) => !a.downed && !a.vehicle && a.pos.distanceTo(v.pos) < 40).slice(0, v.cfg.seats);
      for (const a of near) { a.vehicle = v; v.occupants.add(a); a.order = 'follow'; }
      if (near.length) this.radio.say([[this.speakerKey(near[0]), v.kind === 'air' ? 'All aboard, Sir — lift when ready!' : 'Mounting up, Sir!']]);
    }
    this.yaw = v.yaw;
    this.pitch = v.kind === 'jet' ? 0 : -0.12;
    document.body.classList.add('invehicle');
    document.body.dataset.vehicle = v.kind;
    const t = this.input.touch;
    const how = {
      ground: t ? 'Stick: drive · FIRE: gun · GREN: smoke' : 'W/S drive · A/D steer · mouse aim · click fire · G smoke · F get out',
      water: t ? 'Stick: steer · FIRE: gun' : 'W/S throttle · A/D steer · mouse aim · click fire · F get out at the shore',
      air: t ? 'UP / DOWN: climb · stick: fly · FIRE: gun · GREN: rockets' : 'Space climb · C descend · WASD fly · mouse aim · click gun · G rockets · F get out (landed)',
      jet: t ? 'Stick up: speed · look to steer · FIRE: cannon · GREN: bomb' : 'W to take off · mouse steers · A/D roll · click cannon · G bomb · F return to base',
    }[v.kind];
    this.toast(`${v.name}: ${how}`, true);
    this.renderWeaponBar();
  }

  // step out beside the hull, on dry ground
  exitSpot(v, far = 8) {
    const w = this.world;
    for (let r = v.cfg.box[0] + 1.4; r <= far; r += 1.5) {
      for (let k = 0; k < 12; k++) {
        const a = v.yaw + Math.PI / 2 + (k * Math.PI * 2) / 12;
        const x = v.pos.x + Math.sin(a) * r, z = v.pos.z + Math.cos(a) * r;
        if (Math.abs(x) > w.size - 3 || Math.abs(z) > w.size - 3 || w.isWater(x, z, -0.1)) continue;
        v.box.off = true;
        const bad = w.blocked(x, z, 0.45);
        v.box.off = false;
        if (!bad) return { x, z };
      }
    }
    return null;
  }

  exitVehicle(force = false) {
    const v = this.vehicle;
    if (!v) return;
    if (!force) {
      if (v.kind === 'air' && v.airborne) { this.toast(`Land first — hold ${this.input.touch ? 'DOWN' : 'C'} to descend`); return; }
      if (v.kind === 'jet' && v.airborne) { this.returnJet(v); return; }
      if (Math.abs(v.speed) > 4) { this.toast('Slow down first'); return; }
    }
    const spot = this.exitSpot(v, force ? 40 : 8);
    if (!spot && !force) { this.toast(v.kind === 'water' ? 'Steer to the shore to get off' : 'No room to get out here'); return; }
    this.leaveVehicle(v, spot || { x: v.pos.x, z: v.pos.z });
  }

  leaveVehicle(v, spot) {
    const p = this.player, w = this.world;
    p.vehicle = null;
    v.occupants.delete(p);
    v.driver = null;
    v.driverNid = null;
    p.pos.set(spot.x, w.height(spot.x, spot.z), spot.z);
    p.obj.visible = true;
    // the section gets out around you
    let k = 0;
    for (const u of [...v.occupants]) {
      if (u.isPlayer || u.remote) continue;
      const a = (k++ / 6) * Math.PI * 2;
      let x = spot.x + Math.sin(a) * 2.2, z = spot.z + Math.cos(a) * 2.2;
      if (w.isWater(x, z, -0.1) || w.blocked(x, z, 0.4)) { x = spot.x; z = spot.z; }
      u.vehicle = null;
      u.pos.set(x, w.height(x, z), z);
      u.obj.visible = true;
      v.occupants.delete(u);
    }
    this.vehicle = null;
    this.yaw = v.yaw;
    document.body.classList.remove('invehicle');
    this.audio.engine(null);
    this.updateCamera(0, true);
    this.renderWeaponBar();
  }

  // a jet cannot land on this ground: it flies back to its strip and you walk away from it
  returnJet(v) {
    v.airborne = false;
    v.speed = 0;
    v.vel.set(0, 0, 0);
    v.pos.set(v.home.x, v.groundAt(v.home.x, v.home.z), v.home.z);
    v.yaw = v.home.yaw;
    v.pitch = v.roll = 0;
    v.sync();
    this.fadeIn();
    this.toast('Back at the strip — the jet is refuelled and re-armed', true);
    v.altAmmo = v.cfg.alt.ammo;
    v.heat = 0;
    const spot = this.exitSpot(v, 30) || { x: v.pos.x + 6, z: v.pos.z };
    this.leaveVehicle(v, spot);
  }

  onVehicleDestroyed(v) {
    const p = this.player, mine = this.vehicle === v;
    if (this.net.active && this.net.role === 'guest' && mine) this.net.send({ t: 'vdead', i: v.index });
    this.killfeed(`${v.name} destroyed`);
    if (mine) {
      this.toast('Bail out!', true);
      const spot = this.exitSpot(v, 40) || { x: THREE.MathUtils.clamp(v.pos.x, -this.world.size + 3, this.world.size - 3), z: v.pos.z };
      const occupants = [...v.occupants].filter((u) => !u.isPlayer);
      this.leaveVehicle(v, spot);
      p.hp -= 35;
      this.onPlayerHit(v.pos);
      if (p.hp <= 0) p.die(null);
      for (const u of occupants) u.damage(90, null);
    } else {
      // a partner's or an empty vehicle: anyone inside gets out hurt
      for (const u of [...v.occupants]) {
        u.vehicle = null;
        u.obj.visible = true;
        u.pos.y = this.world.height(u.pos.x, u.pos.z);
        if (!u.remote) u.damage(90, null);
      }
      v.occupants.clear();
      v.driver = null;
      v.driverNid = null;
    }
  }

  updateVehicle(dt) {
    const v = this.vehicle, inp = this.input, p = this.player;
    const look = inp.consumeLook();
    const sens = 0.0022 * (this.camera.fov / 70) * this.profile.settings.sensitivity;
    this.yaw -= look.x * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * sens, -1.2, 0.9);
    inp.consumeWheel();
    inp.consumeFireTap();
    const mv = inp.moveVec;
    v.drive(dt, {
      throttle: mv.y, steer: mv.x, up: inp.keys.has('Space'), down: inp.keys.has('KeyC') || inp.keys.has('ControlLeft'),
      aimYaw: this.yaw, aimPitch: this.pitch,
    });
    p.pos.set(v.pos.x, v.pos.y + 0.6, v.pos.z);
    p.yaw = this.yaw;
    p.speed = Math.abs(v.speed);
    if (!this.vehicle) return; // crashed
    // guns
    v.fireCd -= dt;
    v.altCd -= dt;
    v.overheat -= dt;
    v.heat = Math.max(0, v.heat - dt * (v.overheat > 0 ? 0.5 : 0.3));
    if (inp.fire && v.fireCd <= 0 && v.overheat <= 0) this.vehicleShot(v);
    if (inp.hit('KeyG')) this.vehicleAlt(v);
    if (inp.hit('KeyL')) this.support.toggle();
    if (this.support.open) this.support.keys(inp);
    if (inp.hit('KeyF')) this.exitVehicle();
    if (this.net.active) {
      if (inp.hit('Enter')) this.openChat();
      if (inp.hit('KeyK')) this.net.setMic(!this.net.micOn);
    }
    if (inp.hit('KeyT')) this.orderSquad();
    if (this.time - this.lastPlayerHit > 5 && p.hp < 60) p.hp = Math.min(60, p.hp + 9 * dt);
    const level = v.kind === 'air' ? 0.4 + v.speed / v.cfg.top * 0.6 : Math.min(1, Math.abs(v.speed) / v.cfg.top);
    this.audio.engine(v.type === 'heli' ? 'heli' : v.type, level);
    if (v.kind !== 'jet' || !v.airborne) this.noise(v.pos, 30, false);
    this.updateInteraction(dt);
  }

  // the vehicle's main gun: aimed by the camera, fired from the mount
  vehicleShot(v) {
    const k = v.cfg.gun, p = this.player, cam = this.camera;
    v.fireCd = k.interval;
    v.heat += k.heat;
    if (v.heat >= 1) { v.heat = 1; v.overheat = 2.5; this.toast('Gun overheated — wait for it to cool'); }
    this.shots++;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const aimDir = dir.clone();
    dir.x += (Math.random() - 0.5) * k.spread * 2;
    dir.y += (Math.random() - 0.5) * k.spread * 2;
    dir.z += (Math.random() - 0.5) * k.spread * 2;
    dir.normalize();
    const muzzle = v.muzzle();
    const aim = this.world.raycast(cam.position, dir, 600, p);
    const target = aim ? aim.point : cam.position.clone().addScaledVector(dir, 600);
    const d2 = target.clone().sub(muzzle).normalize();
    const res = this.world.raycast(muzzle, d2, 600, p);
    const end = res ? res.point : muzzle.clone().addScaledVector(d2, 600);
    this.fx.tracer(muzzle, end, 0xffe080);
    if (this.shots % 2) this.fx.muzzle(muzzle);
    this.audio.weapon(k.sound);
    this.noise(v.pos, k.noise, true);
    this.suppress(end, 5, 2.5);
    if (this.net.active) {
      const r = (x) => x.toArray().map((n) => Math.round(n * 100) / 100);
      this.net.send(this.net.role === 'guest' ? { t: 'shot', a: r(muzzle), b: r(end), noise: k.noise } : { t: 'fx', a: r(muzzle), b: r(end), c: 0xffe080 });
    }
    if (k.blast && res && this.shots % 3 === 0) this.explode(res.point, 3, 70, p);
    else this.bulletHit(res, k.body, k.head, () => this.world.raycast(cam.position, aimDir, 600, p)?.unit);
    this.fx.shake = Math.max(this.fx.shake, 0.12);
  }

  vehicleAlt(v) {
    const a = v.cfg.alt, p = this.player;
    if (!a) { this.toast(`The ${v.name} has no second weapon`); return; }
    if (v.altCd > 0) return;
    if (v.altAmmo <= 0) { this.toast(`${a.name}: none left`); return; }
    v.altAmmo--;
    if (a.smoke) {
      v.altCd = 1.5;
      for (const sx of [-5, 0, 5]) this.addSmoke(v.local(sx, 0, 7));
      this.toast('Smoke screen!');
      return;
    }
    const pod = a.pods[v.podSide++ % a.pods.length];
    const from = v.local(pod[0], pod[1], pod[2]);
    if (a.bomb) {
      v.altCd = 0.5;
      const vel = v.forward.clone().multiplyScalar(v.speed).add(new THREE.Vector3(0, -3, 0));
      this.fireRocket(from, null, p, { bomb: true, vel, r: 12, dmg: 450, ignore: p });
      this.toast(`Bomb away (${v.altAmmo} left)`);
      this.audio.click();
      return;
    }
    v.altCd = 0.22;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const hit = this.world.raycast(this.camera.position, dir, 500, p);
    const target = hit ? hit.point : this.camera.position.clone().addScaledVector(dir, 500);
    this.fireRocket(from, target.sub(from).normalize(), p, { speed: 95, r: 6.5, dmg: 260, ignore: p });
    this.fx.muzzle(from);
    this.audio.rocket();
    this.noise(v.pos, 160, true);
  }

  // third-person chase camera round the vehicle
  vehicleCamera(dt, snap) {
    const v = this.vehicle, [dist, h] = v.cfg.cam, aim = this.input.aim;
    const d = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const pivot = v.pos.clone().add(new THREE.Vector3(0, h, 0));
    const want = pivot.clone().addScaledVector(d, -(aim ? dist * 0.6 : dist));
    const w = this.world;
    const gh = Math.max(w.height(want.x, want.z), w.water ?? -99) + 0.8;
    if (want.y < gh) want.y = gh;
    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, Math.min(1, dt * (v.kind === 'jet' ? 14 : 9)));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camPos.clone().add(d));
    const fov = (aim ? 38 : v.kind === 'jet' ? 74 : 66) * this.portraitZoom();
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 8 || 1);
    if (this.fx.shake > 0) {
      const s = this.fx.shake * 0.15;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.updateProjectionMatrix();
    this.audio.setListener(v.pos, this.yaw);
  }

  // the launcher: a rocket flies to where the crosshair points
  shootRocket() {
    const p = this.player, cam = this.camera, W = this.W, dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const spread = this.input.aim ? W.spreadAim : W.spreadHip;
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread;
    dir.normalize();
    // aim from the camera, launch from the muzzle
    const target = this.world.raycast(cam.position, dir, 400, p)?.point || cam.position.clone().addScaledVector(dir, 400);
    const muzzle = p.muzzleWorld(new THREE.Vector3());
    this.fireRocket(muzzle, target.clone().sub(muzzle).normalize(), p);
    this.fx.muzzle(muzzle);
    this.fx.trail(muzzle.clone().addScaledVector(dir, -1));
    this.audio.weapon('rpg');
    this.noise(p.pos, W.noise, true);
    this.pitch = Math.min(0.75, this.pitch + W.recoil);
  }

  updateProjectiles(dt) {
    for (const g of this.projectiles) {
      if (g.kind === 'rocket' || g.kind === 'bomb') {
        g.vel.y -= (g.kind === 'bomb' ? 9.8 : 1.2) * dt;
        const step = g.vel.length() * dt, dir = g.vel.clone().normalize();
        const res = this.world.raycast(g.pos, dir, step, g.ignore);
        if (res) { g.pos.copy(res.point).addScaledVector(dir, -0.2); g.fuse = 0; } else g.pos.addScaledVector(g.vel, dt);
        if ((g.life -= dt) <= 0) g.fuse = 0;
        g.obj.position.copy(g.pos);
        g.obj.lookAt(g.pos.clone().add(g.vel));
        if (g.kind === 'rocket' && (g.trailT = (g.trailT || 0) - dt) <= 0) { g.trailT = 0.03; this.fx.trail(g.pos); }
        if (g.fuse <= 0) { this.scene.remove(g.obj); this.explode(g.pos, g.r, g.dmg, g.source); }
        continue;
      }
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
        if (g.kind === 'smoke') this.addSmoke(g.pos);
        else this.explode(g.pos, 7.5, 220, this.player);
      }
    }
    this.projectiles = this.projectiles.filter((g) => g.fuse > 0);
  }

  explode(pos, radius, damage, source) {
    if (this.net.active) {
      const m = { t: 'boom', p: pos.toArray().map((v) => Math.round(v * 100) / 100), r: radius, d: damage };
      if (this.net.role === 'guest' && source === this.player) {
        this.fx.explosion(pos);
        this.audio.explosion(pos);
        this.fx.shake = Math.max(this.fx.shake, 1.2 - pos.distanceTo(this.player.pos) / 40);
        this.net.send(m);
        return;
      }
      this.net.send(m);
    }
    this.fx.explosion(pos);
    this.audio.explosion(pos);
    this.fx.shake = Math.max(this.fx.shake, 1.2 - pos.distanceTo(this.player.pos) / 40);
    const from = pos.clone().add(new THREE.Vector3(0, 0.4, 0));
    for (const v of this.vehicles) {
      if (!v.alive) continue;
      const d = Math.max(0, v.pos.distanceTo(from) - v.size);
      if (d < radius) v.damage(damage * 2.2 * (1 - d / radius), source, true);
    }
    for (const u of this.units) {
      if (!u.alive || u.vehicle) continue;
      const chest = u.pos.clone().add(new THREE.Vector3(0, Math.min(1, u.bodyHeight * 0.6), 0));
      const d = chest.distanceTo(from);
      if (d > radius || !this.world.lineOfSight(from, chest)) continue;
      u.damage((u.isPlayer ? damage * 0.35 : damage) * (1 - d / radius), source);
      if (u.isPlayer) this.onPlayerHit(pos);
      if (source === this.player && u.team === 'ltte' && !u.alive) this.kills++;
    }
    this.suppress(pos, radius * 1.6, 4);
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
    return this.units.filter((u) => u.team === 'army' && !u.isPlayer && !u.remote && u.tag !== 'linkup' && u.alive);
  }

  // ------------------------------------------------------------ co-op

  nearestHuman(pos) {
    let best = this.player, bd = this.player.alive ? this.player.pos.distanceTo(pos) : Infinity;
    for (const u of this.partners.values()) {
      if (!u.alive) continue;
      const d = u.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // another player's soldier, moved by the network
  addPartner(nid, name) {
    const m = this.mission, k = this.partners.size + 1;
    const pt = new Unit(this, 'army', m.player.x + 2 * k, m.player.z + 1.5, { yaw: Math.PI, name, model: 'soldier_army' });
    pt.remote = true;
    pt.tag = 'partner';
    pt.nid = nid;
    pt.name = name;
    this.partners.set(nid, pt);
    this.units.push(pt);
    return pt;
  }

  renamePartner(nid, name) {
    const u = this.partners.get(nid);
    if (u) u.name = name;
  }

  onPlayerJoined(nid, name) {
    this.onChat({ name: 'Co-op', text: `${name} joined the game` }, false, true);
  }

  saveCoopName() {
    const el = $('.coop-name');
    if (!el) return;
    this.profile.setName(cleanName(el.value || this.profile.name));
    el.value = this.profile.name;
    if (this.net.role === 'guest') this.net.send({ t: 'name', name: this.profile.name });
    if (this.net.role === 'host') {
      const r = this.net.roster.find((x) => x.nid === 'H');
      if (r) { r.name = this.profile.name; this.net.broadcast({ t: 'roster', roster: this.net.roster }); }
    }
    this.refreshCoop();
  }

  inviteText() {
    return `Join my Wanni Front co-op game, from ${this.profile.name}: ${$('.coop-link').value}`;
  }

  // the phone's share sheet (WhatsApp, Messenger, SMS…) or copy as a fallback
  async shareInvite() {
    const url = $('.coop-link').value;
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Wanni Front co-op', text: `Join my Wanni Front co-op game, from ${this.profile.name}`, url }); return; } catch { /* cancelled */ }
    }
    navigator.clipboard?.writeText(url).then(() => this.toast('Invite link copied — paste it to your friends'), () => {});
  }

  // ------------------------------------------------------------ chat

  onChat(m, mine, system = false) {
    const line = { name: m.name, text: m.text, mine, system, t: performance.now() };
    this.chatLog.push(line);
    if (this.chatLog.length > 40) this.chatLog.shift();
    if (!mine) this.audio.click?.();
    this.renderChat();
  }

  renderChat() {
    const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const html = (l) => `<div class="cl${l.system ? ' sys' : ''}${l.mine ? ' mine' : ''}"><b>${esc(l.name)}</b> ${esc(l.text)}</div>`;
    const lobby = $('.coop-chat-log');
    if (lobby) { lobby.innerHTML = this.chatLog.slice(-12).map(html).join(''); lobby.scrollTop = 1e6; }
    const hud = $('.chat-log');
    if (hud) {
      const now = performance.now();
      hud.innerHTML = this.chatLog.filter((l) => now - l.t < 12000).slice(-5).map(html).join('');
    }
  }

  sendChatFrom(el) {
    if (!el || !el.value.trim()) return;
    this.net.chat(el.value);
    el.value = '';
  }

  openChat() {
    if (!this.net.active) return;
    const box = $('.chat-box');
    box.classList.remove('hidden');
    const inp = box.querySelector('input');
    if (!this.input.touch) inp.focus();
  }

  closeChat() {
    $('.chat-box').classList.add('hidden');
    $('.chat-box input').blur();
    if (this.state === 'playing' && !this.input.touch) this.input.requestLock();
  }

  showCoop() {
    this.state = 'menu';
    $('.coop-name').value = this.profile.name;
    if (document.pointerLockElement) document.exitPointerLock();
    if (!this.net.status) this.net.setStatus('Not connected. Host a game, or open an invite link from a friend.');
    else this.net.onStatus(this.net.status);
    this.refreshCoop();
    this.show('coop');
  }

  refreshCoop() {
    const host = this.net.role === 'host';
    $('.coop-host-controls').classList.toggle('hidden', !(host && this.net.connected));
    $('[data-act="coop-host"]').classList.toggle('hidden', !!this.net.role);
    $('.coop-via-row').classList.toggle('hidden', !!this.net.role);
    $('.coop-social').classList.toggle('hidden', !this.net.role);
    const esc = (s) => String(s).replace(/[<>&]/g, '');
    $('.coop-players').innerHTML = this.net.roster.length
      ? `<b>Players ${this.net.roster.length}/${MAX_PLAYERS}:</b> ${this.net.roster.map((r) => `<span class="chip">${r.nid === 'H' ? '★ ' : ''}${esc(r.name)}${r.nid === this.net.myNid ? ' (you)' : ''}</span>`).join(' ')}`
      : '';
    $('[data-act="coop-mic"]').textContent = this.net.micOn ? '🎤 Mic ON — tap to mute' : '🎤 Turn on mic (voice chat)';
    $('[data-act="coop-mic"]').classList.toggle('on', this.net.micOn);
    $('.btn-mic')?.classList.toggle('on', this.net.micOn);
    this.renderChat();
    $('.coop-mission').innerHTML = MISSIONS.map((m, i) => (i <= this.profile.data.unlocked ? `<option value="${i}">${i + 1}. ${m.name} — ${m.date}</option>` : '')).join('');
  }

  coopHostStart(i) {
    if (!this.net.active) return;
    this.startMission(i);
    this.net.send({ t: 'start', mission: i });
    this.beginMission();
  }

  coopStart(i) {
    this.audio.init();
    this.startMission(i);
    this.beginMission();
  }

  unitByNid(nid) {
    if (nid === this.player.nid) return null;
    return this.units.find((u) => u.nid === nid) || null;
  }

  // guest: a unit the host created after the mission began (reinforcements)
  spawnRemote(nid, team, x, z, tag) {
    if (typeof nid !== 'number') {
      // another player who joined after this mission was set up
      if (nid === this.net.myNid || this.partners.has(nid) || !this.net.roster.some((r) => r.nid === nid)) return null;
      return this.addPartner(nid, this.net.nameOf(nid));
    }
    const u = new Unit(this, team, x, z, { tag, index: 50 });
    u.nid = nid;
    this.units.push(u);
    return u;
  }

  partnerShot(m, from) {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    if (!m.quiet || Math.random() < 0.3) this.fx.tracer(a, b);
    this.audio.shot(a, false);
    const pt = this.partners.get(from);
    if (pt) this.noise(pt.pos, m.noise, true);
    this.suppress(b, 2.5, 1.2);
  }

  partnerHit(m, from) {
    const u = this.units.find((x) => x.nid === m.nid);
    const src = this.partners.get(from) || null;
    if (!u || !u.alive) return;
    if (u.team === 'army') { if (!u.remote) u.damage(m.dmg * 0.5, src); return; }
    if (u.team === 'civ') {
      if (m.aimed) u.damage(40, src);
      this.civIncidents++;
      this.net.send({ t: 'toast', text: 'HOLD FIRE — civilians!', big: true });
      return;
    }
    u.damage(m.dmg, src);
    if (!u.alive && u.team === 'ltte') this.kills++;
  }

  partnerGrenade(m, from) {
    this.explode(new THREE.Vector3(...m.p), m.r || 7.5, m.d || 220, this.partners.get(from) || null);
  }

  partnerInteract(m) {
    if (m.kind === 'revive') { const u = this.unitByNid(m.nid); if (u?.downed) this.revive(u); }
    if (m.kind === 'target') { const t = this.world.targets[m.i]; if (t && !t.done) this.completeTarget(t); }
    if (m.kind === 'alarm') { const a = this.world.alarms[m.i]; if (a && !a.disabled) this.completeAlarm(a); }
  }

  coopEnd(m) {
    if (this.state !== 'playing' || this.endTimer > 0) return;
    if (m.ok) this.missionComplete();
    else this.missionFailed(m.reason);
  }

  onPartnerLost(nid, name) {
    this.toast(`${name} has left the game`, true);
    this.onChat({ name: 'Co-op', text: `${name} left the game` }, false, true);
    const u = this.partners.get(nid);
    if (u) {
      u.remove();
      if (this.units.includes(u)) this.units.splice(this.units.indexOf(u), 1);
      this.partners.delete(nid);
    }
    // their vehicle stops where they left it
    for (const v of this.vehicles) {
      if (v.driverNid !== nid) continue;
      v.driverNid = null;
      v.driver = null;
      v.netPose = null;
      if (u) v.occupants.delete(u);
    }
    if (this.net.role === 'guest' && nid === 'H') {
      this.net.setStatus('Lost the connection to the host.');
      if (this.state === 'playing') this.missionFailed('Lost the connection to the host.');
    } else if (this.net.role === 'host' && !this.net.connected) this.net.setStatus('Everyone has left. Share the invite link again to play together.');
    this.refreshCoop();
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

  // ------------------------------------------------------------ weapon pickups

  // a fallen cadre's weapon is left on the ground and can be taken
  dropWeapon(u, id = u.weaponId || 't56', ammo = null) {
    if (!this.world || u.dropped) return;
    u.dropped = true;
    const def = WEAPONS.find((w) => w.id === id);
    const model = models[`wpn_${id}`];
    if (!def || !model) return;
    const x = u.pos.x + (Math.random() - 0.5) * 1.2, z = u.pos.z + (Math.random() - 0.5) * 1.2;
    const obj = model.clone(true);
    obj.position.set(x, this.world.height(x, z) + 0.06, z);
    obj.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2);
    this.world.group.add(obj);
    this.pickups.push({ id, x, z, obj, ammo: ammo ?? def.mag * (1 + Math.floor(Math.random() * 2)) });
    if (this.pickups.length > 40) { const old = this.pickups.shift(); this.world.group.remove(old.obj); }
  }

  nearestPickup() {
    const p = this.player.pos;
    let best = null, bd = 1.8;
    for (const k of this.pickups) {
      const d = Math.hypot(k.x - p.x, k.z - p.z);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // same weapon: take its ammunition; another weapon: swap it into its slot
  pickUp(pk) {
    const slot = SLOT[pk.id], cur = this.weapons[slot], def = WEAPONS.find((w) => w.id === pk.id);
    this.wstate[this.wi] = { ammo: this.ammo, reserve: this.reserve };
    this.pickups.splice(this.pickups.indexOf(pk), 1);
    this.world.group.remove(pk.obj);
    if (cur.id === pk.id) {
      const st = this.wstate[slot];
      st.reserve = Math.min(def.reserve * 2, st.reserve + pk.ammo);
      this.toast(`+${pk.ammo} rounds (${def.name})`);
    } else {
      const st = this.wstate[slot];
      this.dropWeapon({ pos: this.player.pos }, cur.id, st.ammo + st.reserve);
      this.weapons[slot] = { ...def };
      this.wstate[slot] = { ammo: Math.min(def.mag, pk.ammo), reserve: Math.max(0, pk.ammo - def.mag) };
      this.toast(`Picked up the ${def.name}`);
    }
    if (slot === this.wi) ({ ammo: this.ammo, reserve: this.reserve } = this.wstate[slot]);
    if (slot !== this.wi) this.switchWeapon(slot);
    else { this.reloading = 0; this.showWeapon(); }
    this.audio.click();
  }

  completeTarget(t) {
    if (this.net.active && this.net.role === 'guest') {
      this.net.send({ t: 'interact', kind: 'target', i: this.world.targets.indexOf(t) });
      if (t.plant) this.toast('Charge set — move away! (4 s)');
      t.done = true;
      return;
    }
    t.done = true;
    if (t.plant) { t.pending = true; this.toast('Charge set — move away! (4 s)'); this.charges.push({ target: t, timer: 4 }); }
    else this.toast(t.doneText || `${t.label} done`, true);
    if (this.net.active) this.net.send({ t: 'toast', text: t.plant ? 'Charge set — move away!' : t.doneText || `${t.label} done`, big: !t.plant });
  }

  completeAlarm(a) {
    a.disabled = true;
    if (a.triggered) this.audio.siren(false);
    this.toast('Alarm sabotaged', true);
    if (this.net.active && this.net.role === 'guest') this.net.send({ t: 'interact', kind: 'alarm', i: this.world.alarms.indexOf(a) });
    else if (this.net.active) this.net.send({ t: 'toast', text: 'Alarm sabotaged', big: true });
  }

  findInteraction() {
    const o = this.currentObjective(), p = this.player.pos;
    const near = (x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
    if (this.vehicle) {
      const v = this.vehicle;
      return { label: v.kind === 'jet' && v.airborne ? 'Return to base' : 'Get out', time: 0.4, done: () => this.exitVehicle() };
    }
    const down = this.units.find((u) => u.downed && u.alive && u.team === 'army' && near(u.pos.x, u.pos.z, 2.2));
    if (down) return { label: `Patch up ${down.name || 'the wounded soldier'}`, time: 3, done: () => this.revive(down) };
    if (o?.type === 'interact') {
      const t = this.world.targets.find((t) => t.tag === o.tag && !t.done && near(t.x, t.z, t.obj ? 7 : 3.5));
      if (t) {
        return {
          label: `${t.plant ? 'Plant charge on' : 'Operate'} ${t.label}`, time: t.time,
          done: () => this.completeTarget(t),
        };
      }
    }
    const a = this.world.alarms.find((a) => !a.disabled && near(a.x, a.z, 2.6));
    if (a) {
      return {
        label: 'Sabotage the alarm', time: 3,
        done: () => this.completeAlarm(a),
      };
    }
    const pk = this.nearestPickup();
    if (pk) {
      const slot = SLOT[pk.id], cur = this.weapons[slot], def = WEAPONS.find((w) => w.id === pk.id);
      return {
        label: cur.id === pk.id ? `Take ammunition (${def.name})` : `Take the ${def.name} (drop your ${cur.name})`,
        time: 0.6, done: () => this.pickUp(pk),
      };
    }
    const veh = this.nearestVehicle();
    if (veh) return { label: `Board the ${veh.name}${this.input.touch ? '' : ' (or press F)'}`, time: 0.5, done: () => this.enterVehicle(veh) };
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

  // visualOnly: the guest shows a blast the host has already resolved
  detonate(t, visualOnly = false) {
    const pos = new THREE.Vector3(t.x, Math.max(t.y, this.world.water ?? t.y), t.z);
    if (t.obj) this.world.group.remove(t.obj);
    t.blown = true;
    this.world.colliders = this.world.colliders.filter((c) => c.ref !== t);
    if (visualOnly) { this.fx.explosion(pos); this.audio.explosion(pos); this.killfeed(t.blast || `${t.label} destroyed`); return; }
    this.explode(pos, 7, 200, this.player);
    t.pending = false;
    this.killfeed(t.blast || `${t.label} destroyed`);
  }

  // ------------------------------------------------------------ camera

  // widen the vertical field of view on portrait screens so the view is not
  // cropped to a narrow slice (up to about 1.45x)
  portraitZoom() {
    const a = this.camera.aspect;
    return a < 0.9 ? Math.min(1.45, Math.sqrt(0.9 / a) * 1.05) : 1;
  }

  updateCamera(dt, snap = false) {
    if (this.vehicle) { this.vehicleCamera(dt, snap); return; }
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
      fov = (70 / this.opticZoom) * this.portraitZoom();
    } else {
      p.obj.visible = true;
      const aim = inp.aim && p.alive;
      const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
      const pivot = p.pos.clone().add(new THREE.Vector3(0, p.alive ? p.eyeHeight + 0.23 : 0.8, 0));
      // on a tall, narrow phone screen: soldier in the middle, camera further back
      const portrait = this.camera.aspect < 0.9;
      const dist = (aim ? 1.6 : p.stance === 'prone' ? 2.5 : 3.2) + (portrait ? (aim ? 0.4 : 0.7) : 0);
      const side = (aim ? 0.6 : 0.85) * (portrait ? 0.35 : 1);
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
      fov = (aim ? 48 : 70) * this.portraitZoom();
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

  // co-op: name tags over other players, who is talking, recent chat
  updateCoopHUD() {
    const on = this.net.active && this.partners.size > 0;
    $('#hud').classList.toggle('coop', !!this.net.role);
    const tags = $('.nametags');
    if (!on) { tags.innerHTML = ''; $('.voice').textContent = ''; return; }
    const W = window.innerWidth, H = window.innerHeight, v = new THREE.Vector3();
    let html = '';
    for (const u of this.partners.values()) {
      if (!u.alive) continue;
      v.set(u.pos.x, u.pos.y + u.bodyHeight + 0.55, u.pos.z).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      const d = Math.round(u.pos.distanceTo(this.player.pos));
      html += `<div class="ntag" style="left:${((v.x + 1) / 2) * W}px;top:${((1 - v.y) / 2) * H}px">${u.name}<small>${d} m · ${Math.max(0, Math.round(u.hp))}%</small></div>`;
    }
    tags.innerHTML = html;
    const talk = this.net.talking();
    $('.voice').innerHTML = `${this.net.micOn ? '<span class="mic-on">🎤 ON</span> ' : ''}${talk.map((n) => `🔊 ${n}`).join(' ')}`;
    if (Math.floor(this.time * 2) !== this.lastChatRender) { this.lastChatRender = Math.floor(this.time * 2); this.renderChat(); }
  }

  updateVehicleHUD() {
    const v = this.vehicle;
    if (!v) return;
    $('.vh-name').textContent = v.name.toUpperCase();
    $('.vh-hp div').style.width = `${Math.max(0, (v.hp / v.cfg.hp) * 100)}%`;
    $('.vh-heat div').style.width = `${v.heat * 100}%`;
    $('.vh-heat').classList.toggle('hot', v.overheat > 0);
    const kmh = Math.round(Math.abs(v.speed) * 3.6);
    const alt = v.kind === 'air' || v.kind === 'jet' ? ` · altitude ${Math.max(0, Math.round(v.pos.y - Math.max(this.world.height(v.pos.x, v.pos.z), this.world.water ?? -99)))} m` : '';
    const alt2 = v.cfg.alt ? `<br>${v.cfg.alt.name}: ${v.altAmmo} (${this.input.touch ? 'GREN' : 'G'})` : '';
    const occ = [...v.occupants].filter((u) => !u.isPlayer).length;
    $('.vh-info').innerHTML = `${kmh} km/h${alt}<br>${v.cfg.gun.name}${alt2}${occ ? `<br>${occ} soldier${occ > 1 ? 's' : ''} aboard` : ''}`;
    let warn = '';
    if (v.kind === 'jet' && v.lowAlt) warn = 'PULL UP';
    else if (v.overheat > 0) warn = 'GUN OVERHEATED';
    else if (v.hp < v.cfg.hp * 0.3) warn = 'HULL CRITICAL';
    else if (v.kind === 'air' && v.spin < 0.75) warn = 'ROTOR SPINNING UP…';
    $('.vh-warn').textContent = warn;
  }

  updateHUD() {
    this.updateCoopHUD();
    this.updateVehicleHUD();
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
    const allies = this.units.filter((u) => u.team === 'army' && !u.isPlayer && u.tag !== 'linkup' && !u.remote);
    const roleTag = { marksman: ' (marksman)', gunner: ' (gunner)', medic: ' (medic)' };
    const partnerLine = [...this.partners.values()].map((u) => `<span style="color:#7fc8e8">${u.name} (co-op) · ${Math.max(0, Math.round(u.hp))}%</span><br>`).join('');
    $('.squad').innerHTML = partnerLine + allies.map((a) => `${a.name}${roleTag[a.role] || ''} · ${(a.order || 'follow').toUpperCase()}`
      + `${a.role === 'medic' ? (a.patient ? ' · treating' : ` · ${a.kits} dressings`) : ''}${a.downed ? ' · <b class="down">DOWN</b>' : a.hp < 60 ? ' · wounded' : ''}${a.vehicle ? ' · mounted' : ''}`).join('<br>');

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
    const ex = this.explosives;
    $('.ammo-gren').innerHTML = Object.entries(THROWABLES).map(([k, n]) => `<span class="${k === this.throwType ? 'on' : ''}">${n.split(' ')[0].toUpperCase()} ${ex[k]}</span>`).join(' ')
      + `<small>${this.input.touch ? '⇄ switch · GREN use' : 'Y switch · G use'}${this.c4Placed.length ? ` · ${this.input.touch ? 'DET' : 'U'} detonate ${this.c4Placed.length}` : ''}</small>`;
    if (this.wbarKey !== `${this.wi}:${this.ammo}:${this.reserve}:${this.weapons.map((w) => w.id).join()}`) this.renderWeaponBar();
    document.body.classList.toggle('scoped', this.isScoped() || (this.binos && p.alive));
    $('.zoom-level').textContent = `${this.opticZoom}×`;
    $('.stance-ind').textContent = `${p.stance.toUpperCase()}${p.towerCenter ? ' · TOWER' : ''}${this.world.inBush(p.pos.x, p.pos.z) ? ' · IN COVER' : ''}`;
    // set display directly as well: some phone browsers kept showing the scope
    const sc = $('.scope'), bn = $('.binos');
    sc.classList.toggle('on', !!scoped);
    sc.style.display = scoped ? 'block' : 'none';
    bn.classList.toggle('on', !!binos);
    bn.style.display = binos ? 'block' : 'none';
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
    const was = this.mapOpen;
    this.mapOpen = force ?? !this.mapOpen;
    $('#map').classList.toggle('hidden', !this.mapOpen);
    if (this.mapOpen) this.drawMap();
    // the mouse is needed to plan on the map; give it back afterwards
    if (this.mapOpen && !was && document.pointerLockElement) document.exitPointerLock();
    if (!this.mapOpen && was && this.state === 'playing') this.input.requestLock();
  }

  // plan on the map: send Bravo team, or the whole section, to the tapped spot
  mapOrder(e) {
    if (!this.world || this.state !== 'playing') return;
    const cv = $('#map canvas'), r = cv.getBoundingClientRect(), S = this.world.size;
    const x = ((e.clientX - r.left) / r.width) * 2 * S - S, z = ((e.clientY - r.top) / r.height) * 2 * S - S;
    if (Math.abs(x) > S || Math.abs(z) > S || this.world.isWater(x, z, 0.2)) { this.toast('Pick a spot on land'); return; }
    const point = new THREE.Vector3(x, this.world.height(x, z), z);
    if (this.mapMode === 'strike') {
      this.strikeMark = point;
      this.toast(`Strike target marked (${Math.round(point.distanceTo(this.player.pos))} m) — call artillery or an air strike (${this.input.touch ? 'CALL' : 'L'})`, true);
      this.drawMap();
      return;
    }
    const allies = this.squadAllies();
    const group = this.mapMode === 'all' ? allies : allies.length > 1 ? allies.filter((a) => a.followSlot % 2 === 1) : allies;
    if (!group.length) return;
    group.forEach((a, i) => {
      a.order = 'move';
      a.orderPos = point.clone().add(new THREE.Vector3((i - (group.length - 1) / 2) * 2.5, 0, 0));
    });
    if (this.mapMode === 'all') this.squadOrders.mode = 'hold';
    this.squadOrders.bravo = 'move';
    const dist = Math.round(point.distanceTo(this.player.pos));
    this.radio.say([[this.speakerKey(group[0]), `${this.mapMode === 'all' ? 'Section' : 'Bravo'} moving to the marked spot — ${dist} metres.`]]);
    this.drawMap();
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
    const vg = { ground: '▣', air: '✈', jet: '✈', water: '⛴' };
    for (const v of this.vehicles) if (v !== this.vehicle) glyph(v.pos.x, v.pos.z, vg[v.kind], v.alive ? '#9fd0ff' : '#555', 15);
    if (this.strikeMark) glyph(this.strikeMark.x, this.strikeMark.z, '⊕', '#ff6a3a', 24);
    // planned moves
    ctx.strokeStyle = 'rgba(155, 209, 106, 0.7)';
    ctx.setLineDash([4, 4]);
    for (const a of this.squadAllies()) {
      if (a.order !== 'move' || !a.orderPos) continue;
      const [ax, ay] = toMap(a.pos.x, a.pos.z), [bx, by] = toMap(a.orderPos.x, a.orderPos.z);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      glyph(a.orderPos.x, a.orderPos.z, '✕', '#9bd16a', 14);
    }
    ctx.setLineDash([]);
    const [px, py] = toMap(this.player.pos.x, this.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.yaw + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    $('.map-info').innerHTML = `<b>${this.mission.name.toUpperCase()}</b> · ${o ? o.text : ''}<br><span>▲ you · ● squad · ✕ planned move · ◆ marked hostile · ⚑ alarm · ▲ tower · ✚ supplies · ◇ objective · ▣ ✈ ⛴ vehicles · ⊕ strike target · N is up</span><br><span>${this.mapMode === 'strike' ? 'Tap or click the map to mark a target for artillery or an air strike (⊕).' : `Tap or click the map to send ${this.mapMode === 'all' ? 'the whole section' : 'Bravo team'} there.`}</span>`;
    $('.map-mode').textContent = { all: 'Orders: whole section', strike: 'Orders: strike target', bravo: 'Orders: Bravo team' }[this.mapMode] || 'Orders: Bravo team';
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
    this.net.update(dt);
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
    this.frameDt = dt;
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
      // the co-op guest only draws the host's units; the host runs their AI
      const guest = this.net.active && this.net.role === 'guest';
      for (const u of this.units) if (!u.isPlayer) { if (guest) u.netSync(dt); else u.update(dt); }
      for (const v of this.vehicles) {
        if (v === this.vehicle) continue;
        if (v.netPose && (guest || v.driverNid != null)) v.netSync(dt);
        else v.idle(dt);
      }
      this.support.update(dt);
      for (const sm of this.world.smokes) sm.t -= dt;
      this.world.smokes = this.world.smokes.filter((sm) => sm.t > 0);
      this.alertLevel = Math.max(0, this.alertLevel - dt);
      this.updateShelling(dt);
      this.radio.update(dt);
      if (!this.flags.contact && this.units.some((u) => u.team === 'ltte' && u.alive && u.state === 'combat')) this.storyEvent('contact');
      for (const c of this.charges) if ((c.timer -= dt) <= 0) this.detonate(c.target);
      this.charges = this.charges.filter((c) => c.timer > 0);
      if (!guest) this.checkObjective();
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
    const join = new URLSearchParams(location.search).get('join');
    if (join) {
      // opened from a co-op invite link
      game.profile.data.seenPrologue = true;
      game.showCoop();
      game.net.join(join, new URLSearchParams(location.search).get('via'));
      game.refreshCoop();
      return;
    }
    game.state = 'start';
    game.show('start');
    game.focusFirst();
  })
  .catch((err) => {
    console.error(err);
    $('.loading-text').textContent = `Could not load models: ${err.message}`;
  });
