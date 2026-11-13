import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: [
    "export { default as Phaser } from 'phaser'",
    "export { WorldScene } from './apps/web/src/game/world-scene'",
    "export { createGame, stepGame, scrollingCamera } from '@smw/core'",
    "export { startCourse } from './packages/core/src/campaign'",
  ].join('\n') }, bundle: true, write: false, format: 'iife', globalName: 'scaleTest',
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(process.env.PLAY_URL ?? 'http://127.0.0.1:8787');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const shots = await page.evaluate(async () => {
    const { Phaser, WorldScene, createGame, stepGame, scrollingCamera, startCourse } = scaleTest;
    const content = await fetch('/assets/content.json').then(r => r.json());
    const nodes = await fetch('/assets/world/nodes.json').then(r => r.json());
    const campaign = { ...content, start:'00c', initial:['00c'] }, room = campaign.levels['00c'];
    const state = createGame(campaign);
    startCourse({campaign,state},room.id);
    const [left, right] = state.entities.filter(e => e.scale);
    let seat = 'mario', scene;
    const session = { get displayState() { return state; }, get playerId() { return seat; }, update() {} };
    const ready = new Promise((done,fail) => {
      class BridgeScene extends WorldScene {
        preload() { this.load.on('loaderror',file => fail(Error(file.src))); super.preload(); }
        create() { super.create(); done(); }
      }
      scene = new BridgeScene(campaign,session,nodes,{sample:()=>0});
    });
    const game = new Phaser.Game({type:Phaser.CANVAS,width:256,height:224,pixelArt:true,audio:{noAudio:true},scene:[scene]});
    await ready;
    const texture = scene.textures.get('creatures').get(room.spriteTileset+'-143/0');
    const tile = document.createElement('canvas');tile.width=32;tile.height=16;
    const ctx = tile.getContext('2d');
    ctx.drawImage(texture.source.image,texture.cutX,texture.cutY,32,16,0,0,32,16);
    const rgba = ctx.getImageData(0,0,32,16).data;
    const captures = [];
    function capture(label) {
      scene.update(0,0);
      const player = state.players[seat], camera = scrollingCamera(room,player.scrollClock);
      const raster = scene.terrain.context, pixelCounts = [];
      for (const pan of [left,right]) {
        const image = raster.getImageData(Math.round(pan.x-camera.x),Math.round(pan.y-camera.y-1),32,16).data;
        let correct=0, opaque=0;
        for(let k=4*32*3;k<rgba.length;k+=4) {
          if(!rgba[k+3]) continue;
          opaque++;
          if([0,1,2].every(ch=>image[k+ch]===rgba[k+ch]))correct++;
        }
        pixelCounts.push([correct,opaque]);
      }
      captures.push({label,y:left.y,otherY:right.y,pixelCounts,image:raster.canvas.toDataURL()});
    }
    for(const [i,p] of Object.values(state.players).entries())
      Object.assign(p,{x:left.x+12*i+2,y:left.y-p.height,grounded:true,scrollClock:650});
    capture('mario-prima');
    for(let i=0;i<60;i++)stepGame(campaign,state,{mario:0,luigi:0});
    capture('mario-dopo');
    seat='luigi';
    capture('luigi-dopo');
    game.destroy(true);
    return captures;
  });
  const [first, last, peer] = shots;
  assert.ok(last.y - first.y >= 20);
  assert.equal(last.y - first.y, first.otherY - last.otherY);
  assert.equal(last.y,peer.y);
  const directory = 'test-results/moving-platforms';
  await mkdir(directory,{recursive:true});
  for(const shot of shots) {
    for(const [visible,opaque] of shot.pixelCounts) {
      assert.ok(opaque>60);
      assert.equal(visible,opaque,shot.label+' mushroom caps');
    }
    await writeFile(directory+'/butter-bridge-'+shot.label+'.png',Buffer.from(shot.image.split(',')[1],'base64'));
  }
  console.log('Both mushroom caps follow their collision surfaces in Chromium. Opposite travel:',last.y-first.y,'px; Mario and Luigi agree.');
} finally { await browser.close(); }
