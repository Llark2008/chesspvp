import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, DEFAULT_BATTLE_MAP_ID, type RecruitSource } from '@chesspvp/shared';
import { getContextualRecruitSource, useBattleStore } from './battleStore';

type BattleStoreSnapshot = ReturnType<typeof useBattleStore.getState>;
type BattleStoreRecruitState = BattleStoreSnapshot & {
  openRecruitPanel: (source?: RecruitSource) => void;
  recruitSource: RecruitSource | null;
};

afterEach(() => {
  useBattleStore.getState().destroy();
});

describe('battleStore action modes', () => {
  it('uses the new default map size when initializing the default battlefield camera', () => {
    const state = createInitialState('client-default-map-size', DEFAULT_BATTLE_MAP_ID, 'userA', 'userB', 0);

    useBattleStore.getState().initFromState(state, 'A');

    expect(useBattleStore.getState().camera).toMatchObject({
      worldWidthPx: 30 * 64,
      worldHeightPx: 30 * 64,
    });
  });

  it('initializes the battle camera at 100% zoom', () => {
    const state = createInitialState('client-default-zoom', 'frontier_40', 'userA', 'userB', 0);

    useBattleStore.getState().initFromState(state, 'A');

    expect(useBattleStore.getState().camera).toMatchObject({
      zoom: 1,
      viewportWidthPx: 768,
      viewportHeightPx: 768,
    });
  });

  it('zooms in, zooms out, resets, and preserves zoom across snapshots', () => {
    const state = createInitialState('client-zoom-actions', 'frontier_40', 'userA', 'userB', 0);

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.getState().zoomIn({ x: 0.5, y: 0.5 });
    useBattleStore.getState().zoomIn({ x: 0.5, y: 0.5 });

    expect(useBattleStore.getState().camera).toMatchObject({
      zoom: 1.25,
      viewportWidthPx: 614.4,
      viewportHeightPx: 614.4,
    });

    const snapshot = structuredClone(state);
    useBattleStore.getState().applyStateSnapshot(snapshot);
    expect(useBattleStore.getState().camera?.zoom).toBe(1.25);

    useBattleStore.getState().zoomOut({ x: 0.5, y: 0.5 });
    expect(useBattleStore.getState().camera?.zoom).toBe(1.125);

    useBattleStore.getState().resetZoom();
    expect(useBattleStore.getState().camera).toMatchObject({
      zoom: 1,
      viewportWidthPx: 768,
      viewportHeightPx: 768,
    });

    useBattleStore.getState().zoomIn({ x: 0.5, y: 0.5 });
    useBattleStore.getState().destroy();
    useBattleStore.getState().initFromState(state, 'A');
    expect(useBattleStore.getState().camera?.zoom).toBe(1);
  });

  it('选中己方单位时会同步更新查看中的单位卡目标', () => {
    const state = createInitialState('client-inspect-own', 'mvp_default', 'userA', 'userB', 0);

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.setState({ inspectedUnitId: null } as never);
    useBattleStore.getState().selectUnit(state.units[0]!.id);

    expect((useBattleStore.getState() as BattleStoreSnapshot & { inspectedUnitId: string | null }).inspectedUnitId)
      .toBe(state.units[0]!.id);
  });

  it('快照同步后会清除已经不可见或不存在的查看目标', () => {
    const state = createInitialState('client-inspect-clear', 'mvp_default', 'userA', 'userB', 0);
    const enemyId = state.units.find((unit) => unit.owner === 'B')!.id;

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.setState({ inspectedUnitId: enemyId } as never);

    const snapshot = structuredClone(state);
    snapshot.units = snapshot.units.filter((unit) => unit.id !== enemyId);
    useBattleStore.getState().applyStateSnapshot(snapshot);

    expect((useBattleStore.getState() as BattleStoreSnapshot & { inspectedUnitId: string | null }).inspectedUnitId)
      .toBeNull();
  });

  it('牧师可以切换到治疗模式并高亮受伤友军', () => {
    const state = createInitialState('client-priest', 'mvp_default', 'userA', 'userB', 0);
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
        position: { x: 5, y: 7 },
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
    ];

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.getState().selectUnit('u_a_priest');
    (useBattleStore.getState() as BattleStoreSnapshot & {
      setActionMode: (mode: 'attack' | 'ability:heal') => void;
      abilityTargets: Array<{ x: number; y: number }>;
    }).setActionMode('ability:heal');

    expect(
      (useBattleStore.getState() as BattleStoreSnapshot & {
        actionMode: string | null;
        abilityTargets: Array<{ x: number; y: number }>;
      }).actionMode
    ).toBe('ability:heal');
    expect(
      (useBattleStore.getState() as BattleStoreSnapshot & {
        abilityTargets: Array<{ x: number; y: number }>;
      }).abilityTargets
    ).toContainEqual({ x: 5, y: 7 });
  });

  it('炮手选中后，普通攻击模式会高亮可炮击空地', () => {
    const state = createInitialState('client-gunner', 'mvp_default', 'userA', 'userB', 0);
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
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
    ];

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.getState().selectUnit('u_a_gunner');

    expect(useBattleStore.getState().attackableTargets).toContainEqual({ x: 5, y: 8 });
  });

  it('牧师治疗会更新状态并产生治疗事件', () => {
    const state = createInitialState('client-priest-heal', 'mvp_default', 'userA', 'userB', 0);
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
        position: { x: 5, y: 7 },
        hp: 10,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
    ];

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.getState().selectUnit('u_a_priest');
    (useBattleStore.getState() as BattleStoreSnapshot & {
      setActionMode: (mode: 'attack' | 'ability:heal') => void;
    }).setActionMode('ability:heal');
    useBattleStore.getState().requestAbility('heal', 'u_a_warrior');

    const currentState = useBattleStore.getState();
    const healedUnit = currentState.engine?.state.units.find((unit) => unit.id === 'u_a_warrior');
    const priest = currentState.engine?.state.units.find((unit) => unit.id === 'u_a_priest');

    expect(healedUnit?.hp).toBe(15);
    expect(priest?.hasActed).toBe(true);
    expect(currentState.phase).toBe('idle');
    expect(currentState.pendingEvents.some((event) => event.type === 'UNIT_ABILITY_USED')).toBe(true);
    expect(currentState.pendingEvents.some((event) => event.type === 'UNIT_HEALED')).toBe(true);
  });

  it('刚招募单位在 spawnedThisTurn 状态下仍可被选中并获得行动目标', () => {
    const state = createInitialState('client-spawned-unit', 'mvp_default', 'userA', 'userB', 0);
    state.currentPlayer = 'A';
    state.units = [
      {
        id: 'u_a_spawned',
        owner: 'A',
        type: 'warrior',
        position: { x: 4, y: 0 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: true,
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
      {
        id: 'u_b_target',
        owner: 'B',
        type: 'warrior',
        position: { x: 4, y: 1 },
        hp: 20,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        cooldowns: {},
        status: { poisonStacks: 0 },
      },
    ];

    useBattleStore.getState().initFromState(state, 'A');
    useBattleStore.getState().selectUnit('u_a_spawned');

    expect(useBattleStore.getState().movableTiles.length).toBeGreaterThan(0);
    expect(useBattleStore.getState().attackableTargets).toContainEqual({ x: 4, y: 1 });
  });

  it('为大地图初始化相机并支持跳转与边界钳制', () => {
    const state = createInitialState('client-large-map', 'frontier_40', 'userA', 'userB', 0);

    useBattleStore.getState().initFromState(state, 'B');

    const { camera, jumpCameraToTile, moveCamera } = useBattleStore.getState();
    expect(camera).not.toBeNull();
    expect(camera?.worldWidthPx).toBe(40 * 64);
    expect(camera?.worldHeightPx).toBe(40 * 64);
    expect(camera?.offsetX).toBeGreaterThan(0);

    jumpCameraToTile({ x: 0, y: 0 });
    expect(useBattleStore.getState().camera).toMatchObject({ offsetX: 0, offsetY: 0 });

    moveCamera(100_000, 100_000);
    expect(useBattleStore.getState().camera).toMatchObject({
      offsetX: 40 * 64 - 768,
      offsetY: 40 * 64 - 768,
    });
  });

  it('从前哨站下招募单时会保留正确来源，并允许与基地各下一单', () => {
    const state = createInitialState('client-outpost-recruit', 'mvp_default', 'userA', 'userB', 0);
    state.currentPlayer = 'A';
    state.players.A.gold = 100;
    state.units = [];
    state.tiles[5]![5] = {
      ...state.tiles[5]![5]!,
      type: 'outpost',
      outpostOwner: 'A',
    };

    useBattleStore.getState().initFromState(state, 'A');

    const store = useBattleStore.getState() as BattleStoreRecruitState;
    store.openRecruitPanel({ kind: 'outpost', position: { x: 5, y: 5 } });
    expect((useBattleStore.getState() as BattleStoreRecruitState).recruitSource).toEqual({
      kind: 'outpost',
      position: { x: 5, y: 5 },
    });
    useBattleStore.getState().requestRecruit('archer', { x: 5, y: 5 });

    (useBattleStore.getState() as BattleStoreRecruitState).openRecruitPanel();
    useBattleStore.getState().requestRecruit('warrior', { x: 4, y: 0 });

    const pendingRecruits = useBattleStore.getState().engine?.state.players.A.pendingRecruits ?? [];
    expect(pendingRecruits).toHaveLength(2);
    expect(pendingRecruits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unitType: 'archer',
          source: { kind: 'outpost', position: { x: 5, y: 5 } },
        }),
        expect.objectContaining({
          unitType: 'warrior',
          source: { kind: 'base', position: { x: 5, y: 0 } },
        }),
      ]),
    );
  });

  it('选中的己方前哨站驻军会让 openRecruitPanel 默认使用该前哨站', () => {
    const state = createInitialState('client-outpost-selected-context', 'mvp_default', 'userA', 'userB', 0);
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
    useBattleStore.getState().selectUnit('u_a_guard');
    (useBattleStore.getState() as BattleStoreRecruitState).openRecruitPanel();

    expect((useBattleStore.getState() as BattleStoreRecruitState).recruitSource).toEqual({
      kind: 'outpost',
      position: { x: 5, y: 5 },
    });
  });

  it('查看中的己方前哨站驻军也会让默认招募来源切到前哨站', () => {
    const state = createInitialState('client-outpost-inspected-context', 'mvp_default', 'userA', 'userB', 0);
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
    useBattleStore.getState().inspectUnit('u_a_guard');

    expect(
      getContextualRecruitSource(
        useBattleStore.getState().engine!.state,
        'A',
        useBattleStore.getState().selectedUnitId,
        useBattleStore.getState().inspectedUnitId,
      ),
    ).toEqual({
      kind: 'outpost',
      position: { x: 5, y: 5 },
    });
  });
});
