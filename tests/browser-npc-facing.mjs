import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Alpha bytes from probe_npc_facing.py, captured with Snes9x in room 106.
// Both gaits and both directions are independent of palette and atlas generation.
const native = {
  left: ['bd1e474dc714767f730688ca44e72cb024453e830f657aecda87e9890025998f','0446192ed21b1cd4ec8af27fbe351a5f2141a91889c794234e1d9cc4c676504f'],
  right: ['d52f7175b6b3bdf43ebb1f6ac483b917bb6b882c3494b90b718e15b4ac72fa02','41ab40f4b0a440ed4f68162083ff5947b191d7b7fccbb74cc8a1e171c65301d5'],
};
// PAL OAM silhouettes of riderless Yoshi and the RGBA pixels of Bowser's
// original Mode 7 framebuffer at release and five frames into recoil.
const specialNative = {
  'boo-ring-107': '41cf82cd4713d9eb6019db09d61bee0a4a4b5853002a0bb8ebfa49b0fd0648af',
  'boo-ring-0ed': '9304ade1bed67574378410fb4a175b957496aaf62734823bb58b1387af78401d',
  'yoshi-left-open': '38ef6d378d4e9a48bf663506942e4b729d16131babd3d68b2ddccee9ededf6f0',
  'yoshi-left-closed': 'e28a9422c2fc7d9eeecaddf865022fef5c221908485fbd543617092c1e124fb8',
  'yoshi-right-open': 'd43fbc805d59f6827eb3b6ee4e8c931e32057891a8e4c2a0ce44f5d4949475f9',
  'yoshi-right-closed': '87761f68ade50d79010849e8e46f3e888f075c786d74f6c2b5c6d3b8767cb543',
  'bowser-left-throw': '5e7dd1c87886ad99e4f82f762c991c3ed779926163d61c21e2b6b59c4ef51d5f',
  'bowser-right-throw': 'b0ca81547f4d5415a67d0e70c4e2801ef91ed2225caf026e0647c96b5c47e9bc',
  'bowser-left-hurt': '8b6e065e655c4ae270a37d77615bd556f5c7fa1ed4705d4e9675e4ce946bfc59',
  'bowser-right-hurt': '8455b4900f71092de75c32ca10e9ab15764617e52c24c1e7eb2d7808f8281dd0',
};

