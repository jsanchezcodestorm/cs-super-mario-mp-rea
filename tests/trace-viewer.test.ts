import assert from 'node:assert/strict';
import test from 'node:test';
import { Buttons, createGameAtCourse, stepGame } from '@smw/core';
import type { Content, Stage } from '../apps/web/src/game/content.ts';
import { FrameNotes } from '../apps/web/src/game/frame-notes.ts';
import { GameTraceRecorder } from '../apps/web/src/game/game-trace.ts';
import { parseTraceJsonl, TraceFormatError } from '../apps/web/src/game/trace-document.ts';
import { TraceReplaySession } from '../apps/web/src/game/trace-replay.ts';
import { createTraceDebugHandoff } from '../apps/web/src/trace/debug-handoff.ts';

function content(): Content {
  const stage: Stage = {
    id: 'meadow',
    width: 48,
    height: 12,
    tiles: Array<number>(48 * 12).fill(0),
    spawn: { x: 16, y: 144 },
    sprites: [],
    exits: [],
    atlas: 'actors',
    mode: 0,
    spriteTileset: 0,
    backgroundColor: '#132c32',
    music: 0,
  };
  return {
    start: 'meadow',
    initial: ['meadow'],
    levels: { meadow: stage },
    routes: { meadow: { normal: [], secret: [] } },
    overworldNodes: {},
    overworldPaths: {},
  };
}

function recordedTrace(frameCount = 12) {
  const campaign = content();
  const state = createGameAtCourse(campaign, campaign.start, 'solo');
  const recorder = new GameTraceRecorder(campaign, 'mario', state);
  const expected = new Map<number, ReturnType<typeof createGameAtCourse>>();
  for (let frame = 1; frame <= frameCount; frame++) {
    const buttons = frame < 8 ? Buttons.right : Buttons.jump;
    stepGame(campaign, state, { mario: buttons });
    recorder.record(state, buttons);
    expected.set(frame, structuredClone(state));
  }
  return { source: recorder.toJsonl(), expected };
}

test('trace parser and replay reconstruct every frame between full snapshots', () => {
  const { source, expected } = recordedTrace();
  const trace = parseTraceJsonl(source);
  const replay = new TraceReplaySession(trace);

  assert.equal(trace.firstFrame, 1);
  assert.equal(trace.lastFrame, 12);
  assert.deepEqual([...trace.snapshots.keys()], [1, 4, 8, 12]);
  for (let frame = trace.firstFrame; frame <= trace.lastFrame; frame++) {
    replay.seek(frame);
    assert.deepEqual(replay.state, JSON.parse(JSON.stringify(expected.get(frame))), `state diverged at frame ${frame}`);
  }
  assert.throws(() => replay.seek(0), RangeError);
  assert.throws(() => replay.seek(13), RangeError);
});

test('trace parser reports malformed JSON with its source line', () => {
  const { source } = recordedTrace(2);
  const lines = source.split('\n');
  lines.splice(1, 0, '{');
  assert.throws(
    () => parseTraceJsonl(lines.join('\n')),
    (error: unknown) => error instanceof TraceFormatError && error.lineNumber === 2 && error.message.startsWith('Riga 2:'),
  );
});

test('trace parser rejects an unsupported schema on the header line', () => {
  const { source } = recordedTrace(2);
  const lines = source.split('\n');
  const header = JSON.parse(lines[0]);
  header.schema = 'smw-mp-game-trace/v99';
  lines[0] = JSON.stringify(header);
  assert.throws(
    () => parseTraceJsonl(lines.join('\n')),
    (error: unknown) => error instanceof TraceFormatError && error.lineNumber === 1 && error.message.includes('non supportato'),
  );
});

test('rolling traces keep the full snapshot immediately before the fifteen-second window', () => {
  const campaign = content();
  const state = createGameAtCourse(campaign, campaign.start, 'solo');
  const recorder = new GameTraceRecorder(campaign, 'mario', state);
  for (let frame = 1; frame <= 901; frame++) {
    stepGame(campaign, state, { mario: Buttons.right });
    recorder.record(state, Buttons.right);
  }

  const trace = parseTraceJsonl(recorder.toJsonl());
  assert.equal(trace.firstFrame, 2);
  assert.equal(trace.lastFrame, 901);
  assert.ok(trace.snapshots.has(1));
  assert.equal(trace.frames.size, 900);
  const replay = new TraceReplaySession(trace);
  replay.seek(2);
  assert.equal(replay.state.tick, 2);
});

test('frame annotations stay attached to their frame and export as separate one-line notes', () => {
  const notes = new FrameNotes();
  notes.set(12, 'Player attraversa la piattaforma');
  notes.set(3, 'Salto interrotto');
  notes.set(7, '   ');

  assert.equal(notes.get(12), 'Player attraversa la piattaforma');
  assert.equal(notes.toText(), 'Frame 3: Salto interrotto\nFrame 12: Player attraversa la piattaforma');
});

test('debug handoff combines sorted frame notes and JSONL in safely delimited sections', () => {
  const jsonl = '{"type":"trace","schema":"smw-mp-game-trace/v1"}\n{"comment":"```"}';
  const notes = 'Frame 3: salto inatteso con ```` nel testo\nFrame 12: esito';
  const handoff = createTraceDebugHandoff(jsonl, notes);
  const fence = '`'.repeat(5);

  assert.ok(handoff.startsWith('<!-- smw-mp-trace-debug-handoff/v1 -->'));
  assert.ok(handoff.includes(`## Note aggregate per frame\n${fence}\n${notes}\n${fence}`));
  assert.ok(handoff.includes(`## Traccia JSONL\n${fence}jsonl\n${jsonl}\n${fence}`));
  assert.ok(handoff.indexOf('Frame 3:') < handoff.indexOf('{"type":"trace"'));
});
