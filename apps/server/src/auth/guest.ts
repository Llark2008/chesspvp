import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { MeDto } from '@chesspvp/shared';
import { signJwt } from './jwt.js';
import { randomDigits } from '../utils/id.js';
import { getRankPresentation } from '../rankings/service.js';
import { normalizeUsername } from './password.js';

export async function createGuestUser(
  prisma: PrismaClient,
  redis: Redis,
  username?: string,
) {
  const normalizedUsername = normalizeUsername(username ?? `Player${randomDigits(6)}`);
  const user = await prisma.user.create({
    data: {
      username: normalizedUsername,
      isGuest: true,
      role: 'player',
      ranking: { create: {} },
      lastLoginAt: new Date(),
    },
  });
  const { token, jti } = await signJwt({
    sub: user.id,
    username: user.username,
    isGuest: true,
    role: 'player',
  });
  await redis.set(`session:${jti}`, user.id, 'EX', 7 * 24 * 3600);
  return { token, user };
}

export function mapUserDto(user: {
  id: string;
  username: string;
  isGuest: boolean;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    isGuest: user.isGuest,
    role: user.role,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function mapMeDto(
  prisma: PrismaClient,
  user: {
    id: string;
    username: string;
    email: string | null;
    isGuest: boolean;
    role: string;
    avatarUrl: string | null;
    createdAt: Date;
    ranking?: {
      rating: number;
      wins: number;
      losses: number;
    } | null;
  },
): Promise<MeDto> {
  const { rank, projectedRank } = await getRankPresentation(prisma, { userId: user.id });

  return {
    ...mapUserDto(user),
    email: user.email,
    rating: user.ranking?.rating ?? 1000,
    wins: user.ranking?.wins ?? 0,
    losses: user.ranking?.losses ?? 0,
    rank,
    projectedRank,
  };
}
