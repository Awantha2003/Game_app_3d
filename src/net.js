// Two-player co-op over WebRTC (PeerJS). The host runs the whole simulation:
// AI, objectives, civilians and damage. The guest moves and shoots its own
// soldier, sends that to the host, and draws the world from the host's
// snapshots. Invite link: ?join=<host id>. Optional ?peer=host:port selects
// a self-hosted PeerServer (used by the automated test).

import Peer from 'peerjs';
import * as THREE from 'three';

const SEND_HZ = 15;
const TIMEOUT = 20; // seconds of silence before the partner counts as gone (loading a mission can take a while)
const STANCES = ['stand', 'crouch', 'prone'];
const r2 = (v) => Math.round(v * 100) / 100;

function peerOptions() {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return {};
  const [host, port] = q.split(':');
  return { host, port: Number(port) || 9000, path: '/', secure: false };
}

export class Net {
  constructor(game) {
    this.game = game;
    this.role = null; // 'host' | 'guest'
    this.peer = null;
    this.conn = null;
    this.connected = false;
    this.lastHeard = 0;
    this.sendTimer = 0;
    this.status = '';
    this.onStatus = null;
  }

  get active() {
    return this.connected && !!this.role;
  }

  setStatus(text) {
    this.status = text;
    this.onStatus?.(text);
  }

  // ------------------------------------------------------------- lobby

  host() {
    this.leave();
    this.role = 'host';
    this.setStatus('Creating a game…');
    this.peer = new Peer(undefined, peerOptions());
    this.peer.on('open', (id) => {
      this.id = id;
      this.setStatus('Waiting for your partner to open the invite link…');
      this.onInvite?.(this.inviteLink());
    });
    this.peer.on('connection', (conn) => {
      if (this.conn) { conn.close(); return; }
      this.attach(conn);
    });
    this.peer.on('error', (e) => this.setStatus(`Connection error: ${e.type || e.message}`));
  }

  join(id) {
    this.leave();
    this.role = 'guest';
    this.setStatus('Connecting to the host…');
    this.peer = new Peer(undefined, peerOptions());
    this.peer.on('open', () => this.attach(this.peer.connect(id, { reliable: true })));
    this.peer.on('error', (e) => this.setStatus(`Could not join: ${e.type || e.message}`));
  }

