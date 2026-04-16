import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../src/engine/BattleEngine';
import { createInitialState } from '../src/engine/initialState';
import { deepClone } from '../src/engine/utils';
import { BALANCE } from '../src/configs';

const BASE_SOURCE_A = { kind: 'base', position: { x: 5, y: 0 } } as const;

function makeEngine() {
  return new BattleEngine(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
}

describe('recruit', () => {
  it('下单成功 → 金币扣除、pendingRecruits设置', () => {
    const engine = makeEngine();
    // 先给 A 足够金币
    const s = deepClone(engine.state as ReturnType<typeof createInitialState>);
    s.players['A'].gold = 20;
    const eng2 = new BattleEngine(s);
    // warrior cost=6, spawnAt 是基地(5,0)的相邻格(4,0)
    const { state } = eng2.apply(
      { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
      'A'
    );
    expect(state.players['A'].gold).toBe(14); // 20-6
    expect(state.players['A'].pendingRecruits).toHaveLength(1);
    expect(state.players['A'].pendingRecruits[0]?.unitType).toBe('warrior');
  });

  it('金币不足 → 拒绝', () => {
    const engine = makeEngine();
    // 初始金币5，knight cost=12
    expect(() => {
      engine.apply(
        { type: 'RECRUIT', payload: { unitType: 'knight', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
        'A'
      );
    }).toThrow();
  });

  it('人口已满 → 拒绝', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 100;
    // 填满人口到当前上限
    for (let i = s.units.filter(u => u.owner === 'A').length; i < BALANCE.unit.populationCap; i++) {
      s.units.push({
        id: `u_a_fill_${i}`,
        owner: 'A',
        type: 'warrior',
        position: { x: i, y: 3 },
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      });
    }
    const eng = new BattleEngine(s);
    expect(() => {
      eng.apply(
        { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
        'A'
      );
    }).toThrow();
  });

  it('接近上限但未满时，仍可下最后一个招募单', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 100;
    for (let i = s.units.filter((u) => u.owner === 'A').length; i < BALANCE.unit.populationCap - 1; i++) {
      s.units.push({
        id: `u_a_almost_full_${i}`,
        owner: 'A',
        type: 'warrior',
        position: { x: i % 8, y: 4 + Math.floor(i / 8) },
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      });
    }

    const eng = new BattleEngine(s);
    expect(() => {
      eng.apply(
        { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
        'A'
      );
    }).not.toThrow();
  });

  it('重复下单同一回合 → 拒绝', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 100;
    const eng = new BattleEngine(s);
    eng.apply(
      { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
      'A'
    );
    expect(() => {
      eng.apply(
        { type: 'RECRUIT', payload: { unitType: 'archer', source: BASE_SOURCE_A, spawnAt: { x: 6, y: 0 } } },
        'A'
      );
    }).toThrow();
  });

  it('spawnAt 非邻格 → 拒绝', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 100;
    const eng = new BattleEngine(s);
    // 基地在(5,0), 非邻格(0,0)
    expect(() => {
      eng.apply(
        { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 0, y: 0 } } },
        'A'
      );
    }).toThrow();
  });

  it('执行阶段: 目标格空 → 生成单位', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 20;
    const eng = new BattleEngine(s);
    // 下单
    eng.apply(
      { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
      'A'
    );
    // 结束回合，触发 beginTurn for B
    eng.apply({ type: 'END_TURN', payload: {} }, 'A');
    // 结束B回合，触发 beginTurn for A → pendingRecruits 执行
    eng.apply({ type: 'END_TURN', payload: {} }, 'B');
    const newUnit = eng.state.units.find(
      (u) => u.owner === 'A' && u.position.x === 4 && u.position.y === 0
    );
    expect(newUnit).toBeDefined();
    expect(newUnit?.spawnedThisTurn).toBe(true);
  });

  it('招募完成产生的事件批必须可 structuredClone', () => {
    const s = deepClone(createInitialState('recruit-serializable', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 20;
    const eng = new BattleEngine(s);

    eng.apply(
      { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
      'A'
    );
    eng.apply({ type: 'END_TURN', payload: {} }, 'A');
    const { events } = eng.apply({ type: 'END_TURN', payload: {} }, 'B');

    expect(events.some((event) => event.type === 'UNIT_RECRUITED')).toBe(true);
    expect(() => structuredClone(events)).not.toThrow();
  });

  it('新招募单位当回合可以像普通单位一样立刻攻击', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 20;
    s.units.push({
      id: 'u_b_target',
      owner: 'B',
      type: 'warrior',
      position: { x: 4, y: 1 },
      hp: 20,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
    });

    const eng = new BattleEngine(s);
    eng.apply(
      { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
      'A'
    );
    eng.apply({ type: 'END_TURN', payload: {} }, 'A');
    eng.apply({ type: 'END_TURN', payload: {} }, 'B');

    const newUnit = eng.state.units.find(
      (u) => u.owner === 'A' && u.position.x === 4 && u.position.y === 0
    );
    expect(newUnit?.spawnedThisTurn).toBe(true);

    expect(() => {
      eng.apply(
        { type: 'ATTACK', payload: { unitId: newUnit!.id, targetId: 'u_b_target' } },
        'A'
      );
    }).not.toThrow();

    expect(eng.state.units.find((u) => u.id === newUnit!.id)?.hasActed).toBe(true);
    expect(eng.state.units.find((u) => u.id === 'u_b_target')?.hp).toBeLessThan(20);
  });

  it('执行阶段: 目标格被占且无其它邻格空 → 退钱', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].gold = 20;
    // 占满基地(5,0)所有4邻格
    const neighbors = [
      { x: 4, y: 0 },
      { x: 6, y: 0 },
      { x: 5, y: 1 },
    ];
    let idx = 100;
    for (const n of neighbors) {
      s.units.push({
        id: `u_blocker_${idx++}`,
        owner: 'B',
        type: 'warrior',
        position: n,
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      });
    }
    const eng = new BattleEngine(s);
    eng.apply(
      { type: 'RECRUIT', payload: { unitType: 'warrior', source: BASE_SOURCE_A, spawnAt: { x: 4, y: 0 } } },
      'A'
    );
    const goldAfterOrder = eng.state.players['A'].gold;
    // End turn to trigger spawn
    eng.apply({ type: 'END_TURN', payload: {} }, 'A');
    eng.apply({ type: 'END_TURN', payload: {} }, 'B');
    // 招募失败退钱后，仍需支付当前场上 3 个初始单位的维护费 3
    expect(eng.state.players['A'].gold).toBe(goldAfterOrder + 6 + 6 - 3);
  });
});
