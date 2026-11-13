import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Buttons, createGame, makeSave, type CampaignDefinition, type GameState } from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
import { openTestRoom } from './coop/socket-room.ts';

test('two mounted players reaching for the same red berry share one capture and one reward', async t => {
  const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
  const room = campaign.levels['106'];
  const berry = 22 * room.width + 11;
  assert.equal(room.tiles[berry], 0x45);
  const save = makeSave(createGame(campaign));
  save.phase = 'playing';
  save.progress.course = room.id;
  save.progress.selection = save.progress.unlocked.indexOf(room.id);
  save.progress.checkpoint = { roomId: room.id, x: 131, y: 368 };
  save.resources.mario.mounted = save.resources.luigi.mounted = true;
  const session = await openTestRoom(campaign, save);
  t.after(() => session.close());
  const seen = [false, false], last: (GameState | undefined)[] = [];
  for (const [i, client] of [session.mario, session.luigi].entries()) {
    client.socket.on('message', raw => {
      const message: ServerMessage = JSON.parse(raw.toString());
      if (message.type !== 'snapshot') return;
      last[i] = message.state;
      if (message.state.players.luigi.mouth?.kind === 'berry') seen[i] = true;
    });
  }
  await session.drive(0, 0, 12);
  // Luigi starts three ticks earlier. Both tongues cross the same Map16 cell.
  const lick = Buttons.up | Buttons.run;
  await session.drive(Buttons.up, lick, 3);
  await session.drive(lick, lick, 65);
  await Promise.all([session.mario.flush(), session.luigi.flush()]);
  assert.deepEqual(seen, [true, true]);
  for (const snapshot of last) {
    assert.ok(snapshot);
    assert.equal(snapshot.tileChanges[room.id][berry], 0x49);
    assert.equal(snapshot.players.luigi.coins, 1);
    assert.equal(snapshot.players.luigi.berries?.red, 1);
    assert.equal(snapshot.players.mario.coins, 0);
    assert.equal(snapshot.players.luigi.score, 0);
    assert.equal(snapshot.players.luigi.tongueFrame, 0);
    assert.equal(snapshot.players.mario.tongueFrame, 0);
  }
});
