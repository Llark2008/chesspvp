import type { Position, GameEvent, BattleState } from '@chesspvp/shared';
import { useBattleStore } from '../store/battleStore';
import type { BoardRenderer } from './BoardRenderer';
import type { FogRenderer } from './FogRenderer';
import type { UnitRenderer } from './UnitRenderer';
import type { FxRenderer } from './FxRenderer';
import type { InputController } from './InputController';

export class BattleController {
  private unsubscribes: Array<() => void> = [];
  private isPlaying = false;
  private appWidth: number;
  private appHeight: number;
  private lastStateRef: BattleState | null = null;
  private lastCameraKey = '';

  constructor(
    private board: BoardRenderer,
    private fogRenderer: FogRenderer,
    private units: UnitRenderer,
    private fx: FxRenderer,
    private input: InputController,
    appWidth = 768,
    appHeight = 768
  ) {
    this.appWidth = appWidth;
    this.appHeight = appHeight;
  }

  setViewportSize(appWidth: number, appHeight: number): void {
    this.appWidth = appWidth;
    this.appHeight = appHeight;
  }

  bind(): void {
    const store = useBattleStore.getState();
    const initialState = store.engine?.state;
    if (initialState) {
      this.lastStateRef = initialState;
      this.board.renderMap(initialState.tiles);
      if (store.camera) {
        this.board.setCamera(store.camera);
        this.lastCameraKey =
          `${store.camera.offsetX},${store.camera.offsetY},${store.camera.worldWidthPx},` +
          `${store.camera.worldHeightPx},${store.camera.viewportWidthPx},${store.camera.viewportHeightPx},${store.camera.zoom}`;
      }
      this.units.syncWithState(initialState);
      this.fogRenderer.render(
        initialState.fog?.visibleTiles ?? null,
        initialState.tiles[0]?.length ?? 0,
        initialState.tiles.length,
      );
    }

    this.unsubscribes.push(
      useBattleStore.subscribe((s) => {
        const state = s.engine?.state;
        if (state && state !== this.lastStateRef) {
          this.lastStateRef = state;
          this.board.renderMap(state.tiles);
          if (s.pendingEvents.length === 0) {
            this.syncVisualState(state);
          } else {
            // 状态快照变化时同步迷雾（fog 为 undefined 则传 null 禁用迷雾）
            this.fogRenderer.render(
              state.fog?.visibleTiles ?? null,
              state.tiles[0]?.length ?? 0,
              state.tiles.length,
            );
          }
        }

        if (s.camera) {
          const cameraKey =
            `${s.camera.offsetX},${s.camera.offsetY},${s.camera.worldWidthPx},` +
            `${s.camera.worldHeightPx},${s.camera.viewportWidthPx},${s.camera.viewportHeightPx},${s.camera.zoom}`;
          if (cameraKey !== this.lastCameraKey) {
            this.lastCameraKey = cameraKey;
            this.board.setCamera(s.camera);
          }
        }

        this.board.clearHighlights();
        if (s.movableTiles.length) this.board.highlightTiles(s.movableTiles, 'move');
        if (s.attackableTargets.length) this.board.highlightTiles(s.attackableTargets, 'attack');
        if (s.abilityTargets.length) this.board.highlightTiles(s.abilityTargets, 'ability');

        if (s.pendingEvents.length > 0) {
          void this.drainAnimationQueue();
        }
      })
    );

    this.input.onTileClick = (pos) => this.handleTileClick(pos);
    this.input.onCameraPan = (dx, dy) => useBattleStore.getState().moveCamera(dx, dy);
    this.input.onZoom = (direction, anchorNormX, anchorNormY) => {
      const anchor = { x: anchorNormX, y: anchorNormY };
      if (direction === 'in') {
        useBattleStore.getState().zoomIn(anchor);
      } else {
        useBattleStore.getState().zoomOut(anchor);
      }
    };
  }

  private handleTileClick(pos: Position): void {
    const store = useBattleStore.getState();
    const {
      engine,
      phase,
      mySide,
      movableTiles,
      attackableTargets,
      abilityTargets,
      actionMode,
    } = store;
    if (!engine || !mySide) return;
    const state = engine.state;
    const tileAtPos = state.tiles[pos.y]?.[pos.x];
    const unitAtPos = state.units.find((u) => u.position.x === pos.x && u.position.y === pos.y);
    const canOpenRecruit = state.currentPlayer === mySide;

    // Click on own base → open recruit panel
    const myBase = state.bases.find((b) => b.owner === mySide);
    if (canOpenRecruit && myBase && myBase.position.x === pos.x && myBase.position.y === pos.y) {
      store.openRecruitPanel({ kind: 'base', position: myBase.position });
      return;
    }

    if (canOpenRecruit && !unitAtPos && tileAtPos?.type === 'outpost' && tileAtPos.outpostOwner === mySide) {
      store.openRecruitPanel({ kind: 'outpost', position: pos });
      return;
    }

    if (phase === 'unit_selected') {
      if (actionMode?.startsWith('ability:')) {
        const abilityId = actionMode.slice('ability:'.length);
        const isAbilityTarget = abilityTargets.some((t) => t.x === pos.x && t.y === pos.y);
        if (isAbilityTarget) {
          if (abilityId === 'heal') {
            if (unitAtPos && unitAtPos.owner === mySide) {
              store.requestAbility(abilityId, unitAtPos.id);
              return;
            }
          } else {
            store.requestAbility(abilityId, undefined, pos);
            return;
          }
          return;
        }
      }

      if (actionMode === 'attack') {
        const isAttackable = attackableTargets.some((t) => t.x === pos.x && t.y === pos.y);
        if (isAttackable) {
          if (unitAtPos && unitAtPos.owner !== mySide) {
            store.requestAttack(unitAtPos.id);
            return;
          }
          store.requestAttack(undefined, pos);
          return;
        }
      }

      const isMovable = movableTiles.some((t) => t.x === pos.x && t.y === pos.y);
      if (isMovable && !unitAtPos) {
        store.requestMove(pos);
        return;
      }

      if (unitAtPos) {
        if (unitAtPos.owner === mySide && state.currentPlayer === mySide) {
          store.selectUnit(unitAtPos.id);
          return;
        }
        store.inspectUnit(unitAtPos.id);
        return;
      }

      store.cancelSelection();
      return;
    }

    if (phase === 'idle') {
      if (unitAtPos) {
        if (unitAtPos.owner === mySide && state.currentPlayer === mySide) {
          store.selectUnit(unitAtPos.id);
          return;
        }
        store.inspectUnit(unitAtPos.id);
        return;
      }
      store.cancelSelection();
    }
  }

