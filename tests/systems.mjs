// Checks the squad and loadout systems directly in the running game:
// medic, suppression, cover, rank-locked loadout, the machine gun and NVGs.
//
//   npm run build && node tests/systems.mjs

import { chromium } from 'playwright';
import { preview } from 'vite';

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`);
  if (!ok) failures++;
};

const server = await preview({ preview: { port: 4177, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto('http://localhost:4177/');
  await page.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 120000 });
  const r = await page.evaluate(() => {
    const g = window.__game, out = {};
    g.renderer.setAnimationLoop(null);
    const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };

    // medic (Vakarai has Prakash)
    g.openBriefing(2); g.beginMission(); g.skipInsertion();
    const medic = g.squadAllies().find((a) => a.role === 'medic');
    out.medic = !!medic;
    g.player.hp = 30; g.lastPlayerHit = g.time; g.callMedic();
    for (const u of g.units) if (u.team === 'ltte') { u.alive = false; u.hp = 0; }
    step(30 * 12);
    out.healed = Math.round(g.player.hp);
    out.kits = medic.kits;

    // natural healing stops at 60%
    g.squadAllies().forEach((a) => { a.kits = 0; });
    g.player.hp = 20; g.lastPlayerHit = -99;
    step(30 * 15);
    out.regenCap = Math.round(g.player.hp);

    // suppression and cover (Mavil Aru)
    g.openBriefing(0); g.beginMission(); g.skipInsertion();
    const e = g.units.find((u) => u.team === 'ltte' && u.alive);
    g.suppress(e.pos.clone(), 3, 3);
    out.suppressed = e.suppressed > 0;
    const gunner = g.squadAllies().find((a) => a.role === 'gunner');
    out.gunnerLmg = !!gunner?.parts.rifle?.getObjectByName('wpn_lmg') && !!gunner.obj.getObjectByName('Rifle') && !gunner.obj.getObjectByName('Rifle').visible;
    const wall = g.world.colliders.find((c) => c.type === 'sandbag_wall');
    const T = g.player.pos.constructor;
    const threat = new T(wall.x, wall.y1, wall.z + 25);
    const cover = g.world.findCover(new T(wall.x + 2, wall.y1, wall.z - 3), threat, 12);
    out.cover = !!cover && !g.world.lineOfSight(new T(threat.x, g.world.height(threat.x, threat.z) + 1.4, threat.z), new T(cover.x, g.world.height(cover.x, cover.z) + 0.85, cover.z));

    // jump
    const ground = g.player.pos.y;
    g.input.pressed.add('Space');
    let top = 0;
    for (let i = 0; i < 20; i++) { g.update(1 / 30); top = Math.max(top, g.player.pos.y - ground); }
    out.jump = Math.round(top * 100) / 100;

    // weapon pickups from fallen cadres
    const gun = g.units.find((u) => u.team === 'ltte' && u.alive && u.weaponId === 'lmg') || g.units.find((u) => u.team === 'ltte' && u.alive);
    gun.weaponId = 'lmg';
    gun.damage(999, g.player);
    out.dropped = g.pickups.length;
    const pk = g.pickups[g.pickups.length - 1];
    g.player.pos.set(pk.x + 0.5, g.player.pos.y, pk.z);
    out.prompt = g.findInteraction()?.label || '';
    g.pickUp(pk);
    out.primaryAfterPickup = g.weapons[0].id;
    out.oldDropped = g.pickups.some((k) => k.id === 't56');

    // planning on the map: tap the centre to send Bravo team there
    g.toggleMap(true);
    const r = document.querySelector('#map canvas').getBoundingClientRect();
    g.mapOrder({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    const moved = g.squadAllies().filter((a) => a.order === 'move');
    out.mapOrder = moved.length > 0 && moved.every((a) => Math.hypot(a.orderPos.x, a.orderPos.z) < 6);
    g.toggleMap(false);

    // loadout locked by rank, then unlocked
    g.profile.reset();
    g.profile.data.loadout = { primary: 'lmg', gear: 'pouch', optics: 'nvg' };
    g.startMission(0);
    out.lockedPrimary = g.W.id;
    out.lockedGrenades = g.grenades;
    g.profile.data.best = { a: 6000 }; // Captain
    g.startMission(0);
    out.unlockedPrimary = g.W.id;
    out.unlockedGrenades = g.grenades;
    out.lmgMag = g.ammo;
    g.toggleNVG();
    out.nvg = document.body.classList.contains('nvg');
    g.toggleNVG();
    g.showLoadout('menu');
    out.loadoutScreen = document.querySelectorAll('.lo-item').length;
    out.disabledItems = document.querySelectorAll('.lo-item:disabled').length;
    g.profile.reset();
    return out;
  });
  check(r.medic, 'Vakarai squad has a medic');
  check(r.healed >= 95, `the medic treats the player above the natural limit (hp ${r.healed})`);
  check(r.kits === 5, `a treatment uses one field dressing (${r.kits} left)`);
  check(r.regenCap === 60, `without a medic, wounds heal only to 60% (hp ${r.regenCap})`);
  check(r.suppressed, 'fire near a cadre suppresses him');
  check(r.gunnerLmg, 'the support gunner carries the machine gun');
  check(r.cover, 'cover search finds a spot hidden from the threat');
  check(r.jump > 0.5, `Space jumps when standing (${r.jump} m)`);
  check(r.dropped > 0, 'a fallen cadre leaves his weapon on the ground');
  check(/Take the Light machine gun/.test(r.prompt), `the pickup prompt names the weapon ("${r.prompt}")`);
  check(r.primaryAfterPickup === 'lmg' && r.oldDropped, 'taking the machine gun swaps it in and drops the rifle');
  check(r.mapOrder, 'tapping the map sends Bravo team to that spot');
  check(r.lockedPrimary === 't56' && r.lockedGrenades === 3, `locked loadout items fall back to standard issue (${r.lockedPrimary}, ${r.lockedGrenades} grenades)`);
  check(r.unlockedPrimary === 'lmg' && r.unlockedGrenades === 5 && r.lmgMag === 100, `Captain can take the LMG and grenade pouch (${r.unlockedPrimary}, ${r.unlockedGrenades} grenades, ${r.lmgMag} rounds)`);
  check(r.nvg, 'night-vision goggles toggle');
  check(r.loadoutScreen === 7 && r.disabledItems === 0, `loadout screen lists every item (${r.loadoutScreen}, ${r.disabledItems} locked at Captain)`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  check(false, `test crashed: ${e.message}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
