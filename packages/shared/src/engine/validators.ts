import type { BattleState, PlayerSide } from '../types/battle';
import type { Action } from '../types/action';
import { computeMovableTiles } from './pathfinding';
import { computeAttackableTargets } from './combat';
import { computeAbilityTargets, getAbilityConfig } from './abilities';
import { tryRecruitOrder } from './recruit';
import { key } from './utils';

export type ErrorCode =
  | 'NOT_YOUR_TURN'
  | 'UNIT_NOT_FOUND'
  | 'NOT_YOUR_UNIT'
  | 'UNIT_ALREADY_MOVED'
  | 'UNIT_ALREADY_ACTED'
  | 'UNIT_SPAWNED_THIS_TURN'
  | 'INVALID_MOVE_TARGET'
  | 'INVALID_ATTACK_TARGET'
  | 'INVALID_ABILITY_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'ABILITY_NOT_FOUND'
  | 'ABILITY_ON_COOLDOWN'
  | 'INSUFFICIENT_GOLD'
  | 'POPULATION_CAP'
  | 'RECRUIT_ALREADY_ORDERED'
  | 'INVALID_SPAWN_POSITION'
  | 'MATCH_ALREADY_ENDED'
  | 'INVALID_ACTION';

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string; details?: unknown };

export function validateAction(
  state: BattleState,
  action: Action,
  actor: PlayerSide
): ValidationResult {
  if (state.winner !== null) {
    return { ok: false, code: 'MATCH_ALREADY_ENDED', message: '对局已结束' };
  }
  switch (action.type) {
    case 'MOVE':
      return validateMove(state, action, actor);
    case 'ATTACK':
      return validateAttack(state, action, actor);
    case 'USE_ABILITY':
      return validateUseAbility(state, action, actor);
    case 'RECRUIT':
      return validateRecruit(state, action, actor);
    case 'END_TURN':
      return validateEndTurn(state, actor);
    case 'SURRENDER':
      return { ok: true };
  }
}

function validateControllableUnit(
  state: BattleState,
  unitId: string,
  actor: PlayerSide
) {
  if (state.currentPlayer !== actor) {
    return { ok: false, code: 'NOT_YOUR_TURN', message: '还没到你的回合' } as const;
  }
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return { ok: false, code: 'UNIT_NOT_FOUND', message: '单位不存在' } as const;
  if (unit.owner !== actor) {
    return { ok: false, code: 'NOT_YOUR_UNIT', message: '不是你的单位' } as const;
  }
  if (unit.hasActed) return { ok: false, code: 'UNIT_ALREADY_ACTED', message: '单位已行动' } as const;
  return { ok: true, unit } as const;
}

function validateMove(
  state: BattleState,
  action: Extract<Action, { type: 'MOVE' }>,
  actor: PlayerSide
): ValidationResult {
  const controllable = validateControllableUnit(state, action.payload.unitId, actor);
  if (!controllable.ok) return controllable;
  const { unit } = controllable;
  if (unit.hasMoved) return { ok: false, code: 'UNIT_ALREADY_MOVED', message: '单位已移动' };
  const movable = computeMovableTiles(state, unit.id);
  const valid = movable.some((p) => p.x === action.payload.to.x && p.y === action.payload.to.y);
  if (!valid) return { ok: false, code: 'INVALID_MOVE_TARGET', message: '目标格不可达' };
  return { ok: true };
}

function validateAttack(
  state: BattleState,
  action: Extract<Action, { type: 'ATTACK' }>,
  actor: PlayerSide
): ValidationResult {
  const controllable = validateControllableUnit(state, action.payload.unitId, actor);
  if (!controllable.ok) return controllable;
  const { unit } = controllable;

  // 解析攻击目标位置
  let targetPos = action.payload.targetPos;
  if (!targetPos && action.payload.targetId) {
    const target = state.units.find((u) => u.id === action.payload.targetId);
    if (!target) return { ok: false, code: 'TARGET_NOT_FOUND', message: '攻击目标不存在' };
    targetPos = target.position;
  }
  if (!targetPos) return { ok: false, code: 'INVALID_ATTACK_TARGET', message: '未指定攻击目标' };

  const attackable = computeAttackableTargets(state, unit.id);
  const valid = attackable.some((p) => p.x === targetPos!.x && p.y === targetPos!.y);
  if (!valid) return { ok: false, code: 'INVALID_ATTACK_TARGET', message: '目标不在攻击范围' };

  return { ok: true };
}

function validateUseAbility(
  state: BattleState,
  action: Extract<Action, { type: 'USE_ABILITY' }>,
  actor: PlayerSide
): ValidationResult {
  const controllable = validateControllableUnit(state, action.payload.unitId, actor);
  if (!controllable.ok) return controllable;
  const { unit } = controllable;

  const ability = getAbilityConfig(unit.type, action.payload.abilityId);
  if (!ability) {
    return { ok: false, code: 'ABILITY_NOT_FOUND', message: '技能不存在' };
  }
  if ((unit.cooldowns[action.payload.abilityId] ?? 0) > 0) {
    return { ok: false, code: 'ABILITY_ON_COOLDOWN', message: '技能冷却中' };
  }

  let targetPos = action.payload.targetPos;
  if (!targetPos && action.payload.targetId) {
    const target = state.units.find((candidate) => candidate.id === action.payload.targetId);
    if (!target) return { ok: false, code: 'TARGET_NOT_FOUND', message: '目标不存在' };
    targetPos = target.position;
  }
  if (!targetPos) {
    return { ok: false, code: 'INVALID_ABILITY_TARGET', message: '未指定技能目标' };
  }

  const targets = computeAbilityTargets(state, unit.id, ability.id);
  const valid = targets.some((candidate) => key(candidate) === key(targetPos!));
  if (!valid) {
    return { ok: false, code: 'INVALID_ABILITY_TARGET', message: '目标不在技能范围内' };
  }

  return { ok: true };
}

function validateRecruit(
  state: BattleState,
  action: Extract<Action, { type: 'RECRUIT' }>,
  actor: PlayerSide
): ValidationResult {
  if (state.currentPlayer !== actor) {
    return { ok: false, code: 'NOT_YOUR_TURN', message: '还没到你的回合' };
  }
  return tryRecruitOrder(
    state,
    actor,
    action.payload.unitType,
    action.payload.source,
    action.payload.spawnAt,
  );
}

function validateEndTurn(state: BattleState, actor: PlayerSide): ValidationResult {
  if (state.currentPlayer !== actor) {
    return { ok: false, code: 'NOT_YOUR_TURN', message: '还没到你的回合' };
  }
  return { ok: true };
}

export { key };
