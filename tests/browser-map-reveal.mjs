import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = 'generated/world/';
const json = name => JSON.parse(readFileSync(root+name+'.json','utf8'));
const png = name => 'data:image/png;base64,'+readFileSync(root+name+'.png').toString('base64');
const bundle = await build({
  stdin: { contents: "export {drawMapTiles} from './apps/web/src/game/map-events'; export {drawReveal} from './apps/web/src/game/map-reveal';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'mapTest',
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const pixels = await page.evaluate(async ({events, data, animation, sources}) => {
    const images = {};
    for (const [key, src] of Object.entries(sources)) {
      const img = new Image();
      img.src = src;
      await img.decode();
      images[key] = img;
    }
    const scene = {
      cache: {json:{ get: () => events }},
      textures: {get: key => ({getSourceImage: () => images[key]})},
    };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const exit = '105:normal', clip = data.clips[exit], frames = [];
    for (const [age, clock] of [[3,105],[5,106],[7,107],[9,108],[11,109]]) {
      const reveal = {exit,clip,age};
      ctx.drawImage(images.map, -48, -120);
      mapTest.drawMapTiles(scene,ctx,1,[exit],-48,-120,animation,animation.phases[clock],reveal);
      mapTest.drawReveal(scene,ctx,data,reveal,-48,-120);
      frames.push(Array.from(ctx.getImageData(0,0,16,16).data));
    }
    canvas.width = 192;
    canvas.height = 128;
    // Native viewport crops for the four switch-palace OBJ layers at PAL frame 34.
    for (const [course,x,y] of [['014',15,184],['121',15,-8],['11b',15,0],['008',15,120]]) {
      const exit = course+':normal';
      ctx.clearRect(0,0,canvas.width,canvas.height);
      mapTest.drawReveal(scene,ctx,data,{exit,clip:data.clips[exit],age:34},-x,-y);
      frames.push(Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data));
    }
    return frames;
  }, {events:json('events'), data:json('reveal'), animation:json('animation')[1], sources:{
    map:png('1'),'map-event-tiles':png('events'),'map-animated-tiles':png('animation'),'map-reveal-tiles':png('reveal'),
  }});
  // Independent full Snes9x framebuffer, Yoshi's Island 1 normal exit.
  const hashes = pixels.map(frame => createHash('sha256').update(Buffer.from(frame)).digest('hex'));
  assert.deepEqual(hashes, [
    '45b2cab5fca71a524376ed28a63da4a735f1072f2861ac7cdadb844aa126270b',
    '6cb1b9f9e9152a17736070146496c0ce9c8c27043bf5ff7df49e9ce2d185a57a',
    '035c93131c1d495e143129b20603afd2041fbb42d44d3ff58bfee9f2b3961631',
    'b489a3dfec2cc7c2ba92ef84693551f18842536e20f2400163eb6ab07e176fc6',
    '72c61e5d83fb168ddbad66cac281bc048c867e7643588410262fed69eee86d54',
    '23656b1286c121577dc6c867be7a14325bb9a1801ffef7613a5de3dda99eb598',
    '567668f8b6408e2274f1fe703e8afe5e5e1ac3ba26209078468f6d32c6f61a6d',
    '4ce37da86249dc1caa737e16d8014460179176981db839bee6f35c17757d66b2',
    '6162e87776af09ac19a4360a573bc9bbb2446468285e494f00f4da723fb35b1a',
  ]);
  console.log('Chromium matches five PAL road reveal phases and the four original switch-palace launches.');
} finally {
  await browser.close();
}
