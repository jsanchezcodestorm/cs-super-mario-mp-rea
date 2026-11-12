import { spawnEntity } from './state.ts'
import type { EntityState, LevelDefinition, World } from './types.ts'

export function isPipeBoss(e: EntityState) {
  return e.spriteId === 0x29 && (e.origin.y === 80 || e.origin.y === 96)
}

/** The sprite's encoded Y selects Lemmy or Wendy. Actual positions are the
 * seven pipe mouths, as in the bank 03 boss routine. The two doubles emerge
 * from different pipes on the same cycle as the Koopaling. */
export function movePipeBoss(world: World, room: LevelDefinition, e: EntityState) {
  if (!isPipeBoss(e)) return false
  if (e.age === 1 && e.kind === 'boss') {
    for (const offset of [2, 4]) {
      const dummy = spawnEntity(world, room.id, { ...e.origin, spriteId: e.spriteId }, 'pipeDecoy')!
      dummy.pipeOffset = offset
      dummy.age = 1
    }
  }
  const frame = Math.floor(e.age * 50 / 60)
  const cycle = Math.floor(frame / 300)
  const clock = frame % 300
  const col = 1 + 2 * ((5 + cycle * 3 + (e.pipeOffset ?? 0)) % 7)
  let row = 0
  while (row < room.height && room.tiles[row * room.width + col] !== 0x133) row++
  const visible = Math.max(0, Math.min(32, (clock - 120) * 0.5, (285 - clock) * 0.5))
  e.width = 24
  e.height = visible
  e.x = col * 16 + 4
  e.y = row * 16 - visible
  return true
}
