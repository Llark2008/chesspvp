import type { BattleState, PlayerSide, Position } from '../types/battle';
import type { Action } from '../types/action';
import type { GameEvent } from '../types/event';
import { BALANCE, UNITS } from '../configs';
import { getAbilityConfig } from './abilities';
import { computeDamage } from './combat';
import { beginTurn } from './turn';
import { checkVictory } from './victory';
import { captureResourcePointAt } from './resourcePoints';
import { captureOutpostAt, getUnitEffectiveDefense } from './outposts';
import { clonePosition, manhattan } from './utils';
import { produce } from 'immer';

export function applyAction(
  state: BattleState,
  action: Action,
  actor: PlayerSide,
  nowMs = 0
): { events: GameEvent[]; nextState: BattleState } {
  switch (action.type) {
    case 'MOVE':
      return applyMove(state, action, actor);
    case 'ATTACK':
      return applyAttack(state, action, actor);
    case 'USE_ABILITY':
      return applyUseAbility(state, action, actor);
    case 'RECRUIT':
      return applyRecruit(state, action, actor);
    case 'END_TURN':
      return applyEndTurn(state, actor, nowMs);
    case 'SURRENDER':
      return applySurrender(state, actor);
  }
}

function applyMove(
  state: BattleState,
  action: Extract<Action, { type: 'MOVE' }>,
  _actor: PlayerSide
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    const unit = draft.units.find((u) => u.id === action.payload.unitId)!;
    const from = clonePosition(unit.position);
    unit.position = { ...action.payload.to };
    unit.hasMoved = true;
    // Spread unit.position into a plain object while still inside the
    // produce() callback so the Immer draft proxy is still valid.
    // Storing `unit.position` directly would capture the proxy, which
    // gets revoked when produce() returns and crashes Socket.IO's
    // hasBinary serialiser.
    const to = clonePosition(unit.position);
    events.push({
      type: 'UNIT_MOVED',
      payload: { unitId: unit.id, from, to, path: [] },
    });
    captureResourcePointAt(draft, unit.position, unit.owner, events);
    captureOutpostAt(draft, unit.position, unit.owner, events);
  });
  return { events, nextState };
}

function resolveTargetPos(
  state: BattleState,
  payload: { targetId?: string; targetPos?: Position }
): Position | null {
  if (payload.targetPos) return payload.targetPos;
  if (payload.targetId) {
    const target = state.units.find((unit) => unit.id === payload.targetId);
    if (target) return target.position;
  }
  return null;
}

function scaleSplashDamage(damage: number, multiplier: number): number {
  return Math.max(BALANCE.combat.minDamage, Math.floor(damage * multiplier));
}

function applyPoisonStacks(
  stacksBefore: number,
  delta: number
): number {
  return Math.min(
    BALANCE.status.poison.maxStacks,
    Math.max(0, stacksBefore + delta)
  );
}

function pushPoisonChangedEvent(
  events: GameEvent[],
  unitId: string,
  stacksBefore: number,
  stacksAfter: number,
  reason: 'attack' | 'skill' | 'turn_tick'
): void {
  if (stacksBefore === stacksAfter) return;
  events.push({
    type: 'UNIT_POISON_CHANGED',
    payload: { unitId, stacksBefore, stacksAfter, reason },
  });
}

function finishBaseDestroyed(
  draft: BattleState,
  baseOwner: PlayerSide,
  events: GameEvent[]
): void {
  events.push({ type: 'BASE_DESTROYED', payload: { owner: baseOwner } });
  const winner: PlayerSide = baseOwner === 'A' ? 'B' : 'A';
  draft.winner = winner;
  draft.endReason = 'base_destroyed';
  events.push({
    type: 'MATCH_ENDED',
    payload: { winner, reason: 'base_destroyed' },
  });
}

