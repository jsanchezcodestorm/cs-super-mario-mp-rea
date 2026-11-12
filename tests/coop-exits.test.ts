import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buttons, validateSave, type CampaignDefinition } from '@smw/core';
import { mapInputs } from './coop/map-inputs.ts';
import { objectives } from './coop/objectives.ts';
import { exerciseContact } from './coop/contacts.ts';
import { openTestRoom } from './coop/socket-room.ts';

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
campaign.movieTicks = JSON.parse(readFileSync('generated/movies/durations.json', 'utf8'));

test('96 PAL exit contacts share and persist a single campaign over two WebSockets', async (t) => {
  const session = await openTestRoom(campaign);
  t.after(session.close);
  const { state, drive, mario, luigi } = session;
  const remaining = objectives(campaign);
  assert.equal(remaining.filter((o) => o.kind === 'normal').length, 72);
  assert.equal(remaining.filter((o) => o.kind === 'secret').length, 24);
  for (let i = 0; remaining.length; i++) {
    const pick = remaining.findIndex((o) => state.progress.unlocked.includes(o.course) &&
      (state.phase === 'map' || o.course === state.progress.course));
    assert.notEqual(pick, -1, 'no selectable objective: ' + remaining.map((o) => o.id));
    const [objective] = remaining.splice(pick, 1);
    if (state.phase === 'map') {
      for (const [button, frames] of mapInputs(campaign, state, objective.course))
        await drive(0, button, frames);
    }
    if (state.entrance) await drive(Buttons.jump, 0);
    assert.equal(state.progress.course, objective.course);
    const who = i % 2 ? 'luigi' : 'mario';
    await exerciseContact({ campaign, state }, objective, who, drive);
    await Promise.all([mario.flush(), luigi.flush()]);
    for (const client of [mario, luigi]) {
      assert.equal(client.exits.at(-1), who + ':' + objective.kind, objective.id);
      assert.equal(client.exits.length, i + 1, 'duplicate event for ' + objective.id);
      assert.equal(client.save?.progress.completed.length, i + 1, objective.id);
      assert.equal(client.save?.progress.completed.at(-1), objective.id);
      assert.ok(validateSave(campaign, client.save), 'cannot resume ' + objective.id);
    }
    assert.deepEqual(mario.save, luigi.save);
    for (const next of campaign.routes[objective.course][objective.kind] ?? [])
      assert.ok(state.progress.unlocked.includes(next), 'locked destination ' + next);
  }
  assert.equal(new Set(state.progress.completed).size, 96);
  const resumed = await openTestRoom(campaign, luigi.save);
  t.after(resumed.close);
  assert.deepEqual(resumed.state.progress, state.progress);
  assert.equal(resumed.state.phase, 'map');
  await resumed.drive(Buttons.action, 0);
  assert.equal(resumed.state.phase, 'playing');
});
