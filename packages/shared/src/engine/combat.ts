import type { BattleState, Position, UnitType } from '../types/battle';
import type { BalanceConfig } from '../types/configs';
import { BALANCE, MAPS, UNITS } from '../configs';
import { isInBounds, manhattan } from './utils';

export function getCounterMultiplier(
  attackerType: UnitType,
  defenderType: UnitType | 'base',
  balance: BalanceConfig
): number {
  if (defenderType === 'base') return 1.0;
  const rel = balance.counter[attackerType]?.[defenderType];
  if (rel === 'bonus') return balance.combat.counterBonus;
  if (rel === 'penalty') return balance.combat.counterPenalty;
  return 1.0;
}

export function computeDamage(
  attackerType: UnitType,
  defenderType: UnitType | 'base',
  attackerAtk: number,
  defenderDef: number,
  balance: BalanceConfig
): { damage: number; counterMul: number } {
  const counterMul = getCounterMultiplier(attackerType, defenderType, balance);
  const base = Math.max(balance.combat.minDamage, attackerAtk - defenderDef);
  const damage = Math.max(balance.combat.minDamage, Math.floor(base * counterMul));
  return { damage, counterMul };
}

export function computeAttackableTargets(
  state: BattleState,
  unitId: string,
  fromPos?: Position
): Position[] {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return [];
  const unitCfg = UNITS[unit.type];
  const origin = fromPos ?? unit.position;
  const targets: Position[] = [];
  const seen = new Set<string>();

  if (unitCfg.attackKind === 'aoe' && unitCfg.canTargetEmptyTile) {
    const map = MAPS[state.mapId];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const pos = { x, y };
        if (!isInBounds(pos, map)) continue;
        const dist = manhattan(origin, pos);
        if (dist >= unitCfg.minRange && dist <= unitCfg.maxRange) {
          targets.push(pos);
        }
      }
    }
    return targets;
  }

  for (const enemy of state.units) {
    if (enemy.owner === unit.owner) continue;
    const dist = manhattan(origin, enemy.position);
    if (dist >= unitCfg.minRange && dist <= unitCfg.maxRange) {
      const targetKey = `${enemy.position.x},${enemy.position.y}`;
      if (seen.has(targetKey)) continue;
      seen.add(targetKey);
      targets.push(enemy.position);
    }
  }

  for (const base of state.bases) {
    if (base.owner === unit.owner) continue;
    const dist = manhattan(origin, base.position);
    if (dist >= unitCfg.minRange && dist <= unitCfg.maxRange) {
      const targetKey = `${base.position.x},${base.position.y}`;
      if (seen.has(targetKey)) continue;
      seen.add(targetKey);
      targets.push(base.position);
    }
  }

  return targets;
}

export { BALANCE };
