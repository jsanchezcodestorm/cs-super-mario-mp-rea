import { activePlayerIds, Buttons } from './types.ts'
import type { CampaignDefinition, InputFrame, OverworldCommand, OverworldStop, PlayerId, World } from './types.ts'

const movement = ['left', 'right', 'up', 'down'] as const
const commands: OverworldCommand[] = [...movement, 'action']
const directions = Buttons.left | Buttons.right | Buttons.up | Buttons.down
const enter = Buttons.jump | Buttons.action | Buttons.spin

export function resetMapPlayers(state: World['state'], stop: string) {
  state.mapPlayers = Object.fromEntries(activePlayerIds(state).map((id) => [id, { stop }]))
  delete state.mapRequest
  delete state.mapReply
}

export function finishMapTransition(state: World['state'], inputs: InputFrame) {
  if (state.mapReveal) state.mapReveal.start = state.tick
  const held = Object.fromEntries(activePlayerIds(state).map((id) => [id, (inputs[id] ?? 0) & directions]))
  if (Object.values(held).some(Boolean)) state.heldAtExit = held
}

function freshMapCommand(state: World['state'], inputs: InputFrame) {
  const mask = directions | enter
  return activePlayerIds(state).some(id => inputs[id] & ~state.players[id].lastInput & mask)
}

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

function travel(world: World, playerId: PlayerId, from: string, command: OverworldCommand) {
  const { state, campaign } = world
  const actor = state.mapPlayers[playerId]
  if (actor.travel) return false
  const edge = campaign.overworldPaths?.[from]?.directions[command]
  if (!edge || !leadsToCourse(campaign, state.progress.unlocked, from, edge.to)) return false
  actor.travel = { from, to: edge.to, command, elapsed: 0, duration: Math.ceil(edge.frames * 60 / 50) }
  const selected = state.progress.unlocked.indexOf(edge.to)
  if (selected >= 0) state.progress.selection = selected
  return true
}

export function beginOverworldTravel(world: World, from: string, next: string, kind: 'normal' | 'secret') {
  const stop = world.campaign.overworldPaths?.[from]
  if (!stop || next === from) return false
  const direct = movement.find((command) => stop.directions[command]?.to === next)
  const command = direct ?? stop.exitDirections[kind]
  let started = false
  for (const playerId of activePlayerIds(world.state)) {
    const actor = world.state.mapPlayers[playerId]
    actor.stop = from
    delete actor.travel
    delete actor.arrival
    started = travel(world, playerId, from, command) || started
  }
  return started
}

function advanceTravel(world: World, playerId: PlayerId) {
  const { state } = world
  const actor = state.mapPlayers[playerId]
  const trip = actor.travel
  if (!trip || ++trip.elapsed < trip.duration) return
  const previous = actor.arrival && { from: actor.arrival.from, command: actor.arrival.command, departed: actor.arrival.departed }
  actor.stop = trip.to
  actor.arrival = { from: trip.from, command: trip.command, departed: state.tick - trip.elapsed, previous }
  delete actor.travel
  const index = state.progress.unlocked.indexOf(actor.stop)
  if (index >= 0) state.progress.selection = index
}

function requestedCourse(world: World, playerId: PlayerId, from: string) {
  const { state } = world
  const index = state.progress.unlocked.indexOf(from)
  if (index < 0) return undefined
  state.progress.selection = index
  if (activePlayerIds(state).length === 1) return from
  state.mapRequest = { course: from, requester: playerId, confirmed: [playerId] }
  delete state.mapReply
  return undefined
}

function answerRequest(world: World, inputs: InputFrame): string | null | undefined {
  const { state } = world
  const request = state.mapRequest
  if (!request) return undefined
  for (const id of activePlayerIds(state)) {
    if (id === request.requester) continue
    const pressed = (inputs[id] ?? 0) & ~state.players[id].lastInput
    if (pressed & Buttons.run) {
      state.mapReply = { course: request.course, player: id, tick: state.tick }
      delete state.mapRequest
      return null
    }
    if (pressed & enter && !request.confirmed.includes(id)) request.confirmed.push(id)
  }
  if (request.confirmed.length === activePlayerIds(state).length) {
    delete state.mapRequest
    delete state.mapReply
    return request.course
  }
  const requesterPressed = (inputs[request.requester] ?? 0) & ~state.players[request.requester].lastInput
  if (requesterPressed & enter) delete state.mapRequest
  return null
}

export function navigateOverworld(world: World, inputs: InputFrame) {
  const { state } = world
  const held = state.heldAtExit
  if (held) {
    for (const id of activePlayerIds(state)) held[id] = (held[id] ?? 0) & (inputs[id] ?? 0)
    if (!Object.values(held).some(Boolean)) delete state.heldAtExit
  }
  if (state.mapReply && state.tick - state.mapReply.tick > 120) delete state.mapReply
  if (state.mapReveal) {
    // A reveal is cosmetic. The first fresh navigation input returns the view
    // immediately to the authoritative positions, even during an automatic walk.
    if (freshMapCommand(state, inputs)) delete state.mapReveal
    else if (!state.goalWalk && !state.keyholeFinish) state.mapReveal.start ??= state.tick
  }

  for (const playerId of activePlayerIds(state)) advanceTravel(world, playerId)
  const answer = answerRequest(world, inputs)
  if (answer !== undefined) return answer ?? null
  if (state.mapRequest) return null

  for (const playerId of activePlayerIds(state)) {
    const actor = state.mapPlayers[playerId]
    if (actor.travel) continue
    for (const command of movement) {
      const button = Buttons[command]
      if ((inputs[playerId] ?? 0) & ~(held?.[playerId] ?? 0) & button && travel(world, playerId, actor.stop, command)) break
    }
    if (actor.travel) continue
    const pressed = (inputs[playerId] ?? 0) & ~state.players[playerId].lastInput
    if (!(pressed & enter)) continue
    if (state.progress.unlocked.includes(actor.stop)) {
      const course = requestedCourse(world, playerId, actor.stop)
      if (course) return course
      if (state.mapRequest) return null
    } else {
      travel(world, playerId, actor.stop, 'action')
    }
  }
  return null
}

/** Captured positions use global map coordinates even on the six submaps. */
export function mapPosition([region, x, y]: OverworldStop['position']) {
  const originY = [0, 0, 160, 336, 0, 160, 336]
  return { region, x: x - (region >= 4 ? 256 : 0), y: y - originY[region] }
}
