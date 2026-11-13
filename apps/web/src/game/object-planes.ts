import { ObjectMask, paintPart } from './object-mask';

// The PPU picks one visible OBJ pixel by OAM order before comparing that pixel
// with the background. Drawing four independently sorted sprite layers would
// let a lower-index sprite reveal an occluded sprite through a foreground tile.
export interface ObjPart {
  image: CanvasImageSource;
  sx: number; sy: number; w: number; h: number;
  x: number; y: number;
  flipX?: boolean; flipY?: boolean; alpha?: number;
  priority: number; oam: number;
  occluders?: readonly ObjPart[];
}
export class ObjectPlanes {
  private parts: ObjPart[] = [];
  private mask = new ObjectMask();
  private layers: CanvasRenderingContext2D[];
  constructor(width: number, height: number) {
    this.layers = Array.from({ length: 4 }, () => {
      const surface = document.createElement('canvas');
      surface.width = width;
      surface.height = height;
      const ctx = surface.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      return ctx;
    });
  }
  queue(part: ObjPart) {
    this.parts.push(part);
  }
  occlude(foreground: () => void, behind: () => void) {
    const start = this.parts.length;
    foreground();
    const end = this.parts.length;
    const occluders = this.parts.slice(start, end);
    behind();
    for (let i = end; i < this.parts.length; i++) this.parts[i].occluders = occluders;
  }
  compose() {
    const touched = new Set<number>();
    for (const ctx of this.layers) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.parts.sort((a, b) => b.oam - a.oam);
    for (const source of this.parts) {
      const part = this.mask.apply(source);
      const { priority } = part;
      touched.add(priority);
      for (const i of touched) {
        const ctx = this.layers[i];
        ctx.save();
        if (i !== priority) ctx.globalCompositeOperation = 'destination-out';
        else ctx.globalAlpha = part.alpha ?? 1;
        paintPart(ctx, part);
        ctx.restore();
      }
    }
    this.parts.length = 0;
  }
  paint(ctx: CanvasRenderingContext2D, priority: number) {
    ctx.drawImage(this.layers[priority].canvas, 0, 0);
  }
}
