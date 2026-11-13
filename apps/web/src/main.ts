import './style.css';
import './ui/mobile-play.css';
import './ui/install-prompt.css';
import { CutsceneView } from './game/cutscene-view';
import { goalWalkFrame } from '@smw/core';
import type { CampaignSave, GameEvent, GameState, PlayerId } from '@smw/core';
import type { CampaignRef, ServerMessage } from '@smw/protocol';
import { RoomConnection } from './session/connection';
import { readCampaigns, writeCampaignSave, type CampaignSlot } from './session/save';
import { el, Lobby, type CampaignChoice } from './ui/lobby';
import { loadContent, type Content } from './game/content';
import { Playback, type GameSession } from './game/playback';
import { GameAudio } from './game/audio';
import { FullscreenToggle } from './ui/fullscreen';
import { touchDevice, TouchHud } from './ui/touch-hud';
import { bindPlaySurface } from './ui/play-surface';
import { LocalGameSession } from './session/local-game';
import { InstallPrompt } from './ui/install-prompt';

let me: PlayerId | undefined, playback: GameSession | undefined;
let stopped: (() => void) | undefined,
  loading = false,
  session = 0,
  paused = false;
let latest: Extract<ServerMessage, { type: 'snapshot' }> | undefined;
let content: Content | undefined,
  resources: Promise<[Content, Record<string, { region: number; x: number; y: number }>]> | undefined;
