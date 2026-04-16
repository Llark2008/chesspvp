import { create } from 'zustand';
import {
  BattleEngine,
  createInitialState,
  InvalidActionError,
} from '@chesspvp/shared';
import type {
  BattleState,
  PlayerSide,
  Position,
  RecruitSource,
  UnitType,
  GameEvent,
  Unit,
} from '@chesspvp/shared';
import {
  type BattleCamera,
  clampCamera as clampBattleCamera,
  createBattleCamera,
  jumpCameraToTile as centerCameraOnTile,
  moveCamera as moveBattleCamera,
  resizeBattleCamera,
  setCameraZoom,
} from '../battle/camera';
import {
  BATTLE_DEFAULT_ZOOM,
  BATTLE_MAX_ZOOM,
  BATTLE_MIN_ZOOM,
  BATTLE_VIEWPORT_HEIGHT_PX,
  BATTLE_VIEWPORT_WIDTH_PX,
  BATTLE_ZOOM_STEP,
  TILE_SIZE,
} from '../battle/constants';

export type BattlePhase =
  | 'idle'
  | 'unit_selected'
  | 'attacking'
  | 'recruiting'
  | 'waiting_server'
  | 'ended';

export type BattleActionMode = 'attack' | `ability:${string}`;
type ZoomAnchor = { x: number; y: number };

// Set to true when BattlePage initialises (socket mode)
let _socketMode = false;

export function setBattleSocketMode(v: boolean) {
  _socketMode = v;
}

export function isBattleSocketMode() {
  return _socketMode;
}

interface BattleStoreState {
  engine: BattleEngine | null;
  matchId: string | null;
  mySide: PlayerSide | null;
  camera: BattleCamera | null;

  selectedUnitId: string | null;
  inspectedUnitId: string | null;
  movableTiles: Position[];
  attackableTargets: Position[];
  abilityTargets: Position[];
  actionMode: BattleActionMode | null;
  phase: BattlePhase;
  recruitSource: RecruitSource | null;

  pendingEvents: GameEvent[];

  winner: PlayerSide | null;
  endReason: string | null;

  init: (
    matchId: string,
    mapId: string,
    playerAId: string,
    playerBId: string,
    mySide: PlayerSide,
    nowMs?: number,
  ) => void;
  initFromState: (state: BattleState, mySide: PlayerSide) => void;
  destroy: () => void;
  moveCamera: (dx: number, dy: number) => void;
  jumpCameraToTile: (pos: Position) => void;
  clampCamera: () => void;
  zoomIn: (anchor?: ZoomAnchor) => void;
  zoomOut: (anchor?: ZoomAnchor) => void;
  resetZoom: () => void;

  selectUnit: (id: string) => void;
  inspectUnit: (id: string) => void;
  clearInspection: () => void;
  setActionMode: (mode: BattleActionMode | null) => void;
  clearActionMode: () => void;
  cancelSelection: () => void;
  requestMove: (to: Position) => void;
  requestAttack: (targetId?: string, targetPos?: Position) => void;
  requestAbility: (abilityId: string, targetId?: string, targetPos?: Position) => void;
  openRecruitPanel: (source?: RecruitSource) => void;
  requestRecruit: (unitType: UnitType, spawnAt: Position) => void;
  requestEndTurn: (nowMs?: number) => void;
  requestSurrender: () => void;

  applyServerEvents: (events: GameEvent[]) => void;
  applyStateSnapshot: (state: BattleState) => void;
  consumeEvent: () => void;
}

type AckResult = { ok: boolean };

function sendSocketAction(
  type: string,
  payload: Record<string, unknown>,
): Promise<AckResult> {
  return import('../api/socket').then(({ getSocket }) => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = socket as any;
    return new Promise<AckResult>((resolve) => {
      s.emit(type, payload, (ack: AckResult) => resolve(ack));
    });
  });
}

function findUnit(state: BattleState, unitId: string): Unit | null {
  return state.units.find((unit) => unit.id === unitId) ?? null;
}

