# 06 - 前端设计（`apps/client`）

## 1. 技术清单

| 技术 | 版本 | 用途 |
|---|---|---|
| React | 18 | UI 组件 |
| TypeScript | 5.x | 类型 |
| Vite | 5.x | 构建 + dev server |
| react-router-dom | 6.x | 路由 |
| zustand | 4.x | 状态管理 |
| Tailwind CSS | 3.x | 样式 |
| PixiJS | 7.x | 战斗画布渲染 |
| socket.io-client | 4.x | 实时通信 |
| axios | 1.x | HTTP 请求 |
| `@chesspvp/shared` | workspace | 规则引擎、类型、协议 |

## 2. 目录结构

```
apps/client/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.cjs
├── tsconfig.json
├── package.json
├── Dockerfile
├── public/
│   └── (MVP 无静态资源；未来像素素材放这里)
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── router.tsx
    ├── env.ts
    ├── styles/
    │   └── index.css
    │
    ├── api/
    │   ├── http.ts                  # axios 实例 + 拦截器（注入 JWT）
    │   ├── auth.ts
    │   ├── matchmaking.ts
    │   ├── matches.ts
    │   └── configs.ts
    │
    ├── socket/
    │   ├── client.ts                # 创建 Socket 实例
    │   └── gameSocket.ts            # /game 命名空间封装
    │
    ├── store/
    │   ├── authStore.ts
    │   ├── matchmakingStore.ts
    │   └── battleStore.ts
    │
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── LobbyPage.tsx
    │   ├── MatchmakingPage.tsx
    │   ├── BattlePage.tsx
    │   └── ReplayPage.tsx           # (预留)
    │
    ├── components/
    │   ├── ui/
    │   │   ├── Button.tsx
    │   │   ├── Modal.tsx
    │   │   ├── Toast.tsx
    │   │   └── Spinner.tsx
    │   └── battle/
    │       ├── BattleCanvas.tsx     # PixiJS 挂载点
    │       ├── BattleHUD.tsx        # 覆盖在画布上的 UI 层
    │       ├── TurnTimer.tsx
    │       ├── UnitInfoCard.tsx
    │       ├── RecruitPanel.tsx
    │       ├── GoldDisplay.tsx
    │       ├── MiniMap.tsx
    │       ├── ActionMenu.tsx
    │       ├── EndTurnButton.tsx
    │       └── MatchResultModal.tsx
    │
    ├── battle/                      # PixiJS 渲染层（无 React）
    │   ├── BattleScene.ts
    │   ├── BoardRenderer.ts         # 地图底层（层级 1）
    │   ├── FogRenderer.ts           # 战争迷雾覆盖（层级 2）
    │   ├── UnitRenderer.ts          # 单位（层级 3）
    │   ├── FxRenderer.ts            # 特效/数字（层级 4）
    │   ├── camera.ts                # 相机状态与坐标换算
    │   ├── constants.ts             # 视口/格子尺寸常量
    │   ├── InputController.ts
    │   ├── BattleController.ts      # PIXI 与 zustand 的桥
    │   └── assets/
    │       ├── AssetProvider.ts             # 接口
    │       ├── PrimitiveAssetProvider.ts    # 纯色块
    │       └── PixelAssetProvider.ts        # (预留)
    │
    └── utils/
        ├── classnames.ts
        └── format.ts
```

## 3. 路由

`src/router.tsx`：

```
/              → LoginPage          游客登录按钮
/lobby         → LobbyPage          开始匹配按钮
/matchmaking   → MatchmakingPage    等待匹配中
/battle/:id    → BattlePage         实际战斗
/replay/:id    → ReplayPage         (预留)
```

**路由守卫**：
- `/lobby`、`/matchmaking`、`/battle/:id` 需要 `authStore.isAuthed === true`，否则重定向到 `/`
- `/battle/:id` 需要 `battleStore` 有对应 match 或能通过重连恢复

## 4. 状态管理（zustand）

### 4.1 `authStore.ts`

```typescript
interface AuthState {
  token: string | null;
  user: UserDto | null;
  isAuthed: boolean;
  loginAsGuest: (nickname?: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;   // 从 localStorage 恢复
}
```

