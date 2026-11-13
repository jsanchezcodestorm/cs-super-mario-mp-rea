import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, createGame, palFrame, stepGame, type CampaignDefinition, type PlayerId } from '@smw/core'
import { enterRoom, spawnEntity } from '../packages/core/src/state.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))
const ids = ['mario', 'luigi'] as const

function castlePunch(id: PlayerId, behind: boolean, spriteId = 0x24) {
  const state = createGame(campaign), world = { campaign, state }
  state.phase = 'playing'
  state.entrance = null
  const p = state.players[id], peer = state.players[id === 'mario' ? 'luigi' : 'mario']
  for (const player of [p, peer]) enterRoom(world, player, '101', { x: 340, y: 284 })
  peer.x = 96
  const koopa = spawnEntity(world, '101', { spriteId, x: 336, y: 288 })!
  state.entities = [koopa]
  // Isolate the contact while both players and their punches take the normal input path.
  Object.assign(koopa, { x: 340, y: 280, vx: 0, vy: 0, netKoopa: { behind: !behind, turn: 0, phase: 0 } })
  p.behindNet = behind
  function drive(input = 0, peerInput = 0) {
    stepGame(campaign, state, id === 'mario' ? { mario: input, luigi: peerInput } : { mario: peerInput, luigi: input })
  }
  drive(Buttons.up, Buttons.up)
  drive()
  assert.ok(p.netClinging)
  assert.equal(!!p.behindNet, behind)
  return { state, p, peer, koopa, drive }
}

test('either player can punch all four climbing Koopas off the opposite face and score once', () => {
  for (const id of ids) for (const behind of [false, true]) for (const sprite of [0x22, 0x23, 0x24, 0x25]) {
    const { state, p, peer, koopa, drive } = castlePunch(id, behind, sprite)
    koopa.x = Math.floor(p.x) - 2 + (behind ? -8 : 8)
    const y = koopa.y, x = koopa.x
    drive(Buttons.run)
    assert.equal(p.score, 0, 'the button starts the windup')
    for (let i = 0; !p.score && i < 12; i++) drive(Buttons.run)
    assert.equal(p.score, 100)
    assert.equal(peer.score, 0)
    assert.ok(p.netClinging && p.status === 'alive')
    assert.equal(state.rewardEffects?.filter(r => r.award === 100).length, 1)
    assert.ok(state.entities.includes(koopa), 'the defeated Koopa remains visible at the net')
    const hitFrame = palFrame(state.tick)
    let minY = koopa.y, seenFalling = false
    for (let i = 0; i < 200 && state.entities.includes(koopa); i++) {
      drive(i % 12 === 0 ? Buttons.run : 0)
      if (palFrame(state.tick) - hitFrame === 16) {
        assert.equal(koopa.x - x, behind ? -8 : 8)
        // Sixteen native updates at −5 px/frame and +3/16 px/frame².
        assert.equal(Math.floor(koopa.y) - y, -58)
      }
      minY = Math.min(minY, koopa.y)
      if (koopa.y > y) seenFalling = true
    }
    assert.ok(minY < y && seenFalling, 'the Koopa is launched and then falls past the fence')
    assert.equal(Math.sign(koopa.x - x), behind ? -1 : 1, 'the Koopa flies away from the punching hand')
    assert.ok(!state.entities.includes(koopa), 'the fallen Koopa leaves the room')
    assert.equal(p.score, 100)
    assert.equal(peer.score, 0)
  }
})

test('the Koopa moves before the punch sample and a centred Koopa is knocked to the left', () => {
  for (const behind of [false, true]) for (const vx of [-1, 1, 0]) {
    const { p, koopa, state, drive } = castlePunch('luigi', behind)
    const nativeX = Math.floor(p.x) - 2
    const rightContact = nativeX + (behind ? 8 : 24)
    koopa.x = 450
    drive(Buttons.run)
    while (!(palFrame(state.tick + 1) & 1) || palFrame(state.tick + 1) === palFrame(state.tick)) drive()
    koopa.x = vx === 0 ? nativeX : rightContact + Number(vx < 0)
    koopa.vx = vx
    drive()
    assert.equal(p.score, vx === 1 ? 0 : 100)
    if (!vx) assert.equal(koopa.vx, -0.5)
  }
})

