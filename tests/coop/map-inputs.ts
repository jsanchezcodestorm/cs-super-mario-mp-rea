import assert from 'node:assert/strict';
import { Buttons, type CampaignDefinition, type GameState, type PlayerId } from '@smw/core';
import { overworldTarget } from '../../packages/core/src/overworld.ts';

type Movement = { button: number; to: string };
const controls = [Buttons.left, Buttons.right, Buttons.up, Buttons.down, Buttons.action];

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
type MapBatch = [navigator: number, frames: number, partner?: number];
export function* mapInputs(c: CampaignDefinition, state: GameState, course: string, navigator: PlayerId): Generator<MapBatch> {
  const actor = state.mapPlayers[navigator];
  assert.equal(state.phase, 'map');
  assert.ok(state.progress.unlocked.includes(course), 'locked course ' + course);
  for (let i = 0; i < 60 && (state.goalWalk || state.keyholeFinish || state.orbFinish); i++) yield [0, 12];
  assert.ok(!state.goalWalk && !state.keyholeFinish && !state.orbFinish, 'finish the level before navigating');
  if (state.cutscene) {
    const elapsed = state.tick - state.cutscene.start;
    yield [0, Math.max(1, 31 - elapsed)];
    if (state.cutscene) yield [Buttons.action, 1];
    assert.equal(state.cutscene, undefined, 'skip cutscene before map travel');
  }
  function* finishTravel(): Generator<MapBatch> {
    const travel = actor.travel;
    if (!travel) return;
    const remaining = travel.duration - travel.elapsed;
    assert.ok(Number.isSafeInteger(remaining) && remaining > 0, 'invalid map travel duration');
    yield [0, remaining];
    assert.equal(actor.travel, undefined, 'map travel did not finish at ' + travel.to);
    assert.equal(actor.stop, travel.to);
  }
  yield* finishTravel();
  const start = actor.stop;
  for (const { button, to } of pathTo(c, state.progress.unlocked, start, course)) {
    yield [button, 1];
    assert.equal(actor.travel?.to, to, 'map direction did not lead to ' + to);
    yield* finishTravel();
  }
  yield [0, 1];
  yield [Buttons.action, 1];
  assert.deepEqual(state.mapRequest, { course, requester: navigator, confirmed: [navigator] });
  yield [0, 1, Buttons.action];
  assert.equal(state.phase, 'playing');
  assert.equal(state.progress.course, course);
}
