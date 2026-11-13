import assert from 'node:assert/strict'
import test from 'node:test'
import { Buttons, createGame, stepGame, type CampaignDefinition } from '@smw/core'
import { enterRoom } from '../packages/core/src/state.ts'

function vineStage() {
  // Match the Map16 column used by the PAL controller probe.
  const width = 16, height = 27, tiles = Array(width * height).fill(0x25)
  for (let row = 14; row <= 20; row++) tiles[row * width + 8] = 6
  const room = { id: 'vine', width, height, tiles, sprites: [], exits: [], spawn: { x: 130, y: 276 } }
  const campaign: CampaignDefinition = { start: room.id, levels: { vine: room }, routes: {} }
  const state = createGame(campaign)
  state.phase = 'playing'
  state.entrance = null
  for (const p of Object.values(state.players)) enterRoom({ campaign, state }, p, room.id)
  function drive(ticks: number, buttons = 0) {
    for (let i = 0; i < ticks; i++) stepGame(campaign, state, { mario: buttons, luigi: buttons })
  }
  return { room, player: state.players.mario, drive }
}

test('grabbing a vine requires the centre of the player to reach its Map16 column', () => {
  for (const [x, expected] of [[121, false], [122, true], [137, true], [138, false]] as const) {
    const { player, drive } = vineStage()
    player.x = x
    drive(1, Buttons.up)
    assert.equal(!!player.animation?.climbing, expected)
  }
})

test('a vine holds an idle climber and accepts a regular jump to release', () => {
  const { player, drive } = vineStage()
  drive(3, Buttons.up)
  drive(2)
  assert.ok(player.animation?.climbing)
  const y = player.y
  drive(40)
  assert.equal(player.y, y)
  drive(1, Buttons.spin)
  assert.ok(player.animation?.climbing)
  assert.equal(player.y, y)
  drive(1)
  drive(1, Buttons.jump)
  assert.ok(!player.animation?.climbing && player.vy < 0)
})

test('jumping from a vine below a solid ceiling stops the head even when the climbing pose touches it', () => {
  const ceiling = 16 * 16
  for (const form of ['small', 'super'] as const) for (const touching of [false, true]) {
    const { room, player, drive } = vineStage()
    room.tiles[15 * room.width + 8] = 0x14e
    player.form = form
    player.height = form === 'small' ? 16 : 28
    player.y = ceiling + 12
    drive(3, Buttons.up)
    assert.ok(player.vineClinging)
    for (let i = 0; i < 40 && player.y > ceiling + 3; i++) drive(1, Buttons.up)
    if (touching) {
      drive(20, Buttons.up)
      assert.ok(player.y < ceiling && player.y >= ceiling - (form === 'small' ? 1 : 6))
    } else {
      assert.ok(player.y >= ceiling && player.y <= ceiling + 3)
    }
    drive(1, Buttons.jump)
    assert.ok(!player.vineClinging)
    // An already touching head expands immediately; otherwise the next PAL displacement reaches it.
    for (let i = 0; i < 2 && player.vy < 0; i++) drive(1)
    assert.equal(player.y, ceiling)
    assert.equal(player.vy, 0)
    for (let i = 0; i < 10; i++) {
      drive(1)
      assert.ok(player.y >= ceiling)
    }
    assert.ok(player.y > ceiling)
  }
})

test('on a single vine, sideways input releases at either edge and diagonals climb first', () => {
  for (const [direction, exitX] of [[Buttons.left, 115], [Buttons.right, 144]]) {
    const { player, drive } = vineStage()
    drive(3, Buttons.up)
    drive(3)
    const y = player.y
    for (let i = 0; i < 30 && player.animation?.climbing; i++) drive(1, direction)
    assert.ok(!player.animation?.climbing)
    assert.ok(Math.abs(player.x - exitX) < 2)
    assert.ok(Math.abs(player.y - y) < 1)
  }
  const { player, drive } = vineStage()
  drive(3, Buttons.up)
  const x = player.x, y = player.y
  drive(24, Buttons.up | Buttons.right)
  assert.ok(player.animation?.climbing && player.y < y - 15)
  assert.equal(player.x, x)
  drive(90, Buttons.up)
  const top = player.y
  drive(20, Buttons.up)
  assert.ok(player.animation?.climbing)
  assert.equal(player.y, top)
  drive(30, Buttons.up | Buttons.right)
  assert.ok(!player.animation?.climbing && player.x > x)
})
