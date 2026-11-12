import type Phaser from 'phaser';

type Tile = [x: number, y: number, index: number];
interface MapEvents {
  ids: Record<string, number>;
  patches: Record<number, Record<number, Tile[]>>;
}

export function preloadMapEvents(scene: Phaser.Scene) {
  scene.load.json('map-events', '/assets/world/events.json');
  scene.load.image('map-event-tiles', '/assets/world/events.png');
}

export function drawMapEvents(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  region: number,
  completed: string[],
  offsetX: number,
  offsetY: number,
) {
  const events = scene.cache.json.get('map-events') as MapEvents;
  const tiles = scene.textures.get('map-event-tiles').getSourceImage() as HTMLImageElement;
  for (const exit of completed) {
    const changes = events.patches[events.ids[exit]]?.[region];
    if (!changes) continue;
    for (const [x, y, index] of changes)
      ctx.drawImage(
        tiles,
        (index % 32) * 8,
        Math.floor(index / 32) * 8,
        8,
        8,
        x + offsetX,
        y + offsetY,
        8,
        8,
      );
  }
}
