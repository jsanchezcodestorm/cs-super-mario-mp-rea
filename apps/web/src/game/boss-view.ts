import type Phaser from 'phaser';
import { palFrame, tiltFloor, type EntityState, type GameState } from '@smw/core';
import type { Camera } from './terrain-view';
import type { ObjectPlanes } from './object-planes';

type ObjRegistration = { priority: number; oam: number };
interface BossArt {
  background?: string;
  tracks: Record<string, string[]>;
  platform?: string;
  wheel?: string;
  registration: Record<string, ObjRegistration | { plane: 'mode7'; dx?: number; dy?: number }>;
  bands?: { file: string; beforeObj: number }[];
  scenery?: ({ file: string } & ObjRegistration)[];
}
type Arenas = Record<string, BossArt>;
const prefix = 'bosses/';
const offsetY = (arena: BossArt) => arena.platform ? 0 : arena.background?.startsWith('bowser') ? 16 : 8;

export function preloadBosses(scene: Phaser.Scene) {
  scene.load.once('filecomplete-json-boss-rooms', (_key: string, _type: string, arenas: Arenas) => {
    const files = new Set<string>();
    for (const arena of Object.values(arenas)) {
      if (arena.background) files.add(arena.background);
      for (const track of Object.values(arena.tracks))
        for (const frame of track) files.add(frame);
      for (const layer of [...(arena.bands ?? []), ...(arena.scenery ?? [])]) files.add(layer.file);
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
function image(scene: Phaser.Scene, file: string) {
  return scene.textures.get(prefix + file).getSourceImage() as HTMLImageElement;
}
export function queueArenaScenery(scene: Phaser.Scene, objects: ObjectPlanes, room: string) {
  const arena = art(scene, room);
  for (const part of arena?.scenery ?? []) {
    const img = image(scene, part.file);
    objects.queue({ image: img, sx: 0, sy: 0, w: img.width, h: img.height,
      x: 0, y: offsetY(arena), oam: part.oam, priority: part.priority });
  }
}
export function bossFrame(scene: Phaser.Scene, e: EntityState) {
  const arena = art(scene, e.roomId);
  if (!arena || !['boss', 'endingBoss', 'pipeDecoy'].includes(e.kind)) return null;
  let track = e.spriteId === 0xa9 ? 'wheel' + (e.origin.x / 16 - 1)
    : e.kind === 'pipeDecoy' ? 'decoy' + e.pipeOffset : 'main';
  let frame = palFrame(e.age);
  if (e.kind === 'endingBoss') {
    const sinceHit = e.hurtAt === undefined ? Infinity : frame - palFrame(e.hurtAt);
    if (sinceHit < arena.tracks.hurt.length) {
      track = 'hurt';
      frame = sinceHit;
    } else {
      // Bowser releases the Mechakoopa at native timer $80, index 127 in
      // the $FF countdown. Align the gesture with the co-op spawn tick.
      const sinceThrow = (e.age + 149) % 150;
      track = 'throw';
      frame = 127 + Math.floor(sinceThrow * arena.tracks.throw.length / 150);
    }
  }
  const frames = arena.tracks[track];
  const file = frames[frame % frames.length];
  return { texture: prefix + file, frame: '__BASE', registration: arena.registration[file] };
}

function drawMode7Plane(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, arena: BossArt, id: string,
  state: GameState, camera: Camera) {
  if (arena.platform) {
    const surface = image(scene, arena.platform);
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
    ctx.drawImage(image(scene, arena.wheel), -56, -56, 112, 112);
    ctx.restore();
  }
  for (const e of state.entities) {
    if (!e.active || e.roomId !== id || (e.stunnedUntil && e.stunnedUntil > e.age)) continue;
    const pose = bossFrame(scene, e);
    if (!pose || !('plane' in pose.registration)) continue;
    const img = scene.textures.get(pose.texture).getSourceImage() as HTMLImageElement;
    ctx.save();
    const anchorY = pose.registration.dy === undefined ? e.height : e.height / 2;
    ctx.translate(Math.round(e.x + e.width / 2 - camera.x), Math.round(e.y + anchorY - camera.y));
    if (e.vx > 0) ctx.scale(-1, 1);
    ctx.drawImage(img, pose.registration.dx ?? -Math.round(img.width / 2), pose.registration.dy ?? -img.height);
    ctx.restore();
  }
}

export function drawBossArena(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, id: string, state: GameState,
  camera: Camera, objects: ObjectPlanes) {
  const arena = art(scene, id);
  if (!arena?.background) throw Error('Arena Mode 7 assente: ' + id);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 224);
  ctx.drawImage(image(scene, arena.background), 0, offsetY(arena));
  // IRQ switches the castle stripes to Mode 1 on individual scanlines.
  // Native Mode 7 BG1 itself is between OBJ0 and OBJ1.
  for (let band = 0; band <= 4; band++) {
    for (const stripe of arena.bands ?? [])
      if (stripe.beforeObj === band) ctx.drawImage(image(scene, stripe.file), 0, offsetY(arena));
    if (band === 1) drawMode7Plane(scene, ctx, arena, id, state, camera);
    if (band < 4) objects.paint(ctx, band);
  }
}
