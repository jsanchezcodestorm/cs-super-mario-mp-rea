import { mapPosition } from './overworld.ts'
import { pathPosition } from './overworld-path.ts'
import { palFrame } from './pal-time.ts'
import type { World, GameState } from './types.ts'

const seed = [0, 0x52, 0x31]
const spawnX = [-16, 32, 192, -16, -16, 128, -16, 0]
const spawnY = [112, 352, 344, 176, 352, 352, 112, 352]
const height = [112, 127, 120, 127, 112, 127, 120, 127]

/** Bank 04 spawns clouds relative to the scrolling camera and moves them in sixteenths. */
export function advanceClouds(clouds: NonNullable<GameState['mapClouds']>, frame: number, cameraX: number, cameraY: number) {
  for (let slot = 2; slot >= 0; slot--) {
    const phase = (frame + seed[slot]) & 7
    const cloud = clouds[slot] ??= { x: cameraX + spawnX[phase], y: cameraY + spawnY[phase], z: height[phase] }
    cloud.x += 2 / 16
    cloud.y -= 1 / 16
    const x = Math.floor(cloud.x) - cameraX, y = Math.floor(cloud.y) - cloud.z - cameraY
    if (x < -32 || x >= 288 || y < -128 || y >= 288) clouds[slot] = null
  }
}

export function stepMapClouds({ state, campaign }: World) {
  const frame = palFrame(state.tick)
  if (frame === palFrame(state.tick - 1)) return
  const paths = campaign.overworldPaths
  if (!paths) return
  const travel = state.mapTravel
  const stop = travel ? paths[travel.from] : paths[state.mapStop ?? state.progress.unlocked[state.progress.selection]]
  if (!stop) return
  const edge = travel && stop.directions[travel.command]
  const position = travel && edge ? pathPosition(edge, travel.elapsed, travel.command) : mapPosition(stop.position)
  if (position.region !== 0) {
    delete state.mapClouds
    return
  }
  const x = Math.max(0, Math.min(256, Math.round(position.x) - 128))
  const y = Math.max(0, Math.min(332, Math.round(position.y) - 90))
  advanceClouds(state.mapClouds ??= [null, null, null], frame, x, y)
}
