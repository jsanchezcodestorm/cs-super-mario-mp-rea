import { netDoorPhase, type GameState, type NetDoor } from '@smw/core';
import type { Stage } from './content';
import type { Camera } from './terrain-view';

export const netDoorTexture = (atlas: string) => atlas.replace('.png', '-net-door.png');
export const hasNetDoor = (room: Stage) => room.sprites.some(sprite => sprite.spriteId === 0x54);

export function movingDoors(state: GameState, roomId: string) {
  return state.netDoors?.filter(door => door.roomId === roomId && netDoorPhase(door, state.tick) >= 0);
}

// The ROM replaces only the six by six interior BG1 characters. Clipping
// this layer leaves the BG2 picture visible through the open frame.
export function drawNetBackground(ctx: CanvasRenderingContext2D, draw: () => void, doors: NetDoor[],
  camera: Camera, open: CanvasImageSource, high: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 256, 224);
  for (const door of doors) ctx.rect(door.x + 8 - camera.x, door.y + 8 - camera.y, 48, 48);
  ctx.clip('evenodd');
  draw();
  ctx.restore();
  if (!high)
    for (const door of doors) ctx.drawImage(open, door.x + 8 - camera.x, door.y + 8 - camera.y);
}
