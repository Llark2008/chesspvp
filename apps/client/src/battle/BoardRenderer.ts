import * as PIXI from 'pixi.js';
import type { Position, Tile } from '@chesspvp/shared';
import type { AssetProvider } from './assets/AssetProvider';
import type { BattleCamera } from './camera';
import {
  BATTLE_VIEWPORT_HEIGHT_PX,
  BATTLE_VIEWPORT_WIDTH_PX,
  TILE_SIZE,
} from './constants';

export class BoardRenderer {
  private world: PIXI.Container;
  private container: PIXI.Container;
  private tileLayer: PIXI.Container;
  private highlightLayer: PIXI.Container;
  private hoverGraphic: PIXI.Graphics;
  private assetProvider: AssetProvider;
  private camera: BattleCamera | null = null;
  private mapWidth = 0;
  private mapHeight = 0;
  private displayWidth = BATTLE_VIEWPORT_WIDTH_PX;
  private displayHeight = BATTLE_VIEWPORT_HEIGHT_PX;

  constructor(world: PIXI.Container, assetProvider: AssetProvider) {
    this.world = world;
    this.assetProvider = assetProvider;
    this.container = new PIXI.Container();
    this.tileLayer = new PIXI.Container();
    this.highlightLayer = new PIXI.Container();
    this.hoverGraphic = new PIXI.Graphics();
    this.container.addChild(this.tileLayer);
    this.container.addChild(this.highlightLayer);
    this.container.addChild(this.hoverGraphic);
    this.world.addChild(this.container);
  }

  renderMap(tiles: Tile[][]): void {
    this.mapHeight = tiles.length;
    this.mapWidth = tiles[0]?.length ?? 0;
    this.tileLayer.removeChildren();
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < (tiles[y]?.length ?? 0); x++) {
        const tile = tiles[y]![x]!;
        if (tile.type === 'base_a' || tile.type === 'base_b') {
          const sprite = this.assetProvider.getBaseSprite(
            tile.type === 'base_a' ? 'A' : 'B',
            TILE_SIZE
          );
          sprite.x = x * TILE_SIZE;
          sprite.y = y * TILE_SIZE;
          this.tileLayer.addChild(sprite);
        } else {
          const sprite = this.assetProvider.getTileSprite(tile, TILE_SIZE);
          sprite.x = x * TILE_SIZE;
          sprite.y = y * TILE_SIZE;
          this.tileLayer.addChild(sprite);
        }
      }
    }
  }

  setCamera(camera: BattleCamera): void {
    this.camera = camera;
    this.applyWorldTransform();
  }

  setDisplaySize(width: number, height: number): void {
    this.displayWidth = width;
    this.displayHeight = height;
    this.applyWorldTransform();
  }

  highlightTiles(positions: Position[], mode: 'move' | 'attack' | 'ability'): void {
    const color =
      mode === 'move' ? 0x4466ff : mode === 'ability' ? 0x44cc88 : 0xff4444;
    for (const pos of positions) {
      const g = new PIXI.Graphics();
      g.beginFill(color, 0.4);
      g.drawRect(0, 0, TILE_SIZE, TILE_SIZE);
      g.endFill();
      g.x = pos.x * TILE_SIZE;
      g.y = pos.y * TILE_SIZE;
      this.highlightLayer.addChild(g);
    }
  }

  clearHighlights(): void {
    this.highlightLayer.removeChildren();
  }

  setHover(pos: Position | null): void {
    this.hoverGraphic.clear();
    if (!pos) return;
    this.hoverGraphic.lineStyle(2, 0xffffff, 0.9);
    this.hoverGraphic.drawRect(
      pos.x * TILE_SIZE + 1,
      pos.y * TILE_SIZE + 1,
      TILE_SIZE - 2,
      TILE_SIZE - 2
    );
  }

  positionToScreen(p: Position): { x: number; y: number } {
    const scaleX = this.getScaleX();
    const scaleY = this.getScaleY();

    return {
      x:
        (p.x * TILE_SIZE + TILE_SIZE / 2 - (this.camera?.offsetX ?? 0)) *
        scaleX,
      y:
        (p.y * TILE_SIZE + TILE_SIZE / 2 - (this.camera?.offsetY ?? 0)) *
        scaleY,
    };
  }

  screenToPosition(x: number, y: number): Position | null {
    const scaleX = this.getScaleX();
    const scaleY = this.getScaleY();
    const worldX = x / scaleX + (this.camera?.offsetX ?? 0);
    const worldY = y / scaleY + (this.camera?.offsetY ?? 0);
    const gx = Math.floor(worldX / TILE_SIZE);
    const gy = Math.floor(worldY / TILE_SIZE);
    if (gx < 0 || gx >= this.mapWidth || gy < 0 || gy >= this.mapHeight) return null;
    return { x: gx, y: gy };
  }

  private getScaleX(): number {
    return this.displayWidth / (this.camera?.viewportWidthPx ?? BATTLE_VIEWPORT_WIDTH_PX);
  }

  private getScaleY(): number {
    return this.displayHeight / (this.camera?.viewportHeightPx ?? BATTLE_VIEWPORT_HEIGHT_PX);
  }

  private applyWorldTransform(): void {
    const scaleX = this.getScaleX();
    const scaleY = this.getScaleY();
    this.world.scale.set(scaleX, scaleY);
    this.world.x = -(this.camera?.offsetX ?? 0) * scaleX;
    this.world.y = -(this.camera?.offsetY ?? 0) * scaleY;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
