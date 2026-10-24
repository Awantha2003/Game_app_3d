// End-to-end campaign test: builds the game, serves it, and lets a simple bot
// play the whole campaign in headless Chromium.
//
//   npm run test:campaign            (all ten missions)
//   npm run test:campaign -- 0 2     (only missions 1 and 3)
//
// Needs Playwright with Chromium: `npx playwright install chromium`.

import { chromium } from 'playwright';
import { build, preview } from 'vite';

const only = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n));
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`);
  if (!ok) failures++;
};

await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4174, strictPort: true }, logLevel: 'warn' });
const url = 'http://localhost:4174/';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_/.test(m.text())) errors.push(m.text()); });

try {
  await page.goto(url);
  await page.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 90000 });
  check(true, 'start screen shown after loading');

  // first start plays the prologue; skip it
  // software rendering in headless Chromium is slow: stop drawing frames and
  // click through the DOM so the test does not wait on the renderer
  await page.evaluate(() => window.__game.renderer.setAnimationLoop(null));
  const tap = (sel) => page.$eval(sel, (b) => b.click());
  await tap('[data-act="start"]');
  await page.waitForSelector('#prologue:not(.hidden)', { timeout: 5000 });
  check(true, 'prologue plays on first start');
  await page.waitForTimeout(1500);
  await tap('.pro-skip');
  await page.waitForSelector('[data-screen="menu"]:not(.hidden)', { timeout: 5000 });
  check(true, 'prologue can be skipped and the main menu opens');

  // every enabled main-menu button opens something
  for (const act of ['missions', 'loadout', 'squad', 'profile', 'archive', 'settings', 'credits']) {
    await tap(`[data-screen="menu"] [data-act="${act}"]`);
    const open = await page.evaluate(() => [...document.querySelectorAll('#screen .panel')].find((p) => !p.classList.contains('hidden'))?.dataset.screen);
    check(open === act, `menu "${act}" opens`);
    await tap(`[data-screen="${act}"] [data-act="${act === 'loadout' ? 'loadout-back' : 'menu'}"]`);
  }

  // play the campaign with an in-page bot (rendering is skipped for speed)
  const missions = only.length ? only : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const i of missions) {
    const r = await page.evaluate(async (mi) => {
      const g = window.__game;
      g.renderer.setAnimationLoop(null);
      g.openBriefing(mi);
      const fiction = document.querySelector('.b-fiction').textContent.length > 0;
      g.beginMission();
      const inserted = !!g.insertion;
      for (let k = 0; k < 60 && g.insertion; k++) g.update(1 / 30); // watch the start of the insertion
      g.skipInsertion();
      const T = g.player.pos.constructor;
      let lastPos = null, stuck = 0, side = 'KeyA';
      for (let step = 0; step < 30 * 600 && g.state === 'playing'; step++) {
        const pl = g.player;
        pl.hp = 100; // the bot tests progression, not survival
        const inp = g.input;
        inp.keys.clear(); inp.fire = false; inp.touchAction = false;
        const vis = g.units.filter((u) => u.alive && u.team === 'ltte' && u.pos.distanceTo(pl.pos) < 70
          && g.world.lineOfSight(new T(pl.pos.x, pl.pos.y + 1.6, pl.pos.z), new T(u.pos.x, u.pos.y + 1.3, u.pos.z)));
        vis.sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos));
        if (vis.length && step % 2 === 0) {
          const e = vis[0];
          for (let k = 0; k < 3; k++) {
            g.updateCamera(1 / 30, true);
            const c = g.camera.position;
            g.yaw = Math.atan2(e.pos.x - c.x, e.pos.z - c.z);
            g.pitch = Math.atan2(e.pos.y + 1.1 - c.y, Math.hypot(e.pos.x - c.x, e.pos.z - c.z));
          }
          g.updateCamera(1 / 30, true);
          const d = new T(); g.camera.getWorldDirection(d);
          const hit = g.world.raycast(g.camera.position.clone().addScaledVector(d, 3), d, 120, pl);
          inp.fire = !(hit && hit.kind === 'unit' && hit.unit.team !== 'ltte');
        } else {
          let wp = g.objectiveWaypoint();
          const o = g.currentObjective();
          if (!wp && o && o.type === 'clear') {
            const es = g.units.filter((u) => u.alive && u.team === 'ltte' && u.tag === o.tag);
            if (es[0]) wp = es[0].pos;
          }
          if (wp) {
            g.yaw = Math.atan2(wp.x - pl.pos.x, wp.z - pl.pos.z); g.pitch = 0;
            if (Math.hypot(wp.x - pl.pos.x, wp.z - pl.pos.z) > 2.5) inp.keys.add('KeyW');
            if (stuck > 0) { stuck--; inp.keys.add(side); }
          }
          inp.touchAction = true;
        }
        if (step % 45 === 0) {
          if (lastPos && lastPos.distanceTo(pl.pos) < 1 && !vis.length) { stuck = 50; side = Math.random() < 0.5 ? 'KeyA' : 'KeyD'; }
          lastPos = pl.pos.clone();
        }
        if (g.ammo === 0) inp.pressed.add('KeyR');
        g.update(1 / 30);
      }
      const out = {
        state: g.state, time: Math.round(g.missionTime), fiction, inserted, insertion: g.mission.insertion,
        marked: g.units.filter((u) => u.marked).length, alarms: g.world.alarms.map((a) => (a.triggered ? 'T' : a.disabled ? 'D' : '-')).join(''),
        xp: document.querySelector('.xp-box')?.textContent || '',
        fail: document.querySelector('.f-title').textContent,
        stuck: g.state === 'playing' ? `objective ${g.objIndex + 1} "${g.currentObjective()?.text}" ${document.querySelector('.obj-sub').textContent}, player at ${g.player.pos.x.toFixed(0)},${g.player.pos.z.toFixed(0)}` : '',
        totalXP: g.profile.xp, rank: g.profile.rank.id,
      };
      return out;
    }, i);
    check(r.fiction, `mission ${i + 1}: briefing shows the fiction block`);
    check(!r.insertion || r.inserted, `mission ${i + 1}: ${r.insertion || 'no'} insertion played (alarms ${r.alarms || 'none'})`);
    check(r.state === 'complete', `mission ${i + 1}: completed in ${r.time}s game time${r.fail ? ` (failed: ${r.fail})` : ''}${r.stuck ? ` (stuck at ${r.stuck})` : ''}`);
    check(/Mission XP/.test(r.xp), `mission ${i + 1}: debrief shows XP (${r.totalXP} total, rank ${r.rank})`);
    if (r.state !== 'complete') continue;
    // DOM clicks here: software rendering in headless Chromium is too slow for pointer actionability checks
    await page.$eval('[data-screen="complete"] [data-act="next"]', (b) => b.click());
    const screen = await page.evaluate(() => [...document.querySelectorAll('#screen .panel')].find((p) => !p.classList.contains('hidden'))?.dataset.screen);
    if (screen === 'promotion') {
      check(true, `mission ${i + 1}: promotion celebration shown`);
      await page.$eval('[data-act="promo-next"]', (b) => b.click());
    }
  }

  if (!only.length) {
    const ep = await page.evaluate(() => !document.querySelector('[data-screen="epilogue"]').classList.contains('hidden'));
    check(ep, 'epilogue shown after the final mission');
    // progress survives a reload
    const before = await page.evaluate(() => window.__game.profile.xp);
    await page.reload();
    await page.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 90000 });
    const after = await page.evaluate(() => window.__game.profile.xp);
    check(before > 0 && before === after, `XP saved across reload (${after})`);
    const rank = await page.evaluate(() => window.__game.profile.rank.id);
    check(rank === 'maj', `rank after the campaign is Major (${rank})`);
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  check(false, `test crashed: ${e.message}`);
} finally {
  await browser.close();
  server.httpServer.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
