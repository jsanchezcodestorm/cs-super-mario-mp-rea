import type { GameEvent, GameState, PlayerId } from '@smw/core';
import type { Content, Stage } from './content';

type JsonObject = Record<string, unknown>;

export class TraceFormatError extends Error {
  constructor(message: string, readonly lineNumber?: number) {
    super(lineNumber ? `Riga ${lineNumber}: ${message}` : message);
    this.name = 'TraceFormatError';
  }
}

export interface TraceFrame {
  frame: number;
  tick: number;
  elapsedGameMs: number;
  inputs: Record<PlayerId, number>;
  events: GameEvent[];
}

export interface TraceDocument {
  clientPlayerId: PlayerId;
  content: Content;
  frames: Map<number, TraceFrame>;
  snapshots: Map<number, GameState>;
  firstFrame: number;
  lastFrame: number;
  startedAt?: string;
}

interface SourceLine {
  number: number;
  value: JsonObject;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, line: number, label: string): JsonObject {
  if (!isObject(value)) throw new TraceFormatError(`${label} deve essere un oggetto JSON.`, line);
  return value;
}

function requireString(value: unknown, line: number, label: string): string {
  if (typeof value !== 'string' || !value.length)
    throw new TraceFormatError(`${label} deve essere una stringa non vuota.`, line);
  return value;
}

function requireInteger(value: unknown, line: number, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TraceFormatError(`${label} deve essere un intero maggiore o uguale a ${minimum}.`, line);
  return value as number;
}

function lineError(line: SourceLine, message: string): never {
  throw new TraceFormatError(message, line.number);
}

function validateStage(value: unknown, line: number, id: string): Stage {
  const stage = requireObject(value, line, 'definition') as Partial<Stage>;
  if (stage.id !== id) throw new TraceFormatError(`Il livello "${id}" ha un id non corrispondente.`, line);
  if (!Number.isSafeInteger(stage.width) || !Number.isSafeInteger(stage.height))
    throw new TraceFormatError(`Il livello "${id}" non contiene dimensioni valide.`, line);
  if (!Array.isArray(stage.tiles) || !stage.tiles.every(Number.isSafeInteger))
    throw new TraceFormatError(`Il livello "${id}" non contiene una mappa valida.`, line);
  if (!Array.isArray(stage.sprites) || !Array.isArray(stage.exits) || !isObject(stage.spawn))
    throw new TraceFormatError(`Il livello "${id}" non contiene spawn, sprite e uscite validi.`, line);
  if (
    typeof stage.atlas !== 'string' ||
    !Number.isSafeInteger(stage.mode) ||
    !Number.isSafeInteger(stage.spriteTileset) ||
    typeof stage.backgroundColor !== 'string' ||
    !Number.isSafeInteger(stage.music)
  )
    throw new TraceFormatError(`Il livello "${id}" non contiene i dati del renderer.`, line);
  return stage as Stage;
}

function validateState(value: unknown, line: number, clientPlayerId: string): GameState {
  const state = requireObject(value, line, 'state');
  if (
    !Number.isSafeInteger(state.tick) ||
    typeof state.phase !== 'string' ||
    !isObject(state.progress) ||
    typeof state.progress.course !== 'string' ||
    !isObject(state.players) ||
    !Array.isArray(state.entities) ||
    !state.players[clientPlayerId]
  )
    throw new TraceFormatError('Lo snapshot non contiene uno stato di gioco utilizzabile.', line);
  return state as unknown as GameState;
}

function roomsIn(state: GameState) {
  return new Set([
    state.progress.course,
    ...Object.values(state.players).map((player) => player.roomId),
    ...state.entities.map((entity) => entity.roomId),
    ...Object.keys(state.tileChanges),
  ]);
}