test('the fence punch includes its last contact pixel on each face, across Map16 boundaries', () => {
  for (const behind of [false, true]) {
    // The hand is 20×16 from (native X ± 8 − 2, native Y + 2).
    // Climbing Koopas have clipping profile 01 at (+2,+3), sized 12×21.
    for (const [dx, dy, expected] of [
      [-14, 0, 100], [-15, 0, 0], [18, 0, 100], [18.5, 0, 100], [19, 0, 0],
      [0, -24, 100], [0, -25, 0], [0, 13, 100], [0, 13.5, 100], [0, 14, 0],
    ]) {
      const { p, koopa, drive } = castlePunch('luigi', behind)
      const left = Math.floor(p.x) - 4 + (behind ? -8 : 8)
      const top = Math.floor(p.y + p.height) - 30
      koopa.x = left + dx
      koopa.y = top + dy
      drive(Buttons.run)
      for (let i = 0; i < 12; i++) drive()
      assert.equal(p.score, expected, 'face=' + behind + ' dx=' + dx + ' dy=' + dy)
    }
  }
})

test('simultaneous punches at the same Koopa produce one popup and a single awarded hit', () => {
  const { state, p, peer, koopa, drive } = castlePunch('mario', false)
  Object.assign(peer, { x: p.x, y: p.y, behindNet: false })
  drive(Buttons.run, Buttons.run)
  for (let frame = 0; frame < 10; frame++) drive()
  assert.equal(p.score + peer.score, 100)
  assert.equal(state.rewardEffects?.filter(r => r.award === 100).length, 1)
  assert.ok(state.entities.includes(koopa))
})

test('a held punch only connects on an odd PAL frame during its seven active frames', () => {
  for (const id of ids) for (const sampleAge of [0, 1, 2, 7, 8]) for (const parity of [0, 1]) {
    const { state, p, koopa, drive } = castlePunch(id, false)
    // Align the cartridge contact sample and expose the Koopa for that one simulation tick.
    while ((palFrame(state.tick + 1) + sampleAge) % 2 !== parity) drive()
    const start = palFrame(state.tick + 1)
    koopa.x = 450
    for (let count = 0; count < 20; count++) {
      const frame = palFrame(state.tick + 1)
      koopa.x = frame - start === sampleAge && frame !== palFrame(state.tick) ? p.x : 450
      drive(Buttons.run)
    }
    const shouldHit = sampleAge >= 1 && sampleAge <= 7 && parity === 1
    assert.equal(p.score, shouldHit ? 100 : 0, id + ' punch age=' + sampleAge + ' parity=' + parity)
    if (shouldHit) continue
    koopa.x = p.x
    for (let count = 0; count < 12; count++) drive(Buttons.run)
    assert.equal(p.score, 0, 'holding run does not start another punch')
    drive()
    drive(Buttons.run)
    for (let count = 0; count < 10; count++) drive()
    assert.equal(p.score, 100, 'a second press starts a new punch')
  }
})

test('a fence punch does not strike a Koopa on the player’s own face', () => {
  for (const id of ids) for (const behind of [false, true]) {
    const { p, koopa, drive } = castlePunch(id, behind)
    koopa.netKoopa!.behind = behind
    // Only the edge of the hand touches the Koopa. The body is out of reach.
    koopa.x = Math.floor(p.x) - 4 + (behind ? -8 - 14 : 8 + 18)
    drive(Buttons.run)
    for (let count = 0; count < 10; count++) drive()
    assert.equal(p.score, 0)
    assert.equal(p.status, 'alive')
    assert.ok(koopa.active)
  }
})

test('a turning Koopa on the same face is harmless during the paused frames and can be punched from the other face', () => {
  for (const id of ids) for (const behind of [false, true]) for (const same of [true, false]) {
    const { p, koopa, drive } = castlePunch(id, behind)
    Object.assign(koopa.netKoopa!, { behind: same ? behind : !behind, turn: 0x3f })
    drive(Buttons.run)
    for (let count = 0; count < 12; count++) drive()
    assert.equal(p.status, 'alive')
    assert.equal(p.score, same ? 0 : 100)
    assert.equal(koopa.active, same)
    if (same) {
      for (let count = 0; count < 12; count++) drive()
      assert.equal(p.status, 'dead', 'the Koopa is dangerous once it starts climbing again')
    }
  }
})
