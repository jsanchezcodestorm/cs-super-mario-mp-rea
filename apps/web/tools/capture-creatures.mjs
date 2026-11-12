import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decode, atlas } from './object-atlas.mjs';
import { parts, capturePlayerFrames } from './actor-parts.mjs';

export function captureCreatures(root, rom) {
  const work = mkdtempSync(join(tmpdir(), 'smw-objects-'));
  try {
    const output = join(root, 'generated'),
      campaign = JSON.parse(readFileSync(join(output, 'content.json')));
    const roomIndex = JSON.parse(readFileSync(join(output, 'rooms-index.json')));
    const source = join(root, 'tools/rom'),
      compiler = process.env.CC || 'cc';
    const cd = [join(source, 'vendor/lakesnes/cpu.c'), join(source, 'vendor/lakesnes/statehandler.c')];
    const runner = join(work, 'sprite'),
      loader = join(work, 'level'),
      romFile = join(work, 'rom.sfc'),
      memFile = join(work, 'memory');
    execFileSync(compiler, ['-O2', join(root, 'apps/web/tools/capture-actor.c'), ...cd, '-o', runner]);
    execFileSync(compiler, ['-O2', join(source, 'machine.c'), ...cd, '-o', loader]);
    writeFileSync(romFile, rom.data);
    const seen = new Set(),
      frames = new Map(),
      unobserved = {};
    for (const room of Object.values(campaign.levels)) {
      const def = roomIndex[room.id];
      if (!def) continue;
      const rewardIds = [0x21, 0x2c, 0x2d, 0x35, 0x53, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7d, 0x80];
      if (room.sprites.some((s) => s.spriteId >= 0xcb && s.spriteId <= 0xd8))
        rewardIds.push(0x38, 0x3f, 0x40, 0x41, 0x17, 0x71, 0x9d, 0x1c, 0xb3, 0x44);
      if (room.sprites.some((s) => [0x46, 0x92, 0x97, 0x98].includes(s.spriteId)))
        rewardIds.push(0x48, 0x1b, 0x91);
      const sprites = [
        ...room.sprites.filter((s) => s.spriteId <= 0xc8),
        ...rewardIds.map((spriteId) => ({ spriteId })),
      ];
      if (!sprites.some((s) => !seen.has(room.spriteTileset + '-' + s.spriteId))) continue;
      const state = execFileSync(loader, [romFile, String(def.layer1), String(def.layer2)]);
      writeFileSync(memFile, state);
      parts(room, state, frames);
      if (!seen.size) capturePlayerFrames(output, runner, romFile, memFile, room.spritePalette);
      for (const sprite of sprites) {
        const key = room.spriteTileset + '-' + sprite.spriteId;
        if (seen.has(key)) continue;
        seen.add(key);
        const run = spawnSync(runner, [romFile, memFile, String(sprite.spriteId)]);
        if (run.error || run.status !== 0) {
          throw Error(
            'Capture failed for ' + key + ': ' + (run.error?.message || run.stderr.toString().trim()),
          );
        }
        let poses = 0;
        for (let f = 0; f < (sprite.spriteId===0x35?4:2); f++) {
          const pos = (0x2a0 + 0x10000) * f;
          const image = decode(
            run.stdout.subarray(pos, pos + 0x2a0),
            run.stdout.subarray(pos + 0x2a0, pos + 0x102a0),
            room.spritePalette,
          );
          if (image) {
            frames.set(key + '/' + f, image);
            poses++;
            if ([0x2c, 0x2d, 0x35].includes(sprite.spriteId)) {
              const oam = Buffer.from(run.stdout.subarray(pos, pos + 0x2a0));
              const vram = run.stdout.subarray(pos + 0x2a0, pos + 0x102a0);
              for (const [name, attribute] of Object.entries({ green: 10, red: 8, blue: 6, yellow: 4 })) {
                // Replace only the OAM palette row. The cartridge's complete
                // CGRAM row supplies the original saddle, shoe and skin tones.
                for (let slot = 0; slot < 128; slot++)
                  oam[4 * slot + 3] = (oam[4 * slot + 3] & 0xf1) | attribute;
                const painted = decode(oam, vram, room.spritePalette);
                if (painted) frames.set(key + ':' + name + '/' + f, painted);
              }
            }
          }
        }
        if (!poses) unobserved[key] = 'No visible OAM pixels in these samples';
      }
    }
    atlas(output, frames, 'creatures');
    writeFileSync(
      join(output, 'creature-coverage.json'),
      JSON.stringify({ spriteTilesetPairs: seen.size, frames: frames.size, unobserved }, null, 2),
    );
    console.log(
      frames.size +
        ' SNES actor frames captured; ' +
        Object.keys(unobserved).length +
        ' pairs without visible samples.',
    );
  } finally {
    rmSync(work, { force: true, recursive: true });
  }
}
