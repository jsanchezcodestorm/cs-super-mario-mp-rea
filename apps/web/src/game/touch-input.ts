import { Buttons } from '@smw/core';

const controlBits: Record<string, number> = {
  left: Buttons.left,
  right: Buttons.right,
  up: Buttons.up,
  down: Buttons.down,
  jump: Buttons.jump,
  run: Buttons.run,
  spin: Buttons.spin,
  action: Buttons.action,
  reserve: Buttons.reserve,
};

export class TouchInput {
  private readonly pointers = new Map<number, { bit: number; button: HTMLButtonElement }>();
  private taps = 0;

  constructor(private readonly root: HTMLElement | null) {
    root?.addEventListener('pointerdown', this.pointerDown);
    root?.addEventListener('pointerup', this.pointerUp);
    root?.addEventListener('pointercancel', this.pointerUp);
    root?.addEventListener('lostpointercapture', this.pointerUp);
    root?.addEventListener('click', this.keyboardClick);
    window.addEventListener('blur', this.clear);
  }

  private readonly pointerDown = (event: PointerEvent) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-control]');
    if (!button || !this.root?.contains(button)) return;
    const bit = controlBits[button.dataset.control ?? ''];
    if (!bit) return;
    event.preventDefault();
    this.taps |= bit;
    this.pointers.set(event.pointerId, { bit, button });
    button.classList.add('is-pressed');
    button.setPointerCapture(event.pointerId);
  };

  private readonly pointerUp = (event: PointerEvent) => {
    const active = this.pointers.get(event.pointerId);
    if (!active) return;
    this.pointers.delete(event.pointerId);
    if (![...this.pointers.values()].some(({ button }) => button === active.button))
      active.button.classList.remove('is-pressed');
  };

  private readonly keyboardClick = (event: MouseEvent) => {
    if (event.detail !== 0) return;
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-control]');
    if (button) this.taps |= controlBits[button.dataset.control ?? ''] ?? 0;
  };

  sample() {
    let buttons = this.taps;
    this.taps = 0;
    for (const { bit } of this.pointers.values()) buttons |= bit;
    return buttons;
  }

  clear = () => {
    for (const { button } of this.pointers.values()) button.classList.remove('is-pressed');
    this.pointers.clear();
    this.taps = 0;
  };

  destroy() {
    this.root?.removeEventListener('pointerdown', this.pointerDown);
    this.root?.removeEventListener('pointerup', this.pointerUp);
    this.root?.removeEventListener('pointercancel', this.pointerUp);
    this.root?.removeEventListener('lostpointercapture', this.pointerUp);
    this.root?.removeEventListener('click', this.keyboardClick);
    window.removeEventListener('blur', this.clear);
    this.clear();
  }
}
