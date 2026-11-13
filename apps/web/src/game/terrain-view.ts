import type { ObjectPlanes } from './object-planes';
import { drawTilePlane } from './tile-plane';
import { drawNetBackground, movingDoors } from './net-door-view';
import { tideSurface, type GameState } from '@smw/core';
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
  masks: number[],
  objects: ObjectPlanes,
  screens: { main: number; sub: number },
  tideImage?: CanvasImageSource,
  openNet?: CanvasImageSource,
  backdrop = stage.backgroundColor,
) {
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const bg = stage.background;
  const doors = movingDoors(state, stage.id);
  const offset = state.layerOffsets[stage.id];
  const bgX = bg?.repeat ? Math.floor(camera.x * bg.scroll!.x) : Math.round(camera.x - (offset?.x ?? 0));
  const bgY = bg?.repeat ? Math.floor(camera.y * bg.scroll!.y) + bg.scroll!.offsetY : Math.round(camera.y - (offset?.y ?? 0));
  function screen(mask: number) {
    if (mask & 16) objects.paint(ctx, 0);
    if (mask & 16) objects.paint(ctx, 1);
    for (const high of [false, true]) {
      if (bg && (mask & 2)) drawTilePlane(ctx, stage, atlas, masks, high, bgX, bgY, state, false);
      if (mask & 1) {
        const draw = () => drawTilePlane(ctx, stage, atlas, masks, high, camera.x, camera.y, state, true);
        if (doors?.length) drawNetBackground(ctx, draw, doors, camera, openNet!, high);
        else draw();
      }
      if (mask & 16) objects.paint(ctx, high ? 3 : 2);
    }
    if ((mask & 4) && stage.tide) drawTide(ctx, stage, tideImage!, camera, state);
  }
  screen(screens.sub);
  screen(screens.main);
}

function drawTide(ctx: CanvasRenderingContext2D, stage: Stage, atlas: CanvasImageSource, camera: Camera, state: GameState) {
  const tide = tideSurface(stage, state);
  if (tide === null) return;
  const surface = Math.round(tide - 8 - camera.y);
  const frame = Math.floor((state.layerOffsets[stage.id]?.age ?? 0) * 5 / 6);
  const startX = -((camera.x + frame) & 15);
  for (let y = surface + Math.max(0, Math.floor(-surface / 8)) * 8; y < HEIGHT; y += 8) {
    for (let x = startX; x < WIDTH; x += 16) {
      ctx.drawImage(atlas, 0, y === surface ? 0 : 8, 16, 8, x, y, 16, 8);
    }
  }
}
