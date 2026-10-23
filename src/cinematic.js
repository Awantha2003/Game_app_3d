// Opening cinematic: rain and thunder, a map of Sri Lanka with the campaign's
// operations, a fly-over of the squad at Mavil Aru and the title reveal.
// Skippable at any time (button, Esc, Space or Enter).

import * as THREE from 'three';
import { CHARACTERS, ISLAND, MANNAR, PROLOGUE, SQUAD_INTRO } from './story.js';

const $ = (s) => document.querySelector(s);
const proj = (lat, lon) => [(lon - 79.55) * 100, (9.95 - lat) * 100];
const path = (pts) => `M${pts.map(([la, lo]) => proj(la, lo).map((v) => v.toFixed(1)).join(',')).join('L')}Z`;

export class Prologue {
  constructor(game) {
    this.game = game;
    this.el = $('#prologue');
    this.active = false;
    this.onKey = (e) => {
      if (['Escape', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); this.skip(); }
    };
  }

  play(onDone) {
    const g = this.game;
    this.onDone = onDone;
    this.active = true;
    this.skipped = false;
    this.camT = -1;
    g.audio.init();
    g.audio.rain(true);
    g.startMission(0);
    g.state = 'cinematic';
    g.cinematic = this;
    g.show(null);
    $('#hud').classList.add('hidden');
    $('#touch').classList.add('hidden');
    this.el.innerHTML = `
      <canvas class="pro-rain"></canvas>
      <div class="pro-dark"></div>
      <div class="pro-lines"></div>
      <svg class="pro-map" viewBox="0 0 250 420" aria-hidden="true">
        <path class="pro-island" d="${path(ISLAND)} ${path(MANNAR)}" />
        <g class="pro-pins"></g>
      </svg>
      <div class="pro-caption"></div>
      <div class="pro-card"></div>
      <div class="pro-title">
        <div class="pro-title-main">WANNI FRONT</div>
        <div class="pro-title-si">වන්නි සටන් බිම</div>
        <div class="pro-title-sub">Eelam War IV · 2006 – 2009</div>
      </div>
      <button class="pro-skip">Skip ▸▸</button>`;
    this.el.classList.remove('hidden');
    this.el.querySelector('.pro-skip').addEventListener('click', () => this.skip());
    window.addEventListener('keydown', this.onKey);
    this.startRain();
    this.run();
  }

  wait(sec) {
    return new Promise((res) => {
      this.resolve = res;
      this.timeout = setTimeout(res, sec * 1000);
    });
  }

  async run() {
    const q = (s) => this.el.querySelector(s);
    const g = this.game;

    // 1. darkness, rain and thunder
    await this.wait(1.2);
    for (const [i, line] of PROLOGUE.opening.entries()) {
      if (this.skipped) return;
      const d = document.createElement('div');
      d.textContent = line;
      q('.pro-lines').appendChild(d);
      if (i === 1) g.audio.thunder();
      await this.wait(2);
    }
    if (this.skipped) return;
    q('.pro-lines').classList.add('out');
    await this.wait(1);

    // 2. the map and the six operations
    if (this.skipped) return;
    q('.pro-map').classList.add('on');
    await this.wait(2.6);
    const pins = q('.pro-pins');
    for (const p of PROLOGUE.places) {
      if (this.skipped) return;
      const [x, y] = proj(p.lat, p.lon);
      const a = p.anchor || 'start';
      pins.insertAdjacentHTML('beforeend', `<g class="pin"><circle cx="${x}" cy="${y}" r="3.2"/>
        <text x="${x + p.dx}" y="${y + p.dy}" text-anchor="${a}">${p.name}</text>
        <text class="d" x="${x + p.dx}" y="${y + p.dy + 9}" text-anchor="${a}">${p.date}</text></g>`);
      await this.wait(1.1);
    }
    for (const line of PROLOGUE.history) {
      if (this.skipped) return;
      this.caption(line, 'HISTORY');
      await this.wait(4.6);
    }
    if (this.skipped) return;
    g.audio.thunder();
    q('.pro-map').classList.remove('on');
    q('.pro-dark').classList.add('out');
    this.caption(PROLOGUE.fiction, 'FICTION');

    // 3. fly-over and squad introductions
    this.camT = 0;
    await this.wait(4.5);
    for (const key of SQUAD_INTRO) {
      if (this.skipped) return;
      const c = CHARACTERS[key];
      this.caption('');
      const card = q('.pro-card');
      card.innerHTML = `<div class="pc-name" style="color:${c.color}">${c.name}</div><div class="pc-role">${c.role}</div><div class="pc-bio">${c.bio}</div>`;
      card.classList.add('on');
      await this.wait(3.2);
      card.classList.remove('on');
      await this.wait(0.4);
    }
    if (this.skipped) return;
    this.caption('And you — Second Lieutenant Awan, eleven days in command.', 'FICTION');
    await this.wait(3.4);

    // 4. title
    if (this.skipped) return;
    this.caption('');
    q('.pro-dark').classList.remove('out');
    q('.pro-title').classList.add('on');
    g.audio.thunder();
    await this.wait(5);
    if (!this.skipped) this.finish();
  }

  caption(text, label) {
    const c = this.el.querySelector('.pro-caption');
    c.innerHTML = text ? `${label ? `<span class="pc-tag">${label}</span>` : ''}<span></span>` : '';
    if (text) c.lastChild.textContent = text;
    c.classList.toggle('on', !!text);
  }

  // camera path over the Mavil Aru paddy fields towards the squad
  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    if (this.camT < 0) {
      g.camera.position.set(p.x - 40, p.y + 40, p.z - 70);
      g.camera.lookAt(p.x, p.y, p.z);
      return;
    }
    this.camT = Math.min(1, this.camT + dt / 18);
    const t = this.camT * this.camT * (3 - 2 * this.camT);
    g.camera.position.set(p.x - 22 + 26 * t, p.y + 26 - 22.5 * t, p.z - 48 + 39 * t);
    g.camera.lookAt(new THREE.Vector3(p.x, p.y + 1.4, p.z + 3));
    g.camera.fov = 55;
    g.camera.updateProjectionMatrix();
  }

  startRain() {
    const cv = this.el.querySelector('.pro-rain');
    const ctx = cv.getContext('2d');
    const drops = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
    const tick = () => {
      if (!this.active) return;
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      ctx.strokeStyle = 'rgba(190,205,220,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of drops) {
        d.y += 0.022 * d.s;
        d.x -= 0.004 * d.s;
        if (d.y > 1) { d.y = -0.05; d.x = Math.random() * 1.1; }
        const x = d.x * cv.width, y = d.y * cv.height;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4 * d.s, y + 22 * d.s);
      }
      ctx.stroke();
      requestAnimationFrame(tick);
    };
    tick();
  }

  skip() {
    if (!this.active) return;
    this.skipped = true;
    clearTimeout(this.timeout);
    this.resolve?.();
    this.finish();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this.onKey);
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    this.game.audio.rain(false);
    this.game.cinematic = null;
    this.game.camera.fov = 70;
    this.game.camera.updateProjectionMatrix();
    this.game.state = 'menu';
    this.onDone?.();
  }
}
