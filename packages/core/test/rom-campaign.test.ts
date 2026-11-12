import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createGame, stepGame, type CampaignDefinition, type ExitKind } from '../src/index.ts'
import { enterRoom } from '../src/state.ts'

const file = new URL('../../../generated/content.json', import.meta.url)
const campaign: CampaignDefinition | undefined = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : undefined
const requiresExtraction = { skip: !campaign && 'Run npm run extract against the local PAL E1 ROM' }
function connectedRooms(campaign: CampaignDefinition, course: string) {
  const connected = new Set([course])
  if (course === '024')
    for (const id of Object.keys(campaign.levels)) if (id.startsWith('ci2-')) connected.add(id)
  for (const id of connected) {
    for (const exit of campaign.levels[id].exits) {
      assert.ok(campaign.levels[exit.target], id + ' unresolved exit ' + exit.target)
      connected.add(exit.target)
    }
  }
  return connected
}
function triggers(c: CampaignDefinition, course: string) {
  const kinds = new Set<ExitKind>()
  for (const roomId of connectedRooms(c, course)) {
    const room = c.levels[roomId]
    for (const spawn of room.sprites) {
      if (spawn.spriteId === 0x7b) kinds.add(spawn.extra ? 'secret' : 'normal')
      if (spawn.spriteId === 0x0e) kinds.add('secret')
      if (spawn.spriteId === 0xc5) kinds.add(course === '013' ? 'secret' : 'normal')
      if ([0x29, 0xa9, 0x4a].includes(spawn.spriteId)) kinds.add('normal')
    }
    if (room.tiles.some((t) => t >= 0xec && t <= 0xfb)) kinds.add('normal')
  }
  return kinds
}
test(
  'decoded PAL E1 campaign has 96 distinct physical exit triggers and every mapped course is reachable',
  requiresExtraction,
  () => {
    const c = campaign!,
      playable = Object.keys(c.names!),
      reachable = new Set(c.initial)
    let total = 0
    for (const course of reachable) {
      const endings = triggers(c, course)
      for (const [kind, paths] of Object.entries(c.routes[course] ?? {})) {
        assert.ok(endings.has(kind as ExitKind), course + ' missing physical trigger for ' + kind)
        paths.forEach((id) => reachable.add(id))
      }
      total += endings.size
    }
    assert.deepEqual([...reachable].sort(), playable.sort())
    assert.equal(total, 96)
  },
)
test(
  'all 246 extracted rooms and variants accept 300 deterministic two-player frames',
  requiresExtraction,
  () => {
    const c = campaign!
    const ids = Object.keys(c.levels)
    assert.equal(ids.length, 246)
    for (const id of ids) {
      const state = createGame(c)
      // Enter each actual room directly, including bank 07 entrances and all Chocolate Island variants.
      for (const p of Object.values(state.players)) enterRoom({ campaign: c, state }, p, id)
      let seed = 736
      for (let i = 0; i < 300; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        stepGame(c, state, { mario: (seed >> 8) & 255, luigi: (seed >> 16) & 255 })
      }
      for (const actor of [...Object.values(state.players), ...state.entities]) {
        assert.ok(
          Number.isFinite(actor.x + actor.y + actor.vx + actor.vy),
          id + ' nonfinite coordinates for ' + actor.id,
        )
      }
    }
  },
)
