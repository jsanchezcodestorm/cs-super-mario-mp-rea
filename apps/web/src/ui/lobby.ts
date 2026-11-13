import type { PlayerId } from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
import type { CampaignSlot } from '../session/save';
import { TitleDemo } from './title-demo';
type RoomInfo = Extract<ServerMessage, { type: 'roomState' }>;
export type CampaignChoice = { kind: 'new'; name: string } | { kind: 'saved'; slot: CampaignSlot };
export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Lobby {
  private demo = new TitleDemo(el<HTMLVideoElement>('title-demo'));
  private mode: 'create' | 'join' | 'solo' = 'create';
  private campaigns: CampaignSlot[] = [];
  private selectionTouched = false;
  private campaignsLoaded = false;
  constructor(handlers: {
    enter: (code: string | null, campaign?: CampaignChoice) => void;
    solo: (campaign: CampaignChoice) => void;
    ready: () => void;
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
      const campaign = this.mode === 'join' ? undefined : this.campaignChoice();
      if (this.mode !== 'join' && !campaign) return;
      this.notice(this.mode === 'solo' ? 'Avvio della partita…' : 'Connessione alla stanza…');
      el<HTMLButtonElement>('submit').disabled = true;
      if (this.mode === 'solo') handlers.solo(campaign!);
      else handlers.enter(this.mode === 'join' ? code : null, campaign);
    };
    el<HTMLSelectElement>('campaign').onchange = () => {
      this.selectionTouched = true;
      this.updateCampaignNameVisibility();
    };
    el<HTMLInputElement>('campaign-name').oninput = () => (this.selectionTouched = true);
    el('ready').onclick = handlers.ready;
    el('leave').onclick = handlers.leave;
    el('play-leave').onclick = handlers.leave;
    el('copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(el('invite').textContent ?? '');
        this.notice('Codice copiato.');
      } catch {
        this.notice('Seleziona il codice e copialo per invitare il secondo giocatore.');
      }
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
    el('submit').firstElementChild!.textContent =
      mode === 'join' ? 'Entra nella stanza' : mode === 'solo' ? 'Gioca da solo' : 'Crea stanza';
    if (mode === 'join') el('room-code').focus();
    this.updateCampaignNameVisibility();
    this.notice('');
  }
  setCampaigns(campaigns: CampaignSlot[]) {
    const select = el<HTMLSelectElement>('campaign');
    const selected = select.value;
    this.campaigns = [...campaigns].sort((a, b) => b.updatedAt - a.updatedAt);
    select.replaceChildren(new Option('Nuova partita', 'new'));
    for (const slot of this.campaigns) {
      const count = slot.save.progress.completed.length;
      const exits = count + (count === 1 ? ' uscita' : ' uscite');
      select.add(new Option(`${slot.name} · ${exits}`, slot.id));
    }
    const selectedExists = selected === 'new' || this.campaigns.some((slot) => slot.id === selected);
    select.value = selectedExists && (this.selectionTouched || this.campaignsLoaded || selected !== 'new')
      ? selected
      : this.campaigns[0]?.id ?? 'new';
    this.campaignsLoaded = true;
    this.updateCampaignNameVisibility();
  }
  updateCampaign(slot: CampaignSlot) {
    this.setCampaigns([slot, ...this.campaigns.filter((campaign) => campaign.id !== slot.id)]);
    el<HTMLSelectElement>('campaign').value = slot.id;
  }
  private campaignChoice(): CampaignChoice | undefined {
    const select = el<HTMLSelectElement>('campaign');
    if (select.value === 'new') {
      this.selectionTouched = true;
      const name = el<HTMLInputElement>('campaign-name').value.trim();
      if (!name || name.length > 48) {
        this.notice('Inserisci un nome da 1 a 48 caratteri per la nuova partita.');
        return;
      }
      return { kind: 'new', name };
    }
    const slot = this.campaigns.find((campaign) => campaign.id === select.value);
    if (!slot) {
      this.notice('Seleziona una partita salvata o creane una nuova.');
      return;
    }
    return { kind: 'saved', slot };
  }
  private updateCampaignNameVisibility() {
    el('campaign-name-field').hidden = el<HTMLSelectElement>('campaign').value !== 'new';
  }
  notice(message: string) {
    el('notice').textContent = message;
  }
  idle(message = '') {
    el('play').hidden = true;
    el('lobby').hidden = false;
    this.demo.show(true);
    el('room-view').hidden = true;
    el('start-view').hidden = false;
    el<HTMLButtonElement>('submit').disabled = false;
    this.notice(message);
  }
  joined(code: string) {
    el('room-view').hidden = false;
    el('start-view').hidden = true;
    el('invite').textContent = code;
    this.notice('');
  }
  waiting(room: RoomInfo, me: PlayerId) {
    const seats = el('seats');
    seats.replaceChildren();
    for (const id of ['mario', 'luigi'] as const) {
      const li = document.createElement('li'),
        status = document.createElement('small'),
        s = room.seats[id];
      li.textContent = (id === 'mario' ? 'Mario' : 'Luigi') + (id === me ? ' · Tu' : '');
      status.textContent = s.connected ? (s.ready ? 'Pronto' : 'In stanza') : 'In attesa';
      li.append(status);
      seats.append(li);
    }
    const button = el<HTMLButtonElement>('ready');
    button.disabled = room.seats[me].ready;
    button.firstElementChild!.textContent = button.disabled ? 'Pronto' : 'Sono pronto';
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
}
