import type { CampaignSave, PlayerId } from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
type RoomInfo = Extract<ServerMessage, { type: 'roomState' }>;
export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Lobby {
  private joining = false;
  constructor(handlers: {
    enter: (code: string | null, resume: boolean) => void;
    ready: () => void;
    leave: () => void;
  }) {
    el('join-tab').onclick = () => this.showTab(true);
    el('create-tab').onclick = () => this.showTab(false);
    el<HTMLFormElement>('room-form').onsubmit = (event) => {
      event.preventDefault();
      const code = el<HTMLInputElement>('room-code').value.trim().toUpperCase();
      if (this.joining && !/^[A-Z2-9]{6}$/.test(code)) {
        this.notice('Inserisci il codice di sei caratteri della stanza.');
        return;
      }
      this.notice('Connessione alla stanza…');
      el<HTMLButtonElement>('submit').disabled = true;
      handlers.enter(this.joining ? code : null, el<HTMLSelectElement>('campaign').value === 'saved');
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
  private showTab(join: boolean) {
    this.joining = join;
    el('join-tab').setAttribute('aria-pressed', String(join));
    el('create-tab').setAttribute('aria-pressed', String(!join));
    el('code-field').hidden = !join;
    el('save-field').hidden = join;
    el('submit').firstElementChild!.textContent = join ? 'Entra nella stanza' : 'Crea stanza';
    if (join) el('room-code').focus();
    this.notice('');
  }
  showSave(save: CampaignSave) {
    const select = el<HTMLSelectElement>('campaign');
    if (![...select.options].some((option) => option.value === 'saved'))
      select.add(new Option('Riprendi campagna salvata', 'saved'));
    if (save.progress.completed.length) select.value = 'saved';
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
