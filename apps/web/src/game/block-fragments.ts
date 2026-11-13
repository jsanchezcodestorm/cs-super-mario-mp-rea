import { palFrame, type GameState } from '@smw/core';
import type { ObjectPlanes } from './object-planes';
import type { Camera } from './terrain-view';

// E1 $02:8B84. The minor sprite slot offsets the rotation of each fragment.
const frames = [30, 31, 31, 30, 30, 31, 31, 30];
const flips = [0, 0, 0x80, 0x80, 0x80, 0xc0, 0x40, 0];

export function drawBlockFragments(objects: ObjectPlanes, sheet: HTMLImageElement,
  state: GameState, room: string, camera: Camera) {
  const now = palFrame(state.tick);
  for (const block of state.shatteredBlocks ?? []) {
    if (block.roomId !== room) continue;
    const first = palFrame(block.tick);
    let sideways = 0, drop = 0, speed = -5;
    // $02:8F8B moves the pieces before drawing. Gravity acts every fourth
    // PAL frame. The lower pair starts eight pixels down and two px/frame slower.
    for (let frame = first; frame <= now; frame++) {
      drop += speed;
      if ((frame & 3) === 0) speed++;
      else sideways++;
    }
    for (let piece = 0; piece < 4; piece++) {
      const x = block.x - camera.x + ((piece & 1) ? 8 + sideways : -sideways);
      const y = block.y - camera.y + drop + (piece >= 2 ? 8 + 2 * (now - first + 1) : 0);
      if (x < 0 || x >= 256 || y < 0 || y >= 224) continue;
      const slot = block.firstSlot + piece;
      const phase = ((now >> 1) + slot) & 7;
      objects.queue({ image: sheet, sx: frames[phase] * 16, sy: 0, w: 8, h: 8,
        x: Math.round(x), y: Math.round(y), flipX: !!(flips[phase] & 0x40), flipY: !!(flips[phase] & 0x80),
        priority: 2, oam: 20 + slot });
    }
  }
}
