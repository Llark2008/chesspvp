import type { BattleState, Position, Unit } from '../types/battle';
import { MAPS, UNITS } from '../configs';
import { key, get4Neighbors, isInBounds } from './utils';

function canPassThrough(pos: Position, unit: Unit, state: BattleState): boolean {
  const map = MAPS[state.mapId];
  if (!isInBounds(pos, map)) return false;
  const tile = state.tiles[pos.y]?.[pos.x];
  if (!tile) return false;
  if (tile.type === 'blocked') return false;
  // 不能穿越对方基地
  if (tile.type === 'base_a' && unit.owner !== 'A') return false;
  if (tile.type === 'base_b' && unit.owner !== 'B') return false;
  // 不能穿越敌方单位
  const occupant = state.units.find((u) => u.position.x === pos.x && u.position.y === pos.y);
  if (occupant && occupant.owner !== unit.owner) return false;
  return true;
}

function canStandOn(pos: Position, unit: Unit, state: BattleState): boolean {
  if (!canPassThrough(pos, unit, state)) return false;
  const tile = state.tiles[pos.y]?.[pos.x];
  if (!tile) return false;
  // 不能站在任何基地格
  if (tile.type === 'base_a' || tile.type === 'base_b') return false;
  // 不能和其它单位（包括己方）重叠
  const occupant = state.units.find((u) => u.position.x === pos.x && u.position.y === pos.y);
  if (occupant) return false;
  return true;
}

export function computeMovableTiles(state: BattleState, unitId: string): Position[] {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return [];
  const moveRange = UNITS[unit.type].moveRange;
  const visited = new Map<string, number>();
  const queue: Array<{ pos: Position; dist: number }> = [{ pos: unit.position, dist: 0 }];
  const result: Position[] = [];

  visited.set(key(unit.position), 0);

  while (queue.length > 0) {
    const item = queue.shift()!;
    const { pos, dist } = item;
    if (dist >= moveRange) continue;
    for (const neighbor of get4Neighbors(pos)) {
      const k = key(neighbor);
      if (visited.has(k)) continue;
      if (!canPassThrough(neighbor, unit, state)) continue;
      visited.set(k, dist + 1);
      queue.push({ pos: neighbor, dist: dist + 1 });
      if (canStandOn(neighbor, unit, state)) {
        result.push(neighbor);
      }
    }
  }
  return result;
}
