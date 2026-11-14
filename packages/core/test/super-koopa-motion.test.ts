import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame, type CampaignDefinition, type LevelDefinition } from '../src/index.ts'
import { tickAtPalFrame } from '../src/pal-time.ts'
import { entityFromSpawn } from '../src/species.ts'
import { moveSuperKoopa } from '../src/super-koopa-motion.ts'
import type { World } from '../src/types.ts'

function setup(spriteId: number, playerX: number) {
  const room: LevelDefinition = {
    id: 'r', width: 64, height: 27, spawn: { x: 32, y: 300 }, sprites: [], exits: [],
    tiles: Array(64 * 27).fill(0x25),
  }
  const campaign: CampaignDefinition = { start: 'r', levels: { r: room }, routes: {} }
  const state = createGame(campaign), world = { campaign, state } as World
  const player = state.players.mario
  player.x = playerX
  const entity = entityFromSpawn('r', { x: 272, y: 304, spriteId }, 'super-koopa')!
  const advance = (frame: number) => {
    state.tick = tickAtPalFrame(frame)
    moveSuperKoopa(world, room, entity, player)
  }
  return { advance, entity }
}

test('feather Super Koopa accelerates, rises, then glides on the native PAL timeline', () => {
  const { advance, entity } = setup(0x73, 32)
  for (let frame = 1; frame <= 48; frame++) advance(frame)
  assert.deepEqual(entity.superKoopa, { type: 'feather', phase: 'rising', phaseFrames: 0 })
  assert.equal(entity.facing, -1)
  assert.ok(Math.abs(entity.x - 218.75) < 0.001)
  assert.equal(entity.vy, -3)

  for (let frame = 49; frame <= 75; frame++) advance(frame)
  assert.ok(Math.abs(entity.x - 178.25) < 0.001)
  assert.ok(Math.abs(entity.y - 266.875) < 0.001)

  for (let frame = 76; frame <= 155; frame++) advance(frame)
  assert.deepEqual(entity.superKoopa, { type: 'feather', phase: 'gliding', phaseFrames: 0 })
  assert.ok(Math.abs(entity.x - 58.25) < 0.001)
  assert.ok(Math.abs(entity.y - 285.25) < 0.001)
  assert.equal(entity.vx, -1.5)
  assert.equal(entity.vy, 0)
})

test('red and yellow Super Koopas face Mario and use their native horizontal and vertical speeds', () => {
  const leftward = setup(0x72, 32)
  leftward.advance(1)
  assert.equal(leftward.entity.facing, -1)
  assert.equal(leftward.entity.x, 272)
  assert.equal(leftward.entity.y, 306.5)
  assert.equal(leftward.entity.vx, -1.5)
  leftward.advance(2)
  assert.equal(leftward.entity.x, 270.5)
  assert.equal(leftward.entity.y, 309)
  assert.equal(leftward.entity.vy, 39 / 16)
  for (let frame = 3; frame <= 55; frame++) leftward.advance(frame)
  assert.equal(leftward.entity.x, 191)
  assert.equal(leftward.entity.vy, 13 / 16)

  const rightward = setup(0x71, 500)
  rightward.advance(1)
  assert.equal(rightward.entity.facing, 1)
  assert.equal(rightward.entity.vx, 1.5)
  rightward.advance(2)
  assert.equal(rightward.entity.x, 273.5)
})
