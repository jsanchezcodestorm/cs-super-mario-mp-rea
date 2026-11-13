import { isNetTile } from './climb-contacts.ts'
import { palFrame } from './pal-time.ts'
import { isSolid, tileAt } from './terrain.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

export interface NetKoopa {
  behind: boolean
  turn: number
  phase: number
  punched?: 'hit' | 'falling'
}

export function isNetKoopaTurning(net: NetKoopa) {
  return net.turn >= 0x30 && net.turn < 0x40
}

/** E1 ClimbingKoopa ($01:B986) and HandleSpriteDeath ($01:9B1F). */
export function netKoopaPose(e: EntityState) {
  // A level snapshot can precede the first simulation frame for this slot.
  if (!e.netKoopa) return e.origin.x & 16 ? 0 : 2
  const { behind, phase, turn, punched } = e.netKoopa
  if (punched === 'falling')
    return 20 + (behind ? 2 : 0) + Number(e.vx > 0)
  if (isNetKoopaTurning(e.netKoopa)) {
    return 4 + (e.spriteId < 0x24 ? 8 : 0) + (behind ? 4 : 0) + (turn >= 0x38 ? 2 : 0) + Number(e.facing === 1)
  }
  return (behind ? 2 : 0) + ((phase >> 3) & 1)
}

/** Sprite clipping profile 01 from E1 bank 03. */
export function netKoopaBox(e: EntityState) {
  return { x: e.x + 2, y: e.y + 3, width: 12, height: 21 }
}

function reverse(e: EntityState) {
  e.vx = -e.vx
  e.vy = -e.vy
}

export function moveNetKoopa(world: World, room: LevelDefinition, e: EntityState, player: PlayerState) {
  const vertical = e.spriteId < 0x24
  if (!e.netKoopa) {
    e.netKoopa = { phase: 0, behind: !(e.origin.x & 16), turn: 0 }
    const speed = e.spriteId & 1 ? 1 : 0.5
    e.vx = vertical ? speed / 8 : (player.x < e.x ? -speed : speed)
    e.vy = vertical ? -speed : 0
    e.facing = e.vx < 0 ? -1 : 1
  }
  const net = e.netKoopa
  if (palFrame(world.state.tick) === palFrame(world.state.tick - 1)) return
  if (net.turn) net.turn--
  if (isNetKoopaTurning(net)) return
  if (net.turn === 0x40) {
    net.behind = !net.behind
    reverse(e)
  } else if (!net.turn) {
    const read = (x: number, y: number) => tileAt(world, room, Math.floor(x / 16), Math.floor(y / 16))
    // Sprite object clipping #03: sides (+14/+2,+16), top (+8,+11), bottom (+8,+32).
    const side = read(e.x + (e.vx < 0 ? 2 : 14), e.y + 16)
    const end = read(e.x + 8, e.y + (e.vy < 0 ? 11 : 32))
    if (isSolid(vertical ? end : side) || (vertical && e.vy > 0 && !isNetTile(end))) reverse(e)
    else if (!isNetTile(vertical && e.vy < 0 ? end : side)) net.turn = 0x50
  }
  net.phase = (net.phase + 1) & 255
  e.facing = e.vx < 0 ? -1 : 1
  if (vertical) e.y += e.vy
  else e.x += e.vx
}
