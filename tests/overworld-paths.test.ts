import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Buttons, createGame, makeSave, stepGame, type CampaignDefinition } from '@smw/core';

test('a saved pipe stop resumes on its native route between Vanilla Dome and the main map', () => {
  const catalog: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
  const campaign = { ...catalog, start: '109', initial: ['109', '001'] };
  let state = createGame(campaign);
  function move(button: number) {
    stepGame(campaign, state, { mario: 0, luigi: button });
    const trip = state.mapPlayers.luigi.travel;
    assert.ok(trip);
    for (let tick = 0; tick < trip.duration; tick++) stepGame(campaign, state, { mario: 0, luigi: 0 });
    return trip.to;
  }
  const pipe = move(Buttons.up);
  assert.equal(state.mapPlayers.luigi.stop, pipe);
  state = createGame(campaign, makeSave(state));
  assert.equal(state.mapPlayers.luigi.stop, pipe);
  const otherEnd = move(Buttons.action);
  assert.equal(campaign.overworldPaths![pipe].position[0], 2);
  assert.equal(campaign.overworldPaths![otherEnd].position[0], 0);
  assert.equal(move(Buttons.right), '001');
  assert.equal(state.mapPlayers.luigi.stop, '001');
  assert.equal(state.mapPlayers.mario.stop, '109');
  stepGame(campaign, state, { mario: 0, luigi: Buttons.action });
  stepGame(campaign, state, { mario: Buttons.action, luigi: 0 });
  assert.equal(state.progress.course, '001');
  assert.equal(state.phase, 'playing');
});
