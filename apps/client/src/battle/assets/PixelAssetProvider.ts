/**
 * PixelAssetProvider skeleton — M7 (optional) implementation.
 * Falls back to PrimitiveAssetProvider until pixel sprites are prepared.
 */
import type { Tile, UnitType } from '@chesspvp/shared';
import type * as PIXI from 'pixi.js';
import type { AssetProvider, UnitSpriteHandle } from './AssetProvider';
import { PrimitiveAssetProvider } from './PrimitiveAssetProvider';

export class PixelAssetProvider implements AssetProvider {
  private fallback = new PrimitiveAssetProvider();

  async preload(): Promise<void> {
    // TODO M7: PIXI.Assets.load({ ...spritesheets })
    return Promise.resolve();
  }

  getTileSprite(tile: Tile, size: number): PIXI.Container {
    return this.fallback.getTileSprite(tile, size);
  }

  getBaseSprite(side: 'A' | 'B', size: number): PIXI.Container {
    return this.fallback.getBaseSprite(side, size);
  }

  createUnitSprite(type: UnitType, side: 'A' | 'B', size: number): UnitSpriteHandle {
    // TODO M7: return PIXI.AnimatedSprite with idle/attack/hurt/death frames
    return this.fallback.createUnitSprite(type, side, size);
  }
}
