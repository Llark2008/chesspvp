import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../src/engine/BattleEngine';
import { createInitialState } from '../src/engine/initialState';
import { deepClone } from '../src/engine/utils';

describe('victory', () => {
  it('基地HP≤0 → 触发 base_destroyed', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    // 把 B 基地 HP 设为 1
    s.bases.find((b) => b.owner === 'B')!.hp = 1;
    // 把 A warrior 移到可攻击基地的位置 (6,11) 相邻格
    s.units.find((u) => u.owner === 'A' && u.type === 'warrior')!.position = { x: 6, y: 10 };
    // 清空 B 单位（避免阻挡）
    s.units = s.units.filter((u) => u.owner === 'A');
    const eng = new BattleEngine(s);
    const { events } = eng.apply(
      { type: 'ATTACK', payload: { unitId: s.units.find((u) => u.owner === 'A' && u.type === 'warrior')!.id, targetPos: { x: 6, y: 11 } } },
      'A'
    );
    const matchEnded = events.find((e) => e.type === 'MATCH_ENDED');
    expect(matchEnded).toBeDefined();
    if (matchEnded?.type === 'MATCH_ENDED') {
      expect(matchEnded.payload.winner).toBe('A');
      expect(matchEnded.payload.reason).toBe('base_destroyed');
    }
    expect(eng.state.winner).toBe('A');
  });

  it('投降 → 触发 surrender', () => {
    const eng = new BattleEngine(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    const { events } = eng.apply({ type: 'SURRENDER', payload: {} }, 'A');
    const matchEnded = events.find((e) => e.type === 'MATCH_ENDED');
    expect(matchEnded).toBeDefined();
    if (matchEnded?.type === 'MATCH_ENDED') {
      expect(matchEnded.payload.winner).toBe('B');
      expect(matchEnded.payload.reason).toBe('surrender');
    }
  });

  it('备用时间耗尽 → checkVictory 可检测 timeout', () => {
    const s = deepClone(createInitialState('test', 'mvp_default', 'userA', 'userB', 0));
    s.players['A'].reserveTimeMs = 0;
    s.winner = 'B';
    s.endReason = 'timeout';
    const eng = new BattleEngine(s);
    const v = eng.checkVictory();
    expect(v).not.toBeNull();
    expect(v?.winner).toBe('B');
    expect(v?.reason).toBe('timeout');
  });
});
