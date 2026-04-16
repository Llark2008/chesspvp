import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, type BattleState, type GameEvent, type RecruitSource } from '@chesspvp/shared';
import { BattleController } from './BattleController';
import { useBattleStore } from '../store/battleStore';

type BattleControllerInternals = {
  drainAnimationQueue(): Promise<void>;
  isPlaying: boolean;
};
type BattleStoreRecruitState = ReturnType<typeof useBattleStore.getState> & {
  recruitSource: RecruitSource | null;
};

function makeState(): BattleState {
  const state = createInitialState('battle-controller', 'mvp_default', 'userA', 'userB', 0);
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
      cooldowns: {},
      status: { poisonStacks: 0 },
    },
    {
      id: 'u_a_warrior',
      owner: 'A',
      type: 'warrior',
      position: { x: 5, y: 6 },
      hp: 12,
      hasMoved: false,
      hasActed: true,
      spawnedThisTurn: false,
      cooldowns: {},
      status: { poisonStacks: 0 },
    },
  ];
  return state;
}

function makeController() {
  const board = {
    renderMap: vi.fn(),
    setCamera: vi.fn(),
    clearHighlights: vi.fn(),
    highlightTiles: vi.fn(),
  };
  const fog = {
    render: vi.fn(),
  };
  const units = {
    syncWithState: vi.fn(),
    animateMove: vi.fn().mockResolvedValue(undefined),
    animateAttack: vi.fn().mockResolvedValue(undefined),
    animateHeal: vi.fn().mockResolvedValue(undefined),
    animateDamage: vi.fn().mockResolvedValue(undefined),
    animateDeath: vi.fn().mockResolvedValue(undefined),
  };
  const fx = {
    showHealFlash: vi.fn().mockResolvedValue(undefined),
    showHealNumber: vi.fn().mockResolvedValue(undefined),
    showDamageNumber: vi.fn().mockResolvedValue(undefined),
    showPoisonPulse: vi.fn().mockResolvedValue(undefined),
    showResourceCapturePulse: vi.fn().mockResolvedValue(undefined),
    showTurnBanner: vi.fn().mockResolvedValue(undefined),
  };
  const input = {
    onTileClick: undefined as ((pos: { x: number; y: number }) => void) | undefined,
    unbind: vi.fn(),
  };

  const controller = new BattleController(
    board as never,
    fog as never,
    units as never,
    fx as never,
    input as never,
  );

  return { controller, board, fog, units, fx, input };
}

afterEach(() => {
  useBattleStore.getState().destroy();
  vi.restoreAllMocks();
});

