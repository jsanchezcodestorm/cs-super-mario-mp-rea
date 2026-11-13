import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createGame, palFrame, type CampaignDefinition } from '@smw/core'
import { entityFromSpawn } from '../packages/core/src/species.ts'
import { movePipePlant } from '../packages/core/src/pipe-plant.ts'
import { contact } from '../packages/core/src/entity-contact.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))

// probe_pipe_plants.py --trace reads these starting registers and each subsequent
// PAL frame from the live E1 sprite slot until it lands. Include subpixel position.
for (const sample of [
  { room: '105', id: 0x4f, frame: 199, head: 37, leaves: 13, length: 287,
    digest: 'c9064c97761aaf3bbb3486933df2939ecbfd5283cd57709f23a4d30772886e21' },
  { room: '125', id: 0x50, frame: 173, head: 194, leaves: 16, length: 293,
    digest: 'ebf50c4edcd6e748317b7a7e9a1ba79250ad9e83878ad9ca9bcf185b0eeb009e' },
]) test('pipe plant reproduces the native jump and landing in ' + sample.room, () => {
  const room = campaign.levels[sample.room], state = createGame(campaign)
  const spawn = room.sprites.find(s => s.spriteId === sample.id)!
  const e = entityFromSpawn(room.id, spawn, 'plant')!
  const plant = e.pipePlant!
  assert.equal(e.x, spawn.x + 8)
  assert.equal(e.y, spawn.y - 1)
  Object.assign(plant, { phase: 1, head: sample.head, leaves: sample.leaves })
  e.vy = -4
  e.y = spawn.y + 0.5
  state.tick = Math.ceil(sample.frame * 6 / 5)
  const frames: number[][] = []
  for (let i = 0; i < sample.length; i++) {
    const start = palFrame(state.tick), previousY = Math.floor(e.y)
    do {
      state.tick++
      movePipePlant({ state, campaign }, room, e, state.players.mario)
    } while (palFrame(state.tick) === start)
    assert.equal(plant.drawY, previousY)
    frames.push([e.x, e.y, e.vy, plant.phase, plant.timer, plant.head, plant.leaves])
  }
  assert.equal(plant.phase, 0)
  assert.equal(plant.timer, 64)
  assert.equal(createHash('sha256').update(JSON.stringify(frames)).digest('hex'), sample.digest)
})

test('an inverted plant waits above the lip while Luigi is nearby, then descends 31 pixels', () => {
  const room = campaign.levels['10a'], state = createGame(campaign)
  const spawn = room.sprites.find(s => s.spriteId === 0x2a)!
  const e = entityFromSpawn(room.id, spawn, 'plant')!, p = state.players.luigi
  Object.assign(p, { roomId: room.id, x: e.x, y: spawn.y + 16 })
  const world = { state, campaign }
  for (state.tick = 1; state.tick < 120; state.tick++) movePipePlant(world, room, e, p)
  assert.ok(e.pipePlant?.hidden)
  assert.equal(e.y, spawn.y - 17)
  contact(world, e, p, 0, p.y + p.height)
  assert.equal(p.status, 'alive')
  p.x += 64
  let maxY = e.y
  for (; state.tick < 350; state.tick++) {
    movePipePlant(world, room, e, p)
    maxY = Math.max(maxY, e.y)
  }
  assert.equal(maxY, spawn.y + 14)
  assert.equal(entityFromSpawn(room.id, { ...spawn, spriteId: 0x99 }, 'lotus')!.pipePlant, undefined)
})
