import type { ObjectPlanes } from './object-planes';
import type Phaser from 'phaser';
import { palFrame, type GameState, type HitAward } from '@smw/core';
import { drawGoalCoins } from './goal-coin-view';
import { drawGoalStars } from './goal-stars-view';
import { drawBlockFragments } from './block-fragments';
import { drawContactFlash } from './contact-flash';
import { queueEffectTile, scoreRise } from './effect-tiles';
import type { Camera } from './terrain-view';

const frameFor: Record<HitAward, number> = {
  10: 1, 100: 5, 200: 6, 400: 7, 800: 8, 1000: 9, 2000: 10, 4000: 11, 8000: 12, '1up': 13,
};

function coinOffset(frame: number) {
  return Math.floor((-48 * frame + 3 * frame * (frame - 1) / 2) / 16);
}

export class RewardView {
  constructor(private scene: Phaser.Scene, private objects: ObjectPlanes) {}
  draw(state: GameState, room: string, camera: Camera) {
    const sheet = this.scene.textures.get('reward-tiles').getSourceImage() as HTMLImageElement;
    drawBlockFragments(this.objects, sheet, state, room, camera);
    const now = palFrame(state.tick);
    drawContactFlash(this.objects, sheet, state.rewardEffects ?? [], now, room, camera);
    const tile = (frame: number, x: number, y: number, priority: number, oam: number) =>
      queueEffectTile(this.objects, sheet, frame, x - camera.x, y - camera.y, priority, oam);
    const walk = state.goalWalk;
    if (walk && walk.roomId === room) {
      drawGoalStars(this.scene, this.objects, walk, state.tick);
      if (walk.coins) drawGoalCoins(this.objects, sheet,
        this.scene.textures.get('goal-coins').getSourceImage() as HTMLImageElement, walk, state.tick, camera);
    }
    for (const player of Object.values(state.players)) {
      if (player.roomId !== room || !player.starTrail) continue;
      for (const spark of player.starTrail.sparks) {
        const remaining = 22 - (now - spark.born);
        if (remaining >= 0 && remaining < 23)
          tile(27 + (remaining >> 3), spark.x, spark.y, 2, 20 + spark.slot);
      }
    }
    for (const effect of state.rewardEffects ?? []) {
      if (effect.roomId !== room) continue;
      const start = palFrame(effect.tick), age = now - start;
      if (effect.fromBlock && age < 26) {
        if (effect.coinSlot !== undefined) {
          const slot = effect.coinSlot;
          tile(14 + (((now + slot) >> 2) & 3), effect.x, effect.y + coinOffset(age + 1), 2, 12 + 2 * slot);
        }
        continue;
      }
      const scoreY = effect.y + (effect.fromBlock ? coinOffset(27) : 0);
      const first = start + (effect.fromBlock ? 27 : 0);
      const scoreAge = now - first;
      if (effect.fromBlock && effect.scoreSlot !== undefined) {
        // Smoke $05 spawns four eight-pixel sparkles, four native frames apart.
        const points = [[0, 4], [4, 12], [8, 4], [4, -4]];
        for (const [i, [dx, dy]] of points.entries()) {
          const timer = 22 - (scoreAge - 1 - 4 * i);
          if (timer >= 0 && timer <= 22)
            tile(22 + (timer >> 3), effect.x + dx, scoreY + dy, 2, 31 - i);
        }
      }
      if (effect.scoreSlot === undefined || scoreAge < 0 || scoreAge >= 48) continue;
      const rise = Math.min(scoreRise(first, scoreAge), Math.max(0, scoreY - camera.y - 3));
      tile(frameFor[effect.award], effect.x, scoreY - rise, 3, 44 + 2 * effect.scoreSlot);
    }
  }
}
