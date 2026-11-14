import { copyState, stepGame, type GameState } from '@smw/core';
import type { GameSession } from './playback';
import type { TraceDocument } from './trace-document';

class MissingTraceInputError extends Error {
  constructor(readonly frame: number) {
    super(`Mancano gli input del frame ${frame}.`);
    this.name = 'MissingTraceInputError';
  }
}

export class TraceReplaySession implements GameSession {
  readonly playerId: string;
  private currentState: GameState;
  private current: number;
  private startFrame: number;
  private isPaused = true;
  recoveryNotice?: string;
  onFrameChange?: (frame: number, state: GameState) => void;
  onError?: (message: string) => void;

  constructor(private readonly trace: TraceDocument) {
    this.playerId = trace.clientPlayerId;
    this.startFrame = trace.firstFrame;
    this.current = this.startFrame;
    try {
      this.currentState = this.stateAt(this.current);
    } catch (cause) {
      if (!(cause instanceof MissingTraceInputError) || cause.frame >= trace.firstFrame) throw cause;
      const recoveryFrame = [...trace.snapshots.keys()]
        .filter((frame) => frame >= trace.firstFrame && frame <= trace.lastFrame)
        .sort((left, right) => left - right)[0];
      if (recoveryFrame === undefined) throw cause;

      this.startFrame = recoveryFrame;
      this.current = recoveryFrame;
      this.currentState = copyState(trace.snapshots.get(recoveryFrame)!);
      this.recoveryNotice = `Input del frame ${cause.frame} assente; i frame ${trace.firstFrame}–${recoveryFrame - 1} non sono ricostruibili. Replay parziale dal checkpoint ${recoveryFrame}.`;
    }
  }

  get state() {
    return this.currentState;
  }

  get displayState() {
    return this.currentState;
  }

  get currentFrame() {
    return this.current;
  }

  get paused() {
    return this.isPaused;
  }

  get firstFrame() {
    return this.startFrame;
  }

  get lastFrame() {
    return this.trace.lastFrame;
  }

  update(_buttons: number) {
    if (this.isPaused) return;
    if (this.current >= this.trace.lastFrame) {
      this.pause(true);
      return;
    }
    try {
      this.seek(this.current + 1);
    } catch (cause) {
      this.pause(true);
      this.onError?.(cause instanceof Error ? cause.message : 'Impossibile ricostruire il frame.');
    }
  }

  pause(paused: boolean) {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.onFrameChange?.(this.current, this.currentState);
  }

  seek(frame: number) {
    if (!Number.isSafeInteger(frame) || frame < this.startFrame || frame > this.trace.lastFrame)
      throw new RangeError(`Frame ${frame} fuori dalla traccia.`);
    const nextState = this.stateAt(frame);
    this.current = frame;
    this.currentState = nextState;
    this.onFrameChange?.(frame, nextState);
  }

  private stateAt(targetFrame: number) {
    const checkpointFrame = [...this.trace.snapshots.keys()]
      .filter((frame) => frame <= targetFrame)
      .reduce<number | undefined>((latest, frame) => latest === undefined || frame > latest ? frame : latest, undefined);
    if (checkpointFrame === undefined)
      throw new Error(`Manca uno snapshot precedente al frame ${targetFrame}.`);

    let state = copyState(this.trace.snapshots.get(checkpointFrame)!);
    for (let frame = checkpointFrame + 1; frame <= targetFrame; frame++) {
      const capturedState = this.trace.snapshots.get(frame);
      if (capturedState) {
        state = copyState(capturedState);
        continue;
      }
      const input = this.trace.frames.get(frame);
      if (!input) throw new MissingTraceInputError(frame);
      const missingPlayer = Object.keys(state.players).find((id) => !Object.hasOwn(input.inputs, id));
      if (missingPlayer)
        throw new Error(`Manca l’input del giocatore "${missingPlayer}" al frame ${frame}.`);
      stepGame(this.trace.content, state, input.inputs);
      if (state.tick !== input.tick)
        throw new Error(`Lo snapshot non consente di ricostruire il frame ${frame} (tick ${input.tick}).`);
    }
    return state;
  }
}
