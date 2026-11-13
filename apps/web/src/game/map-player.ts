import type Phaser from 'phaser';
import { activePlayerIds, palFrame, type GameState, type OverworldCommand } from '@smw/core';

type Poses = {
  idle: Record<string, number>;
  paths: Record<string, Record<OverworldCommand, [frame: number, pose: number][]>>;
};
export function preloadMapPlayers(scene: Phaser.Scene) {
  scene.load.json('map-poses', '/assets/world/poses.json');
  scene.load.json('map-players', '/assets/world/players.json');
  scene.load.image('map-player-tiles', '/assets/world/players.png');
}

export function mapPlayerFrame(poses: Poses, id: string, travel: GameState['mapTravel'], frame: number) {
  let pose = poses.idle[id];
  if (travel) {
    const changes = poses.paths[travel.from][travel.command];
    const elapsed = palFrame(travel.elapsed);
    for (const [start, next] of changes) {
      if (start > elapsed) break;
      pose = next;
    }
  }
  // During a star launch bank 04 selects one whole direction every four PAL frames.
  return pose === -1 ? { pose: [2,6,0,4][(frame >> 2) & 3], phase: 0 } : { pose, phase: (frame >> 3) & 3 };
}

export function drawMapPlayers(
  scene: Phaser.Scene, ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number,
  pose: number, phase: number,
) {
  if (pose < 0) return; // Both players are hidden while a pipe reloads the map.
  const ids = activePlayerIds(state);
  const frames = scene.cache.json.get('map-players') as Record<string, number[][]>;
  const image = scene.textures.get('map-player-tiles').getSourceImage() as HTMLImageElement;
  ids.forEach((id, index) => {
    const player = state.players[id];
    const mount = player.mounted ? player.yoshiColor : 'foot';
    const tile = frames[id+'/'+mount][pose >> 1][phase];
    const offset = ids.length === 1 ? 0 : index === 0 ? -8 : 8;
    ctx.drawImage(image, (tile % 16)*32, (tile >> 4)*32, 32, 32, x+offset-16, y-24, 32, 32);
  });
}
