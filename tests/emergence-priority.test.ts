import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Buttons, createGame, playerPipePosition, stepGame, type CampaignDefinition, type GameState } from '@smw/core';
import { CastView } from '../apps/web/src/game/cast-view.ts';
import { bump } from '../packages/core/src/blocks.ts';
import { enterRoom, spawnEntity } from '../packages/core/src/state.ts';
import { isBodyFree } from '../packages/core/src/terrain.ts';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const campaign: CampaignDefinition = json('generated/content.json');
const registration = { actors: json('generated/actors-registration.json'), creatures: json('generated/creatures-registration.json') };
const arenas = json('generated/bosses/index.json');

function cast(state: GameState, roomId: string) {
  const records: { image: string; priority: number }[] = [];
  const textures = { get: () => ({ has: () => true, get: (name: string) => ({
    source: { image: name }, cutX: 0, cutY: 0, cutWidth: 16, cutHeight: 16,
  }) }) };
  const scene = { textures, cache: { json: { get: () => arenas } } };
  const view = new CastView(scene as never, { queue: (part: typeof records[number]) => records.push(part) } as never, registration);
  const stage = campaign.levels[roomId];
  view.draw(stage as never, { x: state.players.mario.x - 40, y: state.players.mario.y - 100 }, state);
  return records;
}

test('both riders use OBJ1 only at a native pipe entrance, on the shared snapshot clock', () => {
  for (const [id, direction, length] of [
    ['0bd', 'right', 28], ['1f0', 'left', 28], ['0c6', 'up', 30], ['1c9', 'down', 15],
  ] as const) {
    const state = createGame(campaign), world = { campaign, state };
    for (const p of Object.values(state.players)) {
      p.mounted = p.id === 'luigi';
      enterRoom(world, p, id);
      assert.equal(p.pipeExit?.direction, direction);
    }
    state.entities = [];
    const p = state.players.mario;
    const horizontal = direction === 'right' || direction === 'left';
    const axis = horizontal ? 'x' : 'y';
    const sign = direction === 'right' || direction === 'down' ? -1 : 1;
    assert.equal(playerPipePosition(p, state.tick)![axis], p[axis] + sign * length * (horizontal ? 0.5 : 1));
    const rendered = cast(structuredClone(state), id);
    assert.ok(rendered.some(i => i.image.startsWith('luigi/')) && rendered.some(i => i.image.includes('-53:green/')));
    assert.ok(rendered.some(i => i.image.startsWith('mario/')) && rendered.every(i => i.priority === 1));
    state.tick += Math.ceil(length * 6 / 5);
    const ended = cast(state, id);
    assert.ok(ended.filter(i => i.image.startsWith('mario/')).every(i => i.priority === 2));
    assert.ok(ended.filter(i => i.image.startsWith('luigi/')).every(i => i.priority === 1));
  }
});

test('leaving the rim cancels the script permanently, and a regular spawn or checkpoint has no phase', () => {
  const state = createGame(campaign), world = { campaign, state };
  state.phase = 'playing';
  const p = state.players.mario;
  const source = campaign.levels['01c'].exits.find(exit => exit.target === '0bd')!;
  enterRoom(world, p, source.target, source.spawn);
  const x = p.x;
  p.x += 24;
  stepGame(campaign, state, { mario: 0, luigi: 0 });
  p.x = x;
  assert.equal(p.pipeExit, undefined);
  assert.equal(playerPipePosition(p, state.tick), null);
  const { x: checkpointX, y } = campaign.levels['0bd'].spawn;
  enterRoom(world, p, '0bd', { x: checkpointX, y });
  assert.equal(p.pipeExit, undefined);
  enterRoom(world, p, '105');
  assert.ok(p.cooldown > 0);
  assert.equal(playerPipePosition(p, state.tick), null);
});

test('a secondary pipe exit clears the terrain when the large player enters without a Map16 rim', () => {
  const state = createGame(campaign), world = { campaign, state }, p = state.players.mario;
  state.phase = 'playing';
  state.progress.course = '105';
  Object.assign(p, {
    roomId: '1cb', x: 435.9, y: 356, vx: 0.2, vy: 0, grounded: true,
    cooldown: 0, form: 'super', width: 12, height: 28,
  });

  stepGame(campaign, state, { mario: Buttons.right | Buttons.run, luigi: 0 });
  stepGame(campaign, state, { mario: Buttons.right | Buttons.run, luigi: 0 });

  assert.equal(p.roomId, '105');
  assert.deepEqual([p.x, p.y, p.pipeExit?.direction], [2064, 292, 'right']);
  assert.ok(isBodyFree(world, campaign.levels['105'], p));
});

test('a flower from a real Map16 block is hidden then draws on OBJ1 and returns to OBJ2', () => {
  const state = createGame(campaign), world = { campaign, state };
  const p = state.players.mario;
  const room = Object.values(campaign.levels).find(r => r.tiles.includes(0x11f) && r.tileset !== 4)!;
  const i = room.tiles.indexOf(0x11f), col = i % room.width, row = Math.floor(i / room.width);
  Object.assign(p, { form: 'super', roomId: room.id, x: col * 16, y: (row + 1) * 16 });
  bump(world, p, room, { tile: 0x11f, col, row });
  const flower = state.entities.find(e => e.spriteId === 0x75)!;
  assert.equal(flower.blockReleaseTick, state.tick);
  state.bouncingBlocks = [];
  const flowers = () => cast(state, room.id).filter(i => i.image.includes('-117/'));
  state.tick = 10; // 8 PAL frames
  assert.equal(flowers().length, 0);
  state.tick = 11; // 9 PAL frames
  assert.deepEqual(flowers().map(i => i.priority), [1]);
  state.tick = 74;
  assert.deepEqual(flowers().map(i => i.priority), [1]);
  state.tick = 75; // 62 PAL frames
  assert.deepEqual(flowers().map(i => i.priority), [2]);
  const placed = spawnEntity(world, room.id, { x: flower.x + 20, y: flower.y, spriteId: 0x75 })!;
  assert.equal(placed.blockReleaseTick, undefined);
});
