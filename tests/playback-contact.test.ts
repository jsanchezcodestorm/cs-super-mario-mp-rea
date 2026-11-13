import { enterFirstCourse } from '../packages/core/test/enter-first-course.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyState, stepGame, type CampaignDefinition } from '@smw/core';
import { Playback } from '../apps/web/src/game/playback.ts';

test('both clients render riders and a rising platform at the same tick during input replay', () => {
  const room = { id: 'lift', width: 12, height: 12, spawn: { x: 32, y: 80 },
    tiles: Array<number>(144).fill(0x25), exits: [], sprites: [{ spriteId: 0xc1, x: 32, y: 96 }] };
  const campaign: CampaignDefinition = { start: room.id, levels: { lift: room }, routes: { lift: {} } };
  const initial = enterFirstCourse(campaign);
  const deck = initial.entities[0];
  for (const p of Object.values(initial.players))
    Object.assign(p, { x: deck.x, y: deck.y - p.height, grounded: true });
  for (const seat of ['mario', 'luigi'] as const) {
    const client = new Playback(campaign, seat, () => true);
    const server = copyState(initial);
    client.receive(server, 0);
    for (let frame = 0; frame < 6; frame++) client.update(0);
    assert.notEqual(client.displayState!.entities[0].y, server.entities[0].y);
    function checkContact() {
      const shown = client.displayState!;
      for (const p of Object.values(shown.players)) assert.equal(p.y + p.height, shown.entities[0].y);
      assert.equal(shown.tick, initial.tick + 6);
    }
    checkContact();
    for (let frame = 0; frame < 3; frame++) stepGame(campaign, server, { mario: 0, luigi: 0 });
    client.receive(server, 3);
    checkContact();
  }
});
