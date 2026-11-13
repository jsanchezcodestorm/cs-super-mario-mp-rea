import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type Phaser from 'phaser';
import type { EntityState } from '@smw/core';
import { bossFrame } from '../apps/web/src/game/boss-view.ts';
import { decode } from '../apps/web/tools/object-atlas.mjs';

test('lower OAM index wins each opaque overlap before OBJ priority is split across BG planes', () => {
  const oam = Buffer.alloc(0x2a0), vram = Buffer.alloc(0x10000);
  const palette = Array<number>(256).fill(0);
  palette[129] = 0xff0000;
  palette[145] = 0x00ff00;
  for (let slot = 0; slot < 128; slot++) oam[4 * slot + 1] = 0xf0;
  // High-priority green tile at slot 10. Low-priority red at slot 3 has a transparent hole.
  oam.set([96, 96, 0, 0x32], 4 * 10);
  oam.set([96, 96, 1, 0], 4 * 3);
  vram[0x600 * 32] = 0xff;
  vram[0x601 * 32] = 0xa0;
  const frame = decode(oam, vram, palette);
  assert.ok(frame);
  assert.deepEqual([frame.w, frame.h, frame.priority, frame.oam], [8, 1, 0, 3]);
  assert.deepEqual(frame.layers.map((band: {priority: number; oam: number}) => [band.priority, band.oam]),
    [[0, 3], [3, 10]]);
  for (let x = 0; x < 8; x++) {
    const redWins = x === 0 || x === 2;
    const red = frame.layers[0].pixels.subarray(x * 4, x * 4 + 4);
    const green = frame.layers[1].pixels.subarray(x * 4, x * 4 + 4);
    assert.deepEqual([...red], redWins ? [255, 0, 0, 255] : [0, 0, 0, 0]);
    assert.deepEqual([...green], redWins ? [0, 0, 0, 0] : [0, 255, 0, 255]);
    assert.deepEqual(redWins ? red : green, frame.pixels.subarray(x * 4, x * 4 + 4));
  }
});

test('native boss art chooses BG1, the pipe boss and each independent OAM instance', () => {
  const manifest = JSON.parse(readFileSync('generated/bosses/index.json', 'utf8'));
  const scene = { cache: { json: { get: () => manifest } } } as unknown as Phaser.Scene;
  function frame(roomId: string, kind: EntityState['kind'], tick: number, x = 0, pipeOffset?: number) {
    return bossFrame(scene, { roomId, kind, age: tick, origin: { x }, pipeOffset,
      spriteId: roomId === '0d5' ? 0xa9 : 0x29 } as EntityState)!.registration;
  }
  for (const tick of [0, 10]) {
    for (const room of ['0e5', '0cc', '0d9'])
      assert.deepEqual(frame(room, 'boss', tick), { plane: 'mode7', facing: -1 });
    assert.deepEqual(frame('1c7', 'boss', tick), { plane: 'mode7' });
    for (const [index, oam] of [118, 112, 106, 100].entries())
      assert.deepEqual(frame('0d5', 'boss', tick, (index + 1) * 16), { priority: 3, oam });
    for (const room of ['1f2', '0d3']) {
      assert.deepEqual(frame(room, 'boss', tick), { priority: 1, oam: 112 });
      assert.deepEqual(frame(room, 'pipeDecoy', tick, 0, 2), { priority: 1, oam: 76 });
      assert.deepEqual(frame(room, 'pipeDecoy', tick, 0, 4), { priority: 1, oam: 82 });
    }
  }
  assert.deepEqual(manifest['1c7'].scenery.map((s: { oam: number }) => s.oam), [15, 111, 5]);
});
