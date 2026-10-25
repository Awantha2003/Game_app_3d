// Phone controls in portrait: the scope overlay, the joystick, running and
// firing the SVD through the scope.
//
//   npm run build && npm run test:mobile [-- screenshot-dir]

import { chromium } from 'playwright';
import { preview } from 'vite';

const shots = process.argv[2];
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`);
  if (!ok) failures++;
};

const server = await preview({ preview: { port: 4181, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://localhost:4181/');
  await page.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 120000 });
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    g.openBriefing(0); g.beginMission(); g.skipInsertion();
    const fire = (el, type, id, x, y) => {
      const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
    const step = (n) => { for (let k = 0; k < n; k++) g.update(1 / 30); };
    const out = { stickVisible: getComputedStyle(document.querySelector('.stick')).opacity > 0.5 };
    const aim = document.querySelector('.btn-aim');
    fire(aim, 'touchstart', 9, 1, 1); fire(aim, 'touchend', 9, 1, 1);
    step(5);
    out.aimOn = g.input.aim;
    out.scope = getComputedStyle(document.querySelector('.scope')).display;
    const zone = document.querySelector('.stick-zone');
    const p0 = g.player.pos.clone();
    fire(zone, 'touchstart', 7, 80, 700); fire(zone, 'touchmove', 7, 80, 670);
    step(30);
    out.walked = g.player.pos.distanceTo(p0);
    fire(zone, 'touchmove', 7, 80, 600);
    const p1 = g.player.pos.clone();
    step(30);
    out.ran = g.player.pos.distanceTo(p1);
    out.aimAfterPush = g.input.aim;
    fire(zone, 'touchend', 7, 80, 600);
    // SVD: aim, then two quick taps on FIRE (each shorter than a frame, the
    // second during the bolt cycle): both shots go off and the scope stays up
    g.switchWeapon(2);
    if (!g.input.aim) { fire(aim, 'touchstart', 9, 1, 1); fire(aim, 'touchend', 9, 1, 1); }
    step(15);
    const fb = document.querySelector('.btn-fire'), a0 = g.ammo;
    fire(fb, 'touchstart', 11, 1, 1); fire(fb, 'touchend', 11, 1, 1);
    step(2);
    fire(fb, 'touchstart', 12, 1, 1); fire(fb, 'touchend', 12, 1, 1);
    step(20);
    out.scopeShots = a0 - g.ammo;
    out.stillScoped = g.isScoped();
    g.postfx.render(0.03);
    return out;
  });
  check(r.stickVisible, 'the joystick is visible before it is touched');
  check(r.aimOn && r.scope === 'none', `aiming the T-56 does not show the sniper scope (display ${r.scope})`);
  check(r.walked > 0.8, `half a push on the joystick walks (${r.walked.toFixed(1)} m in 1 s)`);
  check(r.ran > 5 && !r.aimAfterPush, `a full push lowers the weapon and runs (${r.ran.toFixed(1)} m in 1 s)`);
  check(r.scopeShots === 2 && r.stillScoped, `quick taps on FIRE shoot the SVD while zoomed (${r.scopeShots} shots, scope ${r.stillScoped ? 'still up' : 'dropped'})`);
  if (shots) { await page.waitForTimeout(2500); await page.screenshot({ path: `${shots}/mobile_stick.png`, timeout: 300000 }); }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  check(false, `test crashed: ${e.message}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
