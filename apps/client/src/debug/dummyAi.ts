import {
  BattleEngine,
  BALANCE,
  UNITS,
  computeMovableTiles,
  computeAttackableTargets,
  computeAbilityTargets,
  manhattan,
} from '@chesspvp/shared';
import type { PlayerSide, Unit, Position, GameEvent } from '@chesspvp/shared';

function getClosestEnemy(unit: Unit, engine: BattleEngine, side: PlayerSide): Unit | null {
  const enemies = engine.state.units.filter((u) => u.owner !== side);
  if (!enemies.length) return null;
  let closest = enemies[0]!;
  let minDist = manhattan(unit.position, closest.position);
  for (const e of enemies) {
    const d = manhattan(unit.position, e.position);
    if (d < minDist) {
      minDist = d;
      closest = e;
    }
  }
  return closest;
}

function pickMoveToward(
  movable: Position[],
  unitPos: Position,
  targetPos: Position
): Position | null {
  if (!movable.length) return null;
  let best = movable[0]!;
  let bestDist = manhattan(best, targetPos);
  for (const m of movable) {
    const d = manhattan(m, targetPos);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  // Only move if it gets us closer
  if (bestDist < manhattan(unitPos, targetPos)) return best;
  return null;
}

function getEnemyBasePosition(engine: BattleEngine, side: PlayerSide): Position | null {
  return engine.state.bases.find((base) => base.owner !== side)?.position ?? null;
}

function getBestHealTarget(engine: BattleEngine, unitId: string, side: PlayerSide): Unit | null {
  const user = engine.state.units.find((unit) => unit.id === unitId);
  if (!user) return null;

  const targets = computeAbilityTargets(engine.state, unitId, 'heal');
  const targetKeys = new Set(targets.map((pos) => `${pos.x},${pos.y}`));

  const allies = engine.state.units
    .filter(
      (unit) =>
        unit.owner === side &&
        targetKeys.has(`${unit.position.x},${unit.position.y}`) &&
        unit.hp < UNITS[unit.type].hp
    )
    .sort(
      (a, b) =>
        a.hp - b.hp ||
        manhattan(a.position, user.position) - manhattan(b.position, user.position)
    );

  return allies[0] ?? null;
}

function getArtilleryScore(
  engine: BattleEngine,
  side: PlayerSide,
  center: Position
): { hits: number; centerEnemyUnit: number; baseDist: number } {
  let hits = 0;
  let centerEnemyUnit = 0;

  for (const unit of engine.state.units) {
    if (unit.owner === side) continue;
    const dist = manhattan(unit.position, center);
    if (dist <= 1) {
      hits += 1;
      if (dist === 0) centerEnemyUnit = 1;
    }
  }

  for (const base of engine.state.bases) {
    if (base.owner === side) continue;
    if (manhattan(base.position, center) <= 1) hits += 1;
  }

  const enemyBasePos = getEnemyBasePosition(engine, side);
  return {
    hits,
    centerEnemyUnit,
    baseDist: enemyBasePos ? manhattan(center, enemyBasePos) : 999,
  };
}

function tryPriestHeal(engine: BattleEngine, side: PlayerSide, unitId: string): GameEvent[] | null {
  const target = getBestHealTarget(engine, unitId, side);
  if (!target) return null;

  try {
    const { events } = engine.apply(
      { type: 'USE_ABILITY', payload: { unitId, abilityId: 'heal', targetId: target.id } },
      side
    );
    return events;
  } catch {
    return null;
  }
}

function getPoisonBurstScore(
  engine: BattleEngine,
  side: PlayerSide,
  center: Position
): { hits: number; addedStacks: number; baseDist: number } {
  const maxStacks = BALANCE.status.poison.maxStacks;
  let hits = 0;
  let addedStacks = 0;

  for (const unit of engine.state.units) {
    if (unit.owner === side) continue;
    if (manhattan(unit.position, center) > 2) continue;
    hits += 1;
    addedStacks += Math.max(0, Math.min(2, maxStacks - unit.status.poisonStacks));
  }

  const enemyBasePos = getEnemyBasePosition(engine, side);
  return {
    hits,
    addedStacks,
    baseDist: enemyBasePos ? manhattan(center, enemyBasePos) : 999,
  };
}

function tryPoisonBurst(engine: BattleEngine, side: PlayerSide, unitId: string): GameEvent[] | null {
  const centers = computeAbilityTargets(engine.state, unitId, 'poison_burst');
  if (!centers.length) return null;

  const bestCenter = [...centers].sort((a, b) => {
    const scoreA = getPoisonBurstScore(engine, side, a);
    const scoreB = getPoisonBurstScore(engine, side, b);
    if (scoreB.hits !== scoreA.hits) return scoreB.hits - scoreA.hits;
    if (scoreB.addedStacks !== scoreA.addedStacks) return scoreB.addedStacks - scoreA.addedStacks;
    return scoreA.baseDist - scoreB.baseDist;
  })[0];

  if (!bestCenter) return null;
  const bestScore = getPoisonBurstScore(engine, side, bestCenter);
  if (bestScore.hits < 2 && bestScore.addedStacks < 3) return null;

  try {
    const { events } = engine.apply(
      { type: 'USE_ABILITY', payload: { unitId, abilityId: 'poison_burst', targetPos: bestCenter } },
      side
    );
    return events;
  } catch {
    return null;
  }
}

function tryAttack(engine: BattleEngine, side: PlayerSide, unitId: string): GameEvent[] | null {
  const unit = engine.state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return null;

  const attackable = computeAttackableTargets(engine.state, unitId);
  if (!attackable.length) return null;

  if (unit.type === 'gunner') {
    const bestTarget = [...attackable].sort((a, b) => {
      const scoreA = getArtilleryScore(engine, side, a);
      const scoreB = getArtilleryScore(engine, side, b);
      if (scoreB.hits !== scoreA.hits) return scoreB.hits - scoreA.hits;
      if (scoreB.centerEnemyUnit !== scoreA.centerEnemyUnit) {
        return scoreB.centerEnemyUnit - scoreA.centerEnemyUnit;
      }
      return scoreA.baseDist - scoreB.baseDist;
    })[0];

    if (!bestTarget) return null;

    try {
      const { events } = engine.apply(
        { type: 'ATTACK', payload: { unitId, targetPos: bestTarget } },
        side
      );
      return events;
    } catch {
      return null;
    }
  }

  const enemyUnits = engine.state.units
    .filter((candidate) => candidate.owner !== side)
    .sort((a, b) => {
      if (unit.type === 'poisoner' && a.status.poisonStacks !== b.status.poisonStacks) {
        return a.status.poisonStacks - b.status.poisonStacks;
      }
      return manhattan(unit.position, a.position) - manhattan(unit.position, b.position);
    });

  const attackableEnemy = enemyUnits.find((enemy) =>
    attackable.some((pos) => pos.x === enemy.position.x && pos.y === enemy.position.y)
  );

  if (attackableEnemy) {
    try {
      const { events } = engine.apply(
        { type: 'ATTACK', payload: { unitId, targetId: attackableEnemy.id } },
        side
      );
      return events;
    } catch {
      return null;
    }
  }

  const enemyBase = engine.state.bases.find((base) => base.owner !== side);
  if (enemyBase && attackable.some((pos) => pos.x === enemyBase.position.x && pos.y === enemyBase.position.y)) {
    try {
      const { events } = engine.apply(
        { type: 'ATTACK', payload: { unitId, targetPos: enemyBase.position } },
        side
      );
      return events;
    } catch {
      return null;
    }
  }

  return null;
}

export function runDummyAiTurn(engine: BattleEngine, side: PlayerSide): GameEvent[] {
  const state = engine.state;
  if (state.currentPlayer !== side) return [];

  const allEvents: GameEvent[] = [];
  const myUnits = state.units
    .filter((u) => u.owner === side && !u.hasActed)
    .map((u) => u.id);

  for (const unitId of myUnits) {
    if (engine.state.winner) break;
    const unit = engine.state.units.find((candidate) => candidate.id === unitId);
    if (!unit || unit.hasActed) continue;

    if (unit.type === 'priest') {
      const healEvents = tryPriestHeal(engine, side, unit.id);
      if (healEvents) {
        allEvents.push(...healEvents);
        continue;
      }
    }

    if (unit.type === 'poisoner') {
      const poisonBurstEvents = tryPoisonBurst(engine, side, unit.id);
      if (poisonBurstEvents) {
        allEvents.push(...poisonBurstEvents);
        continue;
      }
    }

    const attackEvents = tryAttack(engine, side, unit.id);
    if (attackEvents) {
      allEvents.push(...attackEvents);
      continue;
    }

    if (!unit.hasMoved) {
      const movable = computeMovableTiles(engine.state, unit.id);
      const healTarget = unit.type === 'priest' ? getBestHealTarget(engine, unit.id, side) : null;
      const closestEnemy = getClosestEnemy(unit, engine, side);
      const target = healTarget?.position ?? closestEnemy?.position ?? getEnemyBasePosition(engine, side);
      if (!target) continue;

      const moveTarget = pickMoveToward(movable, unit.position, target);
      if (moveTarget) {
        try {
          const { events: moveEvents } = engine.apply({ type: 'MOVE', payload: { unitId: unit.id, to: moveTarget } }, side);
          allEvents.push(...moveEvents);

          if (unit.type === 'priest') {
            const healAfterMove = tryPriestHeal(engine, side, unit.id);
            if (healAfterMove) {
              allEvents.push(...healAfterMove);
              continue;
            }
          }

          if (unit.type === 'poisoner') {
            const poisonBurstAfterMove = tryPoisonBurst(engine, side, unit.id);
            if (poisonBurstAfterMove) {
              allEvents.push(...poisonBurstAfterMove);
              continue;
            }
          }

          const attackAfterMove = tryAttack(engine, side, unit.id);
          if (attackAfterMove) allEvents.push(...attackAfterMove);
        } catch { /* skip */ }
      }
    }
  }

  // End turn — pass real wall-clock time so turnDeadline is set correctly
  try {
    const { events } = engine.apply({ type: 'END_TURN', payload: {} }, side, Date.now());
    allEvents.push(...events);
  } catch { /* skip */ }

  return allEvents;
}
