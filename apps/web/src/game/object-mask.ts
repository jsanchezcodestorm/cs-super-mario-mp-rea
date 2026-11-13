import type { ObjPart } from './object-planes';

export function paintPart(ctx: CanvasRenderingContext2D, part: ObjPart) {
  const { x, y, w, h, flipX, flipY } = part;
  ctx.save();
  ctx.translate(x + (flipX ? w : 0), y + (flipY ? h : 0));
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(part.image, part.sx, part.sy, w, h, 0, 0, w, h);
  ctx.restore();
}

function overlaps(a: ObjPart, b: ObjPart) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Mask one articulated part locally while retaining its OAM rank against the rest of the scene. */
export class ObjectMask {
  private scratch = document.createElement('canvas');
  apply(part: ObjPart) {
    const masks = part.occluders?.filter(mask => overlaps(part, mask));
    if (!masks?.length) return part;
    const { scratch } = this;
    if (scratch.width < part.w || scratch.height < part.h) {
      scratch.width = Math.max(part.w, scratch.width);
      scratch.height = Math.max(part.h, scratch.height);
    }
    const ctx = scratch.getContext('2d')!;
    ctx.clearRect(0, 0, part.w, part.h);
    ctx.save();
    ctx.translate(-part.x, -part.y);
    paintPart(ctx, part);
    ctx.globalCompositeOperation = 'destination-out';
    for (const mask of masks) paintPart(ctx, mask);
    ctx.restore();
    return { ...part, image: scratch, sx: 0, sy: 0, flipX: false, flipY: false };
  }
}