const bundle = await build({stdin:{contents:[
  "export { default as Phaser } from 'phaser'",
  "export { WorldScene } from './apps/web/src/game/world-scene'",
  "export { createGame,stepGame } from '@smw/core'",
  "export { startCourse } from './packages/core/src/campaign'",
  "export { cameraFor } from './apps/web/src/game/terrain-view'",
  "export { captureBooRings } from './tests/browser/boo-ring-frames.mjs'",
  "export { captureSpecialNpcFrames } from './tests/browser/special-npc-frames.mjs'",
].join('\n'), resolveDir:process.cwd()}, bundle:true, write:false, format:'iife', globalName:'npcTest'});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://npc.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<div id="screen"></div>'});
    return route.fulfill({path:path.resolve('generated',url.pathname.slice('/assets/'.length))});
  });
  await page.goto('http://npc.test/');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result = await page.evaluate(async () => {
    const {Phaser,WorldScene,createGame,stepGame,startCourse,cameraFor} = npcTest;
    const content = await (await fetch('/assets/content.json')).json();
    let state, scene, seat;
    const live = {get displayState(){return state;},get playerId(){return seat;}, update(){}};
    const loaded = new Promise((resolve,reject) => {
      class Scene extends WorldScene {
        preload(){ this.load.on('loaderror',f=>reject(Error(f.src)));super.preload(); }
        create(){ super.create();resolve(); }
      }
      scene = new Scene(content,live,content.overworldNodes,{sample:()=>0});
    });
    const game = new Phaser.Game({type:Phaser.CANVAS,width:256,height:224,parent:'screen',pixelArt:true,audio:{noAudio:true},scene:[scene]});
    await loaded;
    const shots=[],examples={};
    for (const direction of [-1,1]) {
      for (seat of ['mario','luigi']) {
        const room=content.levels['106'], c={...content,start:'106',initial:['106']};
        state=createGame(c); startCourse({campaign:c,state},'106');
        const turtle=state.entities.find(e=>e.spriteId===5 && e.x===432);
        if (!turtle) throw Error('Missing first red Koopa in Yoshi’s Island 2');
        state.entities=[turtle];
        const player=state.players[seat];
        Object.assign(player,{x:turtle.x+direction*60,y:turtle.y});
        state.players[seat==='mario'?'luigi':'mario'].status='spectator';
        const recorded=new Set();
        for(let i=0;i<70 && recorded.size<2;i++){
          const x=turtle.x;
          stepGame(c,state,{mario:0,luigi:0});
          if (!turtle.grounded || turtle.koopa?.turn || (turtle.x-x)*direction<=0) continue;
          const phase=(turtle.koopa.phase>>3)&1;
          if (recorded.has(phase)) continue;
          recorded.add(phase);
          scene.update(0,0);
          const camera=cameraFor(room,player.x+player.width/2,player.y+player.height/2);
          const screen=scene.terrain.context.canvas;
          if(!phase)examples[seat+'-'+direction]=screen.toDataURL();
          // Use the real CastView OAM compositor against transparent black.
          // Isolating the band keeps background colours out of the silhouette.
          scene.cast.draw(room,camera,state);scene.objects.compose();
          const canvas=document.createElement('canvas');canvas.width=256;canvas.height=224;
          const ctx=canvas.getContext('2d');for(let j=0;j<4;j++)scene.objects.paint(ctx,j);
          const area=ctx.getImageData(Math.round(turtle.x-camera.x)-12,Math.round(turtle.y-camera.y)-24,42,52);
          const alpha=area.data.filter((v,k)=>k%4===3);
          let left=42,top=52,right=-1,bottom=-1;
          for(let j=0;j<alpha.length;j++)if(alpha[j]){const x=j%42,y=Math.floor(j/42);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
          const bytes=[];for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)bytes.push(alpha[y*42+x]);
          shots.push({seat,direction,phase,width:right-left+1,height:bottom-top+1,bytes});
        }
        if(recorded.size!==2)throw Error('Koopa did not take two steps toward '+direction+' with '+seat);
      }
    }
    seat = 'mario';
    const specialShots = npcTest.captureSpecialNpcFrames(scene, content, next => { state = next; });
    const rings = npcTest.captureBooRings(scene, content, (next, player) => { state = next; seat = player; });
    game.destroy(true);return {shots,examples:{...examples,...specialShots.examples,...rings.examples},special:[...specialShots.shots,...rings.shots]};
  });
  assert.deepEqual(errors,[]);
  for(const shot of result.shots) {
    assert.equal(shot.width,16);assert.equal(shot.height,shot.phase ? 26 : 27);
    const hash=createHash('sha256').update(Buffer.from(shot.bytes)).digest('hex');
    assert.equal(hash,native[shot.direction<0?'left':'right'][shot.phase],JSON.stringify({...shot,bytes:undefined}));
  }
  for (const { label, bytes } of result.special)
    assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'), specialNative[label], label);
  const directory='test-results/npc-facing';
  await mkdir(directory,{recursive:true});
  for(const [label,uri] of Object.entries(result.examples))await writeFile(path.join(directory,label+'.png'),Buffer.from(uri.split(',')[1],'base64'));
  console.log('Yoshi’s Island 2: eight composited Koopas match PAL silhouettes for both seats, directions and walking poses.');
  console.log('Eight riderless Yoshi and Bowser frames match E1 in both directions, including the asymmetric clown car.');
  console.log('Both rotating Boo rings match native OAM in the Mario and Luigi viewports.');
} finally { await browser.close(); }
