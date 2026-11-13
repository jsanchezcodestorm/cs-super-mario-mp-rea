import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: {
    contents: [
      "export { default as Phaser } from 'phaser'",
      "export { WorldScene } from './apps/web/src/game/world-scene'",
      "export { mapPresentation } from './apps/web/src/game/map-reveal'",
      "export { Playback } from './apps/web/src/game/playback'",
      "export { cameraFor } from './apps/web/src/game/terrain-view'",
      "export { createGame, stepGame, palFrame } from '@smw/core'",
      "export { startCourse } from './packages/core/src/campaign'",
      "export { contact } from './packages/core/src/entity-contact'",
    ].join('\n'), resolveDir: process.cwd(),
  }, bundle: true, write: false, format: 'iife', globalName: 'keytest',
});

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(process.env.PLAY_URL ?? 'http://127.0.0.1:8787');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const results = await page.evaluate(async () => {
    const json = path => fetch('/assets/'+path+'.json').then(r => r.json());
    const [campaign, nodes] = await Promise.all([json('content'), json('world/nodes')]);
    const game = keytest, zero = {mario:0,luigi:0};
    let live = new game.Playback(campaign,'mario',()=>false);
    const display = { get displayState() { return live.displayState; }, get playerId() { return live.playerId; }, update() {} };
    let ready, fail;
    const started = new Promise((resolve,reject) => { ready=resolve; fail=reject; });
    class TestScene extends game.WorldScene {
      preload() { this.load.on('loaderror', file => fail(Error('Cannot load '+file.src))); super.preload(); }
      create() { super.create(); ready(); }
    }
    const scene = new TestScene(campaign,display,nodes,{sample:()=>0});
    const host = document.body.appendChild(document.createElement('div'));
    const phaser = new game.Phaser.Game({type:game.Phaser.CANVAS,width:256,height:224,parent:host,pixelArt:true,audio:{noAudio:true},scene:[scene]});
    const timeout = setTimeout(()=>fail(Error('WorldScene did not load')),30000);
    try { await started; } finally { clearTimeout(timeout); }
    const ctx = scene.terrain.context;
    function receive(state) {
      live.receive(JSON.parse(JSON.stringify(state)),0);
      scene.update(0,0);
    }
    const output = [];
    for (const seat of ['mario','luigi']) {
      const state = game.createGame(campaign), world = {state,campaign};
      state.progress.unlocked.push('015'); game.startCourse(world,'015');
      const hole = state.entities.find(e=>e.kind==='keyhole'), key = state.entities.find(e=>e.kind==='key');
      const p = state.players[seat], other = seat==='mario'?'luigi':'mario';
      Object.assign(p,{x:hole.x-4,y:hole.y,carrying:key.id});
      key.owner=seat;
      Object.assign(state.players[other], {x:hole.x-94,y:hole.y});
      live = new game.Playback(campaign,other,()=>false);
      const peer = state.players[other];
      const idleCamera = game.cameraFor(campaign.levels['015'],peer.x+peer.width/2,peer.y+peer.height/2);
      const readHole = () => ctx.getImageData(hole.origin.x-idleCamera.x,hole.origin.y-idleCamera.y,24,24).data;
      const originalX = p.x;
      p.x -= 32;
      receive(state);
      const idleHole = readHole();
      hole.active = false;
      receive(state);
      const noHole = readHole();
      hole.active = true;
      p.x = originalX;
      const changed = [];
      for (let i=0;i<idleHole.length;i+=4) {
        if ([0,1,2].some(c=>idleHole[i+c]!==noHole[i+c])) changed.push(i/4%24);
      }
      game.contact(world,hole,p,0,p.y+p.height);
      if (state.keyholeFinish?.x!==hole.origin.x+12 || state.keyholeFinish?.y!==hole.origin.y+16)
        throw Error('Keyhole window differs from original room-space coordinates');
      if (state.keyholeFinish?.finisher!==seat) throw Error('Level 015 did not trigger the secret exit for '+seat);
      const start = state.keyholeFinish.tick;
      const camera = game.cameraFor(campaign.levels['015'],p.x+p.width/2,p.y+p.height/2);
      const x = Math.round(state.keyholeFinish.x-camera.x), y = Math.round(state.keyholeFinish.y-camera.y);
      const samples = {};
      const partnerSamples = new Map();
      for (const age of [10,52,103,119,152,153]) {
        while (game.palFrame(state.tick)-game.palFrame(start)<age) game.stepGame(campaign,state,zero);
        receive(state);
        if (age<153 && state.mapReveal.start!==undefined) throw Error('Map clock started during keyhole');
        const rgba=ctx.getImageData(0,0,256,224).data;
        const black=(cx,cy)=>{const i=4*(cy*256+cx);return rgba[i]===0&&rgba[i+1]===0&&rgba[i+2]===0;};
        let blackPixels=0; for (let yy=0; yy<224; yy++) for(let xx=0;xx<256;xx++) if(black(xx,yy)) blackPixels++;
        const edges={};
        for (const dy of [-25,-40,-60,-80]) {
          let left=0,right=0;
          if (black(x,y+dy)) {
            while(left<100&&black(x-left-1,y+dy)) left++;
            while(right<100&&black(x+right+1,y+dy)) right++;
          }
          edges[dy]=[left,right];
        }
        samples[age]={blackPixels,edges};
        const partner=state.players[other];
        partnerSamples.set(age,ctx.getImageData(partner.x-camera.x-12,partner.y-camera.y-16,32,40).data);
      }
      const reveal = game.mapPresentation(state,scene.cache.json.get('map-reveals')).reveal;
      const visiblePeer = partnerSamples.get(52), hiddenPeer = partnerSamples.get(103);
      let hiddenPeerPixels=0;
      for (let i=0;i<visiblePeer.length;i+=4) {
        if ([0,1,2].some(c=>visiblePeer[i+c]!==hiddenPeer[i+c])) hiddenPeerPixels++;
      }
      output.push({seat,samples,hiddenPeerPixels,idleX:[Math.min(...changed),Math.max(...changed)],completed:state.progress.completed,keyhole:state.keyholeFinish??null,
        reveal:reveal&&{exit:reveal.exit,age:reveal.age}});
    }
    phaser.destroy(true); host.remove();
    return output;
  });
  assert.deepEqual(errors,[]);
  for (const row of results) {
    assert.deepEqual(row.idleX,[8,15]);
    assert.deepEqual(row.completed,['015:secret']);
    assert.equal(row.keyhole,null);
    assert.deepEqual(row.reveal,{exit:'015:secret',age:0});
    // Half-widths read directly from the live E1 HDMA buffer $04A0 at dy -25,-40,-60,-80.
    const nativeRows = {10:[12,0,0,0],52:[38,33,28,43],103:[13,21,17,0],119:[0,0,0,0]};
    for (const [age,spans] of Object.entries(nativeRows)) {
      const actual = [-25,-40,-60,-80].map(dy=>row.samples[age].edges[dy]);
      assert.deepEqual(actual,spans.map(half=>[half,half]),row.seat+' PAL frame '+age);
    }
    assert.ok(row.hiddenPeerPixels>40,'Partner outside the shrinking window should disappear');
    assert.equal(row.samples[152].blackPixels,256*224);
    assert.ok(row.samples[153].blackPixels<256*224/2);
    console.log(row.seat+' secret exit rendered 16 matching scanlines, '+
      row.hiddenPeerPixels+' partner pixels disappeared and the map reveal started at frame zero.');
  }
} finally {
  await browser.close();
}
