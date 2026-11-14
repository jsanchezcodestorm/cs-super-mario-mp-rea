export interface GameTraceSource {
  toJsonl(): string;
}

export class GameTraceControl {
  private recorder?: GameTraceSource;
  private resetTimer?: number;
  private readonly label: string;

  constructor(
    private readonly button: HTMLButtonElement,
    enabled: boolean,
  ) {
    this.label = button.textContent ?? 'Copia JSONL';
    button.hidden = !enabled;
    button.disabled = true;
    if (enabled) button.addEventListener('click', this.copy);
  }

  bind(recorder?: GameTraceSource) {
    this.recorder = recorder;
    this.button.disabled = !recorder;
    this.button.textContent = this.label;
  }

  private readonly copy = async () => {
    if (!this.recorder) return;
    this.button.disabled = true;
    try {
      await navigator.clipboard.writeText(this.recorder.toJsonl());
      this.showFeedback('Copiato');
    } catch {
      this.showFeedback('Copia fallita');
    } finally {
      this.button.disabled = !this.recorder;
    }
  };

  private showFeedback(text: string) {
    this.button.textContent = text;
    window.clearTimeout(this.resetTimer);
    this.resetTimer = window.setTimeout(() => {
      this.button.textContent = this.label;
    }, 1800);
  }
}