const audio = new GameAudio();
new InstallPrompt();
const fullscreen = new FullscreenToggle(
  el<HTMLButtonElement>('fullscreen'),
  el('play'),
  el('fullscreen-help'),
);
const cutscenes = new CutsceneView(el('screen'));
const touchHud = new TouchHud(el('touch-controls'));
bindPlaySurface(el('play'), touchDevice);
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
  enter(code, choice) {
    audio.unlock();
    if (code) connection.connect({ v: 1, type: 'joinRoom', code });
    else if (choice) {
      const selected = campaignFor(choice);
      connection.connect({
        v: 1,
        type: 'createRoom',
        campaign: selected.ref,
        ...(selected.save ? { save: selected.save } : {}),
      });
    }
  },
  ready() {
    audio.unlock();
    connection.send({ v: 1, type: 'ready' });
  },
  solo(choice) {
    const selected = campaignFor(choice);
    connection.leave();
    latest = undefined;
    paused = false;
    me = 'mario';
    void mountGame(
      (gameContent) =>
        new LocalGameSession(gameContent, selected.save, {
          step: updateLocalState,
          save: (save) => persistSave(selected.ref, save),
        }),
      { leaveRoomOnError: false },
    );
  },
  leave() {
    connection.leave();
    end();
  },
});
function campaignFor(choice: CampaignChoice): { ref: CampaignRef; save?: CampaignSave } {
  if (choice.kind === 'new') return { ref: { id: crypto.randomUUID(), name: choice.name } };
  return { ref: { id: choice.slot.id, name: choice.slot.name }, save: choice.slot.save };
}
function end(message = '') {
  touchHud.clear();
  void fullscreen.exitIfActive();
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
  if (paused || !stopped) touchHud.clear();
  else touchHud.update(s, me);
  el('stage-name').textContent =
    s.phase === 'map' && !s.goalWalk && !s.keyholeFinish && !s.orbFinish ? 'Mappa del mondo' : content.names?.[s.progress.course] ?? s.progress.course;
  const canReturn = !s.cutscene && (s.phase === 'ending' || s.phase === 'gameOver');
  const hudMessages = [
    canReturn && !touchDevice.matches ? 'Invio · Torna alla mappa' : '',
    s.mode === 'coop' && s.phase === 'playing' ? `${s.sharedLives ?? p.lives} vite condivise` : '',
    audioNotice,
  ].filter(Boolean);
  el('hud').textContent = hudMessages.join(' · ');
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
  if (cutscenes.update(s, paused) || s.keyholeFinish || paused) audio.stop();
  else if (s.orbFinish) void audio.music('boss-clear', (s.tick - s.orbFinish.tick) / 60).catch(audioError);
  else if (s.goalWalk) {
    const { age, irisAt } = goalWalkFrame(s.goalWalk, s.tick);
    const spotlight = age >= irisAt - 1;
    void audio.music(spotlight ? 'spotlight' : 'exit', (spotlight ? age - irisAt + 1 : age) / 50).catch(audioError);
  }
  else void audio.music(bgm).catch(audioError);
  if (paused) lobby.overlay('Partita in pausa\nIn attesa della riconnessione…');
  else if (p.status === 'spectator' && phase === 'playing')
    lobby.overlay('Spettatore · Rientro al prossimo livello', true);
  else if (s.mapRequest) {
    const requester = s.mapRequest.requester === 'mario' ? 'Mario' : 'Luigi';
    const other = s.mapRequest.requester === 'mario' ? 'Luigi' : 'Mario';
    const course = content.names?.[s.mapRequest.course] ?? s.mapRequest.course;
    const message = s.mapRequest.requester === me
      ? `In attesa di ${other}: ${course}\n${touchDevice.matches ? 'Tocca Annulla' : 'Invio annulla la richiesta'}`
      : `${requester} chiede di entrare in ${course}\n${touchDevice.matches ? 'Tocca Conferma o Rifiuta' : 'Invio conferma · X rifiuta'}`;
    lobby.overlay(message, true);
  }
  else lobby.overlay('');
}
function persistSave(campaign: CampaignRef, save: CampaignSave) {
  void writeCampaignSave(campaign, save)
    .then((slot: CampaignSlot) => lobby.updateCampaign(slot))
    .catch(() => lobby.notice('Il browser non ha salvato la campagna.'));
}
function playGameEvent(event: GameEvent) {
  const local = me && playback?.state?.players[me];
  if (!event.roomId || event.roomId === local?.roomId) void audio.play(event).catch(audioError);
}
function updateLocalState(state: GameState) {
  for (const event of state.events) playGameEvent(event);
  showHud(state);
}
async function mountGame(
  makeSession: (content: Content) => GameSession,
  options: { leaveRoomOnError?: boolean; errorOnPlaySurface?: boolean } = {},
) {
  if (loading || stopped) return;
  loading = true;
  const generation = session;
  touchHud.clear();
  lobby.play();
  lobby.overlay('Caricamento della campagna…');
  try {
    const [[gameContent, regions], renderer] = await Promise.all([loadResources(), import('./game/start')]);
    if (generation !== session) return;
    content = gameContent;
    content.overworldNodes = regions;
    playback = makeSession(content);
    stopped = renderer.startRenderer(content, playback, regions);
    if (playback.state) showHud(playback.state);
  } catch (error) {
    if (generation !== session) return;
    if (options.leaveRoomOnError ?? true) connection.leave();
    const message = error instanceof Error ? error.message : 'Caricamento fallito.';
    if (options.errorOnPlaySurface) {
      touchHud.clear();
      stopped?.();
      stopped = undefined;
      playback = undefined;
      me = undefined;
      latest = undefined;
      paused = false;
      audio.stop();
      lobby.overlay(message);
    } else end(message);
  } finally {
    if (generation === session) loading = false;
  }
}
function startPlay() {
  if (!me) return;
  const playerId = me;
  void mountGame((gameContent) => {
    const remote = new Playback(gameContent, playerId, (seq, buttons) =>
      connection.send({ v: 1, type: 'input', seq, buttons }),
    );
    remote.pause(paused);
    if (latest) remote.receive(latest.state, latest.ack);
    return remote;
  });
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
      if (latest) showHud(latest.state);
      playback?.pause(paused);
      lobby.overlay(paused ? 'Partita in pausa\nIn attesa della riconnessione…' : '');
      void startPlay();
      return;
    case 'snapshot':
      latest = m;
      playback?.receive?.(m.state, m.ack);
      showHud(m.state);
      return;
    case 'gameEvent':
      playGameEvent(m.event);
      return;
    case 'save':
      if (m.campaign) persistSave(m.campaign, m.save);
      else lobby.notice('La stanza non ha identificato la campagna da salvare.');
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
    touchHud.clear();
    audio.stop();
    if (stopped) lobby.overlay('Riconnessione in corso…');
    else lobby.notice('Riconnessione in corso…');
  },
});
readCampaigns()
  .then((campaigns) => lobby.setCampaigns(campaigns))
  .catch(() => lobby.notice('Salvataggi locali indisponibili in questo browser.'));
const directTestLevel = new URLSearchParams(window.location.search).get('testLevel');
if (directTestLevel === null) connection.restore();
else {
  me = 'mario';
  void mountGame(
    (gameContent) => {
      if (!Object.hasOwn(gameContent.levels, directTestLevel))
        throw new Error(`Livello di test "${directTestLevel}" non trovato in /assets/content.json.`);
      return new LocalGameSession(
        gameContent,
        undefined,
        { step: updateLocalState },
        { startAtCourse: directTestLevel },
      );
    },
    { leaveRoomOnError: false, errorOnPlaySurface: true },
  );
}
