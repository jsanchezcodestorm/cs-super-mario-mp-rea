import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, makeSave, stepGame, type CampaignDefinition, type GameState, type InputFrame, type PlayerId } from '@smw/core';
import { startCourse } from '../../packages/core/src/campaign.ts';
import { mapInputs } from './map-inputs.ts';

export type Run = [mario: number, luigi: number, frames: number];
type Requirements = { mario?: 'cape'; luigi?: 'cape'; switches?: string[] };
export type Recording = Run[] | { runs: Run[]; requires: Requirements };

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL('../coop-routes/' + name + '.json', import.meta.url), 'utf8'));
}
export const palaces = fixture<Record<string, Run[]>>('palaces');
export const supplies = fixture<{ topSecret: Run[]; donutPlains: Run[]; donutPair: Run[] }>('resupply');
export function recordings(): Record<string, Recording> {
  const result: Record<string, Recording> = {};
  for (const group of ['palaces', 'normal', 'castles', 'secret', 'bridges', 'star-five']) {
    for (const [id, recording] of Object.entries(fixture<Record<string, Recording>>(group))) {
      assert.ok(!Object.hasOwn(result, id), 'duplicate recording ' + id);
      result[id] = recording;
    }
  }
  return result;
}

export type Observe = (input: InputFrame) => void;
export function choose(c: CampaignDefinition, state: GameState, course: string, observe?: Observe) {
  for (const [button, frames] of mapInputs(c, state, course)) {
    const input = { mario: button, luigi: 0 };
    for (let i = 0; i < frames; i++) {
      observe?.(input);
      stepGame(c, state, input);
    }
  }
  // Same round trip used by "Riprendi campagna salvata" on a course entry.
  return createGame(c, makeSave(state));
}

export function play(c: CampaignDefinition, state: GameState, runs: Run[], swap = false, observe?: Observe) {
  for (const [a, b, frames] of runs) {
    assert.ok(Number.isSafeInteger(frames) && frames > 0);
    const input = swap ? { mario: b, luigi: a } : { mario: a, luigi: b };
    for (let i = 0; i < frames; i++) {
      observe?.(input);
      stepGame(c, state, input);
      if (state.events.some((e) => e.type === 'exit' || e.type === 'ending')) return;
      if (state.phase !== 'playing') return;
    }
  }
}

export function prepareCourse(base: CampaignDefinition, course: string, requirements: Requirements = {}) {
  const switches = requirements.switches ?? [];
  const capes = (['mario', 'luigi'] as PlayerId[]).filter((id) => requirements[id] === 'cape');
  const preparation = [...switches, ...capes.map(() => '003')];
  // Isolate this entrance while replaying every prerequisite with controllers.
  const initial = [...new Set([...preparation, course])];
  const c = { ...base, start: initial[0], initial };
  let state = createGame(c);
  // Isolated entrance tests start each course directly. Carry forward the
  // actual save from each completed prerequisite, including both inventories.
  function enter(level: string) {
    startCourse({ campaign: c, state }, level);
    state = createGame(c, makeSave(state));
  }
  for (const [i, level] of preparation.entries()) {
    enter(level);
    if (level === '003') {
      const seat = capes[i - switches.length];
      play(c, state, supplies.topSecret, seat === 'luigi');
      assert.equal(state.players[seat].form, 'cape', 'collect feather for ' + seat);
    } else {
      play(c, state, palaces[level + ':normal']);
      assert.ok(state.progress.completed.includes(level + ':normal'), 'activate Palace ' + level + ' from ' + state.players.mario.roomId);
    }
    assert.equal(state.phase, 'map', 'leave ' + level);
  }
  enter(course);
  return { c, state };
}
