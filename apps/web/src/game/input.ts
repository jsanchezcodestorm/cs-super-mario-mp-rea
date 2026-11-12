import { Buttons } from '@smw/core';

const keys: Record<string, number> = {
  ArrowLeft: Buttons.left,
  ArrowRight: Buttons.right,
  ArrowUp: Buttons.up,
  ArrowDown: Buttons.down,
  KeyZ: Buttons.jump,
  Space: Buttons.jump,
  KeyX: Buttons.run,
  ShiftLeft: Buttons.run,
  KeyA: Buttons.spin,
  Enter: Buttons.action,
};

export class Controls {
  private pressed = new Set<string>();
  private readonly toggle = (event: KeyboardEvent) => {
    if (!Object.hasOwn(keys, event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.type === 'keyup') {
      this.pressed.delete(event.code);
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea')) return;
    event.preventDefault();
    this.pressed.add(event.code);
  };
  private readonly clear = () => this.pressed.clear();

  constructor() {
    window.addEventListener('keydown', this.toggle);
    window.addEventListener('keyup', this.toggle);
    window.addEventListener('blur', this.clear);
  }

  sample() {
    let buttons = 0;
    for (const key of this.pressed) buttons |= keys[key];
    const pad = navigator.getGamepads?.().find((p) => p?.connected && p.mapping === 'standard');
    if (!pad) return buttons;
    for (const [index, bit] of [
      [0, Buttons.jump],
      [1, Buttons.run],
      [2, Buttons.spin],
      [3, Buttons.action],
      [12, Buttons.up],
      [13, Buttons.down],
      [14, Buttons.left],
      [15, Buttons.right],
    ]) {
      if (pad.buttons[index]?.pressed) buttons |= bit;
    }
    if (pad.axes[0] < -0.35) buttons |= Buttons.left;
    if (pad.axes[0] > 0.35) buttons |= Buttons.right;
    if (pad.axes[1] < -0.35) buttons |= Buttons.up;
    if (pad.axes[1] > 0.35) buttons |= Buttons.down;
    return buttons;
  }
  destroy() {
    window.removeEventListener('keydown', this.toggle);
    window.removeEventListener('keyup', this.toggle);
    window.removeEventListener('blur', this.clear);
  }
}
