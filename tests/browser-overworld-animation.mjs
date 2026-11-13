import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const url = process.env.PLAY_URL ?? 'http://127.0.0.1:8787';
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: "export { WorldScene } from './apps/web/src/game/world-scene'; export { default as Phaser } from 'phaser'; export { createGame } from '@smw/core'" },
  bundle: true, write: false, format: 'iife', globalName: 'overworld' });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const { coverage, fishPixels, contactSheet } = await page.evaluate(async () => {
    const json = path => fetch('/assets/' + path + '.json').then(r => r.json());
    const campaign = await json('content');
    const nodes = await json('world/nodes');
    const state = overworld.createGame(campaign);
    let ready, failLoad;
    const loaded = new Promise((resolve, reject) => { ready = resolve; failLoad = reject; });
    class ReadyScene extends overworld.WorldScene {
      preload() {
        this.load.on('loaderror', file => failLoad(new Error('Phaser could not load ' + file.src)));
        super.preload();
      }
      create() { super.create(); ready(); }
    }
    const scene = new ReadyScene(campaign, { playerId: 'mario', displayState: state, update() {} },
      nodes, { sample: () => 0 });
    const host = document.createElement('div'); document.body.appendChild(host);
    const game = new overworld.Phaser.Game({ type: overworld.Phaser.CANVAS, width: 256, height: 224,
      parent: host, pixelArt: true, audio: { noAudio: true }, scene: [scene] });
    const deadline = setTimeout(() => failLoad(new Error('The overworld scene did not start')), 30000);
    try { await loaded; } finally { clearTimeout(deadline); }
    const context = scene.terrain.context, canvas = context.canvas;
    const sheet = document.createElement('canvas'); sheet.width = 256 * 4; sheet.height = 224 * 2;
    const coverage = [];
    for (let region = 0; region < 7; region++) {
      const entry = Object.entries(nodes).find(([id,n]) => n.region === region && campaign.routes[id]);
      const [id] = entry;
      state.progress.unlocked = [id]; state.progress.selection = 0;
      state.progress.completed = [];
      const pictures = new Set();
      for (const age of [0, 4, 8, 12, 16, 32, 63, 100]) {
        state.tick = Math.ceil(age * 6 / 5);
        scene.update(0, 0);
        // Compare the world outside a 48 px strip containing the two players.
        const raster = context.getImageData(0, 0, 256, 180).data;
        const n = nodes[id], bg = scene.textures.get('world' + region).getSourceImage();
        const cx = n.x - Math.max(0, Math.min(bg.width - 256, n.x - 128));
        let hash = 0;
        for (let i = 0; i < raster.length; i += 4) if (Math.abs((i / 4 % 256) - cx) > 24)
          hash = Math.imul(31, hash) + raster[i] + 256*raster[i+1] + 65536*raster[i+2] | 0;
        pictures.add(hash);
      }
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      sheet.getContext('2d').putImageData(frame, (region % 4) * 256, (region >> 2) * 224);
      coverage.push({ region, id, pictures: pictures.size });
    }
    const decorations = scene.cache.json.get('map-decorations');
    const fishTrack = decorations.fish;
    const fishPixels = {};
    for (const [route,clip] of Object.entries(fishTrack)) {
      const [from,command] = route.split('/'), edge = campaign.overworldPaths[from].directions[command];
      state.progress.unlocked = [from,edge.to]; state.progress.selection = 1;
      const elapsed = Math.ceil((clip.start+20)*6/5);
      state.mapTravel = { from, command, to:edge.to, elapsed, duration:Math.ceil(edge.frames*6/5) };
      state.tick = elapsed;
      scene.map.hide(); scene.update(0,0);
      const expected = context.getImageData(0,0,256,180).data;
      decorations.fish = {};
      scene.map.hide(); scene.update(0,0);
      const absent = context.getImageData(0,0,256,180).data;
      fishPixels[route] = 0;
      for (let i=0;i<absent.length;i+=4)
        if (absent[i] !== expected[i] || absent[i+1] !== expected[i+1] || absent[i+2] !== expected[i+2]) fishPixels[route]++;
      decorations.fish = fishTrack;
    }
    game.destroy(true); host.remove();
    return { coverage, fishPixels, contactSheet: sheet.toDataURL().split(',')[1] };
  });
  for (const r of coverage) assert.ok(r.pictures > 1, 'static map ' + JSON.stringify(r));
  for (const [route,count] of Object.entries(fishPixels)) assert.ok(count > 20, 'missing overworld fish '+route+' '+count);
  console.log('Visible Cheep Cheep pixels on each of six native crossings',fishPixels);
  mkdirSync('test-results/animation-review', { recursive: true });
  writeFileSync('test-results/animation-review/overworld.png', Buffer.from(contactSheet, 'base64'));
  console.log('Chromium rendered changing terrain around stationary Mario and Luigi in all seven regions.', coverage);
} finally { await browser.close(); }
