// Co-op test: two browser pages connect through a local PeerServer, the host
// starts a mission and the test checks that units, hits, objectives and a
// disconnect are synchronised.
//
//   npm run test:coop

import { chromium } from 'playwright';
import { PeerServer } from 'peer';
import { build, preview } from 'vite';

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(page, fn, arg, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(250);
  }
  return false;
}

await build({ logLevel: 'warn' });
const peerServer = PeerServer({ port: 9000, host: '127.0.0.1', path: '/' });
const server = await preview({ preview: { port: 4176, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext()).newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  return page;
};
// run the game loop without rendering, so both pages keep up in software GL
const run = (page) => page.evaluate(() => {
  const g = window.__game;
  g.renderer.setAnimationLoop(null);
  clearInterval(window.__loop);
  window.__loop = setInterval(() => { g.update(1 / 30); g.net.update(1 / 30); }, 33);
});

try {
  const host = await open('http://localhost:4176/?peer=127.0.0.1:9000');
  await host.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 120000 });
  await run(host);
  await host.evaluate(() => window.__game.net.host());
  check(await until(host, () => !!window.__game.net.id), 'host gets a co-op id');
  const link = await host.evaluate(() => window.__game.net.inviteLink());
  check(/join=/.test(link), `invite link created (${link.replace(/join=[^&]+/, 'join=…')})`);

  const guest = await open(link);
  await guest.waitForSelector('[data-screen="coop"]:not(.hidden)', { timeout: 120000 });
  check(true, 'invite link opens the co-op screen');
  await run(guest);
  check(await until(guest, () => window.__game.net.connected), 'guest connects to the host');
  check(await until(host, () => window.__game.net.connected), 'host sees the guest');

  await host.evaluate(() => window.__game.coopHostStart(0));
  check(await until(guest, () => window.__game.state === 'playing' && window.__game.missionIndex === 0), 'guest starts the same mission');
  await run(host);
  await run(guest);
  await wait(3000);

  const count = (page) => page.evaluate(() => window.__game.units.filter((u) => u.team === 'ltte' && u.alive).length);
  const [hc, gc] = [await count(host), await count(guest)];
  check(hc > 0 && hc === gc, `same number of hostiles on both machines (${hc} / ${gc})`);
  const hostUnit = await host.evaluate(() => { const u = window.__game.units.find((x) => x.team === 'ltte' && x.alive); return { nid: u.nid, p: u.pos.toArray() }; });
  const guestPos = await guest.evaluate((nid) => window.__game.units.find((x) => x.nid === nid)?.pos.toArray(), hostUnit.nid);
  const dist = guestPos ? Math.hypot(guestPos[0] - hostUnit.p[0], guestPos[2] - hostUnit.p[2]) : 99;
  check(dist < 3, `unit positions agree (${dist.toFixed(2)} m apart)`);

  await guest.evaluate(() => { const p = window.__game.player; p.pos.x += 6; p.pos.z -= 6; });
  await wait(1500);
  const sep = await Promise.all([
    guest.evaluate(() => window.__game.player.pos.toArray()),
    host.evaluate(() => window.__game.partner?.pos.toArray()),
  ]);
  const pd = sep[1] ? Math.hypot(sep[0][0] - sep[1][0], sep[0][2] - sep[1][2]) : 99;
  check(pd < 1.5, `host sees the guest soldier where the guest is (${pd.toFixed(2)} m)`);

  // a hit reported by the guest is applied by the host and shown on the guest
  await guest.evaluate((nid) => window.__game.net.send({ t: 'hit', nid, dmg: 500, aimed: false }), hostUnit.nid);
  check(await until(host, (nid) => !window.__game.units.find((x) => x.nid === nid)?.alive, hostUnit.nid, 5000), 'guest hit kills the cadre on the host');
  check(await until(guest, (nid) => !window.__game.units.find((x) => x.nid === nid)?.alive, hostUnit.nid, 5000), 'the kill appears on the guest');

  // finishing an objective on the host moves the guest on too
  await host.evaluate(() => { const g = window.__game; for (const u of g.units) if (u.team === 'ltte' && u.tag === 'outpost') u.damage(999, g.player); });
  check(await until(guest, () => window.__game.objIndex === 1, null, 8000), 'objective progress reaches the guest');

  // the end of the mission reaches the guest, who earns XP too
  await host.evaluate(() => window.__game.missionComplete());
  check(await until(guest, () => window.__game.state === 'complete', null, 30000), 'mission completion reaches the guest');
  check(await guest.evaluate(() => window.__game.profile.xp > 0), 'the guest earns XP for the co-op mission');

  // play again, then the guest leaves: the host carries on alone
  await host.evaluate(() => window.__game.coopHostStart(0));
  check(await until(guest, () => window.__game.state === 'playing', null, 60000), 'host can start another co-op mission');
  await wait(2000);

  // the guest leaves: the host carries on alone
  await guest.close();
  check(await until(host, () => !window.__game.net.connected && !window.__game.partner, null, 40000), 'host notices the disconnect and removes the partner');
  check(await host.evaluate(() => window.__game.state === 'playing'), 'host keeps playing after the partner leaves');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  check(false, `test crashed: ${e.message}`);
} finally {
  await browser.close();
  server.httpServer.close();
  peerServer.close?.();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
