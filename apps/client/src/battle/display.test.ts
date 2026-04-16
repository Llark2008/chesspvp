import { describe, expect, it } from 'vitest';

describe('battle display sizing', () => {
  it('fits the board into the smaller container edge without upscaling past the logical viewport', async () => {
    const mod = await import('./display').catch(() => null);

    expect(mod?.computeBattleDisplaySize(1400, 620)).toBe(620);
    expect(mod?.computeBattleDisplaySize(1200, 900)).toBe(768);
  });
});
