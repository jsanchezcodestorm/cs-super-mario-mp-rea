import { accountApi, type CampaignSummary } from '../session/api';
import { browserPlayerId } from '../session/connection';
import { readCampaigns } from '../session/save';
import { clearPendingInvite, pendingInviteToken } from './account-panel';
import { CampaignDetails } from './campaign-details';
import { el } from './lobby';

export class CampaignPanel {
  private campaigns: CampaignSummary[] = [];

  constructor(private readonly changed: (campaigns: CampaignSummary[]) => void) {
    el<HTMLFormElement>('account-campaign-form').onsubmit = (event) => {
      event.preventDefault();
      void this.create();
    };
    el<HTMLFormElement>('invite-form').onsubmit = (event) => {
      event.preventDefault();
      void this.createInvite();
    };
    el<HTMLButtonElement>('import-local-campaigns').onclick = () => void this.importLocal();
  }

  async load() {
    this.campaigns = await accountApi.campaigns();
    this.render();
    this.changed(this.campaigns);
    const token = pendingInviteToken();
    if (token) {
      try {
        const result = await accountApi.acceptInvite(token);
        clearPendingInvite();
        await this.refresh();
        this.notice(result.joined ? `Ti sei unito a ${result.name}.` : `Sei già membro di ${result.name}.`);
      } catch (error) {
        this.notice(error instanceof Error ? error.message : 'Impossibile accettare l’invito.');
      }
    }
  }

  async refresh() {
    this.campaigns = await accountApi.campaigns();
    this.render();
    this.changed(this.campaigns);
  }

  private async create() {
    await this.perform(async () => {
      const name = el<HTMLInputElement>('account-campaign-name').value;
      const mode = el<HTMLSelectElement>('account-campaign-mode').value as CampaignSummary['mode'];
      await accountApi.createCampaign(name, mode);
      el<HTMLFormElement>('account-campaign-form').reset();
      await this.refresh();
      this.notice('Campagna creata.');
    });
  }

  private async createInvite() {
    await this.perform(async () => {
      const campaignId = el<HTMLSelectElement>('invite-campaign').value;
      const maxUses = Number(el<HTMLSelectElement>('invite-uses').value);
      const invite = await accountApi.createInvite(campaignId, maxUses);
      const output = el<HTMLOutputElement>('invite-link-output');
      output.replaceChildren();
      const link = document.createElement('a');
      link.href = invite.url;
      link.textContent = invite.url;
      link.rel = 'noreferrer';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'subtle';
      copy.textContent = 'Copia link';
      copy.onclick = () => void navigator.clipboard.writeText(invite.url).then(
        () => this.notice('Link copiato.'),
        () => this.notice('Copia il link manualmente.'),
      );
      output.append(link, copy);
      this.notice('Link creato. Chi lo riceve deve accedere e accettare l’invito.');
    });
  }

  private async importLocal() {
    await this.perform(async () => {
      const local = await readCampaigns();
      if (local.length === 0) {
        this.notice('Non ci sono campagne locali da importare.');
        return;
      }
      const mode = el<HTMLSelectElement>('import-mode').value as CampaignSummary['mode'];
      const legacyCharacter = el<HTMLSelectElement>('import-character').value as 'mario' | 'luigi' | '';
      let imported = 0;
      for (const campaign of local) {
        await accountApi.importCampaign(
          campaign.name,
          mode,
          campaign.save,
          campaign.id,
          browserPlayerId(),
          legacyCharacter || undefined,
        );
        imported++;
        await this.refresh();
      }
      this.notice(`${imported} campagne importate. Le copie locali restano nel browser.`);
    });
  }

  private render() {
    const list = el('account-campaigns');
    list.replaceChildren();
    for (const campaign of this.campaigns) {
      const item = document.createElement('li');
      const label = document.createElement('p');
      label.textContent = `${campaign.name} · ${campaign.mode === 'SOLO' ? 'Singolo' : 'Co-op'} · ${campaign.exitsCompleted}/96 uscite · ${campaign.members} membri`;
      label.className = 'campaign-summary';
      item.append(label);
      new CampaignDetails(campaign, (message) => this.notice(message)).attach(item);
      list.append(item);
    }
    const invites = el<HTMLSelectElement>('invite-campaign');
    invites.replaceChildren(new Option('Scegli una campagna', ''));
    for (const campaign of this.campaigns.filter((entry) => entry.mode === 'COOP' && entry.role === 'OWNER'))
      invites.add(new Option(campaign.name, campaign.id));
    el<HTMLFormElement>('invite-form')
      .querySelector<HTMLButtonElement>('button[type="submit"]')
      ?.toggleAttribute('disabled', invites.options.length < 2);
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
