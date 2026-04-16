# 02 - 系统架构

## 1. 宏观架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                          浏览器 (Client)                          │
│                                                                   │
│  ┌────────────────┐   ┌─────────────────┐   ┌─────────────────┐ │
│  │  React UI      │   │  zustand Store  │   │   PixiJS Scene  │ │
│  │  (路由/HUD/    │◄─►│  (auth/battle/  │◄─►│  (棋盘/单位/    │ │
│  │   大厅/小地图) │   │   camera/       │   │   相机/动画/输入)│ │
│  │                │   │   matchmaking)  │   │                 │ │
│  └───────┬────────┘   └────────┬────────┘   └─────────────────┘ │
│          │                     │                                 │
│          │         ┌───────────▼────────────┐                    │
│          │         │  @chesspvp/shared      │                    │
│          │         │  BattleEngine          │                    │
│          │         │  (范围查询 / 回放)     │                    │
│          │         └────────────────────────┘                    │
│          │                     │                                 │
│      HTTP│              Socket.IO                                 │
└──────────┼─────────────────────┼─────────────────────────────────┘
           │                     │
           ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                        服务器 (Server)                           │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Fastify REST   │  │  Socket.IO      │  │   Matchmaker    │  │
│  │  (auth/matches/ │  │  /game 命名空间  │  │   (Redis Queue) │  │
│  │   configs)      │  │                 │  │                 │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           │        ┌───────────▼──────────┐         │            │
│           │        │  RoomManager         │◄────────┘            │
│           │        │    ↳ Room (per match)│                      │
│           │        │         ↳ BattleEngine (权威)               │
│           │        │         ↳ Clock                             │
│           │        └───────────┬──────────┘                      │
│           │                    │                                  │
│  ┌────────▼────────┐  ┌────────▼────────┐                        │
│  │     Prisma      │  │      Redis      │                        │
│  │  (PostgreSQL)   │  │  (ioredis)      │                        │
│  │  users/matches/ │  │  sessions/      │                        │
│  │  replays/...    │  │  queue/rooms    │                        │
│  └─────────────────┘  └─────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

## 2. 数据流：一次行动的生命周期

以玩家点击"移动单位 U 到 (5, 4)" 为例：

```
[1] 客户端 BattlePage
     ↓ onClick 空格
[2] battleStore.requestMove({x:5,y:4})
     ↓ 客户端只做本地合法范围查询，不做乐观 apply
[3] socket.emit('ACTION_MOVE', { matchId, unitId, to })
     ↓
[4] 服务器 gameNamespace 收到
     ↓
[5] RoomManager.getRoomByUser(userId).handleAction(userId, action)
     ↓
[6] Room.handleAction:
       ├── 校验：是当前玩家吗？action 合法吗？（engine.validate）
       │     ├── 不合法 → emit ACTION_REJECTED 给发起者
       │     └── 合法 ↓
       ├── engine.apply(action) → { events, newState }
       ├── 持久化：actionLog.push(action), Redis RPUSH
       ├── 广播：gameNs.to(roomId).emit('EVENT_BATCH', { seq, events })
       └── 返回 ack
     ↓
[7] 双方客户端收到 EVENT_BATCH
       ├── 追加到待播放事件队列
       └── 等待后续 STATE_SNAPSHOT 同步引擎状态
```

**关键点**：当前客户端不做乐观预测；**服务器广播的 events 与 snapshot 才是真相**。

## 2.1 生产部署拓扑（当前实现）

当前生产环境不再让 CVM 直接访问 GitHub 拉源码，而是走镜像发布链路：

```
GitHub main
  ↓ push
GitHub Actions
  ├── CI: typecheck / lint / test / build
  ├── build web image
  ├── build server image
  └── push -> Tencent TCR
                ↓
             SSH deploy
                ↓
Tencent CVM
  ├── web (Nginx, port 80)
  ├── server (Fastify + Socket.IO, internal only)
  ├── postgres (internal only)
  └── redis (internal only)
```

约束固定为：

- 浏览器只访问 `web` 容器暴露的 `80`
- `/api/v1` 与 `/socket.io` 由 `web` 同源反代到 `server`
- `server`、`postgres`、`redis` 不对公网开放端口
- 首次验收使用公网 IP + HTTP；域名、HTTPS、备案留给后续阶段

## 3. Monorepo 详细结构

