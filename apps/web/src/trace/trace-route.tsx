import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { GameEvent, GameState } from '@smw/core';
import { FrameNotes } from '../game/frame-notes';
import { parseTraceJsonl, type TraceDocument } from '../game/trace-document';
import { TraceReplaySession } from '../game/trace-replay';
import { createTraceDebugHandoff } from './debug-handoff';
import './trace-route.css';

export default function TraceRoute() {
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef(new FrameNotes());
  const [trace, setTrace] = useState<TraceDocument>();
  const [traceSource, setTraceSource] = useState('');
  const [replay, setReplay] = useState<TraceReplaySession>();
  const [frame, setFrame] = useState(0);
  const [activeNote, setActiveNote] = useState('');
  const [notesText, setNotesText] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Incolla una traccia per iniziare.');
  const [copyStatus, setCopyStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [showState, setShowState] = useState(false);

  useEffect(() => {
    if (!trace || !replay || !screenRef.current) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    replay.onFrameChange = (nextFrame) => {
      setFrame(nextFrame);
      setActiveNote(notesRef.current.get(nextFrame));
      setPlaying(!replay.paused);
    };
    replay.onError = (message) => {
      setStatus(`Replay fermato: ${message}`);
      setPlaying(false);
    };
    void import('../game/start')
      .then(({ startRenderer }) => {
        if (cancelled || !screenRef.current) return;
        stop = startRenderer(
          trace.content,
          replay,
          trace.content.overworldNodes ?? {},
          undefined,
          screenRef.current,
        );
        const recoveryNotice = replay.recoveryNotice ? ` · ${replay.recoveryNotice}` : '';
        setStatus(`Traccia caricata · ${replay.lastFrame - replay.firstFrame + 1} frame · client ${trace.clientPlayerId}${recoveryNotice}`);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setStatus('Il renderer non è riuscito ad avviare il replay.');
        setError(cause instanceof Error ? cause.message : 'Errore di inizializzazione del renderer.');
      });
    return () => {
      cancelled = true;
      replay.onFrameChange = undefined;
      replay.onError = undefined;
      stop?.();
    };
  }, [trace, replay]);

  const seek = useCallback((nextFrame: number) => {
    if (!replay) return;
    replay.pause(true);
    try {
      replay.seek(nextFrame);
      setPlaying(false);
      setStatus('Replay in pausa.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile ricostruire il frame.');
    }
  }, [replay]);

  function loadTrace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTrace(undefined);
    setTraceSource('');
    setReplay(undefined);
    setError('');
    setCopyStatus('');
    setPlaying(false);
    setShowState(false);
    notesRef.current = new FrameNotes();
    setNotesText('');
    setActiveNote('');
    try {
      const source = sourceRef.current?.value ?? '';
      const parsed = parseTraceJsonl(source);
      const session = new TraceReplaySession(parsed);
      session.onFrameChange = (nextFrame) => {
        setFrame(nextFrame);
        setActiveNote(notesRef.current.get(nextFrame));
      };
      setFrame(session.currentFrame);
      setTrace(parsed);
      setTraceSource(source);
      setReplay(session);
      setStatus('Preparazione replay…');
    } catch (cause) {
      setStatus('La traccia non è stata avviata.');
      setError(cause instanceof Error ? cause.message : 'Impossibile leggere la traccia.');
    }
  }

  function togglePlayback() {
    if (!replay) return;
    if (replay.paused && replay.currentFrame >= replay.lastFrame) replay.seek(replay.firstFrame);
    replay.pause(!replay.paused);
    setPlaying(!replay.paused);
    setStatus(replay.paused ? 'Replay in pausa.' : 'Riproduzione in corso.');
  }

  function updateNote(text: string) {
    if (!replay) return;
    notesRef.current.set(replay.currentFrame, text);
    setActiveNote(text);
    setNotesText(notesRef.current.toText());
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(notesRef.current.toText());
      setCopyStatus('Note copiate');
    } catch {
      setCopyStatus('Copia non riuscita');
    }
  }

  async function copyDebugHandoff() {
    try {
      await navigator.clipboard.writeText(createTraceDebugHandoff(traceSource, notesRef.current.toText()));
      setCopyStatus('Bundle per l’agente copiato');
    } catch {
      setCopyStatus('Copia non riuscita');
    }
  }

  const state = replay?.state;
  const selectedFrame = trace?.frames.get(frame);
  const events = selectedFrame?.events.length ? selectedFrame.events : state?.events ?? [];
  const atStart = !replay || frame <= replay.firstFrame;
  const atEnd = !replay || frame >= replay.lastFrame;

  return (
    <div className="trace-route">
      <header className="topbar trace-topbar">
        <a className="brand" href="/" aria-label="Super Mario World, inizio">
          <span className="pad" aria-hidden="true"><i /></span>SUPER MARIO WORLD
        </a>
        <a className="trace-back" href="/">Torna al gioco</a>
      </header>
      <main className="trace-main">
        <p className="eyebrow"><span className="pixel square" />STRUMENTI DI DEBUG</p>
        <h1>Replay della traccia<span>.</span></h1>
        <p className="trace-intro">
          Incolla il JSONL copiato dalla partita. La traccia viene elaborata in questo browser.
        </p>

        <form className="trace-card" onSubmit={loadTrace}>
          <label htmlFor="trace-jsonl">Traccia JSONL</label>
          <textarea
            id="trace-jsonl"
            ref={sourceRef}
            rows={10}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-describedby="trace-input-help"
          />
          <p id="trace-input-help" className="trace-help">
            Formato supportato: <code>smw-mp-game-trace/v1</code>.
          </p>
          <div className="trace-form-actions">
            <button className="primary trace-primary" type="submit">
              <span>Carica replay</span><b aria-hidden="true">→</b>
            </button>
            {error && <p className="trace-error" role="alert">{error}</p>}
          </div>
        </form>
        <p className="trace-status" role="status" aria-live="polite">{status}</p>

        {trace && replay && state && (
          <section className="trace-card trace-view" aria-label="Replay e annotazioni">
            <div className="trace-layout">
              <div>
                <p className="trace-summary">
                  {trace.content.names?.[state.progress.course] ?? state.progress.course} · {state.mode ?? 'modalità non indicata'}
                </p>
                <div ref={screenRef} className="trace-screen" aria-label="Frame di gioco registrato" />
                <details className="trace-details" onToggle={(event) => setShowState(event.currentTarget.open)}>
                  <summary>Stato completo del frame</summary>
                  <pre className="trace-state">{showState ? JSON.stringify(state, null, 2) : ''}</pre>
                </details>
              </div>
              <aside className="trace-inspector" aria-label="Dettagli del frame selezionato">
                <h2>Frame selezionato</h2>
                <dl>
                  <div><dt>Frame</dt><dd>{frame}</dd></div>
                  <div><dt>Tick</dt><dd>{state.tick}</dd></div>
                  <div><dt>Tempo</dt><dd>{formatTime(selectedFrame?.elapsedGameMs ?? 0)}</dd></div>
                  <div><dt>Livello</dt><dd>{trace.content.names?.[state.progress.course] ?? state.progress.course}</dd></div>
                  <div><dt>Fase</dt><dd>{state.phase}</dd></div>
                  <div><dt>Entità</dt><dd>{state.entities.length}</dd></div>
                </dl>
                <h3>Player</h3>
                <ul className="trace-players">
                  {Object.values(state.players).map((player) => (
                    <li key={player.id}>
                      {player.nickname} · {player.lives} vite · {player.form} · {player.status} · ({Math.round(player.x)}, {Math.round(player.y)}) · input {selectedFrame?.inputs[player.id] ?? player.lastInput}
                    </li>
                  ))}
                </ul>
                <h3>Eventi del frame</h3>
                <ul className="trace-events">
                  {events.length
                    ? events.map((gameEvent, index) => <li key={`${gameEvent.tick}-${gameEvent.type}-${index}`}>{formatEvent(gameEvent)}</li>)
                    : <li>Nessun evento registrato.</li>}
                </ul>
              </aside>
            </div>

            <div className="trace-timeline" aria-label="Controlli di riproduzione">
              <div className="trace-transport">
                <button className="trace-control" type="button" aria-label="Primo frame" disabled={atStart} onClick={() => seek(replay.firstFrame)}>|◀</button>
                <button id="trace-previous" className="trace-control" type="button" aria-label="Frame precedente" disabled={atStart} onClick={() => seek(frame - 1)}>−1</button>
                <button id="trace-play" className="trace-control trace-play" type="button" aria-pressed={playing} disabled={replay.firstFrame === replay.lastFrame} onClick={togglePlayback}>
                  {playing ? 'Pausa' : 'Riproduci'}
                </button>
                <button id="trace-next" className="trace-control" type="button" aria-label="Frame successivo" disabled={atEnd} onClick={() => seek(frame + 1)}>+1</button>
                <button className="trace-control" type="button" aria-label="Ultimo frame" disabled={atEnd} onClick={() => seek(replay.lastFrame)}>▶|</button>
              </div>
              <label htmlFor="trace-frame-slider">Timeline dei frame</label>
              <input
                id="trace-frame-slider"
                type="range"
                min={replay.firstFrame}
                max={replay.lastFrame}
                value={frame}
                disabled={replay.firstFrame === replay.lastFrame}
                aria-valuetext={`Frame ${frame}, tick ${state.tick}`}
                onChange={(event) => seek(Number(event.currentTarget.value))}
              />
              <output htmlFor="trace-frame-slider">
                Frame {frame} / {replay.lastFrame} · tick {state.tick} · {formatTime(selectedFrame?.elapsedGameMs ?? 0)}
              </output>
            </div>

            <section className="trace-notes" aria-labelledby="trace-notes-title">
              <div>
                <h2 id="trace-notes-title">Annotazioni</h2>
                <label htmlFor="frame-comment">Commento per Frame {frame}</label>
                <input
                  id="frame-comment"
                  type="text"
                  maxLength={500}
                  autoComplete="off"
                  placeholder="Descrivi cosa succede in questo frame"
                  value={activeNote}
                  onFocus={() => {
                    replay.pause(true);
                    setPlaying(false);
                  }}
                  onChange={(event) => updateNote(event.currentTarget.value)}
                />
                <p className="trace-help">Il commento resta associato al frame selezionato finché questa pagina è aperta.</p>
              </div>
              <div className="trace-notes-output">
                <label htmlFor="trace-notes-text">Testo separato dal JSONL</label>
                <textarea id="trace-notes-text" rows={5} readOnly spellCheck={false} value={notesText} />
                <div className="trace-copy-actions">
                  <button id="copy-trace-notes" className="trace-control" type="button" onClick={() => void copyNotes()}>Copia note</button>
                  <button id="copy-trace-debug-bundle" className="trace-control" type="button" onClick={() => void copyDebugHandoff()}>Copia bundle per agente IA</button>
                  <span className="trace-copy-status" role="status" aria-live="polite">{copyStatus}</span>
                </div>
                <p className="trace-help">Il bundle include la traccia e tutte le note ordinate per frame, pronto da incollare in una sessione di debug.</p>
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const remainder = String(milliseconds % 1000).padStart(3, '0');
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${remainder}`;
}

function formatEvent(event: GameEvent) {
  return `${event.type} · tick ${event.tick}${event.playerId ? ` · ${event.playerId}` : ''}`;
}