function applyAttack(
  state: BattleState,
  action: Extract<Action, { type: 'ATTACK' }>,
  _actor: PlayerSide
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];

  const targetPos = resolveTargetPos(state, action.payload);
  if (!targetPos) return { events, nextState: state };

  const attacker = state.units.find((u) => u.id === action.payload.unitId)!;
  const attackerCfg = UNITS[attacker.type];

  if (attackerCfg.attackKind === 'aoe') {
    return applyAoeAttack(state, attacker.id, targetPos);
  }

  const targetUnit = state.units.find(
    (u) => u.position.x === targetPos.x && u.position.y === targetPos.y && u.owner !== attacker.owner
  );
  const targetBase = state.bases.find(
    (b) => b.position.x === targetPos.x && b.position.y === targetPos.y && b.owner !== attacker.owner
  );

  const nextState = produce(state, (draft) => {
    const att = draft.units.find((u) => u.id === attacker.id)!;
    att.hasActed = true;

    if (targetUnit) {
      const defUnit = draft.units.find((u) => u.id === targetUnit.id)!;
      const { damage, counterMul } = computeDamage(
        attacker.type,
        defUnit.type,
        attackerCfg.atk,
        getUnitEffectiveDefense(draft, defUnit),
        BALANCE
      );
      const hpBefore = defUnit.hp;
      defUnit.hp -= damage;
      const hpAfter = defUnit.hp;

      events.push({
        type: 'UNIT_ATTACKED',
        payload: { attackerId: attacker.id, targetId: defUnit.id, damage, counterMul },
      });
      events.push({ type: 'UNIT_DAMAGED', payload: { unitId: defUnit.id, damage, hpBefore, hpAfter } });

      if (defUnit.hp <= 0) {
        const killedId = defUnit.id;
        draft.units = draft.units.filter((u) => u.id !== killedId);
        events.push({ type: 'UNIT_KILLED', payload: { unitId: killedId } });
      } else if (attacker.type === 'poisoner') {
        const stacksBefore = defUnit.status.poisonStacks;
        const stacksAfter = applyPoisonStacks(stacksBefore, 1);
        defUnit.status.poisonStacks = stacksAfter;
        pushPoisonChangedEvent(events, defUnit.id, stacksBefore, stacksAfter, 'attack');
      }
    } else if (targetBase) {
      const defBase = draft.bases.find((b) => b.owner === targetBase.owner)!;
      const { damage, counterMul } = computeDamage(
        attacker.type,
        'base',
        attackerCfg.atk,
        BALANCE.base.def,
        BALANCE
      );
      const hpBefore = defBase.hp;
      defBase.hp -= damage;
      const hpAfter = defBase.hp;

      events.push({
        type: 'UNIT_ATTACKED',
        payload: {
          attackerId: attacker.id,
          targetPos: clonePosition(targetBase.position),
          damage,
          counterMul,
        },
      });
      events.push({
        type: 'BASE_DAMAGED',
        payload: { owner: defBase.owner, damage, hpBefore, hpAfter },
      });

      if (defBase.hp <= 0) {
        finishBaseDestroyed(draft, defBase.owner, events);
      }
    }
  });

  return { events, nextState };
}

