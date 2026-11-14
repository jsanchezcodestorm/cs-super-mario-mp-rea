import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Window = { startsAt: number; count: number };

@Injectable()
export class RateLimitService {
  private readonly windows = new Map<string, Window>();
  private calls = 0;

  consume(key: string, limit: number, windowMs: number, now = Date.now()) {
    let window = this.windows.get(key);
    if (!window || now - window.startsAt >= windowMs) {
      window = { startsAt: now, count: 0 };
      this.windows.set(key, window);
    }
    if (++window.count > limit) throw new HttpException('Troppe richieste. Riprova più tardi.', HttpStatus.TOO_MANY_REQUESTS);
    if (++this.calls % 256 === 0) this.prune(now);
  }

  private prune(now: number) {
    for (const [key, window] of this.windows)
      if (now - window.startsAt > 3_600_000) this.windows.delete(key);
  }
}