  private async drainAnimationQueue(): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      while (useBattleStore.getState().pendingEvents.length > 0) {
        const ev = useBattleStore.getState().pendingEvents[0];
        if (!ev) break;

        try {
          await this.playEvent(ev);
        } catch (error) {
          console.error('Failed to play battle event animation', ev, error);
          const currentState = useBattleStore.getState().engine?.state;
          if (currentState) {
            this.syncVisualState(currentState);
          }
        } finally {
          useBattleStore.getState().consumeEvent();
        }
      }
    } finally {
      const finalState = useBattleStore.getState().engine?.state;
      if (finalState) {
        this.syncVisualState(finalState);
      }
      this.isPlaying = false;
    }
  }

  private syncVisualState(state: BattleState): void {
    this.units.syncWithState(state);
    // 动画播放完毕后刷新迷雾（单位移动后视野可能变化）
    this.fogRenderer.render(
      state.fog?.visibleTiles ?? null,
      state.tiles[0]?.length ?? 0,
      state.tiles.length,
    );
  }

  private async playEvent(ev: GameEvent): Promise<void> {
    switch (ev.type) {
      case 'UNIT_MOVED': {
        await this.units.animateMove(ev.payload.unitId, ev.payload.from, ev.payload.to);
        break;
      }
      case 'UNIT_ABILITY_USED': {
        const state = useBattleStore.getState().engine?.state;
        const targetPos =
          ev.payload.targetPos ??
          (ev.payload.targetId
            ? state?.units.find((u) => u.id === ev.payload.targetId)?.position
            : undefined);
        if (targetPos) {
          if (ev.payload.abilityId === 'poison_burst') {
            await this.fx.showPoisonPulse(targetPos);
          } else {
            await this.fx.showHealFlash(targetPos);
          }
        }
        break;
      }
      case 'UNIT_ATTACKED': {
        const state = useBattleStore.getState().engine?.state;
        const targetPos =
          ev.payload.targetPos ??
          (ev.payload.targetId
            ? state?.units.find((u) => u.id === ev.payload.targetId)?.position
            : undefined);
        if (targetPos) {
          await this.units.animateAttack(ev.payload.attackerId, targetPos);
        }
        break;
      }
      case 'UNIT_HEALED': {
        const unit = useBattleStore.getState().engine?.state.units.find(
          (u) => u.id === ev.payload.unitId
        );
        if (unit) await this.fx.showHealNumber(unit.position, ev.payload.amount);
        await this.units.animateHeal(ev.payload.unitId, ev.payload.hpAfter);
        break;
      }
      case 'UNIT_POISON_CHANGED': {
        const unit = useBattleStore.getState().engine?.state.units.find(
          (u) => u.id === ev.payload.unitId
        );
        if (unit) await this.fx.showPoisonPulse(unit.position);
        break;
      }
      case 'UNIT_DAMAGED': {
        const unit = useBattleStore.getState().engine?.state.units.find(
          (u) => u.id === ev.payload.unitId
        );
        if (unit) await this.fx.showDamageNumber(unit.position, ev.payload.damage);
        await this.units.animateDamage(ev.payload.unitId, ev.payload.damage, ev.payload.hpAfter);
        break;
      }
      case 'UNIT_KILLED': {
        await this.units.animateDeath(ev.payload.unitId);
        break;
      }
      case 'TURN_BEGAN': {
        const { mySide } = useBattleStore.getState();
        const isMyTurn = ev.payload.currentPlayer === mySide;
        await this.fx.showTurnBanner(isMyTurn, this.appWidth, this.appHeight);
        break;
      }
      case 'RESOURCE_POINT_CAPTURED':
      case 'OUTPOST_CAPTURED': {
        await this.fx.showResourceCapturePulse(
          ev.payload.position,
          ev.payload.newOwner ?? null,
        );
        break;
      }
      default:
        break;
    }
  }

  unbind(): void {
    this.input.unbind();
    this.unsubscribes.forEach((u) => u());
    this.unsubscribes = [];
  }
}