- 登录后把 token 存 `localStorage.chesspvp_token`
- 启动时 `hydrate()` 读回 token 并调用 `/api/v1/me` 验证

### 4.2 `matchmakingStore.ts`

```typescript
interface MatchmakingState {
  status: 'idle' | 'queued' | 'found' | 'ready';
  matchId: string | null;
  opponent: UserDto | null;
  yourSide: 'A' | 'B' | null;
  enterQueue: () => Promise<void>;
  leaveQueue: () => Promise<void>;
  onMatchFound: (data: MatchFoundPayload) => void;
  confirmReady: () => void;
}
```

- `enterQueue` → POST `/matchmaking/join` → 切到 `MatchmakingPage`
- Socket 订阅 `MATCH_FOUND` → `status='found'` → 弹确认/自动确认 → `MATCH_READY`
- 收到 `MATCH_START` → 清空本 store，跳 `/battle/:id`

### 4.3 `battleStore.ts`

这是**最复杂的 store**，连接本地 `BattleEngine`、Socket 和渲染层。

```typescript
interface BattleStoreState {
  // 核心
  engine: BattleEngine | null;
  matchId: string | null;
  mySide: 'A' | 'B' | null;
  camera: BattleCamera | null;

  // 派生视图状态
  selectedUnitId: string | null;
  inspectedUnitId: string | null;
  movableTiles: Position[];
  attackableTargets: Position[];
  abilityTargets: Position[];
  actionMode: 'attack' | `ability:${string}` | null;
  phase: 'idle' | 'unit_selected' | 'recruiting' | 'waiting_server' | 'ended';
  recruitSource: RecruitSource | null;

  // 事件队列（待播放动画）
  pendingEvents: GameEvent[];

  // 结果
  winner: 'A' | 'B' | null;
  endReason: string | null;

  // 初始化
  init(matchId: string, mapId: string, playerAId: string, playerBId: string, mySide: 'A' | 'B', nowMs?: number): void;
  initFromState(state: BattleState, mySide: 'A' | 'B'): void;
  destroy(): void;
  moveCamera(dx: number, dy: number): void;
  jumpCameraToTile(pos: Position): void;
  clampCamera(): void;

  // 玩家操作
  selectUnit(id: string): void;
  setActionMode(mode: 'attack' | `ability:${string}` | null): void;
  clearActionMode(): void;
  cancelSelection(): void;
  requestMove(to: Position): void;
  requestAttack(targetId?: string, targetPos?: Position): void;
  requestAbility(abilityId: string, targetId?: string, targetPos?: Position): void;
  openRecruitPanel(source?: RecruitSource): void;
  requestRecruit(unitType: UnitType, spawnAt: Position): void;
  requestEndTurn(): void;
  requestSurrender(): void;

  // 服务器事件
  applyServerEvents(events: GameEvent[]): void;
  applyStateSnapshot(state: BattleState): void;
}
```

补充约束：
- `openRecruitPanel()` 在未显式传入 `source` 时，会先解析**上下文招募来源**：
  - 优先 `selectedUnitId`
  - 其次 `inspectedUnitId`
  - 若该单位属于当前玩家，且正站在己方已占领前哨站上，则默认来源切到该前哨站
  - 否则回退到己方基地
- `battleStore` 会持有当前显式打开的 `recruitSource`，供 `RecruitPanel` 显示“当前建筑：基地 / 前哨站 (x,y)”

其中 `BattleCamera` 定义在 `src/battle/camera.ts`，仅属于客户端 UI 状态，不进入 shared `BattleState`。

#### 当前同步策略

```typescript
requestMove(to) {
  const { matchId, selectedUnitId } = get();
  if (!matchId || !selectedUnitId) return;
  set({ phase: 'waiting_server' });
  gameSocket.emit('ACTION_MOVE', { matchId, unitId: selectedUnitId, to }, ack => {
    if (!ack.ok) {
      set({ phase: 'unit_selected' });
    }
  });
}
```

**当前实现采用简化方案**：**不做乐观更新**。客户端只发 action，不本地 apply，等服务器 `EVENT_BATCH` 与 `STATE_SNAPSHOT` 到了再更新引擎并播动画。相机状态只存在于客户端 store，不进入 shared `BattleState`。代价是延迟略高（+1 RTT ≈ 100ms），但实现简单、一致性强、Bug 少。

