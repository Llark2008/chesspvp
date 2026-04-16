import { describe, expect, it } from 'vitest';
import { createInitialState, type Unit } from '@chesspvp/shared';
import { getUnitActionButtons } from './UnitActionPanel';
import { getUnitDefenseSummary, getUnitStatusTexts } from './UnitInfoCard';

describe('battle panels', () => {
  it('UnitActionPanel 会将冷却中的毒爆按钮显示为禁用并带剩余回合文案', () => {
    const unit: Unit = {
      id: 'u_a_poisoner',
      owner: 'A',
      type: 'poisoner',
      position: { x: 5, y: 5 },
      hp: 15,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
      cooldowns: { poison_burst: 2 },
      status: { poisonStacks: 0 },
    };

    const buttons = getUnitActionButtons(unit, 'attack');
    const poisonBurstButton = buttons.find((button) => button.mode === 'ability:poison_burst');

    expect(poisonBurstButton?.label).toBe('毒爆（冷却 2）');
    expect(poisonBurstButton?.disabled).toBe(true);
  });

  it('UnitInfoCard 会显示单位的中毒层数与毒爆冷却', () => {
    const unit: Unit = {
      id: 'u_a_poisoner',
      owner: 'A',
      type: 'poisoner',
      position: { x: 5, y: 5 },
      hp: 15,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
      cooldowns: { poison_burst: 2 },
      status: { poisonStacks: 3 },
    };

    const statusTexts = getUnitStatusTexts(unit);

    expect(statusTexts.poisonText).toBe('中毒：3/5');
    expect(statusTexts.poisonBurstCooldownText).toBe('毒爆冷却：2');
  });

  it('UnitInfoCard 会计算前哨站提供的防御加成', () => {
    const state = createInitialState('client-unit-defense', 'mvp_default', 'userA', 'userB', 0);
    state.tiles[5]![5] = {
      ...state.tiles[5]![5]!,
      type: 'outpost',
      outpostOwner: 'A',
    };

    const unit: Unit = {
      id: 'u_a_warrior',
      owner: 'A',
      type: 'warrior',
      position: { x: 5, y: 5 },
      hp: 20,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
      cooldowns: {},
      status: { poisonStacks: 0 },
    };

    const defenseSummary = getUnitDefenseSummary(state, unit);

    expect(defenseSummary.effectiveDefense).toBe(7);
    expect(defenseSummary.outpostDefenseBonusText).toBe('前哨掩护 +2');
  });
});
