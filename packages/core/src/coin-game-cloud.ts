import { playerContactBody } from './player-size.ts'
import { collectCoin } from './resources.ts'
import { showHitAward } from './rewards.ts'
import { spawnEntity } from './state.ts'
import { clipDisplacement, limit, overlaps } from './terrain.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

function nativeFrame(tick: number) {
  const frame = Math.floor(tick * 5 / 6)
  return Math.floor((tick - 1) * 5 / 6) !== frame ? frame : null
}

/** E1 02:EEB5. Ten drops and an eleventh opportunity to release the 1-UP. */
export function moveCoinGameCloud(world: World, cloud: EntityState) {
  const frame = nativeFrame(world.state.tick)
  if (frame === null) return
  const game = cloud.coinGame ??= { attempts: 0, collected: 0 }
  if (frame % 128 === 0 && game.attempts < 11) {
    game.attempts++
    if (game.attempts <= 10) {
      const coin = spawnEntity(world, cloud.roomId, { x: cloud.x + 4, y: cloud.y, spriteId: 0x0a }, 'cloudCoin')!
      coin.sourceCloud = cloud.id
      coin.vy = -3
      coin.vx = 0
    } else if (game.collected === 10) {
      const life = spawnEntity(world, cloud.roomId, { x: cloud.x, y: cloud.y, spriteId: 0x78 })!
      life.vy = -2
      life.vx = 1
    }
  }
  if (frame % 2 === 0) {
    cloud.vy = limit(cloud.vy + (cloud.y < 0x110 && game.attempts < 11 ? 1 : -1) / 16, -1, 1)
  }
  cloud.x += 0.5
  cloud.y += cloud.vy
  if (cloud.y < -16 || cloud.x > world.campaign.levels[cloud.roomId].width * 16) cloud.active = false
}

export function moveCloudCoin(world: World, room: LevelDefinition, coin: EntityState) {
  if (nativeFrame(world.state.tick) === null) return
  const next = coin.y + coin.vy
  const floor = !coin.coinBounced && coin.vy > 0 ? clipDisplacement(world, room, coin, 'y', coin.vy) : next
  coin.y = floor
  if (floor < next - 0.01) {
    coin.coinBounced = true
    coin.vy = -3
  } else coin.vy = Math.min(3, coin.vy + 2 / 16)
}

export function collectCloudCoin(world: World, coin: EntityState, player: PlayerState) {
  const box = { x: coin.x + 4, y: coin.y + 2, width: 8, height: 12 }
  if (!overlaps(playerContactBody(player), box)) return
  coin.active = false
  const source = world.state.entities.find(e => e.id === coin.sourceCloud)
  if (source?.coinGame) source.coinGame.collected++
  collectCoin(world, player)
  showHitAward(world.state, player, coin, 100)
}
