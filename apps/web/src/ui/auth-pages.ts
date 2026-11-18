import { startMicrosoftLogin } from '../session/api';
import { el } from './lobby';

export class AuthPages {
  constructor(private readonly onReturnToApplication: () => void = () => {}) {
    el<HTMLButtonElement>('microsoft-login').onclick = () => {
      const button = el<HTMLButtonElement>('microsoft-login');
      button.disabled = true;
      startMicrosoftLogin(new URL('/', window.location.origin));
    };
    window.addEventListener('popstate', () => {
      if (!this.renderRoute()) this.onReturnToApplication();
    });
  }

  initialize() {
    return this.renderRoute();
  }

  private renderRoute() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path !== '/login') {
      document.body.classList.remove('auth-route');
      el('auth-pages').hidden = true;
      return false;
    }

    document.body.classList.add('auth-route');
    el('auth-pages').hidden = false;
    el('login-page').hidden = false;
    return true;
  }
}
