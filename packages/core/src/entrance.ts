import { activePlayerIds, Buttons } from './types.ts'
import type { InputFrame, World, PlayerState } from './types.ts'
import { enterRoom } from './state.ts'
import { stepPlayer } from './player.ts'

function scriptedButtons(frame: number, commands: number[][]) {
  for (const [buttons, duration] of commands) {
    if (frame < duration) {
      return (
        (buttons & 1 ? Buttons.right : 0) |
        (buttons & 8 ? Buttons.up : 0) |
        (buttons & 32 ? Buttons.spin : 0) |
        (buttons & 64 ? Buttons.action : 0) |
        (buttons & 128 ? Buttons.jump : 0)
      )
    }
    frame -= duration
  }
  return null
}
function finishEntry(world: World, p: PlayerState) {
  p.mouth = null
  p.tongue = 0
  p.tongueFrame = 0
  p.mounted = false
  enterRoom(world, p, world.state.progress.course)
}
export function stepEntrance(world: World, inputs: InputFrame) {
  const { state, campaign } = world,
    entry = state.entrance
  if (!entry || !campaign.entranceInputs) return
  const participants = activePlayerIds(state)
  const skip = participants.some(
    (id) => inputs[id] & ~state.players[id].lastInput & (Buttons.jump | Buttons.spin),
  )
  let finished = true
  for (const id of participants) {
    const p = state.players[id]
    if (p.status !== 'alive' || p.roomId === state.progress.course) continue
    const script = entry.mounted[id] ? campaign.entranceInputs.mounted : campaign.entranceInputs.onFoot
    const buttons = scriptedButtons(entry.frame, script)
    if (skip || buttons === null) {
      finishEntry(world, p)
      continue
    }
    finished = false
    const previousInput = p.lastInput
    p.lastInput = scriptedButtons(entry.frame - 1, script) ?? 0
    stepPlayer(world, p, buttons)
    p.lastInput = previousInput
  }
  entry.frame++
  if (finished) state.entrance = null
}
