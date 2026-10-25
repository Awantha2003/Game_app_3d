// Checks the vehicles, explosives, sniper zoom, support calls and wounded
// allies directly in the running game.
//
//   npm run build && node tests/vehicles.mjs

import { chromium } from 'playwright';
import { preview } from 'vite';

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`);
  if (!ok) failures++;
};

const server = await preview({ preview: { port: 4178, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_/.test(m.text())) errors.push(m.text()); });

try {
  await page.goto('http://localhost:4178/');
  await page.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 120000 });
  const r = await page.evaluate(() => {
    const g = window.__game, out = {}, inp = g.input;
    g.renderer.setAnimationLoop(null);
    const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
    const press = (k) => { inp.pressed.add(k); g.update(1 / 30); };
    const calm = () => { for (const u of g.units) if (u.team === 'ltte') { u.alive = false; u.hp = 0; } };
    const start = (i) => { g.openBriefing(i); g.beginMission(); g.skipInsertion(); g.state = 'playing'; };

    // ---- weapons: four slots, sniper zoom, RPG, smoke, C4
    start(0);
    out.slots = g.weapons.map((w) => w.id).join();
    out.wbar = document.querySelectorAll('.wbar .wslot').length;
    press('Digit3');
    inp.aim = true;
    g.update(1 / 30);
    out.scoped = g.isScoped();
    const f0 = g.camera.fov;
    inp.wheel = -1; g.update(1 / 30);
    out.zoomIn = g.camera.fov < f0 - 1;
    press('Minus'); press('Minus');
    out.zoomOut = g.camera.fov > f0 + 1;
    inp.aim = false;
    press('Digit4');
    out.rpg = g.W.id === 'rpg';
    // a rocket at a cadre a short way off
    const target = g.units.find((u) => u.team === 'ltte' && u.alive && !u.towerCenter);
    const T = g.player.pos.constructor;
    const pp = g.player.pos;
    target.pos.set(pp.x, g.world.height(pp.x, pp.z - 14), pp.z - 14);
    target.state = 'idle';
    g.yaw = Math.PI; g.pitch = -0.05;
    g.updateCamera(1 / 30, true);
    const aimAt = target.pos.clone().setY(target.pos.y + 1).sub(g.camera.position).normalize();
    g.yaw = Math.atan2(aimAt.x, aimAt.z); g.pitch = Math.asin(aimAt.y);
    g.updateCamera(1 / 30, true);
    g.fireCooldown = 0; g.reloading = 0;
    inp.fire = true; g.update(1 / 30); inp.fire = false;
    out.rocketFlying = g.projectiles.some((p) => p.kind === 'rocket');
    step(30);
    out.rocketKilled = !target.alive;
    // smoke blocks sight
    calm();
    press('KeyY');
    out.smokeSelected = g.throwType === 'smoke';
    g.addSmoke(new T(pp.x, g.world.height(pp.x, pp.z - 8), pp.z - 8), false);
    const a = new T(pp.x, pp.y + 1.5, pp.z - 16), b = new T(pp.x, pp.y + 1.5, pp.z);
    out.smokeBlocks = g.world.smokeBlocks(a, b);
    // C4: place, walk away, detonate
    const c4 = g.units.find((u) => u.team === 'ltte');
    c4.alive = true; c4.hp = 100; c4.downed = false;
    g.throwType = 'c4';
    press('KeyG');
    out.c4Placed = g.c4Placed.length === 1;
    c4.pos.copy(g.c4Placed[0].pos).add(new T(1.5, 0, 0));
    g.player.pos.z += 15;
    press('KeyU');
    out.c4Killed = !c4.alive && g.c4Placed.length === 0;

    // ---- wounded allies: down, then patched up by the player
    start(0);
    calm();
    const ally = g.squadAllies().find((u) => u.role !== 'medic');
    ally.damage(999, null);
    out.allyDown = ally.downed && ally.alive;
    out.notTarget = !g.units.find((u) => u.team === 'ltte')?.hostiles?.().includes(ally);
    g.player.pos.copy(ally.pos).add(new T(1, 0, 0));
    inp.touchAction = true; step(30 * 4); inp.touchAction = false;
    out.revived = !ally.downed && ally.hp > 40;
    // friendly fire wounds
    const hp0 = ally.hp;
    g.bulletHit({ kind: 'unit', unit: ally, point: ally.pos.clone() }, 36, 120, () => null);
    out.friendlyFire = ally.hp < hp0;

    // ---- vehicles
    out.types = g.vehicles.map((v) => v.type).join();
    // Buffel: board, drive, the section mounts up, get out
    const apc = g.vehicles.find((v) => v.type === 'buffel');
    g.player.pos.copy(apc.pos).add(new T(apc.cfg.box[0] + 1.2, 0, 0));
    g.squadAllies().forEach((u) => { u.pos.copy(g.player.pos).add(new T(2, 0, 2)); });
    press('KeyF');
    out.inApc = g.vehicle === apc && document.body.classList.contains('invehicle');
    out.mounted = g.squadAllies().filter((u) => u.vehicle === apc).length;
    const s0 = apc.pos.clone();
    inp.keys.add('KeyW'); step(60); inp.keys.delete('KeyW');
    out.apcMoved = Math.round(apc.pos.distanceTo(s0));
    out.playerWithApc = g.player.pos.distanceTo(apc.pos) < 2;
    inp.fire = true; step(10); inp.fire = false;
    out.apcGun = apc.heat > 0;
    step(60);
    press('KeyF');
    out.apcExit = !g.vehicle && g.squadAllies().every((u) => !u.vehicle) && g.player.obj.visible;
    // enemy fire hits the hull, not the soldier inside
    press('KeyF');
    const hpBefore = apc.hp, plBefore = g.player.hp;
    const shooter = g.units.find((u) => u.team === 'ltte');
    shooter.alive = true; shooter.hp = 100; shooter.weaponId = 't56';
    shooter.pos.set(apc.pos.x + 20, g.world.height(apc.pos.x + 20, apc.pos.z), apc.pos.z);
    for (let k = 0; k < 40; k++) { shooter.fireTimer = 0; shooter.burst = 1; shooter.fireAt(g.player, 20, 0.01); }
    out.hullHit = apc.hp < hpBefore && g.player.hp === plBefore;
    shooter.alive = false;
    press('KeyF');

    // helicopter: spin up, climb, fly, fire a rocket, land, get out
    const heli = g.vehicles.find((v) => v.type === 'heli');
    g.player.pos.copy(heli.pos).add(new T(heli.cfg.box[0] + 1.2, 0, 0));
    press('KeyF');
    out.inHeli = g.vehicle === heli;
    step(30 * 4);
    inp.keys.add('Space'); step(30 * 3); inp.keys.delete('Space');
    out.heliAlt = Math.round(heli.pos.y - heli.groundAt(heli.pos.x, heli.pos.z));
    const h0 = heli.pos.clone();
    inp.keys.add('KeyW'); step(60); inp.keys.delete('KeyW');
    out.heliFlew = Math.round(Math.hypot(heli.pos.x - h0.x, heli.pos.z - h0.z));
    press('KeyF');
    out.heliNoExitInAir = g.vehicle === heli;
    const ammo0 = heli.altAmmo;
    press('KeyG');
    out.heliRocket = heli.altAmmo === ammo0 - 1 && g.projectiles.some((p) => p.kind === 'rocket');
    inp.keys.add('KeyC'); step(30 * 8); inp.keys.delete('KeyC');
    out.heliLanded = !heli.airborne;
    press('KeyF');
    out.heliExit = !g.vehicle;

    // jet: take off, fly, drop a bomb, return to base
    const jet = g.vehicles.find((v) => v.type === 'jet');
    if (jet) {
      g.player.pos.copy(jet.pos).add(new T(jet.cfg.box[0] + 1.2, 0, 0));
      press('KeyF');
      out.inJet = g.vehicle === jet;
      g.pitch = 0.3;
      inp.keys.add('KeyW'); step(30 * 5); inp.keys.delete('KeyW');
      out.jetAirborne = jet.airborne && jet.alive;
      out.jetAlt = Math.round(jet.pos.y - jet.groundAt(jet.pos.x, jet.pos.z));
      press('KeyG');
      out.jetBomb = g.projectiles.some((p) => p.kind === 'bomb');
      step(30 * 4);
      press('KeyF');
      out.jetHome = !g.vehicle && !jet.airborne && Math.hypot(jet.pos.x - jet.home.x, jet.pos.z - jet.home.z) < 1;
    }

    // ---- support: reinforcements, artillery, supply drop
    start(0);
    calm();
    const n0 = g.squadAllies().length;
    g.support.call('reinforce');
    out.reinforcements = g.squadAllies().length - n0;
    g.strikeMark = new T(pp.x, g.world.height(pp.x, pp.z - 80), pp.z - 80);
    const e2 = g.units.find((u) => u.team === 'ltte');
    e2.alive = true; e2.hp = 100; e2.downed = false;
    e2.pos.copy(g.strikeMark);
    g.support.call('artillery');
    out.artilleryLeft = g.support.uses.artillery;
    step(30 * 16);
    out.artilleryHit = !e2.alive;
    // refused near your own soldiers
    g.strikeMark = g.player.pos.clone();
    g.support.call('airstrike');
    out.dangerClose = g.support.uses.airstrike === 1;
    const sup0 = g.world.supplies.length;
    g.support.call('supply');
    step(30 * 20);
    out.supplyDropped = g.world.supplies.length === sup0 + 1;

    // the boat, on a mission with open water (Nandikadal)
    start(9);
    const boat = g.vehicles.find((v) => v.type === 'boat');
    out.boat = !!boat;
    if (boat) {
      const spot = g.exitSpot(boat, 60);
      out.boatShore = !!spot;
      g.player.pos.copy(boat.pos);
      g.enterVehicle(boat);
      const b0 = boat.pos.clone();
      inp.keys.add('KeyW'); step(45); inp.keys.delete('KeyW');
      out.boatMoved = Math.round(boat.pos.distanceTo(b0));
      out.boatOnWater = g.world.isWater(boat.pos.x, boat.pos.z, 0.3);
    }
    return out;
  });

  console.log(JSON.stringify(r));
  check(r.slots === 't56,pistol,svd,rpg' && r.wbar === 4, `four weapon slots on the weapon bar (${r.slots})`);
  check(r.scoped && r.zoomIn && r.zoomOut, 'the sniper scope zooms in and out (wheel, + and −)');
  check(r.rpg && r.rocketFlying && r.rocketKilled, 'the RPG fires a rocket that kills a cadre');
  check(r.smokeSelected && r.smokeBlocks, 'smoke grenades are selectable and block sight lines');
  check(r.c4Placed && r.c4Killed, 'C4 is placed and detonated from a distance');
  check(r.allyDown && r.notTarget && r.revived, 'a badly hit soldier goes down, is not shot at, and is patched up');
  check(r.friendlyFire, 'friendly fire wounds your own soldiers');
  check(/buffel/.test(r.types) && /heli/.test(r.types) && /jet/.test(r.types), `vehicles at the start (${r.types})`);
  check(r.inApc && r.mounted > 0 && r.apcMoved > 8 && r.playerWithApc, `Buffel: board, the section mounts (${r.mounted}), drive ${r.apcMoved} m`);
  check(r.apcGun && r.apcExit, 'Buffel: the roof gun fires and everyone gets out');
  check(r.hullHit, 'enemy fire hits the hull, not the driver');
  check(r.inHeli && r.heliAlt > 8 && r.heliFlew > 15 && r.heliNoExitInAir, `helicopter: climbs ${r.heliAlt} m and flies ${r.heliFlew} m; no getting out in the air`);
  check(r.heliRocket && r.heliLanded && r.heliExit, 'helicopter: rocket pods fire, it lands and you get out');
  check(r.inJet && r.jetAirborne && r.jetAlt > 10 && r.jetBomb && r.jetHome, `jet: takes off (${r.jetAlt} m), drops a bomb and returns to base`);
  check(r.reinforcements === 3, `reinforcements: a fire team of ${r.reinforcements} joins`);
  check(r.artilleryLeft === 0 && r.artilleryHit, 'artillery hits the marked target');
  check(r.dangerClose, 'an air strike on your own position is refused');
  check(r.supplyDropped, 'a supply crate is dropped');
  check(r.boat && r.boatShore && r.boatMoved > 5 && r.boatOnWater, `navy boat: moves ${r.boatMoved} m and stays on the water`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  check(false, `test crashed: ${e.message}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
