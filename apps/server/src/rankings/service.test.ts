import { describe, expect, it } from 'vitest';

import {
  calculateExpectedScore,
  calculateRatingDelta,
  getAllowedRatingDelta,
  getLeaderboard,
  getProjectedRank,
  getUserRank,
  settleRankedMatch,
} from './service.js';

interface MemoryRanking {
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  seasonId: number;
  updatedAt: Date;
  user: {
    id: string;
    username: string;
    isGuest: boolean;
  };
}

function createRankingPrisma(rankings: MemoryRanking[]) {
  return {
    ranking: {
      async findUnique({ where }: { where: { userId: string } }) {
        return rankings.find((ranking) => ranking.userId === where.userId) ?? null;
      },
      async update({ where, data }: { where: { userId: string }; data: Partial<MemoryRanking> }) {
        const ranking = rankings.find((entry) => entry.userId === where.userId);
        if (!ranking) throw new Error(`Missing ranking ${where.userId}`);
        Object.assign(ranking, data);
        return ranking;
      },
      async findMany({
        where,
        take,
      }: {
        where: { seasonId: number; user?: { isGuest: boolean } };
        take: number;
      }) {
        return rankings
          .filter((ranking) => {
            if (ranking.seasonId !== where.seasonId) return false;
            if (typeof where.user?.isGuest === 'boolean') {
              return ranking.user.isGuest === where.user.isGuest;
            }
            return true;
          })
          .sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
              return a.updatedAt.getTime() - b.updatedAt.getTime();
            }
            return a.userId.localeCompare(b.userId);
          })
          .slice(0, take);
      },
      async count({
        where,
      }: {
        where: {
          seasonId: number;
          OR: Array<Record<string, unknown>>;
        };
      }) {
        return rankings.filter((ranking) => {
          if (ranking.seasonId !== where.seasonId) return false;
          if (
            'user' in where &&
            where.user &&
            typeof where.user === 'object' &&
            'isGuest' in where.user &&
            typeof where.user.isGuest === 'boolean' &&
            ranking.user.isGuest !== where.user.isGuest
          ) {
            return false;
          }
          return where.OR.some((clause) => {
            if (typeof clause.rating === 'object' && clause.rating && 'gt' in clause.rating) {
              return ranking.rating > (clause.rating as { gt: number }).gt;
            }
            if (clause.rating === ranking.rating && typeof clause.wins === 'object' && clause.wins && 'gt' in clause.wins) {
              return ranking.wins > (clause.wins as { gt: number }).gt;
            }
            if (
              clause.rating === ranking.rating &&
              clause.wins === ranking.wins &&
              typeof clause.updatedAt === 'object' &&
              clause.updatedAt &&
              'lt' in clause.updatedAt
            ) {
              return ranking.updatedAt < (clause.updatedAt as { lt: Date }).lt;
            }
            if (
              clause.rating === ranking.rating &&
              clause.wins === ranking.wins &&
              clause.updatedAt === ranking.updatedAt &&
              typeof clause.userId === 'object' &&
              clause.userId &&
              'lt' in clause.userId
            ) {
              return ranking.userId < (clause.userId as { lt: string }).lt;
            }
            return false;
          });
        }).length;
      },
    },
  };
}

