import type { BattleState, PlayerSide, Position } from '../types/battle';
import type { GameEvent } from '../types/event';
import { BALANCE, MAPS, UNITS } from '../configs';
import { deepClone, isInBounds, key } from './utils';

// =========================================================
// 核心：计算某一方的可见格子集合
// =========================================================

/**
 * 计算 side 一方当前可见的所有格子（曼哈顿距离视野圆）。
 * 视野来源：
 *   1. 己方每个单位（sight 来自 units.json）
 *   2. 己方基地（sight 来自 balance.json#base.sight）
 *   3. 己方占领的资源点（sight 来自 balance.json#resourcePoint.sight）
 */
export function computeVisibleTiles(state: BattleState, side: PlayerSide): Set<string> {
  const map = MAPS[state.mapId];
  const visible = new Set<string>();

  function addRadius(center: Position, radius: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue; // 曼哈顿圆
        const pos = { x: center.x + dx, y: center.y + dy };
        if (isInBounds(pos, map)) {
          visible.add(key(pos));
        }
      }
    }
  }

  // 1. 单位视野
  for (const unit of state.units) {
    if (unit.owner !== side) continue;
    addRadius(unit.position, UNITS[unit.type].sight);
  }

  // 2. 基地视野
  const myBase = state.bases.find((b) => b.owner === side);
  if (myBase) {
    addRadius(myBase.position, BALANCE.base.sight);
  }

  // 3. 己方资源点视野
  for (let y = 0; y < state.tiles.length; y++) {
    for (let x = 0; x < (state.tiles[y]?.length ?? 0); x++) {
      const tile = state.tiles[y]![x]!;
      if (tile.type === 'resource' && tile.resourceOwner === side) {
        addRadius({ x, y }, BALANCE.resourcePoint.sight);
      }
    }
  }

  return visible;
}

/** 快速检查某个格子是否在可见集合中 */
export function isTileVisible(visible: Set<string>, pos: Position): boolean {
  return visible.has(key(pos));
}

// =========================================================
// 状态过滤：生成某一方的视角状态（用于向客户端下发）
// =========================================================

/**
 * 从完整权威状态生成 side 一方的过滤视角状态：
 * - 不可见的敌方单位从 units 数组中删除
 * - 敌方 gold、pendingRecruits 置零/置空（UI 根据 fog 字段显示 "?"）
 * - 附加 fog 字段描述可见范围
 */
export function filterStateForPlayer(state: BattleState, side: PlayerSide): BattleState {
  const visible = computeVisibleTiles(state, side);
  const opp: PlayerSide = side === 'A' ? 'B' : 'A';

  const filtered = deepClone(state) as BattleState;

  // 删除迷雾中的敌方单位
  filtered.units = filtered.units.filter((u) => {
    if (u.owner === side) return true;
    return isTileVisible(visible, u.position);
  });

  // 隐藏对手私密信息（客户端凭 fog.perspective 判断是否显示 ?）
  filtered.players[opp].gold = 0;
  filtered.players[opp].pendingRecruits = [];

  // 附加迷雾元信息
  filtered.fog = {
    perspective: side,
    visibleTiles: Array.from(visible),
  };

  return filtered;
}

// =========================================================
// 事件过滤：为某一方裁剪 event batch
// =========================================================

/**
 * 对一次 action 产生的事件列表，按 side 过滤出该玩家应收到的子集。
 *
 * @param events   engine.apply() 返回的原始事件
 * @param side     接收方
 * @param preState action 执行前的完整权威状态
 * @param postState action 执行后的完整权威状态
 */
export function filterEventsForPlayer(
  events: GameEvent[],
  side: PlayerSide,
  preState: BattleState,
  postState: BattleState,
): GameEvent[] {
  const preVisible = computeVisibleTiles(preState, side);
  const postVisible = computeVisibleTiles(postState, side);

  return events.filter((ev) => isEventVisible(ev, side, preState, postState, preVisible, postVisible));
}

function findUnitInEither(
  id: string,
  preState: BattleState,
  postState: BattleState,
) {
  return (
    preState.units.find((u) => u.id === id) ??
    postState.units.find((u) => u.id === id)
  );
}

