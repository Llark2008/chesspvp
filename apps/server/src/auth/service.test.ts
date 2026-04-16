import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

type AuthServiceModule = typeof import('./service.js');
type PasswordModule = typeof import('./password.js');

let registerUser: AuthServiceModule['registerUser'];
let loginUser: AuthServiceModule['loginUser'];
let upgradeGuestUser: AuthServiceModule['upgradeGuestUser'];
let logoutSession: AuthServiceModule['logoutSession'];
let AuthServiceError: AuthServiceModule['AuthServiceError'];
let verifyPassword: PasswordModule['verifyPassword'];

interface MemoryUser {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string | null;
  isGuest: boolean;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

interface MemoryRanking {
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  seasonId: number;
  updatedAt: Date;
}

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-123456';

  ({ registerUser, loginUser, upgradeGuestUser, logoutSession, AuthServiceError } = await import('./service.js'));
  ({ verifyPassword } = await import('./password.js'));
});

function createMemoryDeps() {
  const users: MemoryUser[] = [];
  const rankings: MemoryRanking[] = [];
  const sessions = new Map<string, string>();
  let userSeq = 1;

  function getRankingForUser(userId: string) {
    return rankings.find((ranking) => ranking.userId === userId) ?? null;
  }

  const prisma = {
    user: {
      async findUnique({
        where,
        include,
      }: {
        where: Partial<Pick<MemoryUser, 'id' | 'email' | 'username'>>;
        include?: { ranking?: boolean };
      }) {
        let user: MemoryUser | null = null;
        if (where.id) user = users.find((candidate) => candidate.id === where.id) ?? null;
        if (typeof where.email !== 'undefined') {
          user = users.find((candidate) => candidate.email === where.email) ?? null;
        }
        if (where.username) user = users.find((candidate) => candidate.username === where.username) ?? null;
        if (!user) return null;
        return include?.ranking ? { ...user, ranking: getRankingForUser(user.id) } : user;
      },
      async create({
        data,
        include,
      }: {
        data: Record<string, unknown>;
        include?: { ranking?: boolean };
      }) {
        const user: MemoryUser = {
          id: `user-${userSeq++}`,
          username: data.username as string,
          email: (data.email as string | null | undefined) ?? null,
          passwordHash: (data.passwordHash as string | null | undefined) ?? null,
          isGuest: (data.isGuest as boolean | undefined) ?? false,
          role: (data.role as string | undefined) ?? 'player',
          avatarUrl: null,
          createdAt: new Date(),
          lastLoginAt: (data.lastLoginAt as Date | null | undefined) ?? null,
        };
        users.push(user);
        if (data.ranking && typeof data.ranking === 'object') {
          rankings.push({
            userId: user.id,
            rating: 1000,
            wins: 0,
            losses: 0,
            draws: 0,
            seasonId: 1,
            updatedAt: new Date(),
          });
        }
        return include?.ranking ? { ...user, ranking: getRankingForUser(user.id) } : user;
      },
      async update({
        where,
        data,
        include,
      }: {
        where: Pick<MemoryUser, 'id'>;
        data: Record<string, unknown>;
        include?: { ranking?: boolean };
      }) {
        const user = users.find((candidate) => candidate.id === where.id);
        if (!user) throw new Error(`Missing user ${where.id}`);
        Object.assign(user, data);
        return include?.ranking ? { ...user, ranking: getRankingForUser(user.id) } : user;
      },
    },
    ranking: {
      async findUnique({ where }: { where: Pick<MemoryRanking, 'userId'> }) {
        return rankings.find((ranking) => ranking.userId === where.userId) ?? null;
      },
      async findMany({
        where,
      }: {
        where: { seasonId: number };
      }) {
        return rankings
          .filter((ranking) => ranking.seasonId === where.seasonId)
          .map((ranking) => ({
            ...ranking,
            user: users.find((user) => user.id === ranking.userId)!,
          }))
          .sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
              return a.updatedAt.getTime() - b.updatedAt.getTime();
            }
            return a.userId.localeCompare(b.userId);
          });
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
          return where.OR.some((clause) => {
            if (clause.rating && typeof clause.rating === 'object' && 'gt' in clause.rating) {
              return ranking.rating > (clause.rating.gt as number);
            }
            if ('rating' in clause && 'wins' in clause) {
              const clauseRating = clause.rating as number;
              const clauseWins = clause.wins as { gt?: number } | number;
              if (typeof clauseWins === 'object' && typeof clauseWins.gt === 'number') {
                return ranking.rating === clauseRating && ranking.wins > clauseWins.gt;
              }
              if (
                typeof clauseWins === 'number' &&
                'updatedAt' in clause &&
                clause.updatedAt &&
                typeof clause.updatedAt === 'object' &&
                'lt' in clause.updatedAt
              ) {
                return (
                  ranking.rating === clauseRating &&
                  ranking.wins === clauseWins &&
                  ranking.updatedAt < (clause.updatedAt.lt as Date)
                );
              }
              if (
                typeof clauseWins === 'number' &&
                'updatedAt' in clause &&
                clause.updatedAt instanceof Date &&
                'userId' in clause &&
                clause.userId &&
                typeof clause.userId === 'object' &&
                'lt' in clause.userId
              ) {
                return (
                  ranking.rating === clauseRating &&
                  ranking.wins === clauseWins &&
                  ranking.updatedAt.getTime() === clause.updatedAt.getTime() &&
                  ranking.userId < (clause.userId.lt as string)
                );
              }
            }
            return false;
          });
        }).length;
      },
    },
  };

  const redis = {
    async set(key: string, value: string) {
      sessions.set(key, value);
      return 'OK';
    },
    async get(key: string) {
      return sessions.get(key) ?? null;
    },
    async del(...keys: string[]) {
      let deleted = 0;
      for (const key of keys) {
        if (sessions.delete(key)) deleted += 1;
      }
      return deleted;
    },
    async exists(key: string) {
      return sessions.has(key) ? 1 : 0;
    },
  };

  return {
    prisma,
    redis,
    state: {
      users,
      rankings,
      sessions,
    },
  };
}

