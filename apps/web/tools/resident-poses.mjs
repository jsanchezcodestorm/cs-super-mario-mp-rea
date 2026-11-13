import { execFileSync } from 'node:child_process';
import { decode } from './object-atlas.mjs';

// Pose counts include the two native directions for actors that turn.
const counts = new Map([[0x4b, 6], [0x8a, 24], [0x90, 4], [0x9d, 28],
  [0xa8, 6], [0xae, 32], [0xaf, 6], [0x4c, 2], [0xbc, 6], [0xb3, 8], [0xb0, 40]]);

export function captureResidentPoses(runner, romFile, memFile, room, id, frames) {
  const count = counts.get(id);
  if (!count) return;
  const stride = 0x102a0;
  const buffer = execFileSync(runner, [romFile, memFile, 'resident', String(id), String(count)], {
    maxBuffer: stride * count + 1024,
  });
  if (buffer.length !== stride * count) throw Error('Incomplete native sprite capture ' + id);
  for (let i = 0; i < count; i++) {
    const start = i * stride;
    const image = decode(buffer.subarray(start, start+0x2a0),
      buffer.subarray(start+0x2a0, start+stride), room.spritePalette);
    if (!image) throw Error('Empty native pose ' + id + '/' + i + ' in ' + room.id);
    // World coordinates represent the 16px sprite origin even when the
    // visible art (a fishing line, gas cloud or bird) extends far beyond it.
    image.anchor = { x: 8, y: 16 };
    frames.set(room.spriteTileset + ':resident' + id + '/' + i, image);
  }
}
