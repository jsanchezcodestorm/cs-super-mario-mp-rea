import { Buttons, type EntityState, type PlayerState, type World } from './types.ts'
import { limit } from './terrain.ts'
import { spawnEntity } from './state.ts'

export function moveLakitu(world: World, rider: EntityState, target: PlayerState) {
  // E1 01:E98D accelerates toward the player every other frame while bobbing
  // between vertical speeds -$10 and +$10 in sixteenths of a pixel per tick.
  if (!(rider.age & 1)) {
    rider.vx = limit(rider.vx + Math.sign(target.x - rider.x) / 16, -2, 2)
    const phase = (rider.age >> 1) % 64
    rider.vy = (phase <= 32 ? phase - 16 : 48 - phase) / 16
  }
  rider.x = limit(rider.x + rider.vx, 0, world.campaign.levels[rider.roomId].width * 16 - rider.width)
  rider.y += rider.vy
  if (rider.age % 128 === 0 && !(rider.origin.x & 16)) {
    const spiny = spawnEntity(world, rider.roomId, { x: rider.x, y: rider.y, spriteId: 0x13 })!
    spiny.vy = -3
  }
}

export function freeCloud(world: World, enemy: EntityState) {
  const cloud = spawnEntity(world, enemy.roomId, { x: enemy.x, y: enemy.y + 16, spriteId: 0x87 })!
  cloud.vx = 0
}

export function moveCloud(world: World, cloud: EntityState) {
  const player = cloud.owner && world.state.players[cloud.owner]
  if (player && player.cloud === cloud.id && player.status === 'alive' && player.roomId === cloud.roomId) {
    cloud.x = player.x
    cloud.y = player.y + player.height - 2
  } else {
    cloud.owner = null
    cloud.x += cloud.vx
    cloud.y += cloud.vy
  }
  if (cloud.age >= 255 * 4) {
    if (player) delete player.cloud
    cloud.active = false
  }
}

export function rideCloud(world: World, player: PlayerState, input: number, pressed: number) {
  if (player.cloud === undefined) return false
  const cloud = world.state.entities.find((e) => e.id === player.cloud && e.active)
  if (!cloud || pressed & (Buttons.jump | Buttons.spin)) {
    if (cloud) {
      cloud.owner = null
      cloud.vx = player.vx
      cloud.vy = player.vy
      player.cooldown = 16
      player.vy = -4
    }
    delete player.cloud
    return !!cloud
  }
  // E1 02:D214 caps both axes at one pixel per frame on the free cloud.
  const dx = Number(!!(input & Buttons.right)) - Number(!!(input & Buttons.left))
  const dy = Number(!!(input & Buttons.down)) - Number(!!(input & Buttons.up))
  cloud.vx += limit(dx - cloud.vx, -1 / 16, 1 / 16)
  cloud.vy += limit(dy - cloud.vy, -1 / 16, 1 / 16)
  player.vx = cloud.vx
  player.vy = cloud.vy
  if (dx) player.facing = dx > 0 ? 1 : -1
  return true
}