BattleStore 仍会用共享引擎做本地**范围查询**：
- `getMovableTiles`
- `getAttackableTargets`
- `getAbilityTargets`

### 4.4 Store 之间的通信

- `matchmakingStore` 通过路由跳转到 `BattlePage`
- `BattlePage.useEffect` 初始化 `battleStore`，订阅 socket 事件
- 页面卸载时 `battleStore.destroy()`

## 5. 页面

### 5.1 `LoginPage`

```
+--------------------------------+
|        战棋 PVP (MVP)           |
|                                |
|   [ 点击以游客身份登录 ]        |
|                                |
+--------------------------------+
```

- 唯一按钮：`loginAsGuest()` → 成功后跳 `/lobby`

### 5.2 `LobbyPage`

```
+--------------------------------+
|  欢迎, PlayerXXX                |
|                                |
|   [      开始匹配      ]        |
|                                |
|   [ 最近战报 (预留)   ]         |
|   [ 设置 (预留)       ]         |
|                                |
+--------------------------------+
```

- `开始匹配` → `matchmakingStore.enterQueue()` → 跳 `/matchmaking`

### 5.3 `MatchmakingPage`

```
+--------------------------------+
|                                |
|       正在寻找对手...          |
|       [spinner]                |
|       已等待: 00:12             |
|                                |
|        [取消]                  |
|                                |
+--------------------------------+
```

- 挂载时 `matchmakingStore` 应已处于 `queued`
- 收到 `MATCH_FOUND` → 显示 "对手已找到: XXX"，2 秒后自动 `emit MATCH_READY`
- 收到 `MATCH_START` → 跳 `/battle/:id`

### 5.4 `BattlePage`

布局：

```
+------------------------------------------------------------+
|  HUD 顶栏: [A金币]  [回合: 5 当前A]  [TurnTimer 01:12] [B金币] |
+------------------------------------------------------------+
|                                                            |
|                                                            |
|               PixiJS 战斗画布                              |
|      768×768 逻辑主视口 + 可缩放 / 可滚动大地图            |
|                                                            |
|                                                            |
+------------------------------------------------------------+
|  侧栏: 小地图 / 单位信息卡 / 动作面板 / 招募面板             |
|  右下: [结束回合] [投降]                                    |
+------------------------------------------------------------+
```

React 组件层次：

```jsx
<BattlePage>
  <BattleCanvas />               {/* 承载 PIXI */}
  <BattleHUD>
    <TurnBar>
      <GoldDisplay side="A" />
      <TurnIndicator />
      <TurnTimer />
      <GoldDisplay side="B" />
    </TurnBar>
    <Sidebar>
      <MiniMap />
      <ZoomControls />
      {selectedUnit && <UnitInfoCard unit={selectedUnit} />}
      {selectedUnit && <UnitActionPanel />}
      {recruitPanelOpen && <RecruitPanel />}
    </Sidebar>
    <BottomBar>
      <EndTurnButton />
      <SurrenderButton />
    </BottomBar>
  </BattleHUD>
  {matchEnded && <MatchResultModal />}
</BattlePage>
```

## 6. PixiJS 渲染层

### 6.1 `BattleCanvas.tsx`

```tsx
export function BattleCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const battleStore = useBattleStore();

  useEffect(() => {
    const scene = new BattleScene({
      container: ref.current!,
      assetProvider: createAssetProvider(env.ASSET_PROVIDER),
      store: battleStore,
    });
    scene.mount();
    return () => scene.destroy();
  }, []);

  return <div ref={ref} className="battle-canvas" />;
}
```

### 6.2 `BattleScene.ts`

```typescript
export class BattleScene {
  private app: PIXI.Application;
  private board: BoardRenderer;
  private units: UnitRenderer;
  private fx: FxRenderer;
  private input: InputController;
  private controller: BattleController;

  constructor(opts: {
    container: HTMLElement;
    assetProvider: AssetProvider;
    store: BattleStoreApi;
  }) {
    this.app = new PIXI.Application({ width: 768, height: 768, backgroundColor: 0x1a1a1a, antialias: true });
    opts.container.appendChild(this.app.view as any);

    const world = new PIXI.Container();
    this.app.stage.addChild(world);

    this.board = new BoardRenderer(world, opts.assetProvider);
    this.units = new UnitRenderer(world, opts.assetProvider);
    this.fx = new FxRenderer(world);
    this.input = new InputController();
    this.controller = new BattleController(opts.store, this.board, this.units, this.fx, this.input);
  }

  mount() { this.controller.bind(); }
  destroy() { this.controller.unbind(); this.app.destroy(true); }
}
```

