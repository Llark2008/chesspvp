import { describe, expect, it } from 'vitest';
import {
  getHudSides,
  getOpponentSide,
  getRelationLabel,
  isOwnSide,
} from './perspective';

describe('battle perspective helpers', () => {
  it('treats A as own side when mySide is A', () => {
    expect(getOpponentSide('A')).toBe('B');
    expect(isOwnSide('A', 'A')).toBe(true);
    expect(isOwnSide('B', 'A')).toBe(false);
    expect(getRelationLabel('A', 'A')).toBe('我方');
    expect(getRelationLabel('B', 'A')).toBe('对方');
    expect(getHudSides('A')).toEqual(['A', 'B']);
  });

  it('treats B as own side when mySide is B', () => {
    expect(getOpponentSide('B')).toBe('A');
    expect(isOwnSide('B', 'B')).toBe(true);
    expect(isOwnSide('A', 'B')).toBe(false);
    expect(getRelationLabel('B', 'B')).toBe('我方');
    expect(getRelationLabel('A', 'B')).toBe('对方');
    expect(getHudSides('B')).toEqual(['B', 'A']);
  });
});
