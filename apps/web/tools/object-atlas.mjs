import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writePng } from '../../../tools/rom/png.mjs';
import { tilePixel } from '../../../tools/rom/graphics.mjs';

// Interpret the OAM emitted by the game's sprite drawing routines. 8x8 and
// 16x16 entries use different subtile traversal, including the SNES X/Y flips.
export function decode(oam, memory, palette, fixedSize = 0) {
  const size = 160,
    origin = 16,
    pixels = Buffer.alloc(size * size * 4);
  let minX = size,
    minY = size,
    maxX = -1,
    maxY = -1;
  for (let i = 127; i >= 0; i--) {
    const [x, y, tile, attr] = oam.subarray(4 * i, 4 * i + 4);
    if (y >= 224 || x >= 200 || oam[0x220 + i] & 1) continue;
    const width = oam[0x220 + i] & 2 ? 16 : 8;
    for (let dy = 0; dy < width; dy++)
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx - origin,
          py = y + dy - origin;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const sx = attr & 64 ? width - 1 - dx : dx,
          sy = attr & 128 ? width - 1 - dy : dy;
        const tileId = (attr & 1) * 256 + ((tile + 16 * (sy >> 3)) & 0xf0) + ((tile + (sx >> 3)) & 0xf);
        const index = tilePixel(memory, 0x600 + tileId, sx & 7, sy & 7, 4);
        if (!index) continue;
        const rgb = palette[128 + 8 * (attr & 14) + index];
        const p = 4 * (py * size + px);
        pixels[p] = rgb >> 16;
        pixels[p + 1] = rgb >> 8;
        pixels[p + 2] = rgb;
        pixels[p + 3] = 255;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
  }
  if (maxX < 0) return;
  if (fixedSize) {
    minX = minY = 96 - origin;
    maxX = maxY = minX + fixedSize - 1;
  }
  const w = maxX - minX + 1,
    h = maxY - minY + 1,
    cropped = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    pixels.copy(cropped, y * w * 4, ((y + minY) * size + minX) * 4, ((y + minY) * size + maxX + 1) * 4);
  const captureAnchor = 96 - origin;
  return { w, h, pixels: cropped, offsetX: minX - captureAnchor, offsetY: minY - captureAnchor };
}

export function atlas(output, frames, group) {
  const width = 512;
  let x = 0,
    y = 0,
    row = 0;
  const entries = {},
    rasters = new Map();
  const tracks = new Map();
  for (const [name, frame] of frames) {
    const match = /^(.*)\/(\d+)$/.exec(name);
    if (!match) continue;
    const track = tracks.get(match[1]) ?? [];
    track.push({ name, index: Number(match[2]), frame });
    tracks.set(match[1], track);
  }
  const registration = {};
  for (const track of tracks.values()) {
    track.sort((a, b) => a.index - b.index);
    const base = track.find((item) => item.index === 0) ?? track[0];
    for (const item of track) {
      registration[item.name] = {
        x: item.frame.offsetX - base.frame.offsetX + (item.frame.w - base.frame.w) / 2,
        y: item.frame.offsetY - base.frame.offsetY + item.frame.h - base.frame.h,
      };
    }
  }
  for (const [name, frame] of frames) {
    const { w, h } = frame,
      hash = w + 'x' + h + ':' + createHash('sha256').update(frame.pixels).digest('hex'),
      previous = rasters.get(hash);
    if (previous) {
      entries[name] = {
        frame: previous.position,
        trimmed: false,
        rotated: false,
        sourceSize: { w, h },
        spriteSourceSize: { x: 0, y: 0, w, h },
      };
      continue;
    }
    if (x + w > width) {
      x = 0;
      y += row;
      row = 0;
    }
    const position = { x, y, w, h };
    entries[name] = {
      frame: position,
      trimmed: false,
      rotated: false,
      sourceSize: { w, h },
      spriteSourceSize: { x: 0, y: 0, w, h },
    };
    rasters.set(hash, { position, frame });
    x += w;
    row = Math.max(row, h);
  }
  const height = y + row,
    image = Buffer.alloc(width * height * 4);
  for (const { position: pos, frame } of rasters.values()) {
    const { w, h, pixels } = frame;
    for (let j = 0; j < h; j++)
      pixels.copy(image, ((pos.y + j) * width + pos.x) * 4, j * w * 4, (j + 1) * w * 4);
  }
  writePng(join(output, group + '.png'), width, height, image);
  writeFileSync(
    join(output, group + '.json'),
    JSON.stringify({
      frames: entries,
      meta: { image: group + '.png', size: { w: width, h: height }, scale: '1' },
    }),
  );
  writeFileSync(join(output, group + '-registration.json'), JSON.stringify(registration));
}
