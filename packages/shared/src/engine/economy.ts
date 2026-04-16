import { BALANCE, UNITS } from '../configs';
import type { BattleState, PlayerSide } from '../types/battle';
import { computePlayerOutpostIncome } from './outposts';

export function computePlayerIncome(state: BattleState, side: PlayerSide): number {
  let income = 0;
  const base = state.bases.find((candidate) => candidate.owner === side);
  if (base && base.hp > 0) {
    income += BALANCE.economy.baseIncomePerTurn;
  }

  for (const row of state.tiles) {
    for (const tile of row) {
      if (tile.type === 'resource' && tile.resourceOwner === side) {
        income += BALANCE.economy.resourcePointIncome;
      }
    }
  }

  income += computePlayerOutpostIncome(state, side);

  return income;
}

export function computePlayerUpkeep(state: BattleState, side: PlayerSide): number {
  return state.units
    .filter((unit) => unit.owner === side)
    .reduce((total, unit) => total + UNITS[unit.type].upkeep, 0);
}