function buildSelectionState(
  engine: BattleEngine,
  unitId: string,
  requestedMode?: BattleActionMode | null,
) {
  const unit = findUnit(engine.state, unitId);
  if (!unit) {
    return {
      selectedUnitId: null,
      inspectedUnitId: null,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
      phase: 'idle' as BattlePhase,
    };
  }

  const canAct = !unit.hasActed;
  if (!canAct) {
    return {
      selectedUnitId: unitId,
      inspectedUnitId: unitId,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
      phase: 'unit_selected' as BattlePhase,
    };
  }

  const actionMode = requestedMode ?? 'attack';
  const movableTiles = !unit.hasMoved ? engine.getMovableTiles(unitId) : [];

  if (actionMode === 'attack') {
    return {
      selectedUnitId: unitId,
      inspectedUnitId: unitId,
      movableTiles,
      attackableTargets: engine.getAttackableTargets(unitId),
      abilityTargets: [],
      actionMode,
      phase: 'unit_selected' as BattlePhase,
    };
  }

  const abilityId = actionMode.slice('ability:'.length);
  return {
    selectedUnitId: unitId,
    inspectedUnitId: unitId,
    movableTiles,
    attackableTargets: [],
    abilityTargets: engine.getAbilityTargets(unitId, abilityId),
    actionMode,
    phase: 'unit_selected' as BattlePhase,
  };
}

function getWorldPixelSize(state: BattleState) {
  return {
    worldWidthPx: (state.tiles[0]?.length ?? 0) * TILE_SIZE,
    worldHeightPx: state.tiles.length * TILE_SIZE,
  };
}

function createCameraForState(state: BattleState, mySide: PlayerSide | null): BattleCamera {
  const camera = createBattleCamera({
    viewportWidthPx: BATTLE_VIEWPORT_WIDTH_PX,
    viewportHeightPx: BATTLE_VIEWPORT_HEIGHT_PX,
    ...getWorldPixelSize(state),
  });
  const focusBase = mySide ? state.bases.find((base) => base.owner === mySide) : null;
  return focusBase ? centerCameraOnTile(camera, focusBase.position) : camera;
}

function normalizeZoomAnchor(anchor?: ZoomAnchor): ZoomAnchor {
  return {
    x: Math.max(0, Math.min(anchor?.x ?? 0.5, 1)),
    y: Math.max(0, Math.min(anchor?.y ?? 0.5, 1)),
  };
}

function stepZoom(currentZoom: number, direction: 'in' | 'out'): number {
  const nextZoom =
    direction === 'in' ? currentZoom + BATTLE_ZOOM_STEP : currentZoom - BATTLE_ZOOM_STEP;

  return Math.max(
    BATTLE_MIN_ZOOM,
    Math.min(BATTLE_MAX_ZOOM, Number(nextZoom.toFixed(3))),
  );
}

function clonePosition(pos: Position): Position {
  return { x: pos.x, y: pos.y };
}

function cloneRecruitSource(source: RecruitSource): RecruitSource {
  return {
    kind: source.kind,
    position: clonePosition(source.position),
  };
}

function getDefaultRecruitSource(
  state: BattleState,
  side: PlayerSide,
): RecruitSource | null {
  const base = state.bases.find((candidate) => candidate.owner === side);
  if (!base) return null;
  return { kind: 'base', position: clonePosition(base.position) };
}

function isRecruitSourceValid(
  state: BattleState,
  side: PlayerSide,
  source: RecruitSource,
): boolean {
  if (source.kind === 'base') {
    const base = state.bases.find((candidate) => candidate.owner === side);
    return !!base && base.position.x === source.position.x && base.position.y === source.position.y;
  }

  const tile = state.tiles[source.position.y]?.[source.position.x];
  return tile?.type === 'outpost' && tile.outpostOwner === side;
}

function getOwnedOutpostSourceForFocusedUnit(
  state: BattleState,
  side: PlayerSide,
  unitId: string | null,
): RecruitSource | null {
  if (!unitId || state.currentPlayer !== side) return null;
  const unit = findUnit(state, unitId);
  if (!unit || unit.owner !== side) return null;

  const tile = state.tiles[unit.position.y]?.[unit.position.x];
  if (tile?.type !== 'outpost' || tile.outpostOwner !== side) return null;

  return {
    kind: 'outpost',
    position: clonePosition(tile.position),
  };
}

export function getContextualRecruitSource(
  state: BattleState,
  side: PlayerSide | null,
  selectedUnitId: string | null,
  inspectedUnitId: string | null,
): RecruitSource | null {
  if (!side) return null;

  const selectedSource = getOwnedOutpostSourceForFocusedUnit(state, side, selectedUnitId);
  if (selectedSource) return selectedSource;

  const inspectedSource = getOwnedOutpostSourceForFocusedUnit(state, side, inspectedUnitId);
  if (inspectedSource) return inspectedSource;

  return getDefaultRecruitSource(state, side);
}

function resolveRecruitSource(
  state: BattleState,
  side: PlayerSide,
  requestedSource: RecruitSource | null | undefined,
): RecruitSource | null {
  if (requestedSource && isRecruitSourceValid(state, side, requestedSource)) {
    return cloneRecruitSource(requestedSource);
  }
  return getDefaultRecruitSource(state, side);
}

