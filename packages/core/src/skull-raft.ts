import type { EntityState, World, LevelDefinition } from './types.ts'
import { moveBody } from './terrain.ts'

/** The four skulls follow the lava's tile profile independently (02:ED8A).
 * A rider sets the whole raft's horizontal speed to 12 sixteenths per frame. */
export function moveSkull(world: World, room: LevelDefinition, skull: EntityState) {
  if (skull.owner && !skull.platformStarted) {
    for (const member of world.state.entities)
      if (member.roomId === skull.roomId && member.raftX === skull.raftX) member.platformStarted = world.state.tick
  }
  // $0C sixteenths per PAL video frame; the web simulation runs at 60 Hz.
  const frame = Math.floor(skull.age * 5 / 6)
  const previous = Math.floor((skull.age - 1) * 5 / 6)
  skull.vx = skull.platformStarted === undefined ? 0 : 0.75 * (frame - previous)
  skull.vy = Math.min(2, skull.vy + 0.1875)
  moveBody(world, room, skull)
}
