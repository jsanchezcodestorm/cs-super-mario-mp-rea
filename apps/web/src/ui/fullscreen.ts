type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export class FullscreenToggle {
  constructor(
    private readonly button: HTMLButtonElement,
    private readonly target: FullscreenTarget,
    private readonly help: HTMLElement,
  ) {
    button.addEventListener('click', this.toggle);
    document.addEventListener('fullscreenchange', this.sync);
    document.addEventListener('webkitfullscreenchange', this.sync);
    this.sync();
  }

  private readonly toggle = () => {
    if (this.isStandalone()) {
      this.target.classList.toggle('is-fullscreen');
      this.sync();
      return;
    }
    if (!this.hasFullscreenApi()) {
      this.help.hidden = !this.help.hidden;
      this.sync();
      return;
    }
    const current = this.currentElement();
    const request = current === this.target ? this.exit() : this.enter();
    void request.catch(() => this.showFailure());
  };

  private async enter() {
    if (this.target.requestFullscreen) await this.target.requestFullscreen();
    else if (this.target.webkitRequestFullscreen) await this.target.webkitRequestFullscreen();
  }

  private async exit() {
    const documentWithFullscreen = document as FullscreenDocument;
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (documentWithFullscreen.webkitExitFullscreen)
      await documentWithFullscreen.webkitExitFullscreen();
  }

  async exitIfActive() {
    if (this.target.classList.contains('is-fullscreen')) {
      this.target.classList.remove('is-fullscreen');
      this.sync();
      return;
    }
    if (this.currentElement() !== this.target) return;
    try {
      await this.exit();
    } catch {
      this.showFailure();
    }
  }

  private currentElement() {
    const documentWithFullscreen = document as FullscreenDocument;
    return document.fullscreenElement ?? documentWithFullscreen.webkitFullscreenElement ?? null;
  }

  private isStandalone() {
    const safariNavigator = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || safariNavigator.standalone === true;
  }

  private hasFullscreenApi() {
    const documentWithFullscreen = document as FullscreenDocument;
    return (
      (document.fullscreenEnabled !== false &&
        typeof this.target.requestFullscreen === 'function') ||
      (documentWithFullscreen.webkitFullscreenEnabled !== false &&
        typeof this.target.webkitRequestFullscreen === 'function')
    );
  }

  private readonly sync = () => {
    const standalone = this.isStandalone();
    const fullscreen =
      this.currentElement() === this.target ||
      (standalone && this.target.classList.contains('is-fullscreen'));
    const available = standalone || this.hasFullscreenApi();
    if (available) this.help.hidden = true;
    this.button.setAttribute('aria-pressed', String(fullscreen));
    const label = fullscreen
      ? 'Esci da schermo intero'
      : available
        ? 'Gioca a schermo intero'
        : 'Istruzioni schermo intero';
    this.button.setAttribute('aria-label', label);
    this.button.setAttribute('aria-expanded', String(!this.help.hidden));
    this.button.title = label;
  };

  private showFailure() {
    const label = 'Schermo intero non disponibile';
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
  }
}
