import type { GameEvent } from '@smw/core';

const effects = {
  jump: 'jump',
  coin: 'coin',
  stomp: 'stomp',
  item: 'powerup',
  exit: 'exit',
  death: 'death',
  tongue: 'tongue',
  swallow: 'swallow',
  spit: 'spit',
  yoshiStomp: 'yoshi-stomp',
  yoshiGrow: 'yoshi-grow',
  shot: 'fireball',
  pipe: 'pipe',
  checkpoint: 'checkpoint',
  switch: 'switch',
} as const;
export class GameAudio {
  private context?: AudioContext;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private track?: AudioBufferSourceNode;
  private trackName = '';
  unlock() {
    this.context ??= new AudioContext();
    void this.context.resume();
  }
  async music(name: string) {
    if (!this.context || this.trackName === name) return;
    this.stop();
    this.trackName = name;
    const source = await this.source(name, 0.46);
    if (!source || this.trackName !== name) return;
    this.track = source;
    source.loop = true;
    source.start();
  }
  async play(event: GameEvent) {
    if (!(event.type in effects)) return;
    const source = await this.source(effects[event.type as keyof typeof effects], 0.7);
    source?.start();
  }
  stop() {
    this.trackName = '';
    this.track?.stop();
    this.track = undefined;
  }
  private async source(name: string, volume: number) {
    const ctx = this.context;
    if (!ctx) return;
    let buffer = this.buffers.get(name);
    if (!buffer) {
      buffer = fetch('/assets/audio/' + name + '.m4a')
        .then((r) => {
          if (!r.ok) throw Error('Audio ' + name + ' indisponibile.');
          return r.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));
      this.buffers.set(name, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = await buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    return source;
  }
}
