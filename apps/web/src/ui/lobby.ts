import type { CampaignSave, PlayerId } from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
type RoomInfo = Extract<ServerMessage, { type: 'roomState' }>;
export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Lobby {
  private mode: 'create' | 'join' | 'solo' = 'create';
  constructor(handlers: {
    enter: (code: string | null, resume: boolean) => void;
    solo: (resume: boolean) => void;
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
      this.notice(this.mode === 'solo' ? 'Avvio della partita…' : 'Connessione alla stanza…');
      el<HTMLButtonElement>('submit').disabled = true;
      const resume = el<HTMLSelectElement>('campaign').value === 'saved';
      if (this.mode === 'solo') handlers.solo(resume);
      else handlers.enter(this.mode === 'join' ? code : null, resume);
    };
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
    this.notice('');
  }
  showSave(save: CampaignSave) {
    const select = el<HTMLSelectElement>('campaign');
    const count = save.progress.completed.length;
    const label = 'Riprendi campagna salvata · ' + count + (count === 1 ? ' uscita' : ' uscite');
    const saved = [...select.options].find((option) => option.value === 'saved');
    if (saved) saved.text = label;
    else select.add(new Option(label, 'saved'));
    if (count) select.value = 'saved';
  }
  notice(message: string) {
    el('notice').textContent = message;
  }
  idle(message = '') {
    el('play').hidden = true;
    el('lobby').hidden = false;
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
