import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright';
import { Buttons, createGameAtCourse, stepGame } from '@smw/core';
import type { Content } from '../apps/web/src/game/content.ts';
import { GameTraceRecorder } from '../apps/web/src/game/game-trace.ts';

const origin = process.env.PLAY_URL ?? 'http://127.0.0.1:5173';

async function makeTrace() {
  const contentResponse = await fetch(`${origin}/assets/content.json`);
  assert.equal(contentResponse.status, 200, 'game content must be available through Vite');
  const content = (await contentResponse.json()) as Content;
  const regionsResponse = await fetch(`${origin}/assets/world/nodes.json`);
  assert.equal(regionsResponse.status, 200, 'overworld regions must be available through Vite');
  content.overworldNodes = await regionsResponse.json();
  const state = createGameAtCourse(content, content.start, 'solo');
  const recorder = new GameTraceRecorder(content, 'mario', state);
  for (let frame = 0; frame < 36; frame++) {
    const buttons = frame < 20 ? Buttons.right : Buttons.jump;
    stepGame(content, state, { mario: buttons });
    recorder.record(state, buttons);
  }
  return recorder.toJsonl();
}

test('React trace route loads, seeks, annotates, and remains usable on mobile', async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.goto(`${origin}/trace`);
    assert.match(new URL(page.url()).pathname, /^\/trace\/?$/);
    await page.locator('#trace-jsonl').fill(await makeTrace());
    await page.locator('form.trace-card button[type="submit"]').click();
    await page.locator('.trace-screen canvas').waitFor();
    await page.getByRole('status').filter({ hasText: 'Traccia caricata' }).waitFor();
    assert.equal(await page.locator('#trace-frame-slider').getAttribute('max'), '36');

    await page.locator('#trace-frame-slider').focus();
    await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('.trace-timeline output').innerText(), /Frame 2 \/ 36/);
    await page.locator('#frame-comment').fill('Salto non atteso');
    assert.equal(await page.locator('#trace-notes-text').inputValue(), 'Frame 2: Salto non atteso');
    await page.locator('#trace-next').click();
    assert.equal(await page.locator('#frame-comment').inputValue(), '');
    await page.locator('#trace-previous').click();
    assert.equal(await page.locator('#frame-comment').inputValue(), 'Salto non atteso');
    await page.locator('#copy-trace-notes').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Frame 2: Salto non atteso');
    await page.locator('#copy-trace-debug-bundle').click();
    const debugBundle = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(debugBundle.includes('Frame 2: Salto non atteso'));
    assert.ok(debugBundle.includes('```jsonl\n{"type":"trace","schema":"smw-mp-game-trace/v1"'));

    await page.locator('.trace-details summary').click();
    await page.locator('.trace-state').filter({ hasText: '"players"' }).waitFor();
    assert.match(await page.locator('.trace-state').innerText(), /"players"/);
    await page.locator('#trace-play').click();
    await page.waitForTimeout(220);
    await page.locator('#trace-play').click();
    assert.equal(await page.locator('#trace-play').innerText(), 'Riproduci');

    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/trace-route-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/trace-route-mobile.png', fullPage: true });
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    assert.ok(dimensions.documentWidth <= dimensions.viewportWidth, 'mobile page must not scroll horizontally');

    await page.locator('#trace-jsonl').fill('{invalid json');
    await page.locator('form.trace-card button[type="submit"]').click();
    await page.getByRole('alert').filter({ hasText: 'Riga 1' }).waitFor();
    assert.deepEqual(issues, []);
  } finally {
    await browser.close();
  }
});
