// Player profile: campaign progress, XP, rank, commendations and settings,
// saved in browser storage. Invalid or missing saves fall back to defaults.

import { medalsFor, MEDALS, missionXP, rankFor } from './story.js';

const KEY = 'wanni_front_profile_v1';
const OLD_KEY = 'wanni_front_progress';

const DEFAULT_SETTINGS = { sensitivity: 1, volume: 0.7, difficulty: 1, quality: 'high' };

function defaults() {
  return {
    v: 1,
    unlocked: 0,
    done: [],
    best: {},
    medals: [],
    seenPrologue: false,
    campaignComplete: false,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function clampNum(v, lo, hi, def) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
}

function validate(raw, missionIds) {
  const p = defaults();
  if (!raw || typeof raw !== 'object') return p;
  p.unlocked = Math.round(clampNum(raw.unlocked, 0, missionIds.length - 1, 0));
  p.done = Array.isArray(raw.done) ? raw.done.filter((id) => missionIds.includes(id)) : [];
  if (raw.best && typeof raw.best === 'object') {
    for (const id of missionIds) if (typeof raw.best[id] === 'number' && raw.best[id] > 0) p.best[id] = Math.round(raw.best[id]);
  }
  p.medals = Array.isArray(raw.medals) ? raw.medals.filter((m) => m in MEDALS) : [];
  p.seenPrologue = raw.seenPrologue === true;
  p.campaignComplete = raw.campaignComplete === true;
  const s = raw.settings || {};
  p.settings = {
    sensitivity: clampNum(s.sensitivity, 0.3, 3, DEFAULT_SETTINGS.sensitivity),
    volume: clampNum(s.volume, 0, 1, DEFAULT_SETTINGS.volume),
    difficulty: [0.6, 1, 1.45].includes(s.difficulty) ? s.difficulty : DEFAULT_SETTINGS.difficulty,
    quality: s.quality === 'low' ? 'low' : 'high',
  };
  return p;
}

export class Profile {
  constructor(missionIds) {
    this.ids = missionIds;
    this.data = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw) return validate(raw, this.ids);
      // migrate the progress format used before profiles existed
      const old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (old) return validate({ unlocked: old.unlocked, done: old.done }, this.ids);
    } catch { /* corrupt or unavailable storage: start fresh */ }
    return defaults();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  reset() {
    const settings = this.data.settings;
    this.data = defaults();
    this.data.settings = settings;
    this.save();
  }

  get xp() {
    return Object.values(this.data.best).reduce((s, v) => s + v, 0);
  }

  get rank() {
    return rankFor(this.xp);
  }

  get settings() {
    return this.data.settings;
  }

  setSetting(k, v) {
    this.data.settings[k] = v;
    this.data.settings = validate({ ...this.data, settings: this.data.settings }, this.ids).settings;
    this.save();
  }

  /**
   * Record a completed mission. Only the best result per mission counts, so
   * replaying never awards duplicate XP.
   */
  recordMission(index, result) {
    const id = this.ids[index];
    const oldXP = this.xp;
    const oldRank = this.rank;
    const { total, lines } = missionXP(result);
    const prev = this.data.best[id] || 0;
    if (total > prev) this.data.best[id] = total;
    if (!this.data.done.includes(id)) this.data.done.push(id);
    this.data.unlocked = Math.max(this.data.unlocked, Math.min(this.ids.length - 1, index + 1));
    const newMedals = [];
    const earned = medalsFor(id, result);
    if (this.ids.every((m) => this.data.done.includes(m))) {
      this.data.campaignComplete = true;
      earned.push('veteran');
    }
    for (const m of earned) if (!this.data.medals.includes(m)) { this.data.medals.push(m); newMedals.push(m); }
    this.save();
    return { id, missionXP: total, lines, gained: this.xp - oldXP, previousBest: prev, oldRank, newRank: this.rank, newMedals, totalXP: this.xp };
  }
}
