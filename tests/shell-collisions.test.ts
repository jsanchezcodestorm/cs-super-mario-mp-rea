import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Buttons, createGame, makeSave, stepGame, validateSave,
  type CampaignDefinition, type GameState, type PlayerId, type Spawn,
} from '@smw/core';

const idle = { mario: 0, luigi: 0 };
const floorY = 144;
const points = [200, 400, 800, 1000, 2000, 4000, 8000];
const chainSprites = [0x0f, 4, 0xda, 0x0f, 4, 0x0f, 0xab, 0x0f, 4];

// Relevant E1 Sprite1686Vals entries, including the native no-interaction bit.
const traits = Array<number>(201).fill(0);
traits[4] = 2;
traits[0x21] = 8;
traits[0x80] = 0x3a;

function course(sprites: Spawn[], spawnX = 48): CampaignDefinition {
  const width = 48, height = 14;
  const tiles = Array<number>(width * height).fill(0x25);
  tiles.fill(0x130, width * 10);
  return {
    start: 'test', routes: { test: {} }, yoshiTraits: traits,
    levels: { test: { id: 'test', width, height, tiles, spawn: { x: spawnX, y: floorY }, sprites, exits: [] } },
  };
}

function chainCourse(direction: number) {
  const x = (distance: number) => direction > 0 ? distance : 560 - distance;
  return course([
    { spriteId: 0xda, x: x(94), y: floorY },
    { spriteId: 0x80, x: x(127), y: floorY },
    { spriteId: 0x21, x: x(136), y: floorY },
    ...chainSprites.map((spriteId, i) => ({ spriteId, x: x(172 + 27 * i), y: spriteId === 0xab ? floorY - 12 : floorY })),
  ], x(48));
}

function start(campaign: CampaignDefinition) {
  const state = createGame(campaign);
  stepGame(campaign, state, { mario: Buttons.action, luigi: 0 });
  assert.equal(state.phase, 'playing');
  return state;
}

function readResources(state: GameState, id: PlayerId) {
  const { score, lives } = state.players[id];
  return [score, lives];
}

for (const [seat, direction] of [['mario', 1], ['luigi', -1]] as const) {
  test(seat + ' kicks through nine targets, earning the PAL chain in order', () => {
    const campaign = chainCourse(direction), state = start(campaign);
    const shell = state.entities[0], key = state.entities[1], coin = state.entities[2];
    const firstTarget = state.entities[3], other = seat === 'mario' ? 'luigi' : 'mario';
    const deltas: number[][] = [];
    let previous = readResources(state, seat);
    let kickAward = 0;
    let observedKnockback = false;
    for (let i = 0; i < 205 && deltas.length < 9; i++) {
      const launched = shell.owner === seat;
      const button = launched ? 0 : direction > 0 ? Buttons.right : Buttons.left;
      stepGame(campaign, state, { ...idle, [seat]: button });
      const current = readResources(state, seat);
      if (current[0] !== previous[0] || current[1] !== previous[1]) {
        if (!launched && shell.owner === seat) kickAward = current[0] - previous[0];
        else deltas.push([current[0] - previous[0], current[1] - previous[1]]);
        previous = current;
      }
      if (!firstTarget.active && firstTarget.vy < 0 && Math.sign(firstTarget.vx) === direction)
        observedKnockback = true;
    }
    assert.equal(shell.owner, seat);
    assert.equal(kickAward, 200);
    assert.deepEqual(deltas, [...points.map(p => [p, 0]), [0, 1], [0, 1]]);
    assert.ok(observedKnockback, 'first target flies up in the direction of impact');
    assert.ok(key.active && coin.active, 'the shell passes through the key and coin');
    assert.deepEqual(readResources(state, other), [0, 5]);
    const save = makeSave(state);
    assert.ok(validateSave(campaign, save));
    assert.deepEqual(readResources(createGame(campaign, save), seat), previous);
  });
}

test('a stomp stops Mario’s chain and a new kick starts Luigi at 200', () => {
  const campaign = course([
    { spriteId: 0xda, x: 94, y: floorY },
    { spriteId: 0x0f, x: 172, y: floorY },
    { spriteId: 0x0f, x: 405, y: floorY },
  ]);
  const state = start(campaign), shell = state.entities[0], luigi = state.players.luigi;
  luigi.x = 244;
  let kicked = false, jumped = false, stopped = false;
  for (let i = 0; i < 180 && luigi.score < 400; i++) {
    let button = 0;
    if (kicked && !jumped && luigi.x - shell.x <= 64) {
      button = Buttons.jump;
      jumped = true;
    }
    stepGame(campaign, state, { mario: kicked ? 0 : Buttons.right, luigi: button });
    if (shell.owner === 'mario') kicked = true;
    if (jumped && shell.vx === 0 && shell.owner === null) stopped = true;
  }
  assert.ok(stopped);
  assert.equal(shell.owner, 'luigi');
  assert.deepEqual(readResources(state, 'mario'), [400, 5]);
  assert.deepEqual(readResources(state, 'luigi'), [400, 5]);
});

