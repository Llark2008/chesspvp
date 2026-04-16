import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../src/engine/BattleEngine';
import { createInitialState } from '../src/engine/initialState';
import type { Action } from '../src/types/action';
import type { PlayerSide } from '../src/types/battle';
import { deepClone } from '../src/engine/utils';

describe('replay', () => {
  it('20个动作回放：finalState 与原 engine state 严格相等', () => {
    const initial = createInitialState('replay-test', 'mvp_default', 'userA', 'userB', 1000);
    initial.units.find((u) => u.owner === 'A' && u.type === 'warrior')!.hp = 10;
    initial.units.push({
      id: 'u_a_priest',
      owner: 'A',
      type: 'priest' as never,
      position: { x: 5, y: 4 },
      hp: 16,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
    });
    const initialCopy = deepClone(initial);

    const eng = new BattleEngine(initial);
    const actionLog: Array<{ action: Action; actorSide: PlayerSide; nowMs?: number }> = [];

    function doAction(action: Action, side: PlayerSide) {
      try {
        eng.apply(action, side, 0);
        actionLog.push({ action, actorSide: side, nowMs: 0 });
        return true;
      } catch {
        return false;
      }
    }

    // Round 1: A does several actions then ends turn
    const unitA_warrior = eng.state.units.find((u) => u.owner === 'A' && u.type === 'warrior')!;
    const unitA_knight = eng.state.units.find((u) => u.owner === 'A' && u.type === 'knight')!;

    doAction({ type: 'MOVE', payload: { unitId: unitA_warrior.id, to: { x: 4, y: 2 } } }, 'A');
    doAction({ type: 'MOVE', payload: { unitId: unitA_knight.id, to: { x: 6, y: 2 } } }, 'A');
    doAction({ type: 'END_TURN', payload: {} }, 'A');

    // Round 1: B ends turn
    const unitB_warrior = eng.state.units.find((u) => u.owner === 'B' && u.type === 'warrior')!;
    doAction({ type: 'MOVE', payload: { unitId: unitB_warrior.id, to: { x: 7, y: 9 } } }, 'B');
    doAction({ type: 'END_TURN', payload: {} }, 'B');

    // Round 2: A
    const unitA_archer = eng.state.units.find((u) => u.owner === 'A' && u.type === 'archer')!;
    doAction({ type: 'MOVE', payload: { unitId: unitA_warrior.id, to: { x: 4, y: 3 } } }, 'A');
    doAction({ type: 'MOVE', payload: { unitId: unitA_archer.id, to: { x: 5, y: 3 } } }, 'A');
    doAction({ type: 'MOVE', payload: { unitId: unitA_knight.id, to: { x: 6, y: 3 } } }, 'A');
    doAction({ type: 'END_TURN', payload: {} }, 'A');

    // Round 2: B
    const unitB_archer = eng.state.units.find((u) => u.owner === 'B' && u.type === 'archer')!;
    const unitB_knight = eng.state.units.find((u) => u.owner === 'B' && u.type === 'knight')!;
    doAction({ type: 'MOVE', payload: { unitId: unitB_warrior.id, to: { x: 7, y: 8 } } }, 'B');
    doAction({ type: 'MOVE', payload: { unitId: unitB_archer.id, to: { x: 6, y: 8 } } }, 'B');
    doAction({ type: 'MOVE', payload: { unitId: unitB_knight.id, to: { x: 5, y: 8 } } }, 'B');
    doAction({ type: 'END_TURN', payload: {} }, 'B');

    // Round 3: A recruit
    doAction(
      {
        type: 'RECRUIT',
        payload: {
          unitType: 'mage',
          source: { kind: 'base', position: { x: 5, y: 0 } },
          spawnAt: { x: 4, y: 0 },
        },
      },
      'A'
    );
    doAction({ type: 'MOVE', payload: { unitId: unitA_warrior.id, to: { x: 4, y: 4 } } }, 'A');
    doAction({ type: 'MOVE', payload: { unitId: unitA_knight.id, to: { x: 6, y: 4 } } }, 'A');
    doAction({ type: 'END_TURN', payload: {} }, 'A');

    // Round 3: B
    doAction({ type: 'MOVE', payload: { unitId: unitB_warrior.id, to: { x: 7, y: 7 } } }, 'B');
    doAction({ type: 'END_TURN', payload: {} }, 'B');

    // A round 4: ability then end
    doAction(
      {
        type: 'USE_ABILITY',
        payload: { unitId: 'u_a_priest', abilityId: 'heal', targetId: unitA_warrior.id },
      } as Action,
      'A'
    );
    doAction({ type: 'END_TURN', payload: {} }, 'A');

    expect(actionLog.length).toBeGreaterThanOrEqual(20);

    // Replay
    const { finalState } = BattleEngine.replay(initialCopy, actionLog);

    // Compare
    expect(JSON.stringify(finalState)).toBe(JSON.stringify(eng.state));
  });
});
