import type Phaser from 'phaser';
import { palFrame, type GameState } from '@smw/core';
import type { ObjectPlanes } from './object-planes';
import type { Camera } from './terrain-view';

interface ClusterArt {
  slots: number[];
  radius: number[];
  ringAngles: number[];
  fog: number[][];
}

export function preloadBooGroups(scene: Phaser.Scene) {
  scene.load.image('boo-groups', '/assets/boo-clusters.png');
  scene.load.json('boo-group-tables', '/assets/boo-clusters.json');
}

function fogBob(clock: number) {
  const phase = clock & 63;
  return phase < 32 ? (phase >> 3) + 1 : 7 - (phase >> 3);
}

export function queueBooGroups(scene: Phaser.Scene, objects: ObjectPlanes, roomId: string, state: GameState, camera: Camera) {
  const groups = state.booGroups?.[roomId];
  if (!groups?.length) return;
  const art = scene.cache.json.get('boo-group-tables') as ClusterArt;
  const image = scene.textures.get('boo-groups').getSourceImage() as HTMLImageElement;
  const frame = palFrame(state.tick);
  const draw = (slot: number, x: number, y: number, row: number, right: boolean, addSubscreen = false) => {
    if (x <= -16 || x >= 256 || y <= -16 || y >= 224) return;
    const pose = ((slot & 3) * 2) + ((frame >> 3) & 1);
    objects.queue({ image, sx: 16 * pose, sy: 16 * row, w: 16, h: 16,
      x, y, flipX: right, priority: 3, oam: art.slots[slot], addSubscreen });
  };
  const coord = (phase: number) => art.radius[phase & 255] * ((phase & 256) ? -1 : 1);
  for (const g of groups) {
    if (g.stopped) continue;
    if (g.ceiling) {
      for (const [slot, boo] of g.ceiling.ghosts.entries()) {
        let x = Math.floor(boo.x) - camera.x, y = Math.floor(boo.y) - camera.y;
        // Idle ceiling Boos wrap in the register's low byte as the camera moves.
        if (!boo.mode) { x &= 255; y &= 255; }
        draw(slot, x, y, boo.mode ? 0 : 1, boo.vx >= 0);
      }
    } else if (g.fogAnchor) {
      const age = g.age - 1, timer = (-age) & 255;
      if (timer < 32) continue;
      const palette = timer < 64 ? (timer - 32) >> 2 : timer >= 224 ? (256 - timer) >> 2 : 8;
      for (let slot = 0; slot < 20; slot++) {
        const alternate = ((age >> 8) + (slot === 0 ? 1 : 0)) & 1;
        const encoded = art.fog[alternate ? 0 : 1][slot];
        const clock = frame + 4 * slot;
        const displacement = fogBob(clock) - fogBob(clock - (age & 255) - 1);
        const flip = (art.fog[0][slot] & 128) === 0;
        draw(slot, (g.fogAnchor.x + (encoded & 240) - camera.x) & 255,
          (g.fogAnchor.y + ((encoded & 15) << 4) + displacement - camera.y) & 255,
          2 + Math.min(7, palette), flip, palette < 8);
      }
    } else {
      const rotation = (g.type === 0xe2 ? g.age : -g.age);
      for (const [index, angle] of art.ringAngles.entries()) {
        const phase = angle + rotation;
        draw(g.baseSlot + index, g.x + coord(phase) - camera.x,
          g.y + coord(phase + 128) - camera.y, 0, true);
      }
    }
  }
}
