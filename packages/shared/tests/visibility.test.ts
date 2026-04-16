import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/initialState';
import { BattleEngine } from '../src/engine/BattleEngine';
import {
  computeVisibleTiles,
  filterStateForPlayer,
  filterEventsForPlayer,
  isTileVisible,
} from '../src/engine/visibility';
import { deepClone } from '../src/engine/utils';
import type { BattleState } from '../src/types/battle';
import type { GameEvent } from '../src/types/event';

function getState(): BattleState {
  return createInitialState('test', 'mvp_default', 'userA', 'userB', 0);
}

describe('computeVisibleTiles', () => {
  it('A 方单位位置本身始终可见', () => {
    const state = getState();
    const visible = computeVisibleTiles(state, 'A');
    for (const unit of state.units.filter((u) => u.owner === 'A')) {
      expect(visible.has(`${unit.position.x},${unit.position.y}`)).toBe(true);
    }
  });

  it('A 方基地位置可见', () => {
    const state = getState();
    const visible = computeVisibleTiles(state, 'A');
    const baseA = state.bases.find((b) => b.owner === 'A')!;
    expect(visible.has(`${baseA.position.x},${baseA.position.y}`)).toBe(true);
  });

  it('视野范围不超过 sight + 单位曼哈顿距离', () => {
    const state = getState();
    const visible = computeVisibleTiles(state, 'A');
    // 距离 warrior 超过 2 的格子，可能被其他单位/基地覆盖，但 (4,8) 应该不可见
    // (4,8) 到 warrior(4,1) 距离=7，到 archer(5,1) 距离=8，到 knight(6,1) 距离=9，到 base(5,0) 距离=9
    expect(isTileVisible(visible, { x: 4, y: 8 })).toBe(false);
  });

  it('资源点占领后提供视野', () => {
    const state = deepClone(getState()) as BattleState;
    // 地图资源点在 (3,5) 和 (8,6)，将 (3,5) 的 owner 设为 A
    state.tiles[5]![3]!.resourceOwner = 'A';
    const visible = computeVisibleTiles(state, 'A');
    // 资源点本身可见
    expect(visible.has('3,5')).toBe(true);
    // sight=2：(3,7) 距离 (3,5) =2，应可见
    expect(visible.has('3,7')).toBe(true);
    // (3,8) 距离 (3,5) =3，不在资源点视野，也不在其他 A 单位视野
    // warrior(4,1)距离=7, archer(5,1)距离=7, knight(6,1)=7, base(5,0)=8
    expect(visible.has('3,8')).toBe(false);
  });

  it('移动后立即占领的资源点会立刻进入视野计算', () => {
    const state = deepClone(getState()) as BattleState;
    state.units = [
      {
        id: 'u_a_warrior',
        owner: 'A',
        type: 'warrior',
        position: { x: 3, y: 4 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
    ];

    const engine = new BattleEngine(state);
    engine.apply(
      { type: 'MOVE', payload: { unitId: 'u_a_warrior', to: { x: 3, y: 5 } } },
      'A',
    );

    const postMoveState = deepClone(engine.state) as BattleState;
    postMoveState.units = [];

    const visible = computeVisibleTiles(postMoveState, 'A');
    expect(visible.has('3,7')).toBe(true);
  });

  it('B 方视野与 A 方独立', () => {
    const state = getState();
    const visibleA = computeVisibleTiles(state, 'A');
    const visibleB = computeVisibleTiles(state, 'B');
    // A 基地附近可见但 B 基地附近 B 可见
    const baseA = state.bases.find((b) => b.owner === 'A')!;
    const baseB = state.bases.find((b) => b.owner === 'B')!;
    expect(visibleA.has(`${baseA.position.x},${baseA.position.y}`)).toBe(true);
    expect(visibleB.has(`${baseB.position.x},${baseB.position.y}`)).toBe(true);
    // 双方视野不完全相同（地图 12x12，各自在两端）
    expect(visibleA.size).toBeGreaterThan(0);
    expect(visibleB.size).toBeGreaterThan(0);
  });
});

describe('filterStateForPlayer', () => {
  it('己方单位全部保留', () => {
    const state = getState();
    const filtered = filterStateForPlayer(state, 'A');
    const myUnits = filtered.units.filter((u) => u.owner === 'A');
    const originalMyUnits = state.units.filter((u) => u.owner === 'A');
    expect(myUnits.length).toBe(originalMyUnits.length);
  });

  it('迷雾中的敌方单位被删除', () => {
    const state = getState();
    // B 方单位在 y=10 附近，A 方视野无法到达，应该被过滤
    const visible = computeVisibleTiles(state, 'A');
    const bUnitsInFog = state.units.filter(
      (u) => u.owner === 'B' && !visible.has(`${u.position.x},${u.position.y}`),
    );
    const filtered = filterStateForPlayer(state, 'A');
    for (const u of bUnitsInFog) {
      expect(filtered.units.find((fu) => fu.id === u.id)).toBeUndefined();
    }
  });

  it('对手金币被置零', () => {
    const state = deepClone(getState()) as BattleState;
    state.players['B'].gold = 99;
    const filtered = filterStateForPlayer(state, 'A');
    expect(filtered.players['B'].gold).toBe(0);
  });

  it('对手待招募被置空', () => {
    const state = deepClone(getState()) as BattleState;
    state.players['B'].pendingRecruits = [{
      unitType: 'warrior',
      source: { kind: 'base', position: { x: 6, y: 11 } },
      spawnAt: { x: 6, y: 10 },
      orderedTurn: 1,
    }];
    const filtered = filterStateForPlayer(state, 'A');
    expect(filtered.players['B'].pendingRecruits).toEqual([]);
  });

  it('fog 字段中 perspective 和 visibleTiles 正确', () => {
    const state = getState();
    const filtered = filterStateForPlayer(state, 'A');
    expect(filtered.fog).toBeDefined();
    expect(filtered.fog!.perspective).toBe('A');
    expect(filtered.fog!.visibleTiles.length).toBeGreaterThan(0);
  });

  it('己方金币不变', () => {
    const state = deepClone(getState()) as BattleState;
    state.players['A'].gold = 42;
    const filtered = filterStateForPlayer(state, 'A');
    expect(filtered.players['A'].gold).toBe(42);
  });
});

describe('filterEventsForPlayer', () => {
  function makeMoveEvent(unitId: string, from: { x: number; y: number }, to: { x: number; y: number }): GameEvent {
    return { type: 'UNIT_MOVED', payload: { unitId, from, to } };
  }

  it('己方单位移动事件始终可见', () => {
    const state = getState();
    const myUnit = state.units.find((u) => u.owner === 'A')!;
    const ev = makeMoveEvent(myUnit.id, myUnit.position, { x: myUnit.position.x + 1, y: myUnit.position.y });
    const result = filterEventsForPlayer([ev], 'A', state, state);
    expect(result.length).toBe(1);
  });

  it('迷雾中的敌方移动事件被过滤', () => {
    const state = getState();
    // B 的单位在 (7,10)，A 的视野无法到达
    const bWarrior = state.units.find((u) => u.owner === 'B' && u.type === 'warrior')!;
    const from = bWarrior.position;
    const to = { x: from.x, y: from.y - 1 };
    const visible = computeVisibleTiles(state, 'A');
    // 确认这两格确实不在 A 视野
    if (!visible.has(`${from.x},${from.y}`) && !visible.has(`${to.x},${to.y}`)) {
      const ev = makeMoveEvent(bWarrior.id, from, to);
      const result = filterEventsForPlayer([ev], 'A', state, state);
      expect(result.length).toBe(0);
    }
  });

  it('GOLD_CHANGED 只发给对应玩家', () => {
    const state = getState();
    const evA: GameEvent = { type: 'GOLD_CHANGED', payload: { player: 'A', delta: 5, newAmount: 10, reason: 'base_income' } };
    const evB: GameEvent = { type: 'GOLD_CHANGED', payload: { player: 'B', delta: -4, newAmount: 6, reason: 'unit_upkeep' } };
    const resultA = filterEventsForPlayer([evA, evB], 'A', state, state);
    expect(resultA.length).toBe(1);
    expect((resultA[0] as typeof evA).payload.player).toBe('A');
  });

  it('TURN_BEGAN / MATCH_ENDED 双方都可见', () => {
    const state = getState();
    const evTurn: GameEvent = { type: 'TURN_BEGAN', payload: { currentPlayer: 'A', turnNumber: 1, goldA: 5, goldB: 5, turnDeadline: 0 } };
    const evEnd: GameEvent = { type: 'MATCH_ENDED', payload: { winner: 'A', reason: 'base_destroyed' } };
    expect(filterEventsForPlayer([evTurn], 'A', state, state).length).toBe(1);
    expect(filterEventsForPlayer([evTurn], 'B', state, state).length).toBe(1);
    expect(filterEventsForPlayer([evEnd], 'A', state, state).length).toBe(1);
    expect(filterEventsForPlayer([evEnd], 'B', state, state).length).toBe(1);
  });

  it('UNIT_RECRUIT_ORDERED 只发给下令者', () => {
    const state = getState();
    const evA: GameEvent = {
      type: 'UNIT_RECRUIT_ORDERED',
      payload: {
        player: 'A',
        unitType: 'warrior',
        source: { kind: 'base', position: { x: 5, y: 0 } },
        spawnAt: { x: 4, y: 0 },
      },
    };
    expect(filterEventsForPlayer([evA], 'A', state, state).length).toBe(1);
    expect(filterEventsForPlayer([evA], 'B', state, state).length).toBe(0);
  });

  it('牧师治疗事件只向施法者和当前可见目标广播', () => {
    const state = deepClone(getState()) as BattleState;
    state.units = [
      {
        id: 'u_a_priest',
        owner: 'A',
        type: 'priest' as never,
        position: { x: 5, y: 5 },
        hp: 16,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_a_warrior',
        owner: 'A',
        type: 'warrior',
        position: { x: 5, y: 6 },
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 10, y: 10 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
    ];
    const evUse = {
      type: 'UNIT_ABILITY_USED',
      payload: { unitId: 'u_a_priest', abilityId: 'heal', targetId: 'u_a_warrior' },
    } as GameEvent;
    const evHeal = {
      type: 'UNIT_HEALED',
      payload: { unitId: 'u_a_warrior', amount: 8, hpBefore: 10, hpAfter: 18 },
    } as GameEvent;

    expect(filterEventsForPlayer([evUse, evHeal], 'A', state, state)).toHaveLength(2);
    expect(filterEventsForPlayer([evUse, evHeal], 'B', state, state)).toHaveLength(0);
  });

  it('中毒层变化事件按与受伤事件相同的可见性规则过滤', () => {
    const state = deepClone(getState()) as BattleState;
    state.units = [
      {
        id: 'u_a_poisoner',
        owner: 'A',
        type: 'poisoner' as never,
        position: { x: 5, y: 5 },
        hp: 15,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      } as never,
      {
        id: 'u_b_visible',
        owner: 'B',
        type: 'warrior',
        position: { x: 5, y: 7 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 1 },
      } as never,
      {
        id: 'u_b_hidden',
        owner: 'B',
        type: 'warrior',
        position: { x: 10, y: 10 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 1 },
      } as never,
    ];

    const visibleEvent = {
      type: 'UNIT_POISON_CHANGED',
      payload: { unitId: 'u_b_visible', stacksBefore: 1, stacksAfter: 2, reason: 'attack' },
    } as GameEvent;
    const hiddenEvent = {
      type: 'UNIT_POISON_CHANGED',
      payload: { unitId: 'u_b_hidden', stacksBefore: 1, stacksAfter: 2, reason: 'attack' },
    } as GameEvent;

    expect(filterEventsForPlayer([visibleEvent], 'A', state, state)).toHaveLength(1);
    expect(filterEventsForPlayer([hiddenEvent], 'A', state, state)).toHaveLength(0);
    expect(filterEventsForPlayer([visibleEvent, hiddenEvent], 'B', state, state)).toHaveLength(2);
  });
});