function applyAoeAttack(
  state: BattleState,
  attackerId: string,
  centerPos: Position
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];
  const attacker = state.units.find((unit) => unit.id === attackerId)!;
  const attackerCfg = UNITS[attacker.type];
  const splashRadius = attackerCfg.splashRadius ?? 0;
  const splashMultiplier = attackerCfg.splashMultiplier ?? 1;

  const enemyUnits = state.units.filter(
    (unit) =>
      unit.owner !== attacker.owner &&
      manhattan(unit.position, centerPos) <= splashRadius
  );
  const enemyBases = state.bases.filter(
    (base) =>
      base.owner !== attacker.owner &&
      manhattan(base.position, centerPos) <= splashRadius
  );

  const nextState = produce(state, (draft) => {
    const att = draft.units.find((unit) => unit.id === attacker.id)!;
    att.hasActed = true;

    events.push({
      type: 'UNIT_ATTACKED',
      payload: { attackerId: attacker.id, targetPos: clonePosition(centerPos) },
    });

    for (const target of enemyUnits) {
      const defUnit = draft.units.find((unit) => unit.id === target.id);
      if (!defUnit) continue;
      const computed = computeDamage(
        attacker.type,
        defUnit.type,
        attackerCfg.atk,
        getUnitEffectiveDefense(draft, defUnit),
        BALANCE
      );
      const isCenterHit = target.position.x === centerPos.x && target.position.y === centerPos.y;
      const damage = isCenterHit
        ? computed.damage
        : scaleSplashDamage(computed.damage, splashMultiplier);
      const hpBefore = defUnit.hp;
      defUnit.hp -= damage;
      const hpAfter = defUnit.hp;

      events.push({
        type: 'UNIT_DAMAGED',
        payload: { unitId: defUnit.id, damage, hpBefore, hpAfter },
      });

      if (defUnit.hp <= 0) {
        const killedId = defUnit.id;
        draft.units = draft.units.filter((unit) => unit.id !== killedId);
        events.push({ type: 'UNIT_KILLED', payload: { unitId: killedId } });
      }
    }

    for (const target of enemyBases) {
      const defBase = draft.bases.find((base) => base.owner === target.owner);
      if (!defBase) continue;
      const computed = computeDamage(
        attacker.type,
        'base',
        attackerCfg.atk,
        BALANCE.base.def,
        BALANCE
      );
      const isCenterHit = target.position.x === centerPos.x && target.position.y === centerPos.y;
      const damage = isCenterHit
        ? computed.damage
        : scaleSplashDamage(computed.damage, splashMultiplier);
      const hpBefore = defBase.hp;
      defBase.hp -= damage;
      const hpAfter = defBase.hp;

      events.push({
        type: 'BASE_DAMAGED',
        payload: { owner: defBase.owner, damage, hpBefore, hpAfter },
      });

      if (defBase.hp <= 0 && draft.winner === null) {
        finishBaseDestroyed(draft, defBase.owner, events);
      }
    }
  });

  return { events, nextState };
}

function applyUseAbility(
  state: BattleState,
  action: Extract<Action, { type: 'USE_ABILITY' }>,
  _actor: PlayerSide
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];
  const sourceUnit = state.units.find((unit) => unit.id === action.payload.unitId);
  if (!sourceUnit) return { events, nextState: state };

  const ability = getAbilityConfig(sourceUnit.type, action.payload.abilityId);
  if (!ability) return { events, nextState: state };

  const targetPos = resolveTargetPos(state, action.payload);
  if (!targetPos) return { events, nextState: state };

  switch (ability.kind) {
    case 'heal':
      return applyHealAbility(state, action, targetPos, ability.power);
    case 'poison_burst':
      return applyPoisonBurstAbility(state, action, targetPos, ability.applyStacks, ability.radius, ability.cooldownTurns);
    default:
      return { events, nextState: state };
  }
}

function applyHealAbility(
  state: BattleState,
  action: Extract<Action, { type: 'USE_ABILITY' }>,
  targetPos: Position,
  healPower: number
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];
  const target = state.units.find(
    (unit) => unit.position.x === targetPos.x && unit.position.y === targetPos.y
  );
  if (!target) return { events, nextState: state };

  const nextState = produce(state, (draft) => {
    const healer = draft.units.find((unit) => unit.id === action.payload.unitId)!;
    const healed = draft.units.find((unit) => unit.id === target.id)!;
    healer.hasActed = true;

    const hpBefore = healed.hp;
    const maxHp = UNITS[healed.type].hp;
    healed.hp = Math.min(maxHp, healed.hp + healPower);
    const hpAfter = healed.hp;
    // Do not leak draft-backed positions into events. Once produce() returns,
    // revoked Immer proxies inside payloads will crash Socket.IO serialisation.
    const healedPos = clonePosition(healed.position);

    events.push({
      type: 'UNIT_ABILITY_USED',
      payload: {
        unitId: healer.id,
        abilityId: action.payload.abilityId,
        targetId: healed.id,
        targetPos: healedPos,
      },
    });
    events.push({
      type: 'UNIT_HEALED',
      payload: {
        unitId: healed.id,
        amount: hpAfter - hpBefore,
        hpBefore,
        hpAfter,
      },
    });
  });

  return { events, nextState };
}

