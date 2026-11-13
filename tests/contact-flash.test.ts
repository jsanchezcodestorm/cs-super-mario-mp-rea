import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameState } from '@smw/core';
import type { ObjPart } from '../apps/web/src/game/object-planes.ts';
import { RewardView } from '../apps/web/src/game/reward-view.ts';
import { showHitAward } from '../packages/core/src/rewards.ts';
import { initialPlayer } from '../packages/core/src/state.ts';

test('contact smoke keeps the native origin, two-frame animation and shared OAM while points rise', () => {
  const p = initialPlayer('luigi', '101');
  const state = { tick: 12, players: { luigi: p } } as GameState;
  const draws: ObjPart[] = [];
  const view = new RewardView({ textures: { get: () => ({ getSourceImage: () => ({}) }) } } as never,
    { queue: (part: ObjPart) => draws.push(part) } as never);
  const draw = (age: number, room = '101', x = 5) => {
    state.tick = Math.ceil((10 + age) * 6 / 5);
    draws.length = 0;
    view.draw(state, room, { x, y: 14 });
    return draws.filter(d => d.oam === 60);
  };
  const enemy = { roomId: '101', x: 111.5, y: 180.5 };
  showHitAward(state, p, enemy, 100, true);
  enemy.x += 30;
  showHitAward(state, p, enemy, 200);
  assert.deepEqual(draw(0), []);
  for (const [index, frame] of [33, 33, 32, 32, 33, 33, 32, 32].entries()) {
    const first = draw(index + 1);
    assert.deepEqual(first.map(d => [d.sx, d.x, d.y, d.priority]), [[frame * 16, 106, 166, 2]]);
    assert.equal(draws.filter(d => d.priority === 3).length, 2);
  }
  assert.deepEqual(draw(9), []);
  // At nine PAL frames the highest slot is reusable. Five simultaneous
  // punches fill four logical smoke slots, but all share the same OAM.
  for (let n = 0; n < 5; n++) showHitAward(state, p, { ...enemy, x: 32 + n * 16 }, 100, true);
  showHitAward(state, p, { ...enemy, roomId: '1d3', x: 60 }, 100, true);
  assert.deepEqual(draw(10).map(d => d.x), [91]);
  assert.deepEqual(draw(10, '1d3').map(d => d.x), [55]);
  assert.deepEqual(draw(10, '101', -240), []);
  assert.equal(p.score, 900);
});
