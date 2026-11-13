import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writePng } from '../../../tools/rom/png.mjs';
import { tilePixel } from '../../../tools/rom/graphics.mjs';

// Sprite slot zero as assigned by E1 01:80D2 for this room. Normal sprite
// routines write into the second half of the 128-entry OAM buffer.
export function standardOamSlot(rom, state) {
  const allocation = rom.byte(0x07f0b4 + state[0x1692]);
  return 64 + (rom.byte(0x07f000 + allocation) >> 2);
}

// Interpret the OAM emitted by the game's sprite drawing routines. 8x8 and
// 16x16 entries use different subtile traversal, including the SNES X/Y flips.
export function decode(oam, memory, palette, fixedSize = 0, splitAtSlot = 0) {
  const size = 160,
    origin = 16,
    pixels = Buffer.alloc(size * size * 4),
    owners = new Uint8Array(size * size);
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
        owners[p / 4] = i;
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
  // OAM slot order resolves OBJ vs OBJ before the priority bits are compared
  // with backgrounds. Split only visible pixels of the winning OBJ.
  const bands = visibleBands(oam, owners, cropped, minX, minY, size, w, h, splitAtSlot);
  if (!bands.length) return;
  const { priority, oam: slot } = bands[0];
  const frame = { w, h, pixels: cropped, offsetX: minX - captureAnchor, offsetY: minY - captureAnchor, priority, oam: slot };
  if (bands.length > 1) frame.layers = bands;
  return frame;
}

function visibleBands(oam, owners, pixels, x0, y0, stride, width, height, splitAtSlot) {
  const bands = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dest = (y * width + x) * 4;
      if (!pixels[dest + 3]) continue;
      const slot = owners[(y0 + y) * stride + x0 + x];
      const priority = (oam[4 * slot + 3] >> 4) & 3;
      const key = priority + (slot < splitAtSlot ? 4 : 0);
      let band = bands.get(key);
      if (!band) {
        band = { priority, oam: slot, pixels: Buffer.alloc(pixels.length) };
        bands.set(key, band);
      }
      band.oam = Math.min(band.oam, slot);
      pixels.copy(band.pixels, dest, dest, dest + 4);
    }
  }
  return [...bands.values()].sort((a, b) => a.oam - b.oam);
}

export function atlas(output, frames, group) {
  const width = group === 'actors' ? 1024 : 512;
  let x = 0,
    y = 0,
    row = 0;
  const entries = {},
    rasters = new Map();
  const tracks = new Map();
  for (const [name, frame] of frames) {
    const match = /^(.*)\/(\d+)$/.exec(name);
    const trackName = match ? match[1] : name;
    const track = tracks.get(trackName) ?? [];
    track.push({ name, index: match ? Number(match[2]) : 0, frame });
    tracks.set(trackName, track);
  }
  const registration = {}, rastersToPack = new Map(frames);
  for (const track of tracks.values()) {
    track.sort((a, b) => a.index - b.index);
    const base = track.find((item) => item.index === 0) ?? track[0];
    const anchorX = base.frame.anchor?.x ?? base.frame.offsetX + base.frame.w / 2;
    const anchorY = base.frame.anchor?.y ?? base.frame.offsetY + base.frame.h;
    for (const item of track) {
      const pose = item.frame;
      const placement = registration[item.name] = {
        priority: pose.priority, oam: pose.oam,
        x: pose.offsetX + pose.w / 2 - anchorX,
        y: pose.offsetY + pose.h - anchorY,
      };
      // A rider is anchored to the centre of the cartridge's 16px player
      // origin. An asymmetric standing pose (notably the cape) is not its pivot.
      if (group === 'actors')
        placement.mountedX = pose.offsetX + pose.w / 2 - 8;
      if (pose.layers) {
        placement.layers = pose.layers.map(({ priority, oam, pixels }) => {
          const frame = item.name + '@p' + priority + '-' + oam;
          rastersToPack.set(frame, { w: pose.w, h: pose.h, pixels });
          return { frame, priority, oam };
        });
      }
    }
  }
  for (const [name, frame] of rastersToPack) {
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
