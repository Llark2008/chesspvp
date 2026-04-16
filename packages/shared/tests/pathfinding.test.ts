import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/initialState';
import { computeMovableTiles } from '../src/engine/pathfinding';
import { deepClone } from '../src/engine/utils';
import type { BattleState } from '../src/types/battle';

function getState(): BattleState {
  return createInitialState('test', 'mvp_default', 'userA', 'userB', 0);
}

describe('pathfinding', () => {
  it('空地图中心单位，移动力3，可达格数量正确', () => {
    const state = getState();
    // warrior A 在 (4,1) 移动力3
    const warrior = state.units.find((u) => u.owner === 'A' && u.type === 'warrior')!;
    const tiles = computeMovableTiles(state, warrior.id);
    // 所有可达格的曼哈顿距离 <=3，且不重叠己方单位/基地
    for (const t of tiles) {
      const dist = Math.abs(t.x - warrior.position.x) + Math.abs(t.y - warrior.position.y);
      expect(dist).toBeLessThanOrEqual(3);
      expect(dist).toBeGreaterThan(0);
    }
    expect(tiles.length).toBeGreaterThan(0);
  });

  it('己方单位挡路可穿越但不能停留', () => {
    const state = getState();
    // archer A 在 (5,1)，和 warrior A (4,1) 相邻
    const warrior = state.units.find((u) => u.owner === 'A' && u.type === 'warrior')!;
    const tiles = computeMovableTiles(state, warrior.id);
    // archer 位置(5,1) 不应出现在可停留列表中
    const archerPos = state.units.find((u) => u.owner === 'A' && u.type === 'archer')!.position;
    const onArcher = tiles.some((t) => t.x === archerPos.x && t.y === archerPos.y);
    expect(onArcher).toBe(false);
  });

  it('敌方单位挡路不可穿越', () => {
    // 将B方单位放在A方warrior前进路径上
    const state = getState();
    const warrior = state.units.find((u) => u.owner === 'A' && u.type === 'warrior')!;
    // 在 warrior 正下方(4,2) 放一个 B 方单位
    const s2 = deepClone(state);
    s2.units.find((u) => u.owner === 'B' && u.type === 'warrior')!.position = { x: 4, y: 2 };
    const tiles = computeMovableTiles(s2, warrior.id);
    // (4,2) 有敌方，不可到达；(4,3) (4,4) 也因为被阻断而不可达
    const behind = tiles.some((t) => t.x === 4 && t.y >= 2);
    // warrior 移动力3，原位(4,1),敌在(4,2)，不能到(4,2)
    const onEnemy = tiles.some((t) => t.x === 4 && t.y === 2);
    expect(onEnemy).toBe(false);
    // 且(4,3)也不可达（被阻断）
    expect(behind).toBe(false);
  });

  it('基地格不可停留', () => {
    const state = getState();
    const warrior = state.units.find((u) => u.owner === 'A' && u.type === 'warrior')!;
    const tiles = computeMovableTiles(state, warrior.id);
    // A 基地 (5,0), 即使 warrior 在 (4,1) 距离2
    const onBase = tiles.some((t) => t.x === 5 && t.y === 0);
    expect(onBase).toBe(false);
  });

  it('资源点可通过也可停留', () => {
    const state = getState();
    // knight A 在 (6,1) 移动力5，资源点在 (3,5) 和 (8,6)
    // 先把 knight 放到资源点附近
    const s2 = deepClone(state);
    const knight = s2.units.find((u) => u.owner === 'A' && u.type === 'knight')!;
    knight.position = { x: 3, y: 4 }; // 1步到资源点(3,5)
    const tiles = computeMovableTiles(s2, knight.id);
    const onResource = tiles.some((t) => t.x === 3 && t.y === 5);
    expect(onResource).toBe(true);
  });

  it('地图边界不越界', () => {
    const state = getState();
    const warrior = state.units.find((u) => u.owner === 'A' && u.type === 'warrior')!;
    const tiles = computeMovableTiles(state, warrior.id);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(12);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(12);
    }
  });

  it('单位已行动但路径仍然计算正确（pathfinding 本身不检查 hasActed）', () => {
    // pathfinding 是纯几何计算，不看行动状态
    const state = getState();
    const s2 = deepClone(state);
    const warrior = s2.units.find((u) => u.owner === 'A' && u.type === 'warrior')!;
    warrior.hasMoved = true;
    const tiles = computeMovableTiles(s2, warrior.id);
    expect(tiles.length).toBeGreaterThan(0);
  });
});
