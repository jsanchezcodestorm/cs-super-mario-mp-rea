import { enterFirstCourse } from './enter-first-course.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { stepGame, type CampaignDefinition, type LevelDefinition } from '../src/index.ts'
import { constrainToScroll } from '../src/autoscroll.ts'
import { isBodyFree, tileAt, moveBody } from '../src/terrain.ts'

function stage() {
  const room: LevelDefinition = {
    id: 'r', width: 32, height: 12, spawn: { x: 32, y: 96 },
    sprites: [{ x: 64, y: 96, spriteId: 0xb1 }], tiles: Array(32 * 12).fill(0x25), exits: [],
  }
  room.tiles.fill(0x130, 7 * room.width)
  const campaign: CampaignDefinition = {
    start: room.id, levels: { r: room }, routes: { r: {} }, blockSnakePaths: [[0x40, 0xff], []],
  }
  const state = enterFirstCourse(campaign)
  return { world: { campaign, state }, room }
}

test('a block snake supports one rider and pushes the other clear before a solid tile appears', () => {
  const { world, room } = stage()
  const { state } = world
  const head = state.entities.find(e => e.snake)!
  head.snake!.started = true
  Object.assign(state.players.mario, { x: 70, y: 80, grounded: true })
  Object.assign(state.players.luigi, { x: 80, y: 96, grounded: true })
  for (let tick = 0; tick < 34; tick++) {
    stepGame(world.campaign, state, { mario: 0, luigi: 0 })
    for (const p of Object.values(state.players)) {
      assert.ok(isBodyFree(world, room, p))
      assert.equal(p.status, 'alive')
    }
    assert.equal(state.players.mario.y + state.players.mario.height, 96)
  }
  assert.equal(tileAt(world, room, 6, 6), 0x132)
  assert.ok(state.players.luigi.x >= 112)
})

for (const layer of [1, 2]) {
  test('the front edge of autoscroll cannot push a player through a wall on layer ' + layer, () => {
    const { world, room } = stage()
    room.autoscroll = [[0, 0], [0, 0]]
    if (layer === 1) room.tiles[5 * room.width + 15] = 0x130
    else {
      room.layer2 = Array(room.tiles.length).fill(0x25)
      room.layer2[5 * room.width + 14] = 0x130
      world.state.layerOffsets.r = { age: 1, x: 16, y: 0, dx: 0, dy: 0, engaged: false }
    }
    for (const p of Object.values(world.state.players)) {
      Object.assign(p, { x: 256, y: 80 })
      constrainToScroll(world, room, p)
      assert.equal(p.x, 256)
      assert.ok(isBodyFree(world, room, p))
    }
  })
}

test('an autoscroll correction preserves head clearance at the mouth of a one-tile passage', () => {
  const { world, room } = stage()
  room.autoscroll = [[0, 0], [0, 0]]
  room.tiles[4 * room.width + 15] = room.tiles[6 * room.width + 15] = 0x130
  const mario = world.state.players.mario
  Object.assign(mario, { x: 256, y: 76 })
  constrainToScroll(world, room, mario)
  assert.equal(mario.y, 76)
  assert.ok(isBodyFree(world, room, mario))
})

test('a sideways layer 2 wall crushes at a static wall without entering its tile', () => {
  const { world, room } = stage()
  room.sprites = []
  room.layer2 = Array(room.tiles.length).fill(0x25)
  // The player stands between the right edge of the translating wall and the fixed wall at X=112.
  room.layer2[5 * room.width + 5] = 0x130
  room.tiles[5 * room.width + 7] = 0x130
  world.state.layerOffsets.r = { x: 5, y: 0, dx: 1, dy: 0, age: 1, engaged: true }
  for (const player of Object.values(world.state.players)) {
    Object.assign(player, { x: 100, y: 80, width: 12, height: 16, vx: 0, vy: 0, grounded: false })
    const contacts = moveBody(world, room, player)
    assert.ok(contacts.some(c => c.layer2 && c.crushed))
    assert.equal(player.x + player.width, 112)
  }
})
