import { beforeAll, describe, expect, it } from 'vitest';

type GuestModule = typeof import('./guest.js');

let mapMeDto: GuestModule['mapMeDto'];

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-123456';

  ({ mapMeDto } = await import('./guest.js'));
});

describe('guest auth mapping', () => {
  it('returns projected rank for guest accounts instead of public leaderboard rank', async () => {
    const prisma = {
      ranking: {
        async findMany() {
          return [
            {
              userId: 'formal-1',
              rating: 1320,
              wins: 20,
              losses: 8,
              draws: 0,
              seasonId: 1,
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              user: { id: 'formal-1', username: 'FormalOne', isGuest: false },
            },
            {
              userId: 'formal-2',
              rating: 1250,
              wins: 16,
              losses: 9,
              draws: 0,
              seasonId: 1,
              updatedAt: new Date('2026-01-02T00:00:00.000Z'),
              user: { id: 'formal-2', username: 'FormalTwo', isGuest: false },
            },
            {
              userId: 'formal-3',
              rating: 1200,
              wins: 12,
              losses: 11,
              draws: 0,
              seasonId: 1,
              updatedAt: new Date('2026-01-03T00:00:00.000Z'),
              user: { id: 'formal-3', username: 'FormalThree', isGuest: false },
            },
            {
              userId: 'guest-1',
              rating: 1180,
              wins: 7,
              losses: 5,
              draws: 0,
              seasonId: 1,
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              user: { id: 'guest-1', username: 'GuestHero', isGuest: true },
            },
          ];
        },
      },
    };

    const result = await mapMeDto(prisma as never, {
      id: 'guest-1',
      username: 'GuestHero',
      email: null,
      isGuest: true,
      role: 'player',
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ranking: {
        rating: 1180,
        wins: 7,
        losses: 5,
      },
    });

    expect(result).toMatchObject({
      isGuest: true,
      rank: null,
      projectedRank: 4,
      rating: 1180,
    });
  });
});
