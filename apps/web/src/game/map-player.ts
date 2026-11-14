import type Phaser from 'phaser';
import { activePlayerIds, mapPosition, palFrame, pathPosition, type GameState, type OverworldCommand, type OverworldStop, type PlayerId } from '@smw/core';
import { mapPresentation, type RevealData } from './map-reveal';

export type Poses = {
  idle: Record<string, number>;
  paths: Record<string, Record<OverworldCommand, [frame: number, pose: number][]>>;
};
export type MapActorView = { id: PlayerId; character: 'mario' | 'luigi'; region: number; x: number; y: number; pose: number; phase: number };

export function preloadMapPlayers(scene: Phaser.Scene) {
  scene.load.json('map-poses', '/assets/world/poses.json');
  scene.load.json('map-players', '/assets/world/players.json');
  scene.load.image('map-player-tiles', '/assets/world/players.png');
}

export function mapPlayerFrame(
  poses: Poses,
  character: 'mario' | 'luigi',
  travel: GameState['mapPlayers'][PlayerId]['travel'],
  frame: number,
) {
  let pose = poses.idle[character];
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

export function mapActors(
  state: GameState,
  paths: Record<string, OverworldStop>,
  reveals: RevealData,
  poses: Poses,
  frame: number,
): MapActorView[] {
  return activePlayerIds(state).map(id => {
    const view = mapPresentation(state, reveals, id);
    const stop = paths[view.id];
    if (!stop) throw Error('Posizione assente nella mappa della ROM: ' + view.id);
    let position = mapPosition(stop.position);
    if (view.travel) {
      const edge = paths[view.travel.from]?.directions[view.travel.command];
      if (!edge) throw Error('Tratto assente nella mappa della ROM: ' + view.travel.from + '/' + view.travel.command);
      position = pathPosition(edge, view.travel.elapsed, view.travel.command);
    }
    const actor = mapPlayerFrame(poses, state.players[id].character, view.travel, frame);
    return { id, character: state.players[id].character, ...position, pose: actor.pose, phase: actor.phase };
  });
}

export function drawMapPlayers(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  state: GameState,
  actors: MapActorView[],
) {
  const ids = activePlayerIds(state);
  const frames = scene.cache.json.get('map-players') as Record<string, number[][]>;
  const image = scene.textures.get('map-player-tiles').getSourceImage() as HTMLImageElement;
  const groups = actors.map((actor) => ({
    actor,
    peers: actors.filter((peer) => Math.abs(peer.x - actor.x) < 16 && Math.abs(peer.y - actor.y) < 16)
      .sort((a, b) => a.id.localeCompare(b.id)),
  }));
  for (const { actor, peers } of groups) {
    const { id, pose, phase } = actor;
    if (!ids.includes(id) || pose < 0) continue; // A pipe hides only its traveling player.
    const separation = peers.length > 1 ? (peers.findIndex((peer) => peer.id === id) - (peers.length - 1) / 2) * 8 : 0;
    const player = state.players[id];
    const mount = player.mounted ? player.yoshiColor : 'foot';
    const tile = frames[actor.character+'/'+mount][pose >> 1][phase];
    ctx.drawImage(image, (tile % 16)*32, (tile >> 4)*32, 32, 32, actor.x+separation-16, actor.y-24, 32, 32);
  }
}
