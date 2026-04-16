# 09 - 美术资源切换方案

## 1. 目标

- **MVP**：纯色块 + 文字，零美术资源，前端独立可跑
- **MVP 后**：不改任何业务代码，**只替换一个 `AssetProvider`**，界面即升级为 2D 像素精灵

## 2. 抽象接口

所有渲染器（`BoardRenderer`、`UnitRenderer`、`FxRenderer`）只通过 `AssetProvider` 获取可视资源。代码中**不得直接 `new PIXI.Graphics()` 画单位或地形**。

```typescript
// packages 不依赖 pixi，所以这些放在 apps/client/src/battle/assets/
import * as PIXI from 'pixi.js';
import type { UnitType, TileType, PlayerSide } from '@chesspvp/shared';

export interface UnitSpriteHandle {
  /** 根容器，用来加到 stage */
  readonly container: PIXI.Container;
  /** 设置朝向 */
  setFacing(dir: 'left' | 'right'): void;
  /** 播放待机动画（循环） */
  playIdle(): void;
  /** 播放攻击动画（一次） */
  playAttack(): Promise<void>;
  /** 播放受击动画（一次） */
  playHurt(): Promise<void>;
  /** 播放死亡动画（一次） */
  playDeath(): Promise<void>;
  /** 更新血条显示 */
  setHp(current: number, max: number): void;
  /** 销毁资源 */
  destroy(): void;
}

export interface BaseSpriteHandle {
  readonly container: PIXI.Container;
  setHp(current: number, max: number): void;
  playHurt(): Promise<void>;
  playDestroyed(): Promise<void>;
  destroy(): void;
}

export interface AssetProvider {
  /** 预加载（Pixel provider 需要 load spritesheet；Primitive 返回空 Promise） */
  preload(): Promise<void>;

  /** 地形背景 */
  createTileSprite(type: TileType, size: number): PIXI.Container;

  /** 基地 */
  createBaseSprite(side: PlayerSide, size: number): BaseSpriteHandle;

  /** 单位 */
  createUnitSprite(type: UnitType, side: PlayerSide, size: number): UnitSpriteHandle;

  /** 资源点 */
  createResourcePointSprite(size: number): PIXI.Container;

  /** 浮动伤害数字 */
  createDamageText(damage: number): PIXI.Container;
}
```

## 3. 纯色块实现（MVP）

`apps/client/src/battle/assets/PrimitiveAssetProvider.ts`

### 3.1 设计规则

| 元素 | 形状 | 颜色 | 文字 |
|---|---|---|---|
| 平地 | 矩形 | 浅绿 `#7fb069` | — |
| 资源点 | 平地 + 内部金色菱形 | `#ffc857` | 数字 "3" |
| 基地格 | 大矩形 + 厚边框 | 灰 `#555`；A 金边 `#ffd166`；B 银边 `#c8d5e3` | "A" / "B" |
| 战士 | 圆形 | 红 `#e63946` | "战" |
| 弓手 | 圆形 | 绿 `#2a9d8f` | "弓" |
| 法师 | 圆形 | 紫 `#8e44ad` | "法" |
| 骑士 | 圆形 | 蓝 `#457b9d` | "骑" |
| 阵营标识 | 圆形外圈 | A 金 / B 银 | — |
| 单位血条 | 红底绿条 | | — |
| 基地血条 | 同上，更粗 | | — |

### 3.2 关键代码片段

