import type { GameEvent } from '@smw/core';

const effects = {
  jump: 'jump',
  coin: 'coin',
  stomp: 'splat',
  spinKill: 'spin-kill',
  netPunchHit: 'kick',
  item: 'powerup',
  exit: 'exit',
  death: 'death',
  tongue: 'tongue',
  swallow: 'swallow',
  spit: 'spit',
  yoshiStomp: 'yoshi-stomp',
  yoshiGrow: 'yoshi-grow',
  shot: 'fireball',
  shatter: 'shatter',
  crush: 'crush',
  pipe: 'pipe',
  checkpoint: 'checkpoint',
} as const;
export class GameAudio {
  private context?: AudioContext;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private track?: AudioBufferSourceNode;
  private trackName = '';
  private request = 0;
  unlock() {
    this.context ??= new AudioContext();
    void this.context.resume();
  }
  async music(name: string, elapsed?: number) {
    if (!this.context || this.trackName === name) return;
    this.stop();
    this.trackName = name;
    const request = this.request, requestedAt = this.context.currentTime;
    const source = await this.source(name, elapsed === undefined ? 0.46 : 0.7);
    if (!source || request !== this.request) return;
    const offset = elapsed === undefined ? 0 : elapsed + this.context.currentTime - requestedAt;
    if (offset >= source.buffer!.duration) return;
    this.track = source;
    source.loop = elapsed === undefined;
    source.start(0, offset);
  }
  async play(event: GameEvent) {
    if (event.courseClear) return;
    const format = event.type === 'stomp' || event.type === 'spinKill' ? 'wav' : 'm4a';
    let name: string;
    if (event.type === 'exit' && event.keyhole) name = 'keyhole-end';
    else if (event.type === 'shellHit') {
      if (event.award === '1up') name = 'one-up';
      else if (!event.chain) name = 'kick';
      else name = event.chain === 1 ? 'stomp' : 'stomp-' + Math.min(7, event.chain);
    } else {
      if (!(event.type in effects)) return;
      name = effects[event.type as keyof typeof effects];
    }
    const source = await this.source(name, 0.7, format);
    source?.start();
  }
  stop() {
    this.request++;
    this.trackName = '';
    this.track?.stop();
    this.track = undefined;
  }
  private async source(name: string, volume: number, format: 'm4a' | 'wav' = 'm4a') {
    const ctx = this.context;
    if (!ctx) return;
    let buffer = this.buffers.get(name);
    if (!buffer) {
      buffer = fetch('/assets/audio/' + name + '.' + format)
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
