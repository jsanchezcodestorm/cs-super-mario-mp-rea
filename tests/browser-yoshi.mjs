import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: [
    "export { CastView } from './apps/web/src/game/cast-view'",
    "export { ObjectPlanes } from './apps/web/src/game/object-planes'",
    "export { Buttons } from './packages/core/src'",
  ].join('\n') }, bundle: true, write: false, format: 'iife', globalName: 'game',
});
const browser = await chromium.launch();
const dir = resolve('test-results/yoshi-tongue');
mkdirSync(dir, { recursive: true });
try {
  const page = await browser.newPage();
  await page.route('http://yoshi.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<html></html>' });
    return route.fulfill({ path: resolve('generated', path.slice(1)) });
  });
  await page.goto('http://yoshi.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const textures = {}, regs = {};
    for (const name of ['creatures', 'actors']) {
      const img = new Image(); img.src = '/' + name + '.png'; await img.decode();
      const atlas = (await (await fetch('/' + name + '.json')).json()).frames;
      regs[name] = await (await fetch('/' + name + '-registration.json')).json();
      textures[name] = {
        has: key => key in atlas,
        get(key) {
          const { x: cutX, y: cutY, w: cutWidth, h: cutHeight } = atlas[key].frame;
          return { source: { image: img }, cutX, cutY, cutWidth, cutHeight };
        },
      };
    }
    const scene = { textures: { get: name => textures[name] }, cache: { json: { get: () => ({}) } } };
    const canvas = document.createElement('canvas'); canvas.width = 144; canvas.height = 68;
    const ctx = canvas.getContext('2d'), center = 72, feet = 64;
    const p = { x: center - 6, y: feet - 16, height: 16, width: 12, id: 'mario', facing: 1,
      status: 'alive', form: 'small', mounted: true, yoshiColor: 'green', roomId: '105', vx: 0, vy: 0, grounded: true };
    const state = { players: { mario: p, luigi: { status: 'spectator' } }, entities: [], tick: 50 };
    const stage = { id: '105', spriteTileset: 8 };
    function render(visible) {
      const parts = new game.ObjectPlanes(canvas.width, canvas.height);
      const view = new game.CastView(scene, parts, regs);
      const chunks = [];
      const queue = parts.queue.bind(parts);
      parts.queue = part => { chunks.push(part); if (visible(part)) queue(part); };
      view.draw(stage, { x: 0, y: 0 }, state);
      parts.compose();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 4; i++) parts.paint(ctx, i);
      return { pixels: new Uint32Array(ctx.getImageData(0,0,canvas.width,canvas.height).data.buffer), chunks };
    }
    const out = [];
    for (const f of [1,-1]) for (const up of [false,true]) {
      p.facing = f; p.lastInput = up ? game.Buttons.up : 0;
      p.form = up ? 'super' : 'small';
      p.tongueFrame = 19; p.tongue = 33;
      const mount = render(part => part.oam >= 72).pixels;
      const tongue = render(part => part.oam <= 7).pixels;
      const all = render(() => true);
      let overlap = 0, covered = 0, exposed = 0;
      for (let i = 0; i < all.pixels.length; i++) {
        if (tongue[i] && mount[i]) { overlap++; if (all.pixels[i] === mount[i]) covered++; }
        if (tongue[i] && !mount[i] && all.pixels[i] === tongue[i]) exposed++;
      }
      const coords = all.chunks.filter(c => c.oam <= 7).map(c => [c.x,c.y,c.oam,c.priority]);
      const screenshot = canvas.toDataURL().split(',')[1];
      out.push({ f, up, coords, overlap, covered, exposed, screenshot });
    }
    return out;
  });
  for (const row of result) {
    const { f, up, overlap, covered, exposed } = row;
    assert.ok(overlap > 0 && overlap === covered && exposed > 0);
    assert.deepEqual(row.coords, Array.from({ length:5 }, (_,i) =>
      [72 + f * ((up ? 17 : 22) + i * 8) - 4, 64 - (up ? 24 : 13), 3+i, 2]));
    writeFileSync(resolve(dir, 'web-' + f + '-' + Number(up) + '.png'), Buffer.from(row.screenshot, 'base64'));
    console.log('Direction %s, Up %s, %s shared opaque pixels show Yoshi; %s tongue pixels exposed.', f, up, covered, exposed);
  }
} finally { await browser.close(); }