describe('rankings service', () => {
  it('calculates standard Elo expectations and deltas with fixed K', () => {
    expect(calculateExpectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
    expect(calculateRatingDelta(1000, 1000, 1, 32)).toBe(16);
    expect(calculateRatingDelta(1400, 1000, 1, 32)).toBeGreaterThan(0);
    expect(calculateRatingDelta(1400, 1000, 1, 32)).toBeLessThan(16);
  });

  it('settles a ranked match by updating both ratings and win-loss totals', async () => {
    const rankings: MemoryRanking[] = [
      {
        userId: 'user-a',
        rating: 1000,
        wins: 4,
        losses: 2,
        draws: 0,
        seasonId: 1,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: { id: 'user-a', username: 'Alpha', isGuest: false },
      },
      {
        userId: 'user-b',
        rating: 1000,
        wins: 3,
        losses: 3,
        draws: 0,
        seasonId: 1,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        user: { id: 'user-b', username: 'Bravo', isGuest: true },
      },
    ];
    const prisma = createRankingPrisma(rankings);

    const result = await settleRankedMatch(prisma as never, {
      playerAId: 'user-a',
      playerBId: 'user-b',
      winnerId: 'user-a',
      kFactor: 32,
      seasonId: 1,
    });

    expect(result).toMatchObject({
      playerA: { userId: 'user-a', ratingAfter: 1016, winsAfter: 5, lossesAfter: 2 },
      playerB: { userId: 'user-b', ratingAfter: 984, winsAfter: 3, lossesAfter: 4 },
    });
  });

  it('skips rating updates for self-play debug matches', async () => {
    const rankings: MemoryRanking[] = [
      {
        userId: 'same-user',
        rating: 1200,
        wins: 6,
        losses: 5,
        draws: 0,
        seasonId: 1,
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
        user: { id: 'same-user', username: 'Same', isGuest: true },
      },
    ];

    const prisma = createRankingPrisma(rankings);
    const result = await settleRankedMatch(prisma as never, {
      playerAId: 'same-user',
      playerBId: 'same-user',
      winnerId: 'same-user',
      kFactor: 32,
      seasonId: 1,
    });

    expect(result).toBeNull();
    expect(rankings[0]).toMatchObject({ rating: 1200, wins: 6, losses: 5 });
  });

  it('builds a formal-account leaderboard and resolves guest projected rank with stable ordering', async () => {
    const rankings: MemoryRanking[] = [
      {
        userId: 'user-b',
        rating: 1250,
        wins: 8,
        losses: 3,
        draws: 0,
        seasonId: 1,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        user: { id: 'user-b', username: 'Bravo', isGuest: true },
      },
      {
        userId: 'user-a',
        rating: 1250,
        wins: 9,
        losses: 2,
        draws: 0,
        seasonId: 1,
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
        user: { id: 'user-a', username: 'Alpha', isGuest: false },
      },
      {
        userId: 'user-c',
        rating: 1100,
        wins: 4,
        losses: 7,
        draws: 0,
        seasonId: 1,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: { id: 'user-c', username: 'Charlie', isGuest: false },
      },
    ];

    const prisma = createRankingPrisma(rankings);
    const leaderboard = await getLeaderboard(prisma as never, { limit: 50, seasonId: 1 });
    const alphaRank = await getUserRank(prisma as never, { userId: 'user-a', seasonId: 1 });
    const bravoRank = await getUserRank(prisma as never, { userId: 'user-b', seasonId: 1 });
    const bravoProjectedRank = await getProjectedRank(prisma as never, { userId: 'user-b', seasonId: 1 });

    expect(leaderboard.map((entry) => entry.userId)).toEqual(['user-a', 'user-c']);
    expect(leaderboard[0]).toMatchObject({ rank: 1, username: 'Alpha', isGuest: false });
    expect(leaderboard[1]).toMatchObject({ rank: 2, username: 'Charlie', isGuest: false });
    expect(alphaRank).toBe(1);
    expect(bravoRank).toBeNull();
    expect(bravoProjectedRank).toBe(2);
  });

  it('expands allowed matchmaking rating deltas over time', () => {
    expect(getAllowedRatingDelta(0)).toBe(200);
    expect(getAllowedRatingDelta(9_999)).toBe(200);
    expect(getAllowedRatingDelta(10_000)).toBe(300);
    expect(getAllowedRatingDelta(30_000)).toBe(500);
    expect(getAllowedRatingDelta(60_000)).toBe(Number.POSITIVE_INFINITY);
  });
});
