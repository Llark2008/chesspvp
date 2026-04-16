import * as PIXI from 'pixi.js';
import type { AssetProvider } from './assets/AssetProvider';
import { BoardRenderer } from './BoardRenderer';
import { UnitRenderer } from './UnitRenderer';
import { FogRenderer } from './FogRenderer';
import { FxRenderer } from './FxRenderer';
import { InputController } from './InputController';
import { BattleController } from './BattleController';
import { BATTLE_VIEWPORT_HEIGHT_PX, BATTLE_VIEWPORT_WIDTH_PX } from './constants';
import { useBattleStore } from '../store/battleStore';

export class BattleScene {
  private app: PIXI.Application;
  private world: PIXI.Container;
  private board: BoardRenderer;
  private unitRenderer: UnitRenderer;
  private fog: FogRenderer;
  private fx: FxRenderer;
  private input: InputController;
  private controller: BattleController;

  constructor(opts: { container: HTMLElement; assetProvider: AssetProvider }) {
    this.app = new PIXI.Application({
      width: BATTLE_VIEWPORT_WIDTH_PX,
      height: BATTLE_VIEWPORT_HEIGHT_PX,
      backgroundColor: 0x1a1a1a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    const view = this.app.view as HTMLCanvasElement;
    view.style.display = 'block';
    opts.container.appendChild(view);
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);

    // 层级顺序（addChild 先加的在下）：
    // 1. BoardRenderer（地图底层）
    // 2. FogRenderer（迷雾遮罩，盖住地图但不遮单位）
    // 3. UnitRenderer（单位）
    // 4. FxRenderer（特效/浮动数字，最上层）
    this.board = new BoardRenderer(this.world, opts.assetProvider);
    this.fog = new FogRenderer(this.world);
    this.unitRenderer = new UnitRenderer(this.world, opts.assetProvider);
    this.fx = new FxRenderer(this.world);
    this.input = new InputController();
    this.controller = new BattleController(
      this.board,
      this.fog,
      this.unitRenderer,
      this.fx,
      this.input,
      BATTLE_VIEWPORT_WIDTH_PX,
      BATTLE_VIEWPORT_HEIGHT_PX
    );
  }

  mount(): void {
    this.input.bind(this.app.stage, this.board, this.app.view as HTMLCanvasElement);
    this.controller.bind();
  }

  resize(displayWidth: number, displayHeight: number): void {
    const safeWidth = Math.max(1, Math.floor(displayWidth));
    const safeHeight = Math.max(1, Math.floor(displayHeight));

    this.app.renderer.resize(safeWidth, safeHeight);
    this.board.setDisplaySize(safeWidth, safeHeight);
    this.input.setViewportSize(safeWidth, safeHeight);
    this.controller.setViewportSize(safeWidth, safeHeight);

    const view = this.app.view as HTMLCanvasElement;
    view.style.width = `${safeWidth}px`;
    view.style.height = `${safeHeight}px`;

    const camera = useBattleStore.getState().camera;
    if (camera) {
      this.board.setCamera(camera);
    }
  }

  destroy(): void {
    this.controller.unbind();
    this.board.destroy();
    this.fog.destroy();
    this.unitRenderer.destroy();
    this.fx.destroy();
    this.app.destroy(true, { children: true });
  }
}