### 6.3 `BoardRenderer`

- 渲染**完整世界地图**（每格 64px），并通过相机偏移 + 当前缩放后的有效视口把世界裁进 `768×768` 逻辑主视口
- 渲染地形：平地 / 资源点 / 前哨站 / 基地
- 高亮层：可移动格（蓝色半透明）、可攻击格（红色半透明）、技能目标格（绿色半透明）
- 悬停描边：白色
- 显示尺寸与相机有效视口共同决定 world transform；`screenToPosition` / `positionToScreen` 必须感知缩放

```typescript
class BoardRenderer {
  private tileSize = 64;
  private camera: BattleCamera | null;
  private container: PIXI.Container;

  renderMap(tiles: Tile[][]): void;
  setCamera(camera: BattleCamera): void;
  highlightTiles(positions: Position[], color: 'move' | 'attack' | 'ability'): void;
  clearHighlights(): void;
  positionToScreen(p: Position): { x: number; y: number };
  screenToPosition(x: number, y: number): Position | null;
}
```

### 6.4 `UnitRenderer`

- 渲染单位，附带血条与中毒层数徽记
- 管理单位的增删（招募、死亡）
- 移动动画（线性插值，200ms）
- 攻击动画（前冲 + 复位，150ms）
- 受击动画（红闪 + 血条变化）

```typescript
class UnitRenderer {
  private unitViews: Map<string, UnitView>;   // unitId -> PIXI.Container

  syncWithState(state: BattleState): void;    // diff 当前 view 与 state，增删
  animateMove(unitId: string, from: Position, to: Position, path: Position[]): Promise<void>;
  animateAttack(attackerId: string, targetPos: Position): Promise<void>;
  animateDamage(unitId: string, damage: number, hpAfter: number): Promise<void>;
  animateDeath(unitId: string): Promise<void>;
  animateRecruit(unit: Unit): Promise<void>;
}
```

### 6.5 `FxRenderer`

- 浮动伤害数字
- 中毒脉冲（紫绿闪烁）
- 基地血条（单独渲染）
- 回合开始时的"TURN A / TURN B"大字覆盖层（淡入淡出）
- 跟随 `world` 容器一起移动，不自行计算相机偏移

### 6.6 `InputController`

- 监听 Pixi 的 `pointerdown / pointermove` 事件
- 将**视口屏幕坐标**转为**世界棋盘坐标**
- 监听 `W / A / S / D` 并按帧输出相机平移量
- 监听 canvas `wheel` 事件，将滚轮方向归一化为缩放步进，并以鼠标在画布中的归一化位置作为缩放锚点
- 通过回调通知 `BattleController`

```typescript
class InputController {
  onTileClick?: (p: Position) => void;
  onTileHover?: (p: Position | null) => void;
  onCameraPan?: (dx: number, dy: number) => void;
  onZoom?: (direction: 'in' | 'out', anchorNormX: number, anchorNormY: number) => void;
  bind(stage: PIXI.Container, board: BoardRenderer, view: HTMLCanvasElement): void;
  unbind(): void;
}
```

### 6.7 `BattleController`

这是 **PIXI 与 zustand 的桥**：
- 订阅 `battleStore` 变更 → 驱动渲染层
- 接收 `InputController` 事件 → 调用 `battleStore` 方法
- 订阅客户端 `camera` 状态 → 更新 `world` 容器偏移、缩放与小地图视口框
- 消费 `pendingEvents` 队列 → 串行播放动画

