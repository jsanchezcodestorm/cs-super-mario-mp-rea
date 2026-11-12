import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGame, type CampaignDefinition, type LevelDefinition } from '../src/index.ts'
import { moveBody } from '../src/terrain.ts'

const original: CampaignDefinition = JSON.parse(readFileSync(new URL('../../../generated/content.json', import.meta.url), 'utf8'))

function bay(tile: number, layer2: boolean) {
  const width = 16, height = 24
  const room: LevelDefinition = {
    id: 'cave', width, height, tileset: 3, tiles: Array(width * height).fill(0x25),
    sprites: [], exits: [], spawn: { x: 64, y: 256 },
  }
  const cells = layer2 ? room.layer2 = [...room.tiles] : room.tiles
  cells[14 * width + 4] = tile
  const campaign = { ...original, start: room.id, initial: [room.id], levels: { cave: room } }
  return { room, world: { campaign, state: createGame(campaign) } }
}

test('inverted Map16 profiles stop each rising player at the PAL head contact in both layers', () => {
  // Snes9x reports the last blocked pixel. The web body uses its exclusive boundary.
  const samples = [[0x1c4, 2, 226], [0x1c4, 9, 233], [0x1c5, 2, 237], [0x1c5, 9, 230]]
  for (const [tile, localX, blockedPixel] of samples) for (const layer2 of [false, true]) {
    const { room, world } = bay(tile, layer2)
    for (const player of Object.values(world.state.players)) {
      Object.assign(player, { x: 64 + localX - player.width / 2, y: 244, vy: -4 })
      let hit
      for (let tick = 0; tick < 10 && !hit; tick++)
        hit = moveBody(world, room, player).find((c) => c.side === 'top')
      assert.equal(hit?.tile, tile)
      assert.equal(player.y, blockedPixel + 1)
      assert.equal(player.vy, 0)
    }
  }
})

test('a rising player passes through a top-solid ledge and can land on its top', () => {
  const { room, world } = bay(0x100, false)
  const p = world.state.players.luigi
  Object.assign(p, { x: 66, y: 244, vy: -4 })
  for (let i = 0; i < 10; i++) assert.ok(!moveBody(world, room, p).some((hit) => hit.side === 'top'))
  p.vy = 4
  moveBody(world, room, p)
  assert.equal(p.grounded, true)
  assert.equal(p.y + p.height, 224)
})
