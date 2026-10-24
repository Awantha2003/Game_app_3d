// Keyboard + mouse (pointer lock) and touch controls.

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.fire = false;
    this.aim = false;
    this.pressed = new Set();
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.lookTouch = null;
    this.sprintToggle = false;

    window.addEventListener('keydown', (e) => {
      // typing a chat message or a name is not game input
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.wheel = 0;
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.aim = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      if (document.pointerLockElement !== canvas) { this.requestLock(); return; }
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.aim = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.aim = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        // some browsers report a huge jump on the first event after locking
        if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });

    if (this.touch) this.setupTouch(touchRoot);
  }

  requestLock() {
    if (!this.touch) this.canvas.requestPointerLock?.();
  }

  get locked() {
    return this.touch || document.pointerLockElement === this.canvas;
  }

  // one-shot key press (true once per press)
  hit(code) {
    const h = this.pressed.has(code);
    this.pressed.delete(code);
    return h;
  }

  endFrame() {
    this.pressed.clear();
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  resetLook() {
    this.lookX = this.lookY = 0;
  }

  consumeLook() {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return r;
  }

  get moveVec() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.stick.id !== null) { x = this.stick.x; y = -this.stick.y; }
    return { x, y };
  }

  get sprint() {
    // a joystick pushed all the way forward also runs
    const fullStick = this.stick.id !== null && -this.stick.y > 0.92 && !this.aim;
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintToggle || fullStick;
  }

  get action() {
    return this.keys.has('KeyE') || this.touchAction;
  }

  setupTouch(root) {
    root.classList.add('touch');
    const stickEl = root.querySelector('.stick');
    const knob = root.querySelector('.knob');
    const zone = root.querySelector('.stick-zone');
    const look = root.querySelector('.look-zone');
    const R = 55;

    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this.stick.id = t.identifier;
      this.stick.ox = t.clientX; this.stick.oy = t.clientY;
      // the joystick jumps to where the thumb lands
      stickEl.style.left = `${t.clientX - 60}px`;
      stickEl.style.top = `${t.clientY - 60}px`;
      stickEl.style.bottom = 'auto';
      stickEl.classList.add('on');
      e.preventDefault();
    }, { passive: false });
    look.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          this.stick.x = dx / R; this.stick.y = dy / R;
          // pushing the stick all the way forward lowers the weapon and runs
          if (this.stick.y < -0.92 && this.aim) { this.aim = false; this.aimBtn?.classList.remove('on'); }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this.lookX += (t.clientX - this.lookTouch.x) * 1.6;
          this.lookY += (t.clientY - this.lookTouch.y) * 1.6;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick.id = null; this.stick.x = this.stick.y = 0;
          knob.style.transform = '';
          stickEl.classList.remove('on');
          // back to its resting place, where it stays visible
          stickEl.style.left = stickEl.style.top = stickEl.style.bottom = '';
        }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    const hold = (sel, on, off) => {
      const el = root.querySelector(sel);
      el.addEventListener('touchstart', (e) => { on(); el.classList.add('down'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      el.addEventListener('touchend', (e) => { off(); el.classList.remove('down'); e.preventDefault(); });
    };
    hold('.btn-fire', () => { this.fire = true; }, () => { this.fire = false; });
    const aimBtn = root.querySelector('.btn-aim');
    this.aimBtn = aimBtn;
    hold('.btn-aim', () => { this.aim = !this.aim; aimBtn.classList.toggle('on', this.aim); }, () => {});
    // small buttons send the same key as the keyboard
    for (const el of root.querySelectorAll('[data-key]')) {
      el.addEventListener('touchstart', (e) => { this.pressed.add(el.dataset.key); el.classList.add('down'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      el.addEventListener('touchend', (e) => { el.classList.remove('down'); e.preventDefault(); });
    }
    hold('.btn-reload', () => this.pressed.add('KeyR'), () => {});
    hold('.btn-action', () => { this.touchAction = true; }, () => { this.touchAction = false; });
    const runBtn = root.querySelector('.btn-sprint');
    hold('.btn-sprint', () => {
      this.sprintToggle = !this.sprintToggle;
      runBtn.classList.toggle('on', this.sprintToggle);
      // running lowers the weapon
      if (this.sprintToggle && this.aim) { this.aim = false; aimBtn.classList.remove('on'); }
    }, () => {});
    hold('.btn-pause', () => this.pressed.add('Escape'), () => {});
  }
}
