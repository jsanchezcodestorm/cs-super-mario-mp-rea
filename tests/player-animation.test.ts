import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Buttons, createGame, palFrame, type CampaignDefinition, type PlayerId, type PowerForm } from '@smw/core'
import { initialPlayer } from '../packages/core/src/state.ts'
import { stepPlayer } from '../packages/core/src/player.ts'
import { playerAnimation } from '../packages/core/src/player-animation.ts'
import { startCapeFlight } from '../packages/core/src/cape-flight.ts'
import { frameForPlayer, playerFacingRight } from '../apps/web/src/game/player-animation.ts'
import { drawnBehindNet } from '../apps/web/src/game/net-player.ts'
import { mountPose, riderSeatOffset } from '../apps/web/src/game/mount-view.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))
const seats = ['mario', 'luigi'] as const
const forms = ['small', 'super', 'cape', 'fire'] as const
const body = (frame: string) => Number(frame.split('/')[2]) & 127
const atlas = JSON.parse(readFileSync('generated/actors.json', 'utf8')).frames
const player = (character: 'mario' | 'luigi', course: string) =>
  initialPlayer({ id: character, nickname: character, character }, course)

function stage(id: PlayerId, form: PowerForm, tile = 0x25) {
  const width = 96, height = 24, tiles = Array.from({ length: width * height }, (_, i) => i >= width * 20 ? 0x130 : tile)
  const room = { id: 'flat', width, height, tiles, spawn: { x: 32, y: 128 }, exits: [], sprites: [] }
  const state = createGame(campaign), world = { state, campaign: { ...campaign, levels: { flat: room } } }
  const p = Object.assign(state.players[id], { roomId: room.id, form, x: 40, y: 320 - 28,
    height: form === 'small' ? 16 : 28, grounded: true, cooldown: 0 })
  p.y = 320 - p.height
  function advance(input: number, duration: number) {
    const poses = []
    for (let i = 0; i < duration; i++) {
      state.tick++
      stepPlayer(world, p, input)
      p.lastInput = input
      poses.push(body(frameForPlayer(p, state.tick)))
    }
    return poses
  }
  return { p, state, advance }
}

test('both seats select the PAL walk, skid, sprint, takeoff and ordinary landing poses', () => {
  for (const id of seats) for (const form of forms) {
    const { p, state, advance } = stage(id, form)
    assert.deepEqual(advance(Buttons.up, 5), Array(5).fill(3))
    const walking = new Set(advance(Buttons.right, 50))
    assert.deepEqual(walking, new Set(form === 'small' ? [0, 1] : [0, 1, 2]))
    assert.equal(advance(Buttons.left, 1)[0], 13)
    advance(Buttons.right | Buttons.run, 160)
    const sprint = new Set(advance(Buttons.right | Buttons.run, 20))
    assert.deepEqual(sprint, new Set(form === 'small' ? [4, 5] : [4, 5, 6]))
    const runningJump = advance(Buttons.right | Buttons.run | Buttons.jump, 29)
    assert.ok(runningJump.includes(12), id + '/' + form + ': charged takeoff')
    if (form === 'cape') {
      const flight = new Set(advance(Buttons.right | Buttons.run, 65))
      assert.ok([...flight].some(pose => pose >= 42 && pose <= 47))
    }
    Object.assign(p, { flight: 0, runTicks: 0, vx: 0, grounded: false, vy: -1 })
    delete p.animation
    assert.equal(body(frameForPlayer(p, state.tick)), 11)
    p.vy = 1
    assert.equal(body(frameForPlayer(p, state.tick)), 36)
  }
})

test('spin body and facing change together every two PAL frames without steering the player', () => {
  for (const id of seats) for (const form of forms) {
    const p = Object.assign(player(id, 'flat'), { form, spin: true, facing: -1 as const })
    const poses = [], faces = []
    for (let f = 0; f < 8; f++) {
      const tick = Math.ceil(f * 6 / 5)
      const key = frameForPlayer(p, tick)
      assert.ok(atlas[key], key)
      poses.push(body(key))
      faces.push(playerFacingRight(p, tick))
    }
    assert.deepEqual(poses, form === 'small' ? [0,0,37,37,0,0,15,15] : [0,0,68,68,0,0,69,69])
    assert.deepEqual(faces, [false,false,false,false,true,true,true,true])
    assert.equal(p.facing, -1)
  }
})

