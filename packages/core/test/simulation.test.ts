import test from 'node:test'
import assert from 'node:assert/strict'
import {
  Buttons,
  createGame,
  stepGame,
  copyState,
  makeSave,
  validateSave,
  effectiveTile,
} from '../src/index.ts'
import type { CampaignDefinition, LevelDefinition, Spawn } from '../src/index.ts'
import { chocolateRoom } from '../src/chocolate-island.ts'
import { blockReward } from '../src/block-rewards.ts'

function room(id: string, sprites: Spawn[] = []): LevelDefinition {
  const width = 48,
    height = 12,
    tiles = Array<number>(width * height).fill(0x25)
  tiles.fill(0x130, width * 10)
  return { id, width, height, tiles, spawn: { x: 16, y: 144 }, sprites, exits: [] }
}
function fixture(sprites: Spawn[] = []) {
  const first = room('first', sprites),
    second = room('second'),
    cellar = room('cellar')
  const campaign: CampaignDefinition = {
    start: 'first',
    levels: { first, second, cellar },
    routes: { first: { normal: ['second'], secret: ['cellar'] }, second: {}, cellar: {} },
  }
  return { campaign, first, second, cellar }
}
function tick(
  campaign: CampaignDefinition,
  state: ReturnType<typeof createGame>,
  count = 1,
  mario = 0,
  luigi = 0,
) {
  for (let i = 0; i < count; i++) stepGame(campaign, state, { mario, luigi })
}

test('progress and events replay identically from an authoritative snapshot', () => {
  const { campaign } = fixture()
  const state = createGame(campaign)
  const predicted = copyState(state)
  for (const world of [state, predicted]) {
    tick(campaign, world, 40, Buttons.right | Buttons.run)
    tick(campaign, world, 12, Buttons.right | Buttons.jump, Buttons.left)
    tick(campaign, world, 1, Buttons.right, Buttons.jump)
  }
  assert.deepEqual(predicted, state)
  assert.ok(state.players.mario.x > 80)
  assert.ok(state.players.luigi.x < 16)
  assert.ok(state.players.mario.y < state.players.luigi.y)
})

test('a contested collectible and two overlapping players generate one authoritative reward', () => {
  const { campaign, first } = fixture([{ x: 16, y: 144, spriteId: 0x75 }])
  first.tiles[9 * first.width + 1] = 0x2b
  const state = createGame(campaign)
  tick(campaign, state)
  assert.equal(state.players.mario.coins + state.players.luigi.coins, 1)
  assert.equal(state.players.mario.form, 'fire')
  assert.equal(state.players.luigi.form, 'small')
  assert.equal(state.events.filter((e) => e.type === 'item').length, 1)
  assert.equal(state.entities.length, 0)
})

test('separate players can occupy distinct sublevels with their own resources', () => {
  const { campaign, first } = fixture()
  first.tiles[10 * first.width + 1] = 0x137
  first.exits.push({ screen: 0, target: 'cellar', spawn: { x: 96, y: 128 } })
  const state = createGame(campaign)
  tick(campaign, state, 24)
  tick(campaign, state, 1, Buttons.down)
  assert.equal(state.players.mario.roomId, 'cellar')
  assert.equal(state.players.mario.x, 96)
  assert.equal(state.players.luigi.roomId, 'first')
  assert.deepEqual(state.loadedRooms, ['first', 'cellar'])
})

test('horizontal pipe requires the enterable mouth and a direction toward it', () => {
  const { campaign, first } = fixture()
  first.tiles[9 * first.width + 3] = 0x13f
  first.exits.push({ screen: 0, target: 'cellar' })
  const state = createGame(campaign)
  tick(campaign, state, 60, Buttons.right)
  assert.equal(state.players.mario.roomId, 'cellar')
  assert.equal(state.players.luigi.roomId, 'first')
})

test('a checkpoint activated by Luigi restores Mario when he loses a life', () => {
  const { campaign, first } = fixture()
  first.tiles[9 * first.width + 7] = 0x38
  const state = createGame(campaign)
  state.players.luigi.x = 112
  tick(campaign, state)
  assert.equal(state.progress.checkpoint?.x, 112)
  assert.equal(state.players.luigi.form, 'super')
  state.players.mario.y = first.height * 16 + 20
  tick(campaign, state, 77)
  assert.equal(state.players.mario.lives, 4)
  assert.equal(state.players.mario.x, 112)
  assert.equal(state.players.mario.status, 'alive')
  assert.equal(state.players.luigi.lives, 5)
})

test('an exhausted player spectates through reload and rejoins at the next course', () => {
  const { campaign, first } = fixture([{ spriteId: 0x7b, x: 280, y: 144 }])
  const state = createGame(campaign)
  state.players.mario.lives = 1
  state.players.mario.y = first.height * 16 + 20
  tick(campaign, state)
  assert.equal(state.players.mario.status, 'spectator')
  const save = makeSave(state)
  assert.ok(validateSave(campaign, save))
  const restored = createGame(campaign, save)
  assert.equal(restored.players.mario.status, 'spectator')
  restored.players.luigi.x = 280
  tick(campaign, restored)
  assert.equal(restored.phase, 'map')
  assert.deepEqual(restored.progress.completed, ['first:normal'])
  tick(campaign, restored, 1, 0, Buttons.jump)
  assert.equal(restored.progress.course, 'second')
  assert.equal(restored.players.mario.status, 'alive')
  assert.equal(restored.players.mario.lives, 1)
  assert.equal(restored.players.luigi.lives, 5)
})

