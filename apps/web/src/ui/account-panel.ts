import { accountApi, isUnauthorized, type AccountProfile } from '../session/api';
import { el } from './lobby';

const pendingInviteKey = 'smw.pending-campaign-invite.v1';

export class AccountPanel {
  constructor(private readonly callbacks: {
    authenticated: (account: AccountProfile) => void | Promise<void>;
    signedOut: () => void;
  }) {
    el<HTMLFormElement>('profile-form').onsubmit = (event) => {
      event.preventDefault();
      void this.updateNickname();
    };
    el<HTMLButtonElement>('return-to-game').onclick = () => {
      el('account-view').hidden = true;
      el('start-view').hidden = false;
    };
    el<HTMLButtonElement>('logout').onclick = () => void this.logout();
    this.readLinks();
  }

  async initialize() {
    try {
      const account = await accountApi.me();
      await this.setAuthenticated(account);
    } catch (error) {
      if (isUnauthorized(error)) {
        this.setSignedOut();
        return;
      }
      this.setSignedOut();
      this.notice(error instanceof Error ? error.message : 'Impossibile verificare la sessione.');
    }
  }

  private async updateNickname() {
    await this.perform(async () => {
      const account = await accountApi.updateNickname(el<HTMLInputElement>('profile-nickname').value);
      await this.setAuthenticated(account);
      this.notice('Nickname aggiornato.');
    });
  }

  private async logout() {
    await this.perform(async () => {
      await accountApi.logout();
      this.setSignedOut();
      this.callbacks.signedOut();
      this.notice('Sessione terminata.');
    });
  }

  private async setAuthenticated(account: AccountProfile) {
    el('account-signed-out').hidden = true;
    el('account-signed-in').hidden = false;
    el('account-view').hidden = true;
    el('start-view').hidden = false;
    el<HTMLInputElement>('profile-nickname').value = account.nickname;
    el('profile-email').textContent = account.email;
    await this.callbacks.authenticated(account);
  }

  private setSignedOut() {
    el('account-view').hidden = false;
    el('account-signed-out').hidden = false;
    el('account-signed-in').hidden = true;
    el('start-view').hidden = true;
  }

  private readLinks() {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get('invite');
    if (invite && /^[A-Za-z0-9_-]{40,64}$/.test(invite)) {
      sessionStorage.setItem(pendingInviteKey, invite);
      url.searchParams.delete('invite');
      history.replaceState(null, '', url);
    }
    const token = url.searchParams.get('token');
    if (url.searchParams.get('auth') === 'verify' && token && /^[A-Za-z0-9_-]{40,64}$/.test(token)) {
      url.pathname = '/verify-email';
      url.searchParams.delete('auth');
      history.replaceState(null, '', url);
    } else if (url.searchParams.has('auth')) {
      this.notice('Il link non è valido o è incompleto.');
    }
  }

  private async perform(action: () => Promise<void>) {
    this.notice('');
    try {
      await action();
    } catch (error) {
      this.notice(error instanceof Error ? error.message : 'Operazione non riuscita.');
    }
  }

  private notice(message: string) {
    el('account-notice').textContent = message;
  }
}

export function pendingInviteToken() {
  return sessionStorage.getItem(pendingInviteKey);
}

export function clearPendingInvite() {
  sessionStorage.removeItem(pendingInviteKey);
}
