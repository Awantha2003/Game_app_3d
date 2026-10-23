// Procedural sound effects with the Web Audio API (no audio files needed).

export class Audio {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setListener(pos, yaw) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z; this.listener.yaw = yaw;
  }

  // gain and stereo pan for a world position
  spatial(pos) {
    if (!pos) return { gain: 1, pan: 0, dist: 0 };
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
    const dist = Math.hypot(dx, dz);
    const yaw = this.listener.yaw;
    // listener right vector is (-cos yaw, sin yaw)
    const pan = dist > 0.5 ? Math.max(-1, Math.min(1, (dx * -Math.cos(yaw) + dz * Math.sin(yaw)) / dist)) : 0;
    return { gain: 1 / (1 + dist * 0.06), pan: pan * 0.8, dist };
  }

  burst({ pos, dur = 0.2, freq = 1200, q = 0.7, vol = 1, type = 'lowpass', attack = 0.002, thump = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const sp = this.spatial(pos);
    const out = ctx.createGain();
    out.gain.value = vol * sp.gain;
    let node = out;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan;
      out.connect(p);
      node = p;
    }
    node.connect(this.master);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq * (sp.dist > 60 ? 0.4 : 1);
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    if (thump) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.setValueAtTime(thump, t);
      o.frequency.exponentialRampToValueAtTime(thump * 0.3, t + dur);
      og.gain.setValueAtTime(0.8, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  shot(pos, own) {
    if (own) this.burst({ dur: 0.16, freq: 2600, vol: 0.55, thump: 140 });
    else this.burst({ pos, dur: 0.22, freq: 1800, vol: 0.7, thump: 110 });
  }

  // gunshot by weapon type; pos = null for the player's own weapon
  weapon(kind, pos = null) {
    if (kind === 'pistol') this.burst({ pos, dur: 0.07, freq: 900, q: 1.2, vol: 0.35, thump: 120 });
    else if (kind === 'svd') this.burst({ pos, dur: 0.5, freq: 2200, vol: pos ? 0.9 : 0.75, thump: 75 });
    else this.shot(pos, !pos);
  }

  // rising and falling camp siren
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator(), depth = this.ctx.createGain(), g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 700;
      lfo.frequency.value = 0.45;
      depth.gain.value = 260;
      lfo.connect(depth).connect(o.frequency);
      g.gain.value = 0.05;
      o.connect(g).connect(this.master);
      o.start();
      lfo.start();
      this.sirenOsc = [o, lfo];
    } else if (!on && this.sirenOsc) {
      for (const n of this.sirenOsc) n.stop();
      this.sirenOsc = null;
    }
  }

  explosion(pos) {
    this.burst({ pos, dur: 1.8, freq: 380, vol: 2.2, thump: 60, attack: 0.005 });
  }

  whiz() {
    this.burst({ dur: 0.12, freq: 3500, q: 6, type: 'bandpass', vol: 0.18, attack: 0.04 });
  }

  click() {
    this.burst({ dur: 0.05, freq: 4000, q: 2, type: 'bandpass', vol: 0.4 });
  }

  hitmark() {
    this.burst({ dur: 0.05, freq: 6000, q: 4, type: 'bandpass', vol: 0.25 });
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // short squelch + beep when someone speaks on the radio
  radio() {
    this.burst({ dur: 0.08, freq: 2400, q: 1.5, type: 'bandpass', vol: 0.12 });
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = 1450;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
  }

  thunder() {
    this.burst({ dur: 3.5, freq: 160, vol: 1.6, thump: 38, attack: 0.25 });
  }

  // rain bed for cinematics and wet missions
  rain(on) {
    if (!this.ctx) return;
    if (on && !this.rainSrc) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.value = 0.18;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      this.rainSrc = src;
    } else if (!on && this.rainSrc) {
      this.rainSrc.stop();
      this.rainSrc = null;
    }
  }

  // two-note cue for mission start / completion
  stinger(up = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = up ? [220, 330, 440] : [330, 262, 196];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.18 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 1.2);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 1.3);
    });
  }

  startAmbience() {
    // soft wind / insect bed
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }
}
