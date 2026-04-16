# 08 - 开发里程碑与执行清单

> **本文件是给 Sonnet 的实施手册**。严格按 M0 → M7 顺序执行。每个里程碑结束时必须跑一次：
> ```
> pnpm -r typecheck && pnpm -r lint && pnpm -r test
> ```
> 以及对应的"验收"小节，全通过后才能进入下一个 M。

## 当前实现状态（2026-04-13）

- M0-M6 已完成，联机 MVP 可运行
- 在原始 MVP 范围之上，已提前落地一部分内容扩展：
  - 新兵种 `priest`
  - 新兵种 `gunner`
  - 通用能力动作 `USE_ABILITY`
  - 前端显式动作模式（攻击 / 技能）
  - 默认地图当前为 `frontier_30`（30×30），保留 `frontier_40`（40×40）作为回归 / 对照图
  - 客户端固定主视口、`WASD` 相机与小地图
  - 固定维护费经济、基础收入 +6、人口上限 16
- M7 像素素材替换仍未开始；本文件其余部分保留原始实施顺序，供后续大改时参考

## 总览

| 里程碑 | 主题 | 交付物 | 是否阻塞下一步 |
|---|---|---|---|
| **M0** | 项目基建 | Monorepo + docker + CI 跑通 | 是 |
| **M1** | 共享规则引擎 | `@chesspvp/shared` 完整可用 + 测试全绿 | **是（非常关键）** |
| **M2** | 前端单机原型 | 离线对 AI 能打完一局 | 是 |
| **M3** | 后端 + 实时对战 | 两浏览器手动配对可打完 | 是 |
| **M4** | 匹配系统 | 点击匹配自动进战斗 | 是 |
| **M5** | 断线重连 + 时钟 | 刷新后能回来，超时判负 | 是 |
| **M6** | UI 打磨 + 游客账号 | MVP 完成 | **MVP 截止** |
| **M7** | 像素素材替换 | 可选美化 | 否 |

---

## M0 — 项目基建

### 目标
建立 monorepo 骨架、Docker 环境、共享工程配置、CI 可运行。

