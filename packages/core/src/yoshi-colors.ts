import type { PlayerState, YoshiColor } from './types.ts'

export const yoshiColors = ['green', 'red', 'blue', 'yellow'] as const
const koopaShells = [4, 5, 6, 7, 4, 4, 5, 5, 7]
export function koopaShell(spriteId: number) {
  return koopaShells[spriteId - 4]
}
export function shellColor(spriteId: number): YoshiColor | undefined {
  const shell = koopaShell(spriteId)
  return shell === undefined ? undefined : yoshiColors[shell - 4]
}
/** InitYoshiEgg at 01:8339. The column supplies the palette of placed eggs. */
export function eggColor(x: number): YoshiColor {
  return (['red', 'blue', 'yellow', 'blue'] as const)[(x >> 4) & 3]
}
// Palette 4 (red) is tested separately on spit. The two other abilities
// combine, so a blue Yoshi holding a yellow shell can both fly and stomp.
export function yoshiPowers(p: PlayerState) {
  const shell = p.mounted && p.mouth?.ticks && p.mouth.shellColor
  const rainbow = !!(shell && p.mouth?.rainbow)
  return {
    wings: !!shell && (rainbow || shell === 'blue' || p.yoshiColor === 'blue'),
    fire: !!shell && (rainbow || shell === 'red' || p.yoshiColor === 'red'),
    stomp: !!shell && (rainbow || shell === 'yellow' || p.yoshiColor === 'yellow'),
  }
}
