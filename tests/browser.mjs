import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const origin = process.env.PLAY_URL ?? 'http://127.0.0.1:8787';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const issues = [];
try {
  const pages = await Promise.all([browser.newPage(), browser.newPage()]);
  const snapshots = new Map();
  for (const page of pages) {
    page.on('pageerror', (e) => issues.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) issues.push(r.status() + ' ' + r.url());
    });
    page.on('websocket', (ws) =>
      ws.on('framereceived', ({ payload }) => {
        const m = JSON.parse(payload.toString());
        if (m.type === 'snapshot') snapshots.set(page, m.state);
      }),
    );
    await page.goto(origin);
  }
  const [mario, luigi] = pages;
  mkdirSync('test-results', { recursive: true });
  await mario.screenshot({ path: 'test-results/lobby.png' });
  await mario.locator('#submit').click();
  await mario.locator('#invite').waitFor();
  const code = await mario.locator('#invite').innerText();
  await luigi.locator('#join-tab').click();
  await luigi.locator('#room-code').fill(code);
  await luigi.locator('#submit').click();
  await Promise.all(pages.map((page) => page.locator('#ready').click()));
  await Promise.all(pages.map((page) => page.locator('#screen canvas').waitFor()));
  await mario.waitForTimeout(750);
  assert.equal(snapshots.get(luigi).phase, 'map');
  await mario.keyboard.press('Enter');
  const deadline = Date.now() + 5000;
  while (snapshots.get(luigi)?.phase !== 'playing') {
    assert.ok(Date.now() < deadline, 'Luigi did not enter the selected course');
    await mario.waitForTimeout(20);
  }
  const before = snapshots.get(mario).players.mario.x;
  await mario.keyboard.down('ArrowRight');
  await mario.keyboard.down('KeyX');
  await mario.waitForTimeout(850);
  await mario.keyboard.down('KeyZ');
  await mario.waitForTimeout(280);
  await mario.keyboard.up('KeyZ');
  await mario.keyboard.up('KeyX');
  await mario.keyboard.up('ArrowRight');
  const s = snapshots.get(luigi);
  assert(s.players.mario.x > before + 10, 'Luigi must see Mario moving right');
  assert.notEqual(s.players.mario.x, s.players.luigi.x);
  await Promise.all(
    pages.map((p, i) => p.screenshot({ path: 'test-results/' + ['mario', 'luigi'][i] + '.png' })),
  );
  await luigi.reload();
  await luigi.locator('#screen canvas').waitFor();
  await luigi.waitForTimeout(750);
  assert(snapshots.get(luigi).tick > s.tick, 'room did not resume');
  assert.deepEqual(issues, []);
  console.log('Two browser contexts passed: room, independent movement, rendering, reload and resume.', {
    tick: s.tick,
    mario: s.players.mario.x,
    luigi: s.players.luigi.x,
  });
} finally {
  await browser.close();
}
