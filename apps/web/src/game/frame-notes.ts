export class FrameNotes {
  private readonly entries = new Map<number, string>();

  set(frame: number, text: string) {
    if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError('Frame annotato non valido.');
    const comment = text.trim();
    if (comment) this.entries.set(frame, comment.replace(/[\r\n]+/g, ' '));
    else this.entries.delete(frame);
  }

  get(frame: number) {
    return this.entries.get(frame) ?? '';
  }

  toText() {
    return [...this.entries]
      .sort(([left], [right]) => left - right)
      .map(([frame, text]) => `Frame ${frame}: ${text}`)
      .join('\n');
  }
}