export const useBattleStore = create<BattleStoreState>((set, get) => ({
  engine: null,
  matchId: null,
  mySide: null,
  camera: null,
  selectedUnitId: null,
  inspectedUnitId: null,
  movableTiles: [],
  attackableTargets: [],
  abilityTargets: [],
  actionMode: null,
  phase: 'idle',
  recruitSource: null,
  pendingEvents: [],
  winner: null,
  endReason: null,

  init(matchId, mapId, playerAId, playerBId, mySide, nowMs = Date.now()) {
    const initial = createInitialState(matchId, mapId, playerAId, playerBId, nowMs);
    const engine = new BattleEngine(initial);
    // beginTurn sets the deadline and increments turnNumber from 0 → 1
    const beginEvents = engine.beginTurn(initial.currentPlayer, nowMs);
    const camera = createCameraForState(engine.state as BattleState, mySide);
    set({
      engine,
      matchId,
      mySide,
      camera,
      phase: 'idle',
      selectedUnitId: null,
      inspectedUnitId: null,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
      pendingEvents: beginEvents,
      recruitSource: null,
      winner: null,
      endReason: null,
    });
  },

  initFromState(state, mySide) {
    const engine = new BattleEngine(state);
    const previousCamera = get().camera;
    const camera = previousCamera
      ? clampBattleCamera(resizeBattleCamera(previousCamera, getWorldPixelSize(state)))
      : createCameraForState(state, mySide);
    set({
      engine,
      matchId: state.matchId,
      mySide,
      camera,
      phase: 'idle',
      selectedUnitId: null,
      inspectedUnitId: null,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
      pendingEvents: [],
      recruitSource: null,
      winner: state.winner,
      endReason: state.endReason,
    });
  },

  destroy() {
    _socketMode = false;
    set({
      engine: null,
      matchId: null,
      mySide: null,
      camera: null,
      phase: 'idle',
      selectedUnitId: null,
      inspectedUnitId: null,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
      recruitSource: null,
      pendingEvents: [],
      winner: null,
      endReason: null,
    });
  },

  moveCamera(dx, dy) {
    const { camera } = get();
    if (!camera) return;
    set({ camera: moveBattleCamera(camera, dx, dy) });
  },

  jumpCameraToTile(pos) {
    const { camera } = get();
    if (!camera) return;
    set({ camera: centerCameraOnTile(camera, pos) });
  },

  clampCamera() {
    const { camera } = get();
    if (!camera) return;
    set({ camera: clampBattleCamera(camera) });
  },

  zoomIn(anchor) {
    const { camera } = get();
    if (!camera) return;
    const nextAnchor = normalizeZoomAnchor(anchor);
    set({
      camera: setCameraZoom(
        camera,
        stepZoom(camera.zoom, 'in'),
        nextAnchor.x,
        nextAnchor.y,
      ),
    });
  },

  zoomOut(anchor) {
    const { camera } = get();
    if (!camera) return;
    const nextAnchor = normalizeZoomAnchor(anchor);
    set({
      camera: setCameraZoom(
        camera,
        stepZoom(camera.zoom, 'out'),
        nextAnchor.x,
        nextAnchor.y,
      ),
    });
  },

  resetZoom() {
    const { camera } = get();
    if (!camera) return;
    set({
      camera: setCameraZoom(camera, BATTLE_DEFAULT_ZOOM, 0.5, 0.5),
    });
  },

  selectUnit(id) {
    const { engine, mySide, phase } = get();
    if (!engine || phase === 'ended') return;
    const unit = engine.state.units.find((u) => u.id === id);
    if (!unit || unit.owner !== mySide) return;
    set({
      ...buildSelectionState(engine, id, 'attack'),
      recruitSource: null,
    });
  },

  inspectUnit(id) {
    const { engine, phase } = get();
    if (!engine || phase === 'ended') return;
    const unit = engine.state.units.find((candidate) => candidate.id === id);
    if (!unit) return;
    set({
      selectedUnitId: null,
      inspectedUnitId: unit.id,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
      phase: 'idle',
      recruitSource: null,
    });
  },

  clearInspection() {
    set({ inspectedUnitId: null });
  },

  setActionMode(mode) {
    const { engine, selectedUnitId, phase } = get();
    if (!engine || !selectedUnitId || phase !== 'unit_selected') return;
    if (mode === null) {
      set({
        ...buildSelectionState(engine, selectedUnitId, null),
        actionMode: null,
        attackableTargets: [],
        abilityTargets: [],
        recruitSource: null,
      });
      return;
    }
    set({
      ...buildSelectionState(engine, selectedUnitId, mode),
      recruitSource: null,
    });
  },

  clearActionMode() {
    const { engine, selectedUnitId, phase } = get();
    if (!engine || !selectedUnitId || phase !== 'unit_selected') return;
    set({
      ...buildSelectionState(engine, selectedUnitId, null),
      actionMode: null,
      attackableTargets: [],
      abilityTargets: [],
      recruitSource: null,
    });
  },

  cancelSelection() {
    set({
      selectedUnitId: null,
      inspectedUnitId: null,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
      recruitSource: null,
      phase: 'idle',
    });
  },

  requestMove(to) {
    const { engine, mySide, selectedUnitId, matchId } = get();
    if (!engine || !mySide || !selectedUnitId) return;

    if (_socketMode && matchId) {
      set({ phase: 'waiting_server' });
      void sendSocketAction('ACTION_MOVE', { matchId, unitId: selectedUnitId, to }).then((ack) => {
        if (!ack.ok) set({ phase: 'unit_selected' });
        // Server events will come via EVENT_BATCH
      });
      return;
    }

    try {
      const { events } = engine.apply(
        { type: 'MOVE', payload: { unitId: selectedUnitId, to } },
        mySide,
      );
      set((s) => ({
        ...buildSelectionState(engine, selectedUnitId, 'attack'),
        recruitSource: null,
        pendingEvents: [...s.pendingEvents, ...events],
      }));
    } catch (e) {
      if (e instanceof InvalidActionError) return;
      throw e;
    }
  },

  requestAttack(targetId, targetPos) {
    const { engine, mySide, selectedUnitId, matchId } = get();
    if (!engine || !mySide || !selectedUnitId) return;

    if (_socketMode && matchId) {
      set({ phase: 'waiting_server' });
      void sendSocketAction('ACTION_ATTACK', { matchId, unitId: selectedUnitId, targetId, targetPos }).then(
        (ack) => {
          if (!ack.ok) set({ phase: 'unit_selected' });
        },
      );
      return;
    }

    try {
      const { events } = engine.apply(
        { type: 'ATTACK', payload: { unitId: selectedUnitId, targetId, targetPos } },
        mySide,
      );
      const newState = engine.state;
      set((s) => ({
        selectedUnitId: null,
        inspectedUnitId: selectedUnitId,
        movableTiles: [],
        attackableTargets: [],
        abilityTargets: [],
        actionMode: null,
        recruitSource: null,
        phase: newState.winner ? 'ended' : 'idle',
        winner: newState.winner,
        endReason: newState.endReason,
        pendingEvents: [...s.pendingEvents, ...events],
      }));
    } catch (e) {
      if (e instanceof InvalidActionError) return;
      throw e;
    }
  },

  requestAbility(abilityId, targetId, targetPos) {
    const { engine, mySide, selectedUnitId, matchId } = get();
    if (!engine || !mySide || !selectedUnitId) return;

    if (_socketMode && matchId) {
      set({ phase: 'waiting_server' });
      void sendSocketAction('ACTION_USE_ABILITY', {
        matchId,
        unitId: selectedUnitId,
        abilityId,
        targetId,
        targetPos,
      }).then((ack) => {
        if (!ack.ok) set({ phase: 'unit_selected' });
      });
      return;
    }

    try {
      const { events } = engine.apply(
        { type: 'USE_ABILITY', payload: { unitId: selectedUnitId, abilityId, targetId, targetPos } },
        mySide,
      );
      const newState = engine.state;
      set((s) => ({
        selectedUnitId: null,
        inspectedUnitId: selectedUnitId,
        movableTiles: [],
        attackableTargets: [],
        abilityTargets: [],
        actionMode: null,
        recruitSource: null,
        phase: newState.winner ? 'ended' : 'idle',
        winner: newState.winner,
        endReason: newState.endReason,
        pendingEvents: [...s.pendingEvents, ...events],
      }));
    } catch (e) {
      if (e instanceof InvalidActionError) return;
      throw e;
    }
  },

  openRecruitPanel(source) {
    const { engine, mySide, selectedUnitId, inspectedUnitId } = get();
    if (!engine || !mySide || engine.state.currentPlayer !== mySide) return;

    const requestedSource = source ?? getContextualRecruitSource(
      engine.state,
      mySide,
      selectedUnitId,
      inspectedUnitId,
    );
    const recruitSource = resolveRecruitSource(engine.state, mySide, requestedSource);
    if (!recruitSource) return;

    set({
      phase: 'recruiting',
      recruitSource,
      selectedUnitId: null,
      inspectedUnitId: null,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
    });
  },

  requestRecruit(unitType, spawnAt) {
    const { engine, mySide, matchId, recruitSource } = get();
    if (!engine || !mySide) return;

    const source = resolveRecruitSource(engine.state, mySide, recruitSource);
    if (!source) return;

    if (_socketMode && matchId) {
      void sendSocketAction('ACTION_RECRUIT', { matchId, unitType, source, spawnAt }).then((ack) => {
        if (!ack.ok) set({ phase: 'idle', recruitSource: null });
      });
      set({ phase: 'idle', recruitSource: null });
      return;
    }

    try {
      const { events } = engine.apply(
        { type: 'RECRUIT', payload: { unitType, source, spawnAt } },
        mySide,
      );
      set((s) => ({
        phase: 'idle',
        recruitSource: null,
        selectedUnitId: null,
        inspectedUnitId: null,
        movableTiles: [],
        attackableTargets: [],
        abilityTargets: [],
        actionMode: null,
        pendingEvents: [...s.pendingEvents, ...events],
      }));
    } catch (e) {
      if (e instanceof InvalidActionError) return;
      throw e;
    }
  },

  requestEndTurn(nowMs = Date.now()) {
    const { engine, mySide, matchId } = get();
    if (!engine || !mySide) return;

    if (_socketMode && matchId) {
      void sendSocketAction('ACTION_END_TURN', { matchId });
      set({
        selectedUnitId: null,
        recruitSource: null,
        movableTiles: [],
        attackableTargets: [],
        abilityTargets: [],
        actionMode: null,
        phase: 'idle',
      });
      return;
    }

    try {
      const { events } = engine.apply({ type: 'END_TURN', payload: {} }, mySide, nowMs);
      const newState = engine.state;
      set((s) => ({
        selectedUnitId: null,
        recruitSource: null,
        movableTiles: [],
        attackableTargets: [],
        abilityTargets: [],
        actionMode: null,
        phase: newState.winner ? 'ended' : 'idle',
        winner: newState.winner,
        endReason: newState.endReason,
        pendingEvents: [...s.pendingEvents, ...events],
      }));
    } catch (e) {
      if (e instanceof InvalidActionError) return;
      throw e;
    }
  },

  requestSurrender() {
    const { engine, mySide, matchId } = get();
    if (!engine || !mySide) return;

    if (_socketMode && matchId) {
      void sendSocketAction('ACTION_SURRENDER', { matchId });
      return;
    }

    const { events } = engine.apply({ type: 'SURRENDER', payload: {} }, mySide);
    const newState = engine.state;
    set((s) => ({
      phase: 'ended',
      recruitSource: null,
      winner: newState.winner,
      endReason: newState.endReason,
      pendingEvents: [...s.pendingEvents, ...events],
    }));
  },

  applyServerEvents(events) {
    set((s) => ({
      pendingEvents: [...s.pendingEvents, ...events],
    }));
  },

  applyStateSnapshot(state) {
    const { mySide, selectedUnitId, inspectedUnitId, actionMode, phase, camera } = get();
    const engine = new BattleEngine(state);
    const nextCamera = camera
      ? clampBattleCamera(
          resizeBattleCamera(camera, getWorldPixelSize(state)),
        )
      : createCameraForState(state, mySide);
    const keepSelection =
      !!selectedUnitId &&
      !!mySide &&
      phase !== 'recruiting' &&
      state.currentPlayer === mySide &&
      (() => {
        const unit = findUnit(state, selectedUnitId);
        return !!unit && unit.owner === mySide && !unit.hasActed;
      })();
    const nextInspectedUnitId =
      inspectedUnitId && findUnit(state, inspectedUnitId)
        ? inspectedUnitId
        : keepSelection
          ? selectedUnitId
          : null;
    const idleViewState = {
      phase: 'idle' as BattlePhase,
      recruitSource: null,
      selectedUnitId: null,
      inspectedUnitId: nextInspectedUnitId,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
    };
    const endedViewState = {
      phase: 'ended' as BattlePhase,
      recruitSource: null,
      selectedUnitId: null,
      inspectedUnitId: null,
      movableTiles: [],
      attackableTargets: [],
      abilityTargets: [],
      actionMode: null,
    };

    set({
      engine,
      camera: nextCamera,
      winner: state.winner,
      endReason: state.endReason,
      ...(state.winner
        ? endedViewState
        : keepSelection
          ? { ...buildSelectionState(engine, selectedUnitId!, actionMode ?? 'attack'), recruitSource: null }
          : idleViewState),
      ...(mySide ? {} : {}),
    });
  },

  consumeEvent() {
    set((s) => ({ pendingEvents: s.pendingEvents.slice(1) }));
  },
}));
