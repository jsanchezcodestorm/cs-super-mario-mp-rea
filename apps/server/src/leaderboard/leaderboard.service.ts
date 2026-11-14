import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../database/prisma.service.ts';

type Mode = 'SOLO' | 'COOP';
type Metric = 'points' | 'progress';

@Injectable()
export class LeaderboardService {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async list(metricValue: unknown, modeValue: unknown, page: number, pageSize: number) {
    const metric = parseMetric(metricValue);
    const mode = parseMode(modeValue);
    const offset = (page - 1) * pageSize;
    const rows = metric === 'points'
      ? await this.database.$queryRaw<Array<{ id: string; nickname: string; value: bigint; rank: bigint }>>(Prisma.sql`
          WITH totals AS (
            SELECT p.account_id AS id, a.nickname AS nickname, SUM(p.points_earned)::bigint AS value
            FROM game_session_participants p
            JOIN game_sessions s ON s.id = p.game_session_id
            JOIN accounts a ON a.id = p.account_id
            WHERE s.mode = ${mode}::"CampaignMode"
            GROUP BY p.account_id, a.nickname
          ), ranked AS (
            SELECT id, nickname, value, RANK() OVER (ORDER BY value DESC)::bigint AS rank
            FROM totals
          )
          SELECT id, nickname, value, rank FROM ranked
          ORDER BY value DESC, id ASC
          LIMIT ${pageSize} OFFSET ${offset}
        `)
      : await this.database.$queryRaw<Array<{ id: string; nickname: string; value: number; rank: bigint }>>(Prisma.sql`
          WITH totals AS (
            SELECT p.account_id AS id, a.nickname AS nickname, MAX(p.max_exit_count)::integer AS value
            FROM game_session_participants p
            JOIN game_sessions s ON s.id = p.game_session_id
            JOIN accounts a ON a.id = p.account_id
            WHERE s.mode = ${mode}::"CampaignMode"
            GROUP BY p.account_id, a.nickname
          ), ranked AS (
            SELECT id, nickname, value, RANK() OVER (ORDER BY value DESC)::bigint AS rank
            FROM totals
          )
          SELECT id, nickname, value, rank FROM ranked
          ORDER BY value DESC, id ASC
          LIMIT ${pageSize} OFFSET ${offset}
        `);
    const count = await this.database.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT p.account_id)::bigint AS total
      FROM game_session_participants p
      JOIN game_sessions s ON s.id = p.game_session_id
      WHERE s.mode = ${mode}::"CampaignMode"
    `);
    return {
      metric,
      mode: mode.toLowerCase(),
      page,
      pageSize,
      total: Number(count[0]?.total ?? 0),
      items: rows.map((row) => ({
        rank: Number(row.rank),
        accountId: row.id,
        nickname: row.nickname,
        ...(metric === 'points' ? { points: Number(row.value) } : { exitsCompleted: Number(row.value) }),
      })),
    };
  }
}

function parseMetric(value: unknown): Metric {
  if (value !== 'points' && value !== 'progress') throw new BadRequestException('Metrica classifica non valida.');
  return value;
}

function parseMode(value: unknown): Mode {
  if (value === 'solo') return 'SOLO';
  if (value === 'coop') return 'COOP';
  throw new BadRequestException('Modalità classifica non valida.');
}
