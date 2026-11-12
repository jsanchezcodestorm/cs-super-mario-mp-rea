import './style.css';
import { CutsceneView } from './game/cutscene-view';
import type { CampaignSave, GameState, PlayerId } from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
import { RoomConnection } from './session/connection';
import { readSave, writeSave } from './session/save';
import { el, Lobby } from './ui/lobby';
import { loadContent, type Content } from './game/content';
import { Playback } from './game/playback';
import { GameAudio } from './game/audio';

let localSave: CampaignSave | undefined, me: PlayerId | undefined, playback: Playback | undefined;
let stopped: (() => void) | undefined,
  loading = false,
  session = 0,
  paused = false;
let latest: Extract<ServerMessage, { type: 'snapshot' }> | undefined;
let content: Content | undefined,
  resources: Promise<[Content, Record<string, { region: number; x: number; y: number }>]> | undefined;
const audio = new GameAudio();
const cutscenes = new CutsceneView(el('screen'));
window.addEventListener('keydown', () => audio.unlock(), { once: true });
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
const music = ['level', 'underground', 'athletic', 'castle', 'ghost', 'water', 'boss', 'bonus'];
let audioNotice = '';
const audioError = (error: unknown) => {
  audioNotice = error instanceof Error ? error.message : 'Audio indisponibile';
};

function loadResources() {
  return (resources ??= Promise.all([
    loadContent(),
    fetch('/assets/world/nodes.json').then((r) => {
      if (!r.ok) throw Error('Mappa del mondo indisponibile.');
      return r.json() as Promise<Record<string, { region: number; x: number; y: number }>>;
    }),
  ]).catch((err) => {
    resources = undefined;
    throw err;
  }));
}
const lobby = new Lobby({
  enter(code, resume) {
    audio.unlock();
    if (code) connection.connect({ v: 1, type: 'joinRoom', code });
    else
      connection.connect({ v: 1, type: 'createRoom', ...(resume && localSave ? { save: localSave } : {}) });
  },
  ready() {
    audio.unlock();
    connection.send({ v: 1, type: 'ready' });
  },
  leave() {
    connection.leave();
    end();
  },
});
function end(message = '') {
  cutscenes.close();
  session++;
  latest = undefined;
  me = undefined;
  paused = false;
  stopped?.();
  stopped = undefined;
  playback = undefined;
  loading = false;
  audio.stop();
  lobby.idle(message);
  lobby.overlay('');
}
function showHud(s: GameState) {
  if (!me || !content) return;
  const p = s.players[me],
    stage = content.levels[p.roomId];
  el('stage-name').textContent = content.names?.[s.progress.course] ?? s.progress.course;
  el('hud').textContent =
    (me === 'mario' ? 'MARIO' : 'LUIGI') + ' × ' + p.lives + '   ● ' + p.coins + '   ◷ ' + s.timeLeft;
  const phase = s.phase;
  const bgm =
    phase === 'map'
      ? 'overworld'
      : phase === 'ending'
        ? 'credits'
        : phase === 'gameOver'
          ? 'game-over'
          : p.star > 0
            ? 'star'
            : music[stage.music];
  if (cutscenes.update(s, paused)) audio.stop();
  else void audio.music(bgm).catch(audioError);
  if (paused) lobby.overlay('Partita in pausa\nIn attesa della riconnessione…');
  else if (p.status === 'spectator' && phase === 'playing')
    lobby.overlay('Spettatore · Rientro al prossimo livello', true);
  else if (audioNotice) {
    el('hud').title = audioNotice;
    lobby.overlay('');
  } else lobby.overlay('');
}
async function startPlay() {
  if (!me || loading || stopped) return;
  loading = true;
  const generation = session,
    playerId = me;
  lobby.play();
  lobby.overlay('Caricamento della campagna…');
  try {
    const [[gameContent, regions], renderer] = await Promise.all([loadResources(), import('./game/start')]);
    if (generation !== session) return;
    content = gameContent;
    playback = new Playback(content, playerId, (seq, buttons) =>
      connection.send({ v: 1, type: 'input', seq, buttons }),
    );
    playback.pause(paused);
    if (latest) playback.receive(latest.state, latest.ack);
    stopped = renderer.startRenderer(content, playback, regions);
    if (latest) showHud(latest.state);
  } catch (error) {
    if (generation !== session) return;
    connection.leave();
    end(error instanceof Error ? error.message : 'Caricamento fallito.');
  } finally {
    if (generation === session) loading = false;
  }
}
function message(m: ServerMessage) {
  switch (m.type) {
    case 'joined':
      me = m.playerId;
      lobby.joined(m.code);
      return;
    case 'roomState':
      if (m.status === 'closed') {
        end('La stanza è stata chiusa.');
        return;
      }
      if (!me) return;
      if (m.status === 'waiting') {
        lobby.waiting(m, me);
        return;
      }
      paused = m.status === 'paused';
      if (latest?.state.cutscene) cutscenes.update(latest.state, paused);
      playback?.pause(paused);
      lobby.overlay(paused ? 'Partita in pausa\nIn attesa della riconnessione…' : '');
      void startPlay();
      return;
    case 'snapshot':
      latest = m;
      playback?.receive(m.state, m.ack);
      showHud(m.state);
      return;
    case 'gameEvent':
      if (!m.event.roomId || m.event.roomId === latest?.state.players[me!]?.roomId)
        void audio.play(m.event).catch(audioError);
      return;
    case 'save':
      localSave = m.save;
      lobby.showSave(m.save);
      void writeSave(m.save).catch(() => lobby.notice('Il browser non ha salvato la campagna.'));
      return;
    case 'error':
      if (stopped) lobby.overlay(m.message);
      else {
        end(m.message);
      }
  }
}
const connection = new RoomConnection({
  message,
  disconnected(resuming) {
    if (!resuming) {
      end('Connessione alla stanza interrotta.');
      return;
    }
    playback?.pause(true);
    paused = true;
    if (stopped) lobby.overlay('Riconnessione in corso…');
    else lobby.notice('Riconnessione in corso…');
  },
});
readSave()
  .then((save) => {
    if (save) {
      localSave = save;
      lobby.showSave(save);
    }
  })
  .catch(() => lobby.notice('Salvataggi locali indisponibili in questo browser.'));
connection.restore();
