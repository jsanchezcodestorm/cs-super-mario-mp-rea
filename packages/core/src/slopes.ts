import type { Body, LevelDefinition, World } from './types.ts'

/** E1 uses a tileset-specific Map16 table and one 16-byte signed profile per slope. */
export function slopeProfile(world: World, room: LevelDefinition, tile: number) {
  if (tile < 0x16e || tile >= 0x1d8) return null
  const table = world.campaign.slopes
  if (!table) throw new Error('Missing ROM slope profiles')
  return (room.tileset === 0 || room.tileset === 7 ? table.steepShape : table.shape)[tile - 0x16e]
}

export function slopeSample(world: World, profile: number, x: number) {
  const value = world.campaign.slopes!.heights[profile * 16 + (Math.floor(x) & 15)]
  return value >= 128 ? value - 256 : value
}

export function slopeHeight(world: World, room: LevelDefinition, tile: number, x: number) {
  const profile = slopeProfile(world, room, tile)
  if (profile === null) return null
  const height = slopeSample(world, profile, x)
  return height < 0 ? null : height
}

export function standingSlopeProfile(world: World, room: LevelDefinition, body: Body) {
  if (!body.grounded) return null
  const offset = body.layer2Ground ? world.state.layerOffsets[room.id] : undefined
  const x = body.x - (offset?.x ?? 0), feet = body.y + body.height - (offset?.y ?? 0)
  const tiles = body.layer2Ground ? room.layer2 : room.tiles
  if (!tiles) return null
  // The occupied box can sit on its higher edge near a crest. E1 selects the
  // motion table under the central foot, so a trailing toe on the ramp must
  // not keep accelerating a rider whose center has reached the flat.
  const center = x + body.width / 2
  const col = Math.floor(center / 16)
  if (col < 0 || col >= room.width) return null
  const highest = Math.floor((feet - 1) / 16)
  const lowest = Math.floor((feet + body.width) / 16)
  for (let row = Math.max(0, highest); row <= Math.min(room.height - 1, lowest); row++) {
    const index = row * room.width + col
    const tile = body.layer2Ground ? tiles[index] : (world.state.tileChanges[room.id]?.[index] ?? tiles[index])
    const profile = slopeProfile(world, room, tile)
    if (profile === null) continue
    const height = slopeSample(world, profile, center)
    if (height < 0) continue
    const depth = row * 16 + height - feet
    // The steepest ROM floor rises two pixels per horizontal pixel.
    if (depth >= -1 && depth <= body.width) return profile
  }
  return null
}
