import * as PIXI from 'pixi.js';
import type { Position } from '@chesspvp/shared';
import type { BoardRenderer } from './BoardRenderer';
import { getCameraPanDelta } from './camera';
import {
  BATTLE_VIEWPORT_HEIGHT_PX,
  BATTLE_VIEWPORT_WIDTH_PX,
} from './constants';

export class InputController {
  onTileClick?: (p: Position) => void;
  onTileHover?: (p: Position | null) => void;
  onCameraPan?: (dx: number, dy: number) => void;
  onZoom?: (direction: 'in' | 'out', anchorNormX: number, anchorNormY: number) => void;

  private stage: PIXI.Container | null = null;
  private view: HTMLCanvasElement | null = null;
  private clickHandler: ((e: PIXI.FederatedPointerEvent) => void) | null = null;
  private moveHandler: ((e: PIXI.FederatedPointerEvent) => void) | null = null;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private pressedKeys = new Set<string>();
  private rafId: number | null = null;
  private lastFrameTs: number | null = null;
  private viewportWidthPx = BATTLE_VIEWPORT_WIDTH_PX;
  private viewportHeightPx = BATTLE_VIEWPORT_HEIGHT_PX;

  setViewportSize(width: number, height: number): void {
    this.viewportWidthPx = width;
    this.viewportHeightPx = height;
    if (this.stage) {
      this.stage.hitArea = new PIXI.Rectangle(0, 0, width, height);
    }
  }

  bind(stage: PIXI.Container, board: BoardRenderer, view: HTMLCanvasElement): void {
    this.stage = stage;
    this.view = view;

    stage.eventMode = 'static';
    stage.hitArea = new PIXI.Rectangle(0, 0, this.viewportWidthPx, this.viewportHeightPx);

    this.clickHandler = (e: PIXI.FederatedPointerEvent) => {
      const pos = board.screenToPosition(e.globalX, e.globalY);
      if (pos && this.onTileClick) this.onTileClick(pos);
    };

    this.moveHandler = (e: PIXI.FederatedPointerEvent) => {
      const pos = board.screenToPosition(e.globalX, e.globalY);
      if (this.onTileHover) this.onTileHover(pos);
      board.setHover(pos);
    };

    this.keyDownHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      e.preventDefault();
      this.pressedKeys.add(key);
    };

    this.keyUpHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      this.pressedKeys.delete(key);
    };

    this.wheelHandler = (e: WheelEvent) => {
      if (!this.onZoom) return;

      const rect = view.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const anchorNormX = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      const anchorNormY = Math.max(0, Math.min((e.clientY - rect.top) / rect.height, 1));
      const direction = e.deltaY < 0 ? 'in' : 'out';

      e.preventDefault();
      this.onZoom(direction, anchorNormX, anchorNormY);
    };

    stage.on('pointerdown', this.clickHandler);
    stage.on('pointermove', this.moveHandler);
    view.addEventListener('wheel', this.wheelHandler, { passive: false });
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    this.startCameraLoop();
  }

  private startCameraLoop(): void {
    const tick = (ts: number) => {
      if (this.lastFrameTs === null) {
        this.lastFrameTs = ts;
      }
      const deltaMs = ts - this.lastFrameTs;
      this.lastFrameTs = ts;

      if (this.onCameraPan && this.pressedKeys.size > 0) {
        const { dx, dy } = getCameraPanDelta(this.pressedKeys, deltaMs);
        if (dx !== 0 || dy !== 0) {
          this.onCameraPan(dx, dy);
        }
      }

      this.rafId = window.requestAnimationFrame(tick);
    };

    this.rafId = window.requestAnimationFrame(tick);
  }

  unbind(): void {
    if (this.stage && this.clickHandler) {
      this.stage.off('pointerdown', this.clickHandler);
    }
    if (this.stage && this.moveHandler) {
      this.stage.off('pointermove', this.moveHandler);
    }
    if (this.view && this.wheelHandler) {
      this.view.removeEventListener('wheel', this.wheelHandler);
    }
    if (this.keyDownHandler) {
      window.removeEventListener('keydown', this.keyDownHandler);
    }
    if (this.keyUpHandler) {
      window.removeEventListener('keyup', this.keyUpHandler);
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
    }
    this.pressedKeys.clear();
    this.lastFrameTs = null;
    this.rafId = null;
    this.stage = null;
    this.view = null;
  }
}
