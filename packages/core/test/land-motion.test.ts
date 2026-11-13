import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, createGame, palFrame, type CampaignDefinition, type PlayerId } from '../src/index.ts'
import { stepPlayer } from '../src/player.ts'
import { startWallRun } from '../src/wall-run.ts'
import { hurt } from '../src/resources.ts'
import { enterRoom } from '../src/state.ts'

const base: CampaignDefinition = JSON.parse(readFileSync(new URL('../../../generated/content.json', import.meta.url), 'utf8'))
// Same controlled Yoshi's Island 1 floor as tools/rom/probe_land_motion.py.
const width = 64, height = 27
const tiles = Array<number>(width * height).fill(0x25)
tiles.fill(0x130, 24 * width, 25 * width)
const room = { ...base.levels['105'], width, height, tiles, sprites: [], exits: [] }
const campaign = { ...base, levels: { ...base.levels, '105': room } }

function flatStart(seat: PlayerId) {
  const state = createGame(campaign), player = state.players[seat], world = { state, campaign }
  enterRoom(world, player, '105', { x: 130, y: 368 })
  player.grounded = true
  function nextFrame(mask: number) {
    const frame = palFrame(state.tick)
    do {
      ++state.tick
      stepPlayer(world, player, mask)
      player.lastInput = mask
    } while (palFrame(state.tick) === frame)
  }
  return { world, player, nextFrame }
}

test('both controllers reproduce the E1 walk, coast, sprint and reversal distances', () => {
  for (const seat of ['mario', 'luigi'] as const) {
    for (const [start, reverse, change, samples] of [
      [Buttons.right, 0, 55, [[20, 19], [40, 50], [55, 73], [65, 85], [75, 89], [80, 89]]],
      [Buttons.run | Buttons.right, Buttons.run | Buttons.left, 105,
        [[25, 34], [40, 76], [60, 132], [80, 192], [100, 266], [105, 285], [110, 299], [115, 304], [120, 302], [135, 277]]],
    ] as const) {
      const { player, nextFrame } = flatStart(seat)
      const origin = player.x
      let frame = 0
      for (const [until, distance] of samples) {
        while (frame < until) nextFrame(++frame <= change ? start : reverse)
        assert.equal(Math.floor(player.x - origin), distance, seat + ' frame ' + frame)
      }
    }
  }
})

test('regular and spin jumps follow both PAL button durations for both seats', () => {
  for (const seat of ['mario', 'luigi'] as const) {
    for (const [mask, held, rise, landing] of [
      [Buttons.jump, 1, 33, 25], [Buttons.jump, 5, 43, 29], [Buttons.jump, 10, 53, 33], [Buttons.jump, 120, 64, 47],
      [Buttons.spin, 1, 28, 23], [Buttons.spin, 5, 37, 27], [Buttons.spin, 10, 46, 31], [Buttons.spin, 120, 54, 43],
    ]) {
      const { player, nextFrame } = flatStart(seat)
      const start = player.y
      let frame = 0, peak = start
      do {
        nextFrame(++frame <= held ? mask : 0)
        peak = Math.min(peak, player.y)
      } while (!player.grounded && frame < 60)
      assert.ok(Math.abs(Math.floor(peak) - start + rise) <= 2, seat + ' peak with button held ' + held)
      assert.ok(Math.abs(frame - landing) <= 1, seat + ' landing with button held ' + held)
    }
  }
})

test('both purple triangles accept the first running speed byte allowed by E1', () => {
  for (const direction of [-1, 1] as const) {
    const { player } = flatStart(direction === 1 ? 'mario' : 'luigi')
    player.facing = direction
    const tile = direction === 1 ? 0x1b4 : 0x1b5
    const contact = { col: 9, row: 24, tile, side: 'bottom' as const }
    for (const highByte of [42, 43]) {
      const speed = direction * highByte / 16 * (5 / 6)
      startWallRun(player, [contact], speed)
      assert.equal(player.wallRun, highByte === 43 ? direction : undefined)
    }
  }
})

test('a hit breaks the glide into a spin while both players keep their capes', () => {
  for (const seat of ['mario', 'luigi'] as const) {
    const { world, player } = flatStart(seat)
    player.form = 'cape'
    player.flight = 1
    player.grounded = false
    hurt(world, player)
    assert.equal(player.form, 'cape')
    assert.equal(player.flight, 0)
    assert.equal(player.spin, true)
    assert.equal(player.invincible, 58)
    player.invincible = 0
    hurt(world, player)
    assert.equal(player.form, 'small')
  }
})
