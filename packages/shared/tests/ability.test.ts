import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src/engine/BattleEngine';
import { createInitialState } from '../src/engine/initialState';
import { deepClone } from '../src/engine/utils';

describe('abilities', () => {
  it('牧师可以治疗射程内受伤友军，并结束行动', () => {
    const state = deepClone(createInitialState('ability-heal', 'mvp_default', 'userA', 'userB', 0));
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
        position: { x: 5, y: 7 },
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 8, y: 8 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
    ];

    const engine = new BattleEngine(state);

    const { events } = engine.apply(
      {
        type: 'USE_ABILITY',
        payload: {
          unitId: 'u_a_priest',
          abilityId: 'heal',
          targetId: 'u_a_warrior',
        },
      } as never,
      'A'
    );

    expect(events.some((event) => event.type === 'UNIT_ABILITY_USED')).toBe(true);
    expect(events.some((event) => event.type === 'UNIT_HEALED')).toBe(true);
    expect(engine.state.units.find((unit) => unit.id === 'u_a_warrior')?.hp).toBe(15);
    expect(engine.state.units.find((unit) => unit.id === 'u_a_priest')?.hasActed).toBe(true);
  });

  it('牧师治疗产生的事件批必须可 structuredClone', () => {
    const state = deepClone(createInitialState('ability-heal-serializable', 'mvp_default', 'userA', 'userB', 0));
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
        position: { x: 5, y: 7 },
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
    ];

    const engine = new BattleEngine(state);
    const { events } = engine.apply(
      {
        type: 'USE_ABILITY',
        payload: {
          unitId: 'u_a_priest',
          abilityId: 'heal',
          targetId: 'u_a_warrior',
        },
      } as never,
      'A'
    );

    expect(() => structuredClone(events)).not.toThrow();
  });

  it('炮手普通攻击可以轰空地，并对范围内敌军分别结算中心与溅射伤害', () => {
    const state = deepClone(createInitialState('ability-gunner', 'mvp_default', 'userA', 'userB', 0));
    state.units = [
      {
        id: 'u_a_gunner',
        owner: 'A',
        type: 'gunner' as never,
        position: { x: 5, y: 5 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_b_center',
        owner: 'B',
        type: 'warrior',
        position: { x: 5, y: 8 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_b_splash',
        owner: 'B',
        type: 'archer',
        position: { x: 6, y: 8 },
        hp: 18,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_a_safe',
        owner: 'A',
        type: 'warrior',
        position: { x: 4, y: 8 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
    ];

    const engine = new BattleEngine(state);

    const { events } = engine.apply(
      {
        type: 'ATTACK',
        payload: {
          unitId: 'u_a_gunner',
          targetPos: { x: 5, y: 8 },
        },
      } as never,
      'A'
    );

    expect(events.filter((event) => event.type === 'UNIT_DAMAGED')).toHaveLength(2);
    expect(engine.state.units.find((unit) => unit.id === 'u_b_center')?.hp).toBe(12);
    expect(engine.state.units.find((unit) => unit.id === 'u_b_splash')?.hp).toBe(13);
    expect(engine.state.units.find((unit) => unit.id === 'u_a_safe')?.hp).toBe(20);
  });

  it('毒师普通攻击命中敌方单位后附加 1 层中毒，但攻击基地不会施毒', () => {
    const state = deepClone(createInitialState('ability-poison-attack', 'mvp_default', 'userA', 'userB', 0));
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
      } as never,
      {
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 5, y: 7 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
    ];

    const engine = new BattleEngine(state);
    const { events } = engine.apply(
      {
        type: 'ATTACK',
        payload: {
          unitId: 'u_a_poisoner',
          targetId: 'u_b_warrior',
        },
      } as never,
      'A',
    );

    expect(events.some((event) => event.type === 'UNIT_POISON_CHANGED')).toBe(true);
    expect((engine.state.units.find((unit) => unit.id === 'u_b_warrior') as never as {
      status: { poisonStacks: number };
    }).status.poisonStacks).toBe(1);

    const baseState = deepClone(state);
    baseState.bases.find((base) => base.owner === 'B')!.position = { x: 5, y: 7 };
    baseState.units = [baseState.units[0]!];
    const baseEngine = new BattleEngine(baseState);
    const { events: baseEvents } = baseEngine.apply(
      {
        type: 'ATTACK',
        payload: {
          unitId: 'u_a_poisoner',
          targetPos: { x: 5, y: 7 },
        },
      } as never,
      'A',
    );

    expect(baseEvents.some((event) => event.type === 'UNIT_POISON_CHANGED')).toBe(false);
  });

  it('毒爆可以指定空地中心，对曼哈顿距离 2 内的敌方单位附加 2 层中毒并进入 2 回合冷却', () => {
    const state = deepClone(createInitialState('ability-poison-burst', 'mvp_default', 'userA', 'userB', 0));
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
      } as never,
      {
        id: 'u_b_center',
        owner: 'B',
        type: 'warrior',
        position: { x: 5, y: 8 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
      {
        id: 'u_b_edge',
        owner: 'B',
        type: 'archer',
        position: { x: 7, y: 8 },
        hp: 18,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
      {
        id: 'u_b_far',
        owner: 'B',
        type: 'mage',
        position: { x: 8, y: 8 },
        hp: 17,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
      {
        id: 'u_a_safe',
        owner: 'A',
        type: 'warrior',
        position: { x: 4, y: 8 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
    ];

    const engine = new BattleEngine(state);

    expect(engine.getAbilityTargets('u_a_poisoner', 'poison_burst')).toContainEqual({ x: 5, y: 8 });

    const { events } = engine.apply(
      {
        type: 'USE_ABILITY',
        payload: {
          unitId: 'u_a_poisoner',
          abilityId: 'poison_burst',
          targetPos: { x: 5, y: 8 },
        },
      } as never,
      'A',
    );

    expect(events.filter((event) => event.type === 'UNIT_POISON_CHANGED')).toHaveLength(2);
    expect((engine.state.units.find((unit) => unit.id === 'u_b_center') as never as {
      status: { poisonStacks: number };
    }).status.poisonStacks).toBe(2);
    expect((engine.state.units.find((unit) => unit.id === 'u_b_edge') as never as {
      status: { poisonStacks: number };
    }).status.poisonStacks).toBe(2);
    expect((engine.state.units.find((unit) => unit.id === 'u_b_far') as never as {
      status: { poisonStacks: number };
    }).status.poisonStacks).toBe(0);
    expect((engine.state.units.find((unit) => unit.id === 'u_a_safe') as never as {
      status: { poisonStacks: number };
    }).status.poisonStacks).toBe(0);
    expect((engine.state.units.find((unit) => unit.id === 'u_a_poisoner') as never as {
      cooldowns: Record<string, number>;
    }).cooldowns.poison_burst).toBe(2);
  });

  it('中毒在受害方回合开始时先结算伤害与层数衰减，且技能冷却只在施法者自己的回合开始时递减', () => {
    const state = deepClone(createInitialState('ability-poison-turn-begin', 'mvp_default', 'userA', 'userB', 0));
    state.currentPlayer = 'A';
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
        cooldowns: { poison_burst: 2 },
        status: { poisonStacks: 0 },
      } as never,
      {
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 3, y: 5 },
        hp: 3,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 2 },
      } as never,
    ];
    state.tiles[5]![3]!.resourceOwner = null;

    const engine = new BattleEngine(state);
    const { events: beginBEvents } = engine.apply({ type: 'END_TURN', payload: {} }, 'A', 0);

    expect(beginBEvents.some((event) => event.type === 'UNIT_DAMAGED')).toBe(true);
    expect(beginBEvents.some((event) => event.type === 'UNIT_POISON_CHANGED')).toBe(true);
    expect(engine.state.units.find((unit) => unit.id === 'u_b_warrior')?.hp).toBe(1);
    expect((engine.state.units.find((unit) => unit.id === 'u_b_warrior') as never as {
      status: { poisonStacks: number };
    }).status.poisonStacks).toBe(1);
    expect((engine.state.units.find((unit) => unit.id === 'u_a_poisoner') as never as {
      cooldowns: Record<string, number>;
    }).cooldowns.poison_burst).toBe(2);

    engine.apply({ type: 'END_TURN', payload: {} }, 'B', 0);
    expect((engine.state.units.find((unit) => unit.id === 'u_a_poisoner') as never as {
      cooldowns: Record<string, number>;
    }).cooldowns.poison_burst).toBe(1);

    engine.apply({ type: 'END_TURN', payload: {} }, 'A', 0);
    engine.apply({ type: 'END_TURN', payload: {} }, 'B', 0);
    expect((engine.state.units.find((unit) => unit.id === 'u_a_poisoner') as never as {
      cooldowns: Record<string, number>;
    }).cooldowns.poison_burst ?? 0).toBe(0);
  });

  it('被中毒击杀的单位会在资源点等后续回合开始结算前移除', () => {
    const state = deepClone(createInitialState('ability-poison-kill-order', 'mvp_default', 'userA', 'userB', 0));
    state.currentPlayer = 'A';
    state.units = [
      {
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 3, y: 5 },
        hp: 2,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 2 },
      } as never,
    ];
    state.tiles[5]![3]!.resourceOwner = null;

    const engine = new BattleEngine(state);
    const { events } = engine.apply({ type: 'END_TURN', payload: {} }, 'A', 0);

    expect(events.some((event) => event.type === 'UNIT_DAMAGED')).toBe(true);
    expect(events.some((event) => event.type === 'UNIT_KILLED')).toBe(true);
    expect(events.some((event) => event.type === 'UNIT_POISON_CHANGED')).toBe(false);
    expect(engine.state.units.find((unit) => unit.id === 'u_b_warrior')).toBeUndefined();
    expect(engine.state.tiles[5]![3]!.resourceOwner).toBeNull();
  });
});
