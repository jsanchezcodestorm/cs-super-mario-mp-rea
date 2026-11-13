import type { EntityState, LevelDefinition, World } from './types.ts'
import { moveBody } from './terrain.ts'

const palRate = 5 / 6

// A blue shell-less Koopa catches a regular incoming shell only from the front.
export function catchIncomingShell(koopa: EntityState, shell: EntityState) {
  if (koopa.kind !== 'walker' || koopa.spriteId !== 2 || koopa.shellDefense || shell.bracedBy ||
      shell.rainbow || !koopa.vx || !shell.vx || Math.sign(koopa.vx) === Math.sign(shell.vx)) return false
  const facing = koopa.vx < 0 ? -1 : 1
  koopa.shellDefense = { id: shell.id, facing, wait: 0 }
  shell.bracedBy = koopa.id
  shell.x = koopa.x + facing * 16
  return true
}

export function braceShell(world: World, room: LevelDefinition, koopa: EntityState) {
  const defense = koopa.shellDefense
  if (!defense) return false
  const shell = world.state.entities.find((e) => e.id === defense.id)
  if (!shell?.active || shell.bracedBy !== koopa.id || shell.roomId !== koopa.roomId ||
      (shell.owner && world.state.players[shell.owner].carrying === shell.id)) {
    delete koopa.shellDefense
    if (shell?.bracedBy === koopa.id) delete shell.bracedBy
    return false
  }
  if (defense.wait > 0) {
    if (--defense.wait === 0) {
      shell.vx = defense.facing * 3 * palRate
      delete shell.bracedBy
      delete koopa.shellDefense
      koopa.shellKickTick = world.state.tick
      koopa.facing = defense.facing
      koopa.vx = defense.facing * 0.6
    }
    return true
  }
  if (koopa.grounded) {
    const speed = Math.max(0, Math.abs(shell.vx) - 2 / 16 * palRate ** 2)
    shell.vx = Math.sign(shell.vx) * speed
  }
  koopa.vx = shell.vx
  koopa.vy = Math.min(4, koopa.vy + 0.23)
  moveBody(world, room, koopa)
  shell.vx = koopa.vx
  shell.x = koopa.x + defense.facing * 16
  if (!shell.vx && koopa.grounded) {
    // Grounded PAL trace: stopped on frame 29, kicked back on frame 74.
    defense.wait = Math.round(45 / palRate)
  }
  return true
}
