import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const url = process.env.PLAY_URL ?? 'http://127.0.0.1:8787';
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: "export { CutsceneView } from './apps/web/src/game/cutscene-view'" },
  bundle: true, write: false, format: 'iife', globalName: 'review' });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(url);
  const title = page.locator('#title-demo');
  assert.ok(await title.evaluate(v => v.paused && v.currentTime === 0 && v.poster.endsWith('title.png')));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('#title-demo').getVideoPlaybackQuality().totalVideoFrames > 8);
  const titleLength = await title.evaluate(v => v.duration);
  assert.ok(Math.abs(titleLength - 1503 / 50.00698) < 0.03);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('#title-demo').paused);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const results = await page.evaluate(async () => {
    const target = document.body.appendChild(document.createElement('section'));
    const movies = new review.CutsceneView(target), video = target.querySelector('video');
    const durations = await (await fetch('/assets/movies/durations.json')).json();
    const results = [];
    for (const [key, ticks] of Object.entries(durations)) {
      const state = { tick: 180, phase: 'map', cutscene: { key, start: 0 } };
      const seek = new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
      movies.update(state, true);
      await seek;
      results.push({ key, duration: video.duration, ticks, time: video.currentTime, paused: video.paused, width: video.videoWidth });
      movies.update(state, false);
      await video.play();
      state.tick = 300;
      const resync = new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
      movies.update(state, true);
      await resync;
      if (!video.paused || Math.abs(video.currentTime - 5) > .025) throw Error(key + ' failed to pause at the room tick');
    }
    movies.close(); target.remove();
    return results;
  });
  assert.equal(results.length, 8);
  for (const r of results) {
    assert.ok(r.paused && Math.abs(r.time - 3) < .025 && r.width === 256, r.key);
    assert.ok(Math.abs(r.duration - r.ticks / 60) < .10, r.key);
  }
  console.log('Chromium decoded the 1,503-frame title loop and all eight PAL movies. Late join, pause, and resumed playback passed.');
} finally {
  await browser.close();
}
