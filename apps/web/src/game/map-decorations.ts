import type Phaser from 'phaser';
import type { RevealFrame } from './map-reveal';
import { clipMapObject, mapObjectMask, type Occlusion } from './map-obj-mask';
import { mapPosition, palFrame, type GameState, type MapCloud, type PlayerId } from '@smw/core';

type Part = [x: number, y: number, tile: number, oam: number];
type Clip = { start: number; frames: Part[][] };
type Placement = { region: number; slot: number; offset: [number, number]; track: Clip };
export interface Decorations {
  actors: Placement[];
  fish: Record<string, Clip & { until: number }>;
  fishArt: number[][][];
  priorities: number[];
  occlusion: Occlusion;
  clouds: [number, number];
}

export function preloadMapDecorations(scene: Phaser.Scene) {
  scene.load.json('map-decorations', '/assets/world/decorations.json');
  scene.load.image('map-decoration-tiles', '/assets/world/decorations.png');
}

type Trip = Pick<NonNullable<GameState['mapPlayers'][PlayerId]['travel']>, 'from' | 'command' | 'elapsed'>;
function fishFrame(data: Decorations, frame: number, trips: (Trip | undefined)[]) {
  let available = -Infinity;
  let parts: Part[][] | undefined, age = 0;
  for (const trip of trips) {
    if (!trip) continue;
    const clip = data.fish[trip.from + '/' + trip.command];
    if (!clip) continue;
    const departure = frame - palFrame(trip.elapsed);
    const start = Math.max(departure + clip.start, available);
    // While a fish is airborne, the native tile trigger waits until its slot
    // is free. Reversing direction may leave the trigger cell before that.
    if (start >= departure + clip.until || start > frame) continue;
    age = frame - start;
    parts = clip.frames;
    available = start + parts.length + 1;
  }
  const current = parts?.[age];
  if (!current) return;
  const falling = age > 36;
  const flip = (frame - age) & 1;
  const body = data.fishArt[Number(falling)][flip][Number(!!(frame & (falling ? 16 : 8)))];
  return current.map(([x, y, tile, oam]): Part => [x, y, oam === 70 ? body : tile, oam]);
}

/** Each frame retains native OAM slot numbers and world coordinates, including offscreen movers. */
export function decorationParts(data: Decorations, region: number, frame: number, forestOpen: boolean,
  clouds: (MapCloud | null)[] | undefined,
  camera: { x: number; y: number }, travel?: Trip, previous?: Trip, earlier?: Trip) {
  const slots = new Map<number, Part>();
  const origin = mapPosition([region, 0, 0]);
  for (const { region: map, slot, offset, track } of data.actors) {
    if (map !== region || (region === 3 && slot === 15 && !forestOpen)) continue;
    const period = track.frames.length - track.start;
    const index = frame < track.start ? frame : track.start + (frame - track.start) % period;
    for (const [x, y, tile, oam] of track.frames[index])
      slots.set(oam, [x + offset[0] + origin.x, y + offset[1] + origin.y, tile, oam]);
  }
  if (region === 0) {
    // A jumping Cheep Cheep retains its single native slot as the player stops or reverses.
    const fish = fishFrame(data, frame, [earlier, previous, travel]);
    for (const part of fish ?? []) slots.set(part[3], part);
    const active = (clouds ?? []).filter(c => c !== null).sort((a, b) => a.y - b.y);
    let oam = 28;
    for (const cloud of active) {
      const y = Math.floor(cloud.y) - cloud.z;
      for (const [i, tile] of data.clouds.entries()) {
        const x = Math.floor(cloud.x) + i * 16;
        if (x < camera.x || x >= camera.x + 256 || y < camera.y || y >= camera.y + 256) continue;
        slots.set(oam, [x, y, tile, oam]);
        oam--;
      }
    }
  }
  return [...slots.values()].sort((a, b) => b[3] - a[3]);
}

export function mapDecorations(scene: Phaser.Scene, state: GameState, region: number, frame: number,
  playerId: PlayerId, camera: { x: number; y: number }, travel?: Trip,
  arrival?: GameState['mapPlayers'][PlayerId]['arrival'], reveal?: RevealFrame) {
  const data = scene.cache.json.get('map-decorations') as Decorations;
  const events = scene.cache.json.get('map-events').ids as Record<string, number>;
  const visible = state.progress.completed.some(id => events[id] === 43 || events[id] === 46);
  const previous = arrival && { ...arrival, elapsed: state.tick - arrival.departed };
  const earlier = arrival?.previous && { ...arrival.previous, elapsed: state.tick - arrival.previous.departed };
  return {
    parts: decorationParts(data, region, frame, visible, state.mapClouds?.[playerId], camera, travel, previous, earlier),
    blocked: mapObjectMask(data.occlusion, region, frame, state.progress.completed, events, reveal),
    priorities: data.priorities,
  };
}

export function drawMapDecorations(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, decorations: ReturnType<typeof mapDecorations>,
  offsetX: number, offsetY: number, foreground: boolean) {
  const image = scene.textures.get('map-decoration-tiles').getSourceImage() as HTMLImageElement;
  for (const [x, y, tile, oam] of decorations.parts) {
    // Mario/Luigi occupy OBJ slots 39..46 on the overworld.
    if ((oam < 39) !== foreground) continue;
    if (x + offsetX <= -16 || x + offsetX >= 256 || y + offsetY <= -16 || y + offsetY >= 180) continue;
    const low = decorations.priorities[tile] < 2;
    if (low) {
      ctx.save();
      clipMapObject(ctx, decorations.blocked, x, y, offsetX, offsetY);
    }
    ctx.drawImage(image, (tile % 16) * 16, (tile >> 4) * 16, 16, 16, x + offsetX, y + offsetY, 16, 16);
    if (low) ctx.restore();
  }
}
