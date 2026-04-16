import { beforeAll, describe, expect, it } from 'vitest';

let findCompatiblePair: typeof import('./Matchmaker.js')['findCompatiblePair'];

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-123456';

  ({ findCompatiblePair } = await import('./Matchmaker.js'));
});

describe('findCompatiblePair', () => {
  it('matches close ratings immediately', () => {
    const pair = findCompatiblePair(
      [
        { userId: 'user-a', joinedAt: 0, rating: 1000 },
        { userId: 'user-b', joinedAt: 5_000, rating: 1175 },
      ],
      5_000,
    );

    expect(pair).toEqual(['user-a', 'user-b']);
  });

  it('does not match large rating gaps before the allowed window expands', () => {
    const pair = findCompatiblePair(
      [
        { userId: 'user-a', joinedAt: 0, rating: 1000 },
        { userId: 'user-b', joinedAt: 0, rating: 1450 },
      ],
      9_000,
    );

    expect(pair).toBeNull();
  });

  it('matches large rating gaps after a long enough wait', () => {
    const pair = findCompatiblePair(
      [
        { userId: 'user-a', joinedAt: 0, rating: 1000 },
        { userId: 'user-b', joinedAt: 0, rating: 1450 },
      ],
      60_000,
    );

    expect(pair).toEqual(['user-a', 'user-b']);
  });

  it('prefers the earliest compatible pair when several users are queued', () => {
    const pair = findCompatiblePair(
      [
        { userId: 'user-a', joinedAt: 0, rating: 1000 },
        { userId: 'user-b', joinedAt: 1_000, rating: 1010 },
        { userId: 'user-c', joinedAt: 2_000, rating: 1005 },
      ],
      2_000,
    );

    expect(pair).toEqual(['user-a', 'user-b']);
  });
});
