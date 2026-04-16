import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src/engine/BattleEngine';
import { computePlayerIncome, computePlayerUpkeep } from '../src/engine/economy';
import { createInitialState } from '../src/engine/initialState';
import { deepClone } from '../src/engine/utils';
import type { GameEvent } from '../src/types/event';

const BASE_SOURCE_A = { kind: 'base', position: { x: 5, y: 0 } } as const;

function beginNextTurnForA(engine: BattleEngine): GameEvent[] {
  engine.apply({ type: 'END_TURN', payload: {} }, 'A');
  const { events } = engine.apply({ type: 'END_TURN', payload: {} }, 'B');
  return events;
}

describe('economy', () => {
  it('能计算玩家当前收入与总维护费', () => {
    const state = createInitialState('economy-math', 'mvp_default', 'userA', 'userB', 0);

    expect(computePlayerIncome(state, 'A')).toBe(6);
    expect(computePlayerIncome(state, 'B')).toBe(6);
    expect(computePlayerUpkeep(state, 'A')).toBe(3);
    expect(computePlayerUpkeep(state, 'B')).toBe(3);
  });

  it('起始阵容在只有基地收入时，回合净金币为 +3', () => {
    const engine = new BattleEngine(
      createInitialState('economy-net', 'mvp_default', 'userA', 'userB', 0)
    );

    const events = beginNextTurnForA(engine);
    const upkeepEvent = events.find(
      (event): event is Extract<GameEvent, { type: 'GOLD_CHANGED' }> =>
        event.type === 'GOLD_CHANGED' && event.payload.reason === 'unit_upkeep'
    );

    expect(engine.state.players['A'].gold).toBe(8);
    expect(
      events.some(
        (event) =>
          event.type === 'GOLD_CHANGED' &&
          event.payload.player === 'A' &&
          event.payload.reason === 'base_income' &&
          event.payload.delta === 6
      )
    ).toBe(true);
    expect(upkeepEvent?.payload.delta).toBe(-3);
    expect(upkeepEvent?.payload.newAmount).toBe(8);
  });

  it('新招募单位在出生当回合立刻计入维护费', () => {
    const state = deepClone(createInitialState('economy-recruit', 'mvp_default', 'userA', 'userB', 0));
    state.players['A'].gold = 20;
    const engine = new BattleEngine(state);

    engine.apply(
      { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
      'A'
    );

    const events = beginNextTurnForA(engine);
    const upkeepEvent = events.find(
      (event): event is Extract<GameEvent, { type: 'GOLD_CHANGED' }> =>
        event.type === 'GOLD_CHANGED' && event.payload.reason === 'unit_upkeep'
    );

    expect(events.some((event) => event.type === 'UNIT_RECRUITED')).toBe(true);
    expect(engine.state.players['A'].gold).toBe(16);
    expect(upkeepEvent?.payload.delta).toBe(-4);
    expect(upkeepEvent?.payload.newAmount).toBe(16);
  });

  it('维护费不足时金币只会被扣到 0，不会进入负数', () => {
    const state = deepClone(createInitialState('economy-clamp', 'mvp_default', 'userA', 'userB', 0));
    state.players['A'].gold = 1;
    state.units = state.units.filter((unit) => unit.owner !== 'A');

    for (let index = 0; index < 12; index++) {
      state.units.push({
        id: `u_a_knight_${index}`,
        owner: 'A',
        type: 'knight',
        position: { x: index % 6, y: 2 + Math.floor(index / 6) },
        hp: 26,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      });
    }

    const engine = new BattleEngine(state);
    const events = beginNextTurnForA(engine);
    const upkeepEvent = events.find(
      (event): event is Extract<GameEvent, { type: 'GOLD_CHANGED' }> =>
        event.type === 'GOLD_CHANGED' && event.payload.reason === 'unit_upkeep'
    );

    expect(engine.state.players['A'].gold).toBe(0);
    expect(upkeepEvent?.payload.delta).toBe(-7);
    expect(upkeepEvent?.payload.newAmount).toBe(0);
  });
});
