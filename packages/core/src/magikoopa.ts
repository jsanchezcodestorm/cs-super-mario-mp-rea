import { AIR, changeTile, isSolid, tileAt } from './terrain.ts'
import { spawnEntity } from './state.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

function choosePerch(world: World, wizard: EntityState, target: PlayerState) {
  const room = world.campaign.levels[wizard.roomId]
  const centerX = Math.floor(target.x / 16), centerY = Math.floor(target.y / 16)
  const options: { x: number; y: number }[] = []
  for (let row = Math.max(1, centerY - 7); row <= Math.min(room.height - 2, centerY + 7); row++) {
    for (let col = Math.max(1, centerX - 8); col <= Math.min(room.width - 2, centerX + 8); col++) {
      if (Math.abs(col - centerX) < 2) continue
      const floor = tileAt(world, room, col, row + 1)
      if (floor < 0x100 || floor >= 0x16e || isSolid(tileAt(world, room, col, row))) continue
      options.push({ x: col * 16, y: row * 16 })
    }
  }
  if (options.length) Object.assign(wizard, options[(wizard.age * 31 + centerX * 7) % options.length])
}

// OffScrEraseSprite requests the same wizard again after the native FF timer.
export function withdrawWizard(wizard: EntityState) {
  wizard.height = 0
  wizard.stunnedUntil = wizard.age + 510
}

/** The wand fires toward the current player at speed 0x20 in sixteenths of a pixel. */
export function castMagic(world: World, wizard: EntityState, target: PlayerState) {
  if (!wizard.height) {
    if (wizard.age < (wizard.stunnedUntil ?? 0)) return
    choosePerch(world, wizard, target)
    wizard.height = 16
    wizard.age = 1
  } else if (Math.abs(wizard.x - target.x) > 360) {
    withdrawWizard(wizard)
    return
  }
  const cycle = wizard.age % 160
  if (cycle === 1) {
    const room = world.campaign.levels[wizard.roomId]
    if (wizard.age > 1 || isSolid(tileAt(world, room, Math.floor(wizard.x / 16), Math.floor(wizard.y / 16))))
      choosePerch(world, wizard, target)
  }
  if (cycle !== 64) return
  const shot = spawnEntity(world, wizard.roomId, { x: wizard.x + 4, y: wizard.y + 6, spriteId: 0x20 })!
  shot.width = shot.height = 8
  const dx = target.x + target.width / 2 - (shot.x + shot.width / 2)
  const dy = target.y + target.height / 2 - (shot.y + shot.height / 2)
  const longest = Math.max(1, Math.abs(dx), Math.abs(dy))
  shot.vx = 2 * dx / longest
  shot.vy = 2 * dy / longest
}

/** Bank 01 transforms a struck Map16 block in 111..12D and consumes the spell once. */
export function moveMagic(world: World, room: LevelDefinition, shot: EntityState) {
  shot.x += shot.vx
  shot.y += shot.vy
  const col = Math.floor((shot.x + shot.width / 2) / 16)
  const row = Math.floor((shot.y + shot.height / 2) / 16)
  const tile = tileAt(world, room, col, row)
  if (!isSolid(tile)) {
    if (shot.age > 256 || col < 0 || row < 0 || col >= room.width || row >= room.height) shot.active = false
    return
  }
  shot.active = false
  if (tile < 0x111 || tile > 0x12d) return
  changeTile(world, room, col, row, AIR)
  const roll = (Math.imul(world.state.tick, 73) + 31 * col + 17 * row) & 255
  const spriteId = roll === 0x35 ? 0x78 : roll < 8 ? 0x21 : roll >= 0xf7 ? 0x27 : 0x07
  spawnEntity(world, room.id, { x: col * 16, y: row * 16, spriteId })
}
