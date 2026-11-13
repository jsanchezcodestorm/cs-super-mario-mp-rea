import { buttonBit, dragGesture, startGesture, type TouchGesture } from './touch-gesture';

export class TouchInput {
  private readonly pointers = new Map<number, TouchGesture>();
  private readonly listeners = new AbortController();
  private readonly buttons: HTMLButtonElement[];
  private taps = 0;
  private mode?: string;

  constructor(private readonly root: HTMLElement | null) {
    this.buttons = root ? Array.from(root.querySelectorAll('button[data-control]')) : [];
    if (!root) return;
    this.mode = root.dataset.mode;
    const options = { signal: this.listeners.signal };
    root.addEventListener('pointerdown', this.pointerDown, options);
    root.addEventListener('pointermove', this.pointerMove, options);
    root.addEventListener('pointerup', this.pointerEnd, options);
    root.addEventListener('pointercancel', this.pointerEnd, options);
    root.addEventListener('lostpointercapture', this.pointerEnd, options);
    root.addEventListener('click', this.keyboardClick, options);
    window.addEventListener('blur', this.clear, options);
    window.addEventListener('pagehide', this.clear, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    }, options);
  }

  private readonly pointerDown = (event: PointerEvent) => {
    if (!this.root || event.button !== 0 || !(event.target instanceof Element)) return;
    this.syncMode();
    const gesture = startGesture(event.target, event.clientX, event.clientY);
    if (!gesture) return;
    event.preventDefault();
    this.root.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, gesture);
    this.paint();
  };

  private readonly pointerMove = (event: PointerEvent) => {
    const gesture = this.pointers.get(event.pointerId);
    if (gesture && dragGesture(gesture, event.clientX, event.clientY)) this.paint();
  };

  private readonly pointerEnd = (event: PointerEvent) => {
    // A child can lose implicit capture when the controller takes ownership of the pointer.
    if (event.type === 'lostpointercapture' && event.target !== this.root) return;
    const gesture = this.pointers.get(event.pointerId);
    if (!gesture) return;
    if (event.type === 'pointerup') this.taps |= gesture.pending;
    this.pointers.delete(event.pointerId);
    this.paint();
  };

  private readonly keyboardClick = (event: MouseEvent) => {
    if (event.detail === 0 && event.target instanceof Element)
      this.taps |= buttonBit(event.target.closest('button[data-control]'));
  };

  private paint() {
    let held = 0;
    for (const gesture of this.pointers.values()) held |= gesture.held;
    for (const button of this.buttons) button.classList.toggle('is-pressed', !!(held & buttonBit(button)));
  }

  private syncMode() {
    const mode = this.root?.dataset.mode;
    if (mode === this.mode) return;
    this.mode = mode;
    this.clear();
  }

  sample() {
    this.syncMode();
    let buttons = this.taps;
    this.taps = 0;
    for (const gesture of this.pointers.values()) {
      buttons |= gesture.held | gesture.pending;
      gesture.pending = 0;
    }
    return buttons;
  }

  private readonly clear = () => {
    this.pointers.clear();
    this.taps = 0;
    this.paint();
  };

  destroy() {
    this.listeners.abort();
    this.clear();
  }
}
