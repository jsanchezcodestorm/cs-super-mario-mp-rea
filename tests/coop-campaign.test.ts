import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Buttons, createGame, stepGame, type CampaignDefinition, type CampaignSave } from '@smw/core';
import { objectives } from './coop/objectives.ts';
import { generatePlaythrough } from './coop/playthrough.ts';

test('one campaign earns all 96 exits from their entrances and beats Bowser by both doors', () => {
  const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
  campaign.movieTicks = JSON.parse(readFileSync('generated/movies/durations.json', 'utf8'));
  const endings: string[] = [];
  let last: CampaignSave | undefined;
  for (const visit of generatePlaythrough(campaign)) {
    if (visit.result.phase === 'ending') endings.push(visit.id);
    last = visit.result;
  }
  assert.deepEqual(endings.sort(), ['10d:ending', '10e:ending']);
  assert.ok(last);
  assert.deepEqual([...last.progress.completed].sort(), objectives(campaign).map((o) => o.id).sort());
  const resumed = createGame(campaign, last);
  stepGame(campaign, resumed, { mario: 0, luigi: Buttons.action });
  assert.equal(resumed.phase, 'map');
  assert.deepEqual(resumed.progress.completed, last.progress.completed);
});
