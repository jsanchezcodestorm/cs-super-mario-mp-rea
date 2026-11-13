import { execFileSync } from 'node:child_process';
import { decode } from './object-atlas.mjs';

// Sprite numbers whose native drawings depend on the side they face.
// Both sides pass through the ROM's compositor, including multi-part actors.
export const directionalNpcs = new Set([
  0,1,2,3,4,5,6,7,8,9,10,11,12,0x0d,0x0f,0x10,0x11,0x13,
  0x15,0x16,0x17,0x18,0x1d,0x1e,0x1f,0x2d,0x2e,0x30,0x31,0x32,
  0x38,0x39,0x3d,0x41,0x42,0x44,0x47,0x4d,0x4e,0x51,0x6e,0x6f,
  0x71,0x72,0x73,0x86,0x9a,0x9b,0xa2,0xaa,0xab,0xbd,0xbe,0xbf,0xc2,0xc3,
]);
const stride = 0x102a0;
const babyColors = {green:10,red:8,blue:6,yellow:4};

export function captureNpcPoses(runner, rom, memory, room, id, stomped, key, frames) {
  const standard = directionalNpcs.has(id);
  const prefix = room.spriteTileset + ':';
  function track(name, count, key, right = false) {
    const args = [rom, memory, 'npc', String(id), name, String(count), String(+right), String(+stomped)];
    const data = execFileSync(runner, args, {maxBuffer: stride*count+1024});
    if (data.length !== count*stride) throw Error('Incomplete native NPC track ' + key);
    for (let i = 0; i < count; i++) {
      const p = stride*i, oam = data.subarray(p, p+0x2a0), vram = data.subarray(p+0x2a0, p+stride);
      function add(key, oam) {
        // Fishing Lakitu hangs his 1-Up 66 px below his sprite origin.
        const image = name === 'lakitu' && i >= 4
          ? decode(oam, vram, room.spritePalette, 0, 0, 176)
          : decode(oam, vram, room.spritePalette);
        if (!image) throw Error('Empty native NPC pose ' + key + '/' + i + ' in room ' + room.id);
        // Normalise both sides at the same sprite origin, including asymmetric
        // extensions (wings, tails, Wiggler's trailing segments and fish fins).
        image.anchor = {x:8,y:16};
        frames.set(key + '/' + i, image);
      }
      add(key, oam);
      if (id !== 0x2d) continue;
      for (const [color, palette] of Object.entries(babyColors)) {
        const painted = Buffer.from(oam);
        for (let j=3; j<0x200; j+=4) painted[j] = (painted[j]&0xf1) | palette;
        const base = room.spriteTileset + '-' + id + ':' + color;
        add(right ? base + ':right' : base, painted);
      }
    }
  }
  if (standard) {
    track('walk', 32, key);
    track('walk', 32, key + ':right', true);
    for (let i = 0; i < 32; i++) {
      const left = frames.get(key + '/' + i), right = frames.get(key + ':right/' + i);
      if (left.w === right.w && left.h === right.h && left.pixels.equals(right.pixels))
        throw Error('Both native directions produced the same drawing for ' + key + '/' + i);
    }
  }
  if (id >= 8 && id <= 0xc) track('ground', 4, prefix + 'wingGround' + id);
  if (id <= 0xc) track('turn', 4, prefix + 'turn' + id);
  if (id === 2) track('kick', 2, prefix + 'kick2');
  if (id >= 0x22 && id <= 0x25) track('net', 20, prefix + 'net' + id);
  if (id === 0x28 || id === 0x37) track('boo', id === 0x28 ? 10 : 8, prefix + 'boo' + id);
  if (id === 0x1c) track('bill', 8, prefix + 'bill');
  if (id === 0x15) track('flop', 4, prefix + 'flop21');
  if (id === 0x1e) track('lakitu', 6, prefix + 'lakitu');
  if (id === 0x46) track('digChuck', 8, prefix + 'digChuck');
  if ((id === 0x46 || (id >= 0x91 && id <= 0x98)) && !frames.has(prefix+'chuck/0'))
    track('chuck', 52, prefix+'chuck');
  return standard;
}
