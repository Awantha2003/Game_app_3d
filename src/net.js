// Co-op for up to four players over WebRTC. The host runs the whole
// simulation: AI, objectives, civilians and damage. Each guest moves and
// shoots its own soldier, sends that to the host, and draws the world from
// the host's snapshots. Players have names, can text chat, and can talk:
// voice goes directly between every pair of players.
// Invite link: ?join=<code> (&via=p for the PeerJS server).

import Peer from 'peerjs';
import * as THREE from 'three';

export const MAX_PLAYERS = 4;
const SEND_HZ = 15;
const TIMEOUT = 20; // seconds of silence before a player counts as gone (loading a mission can take a while)
const STANCES = ['stand', 'crouch', 'prone'];
const APP_ID = 'wanni-front-coop-v1';
const r2 = (v) => Math.round(v * 100) / 100;
const now = () => performance.now() / 1000;
const param = (k) => new URLSearchParams(location.search).get(k);

// ---------------------------------------------------------------- links
// Two ways for browsers to find each other. Both carry the same messages.
//  'n' (default): Trystero over many public Nostr relays — no single server
//      has to be up. With ?relay=ws://… a self-hosted relay is used instead
//      (the automated test does this).
//  'p': PeerJS and its public cloud server ("Server 2"), retried on errors.

class TrysteroLink {
  async open(code, cb) {
    const relay = param('relay');
    const mod = relay ? await import('@trystero-p2p/ws-relay') : await import('trystero/nostr');
    const config = relay ? { appId: APP_ID, relayConfig: { urls: [relay] } } : { appId: APP_ID, relayConfig: { redundancy: 5 } };
    this.room = mod.joinRoom(config, code);
    this.selfId = mod.selfId;
    this.msg = this.room.makeAction('m');
    this.msg.onMessage = (data, ctx) => cb.data(data, ctx.peerId);
    this.room.onPeerJoin = (id) => cb.join(id);
    this.room.onPeerLeave = (id) => cb.leave(id);
    this.room.onPeerStream = (stream, id) => cb.stream(stream, id);
    cb.ready(code);
  }

  send(m, peerId) {
    this.msg?.send(m, peerId ? { target: peerId } : undefined).catch(() => {});
  }

  addStream(stream, peerId) {
    try { this.room?.addStream(stream, { target: peerId }); } catch { /* peer gone */ }
  }

  close() {
    this.room?.leave();
    this.room = null;
  }
}

class PeerJSLink {
  peerOptions() {
    const q = param('peer');
    if (!q) return {};
    const [host, port] = q.split(':');
    return { host, port: Number(port) || 9000, path: '/', secure: false };
  }

  open(code, cb, tries = 0) {
    this.cb = cb;
    this.conns = new Map();
    const peer = new Peer(undefined, this.peerOptions());
    this.peer = peer;
    peer.on('open', (id) => {
      this.selfId = id;
      if (!code) { cb.ready(id); return; }
      this.attach(peer.connect(code, { reliable: true }));
      cb.ready(code);
    });
    peer.on('connection', (conn) => this.attach(conn));
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (stream) => cb.stream(stream, call.peer));
    });
    peer.on('error', (e) => {
      // the public server drops out now and then, especially on mobile data: try again
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type) && tries < 4 && !this.closed) {
        cb.status(`Connection problem (${e.type}) — retrying ${tries + 1}/4…`);
        try { peer.destroy(); } catch { /* gone */ }
        setTimeout(() => { if (!this.closed) this.open(code, cb, tries + 1); }, 1500 * (tries + 1));
      } else if (e.type === 'peer-unavailable') cb.status('That game was not found. Ask the host to check their page is still open.');
      else cb.status(`Connection error: ${e.type || e.message}. Try the other server.`);
    });
  }

  attach(conn) {
    conn.on('open', () => { this.conns.set(conn.peer, conn); this.cb.join(conn.peer); });
    conn.on('data', (m) => this.cb.data(m, conn.peer));
    conn.on('close', () => { this.conns.delete(conn.peer); this.cb.leave(conn.peer); });
    conn.on('error', () => { this.conns.delete(conn.peer); this.cb.leave(conn.peer); });
  }

  send(m, peerId) {
    const targets = peerId ? [this.conns.get(peerId)] : [...this.conns.values()];
    for (const c of targets) if (c?.open) c.send(m);
  }

  addStream(stream, peerId) {
    this.peer?.call(peerId, stream);
  }

  close() {
    this.closed = true;
    for (const c of this.conns?.values() || []) { try { c.close(); } catch { /* closed */ } }
    try { this.peer?.destroy(); } catch { /* gone */ }
  }
}

