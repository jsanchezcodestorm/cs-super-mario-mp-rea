import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: { contents: [
    "export { default as Phaser } from 'phaser'",
    "export { WorldScene } from './apps/web/src/game/world-scene'",
    "export { Playback } from './apps/web/src/game/playback'",
    "export { createGame, stepGame, palFrame, Buttons } from '@smw/core'",
    "export { startCourse } from './packages/core/src/campaign'",
  ].join('\n'), resolveDir: process.cwd() },
  write: false, bundle: true, format: 'iife', globalName: 'goalTest',
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://goal.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<div id="screen"></div>'});
    return route.fulfill({path: path.resolve('generated', url.pathname.slice('/assets/'.length))});
  });
  await page.goto('http://goal.test/');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const results = await page.evaluate(async () => {
    const {WorldScene, Playback, Phaser, createGame, startCourse, stepGame, palFrame, Buttons} = goalTest;
    const campaign = await (await fetch('/assets/content.json')).json();
    let live = new Playback(campaign, 'luigi', () => false);
    const display = {get displayState() { return live.displayState; }, get playerId() { return live.playerId; }, update() {}};
    let scene;
    const ready = new Promise((resolve, reject) => {
      class GoalScene extends WorldScene {
        preload() { this.load.on('loaderror', file => reject(Error(file.src))); super.preload(); }
        create() { super.create(); resolve(); }
      }
      scene = new GoalScene(campaign, display, campaign.overworldNodes, {sample:()=>0});
    });
    const game = new Phaser.Game({type:Phaser.CANVAS,width:256,height:224,parent:'screen',pixelArt:true,audio:{noAudio:true},scene:[scene]});
    await ready;
    const ctx = scene.terrain.context;
    function present(state) {
      live.receive(structuredClone(state), 0);
      scene.update(0,0);
      return ctx.getImageData(0,0,256,224).data;
    }
    function lit(screen) {
      let pixels = 0;
      for (let i=0; i<screen.length; i+=4) if (screen[i] || screen[i+1] || screen[i+2]) pixels++;
      return pixels;
    }
    // Compare the scene's actual, fully composited pixels with the extracted sprite/stripe.
    function coverage(screen, target, x, y) {
      const expected = target.getImageData(0,0,target.canvas.width,target.canvas.height).data;
      let opaque=0, match=0;
      for (let i=0; i<expected.length; i+=4) {
        if (!expected[i+3] || !(expected[i] || expected[i+1] || expected[i+2])) continue;
        opaque++;
        const p=i/4, j=4*((y+Math.floor(p/target.canvas.width))*256 + x+p%target.canvas.width);
        if (expected[i]===screen[j] && expected[i+1]===screen[j+1] && expected[i+2]===screen[j+2]) match++;
      }
      if (!opaque) throw Error('Empty reference art');
      return match / opaque;
    }
    function patch(width,height) {
      const canvas=document.createElement('canvas');
      canvas.width=width; canvas.height=height;
      return canvas.getContext('2d', {willReadFrequently:true});
    }
    const results=[];
    for (const [seat,award,mounted] of [['mario',23,false],['luigi',1,true],['mario',0,false]]) {
      const other=seat==='mario'?'luigi':'mario';
      live=new Playback(campaign,other,()=>false);
      const state=createGame(campaign);
      startCourse({state,campaign},'105');
      const tape=state.entities.find(e=>e.kind==='goal'), p=state.players[seat];
      const height=award ? 4*(award-1) : 96;
      tape.age=height ? height-1 : 0;
      Object.assign(p,{x:tape.x-1,y:tape.origin.y-(award?height:0)-8,mounted,bonusStars:mounted?99:0});
      Object.assign(state.players[other],{x:tape.x-80,y:tape.origin.y-8});
      stepGame(campaign,state,{mario:0,luigi:0});
      const walk=state.goalWalk;
      if (walk?.stars!==award || walk.finisher!==seat) throw Error('Room 105 did not trigger the expected cut');
      const start=palFrame(walk.tick), starImage=scene.textures.get('goal-stars').getSourceImage();
      const panel=scene.textures.get('hud/course-'+seat).getSourceImage();
      const header=patch(112,40), bonus=patch(72,16);
      header.drawImage(panel,0,0,112,40,0,0,112,40);
      bonus.drawImage(panel,0,56,72,16,0,0,72,16);
      const layout=scene.cache.json.get('goal-star-layout'), observations={}, images={};
      for (const age of [0,1,28,112,113,117,121,127,128,160,161,201,202,385,500]) {
        while (palFrame(state.tick)-start<age) stepGame(campaign,state,{mario:Buttons.action,luigi:Buttons.jump});
        if (!state.goalWalk) throw Error('Ordinary input interrupted the celebration at '+age);
        const screen=present(state);
        const reference=patch(56,40), value=award || 1, sy=8*layout.rows['105'][(palFrame(state.tick)>>2)&7];
        const sx=age<=112 || age>=128 ? 0 : age<=116 ? 8 : age<=120 ? 16 : 24;
        for (const [digit,x] of [[Math.floor(value/10),0],[value%10,32]]) {
          if (x===0 && !digit) continue;
          for (const [dx,dy] of layout.digits[digit]) reference.drawImage(starImage,sx,sy,8,8,x+dx,dy,8,8);
        }
        observations[age]={star:coverage(screen,reference,100,64),header:coverage(screen,header,72,56),
          bonus:coverage(screen,bonus,72,112),lit:lit(screen),hud:game.canvas.getAttribute('aria-label')};
        if (award && [28,202,500].includes(age)) images[age]=ctx.canvas.toDataURL();
      }
      let lastLit, lastAge;
      for (let i=0; state.goalWalk && i<120; i++) {
        lastLit=lit(present(state)); lastAge=palFrame(state.tick)-start;
        stepGame(campaign,state,{mario:Buttons.action,luigi:Buttons.jump});
      }
      if (state.goalWalk) throw Error('The iris never released the scene');
      const nextLit=lit(present(state));
      results.push({seat,award,observations,images,lastLit,lastAge,nextLit,bonusRoom:state.bonus?.roomId,
        mapAge:state.mapReveal?.start===undefined?null:state.tick-state.mapReveal.start});
    }
    game.destroy(true);
    return results;
  });
  assert.deepEqual(errors,[]);
  const output='test-results/goal-finish';
  await mkdir(output,{recursive:true});
  for (const {seat,award,observations:s,images,lastLit,lastAge,nextLit,bonusRoom,mapAge} of results) {
    for (const age of [1,28,112,113,117,121,127]) {
      if (award) assert.equal(s[age].star,1,seat+' cut at PAL '+age);
      else assert.ok(s[age].star<0.5,'A missed ribbon must not display any award');
    }
    assert.ok(s[0].star<0.5 && s[128].star<0.5,'Star numeral appeared outside its OAM lifetime');
    assert.ok(s[160].header<0.1 && s[161].header===1,'Course clear header upload');
    assert.ok(s[201].bonus<0.1 && (award ? s[202].bonus===1 : s[202].bonus<0.1),'Optional star stripe upload');
    assert.ok(s[160].lit<s[28].lit/3,'Backdrop reaches black during the tally');
    assert.ok(s[500].lit<s[385].lit,'Shrinking window masks the scene');
    if (bonusRoom) {
      assert.equal(bonusRoom,'100');
      assert.match(s[1].hud,/99 stelle bonus/);
      assert.match(s[385].hud,/0 stelle bonus/);
    } else assert.equal(mapAge,0);
    assert.equal(lastLit,0,'The final iris frame must be completely black');
    assert.ok(nextLit>10000,'The next scene must appear after the black frame');
    for (const [age,image] of Object.entries(images)) {
      await writeFile(output+'/'+seat+'-'+age+'.png',Buffer.from(image.split(',')[1],'base64'));
    }
    console.log(seat+', '+award+' stars: verified cut, stripe, iris; full black at '+lastAge+', then '+(bonusRoom?'bonus room '+bonusRoom:'map reveal'));
  }
} finally { await browser.close(); }
