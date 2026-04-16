import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type {
  LoginRequest,
  LogoutResponse,
  MeDto,
  RegisterRequest,
  UpgradeGuestRequest,
} from '@chesspvp/shared';
import { signJwt } from './jwt.js';
import { hashPassword, normalizeEmail, normalizeUsername, verifyPassword } from './password.js';
import { getRankPresentation } from '../rankings/service.js';

export class AuthServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

type UserRecord = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string | null;
  isGuest: boolean;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
};

type RankingRecord = {
  userId: string;
  rating: number;
  wins: number;
  losses: number;
};

type UserWithRanking = UserRecord & {
  ranking?: RankingRecord | null;
};

async function createSession(
  redis: Redis,
  user: UserRecord,
): Promise<string> {
  const { token, jti } = await signJwt({
    sub: user.id,
    username: user.username,
    isGuest: user.isGuest,
    role: user.role,
  });
  await redis.set(`session:${jti}`, user.id, 'EX', 7 * 24 * 3600);
  return token;
}

async function toMeDto(prisma: PrismaClient, user: UserWithRanking): Promise<MeDto> {
  const { rank, projectedRank } = await getRankPresentation(prisma, { userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    isGuest: user.isGuest,
    role: user.role,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    rating: user.ranking?.rating ?? 1000,
    wins: user.ranking?.wins ?? 0,
    losses: user.ranking?.losses ?? 0,
    rank,
    projectedRank,
  };
}

async function ensureUsernameAvailable(
  prisma: PrismaClient,
  username: string,
  currentUserId?: string,
): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== currentUserId) {
    throw new AuthServiceError(409, 'USERNAME_TAKEN', '昵称已被使用');
  }
}

async function ensureEmailAvailable(
  prisma: PrismaClient,
  email: string,
  currentUserId?: string,
): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== currentUserId) {
    throw new AuthServiceError(409, 'EMAIL_TAKEN', '邮箱已被使用');
  }
}

async function loadUserWithRanking(prisma: PrismaClient, userId: string): Promise<UserWithRanking> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { ranking: true },
  });
  if (!user) {
    throw new AuthServiceError(404, 'USER_NOT_FOUND', '用户不存在');
  }
  return user as unknown as UserWithRanking;
}

export async function registerUser(
  prisma: PrismaClient,
  redis: Redis,
  payload: RegisterRequest,
): Promise<{ token: string; user: MeDto }> {
  const username = normalizeUsername(payload.username);
  const email = normalizeEmail(payload.email);

  await ensureUsernameAvailable(prisma, username);
  await ensureEmailAvailable(prisma, email);

  const passwordHash = await hashPassword(payload.password);
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      isGuest: false,
      role: 'player',
      ranking: { create: {} },
      lastLoginAt: new Date(),
    },
    include: { ranking: true },
  });
  const token = await createSession(redis, user as unknown as UserRecord);
  return { token, user: await toMeDto(prisma, user as unknown as UserWithRanking) };
}

export async function loginUser(
  prisma: PrismaClient,
  redis: Redis,
  payload: LoginRequest,
): Promise<{ token: string; user: MeDto }> {
  const email = normalizeEmail(payload.email);
  const user = await prisma.user.findUnique({
    where: { email },
    include: { ranking: true },
  });
  if (!user?.passwordHash) {
    throw new AuthServiceError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误');
  }
  const valid = await verifyPassword(user.passwordHash, payload.password);
  if (!valid) {
    throw new AuthServiceError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    include: { ranking: true },
  });
  const token = await createSession(redis, updated as unknown as UserRecord);
  return { token, user: await toMeDto(prisma, updated as unknown as UserWithRanking) };
}

export async function upgradeGuestUser(
  prisma: PrismaClient,
  redis: Redis,
  auth: { userId: string; currentJti?: string },
  payload: UpgradeGuestRequest,
): Promise<{ token: string; user: MeDto }> {
  const existing = await loadUserWithRanking(prisma, auth.userId);
  if (!existing.isGuest) {
    throw new AuthServiceError(409, 'NOT_GUEST_ACCOUNT', '当前账号不是游客账号');
  }

  const username = normalizeUsername(payload.username);
  const email = normalizeEmail(payload.email);
  await ensureUsernameAvailable(prisma, username, existing.id);
  await ensureEmailAvailable(prisma, email, existing.id);

  const passwordHash = await hashPassword(payload.password);
  const upgraded = await prisma.user.update({
    where: { id: existing.id },
    data: {
      username,
      email,
      passwordHash,
      isGuest: false,
      lastLoginAt: new Date(),
    },
    include: { ranking: true },
  });

  if (auth.currentJti) {
    await redis.del(`session:${auth.currentJti}`);
  }

  const token = await createSession(redis, upgraded as unknown as UserRecord);
  return { token, user: await toMeDto(prisma, upgraded as unknown as UserWithRanking) };
}

export async function logoutSession(redis: Redis, jti: string): Promise<LogoutResponse> {
  await redis.del(`session:${jti}`);
  return { status: 'logged_out' };
}
