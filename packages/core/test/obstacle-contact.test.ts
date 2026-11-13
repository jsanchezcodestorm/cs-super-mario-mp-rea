import test from 'node:test'
import assert from 'node:assert/strict'
import { Buttons, type CampaignDefinition } from '../src/index.ts'
import { enterFirstCourse } from './enter-first-course.ts'
import { moveBody, isBodyFree } from '../src/terrain.ts'
import { stepPlayer } from '../src/player.ts'
import { settleTurnBlocks } from '../src/turn-block.ts'
import { setCheckpoint } from '../src/blocks.ts'
import { contact } from '../src/entity-contact.ts'
import { spawnEntity } from '../src/state.ts'

function chamber() {
  const width = 12, height = 10
  const room = { id: 'chamber', width, height, tiles: Array<number>(width * height).fill(0x25),
    layer2: Array<number>(width * height).fill(0x25), spawn: { x: 32, y: 32 }, exits: [], sprites: [] }
  const campaign: CampaignDefinition = { start: room.id, levels: { chamber: room }, routes: { chamber: {} } }
  const state = enterFirstCourse(campaign)
  return { room, campaign, state }
}

test('a foot grazing a block corner cannot advance through its side on the next frame', () => {
  const w = chamber()
  w.room.tiles[3 * w.room.width + 3] = 0x132
  for (const [side, p] of Object.values(w.state.players).entries()) {
    const direction = side ? -1 : 1
    Object.assign(p, { x: side ? 63.5 : 36.5, y: 31.9, vx: 0, vy: 1 })
    moveBody(w, w.room, p)
    p.vx = direction
    const hits = moveBody(w, w.room, p)
    assert.ok(hits.some((h) => h.side === (side ? 'left' : 'right')))
    assert.equal(p.x, side ? 64 : 36)
    assert.ok(isBodyFree(w, w.room, p))
  }
})

test('a rising layer cannot push the player through a fixed ceiling; the other seat stays playable', () => {
  const w = chamber()
  w.room.tiles[3 * w.room.width + 2] = 0x14e
  w.room.layer2.fill(0x130, 5 * w.room.width, 6 * w.room.width)
  w.state.layerOffsets.chamber = { x: 0, y: -2, dx: 0, dy: -2, age: 2, engaged: true }
  for (const [index, p] of Object.values(w.state.players).entries()) {
    Object.assign(p, { x: 32 + index * 48, y: 64, grounded: true, layer2Ground: true })
    stepPlayer(w, p, 0)
  }
  assert.equal(w.state.players.mario.status, 'dead')
  assert.equal(w.state.sharedLives, 9)
  assert.equal(w.state.players.luigi.status, 'alive')
  assert.equal(w.state.players.luigi.y, 62)
})

test('stomping underneath an overhang and growing at a checkpoint keep the head outside the ceiling', () => {
  const w = chamber(), p = w.state.players.mario
  w.room.tiles[2 * w.room.width + 2] = 0x130
  Object.assign(p, { x: 32, y: 48, vy: 1 })
  const enemy = spawnEntity(w, 'chamber', { x: 32, y: 62, spriteId: 0xf })!
  contact(w, enemy, p, Buttons.jump, p.y + p.height)
  assert.ok(p.vy < 0)
  assert.equal(p.y, 48)
  setCheckpoint(w, p, 32, 48)
  assert.equal(p.form, 'super')
  assert.equal(p.height, 16)
  assert.equal(p.growthPending, true)
  p.x = 64
  stepPlayer(w, p, 0)
  assert.equal(p.height, 28)
  assert.ok(isBodyFree(w, w.room, p))
})

test('a turn block closes once both players have left its space', () => {
  const w = chamber()
  const { mario, luigi } = w.state.players
  const cell = 3 * w.room.width + 3
  w.state.turning.push({ roomId: w.room.id, col: 3, row: 3, until: w.state.tick })
  for (const p of [mario, luigi]) Object.assign(p, { x: 48, y: 48 })
  for (const leaving of [mario, luigi]) {
    settleTurnBlocks(w)
    assert.equal(w.state.tileChanges.chamber?.[cell] ?? w.room.tiles[cell], 0x25)
    leaving.x = 64
    w.state.tick++
  }
  settleTurnBlocks(w)
  assert.equal(w.state.tileChanges.chamber?.[cell], 0x11e)
  assert.equal(w.state.turning.length, 0)
})