```typescript
export class PrimitiveAssetProvider implements AssetProvider {
  async preload() { /* 无 */ }

  createTileSprite(type: TileType, size: number): PIXI.Container {
    const g = new PIXI.Graphics();
    switch (type) {
      case 'plain':
        g.beginFill(0x7fb069).drawRect(0, 0, size, size).endFill();
        g.lineStyle(1, 0x4a7c3a).drawRect(0, 0, size, size);
        break;
      case 'resource':
        g.beginFill(0x7fb069).drawRect(0, 0, size, size).endFill();
        g.beginFill(0xffc857).drawPolygon([size/2, 8, size-8, size/2, size/2, size-8, 8, size/2]).endFill();
        break;
      case 'base_a':
      case 'base_b':
        g.beginFill(0x555555).drawRect(0, 0, size, size).endFill();
        g.lineStyle(3, type === 'base_a' ? 0xffd166 : 0xc8d5e3).drawRect(0, 0, size, size);
        break;
      case 'blocked':
        g.beginFill(0x333333).drawRect(0, 0, size, size).endFill();
        break;
    }
    return g;
  }

  createUnitSprite(type: UnitType, side: PlayerSide, size: number): UnitSpriteHandle {
    const container = new PIXI.Container();

    const colors: Record<UnitType, number> = {
      warrior: 0xe63946, archer: 0x2a9d8f, mage: 0x8e44ad, knight: 0x457b9d,
      priest: 0xd9c46b, gunner: 0xa56b3c,
    };
    const labels: Record<UnitType, string> = {
      warrior: '战', archer: '弓', mage: '法', knight: '骑',
      priest: '牧', gunner: '炮',
    };

    const body = new PIXI.Graphics();
    body.beginFill(colors[type]).drawCircle(size/2, size/2, size*0.4).endFill();
    body.lineStyle(3, side === 'A' ? 0xffd166 : 0xc8d5e3).drawCircle(size/2, size/2, size*0.4);
    container.addChild(body);

    const label = new PIXI.Text(labels[type], {
      fontFamily: 'sans-serif',
      fontSize: size * 0.35,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    label.anchor.set(0.5);
    label.position.set(size/2, size/2);
    container.addChild(label);

    const hpBar = new PIXI.Graphics();
    container.addChild(hpBar);
    const renderHp = (cur: number, max: number) => {
      hpBar.clear();
      hpBar.beginFill(0x000000, 0.3).drawRect(4, size - 8, size - 8, 4).endFill();
      hpBar.beginFill(0x4caf50).drawRect(4, size - 8, (size - 8) * (cur / max), 4).endFill();
    };

    return {
      container,
      setFacing(dir) { container.scale.x = dir === 'left' ? -1 : 1; },
      playIdle() { /* 色块无待机动画 */ },
      async playAttack() {
        // 简单前推 + 回位
        const orig = container.x;
        await tween(container, { x: orig + 10 }, 80);
        await tween(container, { x: orig }, 80);
      },
      async playHurt() {
        body.tint = 0xff0000;
        await wait(100);
        body.tint = 0xffffff;
      },
      async playDeath() {
        await tween(container, { alpha: 0, scale: 0.3 }, 300);
      },
      setHp(cur, max) { renderHp(cur, max); },
      destroy() { container.destroy({ children: true }); },
    };
  }

  // createBaseSprite, createResourcePointSprite, createDamageText 类似实现
}

// tween 工具在 utils 中实现，基于 requestAnimationFrame + ticker
```

## 4. 像素素材实现（M7，可选）

`apps/client/src/battle/assets/PixelAssetProvider.ts`

### 4.1 资源要求

放在 `apps/client/public/sprites/`：

```
sprites/
├── units.png               # 8 兵种 × 2 阵营 × 4 动作 × N 帧 合图
├── units.json              # Texture atlas (PIXI 支持的格式)
├── tiles.png               # 地形图
├── tiles.json
├── base_a.png
├── base_a.json
└── base_b.png / base_b.json
```

### 4.2 帧规格建议

| 动作 | 帧数 | FPS |
|---|---|---|
| idle | 4 | 6 |
| attack | 4 | 12 |
| hurt | 2 | 10 |
| death | 4 | 8 |

单帧尺寸：32 × 32（或 64 × 64）像素；放大到 `size = 64` 显示时 `scale = size / 32`。

### 4.3 关键代码片段

