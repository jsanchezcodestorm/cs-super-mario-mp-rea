import { enterFirstCourse } from '../packages/core/test/enter-first-course.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Buttons, createGame, effectiveTile, palFrame, stepGame, type CampaignDefinition } from '@smw/core';
import { spinningBlocks } from '../apps/web/src/game/tile-plane.ts';
import { bump } from '../packages/core/src/blocks.ts';
import { settleBlockBounces } from '../packages/core/src/block-bounce.ts';

const rom: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
const idle = { mario: 0, luigi: 0 };
function start(tile: number, flying?: number, col = 4) {
  const width = 20, height = 14, tiles = Array(width * height).fill(0x25);
  tiles.fill(0x130, 10 * width);
  if (!flying) tiles[width * 7 + col] = tile;
  const stage = {
    id: 'level', spawn: { x: 16 * col, y: 144 }, width, height, tiles, exits: [],
    sprites: flying ? [{spriteId: flying, x: 16 * col, y: 112}] : [],
  };
  const campaign: CampaignDefinition = { start: stage.id, levels: { level: stage }, routes: { level: {} } };
  const state = enterFirstCourse(campaign);
  const tick = (n: number, buttons = idle) => {
    for (let i = 0; i < n; i++) stepGame(campaign, state, buttons);
  };
  tick(1);
  return { state, stage, tick };
}
const jump = { mario: Buttons.jump, luigi: Buttons.jump };

test('both jumping into a single coin block earn one coin and 10 points; the used tile cannot pay again', () => {
  const { stage, state, tick } = start(0x124);
  tick(12, jump);
  assert.equal(state.courseCoins, 1);
  assert.deepEqual([state.players.mario.score, state.players.luigi.score], [10, 0]);
  assert.equal(state.rewardEffects?.filter(e => e.award === 10).length, 1);
  tick(45);
  assert.equal(effectiveTile(state, stage, stage.width * 7 + 4), 0x132);
  tick(12, jump);
  assert.equal(state.courseCoins, 1);
});

test('a multicoin block re-arms until the PAL window expires, then pays one last coin', () => {
  const { stage, state, tick } = start(0x123);
  const index = stage.width * 7 + 4;
  for (const pause of [50, 320]) {
    tick(10, jump);
    tick(pause);
    assert.equal(effectiveTile(state, stage, index), 0x123);
  }
  tick(10, jump);
  tick(50);
  assert.equal(effectiveTile(state, stage, index), 0x132);
  assert.equal(state.players.mario.score, 30);
  assert.equal(state.courseCoins, 3);
});

test('both flying question sprite IDs stop and dispense their column-dependent reward once', () => {
  for (const id of [0x83, 0x84]) {
    for (const col of [4, 5, 6, 7]) {
      const { state, tick } = start(0, id, col);
      const flying = state.entities.find(e => e.kind === 'flyingQuestion')!;
      tick(14, jump);
      assert.equal(flying.questionHit?.playerId, 'mario');
      tick(45);
      assert.equal(flying.questionHit?.paid, true);
      const x = flying.x;
      tick(12, jump);
      assert.equal(flying.x, x);
      assert.equal(state.courseCoins, col === 4 ? 1 : 0);
      if (col !== 4) assert.equal(state.entities.filter(e => e.spriteId === (col === 7 ? 0x78 : 0x74)).length, 1);
    }
  }
});

test('all ordinary single-coin question blocks in the E1 catalog settle into used blocks', () => {
  const state = createGame(rom), world = { campaign: rom, state }, p = state.players.luigi;
  let count = 0;
  for (const stage of Object.values(rom.levels)) {
    if (stage.tileset === 4) continue; // Three-block bonus rows have their own rules.
    p.roomId = stage.id;
    for (const [index, tile] of stage.tiles.entries()) {
      if (tile !== 0x124) continue;
      const contact = { tile, col: index % stage.width, row: Math.floor(index / stage.width) };
      bump(world, p, stage, contact);
      state.tick += 9;
      settleBlockBounces(world);
      assert.equal(effectiveTile(state, stage, index), 0x132, stage.id + '/' + index);
      bump(world, p, stage, contact);
      count++;
      assert.equal(p.score, count * 10);
    }
  }
  assert.equal(count, 177);
});

