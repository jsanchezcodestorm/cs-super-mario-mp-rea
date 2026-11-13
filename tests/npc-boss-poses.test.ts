import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type Phaser from 'phaser'
import { looseYoshiPose, type EntityState, type PlayerState } from '@smw/core'
import { reznorPose, updateBossFacing } from '../packages/core/src/boss-facing.ts'
import { bossFrame } from '../apps/web/src/game/boss-view.ts'

const arenas = JSON.parse(readFileSync('generated/bosses/index.json', 'utf8'))
const scene = { cache: { json: { get: () => arenas } } } as unknown as Phaser.Scene
const tick = (pal: number) => Math.ceil(pal * 6 / 5)

test('the five directional Koopalings mirror their native frame and the two pipe bosses keep their front-facing copies', () => {
  for (const roomId of ['0e5', '0cc', '0d9', '1f6', '1eb', '1f2', '0d3']) {
    const pipe = roomId === '1f2' || roomId === '0d3'
    for (const pipeOffset of pipe ? [0, 2, 4] : [0]) {
      const e = { roomId, kind: pipeOffset ? 'pipeDecoy' : 'boss', spriteId: 0x29, pipeOffset } as EntityState
      for (const age of [1, 63, 126]) {
        e.age = age
        e.facing = -1
        const left = bossFrame(scene, e)!
        e.facing = 1
        const right = bossFrame(scene, e)!
        assert.equal(left.texture, right.texture)
        assert.equal(right.flipX, pipe ? false : !left.flipX)
        if (pipe) assert.equal(left.flipX, false)
      }
    }
  }
})

test('each Reznor tracks the player on its staggered PAL frame, turns and fires from its own OAM slots', () => {
  const roomId = '0d5'
  for (let index = 0; index < 4; index++) {
    const e = { roomId, kind: 'boss', spriteId: 0xa9, origin: { x: 16 * (1 + index) }, x: 100,
      width: 32, facing: -1 } as EntityState
    const p = { x: 218, width: 12 } as PlayerState
    const phase = ((index + 1) * 16) % 64 || 64
    e.age = tick(phase - 1)
    updateBossFacing(e, p)
    assert.equal(e.facing, -1)
    function check(pose: string, side: string) {
      assert.equal(reznorPose(e), pose)
      const rendered = bossFrame(scene, e)!
      assert.equal(rendered.texture, 'bosses/' + arenas[roomId].tracks['wheel' + index + '-' + pose + '-' + side][0])
      assert.deepEqual(rendered.registration, { priority: 3, oam: 118 - 6 * index })
      assert.equal(rendered.flipX, false)
    }
    check('idle', 'left')
    e.age = tick(phase)
    updateBossFacing(e, p)
    assert.equal(e.facing, 1)
    check('turn', 'right')
    e.age = tick(phase + 10)
    check('idle', 'right')
    e.age = 190
    check('spit', 'right')
  }
})

test('riderless Yoshi clocks the dynamic head, three running steps and native growing body separately', () => {
  const registration = JSON.parse(readFileSync('generated/creatures-registration.json', 'utf8'))
  const e = { age: 0 } as EntityState
  for (let f = 1; f <= 64; f++) {
    e.age = tick(f)
    e.yoshiRunning = false
    assert.equal(looseYoshiPose(e, e.age), (f - 1) & 48 ? 19 : 20)
    e.yoshiRunning = true
    assert.equal(looseYoshiPose(e, e.age), 21 + (f - 1) % 3 + (((f - 1) & 16) ? 3 : 0))
  }
  for (const first of [6, 36]) {
    e.yoshiGrowthTick = tick(first)
    const visibleHead = first === 6 ? 30 : 29
    const sequence = [28, 27, 28, 27, 28, visibleHead, 28, visibleHead]
    for (let f = 1; f <= 64; f++)
      assert.equal(looseYoshiPose(e, tick(first + f)), sequence[(f - 1) >> 3])
  }
  for (const key of Object.keys(registration).filter(k => /^\d+-53:\w+\/0$/.test(k))) {
    for (let n = 19; n <= 30; n++) assert.ok(registration[key.slice(0, -1) + n], key + ' pose ' + n)
  }
})
