import * as PIXI from 'pixi.js';
import type { Tile, TileType, UnitType } from '@chesspvp/shared';
import type { AssetProvider, UnitSpriteHandle } from './AssetProvider';
import { getOutpostOwnershipVisual, getResourceOwnershipVisual } from '../resourceOwnership';

const TILE_COLORS: Record<TileType, number> = {
  plain: 0x2d5a27,
  blocked: 0x444444,
  resource: 0x8b6914,
  outpost: 0x78350f,
  base_a: 0x1a3a6a,
  base_b: 0x6a1a1a,
};

const UNIT_COLORS: Record<UnitType, number> = {
  warrior: 0xcc3333,
  archer: 0x33aa33,
  mage: 0x9933cc,
  knight: 0x3366cc,
  priest: 0xddcc66,
  gunner: 0xaa7744,
  scout: 0x22c55e,
  poisoner: 0x7c3aed,
};

const UNIT_LABELS: Record<UnitType, string> = {
  warrior: '战',
  archer: '弓',
  mage: '法',
  knight: '骑',
  priest: '牧',
  gunner: '炮',
  scout: '侦',
  poisoner: '毒',
};

export class PrimitiveAssetProvider implements AssetProvider {
  getTileSprite(tile: Tile, size: number): PIXI.Container {
    if (tile.type === 'resource') {
      return this.createResourceTile(tile, size);
    }
    if (tile.type === 'outpost') {
      return this.createOutpostTile(tile, size);
    }

    const g = new PIXI.Graphics();
    const color = TILE_COLORS[tile.type] ?? 0x2d5a27;
    g.beginFill(color);
    g.drawRect(0, 0, size, size);
    g.endFill();
    g.lineStyle(1, 0x000000, 0.3);
    g.drawRect(0, 0, size, size);
    return g;
  }

  private createResourceTile(tile: Tile, size: number): PIXI.Container {
    const visual = getResourceOwnershipVisual(tile.resourceOwner ?? null);
    const container = new PIXI.Container();

    const base = new PIXI.Graphics();
    base.beginFill(0x355e2f);
    base.drawRect(0, 0, size, size);
    base.endFill();
    base.lineStyle(1, 0x000000, 0.3);
    base.drawRect(0, 0, size, size);

    const ownershipPlate = new PIXI.Graphics();
    ownershipPlate.beginFill(visual.fillColor, visual.fillAlpha);
    ownershipPlate.drawRect(4, 4, size - 8, size - 8);
    ownershipPlate.endFill();
    ownershipPlate.lineStyle(4, visual.accentColor, 0.95);
    ownershipPlate.drawRect(4, 4, size - 8, size - 8);

    const banner = new PIXI.Graphics();
    banner.beginFill(visual.accentColor, tile.resourceOwner ? 0.9 : 0.72);
    banner.drawPolygon([0, 0, size * 0.3, 0, 0, size * 0.3]);
    banner.endFill();

    const core = new PIXI.Graphics();
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.2;
    core.lineStyle(2, visual.accentColor, 1);
    core.beginFill(visual.centerColor, visual.centerAlpha);
    core.drawPolygon([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]);
    core.endFill();

    container.addChild(base);
    container.addChild(ownershipPlate);
    container.addChild(banner);
    container.addChild(core);
    return container;
  }

  private createOutpostTile(tile: Tile, size: number): PIXI.Container {
    const visual = getOutpostOwnershipVisual(tile.outpostOwner ?? null);
    const container = new PIXI.Container();

    const base = new PIXI.Graphics();
    base.beginFill(0x355e2f);
    base.drawRect(0, 0, size, size);
    base.endFill();
    base.lineStyle(1, 0x000000, 0.3);
    base.drawRect(0, 0, size, size);

    const keep = new PIXI.Graphics();
    keep.beginFill(visual.fillColor, visual.fillAlpha);
    keep.drawRect(size * 0.24, size * 0.24, size * 0.52, size * 0.52);
    keep.endFill();
    keep.lineStyle(4, visual.accentColor, 0.95);
    keep.drawRect(size * 0.24, size * 0.24, size * 0.52, size * 0.52);

    const bastion = new PIXI.Graphics();
    bastion.beginFill(visual.centerColor, visual.centerAlpha);
    bastion.drawRect(size * 0.18, size * 0.18, size * 0.12, size * 0.12);
    bastion.drawRect(size * 0.70, size * 0.18, size * 0.12, size * 0.12);
    bastion.drawRect(size * 0.18, size * 0.70, size * 0.12, size * 0.12);
    bastion.drawRect(size * 0.70, size * 0.70, size * 0.12, size * 0.12);
    bastion.endFill();

    const banner = new PIXI.Graphics();
    banner.beginFill(visual.accentColor, tile.outpostOwner ? 0.94 : 0.78);
    banner.drawPolygon([
      size * 0.5,
      size * 0.16,
      size * 0.67,
      size * 0.28,
      size * 0.5,
      size * 0.4,
      size * 0.33,
      size * 0.28,
    ]);
    banner.endFill();

    container.addChild(base);
    container.addChild(keep);
    container.addChild(bastion);
    container.addChild(banner);
    return container;
  }

  getBaseSprite(side: 'A' | 'B', size: number): PIXI.Container {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    const fillColor = side === 'A' ? 0x1a3a6a : 0x6a1a1a;
    const borderColor = side === 'A' ? 0xffd700 : 0xc0c0c0;
    g.lineStyle(3, borderColor);
    g.beginFill(fillColor);
    g.drawRect(2, 2, size - 4, size - 4);
    g.endFill();
    c.addChild(g);

    const label = new PIXI.Text(side === 'A' ? '基A' : '基B', {
      fontSize: size * 0.25,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    label.anchor.set(0.5);
    label.x = size / 2;
    label.y = size / 2;
    c.addChild(label);
    return c;
  }

  createUnitSprite(type: UnitType, side: 'A' | 'B', size: number): UnitSpriteHandle {
    const container = new PIXI.Container();
    const r = size * 0.36;
    const cx = size / 2;
    const cy = size / 2;

    const circle = new PIXI.Graphics();
    circle.lineStyle(2, side === 'A' ? 0x88aaff : 0xff8888);
    circle.beginFill(UNIT_COLORS[type]);
    circle.drawCircle(cx, cy, r);
    circle.endFill();
    container.addChild(circle);

    const label = new PIXI.Text(UNIT_LABELS[type], {
      fontSize: r * 0.9,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    label.anchor.set(0.5);
    label.x = cx;
    label.y = cy;
    container.addChild(label);

    return {
      container,
      playIdle() {},
      async playAttack() {
        // Quick scale pulse
        container.scale.set(1.2);
        await delay(100);
        container.scale.set(1.0);
      },
      async playHurt() {
        circle.tint = 0xff0000;
        await delay(120);
        circle.tint = 0xffffff;
      },
      async playDeath() {
        container.alpha = 0.5;
        await delay(200);
        container.alpha = 0;
      },
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
