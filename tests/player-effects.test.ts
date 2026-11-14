import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { palFrame, type GameState, type RewardEffect } from '@smw/core';
import { stepStarTrail } from '../packages/core/src/star-trail.ts';
import { initialPlayer } from '../packages/core/src/state.ts';
import { addRewardEffect, advanceRewardEffects } from '../packages/core/src/reward-effects.ts';
import { playerAppearance } from '../apps/web/src/game/player-effects.ts';
import { RewardView } from '../apps/web/src/game/reward-view.ts';

const tickFor = (native: number) => Math.ceil(native * 6 / 5);
const atlas = JSON.parse(readFileSync('generated/actors.json', 'utf8')).frames;
const player = (character: 'mario' | 'luigi', course: string) =>
  initialPlayer({ id: character, nickname: character, character }, course);

for (const seat of ['mario', 'luigi'] as const) {
  test(seat + ' uses the 12 E1 growth and damage steps, four star palettes and opaque i-frames', () => {
    const p = player(seat, '105');
    p.grounded = true;
    p.form = 'super';
    p.formChange = { from: 'small', to: 'super', tick: 0 };
    const steps = () => Array.from({ length: 12 }, (_, n) => {
      const look = playerAppearance(p, tickFor(1 + 4 * n));
      assert.ok(atlas[look.frame] && look.visible);
      return Number(look.frame.split('/')[2]);
    });
    const expected = [0, 61, 0, 61, 0, 61, 70, 61, 70, 61, 70, 61];
    assert.deepEqual(steps(), expected);
    p.form = 'small';
    p.formChange = { from: 'super', to: 'small', tick: 0 };
    assert.deepEqual(steps(), expected.reverse());
    delete p.formChange;
    p.star = 600;
    const paletteFrames = Array.from({ length: 4 }, (_, n) => playerAppearance(p, tickFor(n)).frame);
    assert.equal(new Set(paletteFrames.map(key => JSON.stringify(atlas[key].frame))).size, 4);
    p.star = 0;
    for (const [timer, visible] of [[25, true], [26, false], [68, true], [72, false]] as const) {
      p.invincible = tickFor(timer);
      assert.equal(playerAppearance(p, 0).visible, visible);
    }
    p.invincible = 0;
    p.form = 'cape'; p.formChange = { from: 'small', to: 'cape', tick: 0 };
    assert.equal(playerAppearance(p, tickFor(1)).visible, false);
    assert.equal(playerAppearance(p, tickFor(24)).visible, false);
    assert.equal(playerAppearance(p, tickFor(25)).visible, true);
    assert.equal(playerAppearance(p, tickFor(27)).smoke, undefined);
  });
}

test('block coins use separate slots and PAL Y velocities before handing off to score and glitter', () => {
  const state = { tick: 0, players: {}, rewardEffects: [] as RewardEffect[] } as unknown as GameState;
  for (let n = 0; n < 2; n++) addRewardEffect(state, { roomId: '101', x: n * 32, y: 128, tick: 0, award: 10, fromBlock: true });
  assert.deepEqual(state.rewardEffects?.map(e => e.coinSlot), [3, 2]);
  const draws: { sx: number; y: number; oam: number; priority: number }[] = [];
  const view = new RewardView({ textures: { get: () => ({ getSourceImage: () => ({}) }) } } as never, { queue: (d: typeof draws[number]) => draws.push(d) } as never);
  function at(frame: number) {
    draws.length = 0;
    state.tick = tickFor(frame);
    assert.equal(palFrame(state.tick), frame);
    advanceRewardEffects(state);
    view.draw(state, '101', { x: 0, y: 0 });
    return draws.filter(d => d.oam === 18 || d.oam === 54);
  }
  for (const [i, y] of [125, 122, 119, 117, 114, 112, 110, 109].entries())
    assert.deepEqual(at(i).map(d => [d.y, d.priority]), [[y, 2]]);
  assert.equal(at(26).length, 0);
  assert.equal(at(27)[0].sx, 16);
  assert.deepEqual(state.rewardEffects?.map(e => e.scoreSlot), [5, 4]);
  assert.ok(!draws.some(d => d.sx === 24 * 16));
  at(28);
  assert.ok(draws.some(d => d.sx === 24 * 16));
  at(75);
  assert.equal(state.rewardEffects?.length, 0);
});


test('star sparks stay at the position of emission and expire on the shared PAL frame', () => {
  const p = player('luigi', '105');
  p.star = 600;
  for (let tick = 1; tick <= 28; tick++) {
    p.x += 4;
    stepStarTrail(p, tick);
  }
  const saved = structuredClone(p);
  assert.ok(p.starTrail && p.starTrail.sparks.length > 4 && p.starTrail.sparks.length <= 12);
  assert.ok(p.starTrail.sparks[0].x < p.x - 32);
  for (let tick = 29; tick <= 65; tick++) {
    p.star = saved.star = 0;
    stepStarTrail(p, tick);
    stepStarTrail(saved, tick);
    assert.deepEqual(p.starTrail, saved.starTrail);
  }
  assert.equal(p.starTrail, undefined);
});

test('death holds, rises 70 px, and falls past the camera before respawning in either mode', async () => {
  const { deathPosition, departing } = await import('../apps/web/src/game/death-animation.ts');
  const curve = JSON.parse(readFileSync('generated/player-death.json', 'utf8'));
  for (const duration of [76, 228]) {
    const p = player('mario', '105');
    p.status = 'dead'; p.death = { y: 168, tick: 17, duration };
    const y = Array.from({ length: duration }, (_, i) => deathPosition(p, 17 + i, curve).y);
    assert.equal(y[0], 168);
    assert.equal(y[12], 168);
    assert.equal(Math.min(...y), 98);
    assert.ok(y.at(-1)! > 350);
    assert.equal(departing(p, 17 + duration), false);
  }
});

test('a seventh simultaneous score recycles the OAM slot selected by the native counter', () => {
  const state = { tick: 0, players: {}, rewardEffects: [] as RewardEffect[] } as unknown as GameState;
  const score = (roomId: string) => addRewardEffect(state, { tick: state.tick, award: 100, roomId, x: 0, y: 0 });
  for (let i = 0; i < 8; i++) score('105');
  score('106');
  assert.deepEqual(state.rewardEffects!.map(e => e.scoreSlot), [undefined, undefined, 3, 2, 1, 0, 5, 4, 5]);
  state.tick = 100;
  advanceRewardEffects(state);
  for (let i = 0; i < 7; i++) score('105');
  assert.equal(state.rewardEffects!.at(-1)!.scoreSlot, 3);
});
