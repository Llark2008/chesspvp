import { describe, expect, it } from 'vitest';

describe('resource ownership visuals', () => {
  it('returns distinct visual states for neutral, A-owned, and B-owned resource points', async () => {
    const mod = await import('./resourceOwnership').catch(() => null);

    expect(mod?.getResourceOwnershipVisual(null).accentColor).toBe(0xf0c030);
    expect(mod?.getResourceOwnershipVisual('A').accentColor).toBe(0x60a5fa);
    expect(mod?.getResourceOwnershipVisual('B').accentColor).toBe(0xf87171);
    expect(mod?.getResourceCapturePulseColor('A')).not.toBe(mod?.getResourceCapturePulseColor('B'));
  });
});
