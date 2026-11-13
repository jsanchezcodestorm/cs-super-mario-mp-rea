import { changeTile, tileAt } from './terrain.ts'
import { collectCoin } from './resources.ts'
import { emit, spawnEntity } from './state.ts'
import { yoshiTongueTip } from './yoshi-geometry.ts'
import type { BerryTile, PlayerState, Point, World } from './types.ts'

/** E1 01:F0D3. Both colors count per rider in a shared room. */
export function swallowBerry(world: World, p: PlayerState, tile: BerryTile) {
  collectCoin(world, p)
  emit(world, 'swallow', p)
  if (tile === 0x47) {
    world.state.timeLeft += 20
    return
  }
  const counts = p.berries ??= { red: 0, pink: 0 }
  const color = tile === 0x45 ? 'red' : 'pink'
  if (++counts[color] < (color === 'red' ? 10 : 2)) return
  counts[color] = 0
  p.berryEgg = { spriteId: color === 'red' ? 0x74 : 0x6a, tick: world.state.tick }
}

function berryAt(world: World, p: PlayerState, point: Point) {
  const room = world.campaign.levels[p.roomId]
  const col = Math.floor(point.x / 16), row = Math.floor(point.y / 16)
  const tile = tileAt(world, room, col, row)
  if (tile !== 0x45 && tile !== 0x46 && tile !== 0x47) return null
  if (Object.values(world.state.players).some(other => {
    const bite = other.berryBite
    return bite?.roomId === room.id && bite.col === col && bite.row === row
  })) return null
  return { roomId: room.id, col, row, tile: tile as BerryTile, tick: world.state.tick }
}

export function stepBerries(world: World, p: PlayerState, input: number) {
  if (!p.mounted || p.status !== 'alive') {
    delete p.berryBite
    delete p.berryEgg
    return
  }
  const tick = world.state.tick, room = world.campaign.levels[p.roomId]
  if (p.berryEgg && tick - p.berryEgg.tick >= 36) { // 30 PAL frames after the gulp
    const egg = spawnEntity(world, p.roomId, {
      x: p.x + p.width / 2 - 8 - p.facing * 4, y: p.y + p.height - 24, spriteId: 0x2c,
    })!
    egg.eggPrize = p.berryEgg.spriteId
    egg.vx = -p.facing * 5 / 6
    egg.vy = -5 / 6
    delete p.berryEgg
  }
  const bite = p.berryBite
  if (bite) {
    if (bite.roomId === room.id && tick - bite.tick < Math.ceil(6 * 6 / 5)) return
    delete p.berryBite
    if (bite.roomId === room.id && tileAt(world, room, bite.col, bite.row) === bite.tile) {
      changeTile(world, room, bite.col, bite.row, 0x49)
      swallowBerry(world, p, bite.tile)
    }
    return
  }
  if (p.mouth) return
  const nose = { x: p.x + p.width / 2 + p.facing * 14, y: p.y + p.height - 24 }
  const touching = berryAt(world, p, nose)
  if (touching) {
    p.berryBite = touching
    p.tongue = p.tongueFrame = 0
    return
  }
  if (p.tongueFrame < 9) return
  const berry = berryAt(world, p, yoshiTongueTip(p, input))
  if (berry) {
    changeTile(world, room, berry.col, berry.row, 0x49)
    p.mouth = { kind: 'berry', berry: berry.tile, spriteId: 0x74, ticks: 0, caughtFrame: p.tongueFrame }
  }
}
