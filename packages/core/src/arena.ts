import type { LevelDefinition, Point, World, PlayerState } from './types.ts'

export function isTiltingArena(id: string) {
  return id === '1f6' || id === '1eb'
}
export function arenaEntry(room: LevelDefinition): Point {
  if (isTiltingArena(room.id)) return { x: 80, y: 64 }
  return { x: 32, y: room.id === '1c7' ? 176 : 144 }
}
export function prepareArena(world: World, room: LevelDefinition) {
  const tiles = (world.state.tileChanges[room.id] ??= {})
  const tilting = isTiltingArena(room.id)
  const floor = room.id === '1c7' ? 13 : 11
  for (let x = 0; x < room.width; x++) {
    if (!tilting) tiles[floor * room.width + x] = 0x132
    if (room.id !== '1c7') tiles[(tilting ? 12 : 14) * room.width + x] = 0x5
  }
}
/** Platform hit-test is shared by both players, using world rather than camera coordinates. */
export function tiltFloor(tick: number, x: number) {
  return 141 + Math.sin((tick * Math.PI) / 230) * (x - 128) * 0.35
}
export function standOnTilt(world: World, p: PlayerState, previousBottom: number) {
  if (!isTiltingArena(p.roomId) || p.vy < 0) return
  const center = p.x + p.width / 2
  if (center < 41 || center > 215) return
  const floor = tiltFloor(world.state.tick, center)
  if (previousBottom <= floor + 2 && p.y + p.height >= floor - 1) {
    p.y = floor - p.height
    p.vy = 0
    p.grounded = true
  }
}