function isEventVisible(
  ev: GameEvent,
  side: PlayerSide,
  preState: BattleState,
  postState: BattleState,
  preVisible: Set<string>,
  postVisible: Set<string>,
): boolean {
  switch (ev.type) {
    // ---- 全局事件，始终可见 ----
    case 'TURN_BEGAN':
    case 'TURN_ENDED':
    case 'TURN_CHANGED':
    case 'MATCH_ENDED':
    case 'BASE_DAMAGED':
    case 'BASE_DESTROYED':
    case 'RESOURCE_POINT_CAPTURED':
    case 'OUTPOST_CAPTURED':
      return true;

    // ---- 私密事件，只发给当事玩家 ----
    case 'GOLD_CHANGED':
      return ev.payload.player === side;

    case 'UNIT_RECRUIT_ORDERED':
    case 'UNIT_RECRUIT_FAILED':
      return ev.payload.player === side;

    case 'UNIT_ABILITY_USED': {
      const unit = findUnitInEither(ev.payload.unitId, preState, postState);
      if (unit?.owner === side) return true;
      if (unit && isTileVisible(preVisible, unit.position)) return true;
      if (ev.payload.targetId) {
        const target = findUnitInEither(ev.payload.targetId, preState, postState);
        if (target?.owner === side) return true;
        if (target && (isTileVisible(preVisible, target.position) || isTileVisible(postVisible, target.position))) {
          return true;
        }
      }
      if (ev.payload.targetPos) {
        return isTileVisible(preVisible, ev.payload.targetPos) || isTileVisible(postVisible, ev.payload.targetPos);
      }
      return false;
    }

    case 'UNIT_HEALED': {
      const unit = findUnitInEither(ev.payload.unitId, preState, postState);
      if (unit?.owner === side) return true;
      if (unit) {
        return isTileVisible(preVisible, unit.position) || isTileVisible(postVisible, unit.position);
      }
      return false;
    }

    case 'UNIT_POISON_CHANGED': {
      const unit = findUnitInEither(ev.payload.unitId, preState, postState);
      if (unit?.owner === side) return true;
      if (unit) {
        return isTileVisible(preVisible, unit.position) || isTileVisible(postVisible, unit.position);
      }
      return false;
    }

    // ---- 招募完成：己方总发；敌方按出生点是否可见 ----
    case 'UNIT_RECRUITED': {
      if (ev.payload.unit.owner === side) return true;
      return isTileVisible(postVisible, ev.payload.unit.position);
    }

    // ---- 单位移动：己方总发；敌方按 from/to 任一在视野内 ----
    case 'UNIT_MOVED': {
      const unit = findUnitInEither(ev.payload.unitId, preState, postState);
      if (unit?.owner === side) return true;
      return (
        isTileVisible(preVisible, ev.payload.from) ||
        isTileVisible(postVisible, ev.payload.to)
      );
    }

    // ---- 攻击：己方单位发出或承受的攻击总发；否则按攻击者位置可见 ----
    case 'UNIT_ATTACKED': {
      const attacker = findUnitInEither(ev.payload.attackerId, preState, postState);
      if (attacker?.owner === side) return true;
      // 如果我方某个单位是目标（targetId 指向己方），也要发
      if (ev.payload.targetId) {
        const target = findUnitInEither(ev.payload.targetId, preState, postState);
        if (target?.owner === side) return true;
      }
      // 攻击基地：如果攻击者可见就发
      if (attacker) return isTileVisible(preVisible, attacker.position);
      return false;
    }

    // ---- 受伤：己方总发；敌方按事前位置可见 ----
    case 'UNIT_DAMAGED': {
      const unit = findUnitInEither(ev.payload.unitId, preState, postState);
      if (unit?.owner === side) return true;
      if (unit) return isTileVisible(preVisible, unit.position);
      return false;
    }

    // ---- 死亡：同受伤规则（使用事前状态找位置）----
    case 'UNIT_KILLED': {
      const unit = preState.units.find((u) => u.id === ev.payload.unitId);
      if (unit?.owner === side) return true;
      if (unit) return isTileVisible(preVisible, unit.position);
      return false;
    }

    default:
      return true;
  }
}
