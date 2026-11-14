import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createGame,
  makeSave,
  migrateCampaignSave,
  validateSave,
  type CampaignDefinition,
  type CampaignSave,
  type PlayerCharacter,
} from '@smw/core';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../database/prisma.service.ts';
import {
  CAMPAIGN_CONTENT_VERSION,
  CAMPAIGN_DEFINITION,
  SERVER_CONFIGURATION,
  type ServerConfiguration,
} from '../config/server-configuration.ts';
import { RateLimitService } from '../security/rate-limit.service.ts';

type CampaignModeInput = 'SOLO' | 'COOP';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly database: PrismaService,
    private readonly definition: CampaignDefinition,
    private readonly contentVersion: string,
    private readonly limits: RateLimitService,
    private readonly configuration: ServerConfiguration,
  ) {}

  async list(accountId: string) {
    const memberships = await this.database.campaignMember.findMany({
      where: { accountId },
      orderBy: { campaign: { updatedAt: 'desc' } },
      include: { campaign: { include: { _count: { select: { members: true } } } } },
    });
    return memberships.map(({ campaign, role }) => summary(campaign, role));
  }

  async get(accountId: string, campaignId: string) {
    const owner = await this.database.campaign.findUnique({ where: { id: campaignId }, select: { ownerId: true } });
    if (!owner) throw new NotFoundException('Campagna non trovata.');
    const campaign = await this.database.campaign.findFirst({
      where: { id: campaignId, members: { some: { accountId } } },
      include: {
        members: { orderBy: { joinedAt: 'asc' }, include: { account: { select: { id: true, nickname: true } } } },
        invites: { orderBy: { createdAt: 'desc' }, select: { id: true, expiresAt: true, revokedAt: true, uses: true, maxUses: true } },
        _count: { select: { members: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campagna non trovata.');
    return {
      ...summary(campaign, campaign.members.find((member) => member.accountId === accountId)!.role),
      members: campaign.members.map(({ account, role, joinedAt }) => ({ id: account.id, nickname: account.nickname, role, joinedAt })),
      invites: owner.ownerId === accountId ? campaign.invites : undefined,
    };
  }

  async create(accountId: string, nickname: string, nameValue: unknown, modeValue: unknown) {
    const name = campaignName(nameValue);
    const mode = campaignMode(modeValue);
    const save = makeSave(createGame(this.definition, undefined, mode === 'SOLO' ? 'solo' : 'coop', [
      { id: accountId, nickname, character: 'mario' },
    ]));
    const campaign = await this.database.campaign.create({
      data: {
        ownerId: accountId,
        name,
        mode,
        saveState: save as unknown as Prisma.InputJsonValue,
        saveFormatVersion: save.version,
        contentVersion: this.contentVersion,
        members: { create: { accountId, role: 'OWNER' } },
      },
      include: { _count: { select: { members: true } } },
    });
    return summary(campaign, 'OWNER');
  }

  async importLocal(
    accountId: string,
    nickname: string,
    nameValue: unknown,
    modeValue: unknown,
    saveValue: unknown,
    idempotencyKey: unknown,
    sourceProfileIdValue: unknown,
    legacyResourceCharacterValue: unknown,
  ) {
    this.limits.consume(`import:${accountId}`, 12, 60 * 60_000);
    const name = campaignName(nameValue);
    const mode = campaignMode(modeValue);
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))
      throw new BadRequestException('Chiave di importazione non valida.');
    if (!validateSave(this.definition, saveValue)) throw new BadRequestException('Salvataggio non compatibile con il gioco.');
    const save = prepareImportSave(saveValue, accountId, sourceProfileIdValue, legacyResourceCharacterValue);
    if (!validateSave(this.definition, save)) throw new BadRequestException('Salvataggio importato non valido.');
    const existing = await this.database.campaign.findFirst({
      where: { ownerId: accountId, importKey: idempotencyKey },
      include: { _count: { select: { members: true } } },
    });
    if (existing) return summary(existing, 'OWNER');
    try {
      const campaign = await this.database.campaign.create({
        data: {
          ownerId: accountId,
          name,
          mode,
          importKey: idempotencyKey,
          saveState: save as unknown as Prisma.InputJsonValue,
          saveFormatVersion: save.version,
          contentVersion: this.contentVersion,
          members: { create: { accountId, role: 'OWNER' } },
        },
        include: { _count: { select: { members: true } } },
      });
      return summary(campaign, 'OWNER');
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const duplicate = await this.database.campaign.findFirst({
        where: { ownerId: accountId, importKey: idempotencyKey },
        include: { _count: { select: { members: true } } },
      });
      if (duplicate) return summary(duplicate, 'OWNER');
      throw new ConflictException('La campagna è stata importata con una richiesta concorrente.');
    }
  }

  async createInvite(accountId: string, campaignId: string, expiresInValue: unknown, maxUsesValue: unknown) {
    this.limits.consume(`invite:${accountId}`, 12, 60 * 60_000);
    const expiresInSeconds = expiresInValue === undefined ? 7 * 24 * 60 * 60 : Number(expiresInValue);
    const maxUses = maxUsesValue === undefined ? 7 : Number(maxUsesValue);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 30 * 24 * 60 * 60)
      throw new BadRequestException('La scadenza deve essere compresa tra un minuto e 30 giorni.');
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 8)
      throw new BadRequestException('Un invito può essere usato da 1 a 8 persone.');
    const campaign = await this.database.campaign.findUnique({ where: { id: campaignId }, select: { ownerId: true, mode: true } });
    if (!campaign) throw new NotFoundException('Campagna non trovata.');
    if (campaign.ownerId !== accountId) throw new ForbiddenException('Solo il proprietario può creare inviti.');
    if (!this.configuration.publicAppUrl) throw new ServiceUnavailableException('PUBLIC_APP_URL non configurato.');
    if (campaign.mode !== 'COOP') throw new BadRequestException('Le campagne in singolo restano private.');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    await this.database.campaignInvite.create({
      data: { tokenHash: sha256(token), campaignId, createdById: accountId, expiresAt, maxUses },
    });
    const link = new URL('/', this.configuration.publicAppUrl);
    link.searchParams.set('invite', token);
    return { campaignId, url: link.toString(), expiresAt, maxUses };
  }

  async acceptInvite(accountId: string, tokenValue: unknown) {
    this.limits.consume(`accept-invite:${accountId}`, 24, 60 * 60_000);
    if (typeof tokenValue !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(tokenValue))
      throw new BadRequestException('Invito non valido o scaduto.');
    const tokenHash = sha256(tokenValue);
    const now = new Date();
    return this.database.$transaction(async (transaction) => {
      const invite = await transaction.campaignInvite.findUnique({
        where: { tokenHash },
        include: { campaign: { select: { id: true, name: true, mode: true, revision: true } } },
      });
      if (!invite) throw new NotFoundException('Invito non valido o scaduto.');
      const membership = await transaction.campaignMember.findUnique({
        where: { campaignId_accountId: { campaignId: invite.campaignId, accountId } },
      });
      if (membership) return { campaignId: invite.campaignId, joined: false, name: invite.campaign.name };
      const use = await transaction.campaignInvite.updateMany({
        where: {
          id: invite.id,
          revokedAt: null,
          expiresAt: { gt: now },
          uses: { lt: invite.maxUses },
        },
        data: { uses: { increment: 1 } },
      });
      if (use.count !== 1) throw new BadRequestException('Invito non valido o scaduto.');
      await transaction.campaignMember.create({ data: { campaignId: invite.campaignId, accountId, role: 'MEMBER' } });
      return { campaignId: invite.campaignId, joined: true, name: invite.campaign.name };
    }, { isolationLevel: 'Serializable' });
  }

  async revokeInvite(accountId: string, campaignId: string, inviteId: string) {
    const campaign = await this.database.campaign.findUnique({ where: { id: campaignId }, select: { ownerId: true } });
    if (!campaign) throw new NotFoundException('Campagna non trovata.');
    if (campaign.ownerId !== accountId) throw new ForbiddenException('Solo il proprietario può revocare inviti.');
    const revoked = await this.database.campaignInvite.updateMany({
      where: { id: inviteId, campaignId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!revoked.count) throw new NotFoundException('Invito non trovato.');
    return { ok: true };
  }
}

function campaignName(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Nome campagna non valido.');
  const name = value.normalize('NFKC').trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 48 || /[\p{Cc}\p{Cf}]/u.test(name))
    throw new BadRequestException('Il nome deve contenere da 1 a 48 caratteri.');
  return name;
}

function campaignMode(value: unknown): CampaignModeInput {
  if (value !== 'SOLO' && value !== 'COOP') throw new BadRequestException('Modalità campagna non valida.');
  return value;
}

function summary(campaign: {
  id: string; name: string; mode: CampaignModeInput; revision: number; createdAt: Date; updatedAt: Date;
  saveState: unknown; _count: { members: number };
}, role: string) {
  const state = campaign.saveState as { progress?: { completed?: unknown[] } };
  return {
    id: campaign.id,
    name: campaign.name,
    mode: campaign.mode,
    role,
    revision: campaign.revision,
    exitsCompleted: Array.isArray(state.progress?.completed) ? state.progress.completed.length : 0,
    members: campaign._count.members,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

export const campaignsServiceProvider = {
  provide: CampaignsService,
  useFactory: (
    database: PrismaService,
    definition: CampaignDefinition,
    contentVersion: string,
    limits: RateLimitService,
    configuration: ServerConfiguration,
  ) =>
    new CampaignsService(database, definition, contentVersion, limits, configuration),
  inject: [PrismaService, CAMPAIGN_DEFINITION, CAMPAIGN_CONTENT_VERSION, RateLimitService, SERVER_CONFIGURATION],
};

function prepareImportSave(
  value: unknown,
  accountId: string,
  sourceProfileIdValue: unknown,
  legacyResourceCharacterValue: unknown,
): CampaignSave {
  if (sourceProfileIdValue !== undefined &&
    (typeof sourceProfileIdValue !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sourceProfileIdValue)))
    throw new BadRequestException('Il profilo locale da importare non è valido.');
  if (legacyResourceCharacterValue !== undefined && legacyResourceCharacterValue !== 'mario' && legacyResourceCharacterValue !== 'luigi')
    throw new BadRequestException('La scelta delle risorse locali non è valida.');
  const original = value as CampaignSave;
  const migrated = original.version === 1 ? migrateCampaignSave(original, []) : structuredClone(original);
  const resources = { ...migrated.resources };
  const mapPlayers = { ...(migrated.mapPlayers ?? {}) };
  const sourceProfileId = sourceProfileIdValue as string | undefined;
  if (sourceProfileId && sourceProfileId !== accountId && resources[sourceProfileId] && !resources[accountId]) {
    resources[accountId] = resources[sourceProfileId]!;
    delete resources[sourceProfileId];
    if (mapPlayers[sourceProfileId]) {
      mapPlayers[accountId] = mapPlayers[sourceProfileId]!;
      delete mapPlayers[sourceProfileId];
    }
    if (migrated.spectators?.includes(sourceProfileId))
      migrated.spectators = [...new Set(migrated.spectators.map((id) => id === sourceProfileId ? accountId : id))];
  }
  const legacyResources = { ...(migrated.legacyResources ?? {}) };
  for (const character of ['mario', 'luigi'] as const) {
    const resource = legacyResources[character];
    if (!resource) continue;
    if (legacyResourceCharacterValue === character && !resources[accountId]) {
      resources[accountId] = resource;
      const legacyPosition = mapPlayers['legacy:' + character];
      if (legacyPosition) {
        mapPlayers[accountId] = legacyPosition;
        delete mapPlayers['legacy:' + character];
      }
    } else resources['legacy:' + character] = resource;
    delete legacyResources[character];
  }
  const { legacyResources: _legacyResources, ...save } = migrated;
  return {
    ...save,
    version: 2,
    resources,
    ...(Object.keys(mapPlayers).length ? { mapPlayers } : {}),
  };
}
