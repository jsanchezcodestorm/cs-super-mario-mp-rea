import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: [
    "export { default as Phaser } from 'phaser'",
    "export { WorldScene } from './apps/web/src/game/world-scene'",
    "export { Playback } from './apps/web/src/game/playback'",
    "export { cameraFor } from './apps/web/src/game/terrain-view'",
    "export { createGame, palFrame } from '@smw/core'",
    "export { enterRoom } from './packages/core/src/state'",
    "export { moveEntity } from './packages/core/src/entity-motion'",
  ].join('\n') }, bundle: true, write: false, format: 'iife', globalName: 'plantTest',
});
const cases = [
  { room: '105', x: 1808, sprite: 0x4f, upright: true },
  { room: '125', x: 256, sprite: 0x50, upright: true },
  { room: '119', x: 2832, sprite: 0x4f, upright: true },
  { room: '10a', x: 2992, sprite: 0x2a, upright: false },
  { room: '0c7', x: 1712, sprite: 0x4f, upright: true, floorOffset: 16 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.PLAY_URL ?? 'http://127.0.0.1:8787');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const results = await page.evaluate(async cases => {
    const game = plantTest;
    const get = file => fetch('/assets/' + file + '.json').then(r => r.json());
    const [campaign, nodes] = await Promise.all([get('content'), get('world/nodes')]);
    let live;
    const session = { get displayState() { return live?.displayState; }, get playerId() { return live?.playerId; }, update() {} };
    let ready, fail;
    const started = new Promise((ok, bad) => { ready = ok; fail = bad; });
    class Scene extends game.WorldScene {
      preload() { this.load.on('loaderror', file => fail(Error('Failed to load '+file.src))); super.preload(); }
      create() { super.create(); ready(); }
    }
    const scene = new Scene(campaign, session, nodes, {sample:()=>0});
    const host = document.body.appendChild(document.createElement('div'));
    const phaser = new game.Phaser.Game({ type: game.Phaser.CANVAS, width: 256, height: 224, parent: host,
      audio: {noAudio:true}, pixelArt: true, scene: [scene] });
    const timeout = setTimeout(() => fail(Error('WorldScene did not load')), 30000);
    try { await started; } finally { clearTimeout(timeout); }
    const ctx = scene.terrain.context;
    const output = [];
    for (const spec of cases) {
      const room = campaign.levels[spec.room];
      const spawn = room.sprites.find(e => e.spriteId === spec.sprite && e.x === spec.x);
      const state = game.createGame(campaign), world = {state,campaign};
      state.phase = 'playing';
      for (const p of Object.values(state.players)) game.enterRoom(world,p,room.id,{x:spawn.x-72,y:spawn.y-24});
      const plant = state.entities.find(e => e.spriteId === spec.sprite && e.origin.x === spawn.x);
      state.entities = [plant]; // Isolate the placed sprite, using the complete original room geometry.
      const observer = state.players.mario;
      state.players.luigi.status = 'spectator';
      live = new game.Playback(campaign,'mario',()=>false);
      const camera = game.cameraFor(room,observer.x+observer.width/2,observer.y+observer.height/2);
      const mouthX = spawn.x-camera.x, lipY = spawn.y-camera.y+(spec.floorOffset ?? (spec.upright?0:16));
      const tileCanvas = document.createElement('canvas'), tiles = scene.textures.get(room.atlas).getSourceImage();
      tileCanvas.width=tiles.width; tileCanvas.height=tiles.height;
      const tileContext=tileCanvas.getContext('2d'); tileContext.drawImage(tiles,0,0);
      const ink=tileContext.getImageData(0,0,tiles.width,tiles.height).data;
      function opaque(x,y) {
        const tile=room.tiles[(y>>4)*room.width+(x>>4)];
        return ink[4*((16*(tile>>5)+(y&15))*tiles.width+16*(tile%32)+(x&15))+3]===255;
      }
      const l = mouthX - 4, t = spec.upright ? Math.max(0,lipY-120) : lipY-32;
      const w = 40, h = Math.min(224-t, spec.upright ? lipY+40-t : 118);
      function frame() {
        live.receive(state,0);
        scene.update(0,0);
        return new Uint32Array(ctx.getImageData(l,t,w,h).data.buffer);
      }
      let spawnRow = 0, leaks = 0, loX = Infinity, hiX = -1, peak = 0, peakTick, apex = -1;
      const samples = [];
      let peakState;
      const phaseShots = {};
      const sheet = document.createElement('canvas'); sheet.width=256; sheet.height=224;
      for (let tick=0;tick<=420;tick++) {
        if (tick) { state.tick++; game.moveEntity(world,plant,observer); }
        if (tick % 4) continue;
        const painted = frame();
        plant.active = false; const clear = frame(); plant.active = true;
        let exposed=0, extent=0;
        for (let i=0;i<painted.length;i++) {
          if (painted[i]===clear[i]) continue;
          const x=i%w+l-mouthX, y=Math.floor(i/w)+t-lipY;
          const worldY = Math.floor(i/w)+t+camera.y;
          if (x>=0 && x<32 && (spec.upright ? y>=0 && y<32 : y<0 && y>=-32) && opaque(x+spawn.x,worldY)) leaks++;
          if (worldY>=spawn.y && worldY<spawn.y+16) spawnRow++;
          if (spec.upright ? y<0 : y>=0) {
            exposed++;
            extent = Math.max(extent,spec.upright ? -y : y+1);
            loX = Math.min(loX,x); hiX = Math.max(hiX,x);
          }
        }
        samples.push(exposed);
        if (exposed >= 35 && exposed <= 135 && plant.vy !== 0) {
          const phase = (spec.upright ? plant.vy < 0 : plant.vy > 0) ? 'emerging' : 'returning';
          if (!phaseShots[phase]) {
            frame();
            phaseShots[phase] = ctx.canvas.toDataURL().split(',')[1];
          }
        }
        if (extent>apex || (extent===apex && exposed>peak)) {
          peak=exposed; peakTick=tick; apex=extent;
          peakState=structuredClone(state);
          frame();
          sheet.getContext('2d').putImageData(ctx.getImageData(0,0,256,224),0,0);
        }
      }
      const peakCanvas=sheet.toDataURL().split(',')[1];
      const overlaps = {};
      // A remote rider stands in front of the exposed head. The observer holds the camera fixed.
      for (const seat of ['mario','luigi']) {
        const state=structuredClone(peakState), other=seat==='mario'?'luigi':'mario';
        live = new game.Playback(campaign,other,()=>false);
        Object.assign(state.players[other],{status:'alive',x:observer.x,y:observer.y});
        const p=state.players[seat], e=state.entities[0];
        const headY = lipY+camera.y+(spec.upright?-apex:apex-16);
        Object.assign(p,{status:'alive',x:spawn.x+9,y:headY});
        function layers(withPlant,withPlayer) {
          e.active=withPlant; p.status=withPlayer?'alive':'spectator';
          live.receive(state,0); scene.update(0,0);
          return new Uint32Array(ctx.getImageData(l,t,w,h).data.buffer);
        }
        const bg=layers(false,false), body=layers(false,true), head=layers(true,false), all=layers(true,true);
        let covered=0, conflicts=0;
        for(let i=0;i<all.length;i++) if(head[i]!==bg[i] && body[i]!==bg[i] && body[i]!==head[i]) {
          covered++; if(all[i]!==body[i]) conflicts++;
        }
        overlaps[seat]={covered,conflicts};
      }
      output.push({spec,leaks,spawnRow,x:[loX,hiX],peak,apex,peakTick,samples,overlaps,peakCanvas,phaseShots});
    }
    phaser.destroy(true); host.remove();
    return output;
  },cases);
  assert.deepEqual(errors,[]);
  mkdirSync('test-results/pipe-plants',{recursive:true});
  for (const row of results) {
    const { room }=row.spec;
    writeFileSync('test-results/pipe-plants/'+room+'.png',Buffer.from(row.peakCanvas,'base64'));
    for (const [phase, png] of Object.entries(row.phaseShots))
      writeFileSync('test-results/pipe-plants/'+room+'-'+phase+'.png',Buffer.from(png,'base64'));
    const peakIndex = row.peakTick/4;
    const hidden=row.samples.lastIndexOf(0,peakIndex), after=row.samples.indexOf(0,peakIndex+1);
    console.log(room,{leaks:row.leaks,x:row.x,apex:row.apex,peak:row.peak,peakTick:row.peakTick,
      hidden,after,overlaps:row.overlaps});
    assert.equal(row.leaks,0,room+' draws inside the opaque pipe');
    assert.ok(row.apex>=24 && row.peak>100,room+' head must emerge');
    if (row.spec.floorOffset) {
      assert.ok(row.spawnRow > 0 && row.samples[0] > 0, room+' must spawn visibly in the air above the grass');
    }
    assert.deepEqual(row.x,[8,23],room+' head is not centered on its two pipe tiles');
    if (!row.spec.floorOffset) assert.ok(hidden >= 0, room+' must start concealed');
    assert.ok(after > peakIndex, room+' must retract into foreground terrain');
    const phases = [row.samples.slice(peakIndex + 1, after)];
    if (!row.spec.floorOffset) phases.push(row.samples.slice(0, peakIndex));
    for (const slice of phases)
      assert.ok(slice.some(n => n > 0 && n < row.peak * 0.8), room+' must show a partially exposed plant');
    for(const [seat,mask] of Object.entries(row.overlaps)) {
      assert.ok(mask.covered>20,room+' lacks distinct overlapping '+seat+' pixels');
      assert.equal(mask.conflicts,0,room+' draws over '+seat);
    }
  }
} finally { await browser.close(); }
