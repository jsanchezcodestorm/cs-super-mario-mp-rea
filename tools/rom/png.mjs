import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

function chunk(type, bytes) {
  const payload = Buffer.concat([Buffer.from(type, 'ascii'), bytes]);
  const out = Buffer.alloc(payload.length + 8);
  out.writeUInt32BE(bytes.length);
  payload.copy(out, 4);
  out.writeUInt32BE(crc32(payload), out.length - 4);
  return out;
}

export function writePng(path, width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error('Invalid RGBA dimensions');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