test('a jump centered on a seam activates one of two neighboring question blocks', () => {
  const { stage, state, tick } = start(0x124);
  stage.tiles[stage.width * 7 + 5] = 0x124;
  state.players.mario.x = 5 * 16 - state.players.mario.width / 2;
  state.players.luigi.x = 32;
  tick(16, { mario: Buttons.jump, luigi: 0 });
  assert.equal(state.courseCoins, 1);
  assert.equal(effectiveTile(state, stage, stage.width * 7 + 4), 0x124);
  assert.equal(effectiveTile(state, stage, stage.width * 7 + 5), 0x132);
});

test('placed power-up and multicoin question blocks use their own content in every E1 room', () => {
  const state = createGame(rom), world = { campaign: rom, state }, player = state.players.mario;
  const counts: Record<number,number> = {};
  for (const room of Object.values(rom.levels)) {
    player.roomId = room.id;
    for (const [i, tile] of room.tiles.entries()) {
      if (tile < 0x11f || tile > 0x126 || tile === 0x124) continue;
      const col = i % room.width, row = Math.floor(i / room.width);
      const before = player.score;
      state.entities = [];
      bump(world, player, room, {tile, col, row});
      state.tick += 9;
      settleBlockBounces(world);
      // Each multicoin sample starts with a fresh timing window.
      delete state.multicoinUntil;
      if (tile === 0x122 || tile === 0x123) {
        assert.equal(player.score - before, 10);
      } else {
        const sprite = tile === 0x125 ? [0x80,0x7e,0x7d,0x80][col & 3] :
          tile === 0x126 ? 0x2c : tile === 0x121 ? 0x76 : 0x74;
        assert.equal(state.entities[0]?.spriteId, sprite, room.id + '/' + i);
        assert.equal(player.score, before);
      }
      assert.equal(effectiveTile(state, room, i), tile === 0x123 ? 0x123 : 0x132);
      counts[tile] = (counts[tile] ?? 0) + 1;
    }
  }
  assert.deepEqual(counts, { 0x11f: 42, 0x120: 52, 0x121: 3, 0x122: 1, 0x123: 20, 0x125: 14, 0x126: 28 });
});

test('the cooperative turn block renders its bounce and spin throughout the shared open window', () => {
  const { stage, state, tick } = start(0x11e);
  const index = stage.width * 7 + 4;
  for (let i = 0; i < 15 && !state.turning.length; i++) tick(1, jump);
  assert.equal(state.turning.length, 1);
  assert.equal(state.bouncingBlocks?.length, 1);
  const firstFrame = palFrame(state.tick);
  assert.equal(effectiveTile(state, stage, index), 0x152);
  while (palFrame(state.tick) - firstFrame < 5) tick(1);
  assert.equal(spinningBlocks(stage,state).has(index), false);
  assert.equal(effectiveTile(state, stage, index), 0x152);
  while (palFrame(state.tick) - firstFrame < 6) tick(1);
  assert.equal(state.bouncingBlocks?.length, 0);
  assert.equal(spinningBlocks(stage,state).has(index), true);
  assert.equal(effectiveTile(state, stage, index), 0x48);
  while (palFrame(state.tick) - firstFrame < 254) tick(1);
  assert.equal(effectiveTile(state, stage, index), 0x48);
  assert.equal(spinningBlocks(stage,state).has(index), true);
  while (palFrame(state.tick) - firstFrame < 255) tick(1);
  assert.equal(effectiveTile(state, stage, index), 0x11e);
  assert.equal(spinningBlocks(stage,state).has(index), false);
});
