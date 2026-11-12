import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cartridge, expectedSha256 } from './cartridge.mjs';
import { exportGraphics } from './graphics.mjs';
import { exportAtlas } from './atlas.mjs';
import { decodeRoom } from './rooms.mjs';
import { motionTables } from './motion.mjs';
import { roomDirectory, chocolateIslandVariants, entranceScenes, courseIntro } from './directory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
function sourcePath() {
  if (process.argv[2]) return resolve(process.argv[2]);
  const paths = readdirSync(root).filter((p) => /\.(smc|sfc)$/i.test(p));
  if (paths.length !== 1) throw new Error('Supply exactly one cartridge path to tools/rom/extract.mjs');
  return join(root, paths[0]);
}

function extract(temp) {
  const rom = new Cartridge(sourcePath());
  const out = join(root, 'generated');
  mkdirSync(join(out, 'tiles'), { recursive: true });
  const working = join(temp, 'payload.sfc'),
    exe = join(temp, 'layout');
  writeFileSync(working, rom.data);
  execFileSync(
    process.env.CC || 'cc',
    [
      '-O2',
      join(here, 'machine.c'),
      join(here, 'vendor/lakesnes/cpu.c'),
      join(here, 'vendor/lakesnes/statehandler.c'),
      '-o',
      exe,
    ],
    { stdio: 'inherit' },
  );
  exportGraphics(rom, join(out, 'gfx'));
  const levels = {},
    atlases = new Map(),
    roomIndex = {};
  const world = JSON.parse(readFileSync(join(root, 'packages/core/data/world.json'), 'utf8'));
  const slots = roomDirectory(rom);
  for (const { key, layer1, layer2, sprites } of slots) {
    roomIndex[key] = { layer1, layer2, sprites };
  }
  const variants = chocolateIslandVariants(rom, slots);
  for (const record of [...slots, ...variants, ...entranceScenes(rom)]) {
    // Unused slots point at Nintendo's common development test room.
    if (record.layer1 === 0x068000) continue;
    const args = [working, String(record.layer1), String(record.layer2)];
    const state = execFileSync(exe, args);
    if (state.length !== 0x60000) throw new Error('Incomplete extraction for ' + record.key);
    const room = decodeRoom(rom, record, state);
    if (Object.hasOwn(world.names, room.id)) room.intro = courseIntro(rom, record.id, room.tileset);
    levels[room.id] = room;
    if (!atlases.has(room.atlas)) {
      atlases.set(room.atlas, exportAtlas(join(out, room.atlas), rom, state, room.spritePalette));
    }
    room.animatedTiles = atlases.get(room.atlas);
  }
  const campaign = {
    version: 1,
    romSha256: expectedSha256,
    start: '105',
    ...world,
    levels,
    ...motionTables(rom),
    emitters: JSON.parse(execFileSync(exe, [working, 'emitters'], { encoding: 'utf8' })),
  };
  writeFileSync(join(out, 'rooms-index.json'), JSON.stringify(roomIndex));
  writeFileSync(join(out, 'content.pending.json'), JSON.stringify(campaign));
  renameSync(join(out, 'content.pending.json'), join(out, 'content.json'));
  console.log(
    'E1: ' +
      Object.keys(levels).length +
      ' rooms, 512 source slots, ' +
      atlases.size +
      ' Map16 atlases, 52 graphics banks.',
  );
}
const temp = mkdtempSync(join(tmpdir(), 'smw-rooms-'));
try {
  extract(temp);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