```typescript
import * as PIXI from 'pixi.js';

export class PixelAssetProvider implements AssetProvider {
  private unitsSheet!: PIXI.Spritesheet;
  private tilesSheet!: PIXI.Spritesheet;

  async preload() {
    this.unitsSheet = await PIXI.Assets.load('/sprites/units.json');
    this.tilesSheet = await PIXI.Assets.load('/sprites/tiles.json');
    // ... bases
  }

  createUnitSprite(type: UnitType, side: PlayerSide, size: number): UnitSpriteHandle {
    const prefix = `${type}_${side}`;
    const idleFrames = Array.from({ length: 4 }, (_, i) => this.unitsSheet.textures[`${prefix}_idle_${i}.png`]);
    const attackFrames = Array.from({ length: 4 }, (_, i) => this.unitsSheet.textures[`${prefix}_attack_${i}.png`]);
    const hurtFrames = Array.from({ length: 2 }, (_, i) => this.unitsSheet.textures[`${prefix}_hurt_${i}.png`]);
    const deathFrames = Array.from({ length: 4 }, (_, i) => this.unitsSheet.textures[`${prefix}_death_${i}.png`]);

    const sprite = new PIXI.AnimatedSprite(idleFrames);
    sprite.animationSpeed = 0.1;
    sprite.width = size;
    sprite.height = size;
    sprite.play();

    // ... 包装 UnitSpriteHandle 接口，与色块版结构一致
  }
}
```

### 4.4 资源缺失策略

- 如果 `preload()` 中某些资源加载失败 → `logger.warn` → **fallback 到 PrimitiveAssetProvider**
- 这样即使像素素材不全，游戏也不会白屏

## 5. 工厂函数（运行时切换）

`apps/client/src/battle/assets/index.ts`

```typescript
export async function createAssetProvider(mode: 'primitive' | 'pixel'): Promise<AssetProvider> {
  if (mode === 'pixel') {
    try {
      const provider = new PixelAssetProvider();
      await provider.preload();
      return provider;
    } catch (err) {
      console.warn('[asset] pixel provider failed, fallback to primitive', err);
    }
  }
  const provider = new PrimitiveAssetProvider();
  await provider.preload();
  return provider;
}
```

`BattleScene` 构造时调用：

```typescript
const mode = import.meta.env.VITE_ASSET_PROVIDER ?? 'primitive';
const provider = await createAssetProvider(mode as any);
new BattleScene({ ... provider });
```

## 6. 切换验证清单

从 `primitive` 切到 `pixel` 时，以下应**无差异**：
- [ ] 棋盘大小、格子对应坐标
- [ ] 单位点击判定范围
- [ ] 移动/攻击范围高亮正确
- [ ] HUD 所有数据
- [ ] 回合切换时机
- [ ] 所有 socket 交互

以下**会**有差异（预期）：
- [ ] 单位形象：从圆形色块 → 像素小人
- [ ] 动画丰富度：从简单 tween → 帧动画
- [ ] 视觉层次：从单色 → 多层

## 7. 美术素材来源建议

- **开源免费**：itch.io 的免费像素资源（注意 license）
- **自研**：Aseprite 制作
- **AI 生成 + 修整**：Stable Diffusion + Aseprite 后处理

放入 repo 前确认 license 允许商业/私人使用。

## 8. HUD 样式与 AssetProvider 无关

所有 HUD（按钮、弹窗、数字、图标）是 **React + Tailwind** 实现，不依赖 Pixi 资源。因此切换 AssetProvider 时 HUD 完全不受影响。

HUD 使用的图标（金币图标、时间图标、投降图标等）：
- MVP：用 Unicode Emoji 或简单 SVG（`<svg>...</svg>`）
- 后期：替换成同一套 `react-icons` 或自定义 SVG 库

## 9. 路线图

| 阶段 | Provider | 视觉等级 |
|---|---|---|
| MVP | Primitive | 几何色块，可玩 |
| v1.0 | Pixel（M7） | 2D 像素，商品级 |
| v2.0 | Pixel + 特效 | 攻击粒子、镜头抖动 |
| v3.0 | 可选 3D | 如需（Three.js）|
