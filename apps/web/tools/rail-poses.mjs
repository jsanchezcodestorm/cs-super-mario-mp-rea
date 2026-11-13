import { execFileSync } from 'node:child_process';
import { decode } from './object-atlas.mjs';

export function captureRailPoses(runner, romFile, memFile, room, id, frames) {
  const rope = id === 0x64;
  const count = rope ? 8 : 2, stride = 0x102a0;
  const data = execFileSync(runner, [romFile, memFile, 'rail', String(id)], { maxBuffer: stride * count + 1024 });
  if (data.length !== count * stride) throw Error('Incomplete line-guide capture in ' + room.id);
  for (let i = 0; i < count; i++) {
    const start = i * stride;
    const image = decode(data.subarray(start, start + 0x2a0), data.subarray(start + 0x2a0, start + stride), room.spritePalette, 0, 0, 224);
    if (!image) throw Error('Missing line-guide pose in ' + room.id);
    image.anchor = rope ? { x: 0, y: (i >= 4 ? 136 : 72) - 32 } : { x: i ? 40 : 24, y: 16 };
    const variant = rope ? Math.floor(i / 4) : i;
    frames.set(room.spriteTileset + ':rail' + id + '-' + variant + '/' + (rope ? i % 4 : 0), image);
  }
}
