import { activePlayerIds, Buttons } from './types.ts'
import type { CampaignDefinition, InputFrame, OverworldCommand, OverworldStop, World } from './types.ts'

const movement = ['left', 'right', 'up', 'down'] as const
const commands: OverworldCommand[] = [...movement, 'action']

/** A pipe, star or junction can be used when its path leads to an unlocked course. */
function leadsToCourse(c: CampaignDefinition, unlocked: string[], from: string, to: string) {
  const paths = c.overworldPaths
  if (!paths) return false
  const seen = new Set([from])
  const pending = [to]
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i]
    if (seen.has(id)) continue
    seen.add(id)
    if (unlocked.includes(id)) return true
    if (Object.hasOwn(c.routes, id)) continue
    const stop = paths[id]
    if (stop) for (const hop of Object.values(stop.directions)) pending.push(hop.to)
  }
  return false
}

export function overworldTarget(c: CampaignDefinition, unlocked: string[], from: string, button: number) {
  const command = commands.find((key) => Buttons[key] === button)
  const edge = command && c.overworldPaths?.[from]?.directions[command]
  return edge && leadsToCourse(c, unlocked, from, edge.to) ? edge.to : undefined
}

function travel(world: World, from: string, command: OverworldCommand) {
  const { state, campaign } = world
  const edge = campaign.overworldPaths?.[from]?.directions[command]
  if (!edge || !leadsToCourse(campaign, state.progress.unlocked, from, edge.to)) return false
  // Commit the selected course before its walking animation so a save taken
  // on the exit event resumes at the newly reached course.
  const selected = state.progress.unlocked.indexOf(edge.to)
  if (selected >= 0) {
    state.progress.selection = selected
    delete state.mapStop
  }
  state.mapTravel = { from, to: edge.to, command, elapsed: 0, duration: Math.ceil(edge.frames * 60 / 50) }
  return true
}

export function beginOverworldTravel(world: World, from: string, next: string, kind: 'normal' | 'secret') {
  const stop = world.campaign.overworldPaths?.[from]
  if (!stop || next === from) return false
  const direct = movement.find((command) => stop.directions[command]?.to === next)
  return travel(world, from, direct ?? stop.exitDirections[kind])
}

export function navigateOverworld(world: World, inputs: InputFrame) {
  const { state } = world
  const progress = state.progress
  const trip = state.mapTravel
  if (trip) {
    if (++trip.elapsed >= trip.duration) {
      const index = progress.unlocked.indexOf(trip.to)
      if (index === -1) state.mapStop = trip.to
      else {
        progress.selection = index
        delete state.mapStop
      }
      delete state.mapTravel
    }
    return null
  }
  const from = state.mapStop ?? progress.unlocked[progress.selection]
  if (!from) return null
  for (const id of activePlayerIds(state)) {
    for (const command of movement)
      if (inputs[id] & Buttons[command] && travel(world, from, command)) return null
    const pressed = inputs[id] & ~state.players[id].lastInput
    if (!(pressed & (Buttons.jump | Buttons.action | Buttons.spin))) continue
    if (!state.mapStop) return from
    if (travel(world, from, 'action')) return null
  }
  return null
}

/** Captured positions use global map coordinates even on the six submaps. */
export function mapPosition([region, x, y]: OverworldStop['position']) {
  const originY = [0, 0, 160, 336, 0, 160, 336]
  return { region, x: x - (region >= 4 ? 256 : 0), y: y - originY[region] }
}
