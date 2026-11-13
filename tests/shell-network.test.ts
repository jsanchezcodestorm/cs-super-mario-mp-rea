import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Buttons, type CampaignDefinition, type GameState, type HitAward } from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
import { openTestRoom } from './coop/socket-room.ts';
import { mapInputs } from './coop/map-inputs.ts';

test('Luigi throws the red shell through all eight red Koopas in Yoshi’s Island 2 over WebSocket', async t => {
  const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
  const session = await openTestRoom(campaign);
  t.after(() => session.close());
  for (const [luigi, frames, mario = 0] of mapInputs(campaign, session.state, '106', 'luigi')) {
    await session.drive(mario, luigi, frames);
  }
  const latest: (GameState | undefined)[] = [];
  const awards: HitAward[][] = [[], []];
  const sawLife = [false, false];
  for (const [i, peer] of [session.mario, session.luigi].entries()) {
    peer.socket.on('message', raw => {
      const message: ServerMessage = JSON.parse(raw.toString());
      if (message.type === 'snapshot') {
        latest[i] = message.state;
        if (message.state.rewardEffects?.some(effect => effect.roomId === '106' && effect.award === '1up'))
          sawLife[i] = true;
      }
      if (message.type === 'gameEvent' && message.event.type === 'shellHit' && message.event.award !== undefined)
        awards[i].push(message.event.award);
    });
  }
  // Grab the first shell, jump toward the raised walkway and release it above the Koopas.
  await session.drive(0, Buttons.right | Buttons.run, 110);
  assert.ok(session.state.players.luigi.carrying);
  await session.drive(0, Buttons.right | Buttons.run | Buttons.jump, 12);
  await session.drive(0, Buttons.right | Buttons.jump, 15);
  await session.drive(0, 0, 120);
  await Promise.all([session.mario.flush(), session.luigi.flush()]);
  assert.deepEqual(awards[0], [200, 400, 800, 1000, 2000, 4000, 8000, '1up']);
  assert.deepEqual(awards[1], awards[0]);
  assert.deepEqual(sawLife, [true, true]);
  for (const state of latest) {
    assert.ok(state);
    assert.equal(state.players.luigi.score, 16400);
    assert.equal(state.players.luigi.lives, 6);
    assert.equal(state.players.mario.score, 0);
    assert.equal(state.players.mario.lives, 5);
  }
});
