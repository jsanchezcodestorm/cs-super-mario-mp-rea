import { generatePlaythrough } from './coop/playthrough.ts';
import { enterFirstCourse } from '../packages/core/test/enter-first-course.ts'
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { stepGame, makeSave } from '@smw/core';

const campaign = JSON.parse(readFileSync('generated/content.json'));
campaign.movieTicks = JSON.parse(readFileSync('generated/movies/durations.json'));
const replay = JSON.parse(readFileSync('tests/course-inputs.json'))['105'];
const state = enterFirstCourse(campaign);
for (const [buttons, frames] of replay)
  for (let i = 0; i < frames && state.phase === 'playing'; i++)
    stepGame(campaign, state, { mario: buttons, luigi: 0 });
assert.equal(state.phase, 'map');

const server = process.env.PLAY_URL ?? 'http://127.0.0.1:8787';
const browser = await chromium.launch();
try {
  const host = await browser.newPage(),
    guest = await browser.newPage();
  const errors = [];
  let snapshot;
  for (const p of [host, guest]) {
    p.on('pageerror', (err) => errors.push(err.message));
    p.on('response', (r) => {
      if (r.status() >= 400) errors.push(r.status() + ' ' + r.url());
    });
    await p.goto(server);
  }
  guest.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      const msg = JSON.parse(payload.toString());
      if (msg.type === 'snapshot') snapshot = msg.state;
    }),
  );
  async function until(check, description) {
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      if (snapshot && check(snapshot)) return;
      await delay(12);
    }
    throw Error(description + ' ' + JSON.stringify(snapshot?.players.luigi));
  }
  async function openSavedCampaign(campaignSave) {
    await host.evaluate(
      (save) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('dinosaur-land', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('campaigns');
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction('campaigns', 'readwrite');
            tx.objectStore('campaigns').put(save, 'last');
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      campaignSave,
    );
    await host.reload();
    await host.locator('#campaign').selectOption('saved');
    await host.locator('#submit').click();
    await host.locator('#invite').waitFor();
    await guest.locator('#join-tab').click();
    await guest.locator('#room-code').fill(await host.locator('#invite').innerText());
    await guest.locator('#submit').click();
    await Promise.all([host, guest].map((p) => p.locator('#ready').click()));
  }
  await openSavedCampaign(makeSave(state));
  await until((s) => s.phase === 'map', 'saved map');
  await guest.locator('#screen canvas').waitFor();
  // Phaser loads the map/atlases after it creates its canvas.
  await delay(1000);
  mkdirSync('test-results', { recursive: true });
  await guest.screenshot({ path: 'test-results/overworld.png' });
  await guest.keyboard.down('Enter');
  await until((s) => s.phase === 'playing' && s.progress.course === '014', 'select the Yellow Switch Palace');
  await guest.keyboard.up('Enter');
  await guest.keyboard.down('KeyX');
  await guest.keyboard.down('ArrowRight');
  await until((s) => s.players.luigi.roomId === '0ca' && s.players.luigi.x >= 611, 'reach the switch');
  assert.equal(snapshot.players.mario.roomId, '014');
  await guest.keyboard.down('KeyZ');
  await until((s) => s.players.luigi.x >= 619, 'jump on the shared switch');
  await guest.keyboard.up('ArrowRight');
  await guest.keyboard.up('KeyZ');
  await guest.keyboard.up('KeyX');
  await until(
    (s) => s.phase === 'map' && s.progress.completed.includes('014:normal'),
    'complete switch palace',
  );
  // The host stayed behind in the first room. Both browsers must persist the
  // same new exit when Luigi lands on the switch.
  for (const p of [host, guest])
    await p.waitForFunction(
      () =>
        new Promise((resolve) => {
          const r = indexedDB.open('dinosaur-land', 1);
          r.onsuccess = () => {
            const db = r.result;
            const q = db.transaction('campaigns').objectStore('campaigns').get('last');
            q.onsuccess = () => {
              db.close();
              resolve(q.result?.progress.completed.includes('014:normal'));
            };
          };
        }),
    );
  await host.locator('#play-leave').click();
  await guest.locator('#start-view').waitFor();
  let ending;
  for (const visit of generatePlaythrough(campaign)) ending = visit.result;
  assert.equal(ending.phase, 'ending');
  assert.equal(ending.progress.completed.length, 96);
  await openSavedCampaign(ending);
  await until((s) => s.phase === 'ending', 'restored Bowser ending');
  const still = guest.locator('img.cinematic');
  await still.waitFor();
  await guest.locator('#screen canvas').waitFor();
  assert.match(await host.locator('#campaign option[value="saved"]').textContent(), /96 uscite/);
  await guest.keyboard.down('Enter');
  await until((s) => s.phase === 'map', 'Luigi returns to the map after the credits');
  await guest.keyboard.up('Enter');
  await still.waitFor({ state: 'hidden' });
  assert.deepEqual(snapshot.progress.completed, ending.progress.completed);
  await host.keyboard.down('Enter');
  await until((s) => s.phase === 'playing', 'Mario can enter a course after Bowser');
  await host.keyboard.up('Enter');
  assert.equal(snapshot.progress.completed.length, 96);
  assert.deepEqual(errors, []);
  console.log('Both browsers restored the 96-exit campaign, left the ending and re-entered a course.');
} finally {
  await browser.close();
}
