import type { BattleState, PlayerSide, Position, RecruitSource, Unit } from '../types/battle';
import type { GameEvent } from '../types/event';
import { BALANCE, UNITS } from '../configs';
import { clonePosition, get4Neighbors, isInBounds, manhattan } from './utils';

export function isRecruitSourceEqual(a: RecruitSource, b: RecruitSource): boolean {
  return a.kind === b.kind && a.position.x === b.position.x && a.position.y === b.position.y;
}

export function isOutpostTileAt(state: BattleState, position: Position): boolean {
  return state.tiles[position.y]?.[position.x]?.type === 'outpost';
}

export function captureOutpostAt(
  draft: BattleState,
  position: Position,
  owner: PlayerSide,
  events: GameEvent[],
): void {
  const tile = draft.tiles[position.y]?.[position.x];
  if (!tile || tile.type !== 'outpost') return;

  const previousOwner = tile.outpostOwner ?? null;
  if (previousOwner === owner) return;

  tile.outpostOwner = owner;
  events.push({
    type: 'OUTPOST_CAPTURED',
    payload: {
      position: clonePosition(tile.position),
      newOwner: owner,
      previousOwner,
    },
  });
}

export function computePlayerOutpostIncome(state: BattleState, side: PlayerSide): number {
  let income = 0;
  for (const row of state.tiles) {
    for (const tile of row) {
      if (tile.type === 'outpost' && tile.outpostOwner === side) {
        income += BALANCE.outpost.incomePerTurn;
      }
    }
  }
  return income;
}

export function getUnitOutpostDefenseBonus(state: BattleState, unit: Unit): number {
  for (const row of state.tiles) {
    for (const tile of row) {
      if (tile.type !== 'outpost' || tile.outpostOwner !== unit.owner) continue;
      if (manhattan(tile.position, unit.position) <= 1) {
        return BALANCE.outpost.defenseBonus;
      }
    }
  }
  return 0;
}

export function getUnitEffectiveDefense(state: BattleState, unit: Unit): number {
  return UNITS[unit.type].def + getUnitOutpostDefenseBonus(state, unit);
}

export function getRecruitSourceCandidateTiles(
  state: BattleState,
  source: RecruitSource,
  preferredSpawnAt: Position,
): Position[] {
  if (source.kind === 'base') {
    const neighbors = get4Neighbors(source.position).filter((pos) =>
      isInBounds(pos, { width: state.tiles[0]?.length ?? 0, height: state.tiles.length }),
    );
    return [preferredSpawnAt, ...neighbors.filter((pos) => !samePos(pos, preferredSpawnAt))];
  }

  const neighbors = get4Neighbors(source.position).filter((pos) =>
    isInBounds(pos, { width: state.tiles[0]?.length ?? 0, height: state.tiles.length }),
  );
  const ordered: Position[] = [source.position];
  if (!samePos(preferredSpawnAt, source.position)) {
    ordered.push(preferredSpawnAt);
  }
  ordered.push(...neighbors.filter((pos) => !ordered.some((candidate) => samePos(candidate, pos))));
  return ordered;
}

function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}
