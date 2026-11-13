import type Phaser from 'phaser';
import { goalWalkFrame, type GameState } from '@smw/core';
import type { Stage } from './content';

type Walk = NonNullable<GameState['goalWalk']>;

export function goalFadePhase(walk: Walk, tick: number) {
  const { age, saluteAt } = goalWalkFrame(walk, tick);
  if (age < saluteAt - 1) return Math.min(32, Math.floor((age + 1) / 4));
  return 33 + Math.min(32, Math.floor((age - saluteAt + 3) / 4));
}

function surface(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c.getContext('2d', { willReadFrequently: true })!;
}

/** Apply the ROM's fade only to the tiles and CGRAM entries it modifies. */
export class GoalFade {
  private atlas?: string;
  private source!: ImageData;
  private protected!: [number, number, number, number][];
  private ctx!: CanvasRenderingContext2D;
  private output!: ImageData;
  private phase = NaN;
  private backdrop = '';

  constructor(private scene: Phaser.Scene) {}
  draw(stage: Stage, image: HTMLImageElement, walk: Walk, tick: number) {
    const phase = goalFadePhase(walk, tick);
    if (this.atlas !== stage.atlas) {
      this.atlas = stage.atlas;
      this.phase = NaN;
      this.ctx = surface(image.width, image.height);
      this.ctx.drawImage(image, 0, 0);
      this.source = this.ctx.getImageData(0, 0, image.width, image.height);
      this.output = this.ctx.createImageData(image.width, image.height);
      this.protected = this.scene.cache.json.get('goal-palettes')[stage.atlas];
    }
    if (phase !== this.phase) {
      this.phase = phase;
      const ramps: number[][] = this.scene.cache.json.get('goal-fade').levels;
      const darkening = phase < 33;
      const channel = ramps[darkening ? phase : phase - 33].map((n, i) => {
        const v = darkening ? i - n : n;
        return (v << 3) | (v >> 2);
      });
      const { data } = this.source, out = this.output.data;
      for (let i = 0; i < out.length; i += 4) {
        if (!data[i+3]) continue;
        for (let c = 0; c < 3; c++) out[i+c] = channel[data[i+c] >> 3];
        out[i+3] = 255;
      }
      this.ctx.putImageData(this.output, 0, 0);
      for (const [x, y, w, h] of this.protected) this.ctx.drawImage(image, x, y, w, h, x, y, w, h);
      const rgb = Number.parseInt(stage.backgroundColor.slice(1), 16);
      this.backdrop = 'rgb(' + [16,8,0].map(shift => channel[(rgb >> shift & 255) >> 3]).join(',') + ')';
    }
    return { atlas: this.ctx.canvas, backdrop: this.backdrop };
  }
}
