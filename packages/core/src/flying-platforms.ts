import type { EntityState, World } from './types.ts'

/** E1 Load3Platforms and Banzai_Rotating use a nine-bit angle and a 48-pixel arm. */
export const chainPhases = [0, 0xaa, 0x154] as const
export function positionChainDeck(e: EntityState) {
  const step = e.origin.x & 16 ? 2 : -2
  const angle = ((e.chainPhase ?? 0) + step * e.age) * Math.PI / 256
  e.x = e.origin.x - 16 + Math.round(48 * Math.sin(angle))
  e.y = e.origin.y + Math.round(48 * Math.cos(angle))
}

/** Both Forest Secret Area decks start when either deck first has a rider.
 * FlyingTurnBlocks uses $08 fixed-point horizontal speed and opposite vertical phases. */
export function stepForestDeck(world: World, e: EntityState) {
  if (e.platformStarted === undefined) {
    if (!e.owner) return
    for (const deck of world.state.entities)
      if (deck.roomId === e.roomId && deck.spriteId === 0xc1) deck.platformStarted = world.state.tick
  }
  const elapsed = world.state.tick - e.platformStarted! + 1
  const phase = elapsed % 512
  const wave = phase <= 256 ? phase : 512 - phase
  e.x = e.origin.x + elapsed / 2
  e.y = e.origin.y + (e.origin.x & 16 ? 1 : -1) * wave / 2
}

/** E1 FlyingPlatformMain. Acceleration updates every other frame and
 * reverses at signed speed $20. Position uses sixteenths of a pixel. */
export function stepHammerDeck(world: World, e: EntityState) {
  const step = Math.floor(e.age / 2)
  const speed = (phase: number, peak: number) => {
    const t = phase % (4 * peak)
    return t <= peak ? t : t < 3 * peak ? 2 * peak - t : t - 4 * peak
  }
  e.vx = speed(step, 32) / 16
  e.vy = speed(step, 16) / 8
  e.x += e.vx
  e.y += e.vy
  const rider = hammerRider(world, e)
  if (rider) {
    rider.x = e.x
    rider.y = e.y - 16
  }
}

export function hammerRider(world: World, deck: EntityState) {
  return world.state.entities.find(other =>
    other.active && other.spriteId === 0x9b && other.roomId === deck.roomId &&
    other.origin.x === deck.origin.x && other.origin.y === deck.origin.y)
}
