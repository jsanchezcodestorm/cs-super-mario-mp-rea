import { accountApi, type SessionHistoryPage } from '../session/api';
import { el } from './lobby';

export class ProgressPanel {
  private historyPage = 0;
  private historyTotal = 0;
  private leaderboardPage = 0;
  private leaderboardPageSize = 20;
  private leaderboardTotal = 0;
  private leaderboardQuery?: { metric: 'points' | 'progress'; mode: 'solo' | 'coop' };

  constructor() {
    el<HTMLButtonElement>('history-more').onclick = () => void this.loadHistory(this.historyPage + 1);
    el<HTMLButtonElement>('load-leaderboard').onclick = () => void this.loadLeaderboard();
    el<HTMLButtonElement>('leaderboard-more').onclick = () => void this.loadMoreLeaderboard();
  }

  async load() {
    this.historyPage = 0;
    el('session-history').replaceChildren();
    await this.loadHistory(1);
  }

  private async loadHistory(page: number) {
    await this.perform(async () => {
      const result = await accountApi.history(page);
      this.historyPage = result.page;
      this.historyTotal = result.total;
      this.renderHistory(result);
    });
  }

  private async loadLeaderboard() {
    this.leaderboardQuery = {
      metric: el<HTMLSelectElement>('leaderboard-metric').value as 'points' | 'progress',
      mode: el<HTMLSelectElement>('leaderboard-mode').value as 'solo' | 'coop',
    };
    this.leaderboardPage = 0;
    this.leaderboardTotal = 0;
    el('leaderboard-list').replaceChildren();
    await this.loadLeaderboardPage(1);
  }

  private async loadMoreLeaderboard() {
    if (!this.leaderboardQuery || this.leaderboardPage * this.leaderboardPageSize >= this.leaderboardTotal) return;
    await this.loadLeaderboardPage(this.leaderboardPage + 1);
  }

  private async loadLeaderboardPage(page: number) {
    await this.perform(async () => {
      const query = this.leaderboardQuery;
      if (!query) return;
      const result = await accountApi.leaderboard(query.metric, query.mode, page);
      const list = el('leaderboard-list');
      if (page === 1) list.replaceChildren();
      this.leaderboardPage = result.page;
      this.leaderboardPageSize = result.pageSize;
      this.leaderboardTotal = result.total;
      for (const row of result.items) {
        const item = document.createElement('li');
        const value = query.metric === 'points' ? `${row.points ?? 0} punti` : `${row.exitsCompleted ?? 0}/96 uscite`;
        item.textContent = `${row.rank}. ${row.nickname} · ${value}`;
        list.append(item);
      }
      if (result.items.length === 0 && page === 1) {
        const empty = document.createElement('li');
        empty.textContent = 'La classifica è ancora vuota.';
        list.append(empty);
      }
      el<HTMLButtonElement>('leaderboard-more').hidden = result.page * result.pageSize >= result.total;
    });
  }

  private renderHistory(result: SessionHistoryPage) {
    const list = el('session-history');
    for (const session of result.items) {
      const item = document.createElement('li');
      const started = new Date(session.startedAt).toLocaleDateString('it-IT');
      const mode = session.mode === 'solo' ? 'Singolo' : 'Co-op';
      const status = session.status === 'active' ? 'Attiva'
        : session.status === 'completed' ? 'Completata'
          : session.status === 'interrupted' ? 'Interrotta' : 'Abbandonata';
      item.textContent = `${session.campaignName} · ${mode} · ${status} · ${started} · +${session.pointsEarned} punti · ${session.exitsCompleted}/96 uscite`;
      list.append(item);
    }
    el<HTMLButtonElement>('history-more').hidden = this.historyPage * result.pageSize >= this.historyTotal;
  }

  private async perform(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      el('account-notice').textContent = error instanceof Error ? error.message : 'Impossibile caricare i risultati.';
    }
  }
}
