import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Buttons, createGame, netDoorPhase, palFrame, stepGame, type CampaignDefinition, type GameState } from '@smw/core';
import { enterRoom } from '../packages/core/src/state.ts';

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
const step = (s: GameState, mario = 0, luigi = 0) => stepGame(campaign, s, { mario, luigi });

for (const id of ['101', '1d3']) {
  const doors = campaign.levels[id].sprites.filter(s => s.spriteId === 0x54);
  for (const door of doors) {
    test(`Mario and Luigi turn the net door at ${id}/${door.x}, return separately and release on jump`, () => {
      const state = createGame(campaign);
      state.phase = 'playing'; state.entrance = null;
      for (const p of Object.values(state.players)) {
        enterRoom({ campaign, state }, p, id);
        Object.assign(p, { x: door.x + 20, y: door.y + 26, vx: 0, vy: 0, grounded: false });
      }
      step(state, Buttons.up, Buttons.up);
      step(state); // release the D-pad and stay on the net
      assert.ok(state.players.mario.netClinging && state.players.luigi.netClinging);
      const startX = state.players.mario.x;
      function punch(both: boolean, fromBehind: boolean) {
        step(state, Buttons.run, both ? Buttons.run : 0);
        const start = state.tick;
        for (let f = 0; f <= 43; f++) {
          while (palFrame(state.tick) - palFrame(start) < f) step(state);
          const p = state.players.mario;
          if (f < 8) assert.equal(p.netPunchTick, start);
          if (f >= 12 && f < 43) {
            assert.equal(state.netDoors?.length, 1);
            assert.equal(netDoorPhase(state.netDoors![0], state.tick), f-12);
            assert.equal(p.netTurn?.x, door.x);
          }
          assert.equal(!!p.behindNet, f < 27 ? fromBehind : !fromBehind);
          assert.equal(!!state.players.luigi.behindNet, both ? !!p.behindNet : true);
        }
        assert.equal(state.netDoors, undefined);
        assert.equal(state.players.mario.netTurn, undefined);
      }
      punch(true, false);
      assert.equal(state.players.mario.x - startX, 10); // E1 native X 194 -> 204 at offset -6
      step(state);
      punch(false, true);
      assert.equal(state.players.mario.x - startX, 1);
      step(state, Buttons.jump, Buttons.jump);
      assert.ok(!state.players.mario.netClinging && !state.players.luigi.netClinging);
    });
  }
}

test('a punch on the fixed fence outside the latch does not rotate a door', () => {
  const state = createGame(campaign);
  state.phase = 'playing'; state.entrance = null;
  const p = state.players.mario;
  enterRoom({ campaign, state }, p, '1d3');
  Object.assign(p, { x: 169, y: 298, grounded: false });
  step(state, Buttons.up);
  step(state, Buttons.run);
  assert.equal(p.netPunchTick, state.tick);
  for (let t = 0; t < 60; t++) {
    step(state);
    assert.equal(state.netDoors, undefined);
    assert.ok(!p.behindNet);
  }
});