function applyPoisonBurstAbility(
  state: BattleState,
  action: Extract<Action, { type: 'USE_ABILITY' }>,
  targetPos: Position,
  applyStacksCount: number,
  radius: number,
  cooldownTurns: number
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    const caster = draft.units.find((unit) => unit.id === action.payload.unitId)!;
    caster.hasActed = true;
    caster.cooldowns[action.payload.abilityId] = cooldownTurns;

    events.push({
      type: 'UNIT_ABILITY_USED',
      payload: {
        unitId: caster.id,
        abilityId: action.payload.abilityId,
        targetPos: clonePosition(targetPos),
      },
    });

    for (const unit of draft.units) {
      if (unit.owner === caster.owner) continue;
      if (manhattan(unit.position, targetPos) > radius) continue;
      const stacksBefore = unit.status.poisonStacks;
      const stacksAfter = applyPoisonStacks(stacksBefore, applyStacksCount);
      unit.status.poisonStacks = stacksAfter;
      pushPoisonChangedEvent(events, unit.id, stacksBefore, stacksAfter, 'skill');
    }
  });

  return { events, nextState };
}

function applyRecruit(
  state: BattleState,
  action: Extract<Action, { type: 'RECRUIT' }>,
  actor: PlayerSide
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];
  const unitCfg = UNITS[action.payload.unitType];
  const nextState = produce(state, (draft) => {
    draft.players[actor].gold -= unitCfg.cost;
    draft.players[actor].pendingRecruits.push({
      unitType: action.payload.unitType,
      source: {
        kind: action.payload.source.kind,
        position: clonePosition(action.payload.source.position),
      },
      spawnAt: clonePosition(action.payload.spawnAt),
      orderedTurn: draft.turnNumber,
    });
    events.push({
      type: 'UNIT_RECRUIT_ORDERED',
      payload: {
        player: actor,
        unitType: action.payload.unitType,
        source: {
          kind: action.payload.source.kind,
          position: clonePosition(action.payload.source.position),
        },
        spawnAt: clonePosition(action.payload.spawnAt),
      },
    });
    events.push({
      type: 'GOLD_CHANGED',
      payload: {
        player: actor,
        delta: -unitCfg.cost,
        newAmount: draft.players[actor].gold,
        reason: 'recruit_cost',
      },
    });
  });
  return { events, nextState };
}

function applyEndTurn(
  state: BattleState,
  actor: PlayerSide,
  nowMs: number
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];

  // TURN_ENDED event
  const elapsed = nowMs - (state.turnDeadline - BALANCE.match.turnTimeSeconds * 1000);
  events.push({
    type: 'TURN_ENDED',
    payload: {
      player: actor,
      elapsedMs: Math.max(0, elapsed),
      reserveRemaining: state.players[actor].reserveTimeMs,
    },
  });

  // Switch player
  const nextPlayer: PlayerSide = actor === 'A' ? 'B' : 'A';

  // beginTurn for next player
  const { events: beginEvents, nextState } = beginTurn(state, nextPlayer, nowMs);
  events.push(...beginEvents);

  events.push({
    type: 'TURN_CHANGED',
    payload: { currentPlayer: nextPlayer, turnNumber: nextState.turnNumber },
  });

  // Check victory after the turn
  const victory = checkVictory(nextState);
  if (victory && !nextState.winner) {
    // Append MATCH_ENDED if not already in events
    const alreadyEnded = events.some((e) => e.type === 'MATCH_ENDED');
    if (!alreadyEnded) {
      events.push({
        type: 'MATCH_ENDED',
        payload: { winner: victory.winner, reason: victory.reason },
      });
    }
  }

  return { events, nextState };
}

function applySurrender(
  state: BattleState,
  actor: PlayerSide
): { events: GameEvent[]; nextState: BattleState } {
  const winner: PlayerSide = actor === 'A' ? 'B' : 'A';
  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    draft.winner = winner;
    draft.endReason = 'surrender';
  });
  events.push({ type: 'MATCH_ENDED', payload: { winner, reason: 'surrender' } });
  return { events, nextState };
}
