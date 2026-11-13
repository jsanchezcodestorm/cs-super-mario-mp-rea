import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { objectives } from './coop/objectives.ts';
import type { OverworldTravel } from '@smw/core';
import { mapPlayerFrame } from '../apps/web/src/game/map-player.ts';
import { drawMapTiles, type MapAnimation } from '../apps/web/src/game/map-events.ts';
import type Phaser from 'phaser';

const resource = (name: string) => JSON.parse(readFileSync('generated/world/'+name+'.json', 'utf8'));

test('all native journeys have poses for walking, swimming, climbing, and transports', () => {
  const paths = resource('paths');
  const poses = resource('poses');
  assert.deepEqual(Object.keys(paths).sort(), Object.keys(poses.idle).sort());
  const players = resource('players');
  for (const [from, directions] of Object.entries(poses.paths)) {
    for (const [command, track] of Object.entries(directions as Record<string, [number, number][]>)) {
      assert.ok(paths[from].directions[command]);
      assert.equal(track[0][0], 0);
      for (const [frame, pose] of track) {
        const trip = { from, command, elapsed: Math.ceil(frame*6/5) } as OverworldTravel;
        const current = mapPlayerFrame(poses, paths[from].directions[command].to, trip, 12);
        assert.equal(current.pose, pose === -1 ? 4 : pose);
        if (current.pose < 0) continue;
        for (const id of ['mario', 'luigi']) {
          for (const mount of ['foot','green','red','blue','yellow'])
            assert.ok(Number.isInteger(players[id+'/'+mount][current.pose >> 1][current.phase]));
        }
      }
    }
  }
  assert.deepEqual(mapPlayerFrame(poses,'105', undefined, 24), { pose: 2, phase: 3 });
  assert.deepEqual(mapPlayerFrame(poses,'002', undefined, 8), { pose: 10, phase: 1 });
});

test('animated map tiles retain their palette and graphics cycles under completed path overlays', () => {
  const animation: MapAnimation[] = resource('animation');
  const events = resource('events');
  assert.deepEqual(animation.map(region => region.phases.length), [128,128,128,128,1024,128,128]);
  for (const [region, map] of animation.entries()) {
    assert.ok(map.tiles.length);
    const phases = new Set(map.phases);
    for (const track of map.tracks) assert.equal(track.length, phases.size);
    const event = Object.entries(events.ids).find(([,id]) =>
      events.patches[id as number]?.[region]?.some((tile: number[]) => map.events[tile[2]] !== undefined));
    assert.ok(event);
    const [exit, eventId] = event;
    const [x,y,index] = events.patches[eventId as number][region].find((tile: number[]) => map.events[tile[2]] !== undefined);
    const track = map.tracks[map.events[index]];
    const draws: [string, number][] = [];
    const scene = {
      cache: { json: { get: () => events } },
      textures: { get: (name: string) => ({ getSourceImage: () => name }) },
    } as unknown as Phaser.Scene;
    const ctx = {
      canvas: { width: 8, height: 8 },
      drawImage: (image: string, sx: number, sy: number) => draws.push([image, sx/8+32*sy/8]),
    } as unknown as CanvasRenderingContext2D;
    for (const phase of phases) {
      drawMapTiles(scene, ctx, region, [exit], -x, -y, map, phase);
      assert.deepEqual(draws.at(-1), ['map-animated-tiles', track[phase]]);
    }
  }
});

test('each campaign exit with a local event has a complete PAL reveal', () => {
  const campaign = JSON.parse(readFileSync('generated/content.json','utf8'));
  const { clips } = resource('reveal');
  const events = resource('events');
  const nodes = resource('nodes');
  const withoutLocalClip: string[] = [];
  for (const {id, course} of objectives(campaign)) {
    const region = nodes[course].region;
    const patches = events.patches[events.ids[id]]?.[region] ?? [];
    const clip = clips[id];
    if (clip) {
      assert.equal(clip.region, region);
      assert.equal(clip.cells.length, patches.length);
      assert.ok(clip.duration > 0 && clip.fx.length > 0);
    } else {
      assert.equal(patches.length, 0);
      withoutLocalClip.push(id);
    }
  }
  assert.deepEqual(withoutLocalClip.sort(), ['002:normal','117:normal','130:normal','132:normal']);
  for (const palace of ['014','121','11b','008']) assert.equal(clips[palace+':normal'].duration,223);
});

test('a first clear presents the native road while progression and player orders continue immediately', async () => {
  const { mapPresentation } = await import('../apps/web/src/game/map-reveal.ts');
  const { createGame, Buttons } = await import('@smw/core');
  const { finishCourse, startCourse } = await import('../packages/core/src/campaign.ts');
  const { navigateOverworld } = await import('../packages/core/src/overworld.ts');
  const campaign = JSON.parse(readFileSync('generated/content.json', 'utf8'));
  const state = createGame(campaign), world = { campaign,state };
  startCourse(world,'105');
  finishCourse(world,state.players.mario);
  const reveals = resource('reveal'), clip = reveals.clips['105:normal'];
  assert.ok(state.progress.unlocked.includes('014'));
  navigateOverworld(world,{mario:0,luigi:0});
  assert.deepEqual([mapPresentation(state,reveals).id,mapPresentation(state,reveals).reveal?.age], ['105',0]);
  for (let i=0; i<Math.ceil(clip.duration*6/5); i++) {
    state.tick++;
    navigateOverworld(world,{mario:0,luigi:0});
  }
  assert.equal(mapPresentation(state,reveals).reveal,undefined);
  const resumed = createGame(campaign);
  assert.equal(mapPresentation(resumed,reveals).reveal,undefined);
  navigateOverworld(world,{mario:0,luigi:Buttons.left});
  assert.equal(state.mapReveal,undefined);
});
