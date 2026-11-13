import { enterFirstCourse } from './enter-first-course.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import type { CampaignDefinition, LevelDefinition } from '../src/index.ts'
import { moveBridge } from '../src/bridges.ts'

function scene() {
  const room: LevelDefinition = {
    id: 'swing', width: 20, height: 24, spawn: { x: 16, y: 32 },
    sprites: [{ spriteId: 0x5f, x: 64, y: 80 }],
    tiles: Array(20 * 24).fill(0x25), exits: [],
  }
  const campaign: CampaignDefinition = { start: room.id, levels: { swing: room }, routes: { swing: {} } }
  const state = enterFirstCourse(campaign)
  const world = { campaign, state }
  const platform = state.entities[0]
  for (const player of Object.values(state.players)) player.status = 'spectator'
  return { world, platform, state }
}

test('a brown chained platform starts moving without a rider and keeps a minimum idle speed', () => {
  const { world, platform, state } = scene()
  moveBridge(world, platform)
  assert.deepEqual(platform.swing, { angle: 0x140 + 1, speed: 16 })
  const initialPosition = [platform.x, platform.y]
  for (let frame = 1; frame < 100; frame++) {
    state.tick = frame
    moveBridge(world, platform)
  }
  assert.equal(platform.swing?.speed, 16)
  assert.ok(platform.swing!.angle > 0x140 + 1)
  assert.notDeepEqual([platform.x, platform.y], initialPosition)
  assert.deepEqual([platform.width, platform.height], [64, 16])
})

test('a rider pumps the platform every other PAL frame in the direction of its swing half', () => {
  const { world, platform, state } = scene()
  moveBridge(world, platform)
  const mario = state.players.mario
  Object.assign(mario, {
    status: 'alive', x: platform.x + 8, y: platform.y - mario.height,
    vy: 0, roomId: platform.roomId,
  })
  state.tick = 1 // Server tick 1 has not reached the next PAL frame.
  moveBridge(world, platform)
  assert.deepEqual(platform.swing, { angle: 0x140 + 1, speed: 16 })
  state.tick = 2
  moveBridge(world, platform)
  assert.deepEqual(platform.swing, { angle: 0x140 + 2, speed: 15 })
  state.tick = 3
  moveBridge(world, platform)
  assert.deepEqual(platform.swing, { angle: 0x140 + 2 + 15 / 16, speed: 15 })
})

test('an empty platform damps toward its continuous idle speed every four PAL frames', () => {
  const { world, platform, state } = scene()
  platform.swing = { angle: 0x180, speed: 17 }
  state.tick = 5 // PAL frame 4.
  moveBridge(world, platform)
  assert.deepEqual(platform.swing, { angle: 0x180 + 1, speed: 16 })
  state.tick = 10 // PAL frame 8.
  moveBridge(world, platform)
  assert.equal(platform.swing?.speed, 16)
  assert.ok(platform.swing!.angle > 0x180 + 1)
})
