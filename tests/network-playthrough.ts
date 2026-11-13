import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSave, type CampaignDefinition, type CampaignSave } from '@smw/core';
import { generatePlaythrough } from './coop/playthrough.ts';
import { openTestRoom } from './coop/socket-room.ts';
import type { Run } from './coop/inputs.ts';

type Session = Awaited<ReturnType<typeof openTestRoom>>;

const generated = new URL('../generated/', import.meta.url);
const campaign: CampaignDefinition = JSON.parse(readFileSync(new URL('content.json', generated), 'utf8'));
campaign.movieTicks = JSON.parse(readFileSync(new URL('movies/durations.json', generated), 'utf8'));

async function playInputs(session: Session, inputs: Run[]) {
  for (const [mario, luigi, frames] of inputs) await session.drive(mario, luigi, frames);
  await Promise.all([session.mario.flush(), session.luigi.flush()]);
}

function sharedSave(session: Session, expected: CampaignSave, label: string) {
  const { mario, luigi } = session;
  assert.ok(validateSave(campaign, mario.save), 'invalid Mario save at ' + label);
  assert.deepEqual(mario.save, luigi.save, 'clients disagree at ' + label);
  assert.deepEqual(mario.save, expected, 'unexpected shared save at ' + label);
  return mario.save;
}

let session = await openTestRoom(campaign);
let visits = 0, ticks = 0;
const finishes = { mario: 0, luigi: 0 };
try {
  for (const visit of generatePlaythrough(campaign)) {
    await playInputs(session, visit.entryInputs);
    const received = sharedSave(session, visit.entry, 'entry ' + visit.id);
    await session.close();
    session = await openTestRoom(campaign, received);

    await playInputs(session, visit.inputs);
    const result = sharedSave(session, visit.result, 'result ' + visit.id);
    assert.deepEqual(session.mario.exits, session.luigi.exits, 'exit announcements for ' + visit.id);
    const goal = visit.id.split(':')[1];
    if (goal === 'normal' || goal === 'secret') {
      assert.equal(session.mario.exits.length, 1, visit.id);
      const [finisher, exit] = session.mario.exits[0].split(':');
      assert.equal(exit, goal, visit.id);
      assert.ok(finisher === 'mario' || finisher === 'luigi', visit.id);
      finishes[finisher]++;
    }
    if (result.phase === 'ending') {
      assert.deepEqual(session.mario.endings, session.luigi.endings, visit.id);
      assert.equal(session.mario.endings.length, 1, visit.id);
    }
    visits++;
    ticks += [...visit.entryInputs, ...visit.inputs].reduce((sum, run) => sum + run[2], 0);
    if (visits % 10 === 0 || result.phase === 'ending')
      console.log(visits + ' visits, ' + result.progress.completed.length + '/96 exits, ' + ticks + ' frames');
  }
  assert.equal(session.mario.save?.phase, 'ending', 'finish Bowser');
  assert.equal(new Set(session.mario.save.progress.completed).size, 96);
  assert.equal(finishes.mario + finishes.luigi, 96);
  assert.ok(finishes.mario > 0 && finishes.luigi > 0, 'each player must earn exits for the team');
  console.log(`96 shared exits. Mario finished ${finishes.mario}, Luigi finished ${finishes.luigi}.`);
} finally {
  await session.close();
}
