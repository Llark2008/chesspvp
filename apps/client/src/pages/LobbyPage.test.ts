import { describe, expect, it } from 'vitest';
import { getRankCardSummary } from './LobbyPage';

describe('LobbyPage rank card summary', () => {
  it('shows projected rank messaging for guest users', () => {
    expect(
      getRankCardSummary({
        isGuest: true,
        rank: null,
        projectedRank: 12,
      }),
    ).toEqual({
      title: '游客不上榜',
      value: '预计升级后 #12',
    });
  });

  it('shows public rank for formal users', () => {
    expect(
      getRankCardSummary({
        isGuest: false,
        rank: 5,
        projectedRank: null,
      }),
    ).toEqual({
      title: '当前排名',
      value: '#5',
    });
  });
});