### 任务
1. **初始化 pnpm workspace**
   ```bash
   mkdir chesspvp && cd chesspvp
   pnpm init
   ```
   创建 `pnpm-workspace.yaml`：
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```
2. **根目录 `package.json`** 添加 scripts：
   ```json
   {
     "name": "chesspvp",
     "private": true,
     "scripts": {
       "dev": "pnpm -r --parallel --filter=@chesspvp/client --filter=@chesspvp/server run dev",
       "build": "pnpm -r run build",
       "typecheck": "pnpm -r run typecheck",
       "test": "pnpm -r run test",
       "lint": "pnpm -r run lint"
     }
   }
   ```
3. **建 `tsconfig.base.json`** 放根目录，其他项目 `extends`。
4. **建 `.eslintrc.cjs`** + `.prettierrc`，规则参考 @typescript-eslint/recommended + prettier。
5. **创建 `packages/config`**：放 eslint-preset、tsconfig.base。
6. **创建 `packages/shared` 骨架**（仅 package.json + tsconfig + src/index.ts）。
7. **创建 `apps/server` 骨架**：
   - `package.json`（依赖 fastify / prisma / socket.io / ioredis / jose / zod / pino / tsx / vitest）
   - `tsconfig.json`
   - `src/index.ts`（仅 `console.log('server')`）
   - `prisma/schema.prisma` 基础内容（只含 generator + datasource，不建 model）
8. **创建 `apps/client` 骨架**：
   ```bash
   pnpm create vite apps/client --template react-ts
   ```
   装依赖：`pixi.js socket.io-client axios zustand react-router-dom tailwindcss postcss autoprefixer`
   初始化 tailwind。
9. **`docker-compose.yml`** 按 `02-architecture.md` §5。
10. **`.env.example`** 按 `02-architecture.md` §4。
11. **根 `README.md`** 简单写几行跑起来的步骤。
12. **`.gitignore`**：`node_modules/ dist/ .env .env.local pgdata/`。

### 验收
- [ ] `pnpm install` 成功
- [ ] `docker compose up -d` 起 postgres + redis
- [ ] `pnpm -r typecheck` 通过（各 app 的空骨架）
- [ ] `pnpm --filter @chesspvp/server dev` 能启动并打印 "server"
- [ ] `pnpm --filter @chesspvp/client dev` 能启动并打开空的 Vite 页面

---

## M1 — 共享规则引擎

### 目标
完成 `@chesspvp/shared`，包含类型、配置、`BattleEngine` 全部逻辑，单元测试 100% 覆盖核心规则。

**这一步决定整个项目的正确性，务必质量第一。**

### 任务
1. **类型定义** (`src/types/battle.ts`, `action.ts`, `event.ts`, `configs.ts`)
   严格按 `03-data-model.md` §5 和 `05-shared-engine.md` §2。
2. **配置 JSON** (`src/configs/units.json`, `maps.json`, `balance.json`)
   按 `03-data-model.md` §4 原样录入。
3. **配置导出** (`src/configs/index.ts`)
   导出强类型 `UNITS / MAPS / BALANCE`。
4. **引擎实现**：
   - `initialState.ts` — 从地图构造初始 `BattleState`
   - `utils.ts` — deepClone / manhattan / get4Neighbors / key / isInBounds
   - `pathfinding.ts` — BFS `computeMovableTiles`
   - `combat.ts` — 伤害公式 + `computeAttackableTargets` + 克制
   - `recruit.ts` — `tryRecruitOrder` + `executePendingRecruit`
   - `turn.ts` — `beginTurn` 结算
   - `victory.ts` — `checkVictory`
   - `validators.ts` — `validateAction`
   - `applyAction.ts` — 统一 action dispatcher
   - `BattleEngine.ts` — 包装上述为类
5. **单元测试** (`tests/*.test.ts`) 按 `05-shared-engine.md` §9 清单编写：
   - `pathfinding.test.ts`（≥ 6 个用例）
   - `combat.test.ts`（≥ 5 个用例）
   - `recruit.test.ts`（≥ 6 个用例）
   - `victory.test.ts`（≥ 3 个用例）
   - `engine.test.ts`（完整回合 ≥ 2 个用例）
   - `replay.test.ts`（至少 1 个 20 动作的回放用例）
6. **协议类型** (`src/protocol/rest.ts`, `socket.ts`)
   按 `04-protocol.md` §6 完整定义。
7. **统一导出** (`src/index.ts`)。

### 验收
- [ ] `pnpm --filter @chesspvp/shared test` 全部通过
- [ ] `pnpm --filter @chesspvp/shared typecheck` 通过
- [ ] 能在 Node REPL 里 `new BattleEngine(createInitialState(...)).apply(...)` 跑通
- [ ] `BattleEngine.replay(initial, actions)` 结果与原 engine 状态严格相等（JSON.stringify 对比）
- [ ] 引擎**不引用**任何 Node 专属 API（fs / path / http），以便在浏览器运行

### 常见坑
- 忘记 `immer` 的 `produce` 返回值要被赋值给新变量
- 基地格不允许任何单位停留（包括己方）
- 招募后单位的 `spawnedThisTurn` 仅用于“刚招募”状态标记，不阻止当回合行动
- 伤害计算顺序：先基础伤害（min 1），再乘克制，再 `max(1, floor())`

---

## M2 — 前端单机原型（纯色块）

### 目标
在**不起后端**的情况下，前端能完整演示一局战斗（对弱 AI 或自己跟自己打），用于验证规则引擎与渲染。

### 任务
1. **Vite 配置** `vite.config.ts`：设置 `@chesspvp/shared` 为 workspace alias
2. **路由骨架** (`router.tsx`)
3. **LoginPage / LobbyPage** 放一个占位按钮跳 `/debug-battle`（dev only）
4. **创建 `store/battleStore.ts`**：
   - 初始化接受 `BattleState`
   - 暴露 `selectUnit / requestMove / requestAttack / requestRecruit / requestEndTurn`
   - **不接 socket**，直接 `engine.apply` 本地跑
5. **PixiJS 渲染层** (`src/battle/`)：
   - `BattleScene`
   - `BoardRenderer`
   - `UnitRenderer`
   - `FxRenderer`
   - `InputController`
   - `BattleController`
   - `assets/PrimitiveAssetProvider.ts`
6. **UI 组件**：
   - `BattleCanvas.tsx`
   - `BattleHUD.tsx`
   - `TurnTimer.tsx`（显示本地倒计时）
   - `UnitInfoCard.tsx`
   - `RecruitPanel.tsx`
   - `GoldDisplay.tsx`
   - `EndTurnButton.tsx`
   - `MatchResultModal.tsx`
7. **占位 AI** (`src/debug/dummyAi.ts`)：
   - 回合开始时遍历己方每个可行动单位
   - 随机选一个敌人，向其寻路一步
   - 在射程内则攻击
   - 结束回合
8. **调试页** `/debug-battle`：
   - 初始化 `BattleEngine`（用当前默认地图 `DEFAULT_BATTLE_MAP_ID` + 两个假 userId）
   - 玩家控制 A，AI 控制 B
   - 每次玩家 `END_TURN` 后 AI 自动走

### 验收
- [ ] 浏览器打开 `/debug-battle` 显示完整棋盘
- [ ] 可以点选己方单位，显示可移动/可攻击范围
- [ ] 可以移动、攻击、招募
- [ ] 结束回合后 AI 自动行动
- [ ] 摧毁对方基地后弹出结算弹窗
- [ ] 纯色块渲染正常，动画（移动/攻击/受击）流畅
- [ ] FPS ≥ 55

---

## M3 — 后端 + 实时对战

### 目标
搭建后端全部基础设施；通过 debug 端点手动配对两个浏览器，打完一局数据入库。

### 任务
1. **Prisma schema** 按 `03-data-model.md` §2 完整录入
2. `pnpm --filter @chesspvp/server prisma migrate dev --name init`
3. **`src/config.ts`** 读 env
4. **`src/app.ts` + `src/index.ts`** 启动 Fastify
5. **插件**：prisma / redis / cors
6. **Auth**：
   - `auth/jwt.ts`
   - `auth/authHook.ts`
   - `auth/guest.ts`
   - `routes/auth.ts` `POST /guest`
   - `routes/me.ts` `GET /me`
7. **Configs**：`routes/configs.ts` `GET /units/maps/balance`（直接转发 shared 包的配置）
8. **Socket.IO**：
   - `socket/server.ts`
   - `socket/middleware.ts`
   - `socket/gameNamespace.ts`（先只挂空 handler）
9. **Room / RoomManager / Clock**（`07-backend.md` §7）完整实现
10. **Debug 端点**（仅 NODE_ENV=development）：
    ```
    POST /api/v1/debug/create-match  { userAId, userBId }
    ```
    直接走 `Matchmaker.createMatch` 的逻辑
11. **前端改造**：
    - `api/http.ts` + `api/auth.ts`
    - `LoginPage` 真正调用 `/auth/guest`
    - 创建 socket 连接
    - `LobbyPage` 加个"调用 debug 配对"按钮（开发态）
    - `BattlePage` 初始化 `battleStore`，但这次 **不本地 apply**，只监听 `EVENT_BATCH` + `STATE_SNAPSHOT`
    - 订阅 `MATCH_FOUND / MATCH_START / EVENT_BATCH / TURN_CHANGED / MATCH_ENDED`
    - 玩家操作发 `ACTION_*` socket 事件
12. **DB 落地**：对局结束时 `persistMatch` 写 `matches` + `match_replays`

### 验收
- [ ] 打开两个浏览器，各登录 → 调用 debug 端点创建对局 → 双方都进入战斗
- [ ] 玩家操作会通过 socket 发到服务器，服务器广播事件，双方同步
- [ ] 非法操作（点对方单位）会被服务器 ack 拒绝，UI 不抖动
- [ ] 打完一局后，`SELECT * FROM matches; SELECT * FROM match_replays;` 有记录
- [ ] 回放能用 `BattleEngine.replay(match_replays.initial_state, match_replays.actions)` 重建到同样的最终状态（写一个 Node 脚本验证）

---

## M4 — 匹配系统 + 大厅

### 目标
用户不再通过 debug 端点，而是点击"开始匹配"自动配对进入战斗。

### 任务
1. **Matchmaker**（`matchmaking/Matchmaker.ts`）完整实现
2. **路由** `/matchmaking/join` `/matchmaking/leave`
3. **前端 `matchmakingStore`** + `MatchmakingPage`
4. **`LobbyPage` 改造**：开始匹配按钮 → `enterQueue` → 跳 `/matchmaking`
5. **`MATCH_FOUND` 推送**：服务器在 Matchmaker 配对后通过 `user:<id>:socket` 定位 socket 推送；前端收到后显示对手信息并倒计时 3 秒自动 `MATCH_READY`
6. **去掉 M3 的 debug 配对按钮**（保留后端端点）

### 验收
- [ ] A 客户端点"开始匹配" → "正在寻找对手" → (B 登录并点击匹配) → 显示对手昵称 → 3 秒后进入战斗
- [ ] 取消匹配按钮工作正常
- [ ] 单用户重复点匹配会被拒绝（409）
- [ ] Matchmaker 对 queue 的并发扫描是原子的（压力测试：开 4 个客户端同时点匹配，应该得到 2 场而不是 3 场冲突）

---

## M5 — 断线重连 + 时钟完善

### 目标
实现 30 秒宽限期重连、完整象棋时钟、超时自动结束、投降按钮。

### 任务
1. **`Room.onDisconnect / onReconnect / onReconnectTimeout`** 完整实现
2. **`STATE_SNAPSHOT`** 和 `REQUEST_SNAPSHOT` 响应（返回按请求玩家视角过滤的状态）
3. **前端 socket 重连钩子**：
   - socket.io-client 自带重连
   - 断开时 `battleStore` 进入 `reconnecting` 态，显示 overlay
   - 重连成功后发 `REQUEST_SNAPSHOT` 收到 `STATE_SNAPSHOT` 后恢复
4. **Room 回合超时逻辑**：`setTimeout(onTurnTimeout, turnDeadline - now)`
5. **`Clock.drainReserve`** 正确扣减备用时间
6. **备用时间耗尽 → `endMatch('timeout')`**
7. **投降按钮**：`ACTION_SURRENDER` 前后端实现
8. **前端**：`TurnTimer` 显示回合时间 + 备用时间双 bar

### 验收
- [ ] 玩家 A 在战斗中刷新浏览器 → 回到原战斗位置，HUD/棋盘都正确
- [ ] 玩家 A 关闭标签页 30 秒 → 服务器推 `OPPONENT_DISCONNECTED` 给 B，30 秒后 `MATCH_ENDED { reason: 'timeout' }`
- [ ] 回合超时（75 秒不操作）→ 自动 `END_TURN`，扣备用时间
- [ ] 备用时间耗尽 → 判负
- [ ] 点击投降 → 立即结算

---

## M6 — UI 打磨 + MVP 收尾

### 目标
所有流程跑通，界面可看，准备内部 demo。

### 任务
1. **登录页美化**：标题 + 游客按钮 + 版本号
2. **大厅页美化**：用户卡片（头像占位、昵称、战绩）+ 开始匹配 + 最近战报占位
3. **战斗 HUD 美化**：
   - 金币图标 + 数字
   - 回合指示条（箭头指向当前玩家）
   - 双色时间条
   - 招募面板改成网格 + 兵种图标（色块）+ 价格 + disabled 态
   - 单位信息卡：血条 + 攻防射程 + 兵种图标
4. **`MatchResultModal`**：胜/负图标 + 对局时长 + "返回大厅" 按钮
5. **全局 Toast 系统**：`components/ui/Toast.tsx` + 全局 `toastStore`
6. **错误处理**：
   - 网络错误 → Toast
   - 服务器拒绝动作 → Toast 显示 reason 对应的中文文案
7. **国际化预留**：所有文案走 `i18n` 字典（至少建一个 `zh.ts` 常量表）
8. **README.md 完善**：如何起服、如何跑测试、如何 demo

### 验收
- [ ] 走通完整流程：打开浏览器 → 登录 → 匹配 → 战斗 → 结算 → 回大厅 → 再战一局
- [ ] UI 在 1920×1080 与 1366×768 下都不破版
- [ ] 所有文案是中文
- [ ] 所有提示友好
- [ ] MVP 完成 ✅

**此时 MVP 全部完成，符合 `10-acceptance.md` 的验收标准。**

---

## M7 — 像素素材替换（可选）

### 目标
在不改动其它代码的情况下，把纯色块单位替换成 2D 像素精灵图。

### 任务
1. 准备 `units.png` spritesheet（建议规格 32×32/格，动作帧 idle-4 / attack-4 / hurt-2 / death-4）
2. 导出 `units.json` atlas（或直接 PIXI Assets 自动切分）
3. 准备地形 `tiles.png`：平地 / 资源点 / 基地 A / 基地 B
4. 实现 `PixelAssetProvider.ts`：
   - 在构造时 `PIXI.Assets.load` 资源
   - `createUnitSprite` 返回 `PIXI.AnimatedSprite` + 封装的 `UnitSpriteHandle`
   - `playIdle / playAttack / playHurt / playDeath` 切换动作帧序列
5. 在 `BattleScene` 构造前根据 `import.meta.env.VITE_ASSET_PROVIDER === 'pixel'` 选择 Provider
6. `.env.development` 设 `VITE_ASSET_PROVIDER=primitive`，`.env.production` 设 `pixel`

### 验收
- [ ] 切换到 pixel 模式后界面美术效果显著提升
- [ ] 切回 primitive 模式功能无差异
- [ ] 资源加载失败时有合理 fallback（回退纯色块）

---

## 可跳跃的扩展里程碑（MVP 之外，给完整产品）

| M | 主题 | 依赖 |
|---|---|---|
| M8 | 邮箱注册 + 登录 | M6 |
| M9 | ELO 天梯 + 排行榜 | M6 |
| M10 | 好友 + 邀请对战 | M8 |
| M11 | 战报回放播放器 | M6 |
| M12 | 运营后台（账号/配置/禁赛） | M8 |
| M13 | 更多地图 / 兵种 / 技能系统 | M1 |
| M14 | 观战模式 | M3 |
| M15 | 排位赛季 + 奖励 | M9 |

---

## 每个 M 结束的通用验收命令

```bash
# 代码层
pnpm -r typecheck
pnpm -r lint
pnpm -r test

# 运行层
docker compose up -d
pnpm dev
# 手动点击走完当前 M 的用户故事
```

---

## 给 Sonnet 的硬约束

1. **规则与数值不得硬编码**：所有数值从 `UNITS / BALANCE / MAPS` 取。
2. **前后端不得重复实现规则**：任何规则修改都应该在 `@chesspvp/shared` 里。
3. **不得使用 `Math.random` / `Date.now()` 在 BattleEngine 内**：保持确定性。
4. **客户端不得修改 `battleStore.engine.state`**：离线调试只能通过 `engine.apply(...)`，联机模式通过 `STATE_SNAPSHOT` 重建。
5. **任何 socket action 在服务器都必须先 `engine.validate`**：不信任客户端。
6. **所有 Prisma 查询必须带 `where`**：防止越权读取。
7. **路由加 `/api/v1` 前缀**：预留版本升级。
8. **每个 M 结束才能进入下一个**：不要跨级修 bug，否则回归会很头疼。