```
chesspvp/
├── package.json                     # workspace root
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json               # 所有 TS 项目继承
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── .env.example
├── docker-compose.yml               # 开发：postgres + redis
├── docker-compose.prod.yml          # 生产：web + server + postgres + redis
├── README.md
│
├── design/                          # 本设计文档
│
├── packages/
│   ├── config/                      # 共享工程配置
│   │   ├── eslint-preset.cjs
│   │   ├── tsconfig.base.json
│   │   └── package.json
│   │
│   └── shared/                      # 共享类型/规则/协议/配置
│       ├── src/
│       │   ├── types/
│       │   │   ├── battle.ts        # BattleState, Unit, Tile, Base, ...
│       │   │   ├── action.ts        # Action 联合类型
│       │   │   ├── event.ts         # Event 联合类型
│       │   │   └── index.ts
│       │   ├── configs/
│       │   │   ├── units.json
│       │   │   ├── maps.json
│       │   │   ├── balance.json
│       │   │   └── index.ts         # 导出为 TS 常量
│       │   ├── engine/
│       │   │   ├── BattleEngine.ts
│       │   │   ├── pathfinding.ts
│       │   │   ├── combat.ts
│       │   │   ├── validators.ts
│       │   │   ├── applyAction.ts
│       │   │   ├── initialState.ts
│       │   │   └── index.ts
│       │   ├── protocol/
│       │   │   ├── rest.ts          # REST DTO
│       │   │   ├── socket.ts        # Socket 事件类型
│       │   │   └── index.ts
│       │   └── index.ts
│       ├── tests/
│       │   ├── engine.test.ts
│       │   ├── pathfinding.test.ts
│       │   ├── combat.test.ts
│       │   └── replay.test.ts
│       ├── package.json
│       └── tsconfig.json
│
└── apps/
    ├── server/                      # Node.js 后端
    │   ├── src/
    │   │   ├── index.ts             # 启动入口
    │   │   ├── config.ts            # 读 env
    │   │   ├── plugins/             # Fastify 插件
    │   │   │   ├── prisma.ts
    │   │   │   ├── redis.ts
    │   │   │   └── cors.ts
    │   │   ├── auth/
    │   │   │   ├── jwt.ts
    │   │   │   ├── authHook.ts
    │   │   │   └── guest.ts
    │   │   ├── routes/
    │   │   │   ├── health.ts
    │   │   │   ├── auth.ts
    │   │   │   ├── me.ts
    │   │   │   ├── matchmaking.ts
    │   │   │   ├── matches.ts
    │   │   │   └── configs.ts
    │   │   ├── matchmaking/
    │   │   │   └── Matchmaker.ts
    │   │   ├── game/
    │   │   │   ├── Room.ts
    │   │   │   ├── RoomManager.ts
    │   │   │   ├── Clock.ts
    │   │   │   └── replayStore.ts
    │   │   ├── socket/
    │   │   │   ├── server.ts
    │   │   │   ├── gameNamespace.ts
    │   │   │   └── middleware.ts
    │   │   └── utils/
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   └── migrations/
    │   ├── Dockerfile              # 生产 server 镜像
    │   ├── package.json
    │   └── tsconfig.json
    │
    └── client/                      # React 前端
        ├── src/
        │   ├── main.tsx
        │   ├── App.tsx
        │   ├── router.tsx
        │   ├── env.ts              # 开发态 host:3001 / 生产 same-origin
        │   ├── api/
        │   │   ├── http.ts          # axios/fetch 封装
        │   │   ├── auth.ts
        │   │   ├── matchmaking.ts
        │   │   ├── matches.ts
        │   │   └── configs.ts
        │   ├── socket/
        │   │   ├── client.ts        # Socket.IO client 封装
        │   │   └── gameSocket.ts
        │   ├── store/
        │   │   ├── authStore.ts
        │   │   ├── matchmakingStore.ts
        │   │   └── battleStore.ts
        │   ├── pages/
        │   │   ├── LoginPage.tsx
        │   │   ├── LobbyPage.tsx
        │   │   ├── MatchmakingPage.tsx
        │   │   ├── BattlePage.tsx
        │   │   └── ReplayPage.tsx   # (预留)
        │   ├── components/
        │   │   ├── ui/              # Button, Modal, Toast...
        │   │   └── battle/
        │   │       ├── BattleHUD.tsx
        │   │       ├── TurnTimer.tsx
        │   │       ├── UnitInfoCard.tsx
        │   │       ├── RecruitPanel.tsx
        │   │       ├── GoldDisplay.tsx
        │   │       ├── MiniMap.tsx
        │   │       ├── ActionMenu.tsx
        │   │       └── MatchResultModal.tsx
        │   ├── battle/              # PixiJS 场景
        │   │   ├── BattleScene.ts
        │   │   ├── BoardRenderer.ts
        │   │   ├── UnitRenderer.ts
        │   │   ├── FxRenderer.ts
        │   │   ├── camera.ts
        │   │   ├── constants.ts
        │   │   ├── InputController.ts
        │   │   ├── BattleController.ts
        │   │   └── assets/
        │   │       ├── AssetProvider.ts           # 接口
        │   │       ├── PrimitiveAssetProvider.ts  # 纯色块实现
        │   │       └── PixelAssetProvider.ts      # (预留)
        │   ├── styles/
        │   │   └── index.css
        │   └── utils/
        ├── public/
        ├── index.html
        ├── vite.config.ts
        ├── tailwind.config.ts
        ├── postcss.config.cjs
        ├── Dockerfile
        ├── package.json
        └── tsconfig.json
```

