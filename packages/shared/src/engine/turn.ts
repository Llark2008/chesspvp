import type { BattleState, PlayerSide } from '../types/battle';
import type { GameEvent } from '../types/event';
import { BALANCE } from '../configs';
import { computePlayerIncome, computePlayerUpkeep } from './economy';
import { executePendingRecruit } from './recruit';
import { produce } from 'immer';

export function beginTurn(
  state: BattleState,
  player: PlayerSide,
  nowMs: number
): { events: GameEvent[]; nextState: BattleState } {
  const events: GameEvent[] = [];

  // 1. Resolve poison before any other start-of-turn effects.
  let s = produce(state, (draft) => {
    const unitIds = draft.units
      .filter((unit) => unit.owner === player)
      .map((unit) => unit.id);

    for (const unitId of unitIds) {
      const unit = draft.units.find((candidate) => candidate.id === unitId);
      if (!unit) continue;

      const poisonStacks = unit.status.poisonStacks;
      if (poisonStacks <= 0) continue;

      const hpBefore = unit.hp;
      unit.hp -= poisonStacks;
      const hpAfter = unit.hp;
      events.push({
        type: 'UNIT_DAMAGED',
        payload: { unitId: unit.id, damage: poisonStacks, hpBefore, hpAfter },
      });

      if (unit.hp <= 0) {
        const killedId = unit.id;
        draft.units = draft.units.filter((candidate) => candidate.id !== killedId);
        events.push({ type: 'UNIT_KILLED', payload: { unitId: killedId } });
        continue;
      }

      const stacksBefore = poisonStacks;
      const stacksAfter = Math.max(0, poisonStacks - BALANCE.status.poison.decayPerTurn);
      unit.status.poisonStacks = stacksAfter;
      if (stacksBefore !== stacksAfter) {
        events.push({
          type: 'UNIT_POISON_CHANGED',
          payload: {
            unitId: unit.id,
            stacksBefore,
            stacksAfter,
            reason: 'turn_tick',
          },
        });
      }
    }
  });

  // 2. Reduce cooldowns for surviving units of the active player.
  s = produce(s, (draft) => {
    for (const unit of draft.units) {
      if (unit.owner !== player) continue;
      for (const [abilityId, remaining] of Object.entries(unit.cooldowns)) {
        const next = Math.max(0, remaining - 1);
        if (next === 0) {
          delete unit.cooldowns[abilityId];
        } else {
          unit.cooldowns[abilityId] = next;
        }
      }
    }
  });

  // 3. Clear unit flags for current player.
  s = produce(s, (draft) => {
    for (const unit of draft.units) {
      if (unit.owner !== player) continue;
      unit.hasMoved = false;
      unit.hasActed = false;
      unit.spawnedThisTurn = false;
    }
  });

  // 4. Gold income: base + resource points owned by current player.
  const income = computePlayerIncome(s, player);
  if (income !== 0) {
    s = produce(s, (draft) => {
      draft.players[player].gold += income;
      events.push({
        type: 'GOLD_CHANGED',
        payload: {
          player,
          delta: income,
          newAmount: draft.players[player].gold,
          reason: 'base_income',
        },
      });
    });
  }

  // 5. Execute pending recruit.
  const recruitResult = executePendingRecruit(s, player);
  s = recruitResult.nextState;
  events.push(...recruitResult.events);

  // 6. Pay upkeep after recruits spawn so new units are billed immediately.
  const upkeep = computePlayerUpkeep(s, player);
  if (upkeep > 0) {
    s = produce(s, (draft) => {
      const payable = Math.min(draft.players[player].gold, upkeep);
      draft.players[player].gold -= payable;
      events.push({
        type: 'GOLD_CHANGED',
        payload: {
          player,
          delta: -payable,
          newAmount: draft.players[player].gold,
          reason: 'unit_upkeep',
        },
      });
    });
  }

  // 7. Refresh turn deadline and increment turn number.
  s = produce(s, (draft) => {
    draft.turnDeadline = nowMs + BALANCE.match.turnTimeSeconds * 1000;
    draft.turnNumber += 1;
    draft.currentPlayer = player;
  });

  events.unshift({
    type: 'TURN_BEGAN',
    payload: {
      currentPlayer: player,
      turnNumber: s.turnNumber,
      goldA: s.players['A'].gold,
      goldB: s.players['B'].gold,
      turnDeadline: s.turnDeadline,
    },
  });

  return { events, nextState: s };
}
