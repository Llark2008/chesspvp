import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../src/engine/BattleEngine';
import { createInitialState } from '../src/engine/initialState';
import { deepClone } from '../src/engine/utils';

describe('engine', () => {
  it('一次完整回合：移动 → 攻击 → 结束', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    // 清空 B 方单位，只留 warrior A，并将它移到 B 基地邻格
    s.units = s.units.filter((u) => u.owner === 'A' && u.type === 'warrior');
    s.units[0]!.position = { x: 5, y: 2 };
    const eng = new BattleEngine(s);

    const warriorId = eng.state.units[0]!.id;

    // Move
    const { events: moveEvents } = eng.apply(
      { type: 'MOVE', payload: { unitId: warriorId, to: { x: 5, y: 1 } } },
      'A'
    );
    expect(moveEvents.some((e) => e.type === 'UNIT_MOVED')).toBe(true);
    expect(eng.state.units[0]?.hasMoved).toBe(true);

    // Cannot move again
    expect(() =>
      eng.apply({ type: 'MOVE', payload: { unitId: warriorId, to: { x: 5, y: 2 } } }, 'A')
    ).toThrow();

    // End turn
    const { events: endEvents } = eng.apply({ type: 'END_TURN', payload: {} }, 'A');
    expect(endEvents.some((e) => e.type === 'TURN_ENDED')).toBe(true);
    expect(endEvents.some((e) => e.type === 'TURN_BEGAN')).toBe(true);
    expect(eng.state.currentPlayer).toBe('B');
  });

  it('回合切换后结算（资源点归属、产金）', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.units = [
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
    const eng = new BattleEngine(s);
    const goldBefore = eng.state.players['A'].gold;
    const warriorId = eng.state.units[0]!.id;

    const { events: moveEvents } = eng.apply(
      { type: 'MOVE', payload: { unitId: warriorId, to: { x: 3, y: 5 } } },
      'A'
    );

    expect(moveEvents.map((event) => event.type)).toEqual([
      'UNIT_MOVED',
      'RESOURCE_POINT_CAPTURED',
    ]);
    expect(eng.state.tiles[5]?.[3]?.resourceOwner).toBe('A');

    const { events: aEndEvents } = eng.apply({ type: 'END_TURN', payload: {} }, 'A');
    const { events: bEndEvents } = eng.apply({ type: 'END_TURN', payload: {} }, 'B');

    expect(aEndEvents.some((event) => event.type === 'RESOURCE_POINT_CAPTURED')).toBe(false);
    expect(bEndEvents.some((event) => event.type === 'RESOURCE_POINT_CAPTURED')).toBe(false);
    expect(eng.state.players['A'].gold).toBeGreaterThan(goldBefore);
  });

  it('移动到敌方已占领资源点时立即切换归属', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.units = [
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
    s.tiles[5]![3]!.resourceOwner = 'B';
    const eng = new BattleEngine(s);

    const { events } = eng.apply(
      { type: 'MOVE', payload: { unitId: 'u_a_warrior', to: { x: 3, y: 5 } } },
      'A'
    );

    expect(eng.state.tiles[5]?.[3]?.resourceOwner).toBe('A');
    expect(events[1]).toEqual({
      type: 'RESOURCE_POINT_CAPTURED',
      payload: {
        position: { x: 3, y: 5 },
        newOwner: 'A',
        previousOwner: 'B',
      },
    });
  });

  it('移动到普通地块不会触发资源点占领事件', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.units = [
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
    const eng = new BattleEngine(s);

    const { events } = eng.apply(
      { type: 'MOVE', payload: { unitId: 'u_a_warrior', to: { x: 4, y: 4 } } },
      'A'
    );

    expect(events.some((event) => event.type === 'RESOURCE_POINT_CAPTURED')).toBe(false);
  });

  it('非法 action 抛出 InvalidActionError', () => {
    const eng = new BattleEngine(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    // B 方在 A 方回合尝试行动
    expect(() => {
      eng.apply({ type: 'END_TURN', payload: {} }, 'B');
    }).toThrow();
  });
});
