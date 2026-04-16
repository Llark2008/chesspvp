import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/engine/initialState';
import { BattleEngine } from '../src/engine/BattleEngine';
import { deepClone } from '../src/engine/utils';

describe('outposts', () => {
  it('frontier_40 initializes outpost tiles as neutral', () => {
    const state = createInitialState('outpost-map', 'frontier_40', 'userA', 'userB', 0);

    for (const pos of [
      { x: 12, y: 20 },
      { x: 27, y: 20 },
    ]) {
      const tile = state.tiles[pos.y]![pos.x] as never as { type: string; outpostOwner?: 'A' | 'B' | null };
      expect(tile.type).toBe('outpost');
      expect(tile.outpostOwner ?? null).toBeNull();
    }
  });

  it('moving onto a neutral outpost captures it, and enemies can flip it later', () => {
    const state = deepClone(createInitialState('outpost-capture', 'frontier_40', 'userA', 'userB', 0));
    state.currentPlayer = 'A';
    state.units = [
      {
        id: 'u_a_warrior',
        owner: 'A',
        type: 'warrior',
        position: { x: 11, y: 20 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
      {
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 26, y: 20 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
    ];

    const engine = new BattleEngine(state);

    const { events: aEvents } = engine.apply(
      { type: 'MOVE', payload: { unitId: 'u_a_warrior', to: { x: 12, y: 20 } } } as never,
      'A',
    );

    const outpostA = engine.state.tiles[20]![12] as never as { outpostOwner?: 'A' | 'B' | null };
    expect(outpostA.outpostOwner ?? null).toBe('A');
    expect(aEvents.some((event) => event.type === 'OUTPOST_CAPTURED')).toBe(true);

    const flipState = deepClone(engine.state);
    flipState.currentPlayer = 'B';
    flipState.units = [
      {
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 11, y: 20 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
    ];

    const flipEngine = new BattleEngine(flipState);
    const { events: bEvents } = flipEngine.apply(
      { type: 'MOVE', payload: { unitId: 'u_b_warrior', to: { x: 12, y: 20 } } } as never,
      'B',
    );
    const outpostB = flipEngine.state.tiles[20]![12] as never as { outpostOwner?: 'A' | 'B' | null };
    expect(outpostB.outpostOwner ?? null).toBe('B');
    expect(bEvents.some((event) => event.type === 'OUTPOST_CAPTURED')).toBe(true);
  });

  it('owned outposts add +5 income at turn start', () => {
    const state = deepClone(createInitialState('outpost-income', 'frontier_40', 'userA', 'userB', 0));
    state.units = [];
    const tile = state.tiles[20]![12] as never as { type: string; outpostOwner?: 'A' | 'B' | null };
    tile.type = 'outpost';
    tile.outpostOwner = 'A';

    const engine = new BattleEngine(state);
    engine.beginTurn('A', 0);

    expect(engine.state.players.A.gold).toBe(16);
  });

  it('outpost aura grants exactly +2 defense to allied units in range and does not stack', () => {
    const state = deepClone(createInitialState('outpost-aura', 'mvp_default', 'userA', 'userB', 0));
    state.currentPlayer = 'B';
    state.units = [
      {
        id: 'u_a_warrior',
        owner: 'A',
        type: 'warrior',
        position: { x: 5, y: 5 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
      {
        id: 'u_b_mage',
        owner: 'B',
        type: 'mage',
        position: { x: 5, y: 6 },
        hp: 17,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
      } as never,
    ];

    const centerOutpost = state.tiles[5]![5] as never as { type: string; outpostOwner?: 'A' | 'B' | null };
    centerOutpost.type = 'outpost';
    centerOutpost.outpostOwner = 'A';
    const leftOutpost = state.tiles[5]![4] as never as { type: string; outpostOwner?: 'A' | 'B' | null };
    leftOutpost.type = 'outpost';
    leftOutpost.outpostOwner = 'A';

    const engine = new BattleEngine(state);
    engine.apply(
      { type: 'ATTACK', payload: { unitId: 'u_b_mage', targetId: 'u_a_warrior' } } as never,
      'B',
    );

    expect(engine.state.units.find((unit) => unit.id === 'u_a_warrior')?.hp).toBe(13);
  });

  it('base and owned outposts can each queue one recruit order, and outpost recruits spawn on the outpost tile first', () => {
    const state = deepClone(createInitialState('outpost-recruit', 'mvp_default', 'userA', 'userB', 0));
    state.currentPlayer = 'A';
    state.players.A.gold = 100;
    state.units = [];

    const outpost = state.tiles[5]![5] as never as { type: string; outpostOwner?: 'A' | 'B' | null };
    outpost.type = 'outpost';
    outpost.outpostOwner = 'A';

    const engine = new BattleEngine(state);

    expect(() =>
      engine.apply(
        {
          type: 'RECRUIT',
          payload: {
            unitType: 'warrior',
            source: { kind: 'base', position: { x: 5, y: 0 } },
            spawnAt: { x: 4, y: 0 },
          },
        } as never,
        'A',
      ),
    ).not.toThrow();

    expect(() =>
      engine.apply(
        {
          type: 'RECRUIT',
          payload: {
            unitType: 'archer',
            source: { kind: 'outpost', position: { x: 5, y: 5 } },
            spawnAt: { x: 4, y: 5 },
          },
        } as never,
        'A',
      ),
    ).not.toThrow();

    expect(((engine.state.players.A as never as { pendingRecruits?: unknown[] }).pendingRecruits ?? []).length).toBe(2);

    engine.apply({ type: 'END_TURN', payload: {} } as never, 'A', 0);
    engine.apply({ type: 'END_TURN', payload: {} } as never, 'B', 0);

    expect(
      engine.state.units.find(
        (unit) => unit.owner === 'A' && unit.type === 'archer' && unit.position.x === 5 && unit.position.y === 5,
      ),
    ).toBeDefined();
  });

  it('cannot recruit from neutral or enemy outposts', () => {
    const state = deepClone(createInitialState('outpost-recruit-invalid', 'mvp_default', 'userA', 'userB', 0));
    state.currentPlayer = 'A';
    state.players.A.gold = 100;

    const neutralOutpost = state.tiles[5]![5] as never as { type: string; outpostOwner?: 'A' | 'B' | null };
    neutralOutpost.type = 'outpost';
    neutralOutpost.outpostOwner = null;

    const engine = new BattleEngine(state);

    expect(() =>
      engine.apply(
        {
          type: 'RECRUIT',
          payload: {
            unitType: 'warrior',
            source: { kind: 'outpost', position: { x: 5, y: 5 } },
            spawnAt: { x: 4, y: 5 },
          },
        } as never,
        'A',
      ),
    ).toThrow();

    neutralOutpost.outpostOwner = 'B';

    expect(() =>
      engine.apply(
        {
          type: 'RECRUIT',
          payload: {
            unitType: 'warrior',
            source: { kind: 'outpost', position: { x: 5, y: 5 } },
            spawnAt: { x: 4, y: 5 },
          },
        } as never,
        'A',
      ),
    ).toThrow();
  });
});
