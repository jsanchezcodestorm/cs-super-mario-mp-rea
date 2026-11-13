import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type Phaser from 'phaser';
import type { EntityState } from '@smw/core';
import { frameForEntity } from '../apps/web/src/game/actors-view.ts';
import { bossFrame } from '../apps/web/src/game/boss-view.ts';
import { drawPlatform } from '../apps/web/src/game/platform-view.ts';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const registration = json('generated/creatures-registration.json');
const atlas = { has: (frame: string) => frame in registration };
const webTick = (pal: number) => Math.ceil(pal * 6 / 5);
const pose = (data: Partial<EntityState>, pal: number, tileset: number) =>
  frameForEntity(data as EntityState, webTick(pal), tileset, atlas)?.frame;

test('every recorded standard OBJ sequence draws at every PAL phase, including the loop seam', () => {
  const sequences = new Set(Object.keys(registration).filter(key => /^\d+-\d+(?::\w+)?\/\d+$/.test(key))
    .map(key => key.split('/')[0]));
  assert.ok(sequences.size > 400);
  for (const name of sequences) {
    const [, tileset, id, variant] = /^(\d+)-(\d+)(?::(\w+))?$/.exec(name)!;
    if (+id === 0x35) continue; // riding Yoshi uses individually addressed poses
    const prefix = name + '/';
    for (let phase = 0; phase < 32; phase++) assert.ok(atlas.has(prefix + phase), prefix + phase);
    if (variant) continue;
    for (const phase of [0, 1, 31, 32]) {
      const kind = +id === 0x6a ? 'coinGameCloud' : [0x83, 0x84].includes(+id) ? 'flyingQuestion' : 'walker';
      assert.equal(pose({ spriteId: +id, kind }, phase, +tileset), prefix + (phase % 32));
    }
  }
});

test('every shell color spins through four native OAM phases only in the kicked state', () => {
  for (const tileset of [0, 1, 8, 14]) {
    for (const [index, color] of (['green', 'red', 'blue', 'yellow'] as const).entries()) {
      const shell = { kind: 'shell', shellColor: color } as const;
      for (const vx of [-3, 0, 3]) {
        for (let f = 0; f < 33; f++) {
          const prefix = tileset + ':shell' + (index + 4) + '/';
          const frame = pose({ ...shell, vx }, f, tileset)!;
          assert.ok(atlas.has(frame));
          assert.equal(frame, prefix + (vx ? (f >> 2) & 3 : 0));
          assert.equal(pose({ ...shell, vx, tossed: true }, f, tileset), prefix + '0');
        }
      }
    }
  }
});

test('grounded Koopa transformations and boss shots have art in the rooms that produce them', () => {
  for (const [tileset, id] of [[8, 4], [10, 5], [3, 5], [14, 5], [1, 7], [13, 0x34], [0, 0xa2]]) {
    assert.ok(pose({ spriteId: id, kind: 'walker' }, 0, tileset), tileset + '-' + id);
  }
  const raster = json('generated/creatures.json').frames;
  const stomped = Object.keys(registration).filter(k => /^\d+-(162|171):stomped\/0$/.test(k));
  assert.ok(stomped.some(k => k.includes('-162:')) && stomped.some(k => k.includes('-171:')));
  for (const name of stomped) {
    const [tileset, id] = name.split(':')[0].split('-').map(Number);
    const subject = { spriteId: id, kind: id === 0xab ? 'rex' : 'mechaShell', hp: 1 } as const;
    assert.equal(pose(subject, 0, tileset), name);
    assert.ok(atlas.has(name));
    assert.notDeepEqual(raster[name].frame, raster[tileset + '-' + id + '/0'].frame);
  }
});

test('all six gray platform components follow the moving deck with native OBJ slot order', () => {
  const e = { id: 'deck', spriteId: 0xa3, origin: { x: 120, y: 112 } } as EntityState;
  const placements: Record<number, [number, number, number]> = {};
  drawPlatform(e, 104, 160, 0, (_key, frame, x, bottom) => {
    const slot = Number(frame.split('/')[1]);
    assert.match(frame, /^0:gray-platform\//);
    placements[slot] = [x, bottom, registration[frame].oam];
  });
  const first = placements[0][2];
  assert.deepEqual(Object.values(placements), [
    [144, 176, first], [128, 176, first + 1], [112, 176, first + 2],
    [128, 176, first + 3], [128, 160, first + 4], [128, 144, first + 5],
  ]);
});

test('a brown chained platform draws both endpoints, four intermediate links and its deck', () => {
  const e = { id: 'swing', spriteId: 0x5f, origin: { x: 64, y: 80 } } as EntityState;
  const parts: Array<[string, string, number, number]> = [];
  drawPlatform(e, 72, 256, 0, (key, frame, x, bottom) => parts.push([key, frame, x, bottom]));
  assert.equal(parts.length, 10);
  assert.deepEqual(parts.slice(0, 6), [
    ['swing/0', '0:brown-platform/0', 104, 272],
    ['swing/1', '0:brown-platform/0', 104, 192],
    ['swing/2', '0:brown-platform/0', 104, 208],
    ['swing/3', '0:brown-platform/0', 104, 224],
    ['swing/4', '0:brown-platform/0', 104, 240],
    ['swing/5', '0:brown-platform/0', 104, 256],
  ]);
  assert.deepEqual(parts.slice(6), [
    ['swing/6', '0:brown-platform/5', 128, 272],
    ['swing/7', '0:brown-platform/6', 112, 272],
    ['swing/8', '0:brown-platform/7', 96, 272],
    ['swing/9', '0:brown-platform/8', 80, 272],
  ]);
});

test('Morton and Roy walk in a 16-PAL-frame cycle and Bowser advances his propeller every two', () => {
  const manifest = json('generated/bosses/index.json');
  const scene = { cache: { json: { get: () => manifest } } } as unknown as Phaser.Scene;
  for (const room of ['0e5', '0cc']) {
    const frames = manifest[room].tracks.main;
    assert.equal(frames.length, 16);
    assert.equal(new Set(frames).size, 3);
    for (let f = 0; f <= 32; f++)
      assert.equal(bossFrame(scene, { roomId: room, kind: 'boss', age: webTick(f) } as EntityState)!.texture,
        'bosses/' + frames[f % 16]);
  }
  const bowser = manifest['1c7'].tracks.main;
  assert.equal(new Set(bowser.slice(0, 8)).size, 4);
  assert.ok(new Set(manifest['0d9'].tracks.main).size > 2);
});

test('Bowser releases a Mechakoopa on the captured attack frame and reacts to an actual hit', () => {
  const arena = json('generated/bosses/index.json')['1c7'];
  const scene = { cache: { json: { get: () => ({ '1c7': arena }) } } } as unknown as Phaser.Scene;
  const bowser = { roomId: '1c7', kind: 'endingBoss', age: 151 } as EntityState;
  const frame = () => bossFrame(scene, bowser)!;
  assert.equal(arena.tracks.throw.length, 255);
  assert.equal(arena.tracks.hurt.length, 76);
  assert.equal(frame().texture, 'bosses/' + arena.tracks.throw[127]);
  bowser.hurtAt = 151;
  assert.equal(frame().texture, 'bosses/' + arena.tracks.hurt[0]);
  bowser.age += 12;
  assert.equal(frame().texture, 'bosses/' + arena.tracks.hurt[10]);
  assert.ok('dx' in frame().registration && 'dy' in frame().registration);
  bowser.age += 100;
  assert.ok(arena.tracks.throw.includes(frame().texture.slice('bosses/'.length)));
});