function randomCode() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export class Net {
  constructor(game) {
    this.game = game;
    this.role = null; // 'host' | 'guest'
    this.link = null; // TrysteroLink or PeerJSLink
    this.hostPeer = null; // guest: the host's transport peer id
    this.guests = new Map(); // host: nid -> { conn, name, peerId, lastHeard }
    this.roster = []; // everyone in the game: { nid, name, peerId }
    this.myNid = null;
    this.lastHeard = 0;
    this.sendTimer = 0;
    this.status = '';
    this.mic = null;
    this.micOn = false;
    this.calls = new Map(); // peerId -> outgoing call carrying our microphone
    this.voices = new Map(); // peerId -> { audio, analyser, data, level }
  }

  get connected() {
    return this.role === 'host' ? this.guests.size > 0 : !!this.hostPeer;
  }

  get active() {
    return !!this.role && this.connected;
  }

  setStatus(text) {
    this.status = text;
    this.onStatus?.(text);
  }

  get myName() {
    return this.game.profile.name;
  }

  nameOf(nid) {
    return this.roster.find((r) => r.nid === nid)?.name || (nid === 'H' ? 'Host' : 'Soldier');
  }

  // ------------------------------------------------------------- lobby

  makeLink(via) {
    this.via = via === 'p' ? 'p' : 'n';
    this.link = this.via === 'p' ? new PeerJSLink() : new TrysteroLink();
    this.peerNid = new Map(); // host: transport peer id -> nid
    const cb = {
      ready: (code) => this.onReady(code),
      join: (id) => this.onPeerJoin(id),
      leave: (id) => this.onPeerLeave(id),
      data: (m, id) => this.onData(m, id),
      stream: (stream, id) => this.playVoice(id, stream),
      status: (t) => this.setStatus(t),
    };
    return cb;
  }

  host(via = 'n') {
    this.leave();
    this.role = 'host';
    this.myNid = 'H';
    this.setStatus('Creating a game…');
    const cb = this.makeLink(via);
    this.link.open(this.via === 'p' ? null : randomCode(), cb);
  }

  join(code, via = 'n') {
    this.leave();
    this.role = 'guest';
    this.hostPeer = null;
    this.setStatus('Looking for the host…');
    const cb = this.makeLink(via);
    this.link.open(code, cb);
    // if nobody answers, say why it might be
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (this.role === 'guest' && !this.hostPeer) {
        this.setStatus('Still looking for the host… Check that the host\'s game page is open. If it keeps failing, ask the host to switch to Server 2 and send a new link.');
      }
    }, 25000);
  }

  onReady(code) {
    this.id = code;
    if (this.role === 'host') {
      this.roster = [{ nid: 'H', name: this.myName, peerId: this.link.selfId }];
      this.setStatus(`Game ready. Share the invite link — up to ${MAX_PLAYERS - 1} friends can join.`);
      this.onInvite?.(this.inviteLink());
      this.onRoster?.();
    }
  }

  // a browser joined the room: the host introduces itself; a guest knocks
  // (and keeps knocking until the host answers, in case a message was lost)
  onPeerJoin(peerId) {
    if (this.role === 'host') this.link.send({ t: 'iam-host' }, peerId);
    else this.knock();
  }

  knock() {
    clearTimeout(this.knockTimer);
    if (this.role !== 'guest' || this.hostPeer || !this.link) return;
    this.link.send({ t: 'knock' });
    this.knockTimer = setTimeout(() => this.knock(), 3000);
  }

  onPeerLeave(peerId) {
    this.dropVoice(peerId);
    if (this.role === 'host') { const nid = this.peerNid.get(peerId); if (nid) this.guestLost(nid); }
    else if (peerId === this.hostPeer) this.hostLost();
  }

  onData(m, peerId) {
    if (!m || typeof m !== 'object') return;
    if (this.role === 'guest') {
      if (m.t === 'iam-host' && !this.hostPeer) {
        this.hostPeer = peerId;
        this.lastHeard = now();
        clearTimeout(this.joinTimer);
        this.link.send({ t: 'hello', name: this.myName }, peerId);
        return;
      }
      if (peerId !== this.hostPeer) return; // guests only listen to the host
      this.receive(m, 'H');
      return;
    }
    // host
    if (m.t === 'knock') { if (!this.peerNid.has(peerId)) this.link.send({ t: 'iam-host' }, peerId); return; }
    if (m.t === 'hello') { this.accept(peerId, m.name); return; }
    const nid = this.peerNid.get(peerId);
    if (!nid) return;
    const g = this.guests.get(nid);
    if (g) g.lastHeard = now();
    this.receive(m, nid);
  }

  // host: a friend opened the invite link and said hello
  accept(peerId, name) {
    if (this.peerNid.has(peerId)) return;
    if (this.guests.size >= MAX_PLAYERS - 1) { this.link.send({ t: 'full' }, peerId); return; }
    let slot = 1;
    while (this.guests.has(`G${slot}`)) slot++;
    const nid = `G${slot}`;
    const g = { name: cleanName(name), peerId, lastHeard: now() };
    this.guests.set(nid, g);
    this.peerNid.set(peerId, nid);
    this.roster.push({ nid, name: g.name, peerId });
    this.link.send({ t: 'welcome', nid, roster: this.roster, mission: this.game.state === 'playing' ? this.game.missionIndex : null }, peerId);
    this.broadcast({ t: 'roster', roster: this.roster });
    this.setStatus(`${this.roster.length} players in the game. Choose a mission and start.`);
    this.game.onPlayerJoined?.(nid, g.name);
    this.onConnect?.();
    this.onRoster?.();
    this.callAll();
  }

  inviteLink() {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('join', this.id);
    if (this.via === 'p') u.searchParams.set('via', 'p');
    for (const k of ['peer', 'relay']) { const v = param(k); if (v) u.searchParams.set(k, v); }
    return u.toString();
  }

  leave() {
    this.setMic(false);
    clearTimeout(this.joinTimer);
    clearTimeout(this.knockTimer);
    for (const v of this.voices.values()) v.audio.remove();
    try { this.link?.close(); } catch { /* closed */ }
    this.link = null;
    this.hostPeer = null;
    this.guests.clear();
    this.calls.clear();
    this.voices.clear();
    this.roster = [];
    this.role = null;
    this.myNid = null;
    this.onRoster?.();
  }

  guestLost(nid) {
    const g = this.guests.get(nid);
    if (!g) return;
    this.guests.delete(nid);
    this.peerNid.delete(g.peerId);
    this.roster = this.roster.filter((r) => r.nid !== nid);
    this.dropVoice(g.peerId);
    this.broadcast({ t: 'roster', roster: this.roster });
    this.game.onPartnerLost(nid, g.name);
    this.onRoster?.();
  }

  hostLost() {
    if (this.role !== 'guest' || !this.hostPeer) return;
    this.hostPeer = null;
    this.game.onPartnerLost('H', this.nameOf('H'));
    this.roster = [];
    this.onRoster?.();
  }

  // guest: to the host; host: to every guest (except one, when relaying)
  send(m) {
    if (this.role === 'guest') { if (this.hostPeer) this.link.send(m, this.hostPeer); } else this.broadcast(m);
  }

  broadcast(m, except = null) {
    for (const [nid, g] of this.guests) if (nid !== except) this.link.send(m, g.peerId);
  }

  sendTo(nid, m) {
    const g = this.guests.get(nid);
    if (g) this.link.send(m, g.peerId);
  }

  // ------------------------------------------------------------- chat

  chat(text) {
    text = String(text).trim().slice(0, 120);
    if (!text || !this.role) return;
    const m = { t: 'chat', nid: this.myNid, name: this.myName, text };
    this.send(m);
    this.game.onChat(m, true);
  }

  // ------------------------------------------------------------- voice

  async setMic(on) {
    if (on && !this.mic) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        this.game.toast(`Microphone not available: ${e.name || e.message}`);
        this.micOn = false;
        this.onRoster?.();
        return;
      }
    }
    this.micOn = !!on && !!this.mic;
    if (this.mic) for (const t of this.mic.getAudioTracks()) t.enabled = this.micOn;
    if (this.micOn) this.callAll();
    this.onRoster?.();
  }

  // send our microphone to every other player we are not yet sending it to
  callAll() {
    if (!this.mic || !this.link) return;
    for (const r of this.roster) {
      if (!r.peerId || r.peerId === this.link.selfId || this.calls.has(r.peerId)) continue;
      this.calls.set(r.peerId, true);
      this.link.addStream(this.mic, r.peerId);
    }
  }

  playVoice(peerId, stream) {
    this.dropVoice(peerId);
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = stream;
    audio.dataset.peer = peerId;
    document.body.appendChild(audio);
    audio.play?.().catch(() => {});
    const v = { audio, level: 0, analyser: null };
    try {
      const ctx = this.game.audio.ctx || new AudioContext();
      v.analyser = ctx.createAnalyser();
      v.analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(v.analyser);
      v.data = new Uint8Array(v.analyser.fftSize);
    } catch { /* no level meter: voice still plays */ }
    this.voices.set(peerId, v);
    this.onRoster?.();
  }

  dropVoice(peerId) {
    const v = this.voices.get(peerId);
    if (v) { v.audio.remove(); this.voices.delete(peerId); }
    this.calls.delete(peerId);
  }

  // names of players whose voice is loud enough to count as talking
  talking() {
    const out = [];
    for (const [peerId, v] of this.voices) {
      if (!v.analyser) continue;
      v.analyser.getByteTimeDomainData(v.data);
      let sum = 0;
      for (const x of v.data) sum += (x - 128) * (x - 128);
      v.level = Math.sqrt(sum / v.data.length);
      if (v.level > 4) out.push(this.roster.find((r) => r.peerId === peerId)?.name || 'Friend');
    }
    return out;
  }

  // ------------------------------------------------------------- messages

  receive(m, from) {
    const g = this.game;
    if (this.role === 'guest') this.lastHeard = now();
    switch (m.t) {
      case 'welcome':
        this.myNid = m.nid;
        this.roster = m.roster;
        this.setStatus(m.mission !== null ? 'Connected. A mission is in progress — you will join the next one.' : 'Connected. Waiting for the host to start a mission…');
        this.onConnect?.();
        this.onRoster?.();
        this.callAll();
        break;
      case 'full': this.setStatus(`That game is full (${MAX_PLAYERS} players).`); this.leave(); break;
      case 'roster': {
        // tell the player who joined or left
        const before = this.roster;
        for (const r of before) if (r.nid !== this.myNid && !m.roster.some((x) => x.nid === r.nid)) g.onPartnerLost(r.nid, r.name);
        for (const r of m.roster) if (r.nid !== this.myNid && before.length && !before.some((x) => x.nid === r.nid)) g.onPlayerJoined(r.nid, r.name);
        this.roster = m.roster;
        this.onRoster?.();
        this.callAll();
        for (const peerId of [...this.voices.keys()]) if (!this.roster.some((r) => r.peerId === peerId)) this.dropVoice(peerId);
        for (const r of this.roster) g.renamePartner?.(r.nid, r.name);
        break;
      }
      case 'name':
        if (this.role === 'host') {
          const r = this.roster.find((x) => x.nid === from);
          if (r) { r.name = cleanName(m.name); this.guests.get(from).name = r.name; }
          this.broadcast({ t: 'roster', roster: this.roster });
          this.onRoster?.();
          g.renamePartner?.(from, this.nameOf(from));
        }
        break;
      case 'chat':
        if (this.role === 'host') this.broadcast(m, from);
        g.onChat(m, false);
        break;
      case 'start': if (this.role === 'guest') g.coopStart(m.mission); break;
      case 'snap': if (this.role === 'guest') this.applySnapshot(m); break;
      case 'me': if (this.role === 'host') this.applyPartner(m, from); break;
      case 'fx': g.fx.tracer(new THREE.Vector3(...m.a), new THREE.Vector3(...m.b), m.c); g.audio.shot(new THREE.Vector3(...m.a), false); break;
      case 'shot': if (this.role === 'host') { g.partnerShot(m, from); this.broadcast({ t: 'fx', a: m.a, b: m.b, c: 0xfff2a0 }, from); } break;
      case 'hit': if (this.role === 'host') g.partnerHit(m, from); break;
      case 'boom':
        if (this.role === 'host') { g.partnerGrenade(m, from); this.broadcast(m, from); } else g.fx.explosion(new THREE.Vector3(...m.p));
        break;
      case 'interact': if (this.role === 'host') g.partnerInteract(m, from); break;
      case 'dmg': if (this.role === 'guest' && g.player?.alive) { g.player.hp -= m.v; g.onPlayerHit(null); if (g.player.hp <= 0) g.player.die(null); } break;
      case 'dead': if (this.role === 'host') g.missionFailed(`${this.nameOf(from)} was killed in action.`); break;
      case 'end': if (this.role === 'guest') g.coopEnd(m); break;
      case 'radio': g.radio.say(m.lines); break;
      case 'toast': g.toast(m.text, m.big); break;
      default: break;
    }
  }

  // per frame: send state and watch for silent players
  update(dt) {
    if (!this.role) return;
    const t = now();
    if (this.role === 'host') {
      for (const [nid, g] of this.guests) if (t - g.lastHeard > TIMEOUT) this.guestLost(nid);
    } else if (this.hostPeer && this.lastHeard && t - this.lastHeard > TIMEOUT) { this.hostLost(); return; }
    if (!this.connected) return;
    this.sendTimer -= dt;
    if (this.sendTimer > 0) return;
    this.sendTimer = 1 / SEND_HZ;
    const g = this.game;
    if (!g.world || !g.player || g.state !== 'playing' && g.state !== 'pause') { this.send({ t: 'ping' }); return; }
    if (this.role === 'host') this.broadcast(this.snapshot());
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
      units.push([u.nid, r2(u.pos.x), r2(u.pos.y), r2(u.pos.z), r2(u.yaw), r2(u.pitch), STANCES.indexOf(u.stance), u.alive ? 1 : 0,
        u.team === 'ltte' ? 1 : u.team === 'civ' ? 2 : 0, u.tag || '', u.state === 'wait' ? 1 : 0, r2(u.speed || 0), u.marked ? 1 : 0, Math.round(u.hp)]);
    }
    return {
      t: 'snap', units, obj: g.objIndex, sub: document.querySelector('.obj-sub')?.textContent || '',
      civ: [g.civSafe, g.civTotal], alarms: g.world.alarms.map((a) => (a.disabled ? 2 : a.triggered ? 1 : 0)),
      targets: g.world.targets.map((t) => (t.blown ? 2 : t.done ? 1 : 0)),
      alert: g.alertLevel > 0 ? 1 : 0,
    };
  }

  applyPartner(m, nid) {
    const u = this.game.partners.get(nid);
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
      const [nid, x, y, z, yaw, pitch, s, alive, team, tag, wait, speed, marked, hp] = a;
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
      if (u.remote) u.hp = hp;
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
  }
}

export function cleanName(n) {
  const s = String(n ?? '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s || 'Soldier';
}
