import type { Tile, UnitType } from '@chesspvp/shared';
import * as PIXI from 'pixi.js';

export interface UnitSpriteHandle {
  container: PIXI.Container;
  playIdle(): void;
  playAttack(): Promise<void>;
  playHurt(): Promise<void>;
  playDeath(): Promise<void>;
}

export interface AssetProvider {
  getTileSprite(tile: Tile, size: number): PIXI.Container;
  getBaseSprite(side: 'A' | 'B', size: number): PIXI.Container;
  createUnitSprite(type: UnitType, side: 'A' | 'B', size: number): UnitSpriteHandle;
}
