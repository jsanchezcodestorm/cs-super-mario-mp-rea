import { accountApi } from '../session/api';
import { el } from './lobby';

const authRoutes: Record<string, string> = {
  '/login': 'login-page',
  '/register': 'register-page',
  '/forgot-password': 'forgot-password-page',
  '/verify-email': 'verify-email-page',
  '/reset-password': 'reset-password-page',
};

export class AuthPages {
  private token?: string;

  constructor(private readonly onReturnToApplication: () => void = () => {}) {
    document.addEventListener('click', (event) => this.navigateAuthLink(event));
    window.addEventListener('popstate', () => {
      if (!this.renderRoute()) this.onReturnToApplication();
    });
    el<HTMLFormElement>('register-form').onsubmit = (event) => {
      event.preventDefault();
      void this.submit('register-form', () => this.register());
    };
    el<HTMLFormElement>('login-form').onsubmit = (event) => {
      event.preventDefault();
      void this.submit('login-form', () => this.login());
    };
    el<HTMLFormElement>('forgot-password-form').onsubmit = (event) => {
      event.preventDefault();
      void this.submit('forgot-password-form', () => this.requestPasswordReset());
    };
    el<HTMLFormElement>('verify-email-form').onsubmit = (event) => {
      event.preventDefault();
      void this.submit('verify-email-form', () => this.verifyEmail());
    };
    el<HTMLFormElement>('reset-password-form').onsubmit = (event) => {
      event.preventDefault();
      void this.submit('reset-password-form', () => this.resetPassword());
    };
  }

  initialize() {
    return this.renderRoute();
  }

  private renderRoute() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const activePage = authRoutes[path];
    this.token = undefined;
    this.notice('');
    if (!activePage) {
      document.body.classList.remove('auth-route');
      el('auth-pages').hidden = true;
      return false;
    }

    document.body.classList.add('auth-route');
    el('auth-pages').hidden = false;
    for (const page of document.querySelectorAll<HTMLElement>('[data-auth-page]')) page.hidden = page.id !== activePage;

    if (path === '/verify-email' || path === '/reset-password') {
      const token = new URLSearchParams(window.location.search).get('token');
      if (token && /^[A-Za-z0-9_-]{40,64}$/.test(token)) this.token = token;
      else {
        this.notice('Il link non è valido o è scaduto. Richiedine uno nuovo.');
        el<HTMLButtonElement>(path === '/verify-email' ? 'verify-email-submit' : 'reset-password-submit').disabled = true;
      }
    }
    if (path === '/login' && new URLSearchParams(window.location.search).has('reset'))
      this.notice('Password aggiornata. Accedi con la nuova password.');
    return true;
  }

  private navigateAuthLink(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return;
    const target = new URL(anchor.href, window.location.href);
    const path = target.pathname.replace(/\/+$/, '') || '/';
    if (target.origin !== window.location.origin || !Object.hasOwn(authRoutes, path)) return;

    event.preventDefault();
    history.pushState(null, '', `${target.pathname}${target.search}${target.hash}`);
    this.renderRoute();
  }

  private async register() {
    const password = el<HTMLInputElement>('register-password').value;
    if (password !== el<HTMLInputElement>('register-password-confirm').value) {
      this.notice('Le password non corrispondono.');
      return;
    }
    const result = await accountApi.register(
      el<HTMLInputElement>('register-email').value,
      el<HTMLInputElement>('register-nickname').value,
      password,
    );
    el<HTMLFormElement>('register-form').reset();
    this.notice(result.message);
  }

  private async login() {
    await accountApi.login(
      el<HTMLInputElement>('login-email').value,
      el<HTMLInputElement>('login-password').value,
    );
    window.location.assign('/');
  }

  private async requestPasswordReset() {
    const result = await accountApi.requestPasswordReset(el<HTMLInputElement>('forgot-email').value);
    this.notice(result.message);
    el<HTMLFormElement>('forgot-password-form').reset();
  }

  private async verifyEmail() {
    if (!this.token) return;
    await accountApi.verifyEmail(this.token);
    window.location.assign('/');
  }

  private async resetPassword() {
    if (!this.token) return;
    const password = el<HTMLInputElement>('reset-password').value;
    if (password !== el<HTMLInputElement>('reset-password-confirm').value) {
      this.notice('Le password non corrispondono.');
      return;
    }
    await accountApi.resetPassword(this.token, password);
    window.location.assign('/login?reset=1');
  }

  private async submit(formId: string, action: () => Promise<void>) {
    const form = el<HTMLFormElement>(formId);
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    this.notice('');
    try {
      await action();
    } catch (error) {
      this.notice(error instanceof Error ? error.message : 'Operazione non riuscita.');
    } finally {
      form.removeAttribute('aria-busy');
      if (button) button.disabled = false;
    }
  }

  private notice(message: string) {
    el('auth-notice').textContent = message;
  }
}
