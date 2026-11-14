import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@smw/protocol';

export function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > 1024 * 1024) {
    socket.close(1013, 'Client too slow');
    return;
  }
  socket.send(JSON.stringify(message));
}

export class Seat {
  readonly token = randomBytes(24).toString('hex');
  socket: WebSocket | null = null;
  claimed = false;
  ready = false;
  ack = 0;
  private lastSequence = 0;
  private held = 0;
  private queue: { seq: number; buttons: number }[] = [];

  push(seq: number, buttons: number) {
    if (seq <= this.lastSequence) return;
    if (this.queue.length >= 90) throw Error('Troppi input in attesa.');
    this.queue.push({ seq, buttons });
    this.lastSequence = seq;
  }

  next() {
    const frame = this.queue.shift();
    if (frame) {
      this.ack = frame.seq;
      this.held = frame.buttons;
    }
    return this.held;
  }

  resetControls() {
    this.queue = [];
    this.held = 0;
    this.ack = 0;
    this.lastSequence = 0;
  }
}
