import type { BattleState, Position } from '../types/battle';
import type { AbilityConfig } from '../types/configs';
import { MAPS, UNITS } from '../configs';
import { isInBounds, manhattan } from './utils';

export function getAbilityConfig(unitType: keyof typeof UNITS, abilityId: string): AbilityConfig | null {
  const unitCfg = UNITS[unitType];
  if (!unitCfg?.abilities) return null;
  return unitCfg.abilities.find((ability) => ability.id === abilityId) ?? null;
}

export function computeAbilityTargets(
  state: BattleState,
  unitId: string,
  abilityId: string,
  fromPos?: Position
): Position[] {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return [];

  const ability = getAbilityConfig(unit.type, abilityId);
  if (!ability) return [];

  const origin = fromPos ?? unit.position;

  switch (ability.kind) {
    case 'heal':
      return state.units
        .filter((candidate) => {
          if (candidate.owner !== unit.owner) return false;
          if (!ability.canTargetSelf && candidate.id === unit.id) return false;
          const maxHp = UNITS[candidate.type].hp;
          if (candidate.hp <= 0 || candidate.hp >= maxHp) return false;
          const dist = manhattan(origin, candidate.position);
          return dist >= ability.minRange && dist <= ability.maxRange;
        })
        .map((candidate) => candidate.position);
    case 'poison_burst': {
      const map = MAPS[state.mapId];
      const targets: Position[] = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const pos = { x, y };
          if (!isInBounds(pos, map)) continue;
          const dist = manhattan(origin, pos);
          if (dist >= ability.minRange && dist <= ability.maxRange) {
            targets.push(pos);
          }
        }
      }
      return targets;
    }
    default:
      return [];
  }
}
