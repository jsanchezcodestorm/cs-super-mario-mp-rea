import { palFrame } from './pal-time.ts'
import { nextSpriteRandom } from './sprite-random.ts'
import { isSolid, moveBody, tileAt } from './terrain.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

export interface KoopaMotion {
  phase: number
  turn: number
}

const guardsLedges = (id: number) => id === 1 || id === 2 || id === 5 || id === 6

function face(e: EntityState, direction: -1 | 1) {
  if (direction === e.facing) return
  e.koopa!.turn = 8
  e.facing = direction
}

// Only the centre foot tells a red/blue Koopa it has stepped off a platform.
// The ordinary body collider can still have one toe on this row.
function leftPlatform(world: World, room: LevelDefinition, e: EntityState) {
  const offset = e.layer2Ground ? world.state.layerOffsets[room.id] : undefined
  const x = Math.floor(e.x + e.width / 2 - (offset?.x ?? 0)), y = e.y + e.height - (offset?.y ?? 0)
  if (y % 16) return false
  const row = Math.floor(y / 16), col = x >> 4
  const tile = e.layer2Ground && room.layer2 ? room.layer2[row * room.width + col] : tileAt(world, room, col, row)
  return !isSolid(tile) && !(tile >= 0x100 && tile < 0x1d8)
}

export function moveKoopa(world: World, room: LevelDefinition, e: EntityState, player: PlayerState) {
  const id = e.spriteId, target = player.x < e.x ? -1 : 1
  if (!e.koopa) {
    const phase = nextSpriteRandom(world.state)
    e.koopa = { phase, turn: 0 }
    e.facing = id === 0xbd ? -1 : target
  }
  const k = e.koopa, frame = palFrame(world.state.tick)
  const newFrame = frame !== palFrame(world.state.tick - 1)
  if (newFrame && k.turn) k.turn--

  if (e.kind === 'flyer') {
    const previous = e.x
    // Keep the co-op patrol period while deriving facing from its actual travel.
    const x = Math.sin((e.age * Math.PI * 2) / 200) * 34
    e.x = e.origin.x + x
    const previousY = e.y
    e.y = e.origin.y + Math.sin((e.age * Math.PI * 2) / 105) * 16
    e.vx = e.x - previous
    e.vy = e.y - previousY
    if (e.vx) face(e, e.vx < 0 ? -1 : 1)
  } else {
    const walk = e.kind === 'jumper' ? 0.8 : 0.6
    e.vx = e.facing! * walk
    e.vy = Math.min(4, e.vy + 0.23)
    const wasGrounded = e.grounded
    const contacts = moveBody(world, room, e)
    const wall = contacts.some(c => c.side === 'left' || c.side === 'right') || e.x <= 0 || e.x >= room.width * 16 - e.width
    if (wall || (!k.turn && guardsLedges(id) && wasGrounded && (!e.grounded || leftPlatform(world, room, e)))) {
      face(e, e.facing === -1 ? 1 : -1)
      e.vx = e.facing! * walk
    } else if (newFrame && (id === 3 || id === 7) && e.grounded && (k.phase & 127) === 127) {
      face(e, target)
    }
    if (e.kind === 'jumper' && e.grounded) e.vy = -3.6
  }
  if (e.y > room.height * 16 + 96) e.active = false
  if (newFrame) {
    if (e.kind === 'flyer' || e.kind === 'jumper' || e.grounded) k.phase = (k.phase + 1) & 255
    else k.phase = 0
  }
}
