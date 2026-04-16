import type {
  BattleState,
  PlayerSide,
  Position,
  RecruitSource,
  Unit,
  UnitType,
} from '../types/battle';
import type { GameEvent } from '../types/event';
import type { ValidationResult } from './validators';
import { BALANCE, UNITS } from '../configs';
import { getRecruitSourceCandidateTiles, isOutpostTileAt, isRecruitSourceEqual } from './outposts';
import {
  clonePosition,
  cloneUnit,
  createDefaultCooldowns,
  createDefaultUnitStatus,
  get4Neighbors,
  isInBounds,
  key,
} from './utils';
import { produce } from 'immer';

export function tryRecruitOrder(
  state: BattleState,
  player: PlayerSide,
  unitType: UnitType,
  source: RecruitSource,
  spawnAt: Position,
): ValidationResult {
  const playerState = state.players[player];
  const unitCfg = UNITS[unitType];
  const map = { width: state.tiles[0]?.length ?? 0, height: state.tiles.length };

  if (playerState.gold < unitCfg.cost) {
    return { ok: false, code: 'INSUFFICIENT_GOLD', message: '金币不足' };
  }
  const ownUnits = state.units.filter((u) => u.owner === player).length;
  if (ownUnits >= BALANCE.unit.populationCap) {
    return { ok: false, code: 'POPULATION_CAP', message: '人口已满' };
  }

  const sourceValidation = validateRecruitSource(state, player, source, map);
  if (!sourceValidation.ok) return sourceValidation;

  if (playerState.pendingRecruits.some((pending) => isRecruitSourceEqual(pending.source, source))) {
    return { ok: false, code: 'RECRUIT_ALREADY_ORDERED', message: '该建筑本回合已下招募单' };
  }

  const allowedTargets = getAllowedSpawnTargets(source, map);
  const valid = allowedTargets.some((candidate) => candidate.x === spawnAt.x && candidate.y === spawnAt.y);
  if (!valid) {
    return {
      ok: false,
      code: 'INVALID_SPAWN_POSITION',
      message: source.kind === 'base' ? '基地只能在四邻格出兵' : '前哨站只能在本格或四邻格出兵',
    };
  }

  return { ok: true };
}

export function executePendingRecruit(
  state: BattleState,
  player: PlayerSide,
): { events: GameEvent[]; nextState: BattleState } {
  const pendingOrders = state.players[player].pendingRecruits;
  if (!pendingOrders.length) return { events: [], nextState: state };

  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    const orders = [...draft.players[player].pendingRecruits];
    draft.players[player].pendingRecruits = [];

    for (const pending of orders) {
      const spawnCandidates = getRecruitSourceCandidateTiles(draft, pending.source, pending.spawnAt);
      const spawnPos = spawnCandidates.find((pos) => canSpawnAt(draft, pos));

      if (spawnPos) {
        const unitCfg = UNITS[pending.unitType];
        const newUnit: Unit = {
          id: getNextUnitId(draft, player),
          owner: player,
          type: pending.unitType,
          position: clonePosition(spawnPos),
          hp: unitCfg.hp,
          hasMoved: false,
          hasActed: false,
          spawnedThisTurn: true,
          status: createDefaultUnitStatus(),
          cooldowns: createDefaultCooldowns(),
        };
        draft.units.push(newUnit);
        events.push({
          type: 'UNIT_RECRUITED',
          payload: { unit: cloneUnit(newUnit) },
        });
        continue;
      }

      const unitCfg = UNITS[pending.unitType];
      draft.players[player].gold += unitCfg.cost;
      events.push({
        type: 'UNIT_RECRUIT_FAILED',
        payload: {
          player,
          source: cloneRecruitSource(pending.source),
          reason: 'spawn_blocked',
          refundedGold: unitCfg.cost,
        },
      });
      events.push({
        type: 'GOLD_CHANGED',
        payload: {
          player,
          delta: unitCfg.cost,
          newAmount: draft.players[player].gold,
          reason: 'recruit_refund',
        },
      });
    }
  });

  return { events, nextState };
}

function validateRecruitSource(
  state: BattleState,
  player: PlayerSide,
  source: RecruitSource,
  map: { width: number; height: number },
): ValidationResult {
  if (source.kind === 'base') {
    const base = state.bases.find((candidate) => candidate.owner === player);
    if (!base) {
      return { ok: false, code: 'INVALID_ACTION', message: '基地不存在' };
    }
    if (base.position.x !== source.position.x || base.position.y !== source.position.y) {
      return { ok: false, code: 'INVALID_ACTION', message: '招募来源基地不合法' };
    }
    return { ok: true };
  }

  if (!isInBounds(source.position, map)) {
    return { ok: false, code: 'INVALID_ACTION', message: '前哨站位置非法' };
  }
  if (!isOutpostTileAt(state, source.position)) {
    return { ok: false, code: 'INVALID_ACTION', message: '招募来源不是前哨站' };
  }
  const tile = state.tiles[source.position.y]?.[source.position.x];
  if (tile?.outpostOwner !== player) {
    return { ok: false, code: 'INVALID_ACTION', message: '只能从己方前哨站招募' };
  }
  return { ok: true };
}

function getAllowedSpawnTargets(
  source: RecruitSource,
  map: { width: number; height: number },
): Position[] {
  const neighbors = get4Neighbors(source.position).filter((pos) => isInBounds(pos, map));
  if (source.kind === 'base') {
    return neighbors;
  }
  return [source.position, ...neighbors];
}

function canSpawnAt(state: BattleState, pos: Position): boolean {
  const tile = state.tiles[pos.y]?.[pos.x];
  if (!tile) return false;
  if (tile.type === 'blocked' || tile.type === 'base_a' || tile.type === 'base_b') return false;
  return !state.units.some((unit) => unit.position.x === pos.x && unit.position.y === pos.y);
}

function getNextUnitId(state: BattleState, player: PlayerSide): string {
  const existingIds = new Set(state.units.map((unit) => unit.id));
  let idx = state.units.length + 1;
  let newId = `u_${player.toLowerCase()}_${String(idx).padStart(3, '0')}`;
  while (existingIds.has(newId)) {
    idx += 1;
    newId = `u_${player.toLowerCase()}_${String(idx).padStart(3, '0')}`;
  }
  return newId;
}

function cloneRecruitSource(source: RecruitSource): RecruitSource {
  return {
    kind: source.kind,
    position: clonePosition(source.position),
  };
}

export { key };
