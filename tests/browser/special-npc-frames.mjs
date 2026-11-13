import { createGame, stepGame } from '@smw/core';
import { startCourse } from '../../packages/core/src/campaign.ts';
import { spawnEntity } from '../../packages/core/src/state.ts';
import { cameraFor } from '../../apps/web/src/game/terrain-view.ts';

export function captureSpecialNpcFrames(scene, content, show) {
  const shots = [], examples = {};
  function enter(id) {
    const campaign = { ...content, start: id, initial: [id] };
    const state = createGame(campaign);
    startCourse({ campaign, state }, id);
    state.players.luigi.status = 'spectator';
    show(state);
    return { campaign, state };
  }
  for (const facing of [-1, 1]) {
    const side = facing === 1 ? 'right' : 'left';
    const world = enter('106'), { state } = world, room = content.levels['106'];
    state.entities = [];
    const yoshi = spawnEntity(world, room.id, { spriteId: 0x35, x: 130, y: 305 });
    yoshi.facing = facing;
    const p = state.players.mario;
    p.x = 54;
    p.y = 304;
    for (const [tick, head] of [[8, 'closed'], [32, 'open']]) {
      while (state.tick < tick) stepGame(world.campaign, state, { mario: 0, luigi: 0 });
      const camera = cameraFor(room, p.x + p.width / 2, p.y + p.height / 2);
      scene.update(0, 0);
      const label = 'yoshi-' + side + '-' + head;
      examples[label] = scene.terrain.canvas.toDataURL();
      scene.cast.draw(room, camera, state);
      scene.objects.compose();
      const surface = document.createElement('canvas');
      surface.width = 256;
      surface.height = 224;
      const ctx = surface.getContext('2d');
      for (let band = 0; band < 4; band++) scene.objects.paint(ctx, band);
      const area = ctx.getImageData(Math.round(yoshi.x - camera.x) - 20, Math.round(yoshi.y - camera.y) - 32, 56, 64);
      const alpha = area.data.filter((_, i) => i % 4 === 3);
      let x0 = area.width, y0 = area.height, x1 = -1, y1 = -1;
      for (let i = 0; i < alpha.length; i++) if (alpha[i]) {
        const x = i % area.width, y = Math.floor(i / area.width);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const bytes = [];
      for (let y = y0; y <= y1; y++) bytes.push(...alpha.slice(y * area.width + x0, y * area.width + x1 + 1));
      shots.push({ label, bytes });
    }

    const arena = enter('1c7'), s = arena.state, boss = s.entities.find(e => e.kind === 'endingBoss');
    if (!boss) throw Error('Missing Bowser');
    s.entities = [boss];
    s.players.mario.x = facing < 0 ? 12 : 228;
    s.players.mario.y = 175;
    stepGame(arena.campaign, s, { mario: 0, luigi: 0 });
    s.entities = [boss]; // Isolate the car from the released Mechakoopa's foreground OBJ.
    if (boss.facing !== facing) throw Error('Bowser faced away from the player');
    const metadata = scene.cache.json.get('boss-rooms')['1c7'];
    for (const action of ['throw', 'hurt']) {
      boss.age = action === 'throw' ? 151 : 157;
      if (action === 'hurt') boss.hurtAt = 151;
      const label = 'bowser-' + side + '-' + action;
      const track = action + (facing > 0 ? '-right' : '');
      const file = metadata.tracks[track][action === 'throw' ? 127 : 5];
      const native = scene.textures.get('bosses/' + file).getSourceImage();
      const { dx, dy } = metadata.registration[file];
      const x = Math.round(boss.x + boss.width / 2) + dx, y = Math.round(boss.y + boss.height / 2) + dy;
      boss.active = false;
      scene.update(0, 0);
      const target = scene.terrain.context, expected = document.createElement('canvas');
      expected.width = native.width;
      expected.height = native.height;
      const ctx = expected.getContext('2d');
      ctx.drawImage(native, 0, 0);
      const reference = ctx.getImageData(0, 0, native.width, native.height);
      shots.push({ label, bytes: Array.from(reference.data) });
      ctx.putImageData(target.getImageData(x, y, native.width, native.height), 0, 0);
      ctx.drawImage(native, 0, 0);
      const composite = ctx.getImageData(0, 0, native.width, native.height).data;
      boss.active = true;
      scene.update(0, 0);
      const actual = target.getImageData(x, y, native.width, native.height).data;
      if (!actual.every((byte, i) => byte === composite[i])) throw Error('Wrong Mode 7 composition in ' + label);
      examples[label] = target.canvas.toDataURL();
    }
  }
  return { shots, examples };
}
