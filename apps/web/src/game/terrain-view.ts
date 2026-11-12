import { effectiveTile, tideSurface, type GameState } from '@smw/core';
import type { Stage } from './content';
export const WIDTH = 256,
  HEIGHT = 224;
export interface Camera {
  x: number;
  y: number;
}
export function cameraFor(stage: Stage, centerX: number, centerY: number): Camera {
  if (stage.specialMode7) return { x: 0, y: 0 };
  if (stage.id.startsWith('intro-')) return { x: 0, y: 192 };
  const clamp = (n: number, max: number) => Math.max(0, Math.min(n, Math.max(0, max)));
  return {
    x: Math.round(clamp(centerX - WIDTH / 2, stage.width * 16 - WIDTH)),
    y: Math.round(clamp(centerY - HEIGHT * 0.55, stage.height * 16 - HEIGHT)),
  };
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  atlas: CanvasImageSource,
  camera: Camera,
  state: GameState,
) {
  ctx.fillStyle = stage.backgroundColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  function layer(
    tiles: number[],
    w: number,
    h: number,
    sx: number,
    sy: number,
    repeat: boolean,
    foreground = false,
  ) {
    for (let row = sy >> 4; row <= (sy + HEIGHT) >> 4; row++)
      for (let col = sx >> 4; col <= (sx + WIDTH) >> 4; col++) {
        if (!repeat && (row < 0 || col < 0 || col >= w || row >= h)) continue;
        const idx = (((row % h) + h) % h) * w + (((col % w) + w) % w);
        const tile = foreground ? effectiveTile(state, stage, idx) : tiles[idx];
        const id = stage.animatedTiles?.[tile]?.[(state.tick >> 3) & 3] ?? tile;
        ctx.drawImage(
          atlas,
          (id % 32) * 16,
          Math.floor(id / 32) * 16,
          16,
          16,
          col * 16 - sx,
          row * 16 - sy,
          16,
          16,
        );
      }
  }
  const bg = stage.background;
  if (bg) {
    const layerOffset = state.layerOffsets[stage.id];
    const x = bg.repeat ? Math.floor(camera.x * bg.scroll!.x) : Math.round(camera.x - (layerOffset?.x ?? 0));
    const y = bg.repeat
      ? Math.floor(camera.y * bg.scroll!.y) + bg.scroll!.offsetY
      : Math.round(camera.y - (layerOffset?.y ?? 0));
    layer(bg.tiles, bg.width, bg.height, x, y, bg.repeat);
  }
  layer(stage.tiles, stage.width, stage.height, camera.x, camera.y, false, true);
  const tide = tideSurface(stage, state);
  if (tide !== null && tide - camera.y < HEIGHT) {
    const y = tide - camera.y, frame = (state.tick >> 3) & 3;
    ctx.save();
    ctx.globalAlpha = 0.52;
    for (let row = y; row < HEIGHT; row += 16) {
      const tile = row === y ? (stage.animatedTiles?.[0]?.[frame] ?? 0) : 1;
      for (let x = -((camera.x + frame) % 16); x < WIDTH; x += 16)
        ctx.drawImage(atlas, (tile % 32) * 16, (tile >> 5) * 16, 16, 16, x, row, 16, 16);
    }
    ctx.restore();
  }
}