test('reversing a cape flight changes pitch without an upward impulse', () => {
  const { p, advance } = stage('mario', 'cape')
  p.flight = 1
  p.grounded = false
  p.facing = 1
  p.y = 200
  p.vy = 2
  p.lastInput = Buttons.right | Buttons.run
  p.capeFlight = { ...startCapeFlight(), phase: 6, target: 1, takeoffTimer: 0 }

  advance(Buttons.left | Buttons.run, 2)

  assert.equal(p.capeFlight?.phase, 5)
  assert.ok(p.vy > 0)
})

test('local water tiles drive a finite swim stroke and climbing mirrors the front pose', () => {
  for (const id of seats) {
    const water = stage(id, 'super', 2)
    water.p.y = 190
    water.p.grounded = false
    const stroke = water.advance(Buttons.jump, 2).concat(water.advance(0, 24))
    assert.deepEqual([...new Set(stroke)], [22, 24, 26])
    assert.deepEqual(water.advance(0, 22), Array(22).fill(22))
    const vine = stage(id, 'super', 6)
    vine.p.y = 200
    const faces = new Set()
    for (let i = 0; i < 26; i++) {
      assert.equal(vine.advance(Buttons.up, 1)[0], 21)
      faces.add(playerFacingRight(vine.p, vine.state.tick))
    }
    assert.equal(faces.size, 2)
  }
})

test('cape flutters independently, fire hand expires, and Yoshi and rider share their seat phase', () => {
  for (const id of seats) {
    const cape = stage(id, 'cape')
    const phases = new Set<number>()
    for (let i = 0; i < 70; i++) {
      cape.advance(Buttons.right, 1)
      const key = frameForPlayer(cape.p, cape.state.tick)
      assert.ok(atlas[key], key)
      phases.add(Number(key.split('/')[2]) >> 7)
    }
    assert.deepEqual(phases, new Set([0, 3, 4, 5, 6]))
    const fire = stage(id, 'fire')
    assert.equal(fire.advance(Buttons.run, 1)[0], 63)
    assert.equal(fire.advance(0, 14).at(-1), 0)
    const p = fire.p
    p.mounted = true
    p.vx = 1
    playerAnimation(p).yoshiStep = 1
    assert.equal(mountPose(p, 0), 1)
    assert.equal(riderSeatOffset(p, 0), -1)
    const tick = fire.state.tick
    p.pipeExit = { x: p.x, y: p.y, direction: 'up', tick, frames: 40 }
    assert.equal(body(frameForPlayer(p, tick)), 33)
    assert.equal(mountPose(p, tick), 18)
    p.pipeExit.direction = 'left'
    assert.equal(body(frameForPlayer(p, tick)), 41)
    assert.equal(mountPose(p, tick), 16 + ((palFrame(tick) >> 3) & 1))
    assert.equal(playerFacingRight(p, tick), false)
    p.mounted = false
    p.pipeExit.direction = 'down'
    assert.equal(body(frameForPlayer(p, tick)), 15)
  }
})

test('pipe samples leave the head ahead of the rider and the body behind for every Yoshi color', () => {
  const registration = JSON.parse(readFileSync('generated/creatures-registration.json', 'utf8'))
  for (const color of ['green', 'red', 'blue', 'yellow']) for (const sample of [16, 17, 18]) {
    const frame = registration['8-53:' + color + '/' + sample]
    assert.equal(frame.layers[0].oam, 65)
    assert.ok(frame.layers[1].oam > 69)
  }
})

test('front and back net punches, turns and OAM side retain the native frame order', () => {
  for (const id of seats) for (const form of forms) for (const behind of [false, true]) {
    const p = player(id, '1d3')
    Object.assign(p, { form, netClinging: true, netPunchTick: 0, behindNet: behind, x: 196 })
    assert.equal(body(frameForPlayer(p, 0)), behind ? 34 : 21)
    assert.equal(body(frameForPlayer(p, 6)), behind ? 35 : 30)
    delete p.netPunchTick
    p.netTurn = { roomId: p.roomId, x: 176, y: 288, tick: 0, fromBehind: behind, offsetX: -6 }
    const expected = behind ? [34,33,33,32,32,31,21,21] : [21,31,31,32,32,33,34,34]
    for (let i = 0; i < 8; i++) {
      const tick = Math.ceil(i * 4 * 6 / 5)
      const key = frameForPlayer(p, tick)
      assert.ok(atlas[key], key)
      assert.equal(body(key), expected[i])
    }
    p.behindNet = !behind
    assert.equal(drawnBehindNet(p, Math.ceil(15 * 6/5)), behind)
    assert.equal(drawnBehindNet(p, Math.ceil(16 * 6/5)), !behind)
  }
})
