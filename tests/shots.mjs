// Renders a gameplay screenshot of each mission for visual review.
//   node tests/shots.mjs <outdir> [quality] [mission indices...]
import { chromium } from 'playwright';
import { preview } from 'vite';

const [out = 'shots', quality = 'high', ...rest] = process.argv.slice(2);
// "close" frames the squad from the front instead of the player's view
const close = rest[0] === 'close';
if (close) rest.shift();
const only = rest.map(Number);
const server = await preview({ preview: { port: 4175, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4175/');
await page.waitForSelector('[data-screen="start"]:not(.hidden)', { timeout: 120000 });
for (const i of only.length ? only : [0, 1, 2, 3, 4, 5]) {
  const info = await page.evaluate(async ([mi, q, close]) => {
    const g = window.__game;
    g.profile.setSetting('quality', q);
    g.renderer.setAnimationLoop(null);
    g.openBriefing(mi);
    g.beginMission();
    g.skipInsertion();
    for (let k = 0; k < 20; k++) g.update(1 / 30);
    g.updateCamera(1 / 30, true);
    if (close) {
      const p = g.player.pos;
      g.camera.position.set(p.x + 0.9, p.y + 1.4, p.z - 2.4);
      g.camera.lookAt(p.x, p.y + 0.95, p.z);
      g.camera.fov = 38;
      g.camera.updateProjectionMatrix();
      document.querySelector('#hud').style.display = 'none';
    }
    g.world.update(0.03, g.camera, g.time);
    g.weather?.update(0.03, g.camera);
    g.postfx.render(0.03);
    // count the whole frame (all passes), not only the last one
    g.renderer.info.autoReset = false;
    g.renderer.info.reset();
    g.postfx.render(0.03);
    const r = g.renderer.info.render;
    const out = { calls: r.calls, tris: r.triangles, programs: g.renderer.info.programs.length };
    g.renderer.info.autoReset = true;
    return out;
  }, [i, quality, close]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/m${i + 1}_${quality}${close ? '_close' : ''}.png`, timeout: 300000 });
  console.log(`mission ${i + 1}`, JSON.stringify(info));
}
console.log(errors.length ? `errors: ${errors.slice(0, 5).join(' | ')}` : 'no errors');
await browser.close();
server.httpServer.close();
