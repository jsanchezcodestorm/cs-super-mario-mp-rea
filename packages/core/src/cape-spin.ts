import type { PlayerState, World, LevelDefinition } from './types.ts'
import { bump } from './blocks.ts'
import { strike, weaponTargets } from './entity-contact.ts'
import { overlaps, tileAt } from './terrain.ts'

export function spinCape(world: World, room: LevelDefinition, player: PlayerState) {
  if ((player.capeReady ?? 0) > world.state.tick || player.flight || player.carrying) return
  player.capeReady = world.state.tick + 12
  const y = player.y + player.height - 12
  const row = Math.floor(y / 16)
  // A grounded cape swings to either side (E1 00:D034 and 02:950B).
  for (const dx of [-12, 12]) {
    const col = Math.floor((player.x + 6 + dx) / 16)
    const tile = tileAt(world, room, col, row)
    bump(world, player, room, { col, row, tile }, false)
  }
  const sweep = { x: player.x - 12, y: y - 8, width: player.width + 24, height: 16 }
  for (const e of world.state.entities) {
    if (!e.active || e.roomId !== room.id || !overlaps(sweep, e)) continue
    if (weaponTargets.has(e.kind) && world.campaign.capeTargets?.includes(e.spriteId) && e.kind !== 'boss' && e.kind !== 'endingBoss') {
      strike(world, e, player)
    }
  }
}
