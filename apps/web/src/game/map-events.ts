import type Phaser from 'phaser';
import type { RevealFrame } from './map-reveal';

type Tile = [x: number, y: number, index: number];
interface MapEvents {
  ids: Record<string, number>;
  patches: Record<number, Record<number, Tile[]>>;
}
export interface MapAnimation {
  phases: number[];
  tracks: number[][];
  tiles: Tile[];
  events: Record<number, number>;
}

export function preloadMapEvents(scene: Phaser.Scene) {
  scene.load.json('map-events', '/assets/world/events.json');
  scene.load.image('map-event-tiles', '/assets/world/events.png');
  scene.load.json('map-animation', '/assets/world/animation.json');
  scene.load.image('map-animated-tiles', '/assets/world/animation.png');
}

export function drawMapTiles(
  scene: Phaser.Scene, ctx: CanvasRenderingContext2D, region: number, completed: string[],
  offsetX: number, offsetY: number, animation: MapAnimation, phase: number, reveal?: RevealFrame,
) {
  const events = scene.cache.json.get('map-events') as MapEvents;
  const fixed = scene.textures.get('map-event-tiles').getSourceImage() as HTMLImageElement;
  const animated = scene.textures.get('map-animated-tiles').getSourceImage() as HTMLImageElement;
  function draw(image: HTMLImageElement, x: number, y: number, index: number) {
    if (x+offsetX <= -8 || y+offsetY <= -8 || x+offsetX >= ctx.canvas.width || y+offsetY >= ctx.canvas.height) return;
    ctx.drawImage(image, (index % 32)*8, (index >> 5)*8, 8, 8, x+offsetX, y+offsetY, 8, 8);
  }
  for (const [x,y,track] of animation.tiles) draw(animated, x, y, animation.tracks[track][phase]);
  for (const exit of completed) {
    const changes = events.patches[events.ids[exit]]?.[region];
    if (!changes) continue;
    const active = reveal?.exit === exit && reveal.clip.region === region ? reveal : undefined;
    for (const [i, [x, y, index]] of changes.entries()) {
      if (active && active.age < active.clip.cells[i]) continue;
      const track = animation.events[index];
      if (track === undefined) draw(fixed, x, y, index);
      else draw(animated, x, y, animation.tracks[track][phase]);
    }
  }
}
