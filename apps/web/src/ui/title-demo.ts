export class TitleDemo {
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private visible = true;

  constructor(private video: HTMLVideoElement) {
    this.reduced.addEventListener('change', this.sync);
    document.addEventListener('visibilitychange', this.sync);
    this.sync();
  }

  show(visible: boolean) {
    this.visible = visible;
    this.sync();
  }

  private sync = () => {
    if (!this.visible || document.hidden || this.reduced.matches) this.video.pause();
    else void this.video.play().catch((error: DOMException) => {
      if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') console.error(error);
    });
  };
}
