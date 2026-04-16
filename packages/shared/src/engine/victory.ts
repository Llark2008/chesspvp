import type { BattleState, PlayerSide } from '../types/battle';

export type VictoryReason = 'base_destroyed' | 'surrender' | 'timeout';

export function checkVictory(
  state: BattleState
): { winner: PlayerSide; reason: VictoryReason } | null {
  // 已经有胜者（由 applyAction 设置，例如投降）
  if (state.winner !== null && state.endReason !== null) {
    return { winner: state.winner, reason: state.endReason as VictoryReason };
  }

  // 基地被摧毁
  for (const base of state.bases) {
    if (base.hp <= 0) {
      const winner: PlayerSide = base.owner === 'A' ? 'B' : 'A';
      return { winner, reason: 'base_destroyed' };
    }
  }

  return null;
}
