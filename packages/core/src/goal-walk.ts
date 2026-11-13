import { activePlayerIds, Buttons, type PlayerId, type PlayerState, type World } from './types.ts'
import { playerViewport } from './autoscroll.ts'
import type { GoalCoins } from './goal-coins.ts'
import { resumeBonus, type BonusGame } from './bonus-game.ts'
import { palFrame } from './pal-time.ts'
import { moveBody } from './terrain.ts'
import { stepPlayerAnimation } from './player-animation.ts'
import { duckPlayer } from './player-size.ts'

export interface GoalAward { scoreBefore: number; stars: number; coins?: GoalCoins }
export interface GoalWalk extends GoalAward {
  tick: number
  roomId: string
  finisher: PlayerId
  mounted: boolean
  bonus?: BonusGame
}

export function beginGoalWalk(world: World, finisher: PlayerState, award: GoalAward) {
  const state = world.state
  if (state.phase !== 'map' || state.cutscene || state.bonus) return
  state.goalWalk = { tick: state.tick, roomId: finisher.roomId, finisher: finisher.id, mounted: finisher.mounted, ...award }
  for (const id of activePlayerIds(state)) {
    const p = state.players[id]
    if (p.status !== 'alive' || p.roomId !== finisher.roomId) continue
    p.facing = 1
    p.spin = false
    p.flight = p.balloon = p.star = 0
    p.runTicks = 0
    p.tongueFrame = p.tongue = 0
    duckPlayer(world, p, false, false)
    delete p.sliding
    delete p.pipeExit
    delete p.wallRun
    delete p.ropeId
    delete p.ropeReleased
    delete p.netClinging
    delete p.vineClinging
    delete p.netTurn
    delete p.netPunchTick
    delete p.behindNet
    delete p.animation
  }
}

export function goalWalkFrame(walk: GoalWalk, tick: number) {
  const age = palFrame(tick) - palFrame(walk.tick)
  const saluteAt = walk.mounted ? 359 : 358
  const irisAt = saluteAt + 110
  const elapsed = Math.max(0, age - irisAt + 1)
  // SpotlightSize falls by four per update. The PAL walk holds four early
  // updates on foot and alternates frames longer while still riding Yoshi.
  const holds = walk.mounted ? Math.min(walk.finisher === 'luigi' ? 20 : 19, elapsed >> 1) :
    Math.min(4, Math.floor(elapsed / 5))
  const iris = age < irisAt ? undefined : Math.max(0, 240 - 4 * (elapsed - holds))
  return { age, saluteAt, salute: age >= saluteAt && age < irisAt, iris, irisAt, finished: elapsed - holds > 60 }
}

/** The tape already awarded the exit. Only the displayed riders move while the map is active. */
export function advanceGoalWalk(world: World) {
  const { state } = world, walk = state.goalWalk
  if (!walk) return
  const phase = goalWalkFrame(walk, state.tick)
  if (phase.finished) {
    delete state.goalWalk
    if (walk.bonus) resumeBonus(world, walk.bonus)
    return
  }
  const room = world.campaign.levels[walk.roomId]
  for (const id of activePlayerIds(state)) {
    const p = state.players[id]
    if (p.status !== 'alive' || p.roomId !== room.id) continue
    // E1 forces X speed $05 until the end timer falls below $50. After the
    // salute it releases the walk during the closing iris.
    const tail = phase.age - phase.irisAt
    const speed = tail >= 0 ? Math.min(25, 1 + tail * 2) : Math.max(0, Math.min(5, 357 - phase.age))
    p.vx = speed / 16 * 5 / 6
    p.vy = Math.min(4, p.vy + 0.375)
    moveBody(world, room, p)
    const carried = p.carrying && state.entities.find(e => e.id === p.carrying)
    if (carried) {
      carried.x = p.x + p.width
      carried.y = p.y + (p.height - carried.height) / 2
    }
    stepPlayerAnimation(p, state.tick, Buttons.right, 0, false)
  }
  if (walk.coins && phase.age >= 55 && walk.coins.popupCamera === undefined)
    walk.coins.popupCamera = playerViewport(room, state.players[walk.finisher]).x

}
