import { BATTLE_VIEWPORT_WIDTH_PX } from './constants';

export function computeBattleDisplaySize(
  availableWidth: number,
  availableHeight: number,
  maxViewportSize = BATTLE_VIEWPORT_WIDTH_PX,
): number {
  const constrained = Math.min(availableWidth, availableHeight, maxViewportSize);
  return Math.max(0, Math.floor(constrained));
}

