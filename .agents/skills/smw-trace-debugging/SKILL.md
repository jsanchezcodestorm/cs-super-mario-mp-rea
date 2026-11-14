---
name: smw-trace-debugging
description: Reproduce and investigate Super Mario World browser-game bugs from a trace debug bundle containing smw-mp-game-trace/v1 JSONL and frame annotations.
---

# SMW trace debugging

Use this skill when a user supplies a Super Mario World trace bundle or JSONL capture with notes and wants an agent to reproduce or diagnose a bug in this repository.

## Read the handoff

The combined handoff is Markdown marked `smw-mp-trace-debug-handoff/v1`. It contains ordered `Frame N: ...` observations and a fenced `jsonl` block. Extract only the content of that block when loading the capture; do not pass the Markdown headings or frame notes to the JSONL parser.

The supported capture schema is `smw-mp-game-trace/v1`. Its frame number is the capture index; `tick` is the simulation tick. Keep both when reporting findings. Each input row records a mask and sampled button names. The local client's input was sampled; remote players' input is the last value visible to the capturing client. Notes are observations, not proof of a cause.

Captures include campaign and level definitions, per-frame inputs, optional events, and periodic full state snapshots. The recorder keeps roughly 15 seconds at 60 frames per second and retains the snapshot immediately before its rolling window. Replay begins at the nearest preceding snapshot and runs `stepGame` for intermediate frames.

## Reproduce and inspect

1. Parse and validate the trace before drawing conclusions. Start with `parseTraceJsonl` in `apps/web/src/game/trace-document.ts`; it reports malformed or unsupported rows with their source line.
2. For a visual replay, use the app's `/trace` route with `VITE_GAME_TRACE=true`, paste only the JSONL block, and load it. Seek to each annotated frame, then inspect the previous and next frame, the displayed tick, inputs, events, full game state, and renderer canvas.
3. For simulation-level checks, inspect `TraceReplaySession` in `apps/web/src/game/trace-replay.ts` and compare reconstructed states around the annotated frames. Check the nearest snapshots and exact input rows before changing simulation code.
4. If replay cannot reconstruct a frame, report the exact frame and missing input or tick mismatch. Do not silently substitute a nearby state. For a remote-player divergence, state that the capture contains only the last remote input observed by this client.
5. Trace the evidence into the owning simulation or renderer code. Separate what the capture proves from hypotheses about an unrecorded event or visual cause.

When reporting, include the level, frame and tick, player/input or entity evidence, the smallest reproducible interval, relevant source locations, and any remaining uncertainty. If code changes are requested, keep them scoped to the observed failure and run the relevant trace tests and build; do not run the full game suite unless requested.