```typescript
class BattleController {
  private unsubscribes: Array<() => void> = [];
  private animationQueue: GameEvent[] = [];
  private isPlaying = false;

  bind() {
    this.unsubscribes.push(
      useBattleStore.subscribe(
        s => s.engine?.state,
        (state) => this.onStateChanged(state!),
      ),
      useBattleStore.subscribe(
        s => s.selectedUnitId,
        () => this.updateHighlights(),
      ),
      useBattleStore.subscribe(
        s => s.pendingEvents.length,
        () => this.drainAnimationQueue(),
      ),
    );

    this.input.onTileClick = (p) => this.handleTileClick(p);
  }

  private handleTileClick(pos: Position) {
    const store = useBattleStore.getState();
    const state = store.engine!.state;
    const unit = findUnitAt(state, pos);

    if (store.phase === 'idle' && unit && unit.owner === store.mySide && !unit.hasActed) {
      store.selectUnit(unit.id);
    } else if (store.phase === 'unit_selected') {
      if (store.actionMode?.startsWith('ability:') && isInAttackRange(pos, store.abilityTargets)) {
        const abilityId = store.actionMode.slice('ability:'.length);
        if (abilityId === 'heal') {
          if (unit && unit.owner === store.mySide) {
            store.requestAbility(abilityId, unit.id);
          }
        } else {
          store.requestAbility(abilityId, undefined, pos); // 允许空地中心技能，如 poison_burst
        }
      } else if (store.actionMode === 'attack' && isInAttackRange(pos, store.attackableTargets)) {
        if (unit && unit.owner !== store.mySide) {
          store.requestAttack(unit.id);
        } else {
          store.requestAttack(undefined, pos);
        }
      } else if (isInMovableTiles(pos, store.movableTiles)) {
        store.requestMove(pos);
      } else {
        store.clearActionMode();
      }
    }
    // 补充：点击空的己方基地或己方前哨站 → 打开对应建筑的招募面板；
    // 如果前哨站上已有单位，单击仍优先选中/查看单位，不抢占点击。
  }

  private async drainAnimationQueue() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    while (useBattleStore.getState().pendingEvents.length > 0) {
      const ev = useBattleStore.getState().pendingEvents[0];
      await this.playEvent(ev);
      useBattleStore.setState(s => ({ pendingEvents: s.pendingEvents.slice(1) }));
    }
    this.isPlaying = false;
  }
}
```

当前交互规则补充：
- 点击**空的己方基地**或**空的己方已占领前哨站**，会直接打开对应来源建筑的招募面板
- 点击**站着单位的己方前哨站**，仍优先进入单位选择/查看流程
- 当当前聚焦的己方单位正站在己方前哨站上时，底部 `招募` 按钮会改为从该前哨站招募，按钮文案变为 `前哨站招募`
- `RecruitPanel` 打开后会显示当前建筑来源，且继续沿用服务端权威的 `ACTION_RECRUIT { source, spawnAt }` 协议

### 6.8 `FogRenderer`（战争迷雾覆盖层）

位于 BoardRenderer 之上、UnitRenderer 之下（层级 2）。

```typescript
class FogRenderer {
  /**
   * 根据可见格子集合更新迷雾覆盖。
   * @param visibleTiles "x,y" 字符串数组，来自 BattleState.fog?.visibleTiles
   *                     传入 null 表示禁用迷雾（离线/调试模式），清空遮罩
   */
  render(visibleTiles: string[] | null, mapWidth: number, mapHeight: number): void;
  destroy(): void;
}
```

**渲染策略：**
- 对不在 `visibleTiles` 集合中的每个格子，绘制 `0x000000, alpha=0.72` 的填充方块
- 使用单张 `PIXI.Graphics` 一次性批量绘制，性能优于逐格对象
- 内部缓存上一次的 `visibleTiles` 字符串 key，无变化时跳过重绘
- `fog === undefined`（离线模式）时传入 `null`，不渲染任何遮罩

**与 BattleController 的集成：**
- 初始化时调用 `fogRenderer.render(state.fog?.visibleTiles ?? null)`
- 状态快照更新时同步迷雾（`STATE_SNAPSHOT` 到达后）
- 动画播完后再次刷新（单位移动后视野变化）

**HUD 中的配合：**
- `GoldDisplay`：当 `state.fog != null && fog.perspective !== side` 时，对手金币显示 `?`
- `MiniMap`：显示全图地形、当前可见单位与当前主视口框；点击后调用 `jumpCameraToTile`
- `ZoomControls`：常驻在小地图下方，提供 `- / 100% / +` 控件；按钮缩放以屏幕中心为锚点

