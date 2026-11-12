import type Phaser from 'phaser';
import { tiltFloor, type EntityState, type GameState } from '@smw/core';
import type { Camera } from './terrain-view';
interface BossArt {
  background?: string;
  decoys?: string[];
  frames: string[];
  platform?: string;
  wheel?: string;
}
type Arenas = Record<string, BossArt>;
const prefix = 'bosses/';

export function preloadBosses(scene: Phaser.Scene) {
  scene.load.once('filecomplete-json-boss-rooms', (_key: string, _type: string, arenas: Arenas) => {
    const files = new Set<string>();
    for (const arena of Object.values(arenas)) {
      if (arena.background) files.add(arena.background);
      for (const frame of arena.decoys ?? []) files.add(frame);
      for (const frame of arena.frames) files.add(frame);
      if (arena.platform) files.add(arena.platform);
      if (arena.wheel) files.add(arena.wheel);
    }
    for (const file of files) scene.load.image(prefix + file, '/assets/bosses/' + file);
  });
  scene.load.json('boss-rooms', '/assets/bosses/index.json');
}
function art(scene: Phaser.Scene, id: string) {
  return (scene.cache.json.get('boss-rooms') as Arenas)?.[id];
}
export function drawBossArena(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  id: string,
  state: GameState,
  camera: Camera,
) {
  const arena = art(scene, id);
  if (!arena?.background) throw Error('Arena Mode 7 assente: ' + id);
  const img = (file: string) => scene.textures.get(prefix + file).getSourceImage() as HTMLImageElement;
  // The captured native playfield starts above the world's collision origin.
  const offset = arena.platform ? 0 : arena.background.startsWith('bowser') ? 16 : 8;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 224);
  ctx.drawImage(img(arena.background), 0, offset);
  if (arena.platform) {
    const surface = img(arena.platform);
    ctx.save();
    ctx.translate(128 - camera.x, tiltFloor(state.tick, 128) - camera.y);
    ctx.rotate(Math.atan2(tiltFloor(state.tick, 215) - tiltFloor(state.tick, 41), 174));
    ctx.drawImage(surface, -surface.width / 2, 0);
    ctx.restore();
  }
  if (arena.wheel) {
    const reznor = state.entities.find((e) => e.roomId === id && e.spriteId === 0xa9);
    ctx.save();
    ctx.translate(128 - camera.x, 90 - camera.y);
    ctx.rotate(((reznor?.age ?? 0) * Math.PI) / 256);
    ctx.drawImage(img(arena.wheel), -56, -56, 112, 112);
    ctx.restore();
  }
}
export function bossFrame(scene: Phaser.Scene, e: EntityState, tick: number) {
  const arena = art(scene, e.roomId);
  if (!arena || !['boss', 'endingBoss', 'pipeDecoy'].includes(e.kind)) return null;
  const frames = e.kind === 'pipeDecoy' ? arena.decoys : arena.frames;
  if (!frames?.length) return null;
  const file = frames[Math.floor(tick / 10) % frames.length];
  return { texture: prefix + file, frame: '__BASE' };
}
