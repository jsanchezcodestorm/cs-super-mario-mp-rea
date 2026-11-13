import { palFrame } from './pal-time.ts'
import { addScore } from './rewards.ts'
import { emit } from './state.ts'
import { AIR, TILE, changeTile, clipDisplacement, isSolid, tileAt, type Contact } from './terrain.ts'
import { slopeHeight } from './slopes.ts'
import type { GameState, LevelDefinition, PlayerState, World } from './types.ts'

export function recordShatter(state: GameState, roomId: string, x: number, y: number) {
  const effects = state.shatteredBlocks ??= []
  const active = effects.filter(effect => effect.roomId === roomId)
  // Each block allocates four of the twelve minor extended sprite slots.
  let firstSlot = 8
  while (firstSlot >= 0 && active.some(effect => effect.firstSlot === firstSlot)) firstSlot -= 4
  if (firstSlot < 0) {
    const oldest = active[0]
    firstSlot = oldest.firstSlot
    effects.splice(effects.indexOf(oldest), 1)
  }
  effects.push({ roomId, x, y, tick: state.tick, firstSlot })
}

export function expireShatters(state: GameState) {
  if (!state.shatteredBlocks?.length) return
  const now = palFrame(state.tick)
  state.shatteredBlocks = state.shatteredBlocks.filter(effect => now - palFrame(effect.tick) < 100)
}

/** E1 selects one supporting foot, even when a spin straddles two turn blocks. */
export function shatterOnLanding(world: World, room: LevelDefinition, p: PlayerState, contacts: Contact[], intendedFeet: number) {
  if (!p.spin || p.form === 'small' || !p.grounded || p.layer2Ground) return
  const feet = p.y + p.height
  if (!contacts.some(c => !c.layer2 && c.side === 'bottom' && c.row * TILE === feet)) return
  const row = feet / TILE
  const center = Math.floor(p.x + p.width / 2)
  const inset = (center & 8) ? -3 : 3
  for (const x of [center + inset, center - inset]) {
    const col = Math.floor(x / TILE)
    const tile = tileAt(world, room, col, row)
    if (tile === 0x11e) {
      changeTile(world, room, col, row, AIR)
      addScore(p, 50)
      // The removed tile no longer arrests the last fraction of the fall.
      // A second block under the other foot can still stop that displacement.
      p.y = clipDisplacement(world, room, p, 'y', Math.max(0, intendedFeet - feet))
      p.grounded = false
      recordShatter(world.state, room.id, col * TILE, row * TILE)
      emit(world, 'shatter', p)
      return true
    }
    if (isSolid(tile) || (tile >= 0x100 && tile < 0x111) || slopeHeight(world, room, tile, x & 15) === 0) return
  }
}
