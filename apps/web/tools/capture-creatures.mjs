import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureNpcPoses, directionalNpcs } from './npc-poses.mjs';
import { captureRailPoses } from './rail-poses.mjs';
import { captureResidentPoses } from './resident-poses.mjs';
import { decode, atlas } from './object-atlas.mjs';
import { captureBonusSlots } from './bonus-slots.mjs';
import { parts, capturePlayerFrames } from './actor-parts.mjs';
import { captureOpenNetDoor } from './net-door.mjs';

const pipePlantPoses = new Map([[0x1a, 2], [0x2a, 2], [0x4f, 4], [0x50, 4]]);
// The client positions these platform sprites at their original SNES anchor.
const platformOrigins = new Set([0x43, 0x49, 0x55, 0x56, 0x57, 0x58, 0x5b, 0x5c, 0x5d, 0x5e,
  0x61, 0x8f, 0x9c, 0xb7, 0xb8, 0xba, 0xbb, 0xc0, 0xc1, 0xc4]);

// Include offspring, transformed enemies and shots that have no level spawn
// of their own. Resolve generator output from the cartridge's emission trace.
function roomSpriteIds(room, emitters) {
  const ids = new Set([0x21, 0x2c, 0x2d, 0x35, 0x53, 0x6a, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7d, 0x80]);
  for (const { spriteId } of room.sprites) {
    if (spriteId <= 0xc8) ids.add(spriteId);
    for (const event of emitters[spriteId]?.events ?? []) ids.add(event[1]);
    if (spriteId === 0xc9 || spriteId === 0xca) ids.add(spriteId === 0xc9 ? 0x1c : 0x44);
    if (spriteId === 0xde) ids.add(0x39);
  }
  const children = {
    0x08: [4], 0x09: [4], 0x0a: [5], 0x0b: [5], 0x0c: [7],
    0x1e: [0x87, 0x14, 0x13, 0x21], 0x1f: [0x20, 0x27, 0x07], 0x29: [0x34],
    0x3f: [0x0f], 0x40: [0x0d], 0x46: [0x48], 0x4b: [0x14, 0x13, 0x21],
    0x4c: [0x15, 0x0f, 0, 4], 0x73: [2], 0xbc: [0xb3],
    0x92: [0x91], 0x97: [0x1b], 0x9d: [0x0f, 0x0d, 0x15],
    0xa0: [0xa2], 0xa9: [0x34], 0xc5: [0x34],
  };
  for (const id of ids)
    for (const child of children[id] ?? []) ids.add(child);
  return [...ids].flatMap(id => id === 0xab || id === 0xa2
    ? [{ id, stomped: false }, { id, stomped: true }] : [{ id, stomped: false }]);
}

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
    const seen = new Set(), netAtlases = new Set(),
      frames = new Map(),
      unobserved = {};
    for (const room of Object.values(campaign.levels)) {
      const def = roomIndex[room.id];
      if (!def) continue;
      const sprites = roomSpriteIds(room, campaign.emitters).map(sprite => ({
        ...sprite, key: pipePlantPoses.has(sprite.id) ? room.spriteTileset + ':pipe-plant' + sprite.id :
          room.spriteTileset + '-' + sprite.id + (sprite.stomped ? ':stomped' : ''),
      }));
      const captureBonus = room.sprites.some((s) => s.spriteId === 0x82) && !frames.has('bonus/0');
      const captureDoor = room.sprites.some(s => s.spriteId === 0x54) && !netAtlases.has(room.atlas);
      if (!captureDoor && !captureBonus && !sprites.some(s => !seen.has(s.key))) continue;
      const state = execFileSync(loader, [romFile, String(def.layer1), String(def.layer2)]);
      // The graphics loader receives only the layer pointers; restore the
      // sprite header from the native level entry before allocating OAM.
      // Fishing Lakitu shares its eight line slots with the global OBJ plane.
      const spriteHeader = rom.byte(def.sprites);
      state[0x1692] = spriteHeader & 0x3f;
      state[0x190e] = spriteHeader & 0xc0;
      writeFileSync(memFile, state);
      parts(room, state, frames, rom);
      if (captureDoor) {
        captureOpenNetDoor(output, room, state, rom);
        netAtlases.add(room.atlas);
      }
      if (captureBonus) captureBonusSlots(rom, room, state, frames);
      if (!seen.size) capturePlayerFrames(output, runner, romFile, memFile, room.spritePalette, rom);
      for (const { id: spriteId, stomped, key } of sprites) {
        if (seen.has(key)) continue;
        seen.add(key);
        if (spriteId >= 0x62 && spriteId <= 0x64) captureRailPoses(runner, romFile, memFile, room, spriteId, frames);
        captureResidentPoses(runner, romFile, memFile, room, spriteId, frames);
        if (captureNpcPoses(runner, romFile, memFile, room, spriteId, stomped, key, frames)) continue;
        const plantPoses = pipePlantPoses.get(spriteId);
        const sampleCount = plantPoses ?? (spriteId === 0x35 ? 31 : 32);
        const run = spawnSync(runner, [romFile, memFile, String(spriteId), ...(stomped ? ['stomped'] : [])], {
          maxBuffer: 0x102a0 * sampleCount + 0x10000,
        });
        if (run.error || run.status !== 0) {
          throw Error(
            'Capture failed for ' + key + ': ' + (run.error?.message || run.stderr.toString().trim()),
          );
        }
        let poses = 0;
        for (let f = 0; f < sampleCount; f++) {
          const pos = (0x2a0 + 0x10000) * f;
          // In a pipe the head moves to OAM 65 while the body stays behind
          // the player at 68. Preserve these independently ordered pixels.
          const splitAtSlot = spriteId === 0x35 && f >= 16 && f <= 18 ? 68 : 0;
          const image = decode(
            run.stdout.subarray(pos, pos + 0x2a0),
            run.stdout.subarray(pos + 0x2a0, pos + 0x102a0),
            room.spritePalette,
            spriteId === 0x54 ? 48 : 0,
            splitAtSlot,
          );
          if (image) {
            if (platformOrigins.has(spriteId)) image.anchor = { x: 8, y: 16 };
            if (plantPoses) image.anchor = { x: 8, y: 16 };
            frames.set(key + '/' + f, image);
            poses++;
            if ([0x2c, 0x2d, 0x35].includes(spriteId)) {
              const oam = Buffer.from(run.stdout.subarray(pos, pos + 0x2a0));
              const vram = run.stdout.subarray(pos + 0x2a0, pos + 0x102a0);
              for (const [name, attribute] of Object.entries({ green: 10, red: 8, blue: 6, yellow: 4 })) {
                // Replace only the OAM palette row. The cartridge's complete
                // CGRAM row supplies the original saddle, shoe and skin tones.
                for (let slot = 0; slot < 128; slot++)
                  oam[4 * slot + 3] = (oam[4 * slot + 3] & 0xf1) | attribute;
                const painted = decode(oam, vram, room.spritePalette, 0, splitAtSlot);
                if (painted) frames.set(key + ':' + name + '/' + f, painted);
              }
            }
          }
        }
        if (plantPoses && poses !== plantPoses) throw Error('Incomplete pipe plant OAM: ' + key);
        if (!poses) {
          const reason = {
            0x19: 'Level message controller', 0x53: 'Throw block drawn from Map16',
            0x6d: 'Invisible solid block', 0x89: 'Layer 3 smash controller',
            0x8c: 'Side exit / fireplace controller', 0x8e: 'Invisible warp block',
            0xa0: 'Bowser captured in the Mode 7 arena', 0xc7: 'Invisible mushroom trigger',
          }[spriteId];
          if (!reason) throw Error('No visible OAM in native animation ' + key);
          unobserved[key] = reason;
        }
      }
    }
    atlas(output, frames, 'creatures');
    writeFileSync(
      join(output, 'creature-coverage.json'),
      JSON.stringify({ spriteTilesetPairs: seen.size, frames: frames.size, directionalNpcs: [...directionalNpcs], unobserved }, null, 2),
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
