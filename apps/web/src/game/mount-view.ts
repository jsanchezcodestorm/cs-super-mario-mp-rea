import { nativeSpeed, palFrame, playerPipePosition, yoshiLunging, yoshiPowers, yoshiTongueBase, yoshiTongueTip, type GameState, type PlayerState } from '@smw/core';
import type { ObjectPlanes } from './object-planes';
import type { DrawActor } from './platform-view';
import { frameForEntity } from './actors-view';
import { playerFacingRight } from './player-animation';

type Textures = { has: (frame: string) => boolean };

// Each index selects an independently captured pair of head/body dynamic tiles.
export function mountPose(p: PlayerState, tick: number) {
  if (p.pipeExit && playerPipePosition(p, tick)) {
    if (p.pipeExit.direction === 'up' || p.pipeExit.direction === 'down') return 18;
    return 16 + ((palFrame(tick) >> 3) & 1);
  }
  const phase = p.tongueFrame;
  const warmup = phase >= 4 && phase <= 8;
  if (phase >= 10) {
    if (!p.grounded) return p.vy < 0 ? 9 : 10;
    return yoshiLunging(p) ? 2 : 6;
  }
  if (p.ducking) return warmup ? 11 : (p.berryBite || p.mouth) ? 12 : 4;
  if (!p.grounded) return p.vy < 0 ? (warmup ? 14 : 8) : (warmup ? 13 : 7);
  const walk = p.vx ? p.animation?.yoshiStep ?? 0 : 0;
  if ((p.berryBite || p.mouth) && !phase && !walk) return 3;
  return warmup ? [5, 15, 13][walk] : [0, 1, 7][walk];
}

export function riderSeatOffset(p: PlayerState, tick: number) {
  // DATA_01EDE4 relative to the idle seat, in capture-yoshi.h sample order.
  return [0, -1, 4, 0, 4, 0, -1, -1, -1, -1, -1, 4, 4, -1, -1, -1, 4, 5, 0][mountPose(p, tick)];
}

export function drawMount(p: PlayerState, x: number, y: number, tileset: number, state: GameState,
  draw: DrawActor, objects: ObjectPlanes, textures: Textures) {
  if (!p.mounted) return;
  const bottom = y + p.height, center = x + p.width / 2;
  const flip = playerFacingRight(p, state.tick), direction = flip ? 1 : -1, prefix = tileset + ':';
  const body = () => draw('mount-' + p.id, tileset + '-53:' + p.yoshiColor + '/' + mountPose(p, state.tick),
    center + direction * 7, bottom, flip, 1, 'creatures');
  if (p.tongueFrame >= 9) {
    const base = yoshiTongueBase(p), step = Math.floor(p.tongue / 4);
    const dx = x - p.x, dy = y - p.y;
    objects.occlude(body, () => {
      for (let i = 0; i < 5; i++)
        draw('tongue-' + p.id + '-' + i, prefix + 'tongue' + i, dx + base.x + 4 + p.facing * i * step,
          dy + base.y + 8, flip, 1, 'creatures');
      if (!p.mouth) return;
      const tip = yoshiTongueTip(p);
      if (p.mouth.berry) {
        draw('berry-' + p.id, prefix + 'berry' + p.mouth.berry, dx + tip.x + 4, dy + tip.y + 10, false, 1, 'creatures');
        return;
      }
      const food = state.entities.find(e => e.id === p.mouth?.entityId);
      if (!food) return;
      const frame = frameForEntity(food, state.tick, tileset, textures);
      if (frame) draw(food.id, frame.frame, dx + tip.x + 4, dy + tip.y + (food.height > 16 ? 6 : 10),
        food.vx > 0, 1, frame.texture);
    });
  } else body();
  if (yoshiPowers(p).wings) {
    const beat = p.grounded ? Number(nativeSpeed(p.vx) >= 0x28) : (palFrame(state.tick) >> (p.vy < 0 ? 2 : 4)) & 1;
    draw('wings-' + p.id, prefix + 'wing' + beat, center - direction * beat * 4, bottom - 8, flip, 1, 'creatures');
  }
}
