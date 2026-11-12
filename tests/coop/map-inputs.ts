import assert from 'node:assert/strict';
import { Buttons, type CampaignDefinition, type GameState } from '@smw/core';
import { overworldTarget } from '../../packages/core/src/overworld.ts';

type Movement = { button: number; to: string };
const controls = [Buttons.left, Buttons.right, Buttons.up, Buttons.down, Buttons.action];

function position(state: GameState) {
  return state.mapStop ?? state.progress.unlocked[state.progress.selection];
}

function pathTo(c: CampaignDefinition, unlocked: string[], start: string, goal: string): Movement[] {
  const queue = [start];
  const previous = new Map<string, { from: string; button: number }>();
  for (let i = 0; i < queue.length && queue[i] !== goal; i++) {
    const from = queue[i];
    for (const button of controls) {
      const to = overworldTarget(c, unlocked, from, button);
      if (!to || to === start || previous.has(to)) continue;
      previous.set(to, { from, button });
      queue.push(to);
    }
  }
  const path: Movement[] = [];
  for (let to = goal; to !== start;) {
    const edge = previous.get(to);
    assert.ok(edge, 'no directional path from ' + start + ' to ' + goal + ' across unlocked courses');
    path.push({ button: edge.button, to });
    to = edge.from;
  }
  return path.reverse();
}

// The caller applies each batch to the live simulation or both WebSocket clients
// before requesting the next one. Distances come from the actual map animation.
export function* mapInputs(c: CampaignDefinition, state: GameState, course: string): Generator<[button: number, frames: number]> {
  assert.equal(state.phase, 'map');
  assert.ok(state.progress.unlocked.includes(course), 'locked course ' + course);
  if (state.cutscene) {
    const elapsed = state.tick - state.cutscene.start;
    yield [0, Math.max(1, 31 - elapsed)];
    if (state.cutscene) yield [Buttons.action, 1];
    assert.equal(state.cutscene, undefined, 'skip cutscene before map travel');
  }
  function* finishTravel(): Generator<[number, number]> {
    const travel = state.mapTravel;
    if (!travel) return;
    const remaining = travel.duration - travel.elapsed;
    assert.ok(Number.isSafeInteger(remaining) && remaining > 0, 'invalid map travel duration');
    yield [0, remaining];
    assert.equal(state.mapTravel, undefined, 'map travel did not finish at ' + travel.to);
    assert.equal(position(state), travel.to);
  }
  yield* finishTravel();
  const start = position(state);
  for (const { button, to } of pathTo(c, state.progress.unlocked, start, course)) {
    yield [button, 1];
    assert.equal(state.mapTravel?.to, to, 'map direction did not lead to ' + to);
    yield* finishTravel();
  }
  yield [0, 1];
  yield [Buttons.action, 1];
  assert.equal(state.phase, 'playing');
  assert.equal(state.progress.course, course);
}
