import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSave, validateSave, type CampaignDefinition } from '@smw/core';
import { prepareCourse, play, recordings, supplies } from './coop/inputs.ts';
import { checkSolidContacts } from './coop/solid-contact.ts';
import { objectives } from './coop/objectives.ts';

const base: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
base.movieTicks = JSON.parse(readFileSync('generated/movies/durations.json', 'utf8'));
const routes = recordings();
test('the recordings cover exactly the 96 PAL objectives and both entrances to Bowser', () => {
  const expected = [...objectives(base).map((o) => o.id), '10d:ending', '10e:ending'];
  assert.equal(expected.length, 98);
  assert.deepEqual(Object.keys(routes).sort(), expected.sort());
});
for (const [id, recording] of Object.entries(routes)) {
  test('two controllers from entrance to ' + id + ' ' + base.names![id.split(':')[0]], () => {
    const [course, kind] = id.split(':');
    const { c, state } = prepareCourse(base, course, Array.isArray(recording) ? {} : recording.requires);
    const inputs = Array.isArray(recording) ? recording : recording.runs;
    assert.ok(inputs.some(([a]) => a !== 0) && inputs.some(([, b]) => b !== 0), 'both seats must play');
    play(c, state, inputs, false, () => checkSolidContacts(c, state));
    const event = state.events.find((e) => e.type === (kind === 'ending' ? 'ending' : 'exit'));
    assert.ok(event && event.playerId, 'missing goal ' + id);
    if (kind === 'ending') assert.equal(state.phase, 'ending');
    else {
      assert.equal(event.exit, kind);
      assert.equal(state.progress.completed.at(-1), id);
    }
    assert.ok(validateSave(c, makeSave(state)));
  });
}

test('before Top Secret Area unlocks Mario can collect a cape in Donut Plains 1 while Luigi reaches the tape', () => {
  const { c, state } = prepareCourse(base, '015');
  play(c, state, supplies.donutPlains);
  assert.equal(state.players.mario.form, 'cape');
  assert.equal(state.events.find((e) => e.type === 'exit')?.playerId, 'luigi');
});
