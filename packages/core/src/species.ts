import { isWallSpring } from './wall-spring.ts'
import { initPipePlant, isPipePlant } from './pipe-plant.ts'
import { eggColor, shellColor, koopaShell } from './yoshi-colors.ts'
import type { EntityKind, EntityState, Spawn } from './types.ts'

const species = new Map<number, EntityKind>()
species.set(0x1e, 'lakitu')
species.set(0x87, 'cloud')
function assign(kind: EntityKind, ids: number[]) {
  for (const id of ids) species.set(id, kind)
}
assign(
  'walker',
  [
    0, 1, 2, 3, 0x0d, 0x0f, 0x11, 0x2e, 0x30, 0x31, 0x32, 0x4d, 0x4e, 0x6e, 0x6f, 0x70, 0x86, 0x9a, 0x9b,
    0xbd, 0xbf,
  ],
)
assign('flyingQuestion', [0x83, 0x84])
assign('magikoopa', [0x1f])
assign('magic', [0x20])
assign('chuck', [0x46, 0x91, 0x92, 0x93, 0x94, 0x95, 0x97, 0x98])
assign('netKoopa', [0x22, 0x23, 0x24, 0x25])
assign('koopa', [4, 5, 6, 7])
assign('spiny', [0x13, 0x14])
assign('jumper', [9, 0x10, 0x1b, 0x1d, 0x27, 0x51])
assign('flyer', [8, 0xa, 0xb, 0xc, 0x38, 0x39, 0x3f, 0x40, 0x71, 0x72, 0x73, 0xbe])
assign('fish', [0x15, 0x16, 0x17, 0x18, 0x3a, 0x3b, 0x3c, 0x3d, 0x47, 0xaa, 0xc2, 0xc3])
assign('boo', [0x28, 0x37, 0xaf])
assign('levelNpc', [0x4b, 0x4c, 0xbc, 0x8a, 0x90, 0x9d, 0xa8, 0xae])
assign('plant', [0x1a, 0x2a, 0x4f, 0x50, 0x99])
assign('bullet', [0x1c, 0x44, 0x9f])
assign(
  'platform',
  [
    0x41, 0x42, 0x43, 0x55, 0x56, 0x57, 0x58, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x59, 0x5a, 0x61, 0x62, 0x63,
    0x64, 0x8f, 0x9c, 0xa3, 0xbb, 0xb7, 0xb8, 0xba, 0xc0, 0xc1, 0xc4,
  ],
)
assign(
  'hazard',
  [
    0x26, 0x33, 0x34, 0x48, 0x65, 0x66, 0x67, 0x68, 0x9e, 0xa1, 0xa4, 0xa5, 0xa6, 0xa7, 0xac, 0xad, 0xb0,
    0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  ],
)
assign('coin', [0x21, 0x7e])
assign('coinGameCloud', [0x6a])
assign('directionalCoins', [0x45])
assign('yoshi', [0x35])
assign('babyYoshi', [0x2d])
assign('yoshiEgg', [0x2c])
assign('goal', [0x7b])
assign('orb', [0x4a])
assign('blockSnake', [0xb1])
assign('vine', [0x79])
assign('throwBlock', [0x53])
assign('balloon', [0x7d])
assign('mechakoopa', [0xa2])
assign('key', [0x80])
assign('keyhole', [0x0e])
assign('switch', [0x3e])
assign('spring', [0x2f, 0x6b, 0x6c])
assign('rex', [0xab])
assign('mushroom', [0x74])
assign('flower', [0x75])
assign('star', [0x76])
assign('feather', [0x77])
assign('oneUp', [0x78, 0x7f])
assign('boss', [0x29, 0xa9, 0xc5])
assign('endingBoss', [0xa0])
assign('exitSide', [0x8c])
export function entityFromSpawn(
  roomId: string,
  spawn: Spawn,
  id: string,
  override?: EntityKind,
): EntityState | null {
  const placedShell = spawn.spriteId >= 0xda && spawn.spriteId <= 0xdf && spawn.spriteId !== 0xde
  const spriteId = placedShell ? koopaShell(spawn.spriteId - 0xda + 4) : spawn.spriteId
  const kind = override ?? (placedShell ? 'shell' : species.get(spriteId))
  if (!kind) return null
  const large = spawn.spriteId === 0x9f ? 64 : kind === 'endingBoss' ? 48 : kind === 'boss' ? 32 : 16
  const width = isWallSpring(spriteId) ? 40 : kind === 'platform' ? 48 : large
  const snake =
    kind === 'blockSnake'
      ? { eater: !!(spawn.x & 16), started: false, command: 0, remaining: 0, direction: 0 }
      : undefined
  const entity: EntityState = {
    id,
    shellColor: shellColor(spriteId),
    yoshiColor:
      kind === 'yoshiEgg'
        ? eggColor(spawn.x)
        : kind === 'babyYoshi' || kind === 'yoshi'
          ? 'green'
          : undefined,
    snake,
    roomId,
    kind,
    spriteId,
    x: spriteId === 0x6c ? spawn.x - 40 : spawn.x,
    y: spawn.y,
    origin: { x: spawn.x, y: spawn.y },
    width,
    height: kind === 'rex' || kind === 'chuck' ? 28 : large,
    vx: kind === 'shell' || kind === 'key' || kind === 'switch' || kind === 'spring' ? 0 : -0.6,
    vy: 0,
    grounded: false,
    active: true,
    age: 0,
    owner: null,
    secret: kind === 'goal' && !!spawn.extra,
    hp:
      kind === 'endingBoss'
        ? 6
        : spawn.spriteId === 0xa9
          ? 1
          : kind === 'boss' || kind === 'chuck'
            ? 3
            : kind === 'rex'
              ? 2
              : 1,
  }
  if (kind === 'plant' && isPipePlant(spriteId)) initPipePlant(entity)
  if (kind === 'yoshi') {
    entity.vx = 0
    entity.facing = -1
  }
  return entity
}
