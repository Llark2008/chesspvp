import type { PrismaClient } from '@prisma/client';
import type { RankingEntryDto } from '@chesspvp/shared';

type RankingWithUser = {
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
};

export function calculateExpectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

export function calculateRatingDelta(
  playerRating: number,
  opponentRating: number,
  actualScore: 0 | 1,
  kFactor = 32,
): number {
  return Math.round(kFactor * (actualScore - calculateExpectedScore(playerRating, opponentRating)));
}

export function getAllowedRatingDelta(waitMs: number): number {
  if (waitMs >= 60_000) return Number.POSITIVE_INFINITY;
  return 200 + Math.floor(waitMs / 10_000) * 100;
}

function compareRankings(a: RankingWithUser, b: RankingWithUser): number {
  if (b.rating !== a.rating) return b.rating - a.rating;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
    return a.updatedAt.getTime() - b.updatedAt.getTime();
  }
  return a.userId.localeCompare(b.userId);
}

function isFormalRanking(entry: RankingWithUser): boolean {
  return !entry.user.isGuest;
}

async function getSeasonRankings(
  prisma: PrismaClient,
  seasonId: number,
): Promise<RankingWithUser[]> {
  const rankings = await prisma.ranking.findMany({
    where: { seasonId },
    include: { user: true },
    orderBy: [
      { rating: 'desc' },
      { wins: 'desc' },
      { updatedAt: 'asc' },
      { userId: 'asc' },
    ],
  });

  return rankings as RankingWithUser[];
}

export async function getRankPresentation(
  prisma: PrismaClient,
  opts: { userId: string; seasonId?: number },
): Promise<{ rank: number | null; projectedRank: number | null }> {
  const seasonId = opts.seasonId ?? 1;
  const rankings = await getSeasonRankings(prisma, seasonId);
  const target = rankings.find((entry) => entry.userId === opts.userId);
  if (!target) {
    return { rank: null, projectedRank: null };
  }

  const formalRankings = rankings.filter(isFormalRanking);
  if (!target.user.isGuest) {
    const publicRank = formalRankings.findIndex((entry) => entry.userId === target.userId);
    return {
      rank: publicRank === -1 ? null : publicRank + 1,
      projectedRank: null,
    };
  }

  const projectedRank = formalRankings.filter((entry) => compareRankings(entry, target) < 0).length + 1;
  return { rank: null, projectedRank };
}

export async function settleRankedMatch(
  prisma: PrismaClient,
  opts: {
    playerAId: string;
    playerBId: string;
    winnerId: string;
    kFactor?: number;
    seasonId?: number;
  },
): Promise<{
  playerA: { userId: string; ratingAfter: number; winsAfter: number; lossesAfter: number };
  playerB: { userId: string; ratingAfter: number; winsAfter: number; lossesAfter: number };
} | null> {
  if (opts.playerAId === opts.playerBId) return null;

  const seasonId = opts.seasonId ?? 1;
  const kFactor = opts.kFactor ?? 32;
  const [playerA, playerB] = await Promise.all([
    prisma.ranking.findUnique({ where: { userId: opts.playerAId } }),
    prisma.ranking.findUnique({ where: { userId: opts.playerBId } }),
  ]);
  if (!playerA || !playerB) return null;

  const playerAWon = opts.winnerId === opts.playerAId;
  const deltaA = calculateRatingDelta(playerA.rating, playerB.rating, playerAWon ? 1 : 0, kFactor);
  const deltaB = -deltaA;
  const now = new Date();

  const [updatedA, updatedB] = await Promise.all([
    prisma.ranking.update({
      where: { userId: opts.playerAId },
      data: {
        seasonId,
        rating: playerA.rating + deltaA,
        wins: playerA.wins + (playerAWon ? 1 : 0),
        losses: playerA.losses + (playerAWon ? 0 : 1),
        updatedAt: now,
      },
    }),
    prisma.ranking.update({
      where: { userId: opts.playerBId },
      data: {
        seasonId,
        rating: playerB.rating + deltaB,
        wins: playerB.wins + (playerAWon ? 0 : 1),
        losses: playerB.losses + (playerAWon ? 1 : 0),
        updatedAt: now,
      },
    }),
  ]);

  return {
    playerA: {
      userId: updatedA.userId,
      ratingAfter: updatedA.rating,
      winsAfter: updatedA.wins,
      lossesAfter: updatedA.losses,
    },
    playerB: {
      userId: updatedB.userId,
      ratingAfter: updatedB.rating,
      winsAfter: updatedB.wins,
      lossesAfter: updatedB.losses,
    },
  };
}

export async function getLeaderboard(
  prisma: PrismaClient,
  opts: { limit?: number; seasonId?: number } = {},
): Promise<RankingEntryDto[]> {
  const seasonId = opts.seasonId ?? 1;
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const rankings = (await getSeasonRankings(prisma, seasonId))
    .filter(isFormalRanking)
    .slice(0, limit);

  return rankings.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    username: entry.user.username,
    isGuest: entry.user.isGuest,
    rating: entry.rating,
    wins: entry.wins,
    losses: entry.losses,
  }));
}

export async function getUserRank(
  prisma: PrismaClient,
  opts: { userId: string; seasonId?: number },
): Promise<number | null> {
  return (await getRankPresentation(prisma, opts)).rank;
}

export async function getProjectedRank(
  prisma: PrismaClient,
  opts: { userId: string; seasonId?: number },
): Promise<number | null> {
  return (await getRankPresentation(prisma, opts)).projectedRank;
}
