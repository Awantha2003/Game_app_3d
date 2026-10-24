// Co-op test: three browser pages (a host and two friends) connect through a
// local PeerServer. Checks names, the invite link, text and voice chat, the
// mission start, unit sync between all players, hits, objectives, the end of
// the mission and a player leaving.
//
//   npm run test:coop               (Server 1: Trystero, through a local relay)
//   COOP_VIA=p npm run test:coop    (Server 2: PeerJS, through a local PeerServer)

import { chromium } from 'playwright';
import { createWsRelayServer } from '@trystero-p2p/ws-relay/server';
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
const VIA = process.env.COOP_VIA === 'p' ? 'p' : 'n';
const signal = VIA === 'p' ? PeerServer({ port: 9000, host: '127.0.0.1', path: '/' }) : createWsRelayServer({ port: 8787, host: '127.0.0.1' });
const query = VIA === 'p' ? '?peer=127.0.0.1:9000' : '?relay=ws://127.0.0.1:8787';
console.log(`  (connection: ${VIA === 'p' ? 'Server 2, PeerJS' : 'Server 1, Trystero'})`);
const server = await preview({ preview: { port: 4176, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const open = async (url) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  return page;
};
// run the game loop without rendering, so the pages keep up in software GL
const run = (page) => page.evaluate(() => {
  const g = window.__game;
  g.renderer.setAnimationLoop(null);
  clearInterval(window.__loop);
  window.__loop = setInterval(() => { g.update(1 / 30); g.net.update(1 / 30); }, 33);
});
const setName = (page, name) => page.evaluate((n) => { document.querySelector('.coop-name').value = n; window.__game.saveCoopName(); }, name);

try {
  const host = await open(`http://localhost:4176/${query}`);
  await host.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 120000 });
  await run(host);
  await host.evaluate(() => { window.__game.showCoop(); });
  await setName(host, 'Awantha');
  await host.evaluate((via) => window.__game.net.host(via), VIA);
  check(await until(host, () => !!window.__game.net.id), 'host gets a co-op id');
  const link = await host.evaluate(() => window.__game.net.inviteLink());
  check(/join=/.test(link), 'invite link created');
  check(await host.evaluate(() => !document.querySelector('[data-act="coop-share"]').closest('.hidden')), 'share and WhatsApp buttons are offered');

  const g1 = await open(link);
  const g2 = await open(link);
  for (const [p, name] of [[g1, 'Kasun'], [g2, 'Nimal']]) {
    await p.waitForSelector('[data-screen="coop"]:not(.hidden)', { timeout: 120000 });
    await run(p);
    const joined = await until(p, () => !!window.__game.net.myNid);
    check(joined, `${name} joins from the invite link${joined ? '' : ` (status: ${await p.evaluate(() => window.__game.net.status)})`}`);
    await setName(p, name);
  }
  check(await until(host, () => window.__game.net.roster.map((r) => r.name).sort().join() === 'Awantha,Kasun,Nimal'),
    `everyone sees the player names (${await host.evaluate(() => window.__game.net.roster.map((r) => r.name).join(', '))})`);
  check(await until(g2, () => window.__game.net.roster.length === 3), 'friends see each other in the lobby');

  // text chat goes to everyone, through the host
  await g1.evaluate(() => window.__game.net.chat('Ready when you are'));
  check(await until(g2, () => window.__game.chatLog.some((l) => l.text === 'Ready when you are' && l.name === 'Kasun')), 'a chat message reaches the other friend');
  check(await until(host, () => window.__game.chatLog.some((l) => l.text === 'Ready when you are')), 'and the host');

  // voice: Kasun turns on his microphone and the others receive it
  await g1.evaluate(() => window.__game.net.setMic(true));
  check(await until(g1, () => window.__game.net.micOn), 'the microphone turns on');
  check(await until(host, () => window.__game.net.voices.size > 0, null, 20000), 'the host receives Kasun\'s voice');
  check(await until(g2, () => window.__game.net.voices.size > 0, null, 20000), 'Nimal receives Kasun\'s voice too');

  await host.evaluate(() => window.__game.coopHostStart(0));
  for (const [p, name] of [[g1, 'Kasun'], [g2, 'Nimal']]) {
    check(await until(p, () => window.__game.state === 'playing' && window.__game.missionIndex === 0, null, 60000), `${name} starts the same mission`);
  }
  for (const p of [host, g1, g2]) await run(p);
  await wait(3000);

  check(await host.evaluate(() => window.__game.partners.size === 2), 'the host has both friends in the mission');
  check(await g1.evaluate(() => window.__game.partners.size === 2), 'each friend sees the host and the other friend');
  const count = (page) => page.evaluate(() => window.__game.units.filter((u) => u.team === 'ltte' && u.alive).length);
  const counts = [await count(host), await count(g1), await count(g2)];
  check(counts[0] > 0 && counts.every((c) => c === counts[0]), `same number of hostiles everywhere (${counts.join(' / ')})`);

  // Kasun moves; Nimal sees him there (relayed through the host)
  await g1.evaluate(() => { const p = window.__game.player; p.pos.x += 6; p.pos.z -= 6; });
  await wait(2000);
  const kasun = await g1.evaluate(() => window.__game.player.pos.toArray());
  const seen = await g2.evaluate(() => { const u = [...window.__game.partners.values()].find((x) => x.name === 'Kasun'); return u?.pos.toArray(); });
  const d = seen ? Math.hypot(kasun[0] - seen[0], kasun[2] - seen[2]) : 99;
  check(d < 1.5, `Nimal sees Kasun where Kasun is (${d.toFixed(2)} m)`);
  const names = await g2.evaluate(() => [...window.__game.partners.values()].map((u) => u.name).sort().join(', '));
  check(names === 'Awantha, Kasun', `soldiers carry the players' names (${names})`);

  const target = await host.evaluate(() => window.__game.units.find((x) => x.team === 'ltte' && x.alive).nid);
  await g1.evaluate((nid) => window.__game.net.send({ t: 'hit', nid, dmg: 500, aimed: false }), target);
  check(await until(g2, (nid) => !window.__game.units.find((x) => x.nid === nid)?.alive, target, 6000), 'Kasun\'s hit kills a cadre for everyone');

  await host.evaluate(() => { const g = window.__game; for (const u of g.units) if (u.team === 'ltte' && u.tag === 'outpost') u.damage(999, g.player); });
  check(await until(g2, () => window.__game.objIndex === 1, null, 8000), 'objective progress reaches every friend');

  await host.evaluate(() => window.__game.missionComplete());
  check(await until(g1, () => window.__game.state === 'complete', null, 30000), 'mission completion reaches the friends');
  check(await until(g2, () => window.__game.state === 'complete' && window.__game.profile.xp > 0, null, 30000), 'friends earn XP');

  await host.evaluate(() => window.__game.coopHostStart(0));
  check(await until(g1, () => window.__game.state === 'playing', null, 60000), 'the host can start another mission');
  await wait(2000);
  await g2.close();
  check(await until(host, () => window.__game.partners.size === 1, null, 40000), 'when Nimal leaves, the host carries on with Kasun');
  check(await until(g1, () => window.__game.chatLog.some((l) => /Nimal left/.test(l.text)), null, 40000), 'Kasun is told that Nimal left');
  check(await host.evaluate(() => window.__game.state === 'playing'), 'the mission keeps going');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  check(false, `test crashed: ${e.message}`);
} finally {
  await browser.close();
  server.httpServer.close();
  signal.close?.();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
