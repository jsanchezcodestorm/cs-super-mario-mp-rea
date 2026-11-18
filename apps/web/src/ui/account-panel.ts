import { accountApi, isUnauthorized, type AccountProfile, type PlatformUser } from '../session/api';
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
      const session = await accountApi.session();
      if (!session.user) {
        this.setSignedOut();
        return;
      }
      const account = await accountApi.me();
      if (account) await this.setAuthenticated(account);
      else this.setOnboarding(session.user);
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
      const account = await accountApi.saveNickname(el<HTMLInputElement>('profile-nickname').value);
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
    el<HTMLButtonElement>('return-to-game').hidden = false;
    el('profile-section-title').textContent = 'Il tuo profilo';
    el<HTMLButtonElement>('profile-submit').textContent = 'Salva';
    for (const section of document.querySelectorAll<HTMLElement>('#account-signed-in .account-section')) section.hidden = false;
    el<HTMLInputElement>('profile-nickname').value = account.nickname;
    el('profile-email').textContent = account.email;
    await this.callbacks.authenticated(account);
  }

  private setOnboarding(user: PlatformUser) {
    el('account-signed-out').hidden = true;
    el('account-signed-in').hidden = false;
    el('account-view').hidden = false;
    el('start-view').hidden = true;
    el<HTMLButtonElement>('return-to-game').hidden = true;
    el('profile-section-title').textContent = 'Scegli il tuo nickname';
    el<HTMLButtonElement>('profile-submit').textContent = 'Completa il profilo';
    el<HTMLInputElement>('profile-nickname').value = '';
    el('profile-email').textContent = user.email;
    for (const section of document.querySelectorAll<HTMLElement>('#account-signed-in .account-section')) section.hidden = true;
  }

  private setSignedOut() {
    el('account-view').hidden = false;
    el('account-signed-out').hidden = false;
    el('account-signed-in').hidden = true;
    el('start-view').hidden = true;
    el<HTMLButtonElement>('return-to-game').hidden = false;
    el<HTMLButtonElement>('profile-submit').textContent = 'Salva';
    for (const section of document.querySelectorAll<HTMLElement>('#account-signed-in .account-section')) section.hidden = false;
  }

  private readLinks() {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get('invite');
    if (invite && /^[A-Za-z0-9_-]{40,64}$/.test(invite)) {
      sessionStorage.setItem(pendingInviteKey, invite);
      url.searchParams.delete('invite');
      history.replaceState(null, '', url);
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