## 4. 环境变量（`.env.example`）

```
# 公用
NODE_ENV=development

# 客户端
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_SOCKET_URL=http://localhost:3001
VITE_ASSET_PROVIDER=primitive   # primitive | pixel

# 服务器
PORT=3001
DATABASE_URL=postgresql://chesspvp:chesspvp@localhost:5432/chesspvp
REDIS_URL=redis://localhost:6379
JWT_SECRET=change_me_in_prod
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
```

## 5. Docker Compose（本地开发）

`docker-compose.yml` 负责启动 **postgres + redis**；前后端本地 `pnpm dev` 运行（开发态）。

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: chesspvp
      POSTGRES_PASSWORD: chesspvp
      POSTGRES_DB: chesspvp
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports: ["6379:6379"]

volumes:
  pgdata:
```

当前仓库已补生产化构件：`apps/server/Dockerfile`、`apps/client/Dockerfile`、`apps/client/nginx.conf`、`docker-compose.prod.yml`、`scripts/deploy-prod.sh` 与 `.github/workflows/*`。

## 6. 启动方式

```bash
# 1. 安装依赖
pnpm install

# 2. 起 DB
docker compose up -d

# 3. 跑迁移
pnpm --filter @chesspvp/server prisma migrate dev

# 4. 生成 Prisma Client
pnpm --filter @chesspvp/server prisma generate

# 5. 并行启动前后端
pnpm dev    # 根目录脚本：并行跑 server + client

# 访问前端
# http://localhost:5173
```

## 7. 依赖关系图

```
apps/client ─┐
             ├─► packages/shared
apps/server ─┘
```

**`apps/client` 与 `apps/server` 互不依赖**，只通过 HTTP + Socket.IO 协议通信。类型契约通过 `@chesspvp/shared` 共享。

## 8. 通信概览

| 场景 | 协议 | 端点 |
|---|---|---|
| 游客登录 | HTTP | `POST /api/v1/auth/guest` |
| 获取自己信息 | HTTP | `GET /api/v1/me` |
| 加入匹配 | HTTP | `POST /api/v1/matchmaking/join` |
| 离开匹配 | HTTP | `POST /api/v1/matchmaking/leave` |
| 匹配成功通知 | Socket | `MATCH_FOUND` |
| 战斗动作 | Socket | `ACTION_*` |
| 服务器事件广播 | Socket | `EVENT_BATCH` |
| 回合切换 | Socket | `TURN_CHANGED` |
| 战斗结束 | Socket | `MATCH_ENDED` |
| 获取回放 | HTTP | `GET /api/v1/matches/:id/replay` |
| 获取配置 | HTTP | `GET /api/v1/configs/units` |

详见 `04-protocol.md`。

## 9. 鉴权与会话

- **注册/登录** → 颁发 **JWT**（HS256，7 天过期）
- JWT Payload：`{ sub: userId, username, isGuest, role, iat, exp, jti }`
- HTTP 鉴权：`Authorization: Bearer <token>` → Fastify `authHook` 验证
- Socket 鉴权：客户端在 `io(url, { auth: { token } })` 连接时传入 → Socket.IO middleware 验证
- 会话吊销：Redis `session:<jti>` 存在即有效（未来可支持"踢下线"）

## 10. 为完整产品预留的架构扩展点

- **水平扩展**：单台 server 进程最多承载 ~1000 个并发房间。后续可用 Redis Pub/Sub + 一致性哈希做多进程扩展。MVP 单进程够用。
- **运营后台**：独立子应用 `apps/admin`，复用 `@chesspvp/shared` 和后端 REST，通过 `role=admin` 鉴权访问。
- **回放系统**：`match_replays` 表已存完整 `actions[]`，直接喂给 `BattleEngine.replay()` 即可重建任意回合的状态。
- **天梯**：`rankings` 表已建好，ELO 计算逻辑只需在 `MATCH_ENDED` 时插入一个 hook。
- **反作弊升级**：可加入速率限制、行为分析、日志上报等。当前服务器权威已是最强防线。
