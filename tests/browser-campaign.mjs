import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createGame, stepGame, makeSave } from '@smw/core';

const campaign = JSON.parse(readFileSync('generated/content.json'));
const replay = JSON.parse(readFileSync('tests/course-inputs.json'))['105'];
const state = createGame(campaign);
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
  // Seed IndexedDB with a save produced by running the first course. Reopen
  // it through the ordinary lobby and exercise the next course live online.
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
    makeSave(state),
  );
  await host.reload();
  await host.locator('#campaign').selectOption('saved');
  await host.locator('#submit').click();
  await host.locator('#invite').waitFor();
  await guest.locator('#join-tab').click();
  await guest.locator('#room-code').fill(await host.locator('#invite').innerText());
  await guest.locator('#submit').click();
  await Promise.all([host, guest].map((p) => p.locator('#ready').click()));
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
  assert.deepEqual(errors, []);
  console.log('Both browsers restored a campaign and saved the exit Luigi reached alone in the palace.');
} finally {
  await browser.close();
}
