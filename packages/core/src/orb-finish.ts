import { palFrame } from './pal-time.ts'
import { addScore } from './rewards.ts'
import type { BonusGame } from './bonus-game.ts'
import type { PlayerId, PlayerState, World } from './types.ts'

export interface OrbFinish {
  tick: number
  roomId: string
  finisher: PlayerId
  scoreBefore: number
  bonus?: BonusGame
}

export function beginOrbFinish(world: World, player: PlayerState) {
  world.state.orbFinish = {
    tick: world.state.tick, roomId: player.roomId, finisher: player.id, scoreBefore: player.score,
  }
  addScore(player, world.state.timeLeft * 50)
}

/** Sunken Ghost Ship freezes on the sphere and fades through game mode $0B. */
export function orbFinishFrame(orb: OrbFinish, tick: number) {
  const age = palFrame(tick) - palFrame(orb.tick)
  const brightness = Math.min(15, Math.max(0, 15 - Math.floor((age - 352) / 2)))
  return { age, brightness, finished: age >= 382 }
}