test('both players running out of lives ends the game exactly once', () => {
  const { campaign } = fixture()
  const state = createGame(campaign)
  for (const player of Object.values(state.players)) {
    player.y = 512
    player.lives = 1
  }
  tick(campaign, state)
  assert.equal(state.phase, 'gameOver')
  assert.equal(state.events.filter((e) => e.type === 'gameOver').length, 1)
  tick(campaign, state)
  assert.deepEqual(state.events, [])
})

test('carrying the key into a keyhole completes its own exit and unlocks its route', () => {
  const { campaign } = fixture([
    { x: 16, y: 144, spriteId: 0x80 },
    { x: 96, y: 144, spriteId: 0x0e },
  ])
  const state = createGame(campaign)
  tick(campaign, state, 60, Buttons.run | Buttons.right)
  assert.equal(state.phase, 'map')
  assert.deepEqual(state.progress.completed, ['first:secret'])
  assert.deepEqual(state.progress.unlocked, ['first', 'cellar'])
  assert.ok(validateSave(campaign, makeSave(state)))
})

test('save validation enforces reachable ordered unlocks, bounded resources and valid checkpoints', () => {
  const { campaign } = fixture()
  const state = createGame(campaign)
  const save = makeSave(state)
  assert.equal(validateSave(campaign, save), true)
  assert.equal(validateSave(campaign, { ...save, version: 99 }), false)
  const hacked = structuredClone(save)
  hacked.progress.unlocked.push('second')
  assert.equal(validateSave(campaign, hacked), false)
  const dead = structuredClone(save)
  dead.resources.mario.lives = -1
  assert.equal(validateSave(campaign, dead), false)
  const badPoint = structuredClone(save)
  badPoint.progress.checkpoint = { roomId: 'first', x: NaN, y: 0 }
  assert.equal(validateSave(campaign, badPoint), false)
})

test('palace progression, blue and silver P switches remap original Map16 tiles', () => {
  const { campaign, first } = fixture()
  first.tiles.splice(0, 4, 0x6b, 0x2b, 0x132, 0x12f)
  const state = createGame(campaign)
  state.progress.completed.push('014:normal')
  assert.equal(effectiveTile(state, first, 0), 0x16b)
  state.pSwitch = 10
  assert.equal(effectiveTile(state, first, 1), 0x132)
  assert.equal(effectiveTile(state, first, 2), 0x2b)
  assert.equal(effectiveTile(state, first, 3), 0x12f)
  state.silverSwitch = 10
  assert.equal(effectiveTile(state, first, 3), 0x2b)
})

test('item blocks preserve positional rewards and Mario power-dependent upgrades', () => {
  const { campaign } = fixture()
  const player = createGame(campaign).players.mario
  assert.equal(blockReward(0x11f, 0, player, 0), 0x74)
  player.form = 'super'
  assert.equal(blockReward(0x11f, 0, player, 0), 0x75)
  assert.equal(blockReward(0x11a, 2, player, 0), 0x79)
  assert.equal(blockReward(0x125, 0, player, 0), 0x80)
  assert.equal(blockReward(0x125, 2, player, 0), 0x7d)
})

test('Chocolate Island chooses ROM branches by time digits, coins and dragon coins', () => {
  assert.equal(chocolateRoom('0cd', 0, 4, 0), '0cd')
  assert.equal(chocolateRoom('0cd', 0, 3, 0), 'ci2-1')
  assert.equal(chocolateRoom('0cf', 8, 4, 0), 'ci2-5')
  assert.equal(chocolateRoom('0cf', 10, 4, 0), 'ci2-4')
  assert.equal(chocolateRoom('0ce', 0, 0, 234), '0ce')
  assert.equal(chocolateRoom('0ce', 0, 0, 235), 'ci2-7')
  assert.equal(chocolateRoom('0ce', 0, 0, 250), 'ci2-8')
})

test('a Splittin’ Chuck produces two charging clones while a pitching Chuck throws baseballs', () => {
  const { campaign } = fixture([
    { x: 80, y: 132, spriteId: 0x92 },
    { x: 260, y: 132, spriteId: 0x98 },
  ])
  const state = createGame(campaign)
  state.players.luigi.x=430
  tick(campaign, state, 72)
  assert.equal(state.entities.filter((e) => e.spriteId === 0x91).length, 2)
  assert.ok(state.entities.some((e) => e.projectile === 'baseball'))
  assert.equal(state.entities.find((e) => e.spriteId === 0x98)?.hp, 3)
})

test('layer two supports independent riders and keeps their feet on the moving floor', () => {
  const { campaign, first } = fixture([{ x: 32, y: 0, spriteId: 0xea, extra: 1 }])
  first.tiles.fill(0x25)
  first.layer2 = Array<number>(first.tiles.length).fill(0x25)
  first.layer2.fill(0x130, 10 * first.width)
  first.spawn.y = 140
  const state = createGame(campaign)
  tick(campaign, state, 140)
  const offset = state.layerOffsets.first
  assert.ok(offset.y > 4)
  for (const p of Object.values(state.players)) {
    assert.ok(p.layer2Ground)
    assert.ok(Math.abs(p.y + p.height - (160 + offset.y)) < 0.02)
  }
})

test('the decoded castle entrance can be skipped by either player', () => {
  const { campaign, first } = fixture()
  first.intro = 'hall'
  campaign.levels.hall = room('hall')
  campaign.entranceInputs = {
    onFoot: [
      [1, 76],
      [0, 48],
    ],
    mounted: [
      [1, 44],
      [0, 48],
    ],
  }
  const state = createGame(campaign)
  assert.equal(state.players.luigi.roomId, 'hall')
  tick(campaign, state, 3)
  tick(campaign, state, 1, 0, Buttons.jump)
  assert.equal(state.entrance, null)
  for (const p of Object.values(state.players)) assert.equal(p.roomId, 'first')
})