describe('auth service', () => {
  beforeEach(() => {
    // Reset crypto randomness side effects by recreating in-memory deps per test.
  });

  it('registers a new formal account with normalized email and hashed password', async () => {
    const deps = createMemoryDeps();

    const result = await registerUser(deps.prisma as never, deps.redis as never, {
      username: 'RankedHero',
      email: '  HERO@Example.com ',
      password: 'super-secret-password',
    });

    expect(result.user).toMatchObject({
      username: 'RankedHero',
      email: 'hero@example.com',
      isGuest: false,
      role: 'player',
      rank: 1,
      projectedRank: null,
    });
    expect(result.token).toEqual(expect.any(String));
    expect(deps.state.rankings).toContainEqual(
      expect.objectContaining({ userId: result.user.id, rating: 1000 }),
    );
    const storedUser = deps.state.users[0];
    expect(storedUser?.passwordHash).not.toBe('super-secret-password');
    await expect(verifyPassword(storedUser!.passwordHash!, 'super-secret-password')).resolves.toBe(true);
  });

  it('rejects duplicate email registration', async () => {
    const deps = createMemoryDeps();
    await registerUser(deps.prisma as never, deps.redis as never, {
      username: 'FirstHero',
      email: 'same@example.com',
      password: 'password-one',
    });

    await expect(
      registerUser(deps.prisma as never, deps.redis as never, {
        username: 'SecondHero',
        email: 'SAME@example.com',
        password: 'password-two',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('rejects duplicate username registration', async () => {
    const deps = createMemoryDeps();
    await registerUser(deps.prisma as never, deps.redis as never, {
      username: 'SameHero',
      email: 'first@example.com',
      password: 'password-one',
    });

    await expect(
      registerUser(deps.prisma as never, deps.redis as never, {
        username: 'SameHero',
        email: 'second@example.com',
        password: 'password-two',
      }),
    ).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  });

  it('logs in by normalized email and rejects wrong passwords', async () => {
    const deps = createMemoryDeps();
    await registerUser(deps.prisma as never, deps.redis as never, {
      username: 'LoginHero',
      email: 'login@example.com',
      password: 'correct-horse-battery-staple',
    });

    const success = await loginUser(deps.prisma as never, deps.redis as never, {
      email: ' LOGIN@example.com ',
      password: 'correct-horse-battery-staple',
    });
    expect(success.user.username).toBe('LoginHero');
    expect(success.user.rank).toBe(1);
    expect(success.user.projectedRank).toBeNull();

    await expect(
      loginUser(deps.prisma as never, deps.redis as never, {
        email: 'login@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('upgrades a guest account without changing the user id or ranking row', async () => {
    const deps = createMemoryDeps();
    const guest = await deps.prisma.user.create({
      data: {
        username: 'GuestHero',
        isGuest: true,
        role: 'player',
        ranking: { create: {} },
        lastLoginAt: new Date(),
      },
    });
    deps.state.rankings[0]!.rating = 1142;
    await deps.redis.set('session:old-token', guest.id);

    const result = await upgradeGuestUser(
      deps.prisma as never,
      deps.redis as never,
      {
        userId: guest.id,
        currentJti: 'old-token',
      },
      {
        username: 'GuestHeroPro',
        email: 'guest.pro@example.com',
        password: 'new-password',
      },
    );

    expect(result.user).toMatchObject({
      id: guest.id,
      username: 'GuestHeroPro',
      email: 'guest.pro@example.com',
      isGuest: false,
      rank: 1,
      projectedRank: null,
    });
    expect(deps.state.rankings[0]).toMatchObject({
      userId: guest.id,
      rating: 1142,
    });
    await expect(deps.redis.exists('session:old-token')).resolves.toBe(0);
  });

  it('rejects guest upgrade for non-guest users', async () => {
    const deps = createMemoryDeps();
    const user = await deps.prisma.user.create({
      data: {
        username: 'FormalHero',
        email: 'formal@example.com',
        passwordHash: 'hashed',
        isGuest: false,
        role: 'player',
        ranking: { create: {} },
        lastLoginAt: new Date(),
      },
    });

    await expect(
      upgradeGuestUser(
        deps.prisma as never,
        deps.redis as never,
        {
          userId: user.id,
          currentJti: 'missing-token',
        },
        {
          username: 'FormalHero',
          email: 'new@example.com',
          password: 'password',
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_GUEST_ACCOUNT' });
  });

  it('removes the current session on logout', async () => {
    const deps = createMemoryDeps();
    await deps.redis.set('session:logout-me', 'user-1');

    await logoutSession(deps.redis as never, 'logout-me');

    await expect(deps.redis.exists('session:logout-me')).resolves.toBe(0);
  });

  it('exports a typed auth service error class', () => {
    const error = new AuthServiceError(409, 'EMAIL_TAKEN', 'duplicate');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' });
  });
});