### 6.10 `AssetProvider` 接口

```typescript
export interface UnitSpriteHandle {
  container: PIXI.Container;
  playIdle(): void;
  playAttack(): Promise<void>;
  playHurt(): Promise<void>;
  playDeath(): Promise<void>;
}

export interface AssetProvider {
  getTileSprite(type: TileType, size: number): PIXI.Container;
  getBaseSprite(side: 'A' | 'B', size: number): PIXI.Container;
  createUnitSprite(type: UnitType, side: 'A' | 'B', size: number): UnitSpriteHandle;
  getResourcePointSprite(size: number): PIXI.Container;
}
```

### 6.11 `PrimitiveAssetProvider`（MVP）

- 平地：`PIXI.Graphics` 画浅绿填充 + 深绿边框
- 资源点：平地 + 黄色菱形
- 基地：大灰块 + 边框（A 金边，B 银边）+ 血条
- 单位：圆形（战红/弓绿/法紫/骑蓝）+ 文字（"战"/"弓"/"法"/"骑"）+ 边框区分阵营
- 动画：位移 tween + scale 脉冲

所有图形都用 `PIXI.Graphics` + `PIXI.Text`，无外部资源依赖。

### 6.12 `PixelAssetProvider`（MVP 后可选）

- 加载 `public/sprites/units.png` + `public/sprites/units.json`（atlas）
- 返回 `PIXI.AnimatedSprite`，帧序列：idle / attack / hurt / death
- 替换逻辑：在 `BattleScene` 构造时通过 `env.ASSET_PROVIDER === 'pixel'` 切换
- **其它代码零改动**（这是 AssetProvider 抽象的关键价值）

## 7. API 层

### 7.1 `api/http.ts`

```typescript
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10_000,
});

http.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/';
    }
    return Promise.reject(err);
  },
);
```

### 7.2 `api/auth.ts`

```typescript
export async function loginAsGuest(nickname?: string) {
  const { data } = await http.post('/auth/guest', { nickname });
  return data as { token: string; user: UserDto };
}
```

## 8. Socket 层

### 8.1 `socket/client.ts`

```typescript
let socket: Socket<Server2ClientEvents, Client2ServerEvents> | null = null;

export function connectGameSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket = io(`${import.meta.env.VITE_SOCKET_URL}/game`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function getGameSocket(): Socket | null { return socket; }
export function disconnectGameSocket() { socket?.disconnect(); socket = null; }
```

### 8.2 订阅的时机

- **登录后** `authStore.loginAsGuest` 完成 → `connectGameSocket(token)`
- **全局订阅**：`MATCH_FOUND`, `MATCH_START`, `MATCH_ENDED`, `OPPONENT_DISCONNECTED`, `OPPONENT_RECONNECTED`
- **BattlePage 内订阅**：`EVENT_BATCH`, `TURN_CHANGED`, `STATE_SNAPSHOT`

## 9. 样式

- Tailwind CSS 负责 HUD / 按钮 / 弹窗
- PixiJS 画布保持 `768×768` 逻辑主视口；实际显示尺寸可随容器缩放，大地图通过相机平移与缩放展示
- 响应式：移动端警告"请使用桌面浏览器"（MVP 不做触控优化）

## 10. 性能与品质要求

- **FPS**：稳定 60 fps（PixiJS 默认）
- **HMR**：Vite 支持，修改 UI 无需重新开局
- **包体积**：MVP 主包 < 500KB gzipped（PixiJS 较大，可 dynamic import 战斗页面）
- **首屏**：登录页应在 2s 内可交互

## 11. 单机调试模式（离线对 AI）

为了方便开发调试，提供一个**不依赖后端**的离线模式：

- 在 `/debug-battle` 路由（开发环境专用）
- 不创建 socket，只在浏览器里实例化 `BattleEngine`
- 对方 AI 用最简策略：每回合随机选一个单位，向最近敌人移动然后攻击
- 用于验证规则引擎、渲染、交互

## 12. 开发脚本（`package.json`）

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx"
  }
}
```

根目录 `package.json`：

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel --filter=@chesspvp/client --filter=@chesspvp/server run dev",
    "build": "pnpm -r run build",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint"
  }
}
```
