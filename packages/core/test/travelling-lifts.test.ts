import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame, palFrame, type CampaignDefinition, type LevelDefinition } from '../src/index.ts'
import { isDanger } from '../src/terrain.ts'
import { entityFromSpawn } from '../src/species.ts'
import { liftSurfaceY, moveFreeLift } from '../src/travelling-lifts.ts'
import { moveEmission } from '../src/emitters.ts'

function setup(spriteId: number, x = 128) {
  const r: LevelDefinition = { id: 'r', width: 24, height: 27, spawn: { x: 32, y: 300 },
    sprites: [], exits: [], tiles: Array(24 * 27).fill(0x25) }
  const campaign: CampaignDefinition = { start: 'r', levels: { r }, routes: {} }
  const state = createGame(campaign), e = entityFromSpawn('r', { x, y: 272, spriteId }, 'lift')!
  return { e, r, world: { campaign, state }, mario: state.players.mario, advance(to: number) {
    while (palFrame(e.age) < to) {
      e.age++
      state.tick++
      moveFreeLift({ campaign, state }, e, state.players.mario)
    }
  }, state }
}

test('E1 checkerboards, diagonal lifts and castle blocks reach their native frame 64 and 128 positions', () => {
  for (const [id, x64, y64, x128, y128] of [
    [0x55,97,272,57,272], [0x57,128,241,128,189], [0xb7,96,304,64,336],
    [0xb8,96,240,64,208], [0xbb,64,272,48,272],
  ]) {
    const { e, advance } = setup(id)
    advance(64)
    assert.deepEqual([Math.floor(e.x), Math.floor(e.y)], [x64,y64])
    advance(128)
    assert.deepEqual([Math.floor(e.x), Math.floor(e.y)], [x128,y128])
  }
})

test('the two diagonal tops support the player at different heights along their slopes', () => {
  for (const [id, y1, y2] of [[0xb7,294,278], [0xb8,279,295]]) {
    const { e, mario } = setup(id)
    mario.x = 130
    assert.equal(liftSurfaceY(e, mario), y1)
    mario.x += 16
    assert.equal(liftSurfaceY(e, mario), y2)
  }
})

test('either player latches a stationary lift; timed and sinking lifts continue after jumping off', () => {
  for (const [id, x24, y24, y64] of [[0xc4,128,275,364], [0xc0,128,281,296],
    [0xba,147,272,272], [0x5e,137,272,272]]) {
    for (const player of ['mario','luigi'] as const) {
      const { e, advance } = setup(id)
      advance(5)
      assert.equal(e.x, 128)
      e.owner = player
      advance(24)
      assert.deepEqual([Math.floor(e.x), Math.floor(e.y)], [x24,y24])
      advance(64)
      assert.equal(Math.floor(e.y), y64)
      if (id === 0xc0) { advance(68); assert.equal(e.active, false) }
    }
  }
})

test('long and short timed lifts travel horizontally during the countdown then fall', () => {
  for (const [x, duration] of [[128,255], [144,63]]) {
    const { e, advance } = setup(0xba,x)
    assert.equal(e.liftTimer, duration)
    e.owner = 'luigi'
    advance(duration - 1)
    assert.deepEqual([e.x, e.y, e.liftTimer], [x+duration-1,272,1])
    advance(duration + 20)
    assert.ok(e.y > 300)
  }
})

test('a growing pipe extends its solid sides when approached, clears them when retracting and is safe to touch', () => {
  const { e, advance, mario, state } = setup(0x49)
  mario.x = 20
  advance(160)
  assert.equal(e.y,272)
  mario.x = 128
  advance(160+96)
  assert.equal(e.y,209)
  for (const [x,tile] of [[8,0x168],[9,0x169]]) {
    assert.equal(state.tileChanges.r[14 * 24 + x], tile)
    assert.equal(isDanger(tile,0),false)
    assert.equal(isDanger(tile,1),true)
  }
  advance(160+192)
  assert.equal(e.y,272)
  assert.equal(state.tileChanges.r[14 * 24 + 8],0x25)
})

test('floating brown and orange decks bob at the waterline without drifting horizontally', () => {
  for (const id of [0x5b, 0x5d]) {
    const { e, r, advance } = setup(id)
    for (let i = 18 * r.width; i < r.tiles.length; i++) r.tiles[i] = 0
    const heights: number[] = []
    for (let frame = 1; frame <= 257; frame++) {
      advance(frame)
      heights.push(e.y)
      assert.equal(e.x, 128)
    }
    assert.ok(Math.min(...heights) < 284)
    assert.ok(Math.max(...heights) >= 288)
    assert.ok(Math.max(...heights.slice(-100)) - Math.min(...heights.slice(-100)) > 0)
  }
})

test('placed dolphins turn in water and emitted dolphins keep their direction through successive jumps', () => {
  for (const [id, speed] of [[0x42, 0], [0x43, 0], [0x41, -1.5], [0x41, 1.5]]) {
    const { e, r, world, advance } = setup(id)
    r.tide = 2
    e.y = 384
    if (id === 0x41) {
      e.emission = { c2: 0, facing: 0 }
      e.vx = speed
      assert.equal(moveEmission(world, r, e), false)
    }
    let launches = 0
    const heights: number[] = [], speeds: number[] = []
    for (let frame = 1; frame <= 384; frame++) {
      const previous = e.vy
      advance(frame)
      if (previous >= 0 && e.vy < 0) launches++
      heights.push(e.y)
      speeds.push(e.vx)
    }
    assert.ok(launches >= 2)
    assert.ok(Math.min(...heights) < 270)
    if (id === 0x42) assert.ok(Math.min(...speeds) < 0 && Math.max(...speeds) > 0)
    else assert.ok(speeds.every(v => v === speed))
  }
})
