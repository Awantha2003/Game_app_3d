// Radio / squad dialogue shown as subtitles at the bottom of the HUD.

import { CHARACTERS } from './story.js';

export class Radio {
  constructor(el, audio) {
    this.el = el;
    this.audio = audio;
    this.queue = [];
    this.current = null;
    this.timer = 0;
  }

  say(lines) {
    for (const l of lines || []) this.queue.push(l);
  }

  clear() {
    this.queue = [];
    this.current = null;
    this.el.classList.remove('on');
  }

  // seconds until everything queued has been shown
  get remaining() {
    const dur = (l) => 2.2 + l[1].length * 0.045;
    return (this.current ? this.timer : 0) + this.queue.reduce((s, l) => s + dur(l), 0);
  }

  update(dt) {
    if (this.current) {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.current = null;
      this.el.classList.remove('on');
    }
    const next = this.queue.shift();
    if (!next) return;
    const [who, text] = next;
    const c = CHARACTERS[who] || { short: who, color: '#fff' };
    this.current = next;
    this.timer = 2.2 + text.length * 0.045;
    this.el.innerHTML = `<span class="radio-who" style="color:${c.color}">${c.short || c.name}</span><span class="radio-text"></span>`;
    this.el.querySelector('.radio-text').textContent = text;
    this.el.classList.toggle('tip', who === 'tip');
    this.el.classList.add('on');
    if (who !== 'tip') this.audio.radio();
  }
}
