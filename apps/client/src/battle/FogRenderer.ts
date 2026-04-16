import * as PIXI from 'pixi.js';
import { TILE_SIZE } from './constants';

/**
 * 战争迷雾覆盖层。
 * - 在棋盘地图层之上、单位层之下渲染。
 * - 不可见的格子绘制深色遮罩，可见格子完全透明。
 * - 当 visibleTiles 为 null 时（离线/调试模式）不绘制任何迷雾。
 */
export class FogRenderer {
  private container: PIXI.Container;
  /** 缓存上一次 visibleTiles 字符串，避免无变化时重复绘制 */
  private lastVisibleKey = '';

  constructor(world: PIXI.Container) {
    this.container = new PIXI.Container();
    // sortableChildren 保证层级；由 BattleScene 负责 addChild 时指定位置
    world.addChild(this.container);
  }

  /**
   * 根据当前可见格子集合更新迷雾覆盖。
   *
   * @param visibleTiles "x,y" 字符串数组，来自 BattleState.fog.visibleTiles。
   *                     传入 null 表示禁用迷雾（离线模式），会清空遮罩。
   * @param mapWidth  地图列数（默认 12）
   * @param mapHeight 地图行数（默认 12）
   */
  render(visibleTiles: string[] | null, mapWidth = 12, mapHeight = 12): void {
    // 离线/调试模式：无迷雾
    if (visibleTiles === null) {
      this.container.removeChildren();
      this.lastVisibleKey = '';
      return;
    }

    // 去重避免重复渲染（Set 比较用 join）
    const newKey = visibleTiles.slice().sort().join('|');
    if (newKey === this.lastVisibleKey) return;
    this.lastVisibleKey = newKey;

    this.container.removeChildren();

    const visibleSet = new Set(visibleTiles);

    // 用单张大 Graphics 一次性画所有不可见格，性能比逐格 Graphics 好
    const g = new PIXI.Graphics();

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (!visibleSet.has(`${x},${y}`)) {
          g.beginFill(0x000000, 0.72);
          g.drawRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          g.endFill();
        }
      }
    }

    this.container.addChild(g);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
