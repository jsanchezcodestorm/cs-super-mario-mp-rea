import assert from 'node:assert/strict';
import { Buttons, stepGame, type CampaignDefinition, type GameState, type InputFrame } from '@smw/core';
import type { Observe } from './inputs.ts';

// In Yoshi’s Island 1, running without jumping takes hits from the charging
// enemies. The pipe and the course timer take care of any surviving player.
export function continueAfterGameOver(c: CampaignDefinition, state: GameState, observe: Observe) {
  assert.equal(state.progress.course, '105');
  assert.ok(state.progress.completed.includes('105:normal'));
  const completed = [...state.progress.completed];
  const press = (input: InputFrame) => {
    observe(input);
    stepGame(c, state, input);
  };
  const teamLives = state.sharedLives!;
  const timeout = c.levels['105'].timeLimit!;
  const deadline = state.tick + (teamLives + 2) * timeout * 41;
  const run = Buttons.right | Buttons.run;
  while (state.phase === 'playing' && state.tick < deadline) press({ mario: run, luigi: run });
  assert.equal(state.phase, 'gameOver');
  press({ mario: 0, luigi: Buttons.action });
  assert.equal(state.phase, 'map');
  assert.deepEqual(state.progress.completed, completed);
  assert.equal(state.sharedLives, 10);
  for (const p of Object.values(state.players))
    assert.deepEqual([p.form, p.mounted, p.reserve, p.lives], ['small', false, null, state.sharedLives]);
}
