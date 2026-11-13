import { Buttons } from '@smw/core';

export function buttonBit(button: HTMLButtonElement | null) {
  const name = button?.dataset.control;
  return name && Object.hasOwn(Buttons, name) ? Buttons[name as keyof typeof Buttons] : 0;
}

function directionAt(pad: HTMLElement, x: number, y: number) {
  const box = pad.getBoundingClientRect();
  if (!box.width || !box.height || x < box.left || x > box.right || y < box.top || y > box.bottom) return 0;
  const dx = 2 * (x - box.left) / box.width - 1;
  const dy = 2 * (y - box.top) / box.height - 1;
  if (Math.hypot(dx, dy) < 0.22) return 0;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? Buttons.right : Buttons.left;
  return dy > 0 ? Buttons.down : Buttons.up;
}

export interface TouchGesture {
  held: number;
  pending: number;
  pad: HTMLElement | null;
  runGroup: HTMLElement | null;
}

export function startGesture(target: Element, x: number, y: number): TouchGesture | undefined {
  const pad = target.closest<HTMLElement>('.touch-directions');
  const button = target.closest<HTMLButtonElement>('button[data-control]');
  const held = pad ? directionAt(pad, x, y) : buttonBit(button);
  if (!pad && !held) return;
  const runGroup = held === Buttons.run ? target.closest<HTMLElement>('.touch-actions') : null;
  return { held, pending: held, pad, runGroup };
}

export function dragGesture(gesture: TouchGesture, x: number, y: number) {
  const { pad, runGroup } = gesture;
  let next: number;
  if (pad) {
    next = directionAt(pad, x, y);
  } else if (runGroup) {
    const hit = runGroup.ownerDocument.elementFromPoint(x, y)?.closest<HTMLButtonElement>('button[data-control]');
    const jump = hit && runGroup.contains(hit) ? buttonBit(hit) & (Buttons.jump | Buttons.spin) : 0;
    next = Buttons.run | jump;
  } else {
    return false;
  }
  if (next === gesture.held) return false;
  // A fast direction reversal uses the latest sector. Brief action presses survive until the next game tick.
  gesture.pending = pad ? next : gesture.pending | (next & ~gesture.held);
  gesture.held = next;
  return true;
}
