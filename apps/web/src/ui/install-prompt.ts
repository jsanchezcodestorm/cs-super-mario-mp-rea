type InstallChoiceEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type InstallPlatform = 'ios' | 'android' | 'other';

export class InstallPrompt {
  private readonly button = document.getElementById('install-app') as HTMLButtonElement;
  private readonly dialog = document.getElementById('install-guide') as HTMLDialogElement;
  private readonly intro = document.getElementById('install-intro') as HTMLParagraphElement;
  private readonly steps = document.getElementById('install-steps') as HTMLOListElement;
  private deferredInstall?: InstallChoiceEvent;
  private installed = false;

  constructor() {
    this.button.addEventListener('click', this.open);
    document.getElementById('install-guide-close')!.addEventListener('click', this.close);
    document.getElementById('install-guide-done')!.addEventListener('click', this.close);
    window.addEventListener('beforeinstallprompt', this.captureInstallPrompt);
    window.addEventListener('appinstalled', this.markInstalled);
    this.sync();
  }

  private readonly captureInstallPrompt = (event: Event) => {
    if (!this.isMobile() || this.platform() !== 'android') return;
    event.preventDefault();
    this.deferredInstall = event as InstallChoiceEvent;
    this.sync();
  };

  private readonly open = () => {
    if (this.platform() === 'android' && this.deferredInstall) {
      const install = this.deferredInstall;
      this.deferredInstall = undefined;
      this.sync();
      void install
        .prompt()
        .then(() => install.userChoice)
        .then((choice) => {
          if (choice.outcome === 'accepted') this.markInstalled();
        })
        .catch(() => this.showGuide());
      return;
    }
    this.showGuide();
  };

  private readonly close = () => this.dialog.close();

  private readonly markInstalled = () => {
    this.installed = true;
    this.deferredInstall = undefined;
    if (this.dialog.open) this.dialog.close();
    this.sync();
  };

  private sync() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const safariStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    this.button.hidden = !this.isMobile() || this.installed || standalone || safariStandalone;
    this.button.firstElementChild!.textContent = this.deferredInstall ? '↓' : '↥';
    this.button.lastElementChild!.textContent = this.deferredInstall
      ? 'Installa app'
      : 'Aggiungi alla schermata Home';
  }

  private isMobile() {
    return window.matchMedia('(max-width: 760px), (any-pointer: coarse)').matches;
  }

  private platform(): InstallPlatform {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    if (/iphone|ipad|ipod/.test(userAgent) || isIPadOS) return 'ios';
    if (/android/.test(userAgent)) return 'android';
    return 'other';
  }

  private showGuide() {
    const platform = this.platform();
    const guide =
      platform === 'ios'
        ? {
            intro: 'Su iPhone e iPad, aggiungi il gioco da Safari:',
            steps: [
              'Apri questa pagina in Safari.',
              'Tocca Condividi.',
              'Scegli “Aggiungi alla schermata Home”.',
              'Se compare l’opzione, attiva “Apri come app web”, poi tocca Aggiungi.',
            ],
          }
        : platform === 'android'
          ? {
              intro: 'Su Android, puoi aggiungere il gioco dalla pagina aperta in Chrome:',
              steps: [
                'Apri il menu ⋮ in alto a destra.',
                'Scegli “Installa app” oppure “Aggiungi a schermata Home”.',
                'Conferma l’installazione.',
              ],
            }
          : {
              intro: 'Apri il menu del browser per aggiungere il gioco al dispositivo:',
              steps: ['Scegli “Installa app” o “Aggiungi alla schermata Home”, se disponibile.'],
            };
    this.intro.textContent = guide.intro;
    this.steps.replaceChildren(
      ...guide.steps.map((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        return item;
      }),
    );
    if (!this.dialog.open) this.dialog.showModal();
  }
}
