import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CampaignDefinition, CampaignSave, GameMode, GameState, PlayerCharacter, PlayerProfile } from '@smw/core';
import { validateSave } from '@smw/core';
import { Prisma } from '../generated/prisma/client.ts';
import { CAMPAIGN_CONTENT_VERSION, CAMPAIGN_DEFINITION } from '../config/server-configuration.ts';
import { PrismaService } from '../database/prisma.service.ts';

export type OpenedGameSession = {
  id: string;
  campaignId: string;
  campaign: CampaignDefinition;
  save: CampaignSave;
  mode: GameMode;
  revision: number;
  profile: PlayerProfile;
};

@Injectable()
export class GameSessionsService {
  constructor(
    private readonly database: PrismaService,
    private readonly definition: CampaignDefinition,
    private readonly contentVersion: string,
  ) {}

  async open(account: { id: string; nickname: string }, campaignId: string, mode: GameMode, character: PlayerCharacter): Promise<OpenedGameSession> {
    const campaign = await this.database.campaign.findFirst({
      where: { id: campaignId, members: { some: { accountId: account.id } } },
      select: { id: true, mode: true, saveState: true, saveFormatVersion: true, revision: true, contentVersion: true },
    });
    if (!campaign) throw new NotFoundException('Campagna inesistente o non accessibile.');
    if (campaign.mode !== mode.toUpperCase()) throw new ConflictException('La modalità non corrisponde alla campagna.');
    const save = assertCampaignSave(this.definition, campaign.saveState);
    const profile = { id: account.id, nickname: account.nickname, character };
    try {
      const session = await this.database.$transaction(async (transaction) => {
        const created = await transaction.gameSession.create({
          data: { campaignId, mode: campaign.mode, status: 'ACTIVE' },
          select: { id: true },
        });
        const score = save.resources[account.id]?.score ?? 0;
        await transaction.gameSessionParticipant.create({
          data: {
            gameSessionId: created.id,
            accountId: account.id,
            character,
            nicknameAtStart: account.nickname,
            initialScore: score,
            lastCreditedScore: score,
            startingExitIds: save.progress.completed,
          },
        });
        return created;
      }, { isolationLevel: 'Serializable' });
      return {
        id: session.id,
        campaignId,
        campaign: this.definition,
        save,
        mode,
        revision: campaign.revision,
        profile,
      };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('La campagna è già in uso da un’altra sessione.');
      throw error;
    }
  }

