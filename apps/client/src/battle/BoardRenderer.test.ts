import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tile } from '@chesspvp/shared';

vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = [];
    x = 0;
    y = 0;
    scale = {
      x: 1,
      y: 1,
      set: (x: number, y = x) => {
        this.scale.x = x;
        this.scale.y = y;
      },
    };
    addChild(...children: unknown[]) {
      this.children.push(...children);
      return children[0];
    }
    removeChildren() {
      this.children = [];
    }
    destroy() {
      this.children = [];
    }
  }

  class Graphics extends Container {
    clear() {}
    beginFill() {}
    drawRect() {}
    endFill() {}
    lineStyle() {}
    drawCircle() {}
    drawPolygon() {}
  }

  return { Container, Graphics };
});

describe('BoardRenderer', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('passes the full tile to the asset provider when rendering map tiles', async () => {
    const PIXI = await import('pixi.js');
    const { BoardRenderer } = await import('./BoardRenderer');

    const world = new PIXI.Container();
    const tile: Tile = {
      position: { x: 0, y: 0 },
      type: 'resource',
      resourceOwner: 'A',
    };
    const provider = {
      getTileSprite: vi.fn(() => new PIXI.Graphics()),
      getBaseSprite: vi.fn(() => new PIXI.Container()),
      createUnitSprite: vi.fn(),
    };

    const renderer = new BoardRenderer(world as never, provider as never);
    renderer.renderMap([[tile]]);

    expect(provider.getTileSprite).toHaveBeenCalledWith(tile, 64);
  });

  it('converts screen and world positions using the zoom-aware camera viewport', async () => {
    const PIXI = await import('pixi.js');
    const { BoardRenderer } = await import('./BoardRenderer');
    const { createBattleCamera } = await import('./camera');

    const world = new PIXI.Container();
    const provider = {
      getTileSprite: vi.fn(() => new PIXI.Graphics()),
      getBaseSprite: vi.fn(() => new PIXI.Container()),
      createUnitSprite: vi.fn(),
    };

    const renderer = new BoardRenderer(world as never, provider as never);
    renderer.renderMap(
      Array.from({ length: 40 }, (_, y) =>
        Array.from({ length: 40 }, (_, x) => ({
          position: { x, y },
          type: 'plain' as const,
        }))
      )
    );
    renderer.setDisplaySize(768, 768);
    renderer.setCamera(
      createBattleCamera({
        viewportWidthPx: 768,
        viewportHeightPx: 768,
        worldWidthPx: 40 * 64,
        worldHeightPx: 40 * 64,
        offsetX: 160,
        offsetY: 96,
        zoom: 1.5,
      })
    );

    expect(renderer.screenToPosition(192, 192)).toEqual({ x: 4, y: 3 });
    expect(renderer.positionToScreen({ x: 4, y: 3 })).toEqual({ x: 192, y: 192 });
  });
});
