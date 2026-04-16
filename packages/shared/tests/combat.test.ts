import { describe, it, expect } from 'vitest';
import { computeDamage, computeAttackableTargets } from '../src/engine/combat';
import { BALANCE, UNITS } from '../src/configs';
import { createInitialState } from '../src/engine/initialState';

describe('combat', () => {
  it('战士 vs 弓手（克制+1.25）: floor((8-2)*1.25) = 7', () => {
    const { damage } = computeDamage('warrior', 'archer', 8, 2, BALANCE);
    expect(damage).toBe(7);
  });

  it('战士 vs 骑士（被克制×0.8）: floor(max(1,8-4)*0.8) = 3', () => {
    const { damage } = computeDamage('warrior', 'knight', 8, 4, BALANCE);
    expect(damage).toBe(3);
  });

  it('法师 vs 基地（无克制）: max(1,14-5) = 9', () => {
    const { damage } = computeDamage('mage', 'base', 14, 5, BALANCE);
    expect(damage).toBe(9);
  });

  it('最低伤害为1', () => {
    // 超低攻击 vs 超高防御
    const { damage } = computeDamage('warrior', 'warrior', 1, 100, BALANCE);
    expect(damage).toBe(1);
  });

  it('弓手 vs 法师（克制×1.25）: floor((10-1)*1.25) = 11', () => {
    const { damage } = computeDamage('archer', 'mage', 10, 1, BALANCE);
    expect(damage).toBe(11);
  });

  it('骑士 vs 战士（克制×1.25）: floor((11-5)*1.25) = 7', () => {
    const { damage } = computeDamage('knight', 'warrior', 11, 5, BALANCE);
    expect(damage).toBe(7);
  });

  it('法师可攻击距离4的目标，但不能攻击距离5的目标', () => {
    const state = createInitialState('test', 'mvp_default', 'userA', 'userB', 0);
    state.units = [
      {
        id: 'u_a_mage',
        owner: 'A',
        type: 'mage',
        position: { x: 2, y: 2 },
        hp: UNITS.mage.hp,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_b_warrior_near',
        owner: 'B',
        type: 'warrior',
        position: { x: 2, y: 6 },
        hp: UNITS.warrior.hp,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
      {
        id: 'u_b_warrior_far',
        owner: 'B',
        type: 'warrior',
        position: { x: 2, y: 7 },
        hp: UNITS.warrior.hp,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      },
    ];

    const attackable = computeAttackableTargets(state, 'u_a_mage');
    expect(attackable).toContainEqual({ x: 2, y: 6 });
    expect(attackable).not.toContainEqual({ x: 2, y: 7 });
  });
});
