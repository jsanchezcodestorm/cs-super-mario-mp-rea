import { playerViewport } from './autoscroll.ts'
import { makeCeiling, moveCeiling } from './boo-ceiling.ts'
import { palFrame } from './pal-time.ts'
import type { LevelDefinition, PlayerState, Point, World } from './types.ts'

export interface BooGroup {
  type: number
  x: number
  y: number
  age: number
  baseSlot: number
  ceiling?: ReturnType<typeof makeCeiling>
  fogAnchor?: Point
  stopping?: boolean
  stopped?: boolean
}

const markers = new WeakMap<LevelDefinition, LevelDefinition['sprites']>()
export function stepBooGroups(world: World, room: LevelDefinition, players: PlayerState[]) {
  let spawns = markers.get(room)
  if (!spawns) {
    spawns = room.sprites.filter(s => [0xe1, 0xe2, 0xe3, 0xe5, 0xd2].includes(s.spriteId))
    markers.set(room, spawns)
  }
  if (!spawns.some(s => s.spriteId >= 0xe1)) return
  const state = world.state, frame = palFrame(state.tick)
  if (frame === palFrame(state.tick-1)) return
  const views = players.map(p => playerViewport(room, p))
  const rooms = state.booGroups ??= {}, groups = rooms[room.id] ??= []
  for (const s of spawns) {
    if (s.spriteId === 0xd2) continue
    const ring = s.spriteId === 0xe2 || s.spriteId === 0xe3
    const index = groups.findIndex(g => g.x === s.x && g.y === s.y && g.type === s.spriteId)
    const view = views.find(v => s.x >= v.x - (index >= 0 ? 128 : 48) && s.x < v.x + (index >= 0 ? 384 : 304))
    if (ring && !view && index >= 0) { groups.splice(index, 1); continue }
    if (index >= 0 || !view) continue
    // $1892 offers twenty cluster slots. A fog bank gives way to the rings
    // after the D2 marker. Independent rings use the two halves of OAM.
    if (groups.some(g => g.type === 0xe5 && !g.stopped)) continue
    const baseSlot = groups.some(g => g.baseSlot === 10 && !g.stopped) ? 0 : 10
    groups.push({ type: s.spriteId, x: s.x, y: s.y, age: 0, baseSlot,
      ...(s.spriteId === 0xe1 ? { ceiling: makeCeiling(view, state.spriteSeed ?? 0) } : {}),
      ...(s.spriteId === 0xe5 ? { fogAnchor: { ...view } } : {}) })
  }
  for (const group of groups) {
    if (group.stopped) continue
    group.age++
    if (group.ceiling) moveCeiling(group.ceiling, players, frame, views[0])
    if (!group.fogAnchor) continue
    // D2 stops the fog permanently on the next native 256-frame boundary.
    if (spawns.some(s => s.spriteId === 0xd2 && views.some(v => v.x - 48 <= s.x && v.x + 304 > s.x))) group.stopping = true
    if (group.age > 1 && (group.age & 255) === 1) {
      if (group.stopping) group.stopped = true
      else group.fogAnchor = { ...views[0] }
    }
  }
}
