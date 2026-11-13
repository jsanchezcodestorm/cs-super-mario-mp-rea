import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: {
    contents: "export { ObjectPlanes } from './apps/web/src/game/object-planes'; export { drawRoom } from './apps/web/src/game/terrain-view'",
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: 'iife', globalName: 'priorityTest',
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const surface = (w, h, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); }
      return ctx;
    };
    const target = surface(256, 224), atlas = surface(512, 16);
    atlas.fillStyle = '#00ff00'; atlas.fillRect(16, 0, 16, 16);
    const red = surface(16, 16, '#ff0000'), blue = surface(16, 16, '#0000ff');
    const objects = new priorityTest.ObjectPlanes(256, 224);
    function obj(ctx, priority, oam, addSubscreen = false) {
      objects.queue({ image: ctx.canvas, sx: 0, sy: 0, w: 16, h: 16, x: 0, y: 0, priority, oam, addSubscreen });
    }
    function observe(mask, onBG2 = false, sub = false) {
      objects.compose();
      const grid = { width: 1, height: 1, tiles: [1] };
      const stage = { ...grid, id: 'r', mode: 2, backgroundColor: '#000000', tiles: [onBG2 ? 0 : 1],
        background: onBG2 ? { ...grid, repeat: false } : undefined };
      const state = { tick: 0, tileChanges: {}, layerOffsets: {}, progress: { completed: [] } };
      priorityTest.drawRoom(target, stage, atlas.canvas, { x: 0, y: 0 }, state, [0, mask], objects,
        sub ? { main: 0x15, sub: 2 } : { main: 0x17, sub: 0 });
      return [[1, 1], [1, 9], [9, 1], [9, 9]].map(([x, y]) => {
        const [r,g,b] = target.getImageData(x,y,1,1).data;
        return r ? 'R' : g ? 'G' : b ? 'B' : '-';
      }).join('');
    }
    const out = [];
    for (let i=0; i<4; i++) { obj(red, i, 10); out.push(observe(6)); }
    obj(blue,3,25); obj(red,1,10); out.push(observe(0));
    red.clearRect(8,0,8,16);
    obj(blue,3,25); obj(red,1,10); out.push(observe(0));
    obj(blue,2,10); out.push(observe(15,true));
    obj(blue,2,10); out.push(observe(15,true,true));
    // A partly opaque red OBJ in front keeps its own colour. A blue fog OBJ
    // showing through its holes adds only the green BG2 sub-screen pixel.
    obj(blue,3,15,true); obj(red,3,10); observe(15,true,true);
    out.push(...[1,9].map(x=>Array.from(target.getImageData(x,1,1,1).data).join(',')));
    obj(blue,3,15); observe(15,true,true);
    out.push(Array.from(target.getImageData(9,1,1,1).data).join(','));
    return out;
  });
  assert.deepEqual(result, ['GGGG','GGGG','RGGR','RRRR','GGGG','GGBB','GGGG','BBBB',
    '255,0,0,255','0,255,255,255','0,0,255,255']);
  console.log('Chromium verified the four OBJ priorities, mixed Map16 quadrants, OAM holes, and main/sub BG2.');
} finally {
  await browser.close();
}
