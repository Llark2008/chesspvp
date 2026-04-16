import { beforeAll, describe, expect, it } from 'vitest';
import { createInitialState } from '@chesspvp/shared';

let getSnapshotStateForUser: typeof import('./gameNamespace.js')['getSnapshotStateForUser'];

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-123456';

  ({ getSnapshotStateForUser } = await import('./gameNamespace.js'));
});

describe('game namespace snapshots', () => {
  it('filters reconnect snapshots by player perspective', () => {
    const state = createInitialState('snapshot-filter', 'mvp_default', 'userA', 'userB', 0);
    const filtered = getSnapshotStateForUser(state, 'userA');

    expect(filtered.players.B.gold).toBe(0);
    expect(filtered.fog?.perspective).toBe('A');
    expect(filtered.units.some((unit) => unit.owner === 'B')).toBe(false);
  });
});
