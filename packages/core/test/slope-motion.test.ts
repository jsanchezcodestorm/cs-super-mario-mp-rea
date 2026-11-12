import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { Buttons, type CampaignDefinition, type PlayerId } from '../src/index.ts'
import { enterRoom, spawnEntity } from '../src/state.ts'
import { stepPlayer } from '../src/player.ts'
import { contact } from '../src/entity-contact.ts'
import { enterFirstCourse } from './enter-first-course.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync(
  new URL('../../../generated/content.json', import.meta.url), 'utf8',
))

function onSlope(room: string, x: number, y: number, seat: PlayerId) {
  const state = enterFirstCourse(campaign), world = { campaign, state }, rider = state.players[seat]
  enterRoom(world, rider, room, { x, y })
  function advance(frames: number, input: number) {
    for (let i = 0; i < frames; i++) {
      state.tick++
      stepPlayer(world, rider, input)
      rider.lastInput = input
    }
  }
  advance(35, 0)
  assert.ok(rider.grounded)
  return { world, rider, advance }
}

test('either rider slides down the real Mondo hill at the PAL distances even after releasing Down', () => {
  // Snes9x capture at 10, 20, 40, 60 and 80 PAL frames from x=180.
  // The web uses the collision box’s left edge, two pixels inside the sprite.
  for (const seat of ['mario', 'luigi'] as const) {
    const { rider, advance } = onSlope('1e0', 182, 90, seat)
    const x = rider.x
    for (const [frames, button, distance] of [
      [12, Buttons.down, 1], [12, 0, 6], [24, 0, 29], [24, 0, 67], [24, 0, 121],
    ]) {
      advance(frames, button)
      assert.ok(Math.abs(rider.x - x - distance) < 1, seat + ' expected ' + distance + ' px')
      assert.ok(rider.sliding)
      assert.ok(rider.grounded)
    }
    advance(1, Buttons.jump)
    assert.equal(rider.sliding, undefined)
    assert.ok(rider.vy < 0)
  }
})

test('walking uphill and downhill uses the separate measured PAL accelerations', () => {
  // At 100 ms in Vanilla Secret 1 the cartridge's 4.12 speeds are
  // +0.48828125 and -0.5859375 pixels per 50 Hz frame, respectively.
  for (const [button, speed] of [[Buttons.right, 0.48828125], [Buttons.left, -0.5859375]]) {
    const { rider, advance } = onSlope('001', 791, 320, 'mario')
    advance(6, button)
    assert.ok(Math.abs(rider.vx * 60 / 50 - speed) < 1 / 4096)
  }
})

test('sliding on the opposing Vanilla Secret 1 slope coasts to rest on the flat', () => {
  const { rider, advance } = onSlope('001', 791, 320, 'luigi')
  const x = rider.x
  advance(12, Buttons.down)
  assert.ok(Math.abs(rider.x - x + 4) <= 1)
  advance(36, 0)
  assert.ok(Math.abs(rider.vx) < 1 / 16)
  advance(2, 0)
  assert.equal(rider.vx, 0)
  assert.equal(rider.sliding, undefined)
  // On this short slope the web and the cartridge enter the flat one collision
  // probe apart. Both roll out below the hill and stop before its next tile.
  assert.ok(Math.abs(rider.x - x + 27) <= 5)
})

test('carrying a key prevents a slide; letting go and sliding can defeat a Goomba', () => {
  const { rider, advance, world } = onSlope('1e0', 182, 90, 'mario')
  const key = spawnEntity(world, rider.roomId, { x: rider.x, y: rider.y, spriteId: 0x80 })!
  contact(world, key, rider, Buttons.run, rider.y + rider.height)
  assert.equal(rider.carrying, key.id)
  advance(6, Buttons.down)
  assert.equal(rider.sliding, undefined)
  rider.carrying = null
  advance(12, Buttons.down)
  const enemy = spawnEntity(world, rider.roomId, { x: rider.x, y: rider.y, spriteId: 0x0f })!
  contact(world, enemy, rider, 0, rider.y + rider.height)
  assert.equal(enemy.active, false)
  assert.equal(rider.status, 'alive')
})
