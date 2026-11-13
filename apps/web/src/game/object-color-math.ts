import type { ObjPart } from './object-planes';
import { paintPart } from './object-mask';

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d')!;
}

/** PAL ghost-house fades add the sub-screen colour to the winning OBJ pixel.
 * Mask before BG compositing, so an opaque lower OAM slot keeps its own colour. */
export class ObjectColorMath {
  private buffers = new Map<number, CanvasRenderingContext2D>();
  private masks = new Map<number, CanvasRenderingContext2D>();
  private output: CanvasRenderingContext2D;
  private background: CanvasRenderingContext2D;
  constructor(private width: number, private height: number) {
    this.output = surface(width, height);
    this.background = surface(width, height);
  }

  compose(parts: ObjPart[]) {
    this.masks.clear();
    if (!parts.some(p => p.addSubscreen)) return;
    for (const part of parts) {
      for (const mask of this.masks.values()) {
        mask.globalCompositeOperation = 'destination-out';
        paintPart(mask, part);
      }
      if (!part.addSubscreen) continue;
      let mask = this.masks.get(part.priority);
      if (!mask) {
        mask = this.buffers.get(part.priority) ?? surface(this.width, this.height);
        mask.clearRect(0, 0, this.width, this.height);
        this.buffers.set(part.priority, mask);
        this.masks.set(part.priority, mask);
      }
      mask.globalCompositeOperation = 'source-over';
      paintPart(mask, part);
    }
  }

  captureSubscreen(screen: HTMLCanvasElement) {
    if (this.masks.size) this.background.drawImage(screen, 0, 0);
  }

  paint(ctx: CanvasRenderingContext2D, priority: number, layer: HTMLCanvasElement) {
    const mask = this.masks.get(priority);
    if (!mask) { ctx.drawImage(layer, 0, 0); return; }
    const out = this.output;
    out.globalCompositeOperation = 'copy';
    out.drawImage(this.background.canvas, 0, 0);
    out.globalCompositeOperation = 'destination-in';
    out.drawImage(mask.canvas, 0, 0);
    out.globalCompositeOperation = 'lighter';
    out.drawImage(layer, 0, 0);
    ctx.drawImage(out.canvas, 0, 0);
  }
}