describe('BattleController regressions', () => {
  it('clicking an enemy in idle mode inspects it without selecting it for actions', () => {
    const state = createInitialState('battle-controller-enemy-inspect', 'mvp_default', 'userA', 'userB', 0);
    const enemy = state.units.find((unit) => unit.owner === 'B')!;

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.setState({ inspectedUnitId: null } as never);

    const { controller } = makeController();
    const handleTileClick = (controller as unknown as {
      handleTileClick(pos: { x: number; y: number }): void;
    }).handleTileClick.bind(controller);

    handleTileClick(enemy.position);

    expect(useBattleStore.getState().selectedUnitId).toBeNull();
    expect((useBattleStore.getState() as { inspectedUnitId: string | null }).inspectedUnitId).toBe(enemy.id);
  });

  it('clicking a non-attackable enemy while one of my units is selected switches to inspect mode', () => {
    const state = createInitialState('battle-controller-switch-inspect', 'mvp_default', 'userA', 'userB', 0);
    state.units = [
      {
        id: 'u_a_warrior',
        owner: 'A',
        type: 'warrior',
        position: { x: 1, y: 1 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
      {
        id: 'u_b_archer',
        owner: 'B',
        type: 'archer',
        position: { x: 6, y: 6 },
        hp: 18,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
    ];

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.setState({ inspectedUnitId: null } as never);
    useBattleStore.getState().selectUnit('u_a_warrior');

    const { controller } = makeController();
    const handleTileClick = (controller as unknown as {
      handleTileClick(pos: { x: number; y: number }): void;
    }).handleTileClick.bind(controller);

    handleTileClick({ x: 6, y: 6 });

    expect(useBattleStore.getState().selectedUnitId).toBeNull();
    expect((useBattleStore.getState() as { inspectedUnitId: string | null }).inspectedUnitId).toBe('u_b_archer');
    expect(useBattleStore.getState().phase).toBe('idle');
  });

  it('continues draining heal events and resyncs state when heal flash fails', async () => {
    const state = makeState();
    useBattleStore.getState().initFromState(state, 'A');

    const { controller, units, fog, fx } = makeController();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fx.showHealFlash.mockRejectedValueOnce(new Error('heal flash failed'));

    const events: GameEvent[] = [
      {
        type: 'UNIT_ABILITY_USED',
        payload: {
          unitId: 'u_a_priest',
          abilityId: 'heal',
          targetId: 'u_a_warrior',
        },
      },
      {
        type: 'UNIT_HEALED',
        payload: {
          unitId: 'u_a_warrior',
          amount: 4,
          hpBefore: 8,
          hpAfter: 12,
        },
      },
    ];

    useBattleStore.setState({ pendingEvents: events });

    const internalController = controller as unknown as BattleControllerInternals;

    await expect(internalController.drainAnimationQueue()).resolves.toBeUndefined();

    expect(useBattleStore.getState().pendingEvents).toEqual([]);
    expect(internalController.isPlaying).toBe(false);
    expect(units.animateHeal).toHaveBeenCalledWith('u_a_warrior', 12);
    expect(units.syncWithState).toHaveBeenCalledWith(useBattleStore.getState().engine?.state);
    expect(fog.render).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('syncs unit layer when snapshot changes without pending events', () => {
    const state = makeState();
    useBattleStore.getState().initFromState(state, 'A');

    const { controller, units } = makeController();
    controller.bind();

    expect(units.syncWithState).toHaveBeenCalledTimes(1);

    const snapshot = structuredClone(state);
    snapshot.units[1] = {
      ...snapshot.units[1],
      hp: 9,
      position: { x: 6, y: 6 },
    };

    useBattleStore.getState().applyStateSnapshot(snapshot);

    expect(units.syncWithState).toHaveBeenCalledTimes(2);
    expect(units.syncWithState).toHaveBeenLastCalledWith(useBattleStore.getState().engine?.state);

    controller.unbind();
  });

  it('plays a resource capture pulse when a resource point changes owner', async () => {
    const state = makeState();
    useBattleStore.getState().initFromState(state, 'A');

    const { controller, fx } = makeController();
    const internalController = controller as unknown as BattleControllerInternals;
    useBattleStore.setState({
      pendingEvents: [
        {
          type: 'RESOURCE_POINT_CAPTURED',
          payload: {
            position: { x: 3, y: 5 },
            newOwner: 'A',
            previousOwner: null,
          },
        },
      ],
    });

    await expect(internalController.drainAnimationQueue()).resolves.toBeUndefined();

    expect((fx as { showResourceCapturePulse?: unknown }).showResourceCapturePulse).toHaveBeenCalledWith(
      { x: 3, y: 5 },
      'A',
    );
  });

  it('clicking an owned outpost opens the recruit panel for that outpost', () => {
    const state = createInitialState('battle-controller-outpost-click', 'mvp_default', 'userA', 'userB', 0);
    state.currentPlayer = 'A';
    state.tiles[5]![5] = {
      ...state.tiles[5]![5]!,
      type: 'outpost',
      outpostOwner: 'A',
    };

    useBattleStore.getState().initFromState(state, 'A');

    const { controller } = makeController();
    const handleTileClick = (controller as unknown as {
      handleTileClick(pos: { x: number; y: number }): void;
    }).handleTileClick.bind(controller);

    handleTileClick({ x: 5, y: 5 });

    expect(useBattleStore.getState().phase).toBe('recruiting');
    expect((useBattleStore.getState() as BattleStoreRecruitState).recruitSource).toEqual({
      kind: 'outpost',
      position: { x: 5, y: 5 },
    });
  });

  it('clicking an occupied owned outpost keeps unit selection instead of opening recruit panel', () => {
    const state = createInitialState('battle-controller-occupied-outpost-click', 'mvp_default', 'userA', 'userB', 0);
    state.currentPlayer = 'A';
    state.tiles[5]![5] = {
      ...state.tiles[5]![5]!,
      type: 'outpost',
      outpostOwner: 'A',
    };
    state.units = [
      {
        id: 'u_a_guard',
        owner: 'A',
        type: 'warrior',
        position: { x: 5, y: 5 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
    ];

    useBattleStore.getState().initFromState(state, 'A');

    const { controller } = makeController();
    const handleTileClick = (controller as unknown as {
      handleTileClick(pos: { x: number; y: number }): void;
    }).handleTileClick.bind(controller);

    handleTileClick({ x: 5, y: 5 });

    expect(useBattleStore.getState().phase).toBe('unit_selected');
    expect(useBattleStore.getState().selectedUnitId).toBe('u_a_guard');
    expect((useBattleStore.getState() as BattleStoreRecruitState).recruitSource).toBeNull();
  });

  it('plays an outpost capture pulse when an outpost changes owner', async () => {
    const state = makeState();
    useBattleStore.getState().initFromState(state, 'A');

    const { controller, fx } = makeController();
    const internalController = controller as unknown as BattleControllerInternals;
    useBattleStore.setState({
      pendingEvents: [
        {
          type: 'OUTPOST_CAPTURED',
          payload: {
            position: { x: 12, y: 20 },
            newOwner: 'A',
            previousOwner: null,
          },
        },
      ],
    });

    await expect(internalController.drainAnimationQueue()).resolves.toBeUndefined();

    expect((fx as { showResourceCapturePulse?: unknown }).showResourceCapturePulse).toHaveBeenCalledWith(
      { x: 12, y: 20 },
      'A',
    );
  });

  it('在毒爆模式下点击空地高亮格会以 targetPos 释放技能', () => {
    const state = createInitialState('battle-controller-poison-burst', 'mvp_default', 'userA', 'userB', 0);
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
        id: 'u_b_warrior',
        owner: 'B',
        type: 'warrior',
        position: { x: 7, y: 8 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      } as never,
    ];
    state.currentPlayer = 'A';

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.getState().selectUnit('u_a_poisoner');
    useBattleStore.getState().setActionMode('ability:poison_burst');

    const requestAbility = vi.fn();
    useBattleStore.setState({ requestAbility } as never);

    const { controller } = makeController();
    const handleTileClick = (controller as unknown as {
      handleTileClick(pos: { x: number; y: number }): void;
    }).handleTileClick.bind(controller);

    handleTileClick({ x: 5, y: 8 });

    expect(requestAbility).toHaveBeenCalledWith('poison_burst', undefined, { x: 5, y: 8 });
  });
});
