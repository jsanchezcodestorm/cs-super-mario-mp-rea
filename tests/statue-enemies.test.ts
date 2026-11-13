import assert from 'node:assert/strict'
import test from 'node:test'
import { Buttons, createGame, palFrame, stepGame } from '@smw/core'
import { contact } from '../packages/core/src/entity-contact.ts'
import { moveEntity } from '../packages/core/src/entity-motion.ts'

function scene(spriteId: number, variant: number) {
  const width = 32, height = 26, x = 128 + 16 * variant
  const tiles = Array<number>(width * height).fill(0x25)
  tiles.fill(0x130, width * 20)
  const room = { id: 'test', width, height, tiles, exits: [], spawn: { x: 16, y: 304 }, sprites: [{ spriteId, x, y: 304 }] }
  const campaign = { start: 'test', levels: { test: room }, routes: { test: {} } }
  const state = createGame(campaign)
  stepGame(campaign, state, { mario: Buttons.action, luigi: 0 })
  const e = state.entities[0], p = state.players.luigi, world = { campaign, state }
  function frame() {
    const before = palFrame(state.tick)
    do {
      state.tick++
      moveEntity(world, e, p)
    } while (palFrame(state.tick) === before && e.active)
  }
  return { e, p, state, world, x, frame }
}

test('four enemy blocks shake at the native cadence and release the column-specific enemy toward Luigi', () => {
  for (const [variant, sprite] of [0x15, 0x0f, 0, 4].entries()) {
    const { e, p, world, state, x, frame } = scene(0x4c, variant)
    p.x = x - 120
    for (let i = 0; i < 63; i++) frame()
    assert.equal(e.x, x)
    for (let i = 0; i < 4; i++) frame()
    assert.equal(e.x, x + 1)
    for (let i = 0; i < 4; i++) frame()
    assert.equal(e.x, x)
    p.x = x - 80
    frame()
    assert.equal(e.active, false)
    const child = state.entities.at(-1)!
    assert.equal(child.spriteId, sprite)
    assert.equal(child.facing, -1)
    assert.equal(child.vy, -3)
    assert.equal(state.shatteredBlocks?.length, 1)
    assert.ok(state.events.some(event => event.type === 'shatter'))
    do {
      state.tick++
      moveEntity(world, child, p)
    } while (palFrame(state.tick) === palFrame(state.tick - 1))
    assert.equal(child.x, x)
    assert.equal(child.y, 301)
  }
})

test('stationary statues support both riders; the two firing variants emit every 128 PAL frames', () => {
  for (const variant of [0, 1, 3]) {
    const { world, e, state, frame } = scene(0xbc, variant)
    const shots: number[] = []
    for (let i = 0; i < 256; i++) {
      const count = state.entities.length
      frame()
      if (state.entities.length > count) {
        const shot = state.entities.at(-1)!
        assert.equal(shot.spriteId, 0xb3)
        assert.equal(shot.x, e.x - 16)
        assert.equal(shot.y, e.y - 2)
        shots.push(i)
      }
    }
    assert.equal(shots.length, variant ? 2 : 0)
    if (variant) assert.equal(shots[1] - shots[0], 128)
    for (const p of Object.values(state.players)) {
      Object.assign(p, { x: e.x, y: e.y-p.height+1, vy: 1, grounded: false })
      contact(world, e, p, 0, e.y-1)
      assert.equal(p.y + p.height, e.y)
      assert.ok(p.grounded)
    }
  }
})

test('the gold Bowser statue waits, jumps toward the player and changes pose as it descends', () => {
  const { e, p, x, frame } = scene(0xbc, 2)
  p.x = x + 64
  frame()
  assert.equal(e.resident!.timer, 48)
  for (let i = 0; i < 47; i++) frame()
  assert.equal(e.vy, -4)
  assert.equal(e.facing, 1)
  frame()
  assert.equal(e.x, x+1)
  assert.equal(e.y, 300)
  assert.equal(e.resident!.pose, 1)
  for (let i = 0; i < 30; i++) frame()
  assert.equal(e.resident!.pose, 0)
})
