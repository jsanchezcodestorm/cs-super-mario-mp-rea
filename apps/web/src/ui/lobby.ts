import { MAX_MULTIPLAYER_PLAYERS, type PlayerCharacter, type PlayerId } from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
import type { CampaignSummary } from '../session/api';
import { TitleDemo } from './title-demo';

type RoomInfo = Extract<ServerMessage, { type: 'roomState' }>;
type GameMode = 'solo' | 'coop';
export type CampaignChoice =
  | { kind: 'new'; name: string; mode: 'SOLO' | 'COOP' }
  | { kind: 'saved'; campaign: CampaignSummary };
export type PlayerChoice = { character: PlayerCharacter };
export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Lobby {
  private demo = new TitleDemo(el<HTMLVideoElement>('title-demo'));
  private mode: 'create' | 'join' | 'solo' = 'create';
  private campaigns: CampaignSummary[] = [];
  private selectionTouched = false;
  private campaignsLoaded = false;

  constructor(handlers: {
    enter: (code: string | null, player: PlayerChoice, campaign?: CampaignChoice, mode?: GameMode) => void | Promise<void>;
    ready: () => void;
    start: () => void;
    leave: () => void;
  }) {
    el('join-tab').onclick = () => this.showMode('join');
    el('create-tab').onclick = () => this.showMode('create');
    el('solo-tab').onclick = () => this.showMode('solo');
    el<HTMLFormElement>('room-form').onsubmit = (event) => {
      event.preventDefault();
      const code = el<HTMLInputElement>('room-code').value.trim().toUpperCase();
      if (this.mode === 'join' && !/^[A-Z2-9]{6}$/.test(code)) {
        this.notice('Inserisci il codice di sei caratteri della stanza.');
        return;
      }
      const player = this.playerChoice();
      if (!player) return;
      const campaign = this.mode === 'join' ? undefined : this.campaignChoice();
      if (this.mode !== 'join' && !campaign) return;
      const mode: GameMode = this.mode === 'solo' ? 'solo' : 'coop';
      this.notice(mode === 'solo' ? 'Avvio della partita…' : 'Connessione alla stanza…');
      el<HTMLButtonElement>('submit').disabled = true;
      void Promise.resolve(handlers.enter(this.mode === 'join' ? code : null, player, campaign, mode))
        .catch((error: unknown) => {
          this.idle(error instanceof Error ? error.message : 'Impossibile avviare la partita.');
        });
    };
    el<HTMLSelectElement>('campaign').onchange = () => {
      this.selectionTouched = true;
      this.updateCampaignNameVisibility();
    };
    el<HTMLInputElement>('campaign-name').oninput = () => (this.selectionTouched = true);
    el('ready').onclick = handlers.ready;
    el('start-room').onclick = handlers.start;
    el('leave').onclick = handlers.leave;
    el('play-leave').onclick = handlers.leave;
    el('copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(el('invite').textContent ?? '');
        this.notice('Codice copiato.');
      } catch {
        this.notice('Seleziona il codice e copialo per invitare altri giocatori.');
      }
    };
    this.showMode('create');
    el('manage-account').onclick = () => {
      el('start-view').hidden = true;
      el('account-view').hidden = false;
      el<HTMLButtonElement>('return-to-game').focus();
    };
  }

  private showMode(mode: 'create' | 'join' | 'solo') {
    this.mode = mode;
    el<HTMLButtonElement>('submit').disabled = false;
    el('join-tab').setAttribute('aria-pressed', String(mode === 'join'));
    el('create-tab').setAttribute('aria-pressed', String(mode === 'create'));
    el('solo-tab').setAttribute('aria-pressed', String(mode === 'solo'));
    el('code-field').hidden = mode !== 'join';
    el('save-field').hidden = mode === 'join';
    el('player-fields').hidden = false;
    el('submit').firstElementChild!.textContent =
      mode === 'join' ? 'Entra nella stanza' : mode === 'solo' ? 'Gioca da solo' : 'Crea stanza';
    el<HTMLSelectElement>('campaign').value = 'new';
    this.setCampaigns(this.campaigns);
    if (mode === 'join') el('room-code').focus();
    this.updateCampaignNameVisibility();
    this.notice('');
  }

  setCampaigns(campaigns: CampaignSummary[]) {
    const select = el<HTMLSelectElement>('campaign');
    const selected = select.value;
    this.campaigns = [...campaigns].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const mode = this.mode === 'solo' ? 'SOLO' : 'COOP';
    const matching = this.campaigns.filter((campaign) => campaign.mode === mode);
    select.replaceChildren(new Option('Nuova campagna', 'new'));
    for (const campaign of matching) {
      const count = campaign.exitsCompleted;
      const exits = count + (count === 1 ? ' uscita' : ' uscite');
      select.add(new Option(`${campaign.name} · ${exits}`, campaign.id));
    }
    const selectedExists = selected === 'new' || matching.some((campaign) => campaign.id === selected);
    select.value = selectedExists && (this.selectionTouched || this.campaignsLoaded || selected !== 'new')
      ? selected
      : matching[0]?.id ?? 'new';
    this.campaignsLoaded = true;
    this.updateCampaignNameVisibility();
  }

  notice(message: string) {
    el('notice').textContent = message;
  }

  idle(message = '') {
    el('play').hidden = true;
    el('lobby').hidden = false;
    this.demo.show(true);
    el('room-view').hidden = true;
    el('start-room').hidden = true;
    const authenticated = !el('account-signed-in').hidden;
    el('account-view').hidden = authenticated;
    el('start-view').hidden = !authenticated;
    el<HTMLButtonElement>('submit').disabled = false;
    this.notice(message);
  }

  joined(code: string) {
    el('room-view').hidden = false;
    el('start-view').hidden = true;
    el('account-view').hidden = true;
    el('invite').textContent = code;
    this.notice('');
  }

  waiting(room: RoomInfo, me: PlayerId) {
    const seats = el('seats');
    seats.replaceChildren();
    for (const player of room.players) {
      const li = document.createElement('li'),
        status = document.createElement('small');
      li.textContent = `${player.nickname} · ${player.character === 'mario' ? 'Mario' : 'Luigi'}${player.id === me ? ' · Tu' : ''}${player.host ? ' · Creatore' : ''}`;
      status.textContent = player.connected ? (player.ready ? 'Pronto' : 'In stanza') : 'Disconnesso';
      li.append(status);
      seats.append(li);
    }
    el('room-count').textContent = `${room.players.length} / ${MAX_MULTIPLAYER_PLAYERS} giocatori`;
    const button = el<HTMLButtonElement>('ready');
    const localPlayer = room.players.find((player) => player.id === me);
    button.disabled = !localPlayer || localPlayer.ready;
    button.firstElementChild!.textContent = button.disabled ? 'Pronto' : 'Sono pronto';
    const start = el<HTMLButtonElement>('start-room');
    start.hidden = room.hostId !== me;
    start.disabled = room.players.length < 2 || room.players.some((player) => !player.connected || !player.ready);
  }

  play() {
    this.demo.show(false);
    el('lobby').hidden = true;
    el('play').hidden = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  overlay(message: string, compact = false) {
    el('play-notice').classList.toggle('compact', compact);
    el('play-notice').hidden = !message;
    el('play-notice').textContent = message;
  }

  private campaignChoice(): CampaignChoice | undefined {
    const select = el<HTMLSelectElement>('campaign');
    const mode = this.mode === 'solo' ? 'SOLO' : 'COOP';
    if (select.value === 'new') {
      this.selectionTouched = true;
      const name = el<HTMLInputElement>('campaign-name').value.trim();
      if (!name || Array.from(name).length > 48) {
        this.notice('Inserisci un nome da 1 a 48 caratteri per la nuova campagna.');
        return;
      }
      return { kind: 'new', name, mode };
    }
    const campaign = this.campaigns.find((entry) => entry.id === select.value && entry.mode === mode);
    if (!campaign) {
      this.notice('Seleziona una campagna disponibile o creane una nuova.');
      return;
    }
    return { kind: 'saved', campaign };
  }

  private playerChoice(): PlayerChoice | undefined {
    const value = el<HTMLSelectElement>('character').value;
    if (value !== 'mario' && value !== 'luigi') {
      this.notice('Seleziona Mario o Luigi.');
      return;
    }
    return { character: value };
  }

  private updateCampaignNameVisibility() {
    el('campaign-name-field').hidden = el<HTMLSelectElement>('campaign').value !== 'new';
  }
}
