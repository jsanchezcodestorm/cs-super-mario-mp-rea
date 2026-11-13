import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.PLAY_URL ?? 'http://127.0.0.1:8787';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const client = await page.context().newCDPSession(page);
  await page.goto(origin);
  await page.locator('#solo-tab').tap();
  await page.locator('#submit').tap();
  await page.locator('#screen canvas').waitFor();
  await page.locator('[data-control="action"]').tap();
  const jump = page.locator('[data-control="jump"]');
  await jump.waitFor();
  const box = await jump.boundingBox();
  const run = await page.locator('[data-control="run"]').boundingBox();
  const points = [
    { x: box.x + box.width / 2, y: box.y + box.height / 2, control: 'jump' },
    // A thumb can land on the play surface just outside the transparent action group.
    { x: run.x - 16, y: run.y + run.height / 2, control: null },
  ];

  for (const { x, y, control } of points) {
    await page.evaluate(() => {
      window.nextTouch = new Promise(resolve => {
        window.addEventListener('touchstart', event => resolve({
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
          control: event.target.closest('[data-control]')?.dataset.control ?? null,
        }), { once: true, passive: true });
      });
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 1, radiusY: 1 }] });
    await page.waitForTimeout(900); // Exceed the native long-press threshold.
    assert.deepEqual(await page.evaluate(() => window.nextTouch), { trusted: true, prevented: true, control });
    assert.equal(await page.locator('#touch-controls .is-pressed').count(), control ? 1 : 0);
    assert.equal(await page.evaluate(() => String(getSelection())), '');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  await page.locator('#stage-name').dblclick({ position: { x: 8, y: 6 } });
  assert.equal(await page.evaluate(() => String(getSelection())), '');
  await page.locator('#play-leave').tap();
  await page.locator('#start-view .lead').dblclick({ position: { x: 10, y: 8 } });
  assert.ok(await page.evaluate(() => String(getSelection()).trim()), 'Lobby text should still be selectable');
  console.log('Mobile play surface prevents long-press selection on buttons and gaps.');
} finally {
  await browser.close();
}
