import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Buttons, type CampaignDefinition } from '../src/index.ts'
import { stepLayer } from '../src/layer-two.ts'
import { pipeEntry } from '../src/pipe-entry.ts'
import { moveEntity } from '../src/entity-motion.ts'
import { contact } from '../src/entity-contact.ts'
import { spawnEntity } from '../src/state.ts'
import { moveBody } from '../src/terrain.ts'
import { enterFirstCourse } from './enter-first-course.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync(
  new URL('../../../generated/content.json', import.meta.url), 'utf8',
))

test('pipe exits emerge on the open side of the ROM rim for both player heights', () => {
  for (const height of [16, 28]) {
    const down = campaign.levels['0f8'], up = campaign.levels['0c6']
    assert.deepEqual(pipeEntry(down, down.spawn, { height, width: 12 }), { x: 24, y: 256 })
    assert.deepEqual(pipeEntry(up, up.spawn, { height, width: 12 }), { x: 24, y: 352 - height })
  }
})

test('horizontal exits clear the complete mouth in both directions and align the feet to its base', () => {
  for (const height of [16, 28]) {
    const body = { height, width: 12 }
    for (const [id, x] of [['0c9', 32], ['1f0', 116], ['0bd', 32]] as const) {
      const room = campaign.levels[id]
      const expected = { x, y: room.spawn.y + 32 - height }
      assert.deepEqual(pipeEntry(room, room.spawn, body), expected)
      assert.deepEqual(pipeEntry(room, { x: room.spawn.x, y: room.spawn.y + 16 }, body), expected)
    }
  }
})

test('the Valley of Bowser platform starts below both players and rises when either lands', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }
  const room = campaign.levels['1e2'], team = Object.values(state.players)
  for (const p of team) Object.assign(p, { roomId: room.id, ...room.spawn })
  stepLayer(world, room, team)
  const layer = state.layerOffsets[room.id]
  assert.equal(layer.y, 192)
  assert.equal(layer.dy, 0)
  state.players.luigi.layer2Ground = true
  stepLayer(world, room, team)
  assert.ok(layer.y < 192 && layer.dy < 0)
  state.players.luigi.layer2Ground = false
  for (let i = 0; i < 600; i++) stepLayer(world, room, team)
  assert.equal(layer.y, 16)
  for (const p of team) p.x = 176
  stepLayer(world, room, team)
  assert.equal(layer.y, 192)
  assert.equal(layer.dy, 0)
  assert.equal(layer.engaged, false)
})

test('fixed springboards stay on the wall and rebound more strongly near the free end', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }, p = state.players.luigi
  for (const spriteId of [0x6b, 0x6c]) {
    const e = spawnEntity(world, p.roomId, { x: 160, y: 160, spriteId })!
    const left = spriteId === 0x6b ? 160 : 120
    assert.equal(e.x, left)
    assert.equal(e.width, 40)
    for (let tick = 0; tick < 30; tick++) moveEntity(world, e, p)
    assert.deepEqual([e.x, e.y], [left, 160])
    const launch = (position: number) => {
      p.x = spriteId === 0x6b ? left + position - p.width / 2 : left + e.width - position - p.width / 2
      p.y = e.y - p.height + 1
      p.vy = 1
      contact(world, e, p, Buttons.jump, e.y)
      assert.equal(p.grounded, false)
      return p.vy
    }
    assert.equal(launch(4), -76 / 16)
    assert.equal(launch(36), -120 / 16)
  }
  for (const spriteId of [0x2f, 0x3e, 0x80, 0xda]) {
    const e = spawnEntity(world, p.roomId, { x: 160, y: 64, spriteId })!
    moveEntity(world, e, p)
    assert.equal(e.x, 160)
    assert.ok(e.y > 64)
  }
})

test('an upward-thrown shell opens the Donut Plains vine without bouncing its owner', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }
  const p = state.players.luigi, room = campaign.levels['0e9']
  const shell = spawnEntity(world, room.id, { x: 688, y: 245, spriteId: 0xdb })!
  Object.assign(shell, { tossed: true, owner: p.id, vy: -7 })
  const previousSpeed = p.vy
  for (let i = 0; i < 3; i++) moveEntity(world, shell, p)
  assert.equal(p.vy, previousSpeed)
  assert.equal(state.entities.filter(e => e.roomId === room.id && e.kind === 'vine').length, 1)
})

test('small Mario can enter a one-tile opening when both native side probes clear the lip', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }
  const room = campaign.levels['1db'], p = state.players.mario
  Object.assign(p, { x: 852, y: 86.25, vx: 1, vy: 0, grounded: false })
  moveBody(world, room, p)
  assert.equal(p.x, 852)
  Object.assign(p, { y: 85.85, vx: 1 })
  moveBody(world, room, p)
  assert.ok(p.x > 852)
  assert.equal(p.y, 80)
})