  inviteLink() {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('join', this.id);
    const peer = new URLSearchParams(location.search).get('peer');
    if (peer) u.searchParams.set('peer', peer);
    return u.toString();
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.connected = true;
      this.lastHeard = performance.now() / 1000;
      this.setStatus(this.role === 'host' ? 'Partner connected. Choose a mission and start.' : 'Connected. Waiting for the host to start a mission…');
      this.send({ t: 'hello', name: this.game.profile.rank.short });
      this.onConnect?.();
    });
    conn.on('data', (m) => this.receive(m));
    conn.on('close', () => this.dropped());
    conn.on('error', () => this.dropped());
  }

  leave() {
    try { this.conn?.close(); } catch { /* already closed */ }
    try { this.peer?.destroy(); } catch { /* already destroyed */ }
    this.peer = null;
    this.conn = null;
    this.connected = false;
    this.role = null;
  }

  dropped() {
    if (!this.connected) return;
    this.connected = false;
    this.conn = null;
    this.game.onPartnerLost();
  }

  send(m) {
    if (this.conn && this.conn.open) this.conn.send(m);
  }

  // ------------------------------------------------------------- messages

  receive(m) {
    const g = this.game;
    this.lastHeard = performance.now() / 1000;
    switch (m.t) {
      case 'hello': this.partnerName = m.name; break;
      case 'start': if (this.role === 'guest') g.coopStart(m.mission); break;
      case 'snap': if (this.role === 'guest') this.applySnapshot(m); break;
      case 'me': if (this.role === 'host') this.applyPartner(m); break;
      case 'fx': g.fx.tracer(new THREE.Vector3(...m.a), new THREE.Vector3(...m.b), m.c); g.audio.shot(new THREE.Vector3(...m.a), false); break;
      case 'shot': if (this.role === 'host') g.partnerShot(m); break;
      case 'hit': if (this.role === 'host') g.partnerHit(m); break;
      case 'boom': if (this.role === 'host') g.partnerGrenade(m); else g.fx.explosion(new THREE.Vector3(...m.p)); break;
      case 'interact': if (this.role === 'host') g.partnerInteract(m); break;
      case 'dmg': if (this.role === 'guest' && g.player?.alive) { g.player.hp -= m.v; g.onPlayerHit(null); if (g.player.hp <= 0) g.player.die(null); } break;
      case 'dead': if (this.role === 'host') g.missionFailed('Your partner was killed in action.'); break;
      case 'end': if (this.role === 'guest') g.coopEnd(m); break;
      case 'radio': g.radio.say(m.lines); break;
      case 'toast': g.toast(m.text, m.big); break;
      default: break;
    }
  }

  // per frame: send state and watch for a silent partner
  update(dt) {
    if (!this.connected) return;
    if (performance.now() / 1000 - this.lastHeard > TIMEOUT) { this.dropped(); return; }
    this.sendTimer -= dt;
    if (this.sendTimer > 0) return;
    this.sendTimer = 1 / SEND_HZ;
    const g = this.game;
    if (!g.world || !g.player || g.state !== 'playing' && g.state !== 'pause') { this.send({ t: 'ping' }); return; }
    if (this.role === 'host') this.send(this.snapshot());
    else {
      const p = g.player;
      this.send({ t: 'me', p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], y: r2(p.yaw), pi: r2(p.pitch), s: STANCES.indexOf(p.stance), v: r2(p.speed || 0), hp: Math.round(p.hp) });
    }
  }

  // ------------------------------------------------------------- host side

  snapshot() {
    const g = this.game;
    const units = [];
    for (const u of g.units) {
      if (u.remote) continue;
      units.push([u.nid, r2(u.pos.x), r2(u.pos.y), r2(u.pos.z), r2(u.yaw), r2(u.pitch), STANCES.indexOf(u.stance), u.alive ? 1 : 0,
        u.team === 'ltte' ? 1 : u.team === 'civ' ? 2 : 0, u.tag || '', u.state === 'wait' ? 1 : 0, r2(u.speed || 0), u.marked ? 1 : 0]);
    }
    return {
      t: 'snap', units, obj: g.objIndex, sub: document.querySelector('.obj-sub')?.textContent || '',
      civ: [g.civSafe, g.civTotal], alarms: g.world.alarms.map((a) => (a.disabled ? 2 : a.triggered ? 1 : 0)),
      targets: g.world.targets.map((t) => (t.blown ? 2 : t.done ? 1 : 0)),
      alert: g.alertLevel > 0 ? 1 : 0, hpH: Math.round(g.player.hp),
    };
  }

  applyPartner(m) {
    const u = this.game.partner;
    if (!u) return;
    u.netPos = new THREE.Vector3(...m.p);
    u.yaw = m.y;
    u.pitch = m.pi;
    u.stance = STANCES[m.s] || 'stand';
    u.speed = m.v;
    u.hp = m.hp;
  }

  // ------------------------------------------------------------- guest side

  applySnapshot(m) {
    const g = this.game;
    if (!g.world || !g.player) return;
    const seen = new Set();
    for (const a of m.units) {
      const [nid, x, y, z, yaw, pitch, s, alive, team, tag, wait, speed, marked] = a;
      seen.add(nid);
      let u = g.unitByNid(nid);
      if (!u) u = g.spawnRemote(nid, team === 1 ? 'ltte' : team === 2 ? 'civ' : 'army', x, z, tag);
      if (!u) continue;
      u.netPos = new THREE.Vector3(x, y, z);
      u.yaw = yaw;
      u.pitch = pitch;
      u.stance = STANCES[s] || 'stand';
      u.speed = speed;
      u.marked = u.marked || !!marked;
      if (u.team === 'civ') u.state = wait ? 'wait' : 'flee';
      if (u.alive && !alive) { u.alive = false; u.hp = 0; u.deadTime = 0; if (u.team === 'ltte') { g.dropWeapon(u); g.killfeed('LTTE cadre neutralised'); } }
    }
    for (const u of [...g.units]) {
      if (!u.isPlayer && !u.remote && u.nid !== undefined && !seen.has(u.nid) && !u.alive) { u.remove(); g.units.splice(g.units.indexOf(u), 1); }
    }
    if (m.obj !== g.objIndex) g.activateObjective(m.obj);
    document.querySelector('.obj-sub').textContent = m.sub;
    [g.civSafe, g.civTotal] = m.civ;
    m.alarms.forEach((s, i) => { const a = g.world.alarms[i]; if (a) { a.disabled = s === 2; a.triggered = s === 1; } });
    m.targets.forEach((s, i) => {
      const t = g.world.targets[i];
      if (!t || !s) return;
      t.done = true;
      if (s === 2 && !t.blown) g.detonate(t, true);
    });
    g.alertLevel = m.alert ? 8 : 0;
    if (g.partner) g.partner.hp = m.hpH;
  }
}