  async join(sessionId: string, account: { id: string; nickname: string }, character: PlayerCharacter): Promise<PlayerProfile> {
    try {
      await this.database.$transaction(async (transaction) => {
        const session = await transaction.gameSession.findFirst({
          where: { id: sessionId, status: 'ACTIVE' },
          include: {
            campaign: { select: { id: true, mode: true, saveState: true } },
            _count: { select: { participants: true } },
          },
        });
        if (!session) throw new NotFoundException('La sessione non è più disponibile.');
        if (session.mode !== 'COOP') throw new ForbiddenException('La campagna è in modalità singolo.');
        const membership = await transaction.campaignMember.findUnique({
          where: { campaignId_accountId: { campaignId: session.campaignId, accountId: account.id } },
          select: { id: true },
        });
        if (!membership) throw new ForbiddenException('Devi accettare l’invito alla campagna prima di entrare.');
        if (session._count.participants >= 8) throw new ConflictException('La sessione ha già otto partecipanti.');
        const save = assertCampaignSave(this.definition, session.campaign.saveState);
        const score = save.resources[account.id]?.score ?? 0;
        await transaction.gameSessionParticipant.create({
          data: {
            gameSessionId: session.id,
            accountId: account.id,
            character,
            nicknameAtStart: account.nickname,
            initialScore: score,
            lastCreditedScore: score,
            startingExitIds: save.progress.completed,
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Sei già presente in questa sessione.');
      if (isSerializationFailure(error)) throw new ConflictException('La stanza è cambiata; prova a rientrare.');
      throw error;
    }
    return { id: account.id, nickname: account.nickname, character };
  }

  async persist(
    sessionId: string,
    campaignId: string,
    sequence: number,
    expectedRevision: number,
    save: CampaignSave,
    state: GameState,
  ) {
    const saveHash = sha256(JSON.stringify(save));
    try {
      return await this.database.$transaction(async (transaction) => {
        const existingCheckpoint = await transaction.gameSessionCheckpoint.findUnique({
          where: { gameSessionId_sequence: { gameSessionId: sessionId, sequence } },
          select: { campaignRevision: true, saveHash: true, createdAt: true },
        });
        if (existingCheckpoint) {
          if (existingCheckpoint.saveHash !== saveHash) throw new ConflictException('La revisione è già stata salvata con altri dati.');
          return { revision: existingCheckpoint.campaignRevision, durableAt: existingCheckpoint.createdAt };
        }
        const active = await transaction.gameSession.findFirst({ where: { id: sessionId, campaignId, status: 'ACTIVE' } });
        if (!active) throw new ConflictException('La sessione non è più attiva.');
        const update = await transaction.campaign.updateMany({
          where: { id: campaignId, revision: expectedRevision },
          data: {
            saveState: save as unknown as Prisma.InputJsonValue,
            saveFormatVersion: save.version,
            contentVersion: this.contentVersion,
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        if (update.count !== 1) throw new ConflictException('La campagna è cambiata durante la sessione.');
        const revision = expectedRevision + 1;
        await transaction.gameSessionCheckpoint.create({
          data: { gameSessionId: sessionId, sequence, campaignRevision: revision, saveHash },
        });
        const participants = await transaction.gameSessionParticipant.findMany({
          where: { gameSessionId: sessionId },
          select: {
            accountId: true,
            lastCreditedScore: true,
            startingExitIds: true,
            completedExitIds: true,
          },
        });
        for (const participant of participants) {
          const currentScore = state.players[participant.accountId]?.score ?? participant.lastCreditedScore;
          const scoreAdvance = Math.max(0, currentScore - participant.lastCreditedScore);
          const lastCreditedScore = Math.max(participant.lastCreditedScore, currentScore);
          const completedExitIds = [...new Set([
            ...participant.completedExitIds,
            ...save.progress.completed.filter((exit) => !participant.startingExitIds.includes(exit)),
          ])].slice(0, 96);
          await transaction.gameSessionParticipant.update({
            where: { gameSessionId_accountId: { gameSessionId: sessionId, accountId: participant.accountId } },
            data: {
              lastCreditedScore,
              pointsEarned: { increment: scoreAdvance },
              completedExitIds,
              maxExitCount: completedExitIds.length,
            },
          });
        }
        const now = new Date();
        await transaction.gameSession.update({
          where: { id: sessionId },
          data: state.phase === 'ending'
            ? { lastDurableAt: now, status: 'COMPLETED', closeReason: 'FINAL', closedAt: now }
            : { lastDurableAt: now },
        });
        return { revision, durableAt: now };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const checkpoint = await this.database.gameSessionCheckpoint.findUnique({
          where: { gameSessionId_sequence: { gameSessionId: sessionId, sequence } },
          select: { campaignRevision: true, saveHash: true },
        });
        if (checkpoint?.saveHash === saveHash) return { revision: checkpoint.campaignRevision, durableAt: new Date() };
      }
      throw error;
    }
  }

  async close(sessionId: string, status: 'COMPLETED' | 'INTERRUPTED' | 'ABANDONED', reason: string) {
    await this.database.gameSession.updateMany({
      where: { id: sessionId, status: 'ACTIVE' },
      data: { status, closeReason: reason.slice(0, 40), closedAt: new Date() },
    });
  }

  async history(accountId: string, page: number, pageSize: number) {
    const where = { accountId };
    const [total, rows] = await this.database.$transaction([
      this.database.gameSessionParticipant.count({ where }),
      this.database.gameSessionParticipant.findMany({
        where,
        orderBy: [{ gameSession: { startedAt: 'desc' } }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          gameSession: { include: { campaign: { select: { id: true, name: true } } } },
        },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((participant) => ({
        id: participant.gameSession.id,
        campaignId: participant.gameSession.campaign.id,
        campaignName: participant.gameSession.campaign.name,
        mode: participant.gameSession.mode.toLowerCase(),
        status: participant.gameSession.status.toLowerCase(),
        character: participant.character,
        nicknameAtStart: participant.nicknameAtStart,
        startedAt: participant.gameSession.startedAt,
        closedAt: participant.gameSession.closedAt,
        pointsEarned: participant.pointsEarned,
        exitsCompleted: participant.maxExitCount,
      })),
    };
  }
}

function assertCampaignSave(campaign: CampaignDefinition, value: unknown): CampaignSave {
  if (!validateSave(campaign, value)) throw new Error('Il salvataggio della campagna è corrotto o incompatibile.');
  return value;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

function isSerializationFailure(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2034';
}

export const gameSessionsServiceProvider = {
  provide: GameSessionsService,
  useFactory: (database: PrismaService, definition: CampaignDefinition, contentVersion: string) =>
    new GameSessionsService(database, definition, contentVersion),
  inject: [PrismaService, CAMPAIGN_DEFINITION, CAMPAIGN_CONTENT_VERSION],
};