export function parseTraceJsonl(source: string): TraceDocument {
  const lines: SourceLine[] = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new TraceFormatError('JSON non valido.', index + 1);
    }
    lines.push({ number: index + 1, value: requireObject(parsed, index + 1, 'Ogni riga') });
  });
  if (!lines.length) throw new TraceFormatError('Incolla una traccia JSONL.');

  const headerLine = lines[0];
  const header = headerLine.value;
  if (header.type !== 'trace') lineError(headerLine, 'La prima riga deve contenere i metadati della traccia.');
  if (header.schema !== 'smw-mp-game-trace/v1')
    lineError(headerLine, 'Schema non supportato; è richiesto smw-mp-game-trace/v1.');
  const clientPlayerId = requireString(header.clientPlayerId, headerLine.number, 'clientPlayerId');
  const campaign = requireObject(header.campaign, headerLine.number, 'campaign');
  if (
    typeof campaign.start !== 'string' ||
    !isObject(campaign.routes) ||
    Object.hasOwn(campaign, 'levels')
  )
    lineError(headerLine, 'La traccia non contiene i metadati della campagna previsti.');

  const levels: Record<string, Stage> = {};
  const levelLines = new Map<string, number>();
  const snapshots = new Map<number, GameState>();
  const snapshotLines = new Map<number, number>();
  const frames = new Map<number, TraceFrame>();
  const eventRows: SourceLine[] = [];

  for (const line of lines.slice(1)) {
    const row = line.value;
    switch (row.type) {
      case 'level': {
        const id = requireString(row.id, line.number, 'id');
        if (Object.hasOwn(levels, id)) lineError(line, `Il livello "${id}" è duplicato.`);
        levels[id] = validateStage(row.definition, line.number, id);
        levelLines.set(id, line.number);
        break;
      }
      case 'snapshot': {
        const frame = requireInteger(row.frame, line.number, 'frame');
        if (snapshots.has(frame)) lineError(line, `Lo snapshot del frame ${frame} è duplicato.`);
        snapshots.set(frame, validateState(row.state, line.number, clientPlayerId));
        snapshotLines.set(frame, line.number);
        break;
      }
      case 'input': {
        const frame = requireInteger(row.frame, line.number, 'frame', 1);
        const tick = requireInteger(row.tick, line.number, 'tick');
        const elapsedGameMs = requireInteger(row.elapsedGameMs, line.number, 'elapsedGameMs');
        if (frames.has(frame)) lineError(line, `Gli input del frame ${frame} sono duplicati.`);
        if (!Array.isArray(row.inputs)) lineError(line, 'inputs deve essere un array.');
        const inputs: Record<PlayerId, number> = {};
        for (const rawInput of row.inputs) {
          const input = requireObject(rawInput, line.number, 'Ogni input');
          const playerId = requireString(input.playerId, line.number, 'playerId');
          const mask = requireInteger(input.mask, line.number, `mask di ${playerId}`);
          if (Object.hasOwn(inputs, playerId)) lineError(line, `L’input di "${playerId}" è duplicato.`);
          inputs[playerId] = mask;
        }
        if (!Object.hasOwn(inputs, clientPlayerId))
          lineError(line, `Manca l’input del client "${clientPlayerId}".`);
        frames.set(frame, { frame, tick, elapsedGameMs, inputs, events: [] });
        break;
      }
      case 'events':
        requireInteger(row.frame, line.number, 'frame', 1);
        if (!Array.isArray(row.events)) lineError(line, 'events deve essere un array.');
        eventRows.push(line);
        break;
      default:
        lineError(line, `Tipo di riga non supportato: "${String(row.type)}".`);
    }
  }

  if (!Object.keys(levels).length) lineError(headerLine, 'La traccia non contiene definizioni di livello.');
  if (!snapshots.size) lineError(headerLine, 'La traccia non contiene snapshot di stato.');
  const content = { ...campaign, levels } as Content;
  const frameNumbers = [...frames.keys()].sort((a, b) => a - b);
  for (let index = 1; index < frameNumbers.length; index++) {
    if (frameNumbers[index] !== frameNumbers[index - 1] + 1) {
      const sourceLine = lines.find((line) => line.value.type === 'input' && line.value.frame === frameNumbers[index]);
      if (sourceLine) lineError(sourceLine, 'La sequenza dei frame contiene un salto.');
    }
  }
  const firstFrame = frameNumbers[0] ?? 0;
  const lastFrame = frameNumbers.at(-1) ?? 0;
  if (firstFrame && ![...snapshots.keys()].some((frame) => frame <= firstFrame))
    lineError(headerLine, 'Manca uno snapshot iniziale per ricostruire il primo frame.');

  for (const eventLine of eventRows) {
    const frame = eventLine.value.frame as number;
    const target = frames.get(frame);
    if (!target) lineError(eventLine, `Gli eventi fanno riferimento al frame ${frame}, non presente.`);
    for (const event of eventLine.value.events as unknown[]) {
      if (!isObject(event) || typeof event.type !== 'string' || !Number.isSafeInteger(event.tick))
        lineError(eventLine, 'La riga contiene un evento di gioco non valido.');
      target.events.push(event as unknown as GameEvent);
    }
  }

  for (const [frame, state] of snapshots) {
    for (const room of roomsIn(state)) {
      if (!Object.hasOwn(levels, room)) {
        const sourceLine = snapshotLines.get(frame) ?? headerLine.number;
        throw new TraceFormatError(`Lo snapshot del frame ${frame} richiede il livello "${room}", non incluso nella traccia.`, sourceLine);
      }
    }
  }

  const startedAt = typeof header.startedAt === 'string' ? header.startedAt : undefined;
  return { clientPlayerId, content, frames, snapshots, firstFrame, lastFrame, startedAt };
}