test('a shell keeps its combo after bouncing off a solid wall', () => {
  const campaign = course([
    { spriteId: 0xda, x: 94, y: floorY },
    { spriteId: 0x0f, x: 160, y: floorY },
    // Drops into the return path after the shell has already passed underneath.
    { spriteId: 0x0f, x: 195, y: -116 },
  ]);
  const level = campaign.levels.test;
  level.tiles[9 * level.width + 14] = 0x130;
  const state = start(campaign), shell = state.entities[0];
  const awards: { amount: number; direction: number }[] = [];
  let score = 0;
  for (let i = 0; i < 140 && awards.length < 2; i++) {
    const launched = Boolean(shell.owner);
    stepGame(campaign, state, { mario: launched ? 0 : Buttons.right, luigi: 0 });
    if (state.players.mario.score !== score) {
      if (launched) awards.push({ amount: state.players.mario.score - score, direction: Math.sign(shell.vx) });
      score = state.players.mario.score;
    }
  }
  assert.deepEqual(awards, [{ amount: 200, direction: 1 }, { amount: 400, direction: -1 }]);
});

test('two kicked shells colliding knock one another out and pay one fixed 1000', () => {
  const campaign = course([
    { spriteId: 0xda, x: 94, y: floorY },
    { spriteId: 0xdb, x: 242, y: floorY },
  ]);
  const state = start(campaign), [a, b] = state.entities;
  state.players.luigi.x = 290;
  for (let i = 0; i < 145 && (a.active || b.active); i++) {
    stepGame(campaign, state, { mario: a.owner ? 0 : Buttons.right, luigi: b.owner ? 0 : Buttons.left });
  }
  assert.ok(!a.active && !b.active && a.vy < 0 && b.vy < 0);
  assert.equal(state.players.mario.score + state.players.luigi.score, 200 + 200 + 1000);
  assert.equal(state.players.mario.lives + state.players.luigi.lives, 10);
});

test('a carried shell collides with an approaching Koopa and clears the player’s hands', () => {
  const campaign = course([
    { spriteId: 0xda, x: 94, y: floorY },
    { spriteId: 4, x: 200, y: floorY },
  ]);
  const state = start(campaign), [shield, target] = state.entities;
  let carried = false;
  for (let i = 0; i < 120 && target.active; i++) {
    stepGame(campaign, state, { mario: Buttons.right | Buttons.run, luigi: 0 });
    if (state.players.mario.carrying === shield.id) carried = true;
  }
  assert.ok(carried && !shield.active && !target.active);
  assert.equal(state.players.mario.carrying, null);
  assert.deepEqual(readResources(state, 'mario'), [1000, 5]);
});

test('a blue shell-less Koopa catches a frontal shell, then kicks it back', () => {
  const campaign = course([
    { spriteId: 0xda, x: 94, y: floorY },
    { spriteId: 0x0f, x: 155, y: floorY },
    { spriteId: 2, x: 225, y: floorY },
  ]);
  const state = start(campaign), [shell, , koopa] = state.entities;
  let launched = false, braked = false, returned = false;
  for (let i = 0; i < 230 && !returned; i++) {
    stepGame(campaign, state, { mario: launched ? 0 : Buttons.right, luigi: 0 });
    if (shell.owner === 'mario') launched = true;
    if (launched && shell.vx === 0 && koopa.active) braked = true;
    returned = braked && shell.vx < 0;
  }
  assert.ok(returned && koopa.active);
  assert.equal(shell.owner, 'mario');
  assert.equal(shell.shellChain, 1);
  assert.deepEqual(readResources(state, 'mario'), [400, 5]);
});

test('a kicked shell activates a visible coin block from the side and keeps its streak on the rebound', () => {
  const campaign = course([{ spriteId: 0xda, x: 90, y: floorY }])
  const room = campaign.levels.test
  room.tiles[9 * room.width + 10] = 0x124
  const state = start(campaign), shell = state.entities[0]
  for (let i = 0; i < 110 && !state.players.luigi.coins; i++)
    stepGame(campaign, state, { mario: 0, luigi: shell.owner ? 0 : Buttons.right })
  assert.equal(state.players.luigi.coins, 1)
  assert.equal(state.players.mario.coins, 0)
  assert.ok(shell.vx < 0)
  assert.equal(shell.shellChain ?? 0, 0)
})
