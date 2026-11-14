import type { CampaignSave } from '@smw/core';

export type AccountProfile = { id: string; email: string; nickname: string };
export type CampaignSummary = {
  id: string;
  name: string;
  mode: 'SOLO' | 'COOP';
  role: 'OWNER' | 'MEMBER';
  revision: number;
  exitsCompleted: number;
  members: number;
  createdAt: string;
  updatedAt: string;
};
export type CampaignDetail = CampaignSummary & {
  members: { id: string; nickname: string; role: 'OWNER' | 'MEMBER'; joinedAt: string }[];
  invites?: { id: string; expiresAt: string; revokedAt: string | null; uses: number; maxUses: number }[];
};
export type LeaderboardPage = {
  metric: 'points' | 'progress';
  mode: 'solo' | 'coop';
  page: number;
  pageSize: number;
  total: number;
  items: { rank: number; accountId: string; nickname: string; points?: number; exitsCompleted?: number }[];
};
export type SessionHistoryPage = {
  page: number;
  pageSize: number;
  total: number;
  items: {
    id: string;
    campaignId: string;
    campaignName: string;
    mode: 'solo' | 'coop';
    status: 'active' | 'completed' | 'interrupted' | 'abandoned';
    character: string;
    nicknameAtStart: string;
    startedAt: string;
    closedAt: string | null;
    pointsEarned: number;
    exitsCompleted: number;
  }[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: unknown } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : typeof body?.message === 'string' ? body.message : `Richiesta non riuscita (${response.status}).`;
    throw new Error(message);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export const accountApi = {
  me: () => request<AccountProfile>('/api/v1/me'),
  register: (email: string, nickname: string, password: string) => post<{ message: string }>(
    '/api/v1/auth/register', { email, nickname, password },
  ),
  login: (email: string, password: string) => post<{ account: { id: string; nickname: string } }>(
    '/api/v1/auth/login', { email, password },
  ),
  verifyEmail: (token: string) => post<{ account: { id: string; nickname: string } }>(
    '/api/v1/auth/verify-link', { token },
  ),
  requestPasswordReset: (email: string) => post<{ message: string }>(
    '/api/v1/auth/password-reset-request', { email },
  ),
  resetPassword: (token: string, password: string) => post<{ ok: true }>(
    '/api/v1/auth/password-reset', { token, password },
  ),
  logout: () => post<{ ok: true }>('/api/v1/auth/logout'),
  updateNickname: (nickname: string) => request<AccountProfile>('/api/v1/me', {
    method: 'PATCH',
    body: JSON.stringify({ nickname }),
  }),
  campaigns: () => request<CampaignSummary[]>('/api/v1/campaigns'),
  campaign: (campaignId: string) => request<CampaignDetail>(`/api/v1/campaigns/${encodeURIComponent(campaignId)}`),
  createCampaign: (name: string, mode: CampaignSummary['mode']) => post<CampaignSummary>('/api/v1/campaigns', { name, mode }),
  createInvite: (campaignId: string, maxUses: number) => post<{ campaignId: string; url: string; expiresAt: string; maxUses: number }>(
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/invites`, { maxUses },
  ),
  acceptInvite: (token: string) => post<{ campaignId: string; joined: boolean; name: string }>(
    `/api/v1/campaign-invites/${encodeURIComponent(token)}/accept`,
  ),
  revokeInvite: (campaignId: string, inviteId: string) => request<{ ok: true }>(
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/invites/${encodeURIComponent(inviteId)}`,
    { method: 'DELETE' },
  ),
  importCampaign: (
    name: string,
    mode: CampaignSummary['mode'],
    save: CampaignSave,
    idempotencyKey: string,
    sourceProfileId: string,
    legacyResourceCharacter?: 'mario' | 'luigi',
  ) => post<CampaignSummary>('/api/v1/campaigns/import', {
    name, mode, save, idempotencyKey, sourceProfileId, legacyResourceCharacter,
  }),
  history: (page = 1) => request<SessionHistoryPage>(`/api/v1/me/sessions?page=${page}&pageSize=20`),
  leaderboard: (metric: 'points' | 'progress', mode: 'solo' | 'coop', page: number) => request<LeaderboardPage>(
    `/api/v1/leaderboard?metric=${metric}&mode=${mode}&page=${page}&pageSize=20`,
  ),
};

export function isUnauthorized(error: unknown) {
  return error instanceof Error && error.message === 'Accedi per continuare.';
}
