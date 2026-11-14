import { Buttons, type GameState, type PlayerId } from '@smw/core';
import type { Content } from './content';

const WINDOW_FRAMES = 15 * 60;
const SNAPSHOT_INTERVAL = 4;
const MAX_INCLUDED_FRAMES = WINDOW_FRAMES + SNAPSHOT_INTERVAL - 1;
const buttonMasks = Object.entries(Buttons).map(([name, mask]) => [name, mask as number] as const);

type CapturedFrame = {
  frame: number;
  tick: number;
  rooms: string[];
  lines: string[];
  snapshot?: string;
};

/** Keeps a client-side, rolling diagnostic trace for the most recent 15 seconds. */
export class GameTraceRecorder {
  private frames: CapturedFrame[] = [];
  private frameNumber = 0;
  private readonly startedAt = new Date().toISOString();
  private baseline?: string;
  private baselineRooms: string[] = [];
  private anchor?: string;
  private anchorFrame?: number;
  private anchorRooms: string[] = [];
  private latestState?: GameState;

  constructor(
    private readonly content: Content,
    private readonly playerId: PlayerId,
    initialState?: GameState,
  ) {
    if (initialState) {
      this.baseline = this.snapshotLine(0, initialState);
      this.baselineRooms = this.roomsIn(initialState);
      this.latestState = initialState;
    }
  }

  record(state: GameState, sampledButtons: number) {
    const frame = ++this.frameNumber;
    const elapsedGameMs = Math.round(((frame - 1) * 1000) / 60);
    const inputs = Object.values(state.players).map((player) => {
      const buttons = player.id === this.playerId ? sampledButtons : player.lastInput;
      return {
        playerId: player.id,
        mask: buttons,
        buttons: buttonMasks.filter(([, mask]) => buttons & mask).map(([name]) => name),
        source: player.id === this.playerId ? 'client-sampled' : 'last-observed-state',
      };
    });
    const lines = [
      JSON.stringify({ type: 'input', frame, tick: state.tick, elapsedGameMs, inputs }),
    ];
    if (state.events.length)
      lines.push(JSON.stringify({ type: 'events', frame, tick: state.tick, events: state.events }));
    const snapshot = frame === 1 || frame % SNAPSHOT_INTERVAL === 0
      ? this.snapshotLine(frame, state, elapsedGameMs)
      : undefined;
    if (snapshot) lines.push(snapshot);

    const rooms = this.roomsIn(state);
    this.frames.push({ frame, tick: state.tick, rooms, lines, snapshot });
    this.latestState = state;
    this.baseline = undefined;
    this.baselineRooms = [];

    const firstFrameInWindow = frame - WINDOW_FRAMES + 1;
    let latestExpiredSnapshot: CapturedFrame | undefined;
    for (const captured of this.frames) {
      if (captured.frame >= firstFrameInWindow) break;
      if (captured.snapshot) latestExpiredSnapshot = captured;
    }
    if (latestExpiredSnapshot) {
      this.anchor = latestExpiredSnapshot.snapshot;
      this.anchorFrame = latestExpiredSnapshot.frame;
      this.anchorRooms = latestExpiredSnapshot.rooms;
    }
    while (this.frames[0] && this.anchorFrame !== undefined && this.frames[0].frame <= this.anchorFrame) {
      this.frames.shift();
    }
  }

  toJsonl() {
    const roomIds = new Set([...this.baselineRooms, ...this.anchorRooms]);
    for (const frame of this.frames) for (const room of frame.rooms) roomIds.add(room);
    const { levels: _levels, ...campaign } = this.content;
    const first = this.frames[0];
    const last = this.frames.at(-1);
    const metadata = {
      type: 'trace',
      schema: 'smw-mp-game-trace/v1',
      startedAt: this.startedAt,
      exportedAt: new Date().toISOString(),
      clientPlayerId: this.playerId,
      capture: {
        requestedWindowSeconds: 15,
        maxFrames: MAX_INCLUDED_FRAMES,
        framesIncluded: this.frames.length,
        framesCaptured: this.frameNumber,
        frameRange: first && last ? [first.frame, last.frame] : [0, 0],
        tickRange: first && last ? [first.tick, last.tick] : [this.latestState?.tick ?? 0, this.latestState?.tick ?? 0],
        anchorFrame: this.anchorFrame,
        inputSamplesPerSecond: 60,
        fullSnapshotsPerSecond: 15,
        snapshotIntervalFrames: SNAPSHOT_INTERVAL,
      },
      observation: {
        scope: 'client-side game state',
        localInput: 'sampled on this client',
        otherPlayerInput: 'last input visible in this client state',
      },
      current: this.latestState
        ? {
            phase: this.latestState.phase,
            course: this.latestState.progress.course,
            mode: this.latestState.mode,
          }
        : undefined,
      campaign,
    };
    const lines = [JSON.stringify(metadata)];
    for (const id of roomIds) {
      const level = this.content.levels[id];
      if (level) lines.push(JSON.stringify({ type: 'level', id, definition: level }));
    }
    if (this.baseline) lines.push(this.baseline);
    if (this.anchor) lines.push(this.anchor);
    for (const frame of this.frames) lines.push(...frame.lines);
    return lines.join('\n');
  }

  private snapshotLine(frame: number, state: GameState, elapsedGameMs = frame * (1000 / 60)) {
    return JSON.stringify({ type: 'snapshot', frame, tick: state.tick, elapsedGameMs, state });
  }

  private roomsIn(state: GameState) {
    return [...new Set([
      state.progress.course,
      ...Object.keys(state.tileChanges),
      ...Object.values(state.players).map((player) => player.roomId),
      ...state.entities.map((entity) => entity.roomId),
    ])];
  }
}
