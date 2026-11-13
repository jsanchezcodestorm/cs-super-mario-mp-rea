import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { Buttons, createGame, netKoopaPose, palFrame, stepGame, type CampaignDefinition } from '@smw/core'
import { moveEntity } from '../packages/core/src/entity-motion.ts'
import { enterRoom } from '../packages/core/src/state.ts'
import { contact } from '../packages/core/src/entity-contact.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))
function setup(id: number, targetX: number, terrain: 'ledge' | 'wall' | 'net' = 'wall') {
  const width = 20, height = 26, tiles = Array<number>(width * height).fill(0x25)
  for (let x = 0; x < width; x++) {
    if (terrain !== 'ledge' || x < 8) tiles[20 * width + x] = 0x130
    if (terrain === 'net' && x >= 5 && x < 12) {
      for (let row = 15; row < 20; row++) tiles[row * width + x] = 0x0b
    }
  }
  if (terrain === 'wall') tiles[19 * width + 9] = 0x130
  const room = { id: 'test', width, height, tiles, spawn: { x: targetX, y: 304 }, sprites: [{ spriteId: id, x: 112, y: terrain === 'net' ? 272 : 304 }], exits: [] }
  const c = { start: room.id, levels: { test: room }, routes: { test: {} } }
  const state = createGame(c)
  stepGame(c, state, { mario: Buttons.action, luigi: 0 })
  const world = { state, campaign: c }, p = state.players.luigi, e = state.entities[0]
  const advance = () => { state.tick++; moveEntity(world, e, p) }
  return { world, e, p, advance }
}

test('Koopa INIT faces the local target and grounded red and blue variants turn at the centre foot of a ledge', () => {
  for (let id = 0; id < 8; id++) {
    for (const side of [-1, 1]) {
      const { e, advance } = setup(id, side < 0 ? 32 : 180, 'ledge')
      advance()
      assert.equal(e.facing, side)
      if (side < 0) continue
      let turnX: number | undefined
      for (let tick = 0; tick < 44; tick++) {
        advance()
        if (e.koopa?.turn === 8 && e.facing === -1) { turnX = e.x; break }
      }
      if ([1, 2, 5, 6].includes(id)) assert.ok(turnX !== undefined && Math.abs(turnX - 120) < 1)
      else { assert.equal(turnX, undefined); assert.ok(e.x > 135) }
    }
  }
})

test('a wall reversal shows the eight PAL frames of the Koopa pivot before walking resumes', () => {
  const { e, world, advance } = setup(4, 180)
  do { advance() } while (!e.koopa?.turn && e.age < 60)
  assert.equal(e.facing, -1)
  assert.equal(e.koopa?.turn, 8)
  const frame = palFrame(world.state.tick)
  for (let i = 0; i < 11; i++) {
    assert.equal(e.koopa?.turn, Math.max(0, 8 + frame - palFrame(world.state.tick)))
    advance()
  }
})

test('the winged Koopas face the direction they fly on both halves of a patrol', () => {
  for (const id of [0x08, 0x0a, 0x0b]) {
    const { e, advance } = setup(id, 32)
    const directions = new Set<number>()
    for (let tick = 0; tick < 205; tick++) {
      const previousX = e.x
      advance()
      if (e.x === previousX) continue
      assert.equal(e.facing, Math.sign(e.x - previousX))
      directions.add(e.facing!)
    }
    assert.deepEqual([...directions].sort(), [-1, 1])
  }
})

test('all 46 fence Koopas materialize in their original castle rooms', () => {
  const state = createGame(campaign), world = { campaign, state }, p = state.players.mario
  for (const room of ['101', '0db', '1d3']) enterRoom(world, p, room)
  assert.equal(state.entities.filter(e => e.kind === 'netKoopa').length, 46)
})

test('native green/red fence travel and side changes stay aligned, including the 16 paused frames', () => {
  for (const [id, edge, flip] of [[34,88,104], [35,45,61], [36,133,149], [37,67,83]]) {
    const { world, e, advance } = setup(id, 180, 'net')
    const begin = palFrame(world.state.tick)
    for (let i = 0; i < flip + 16; i++) {
      while (palFrame(world.state.tick) - begin < i + 1) advance()
      assert.equal(e.netKoopa?.behind, i + 1 >= flip)
      if (i + 1 === edge) assert.equal(e.netKoopa?.turn, 80)
      if (i + 1 >= flip && i + 1 <= flip + 16) assert.equal(e.netKoopa?.phase, flip)
      if (i + 1 > flip) assert.ok(netKoopaPose(e) >= 4)
    }
  }
})

test('Mario and Luigi contact a fence Koopa on the same side and can punch it through the net', () => {
  const { world, e, advance } = setup(0x24, 180, 'net')
  advance()
  for (const p of Object.values(world.state.players)) {
    Object.assign(p, { x: e.x, y: e.y, behindNet: true, netClinging: true, invincible: 0, cooldown: 0 })
    contact(world, e, p, 0, p.y + p.height)
    assert.equal(p.status, 'alive')
  }
  const p = world.state.players.luigi
  Object.assign(p, { x: e.x, y: e.y+15, netPunchTick: world.state.tick })
  contact(world, e, p, Buttons.run, p.y + p.height)
  assert.equal(e.active, false)
  assert.equal(p.score, 100)

  const same = setup(0x24, 180, 'net')
  same.advance()
  for (const player of Object.values(same.world.state.players)) {
    Object.assign(player, { x: same.e.x, y: same.e.y, behindNet: false, netClinging: true, invincible: 0, cooldown: 0 })
    contact(same.world, same.e, player, 0, player.y + player.height)
    assert.equal(player.status, 'dead')
  }
})
