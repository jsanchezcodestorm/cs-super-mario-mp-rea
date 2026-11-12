import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buttons, createGame, makeSave, stepGame, validateSave, type CampaignDefinition } from '@smw/core';

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
const replays: Record<string, [number, number][]> = JSON.parse(
  readFileSync('tests/course-inputs.json', 'utf8'),
);

campaign.movieTicks = JSON.parse(readFileSync('generated/movies/durations.json', 'utf8'));

for (const [course, commands] of Object.entries(replays)) {
  test('complete ' + campaign.names![course] + ' using controller inputs', () => {
    // Each fixture boots directly at its course entrance. Every subsequent tick
    // takes the same simulation path as a network input, including exits.
    const fixture = { ...campaign, start: course, initial: [course] };
    const state = createGame(fixture);
    playing: for (const [buttons, frames] of commands) {
      for (let tick = 0; tick < frames; tick++) {
        stepGame(fixture, state, { mario: buttons, luigi: 0 });
        if (state.phase !== 'playing') break playing;
      }
    }
    if (course === '10e') {
      assert.equal(state.phase, 'ending');
      assert.equal(state.cutscene?.key, 'ending');
      assert.equal(state.players.mario.lives, 5);
      const duration = state.cutscene!.duration;
      for (let frame = 0; frame < duration; frame++) stepGame(fixture, state, { mario: 0, luigi: 0 });
      assert.equal(state.phase, 'ending');
      assert.equal(state.cutscene, undefined);
      return;
    }
    assert.equal(state.phase, 'map');
    assert.ok(state.progress.completed.includes(course + ':normal'));
    const next = state.progress.unlocked[state.progress.selection];
    assert.ok(campaign.routes[course].normal?.includes(next) || !campaign.routes[course].normal);
    const save = makeSave(state);
    assert.ok(validateSave(fixture, save));
    const restored = createGame(fixture, save);
    stepGame(fixture, restored, { luigi: Buttons.action, mario: 0 });
    assert.equal(restored.phase, 'playing');
    assert.equal(restored.progress.course, next);
    assert.equal(restored.players.mario.roomId, restored.players.luigi.roomId);
  });
}

test('ROM scroll capture and generator dispatch are shared by both players', async () => {
  const { scrollingCamera } = await import('@smw/core');
  const tunnel = campaign.levels['1fc'];
  assert.ok(tunnel.autoscroll);
  assert.deepEqual(scrollingCamera(tunnel, 0), { x: 0, y: 192 });
  assert.ok(scrollingCamera(tunnel, 100000)!.x > 700);
  const course = '119';
  const fixture = { ...campaign, start: course, initial: [course] };
  const state = createGame(fixture);
  const generator = campaign.levels[course].sprites.find((s) => s.spriteId === 0xd5)!;
  // Put both screen centers by the same vanilla generator. Its first burst must
  // produce only one bullet on the shared server even when both cameras cover it.
  for (const p of Object.values(state.players)) {
    p.x = generator.x;
    p.y = 240;
    p.invincible = 200;
  }
  const { stepEmitters } = await import('../packages/core/src/emitters.ts');
  assert.ok(campaign.emitters?.[0xd5].events.length);
  state.tick = campaign.emitters[0xd5].events[0][0];
  stepEmitters({ campaign: fixture, state }, campaign.levels[course], Object.values(state.players));
  assert.equal(state.entities.filter((e) => e.emission && e.spriteId === 0x1c).length, 1);
});

test('reserve items and scores belong to each player and survive a campaign save', async () => {
  const state = createGame(campaign),
    world = { campaign, state };
  const { contact } = await import('../packages/core/src/entity-contact.ts');
  const { spawnEntity } = await import('../packages/core/src/state.ts');
  const p = state.players.luigi;
  p.form = 'cape';
  const flower = spawnEntity(world, p.roomId, { x: p.x, y: p.y, spriteId: 0x75 })!;
  contact(world, flower, p, 0, p.y + p.height);
  assert.equal(p.form, 'fire');
  assert.equal(p.reserve, 'feather');
  assert.equal(p.score, 1000);
  assert.equal(state.players.mario.reserve, null);
  const save = makeSave(state);
  assert.ok(validateSave(campaign, save));
  // Session-only fields in a client-provided save cannot replace the assigned seat.
  Object.assign(save.resources.luigi, { id: 'mario', width: 900, invincible: 100000 });
  const restored = createGame(campaign, save);
  assert.equal(restored.players.luigi.id, 'luigi');
  assert.equal(restored.players.luigi.width, 12);
  assert.equal(restored.players.luigi.invincible, 0);
  assert.equal(restored.players.luigi.reserve, 'feather');
  stepGame(campaign, restored, { mario: 0, luigi: Buttons.reserve });
  assert.equal(restored.players.luigi.reserve, null);
  assert.ok(restored.entities.some((e) => e.reserveDrop && e.kind === 'feather'));
});
