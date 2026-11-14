import { accountApi, type CampaignDetail, type CampaignSummary } from '../session/api';

export class CampaignDetails {
  private readonly details = document.createElement('details');
  private readonly body = document.createElement('div');
  private loading = false;

  constructor(
    private readonly campaign: CampaignSummary,
    private readonly notice: (message: string) => void,
  ) {
    const summary = document.createElement('summary');
    summary.textContent = 'Dettagli, membri e inviti';
    this.details.append(summary, this.body);
    this.details.addEventListener('toggle', () => {
      if (this.details.open && !this.loading) void this.refresh();
    });
  }

  attach(parent: HTMLElement) {
    parent.append(this.details);
  }

  private async refresh() {
    this.loading = true;
    this.body.replaceChildren(document.createTextNode('Caricamento…'));
    try {
      const detail = await accountApi.campaign(this.campaign.id);
      this.render(detail);
    } catch (error) {
      this.body.replaceChildren(document.createTextNode(
        error instanceof Error ? error.message : 'Dettagli campagna non disponibili.',
      ));
    } finally {
      this.loading = false;
    }
  }

  private render(detail: CampaignDetail) {
    this.body.replaceChildren();
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'subtle';
    refresh.textContent = 'Aggiorna dettagli';
    refresh.onclick = () => void this.refresh();
    this.body.append(refresh);

    const membersHeading = document.createElement('strong');
    membersHeading.textContent = 'Membri';
    const members = document.createElement('ul');
    members.className = 'account-list';
    for (const member of detail.members) {
      const item = document.createElement('li');
      item.textContent = `${member.nickname} · ${member.role === 'OWNER' ? 'Proprietario' : 'Membro'}`;
      members.append(item);
    }
    this.body.append(membersHeading, members);

    if (detail.invites === undefined) return;
    const invitesHeading = document.createElement('strong');
    invitesHeading.textContent = 'Inviti';
    const invites = document.createElement('ul');
    invites.className = 'account-list';
    for (const invite of detail.invites) invites.append(this.inviteItem(invite, detail.id));
    if (detail.invites.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'Nessun invito creato.';
      invites.append(item);
    }
    this.body.append(invitesHeading, invites);
  }

  private inviteItem(
    invite: NonNullable<CampaignDetail['invites']>[number],
    campaignId: string,
  ) {
    const item = document.createElement('li');
    const expires = Date.parse(invite.expiresAt);
    const expired = expires <= Date.now();
    const revoked = invite.revokedAt !== null;
    const state = revoked ? 'Revocato' : expired ? 'Scaduto' : 'Attivo';
    item.append(document.createTextNode(
      `${state} · ${invite.uses}/${invite.maxUses} utilizzi · scade ${new Date(expires).toLocaleString('it-IT')}`,
    ));
    if (!revoked && !expired) {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'subtle';
      revoke.textContent = 'Revoca';
      revoke.onclick = () => void this.revoke(campaignId, invite.id);
      item.append(' ', revoke);
    }
    return item;
  }

  private async revoke(campaignId: string, inviteId: string) {
    try {
      await accountApi.revokeInvite(campaignId, inviteId);
      this.notice('Invito revocato.');
      await this.refresh();
    } catch (error) {
      this.notice(error instanceof Error ? error.message : 'Impossibile revocare l’invito.');
    }
  }
}
