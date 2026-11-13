import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Buttons, createGame, makeSave, stepGame, validateSave,
  type CampaignDefinition, type GameState, type InputFrame,
} from '@smw/core';
import { choose, palaces, play, recordings, supplies, type Observe, type Run } from './inputs.ts';
import { checkSolidContacts } from './solid-contact.ts';
import { continueAfterGameOver } from './reset-loadout.ts';

type Visit = [objective: string, swapControllers: boolean, idleFrames: number];
const fixtures = new URL('../coop-routes/', import.meta.url);
const schedule: Visit[] = JSON.parse(readFileSync(new URL('campaign.json', fixtures), 'utf8'));
const afterPalaces: Record<string, Run[]> = JSON.parse(readFileSync(new URL('after-palaces.json', fixtures), 'utf8'));
const routes = recordings();

function capture(runs: Run[]): Observe {
  return ({ mario, luigi }) => {
    const last = runs.at(-1);
    if (last && last[0] === mario && last[1] === luigi) last[2]++;
    else runs.push([mario, luigi, 1]);
  };
}

function bonusInputs(s: GameState): InputFrame {
  const bonus = s.bonus!;
  function buttons(id: 'mario' | 'luigi') {
    const p = s.players[id];
    const prize = s.entities.find((e) => e.active && e.bonusPrize);
    const target = bonus.result === null ? (id === 'mario' ? 112 : 144) : (prize?.x ?? 127);
    const dx = target - p.x;
    const move = dx > 3 ? Buttons.right : dx < -3 ? Buttons.left : 0;
    return move | (bonus.result === null && (p.grounded || p.vy < 0) ? Buttons.jump : 0);
  }
  return { mario: buttons('mario'), luigi: buttons('luigi') };
}

function courseInputs(state: GameState, id: string) {
  if (id === '015:supply') return supplies.donutPlains;
  if (id === '015:pair') return supplies.donutPair;
  if (id === '003:supply') return supplies.topSecret;
  if (Object.hasOwn(afterPalaces, id) &&
      Object.keys(palaces).every((palace) => state.progress.completed.includes(palace)))
    return afterPalaces[id];
  const route = routes[id];
  assert.ok(route, 'missing course recording ' + id);
  return Array.isArray(route) ? route : route.runs;
}

export function* generatePlaythrough(campaign: CampaignDefinition) {
  let state = createGame(campaign);
  const press = (input: InputFrame, observe: Observe) => {
    observe(input);
    stepGame(campaign, state, input);
  };
  for (const [id, swap, delay] of schedule) {
    const [course, goal] = id.split(':');
    const entryInputs: Run[] = [], inputs: Run[] = [];
    const onMap = capture(entryInputs), recordInput = capture(inputs);
    const inCourse: Observe = (input) => {
      if (state.phase === 'playing') checkSolidContacts(campaign, state);
      recordInput(input);
    };
    if (state.phase === 'ending') {
      for (let i = 0; i < 32; i++) press({ mario: 0, luigi: 0 }, onMap);
      press({ mario: 0, luigi: Buttons.action }, onMap);
      press({ mario: 0, luigi: 0 }, onMap);
      press({ mario: Buttons.action, luigi: 0 }, onMap);
    }
    state = choose(campaign, state, course, onMap);
    const entry = makeSave(state);
    if (goal === 'reset') continueAfterGameOver(campaign, state, inCourse);
    else {
      for (let i = 0; i < delay; i++) press({ mario: 0, luigi: 0 }, inCourse);
      play(campaign, state, courseInputs(state, id), swap, inCourse);
      const event = state.events.find((e) => e.type === (goal === 'ending' ? 'ending' : 'exit'));
      assert.ok(event?.playerId, 'missed the finish at ' + id);
      if (goal === 'normal' || goal === 'secret') {
        assert.equal(event.exit, goal);
        assert.equal(state.progress.completed.at(-1), id);
        assert.equal(state.progress.completed.length, entry.progress.completed.length + 1);
      }
      if (goal === 'supply') assert.equal(state.players[swap ? 'luigi' : 'mario'].form, 'cape');
      if (goal === 'pair') assert.ok(Object.values(state.players).every((p) => p.form === 'cape'));
      for (let i = 0; i < 720 && (state.goalWalk || state.keyholeFinish || state.orbFinish); i++) press({ mario: 0, luigi: 0 }, inCourse);
      assert.ok(!state.goalWalk && !state.keyholeFinish && !state.orbFinish, 'finish the closing animation at ' + id);
      for (let i = 0; state.bonus && i < 6000; i++) press(bonusInputs(state), inCourse);
      assert.equal(state.phase, goal === 'ending' ? 'ending' : 'map', id);
    }
    const result = makeSave(state);
    assert.ok(validateSave(campaign, result), 'cannot resume ' + id);
    yield { id, entry, entryInputs, inputs, result };
  }
}
