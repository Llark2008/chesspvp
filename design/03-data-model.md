# 03 - 数据模型

## 1. 总览

| 存储 | 用途 | 数据 |
|---|---|---|
| **PostgreSQL** | 持久化结构化数据 | 用户、对局、回放、天梯、好友 |
| **Redis** | 会话、实时状态、匹配队列 | JWT 吊销表、匹配队列、房间快照 |
| **JSON 配置文件** | 游戏元数据 | 单位、地图、平衡参数（静态） |

## 2. PostgreSQL Schema（Prisma）

文件：`apps/server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// 用户账号：MVP 支持游客；表结构为完整产品预留。
model User {
  id           String   @id @default(uuid()) @db.Uuid
  username     String   @unique @db.VarChar(32)
  email        String?  @unique @db.VarChar(255)     // 游客为 null
  passwordHash String?  @map("password_hash")        // 游客为 null
  isGuest      Boolean  @default(true) @map("is_guest")
  role         String   @default("player") @db.VarChar(16) // player | admin
  avatarUrl    String?  @map("avatar_url")
  createdAt    DateTime @default(now()) @map("created_at")
  lastLoginAt  DateTime? @map("last_login_at")

  ranking      Ranking?
  matchesA     Match[]  @relation("PlayerA")
  matchesB     Match[]  @relation("PlayerB")
  matchesWon   Match[]  @relation("Winner")
  friends      Friendship[] @relation("UserFriends")
  friendOf     Friendship[] @relation("FriendOf")

  @@map("users")
}

/// 天梯数据：MVP 不写入，但预留表与字段。
model Ranking {
  userId    String   @id @map("user_id") @db.Uuid
  rating    Int      @default(1000)
  wins      Int      @default(0)
  losses    Int      @default(0)
  draws     Int      @default(0)
  seasonId  Int      @default(1) @map("season_id")
  updatedAt DateTime @default(now()) @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("rankings")
}

/// 对局记录。每场成功结束的对战都会生成一条。
model Match {
  id            String   @id @default(uuid()) @db.Uuid
  playerAId     String   @map("player_a_id") @db.Uuid
  playerBId     String   @map("player_b_id") @db.Uuid
  winnerId      String?  @map("winner_id") @db.Uuid
  result        String   @db.VarChar(32)   // base_destroyed | surrender | timeout | abandoned
  mapId         String   @map("map_id") @db.VarChar(64)
  seed          BigInt                         // 预留（MVP 无 RNG）
  durationMs    Int      @map("duration_ms")
  turnCount     Int      @default(0) @map("turn_count")
  startedAt     DateTime @map("started_at")
  endedAt       DateTime @map("ended_at")
  replayVersion Int      @default(1) @map("replay_version")

  playerA User @relation("PlayerA", fields: [playerAId], references: [id])
  playerB User @relation("PlayerB", fields: [playerBId], references: [id])
  winner  User? @relation("Winner", fields: [winnerId], references: [id])

  replay  MatchReplay?

  @@index([playerAId])
  @@index([playerBId])
  @@index([endedAt])
  @@map("matches")
}

/// 战报回放：完整的初始状态 + 动作序列，支持 BattleEngine.replay()。
model MatchReplay {
  matchId      String @id @map("match_id") @db.Uuid
  initialState Json   @map("initial_state")   // BattleState 初始快照
  actions      Json                            // Action[] 数组
  events       Json?                           // 可选：服务器广播的事件流（用于快速播放）

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)

  @@map("match_replays")
}

/// 好友：MVP 不实现 API，但建表预留。
model Friendship {
  userId    String   @map("user_id") @db.Uuid
  friendId  String   @map("friend_id") @db.Uuid
  status    String   @db.VarChar(16)  // pending | accepted | blocked
  createdAt DateTime @default(now()) @map("created_at")

  user   User @relation("UserFriends", fields: [userId], references: [id], onDelete: Cascade)
  friend User @relation("FriendOf", fields: [friendId], references: [id], onDelete: Cascade)

  @@id([userId, friendId])
  @@map("friendships")
}
```

### 2.1 设计要点

- **UUID 主键**：避免分布式扩展冲突，也不暴露用户增长信息。
- **`isGuest` + `email/passwordHash` 可空**：游客第一天就有完整 User 记录；后续"游客转正式账号"只需 `UPDATE users SET email=?, password_hash=?, is_guest=false WHERE id=?`。
- **`role`**：MVP 只用 `player`；运营后台开发时接入 `admin`，同一张表不需迁移。
- **`Match.seed`**：MVP 无 RNG，但字段已建，后续若引入随机性（例如地图随机生成）可直接用。
- **`MatchReplay.events` 可空**：MVP 只存 `initialState + actions`，因为 `BattleEngine.replay(initialState, actions)` 能完整重建所有事件；`events` 留给将来"快速播放"优化。
- **级联删除 (`onDelete: Cascade`)**：用户删号时清理其相关数据。

## 3. Redis Key 设计

Redis 用于**所有易失、实时、高频写**的数据。服务器重启后 Redis 的数据丢失不影响持久化数据（对局结束后已写 Postgres）。

| Key 模式 | 类型 | TTL | 用途 |
|---|---|---|---|
| `session:<jti>` | string | 7d | JWT 会话，值为 `user_id`。用于登出 / 强制下线 |
| `matchmaking:queue` | sorted set | 无 | 匹配队列，score = 入队时间戳，member = `user_id` |
| `matchmaking:user:<user_id>` | string | 10m | 用户匹配状态 `queued` \| `in_match:<matchId>` |
| `room:<matchId>:meta` | hash | 1h (对局结束后 TTL) | 房间元信息：`players`, `createdAt`, `status` |
| `room:<matchId>:state` | string (JSON) | 1h | 完整 `BattleState` 快照，用于断线重连 |
| `room:<matchId>:actions` | list | 1h | 按序的 `Action` 列表（用于回放持久化前缓冲） |
| `room:<matchId>:events` | list | 1h | 事件流 + seq，用于重连后补发 |
| `room:<matchId>:seq` | string (int) | 1h | 事件全局递增序号 |
| `user:<user_id>:socket` | string | 10m | 当前 socket id，用于直接推送 |
| `user:<user_id>:match` | string | 1h | 当前所在 matchId，用于重连定位 |

### 3.1 示例：匹配流程 Redis 操作

```
用户 A 点击"开始匹配"：
  ZADD matchmaking:queue <now_ms> <user_a_id>
  SET  matchmaking:user:<user_a_id> queued EX 600

Matchmaker 每秒扫描：
  ZRANGE matchmaking:queue 0 1                -> [user_a_id, user_b_id]
  ZREM  matchmaking:queue user_a_id user_b_id
  → 创建 matchId, 初始化 room:<matchId>:*
  SET  matchmaking:user:<user_a_id> in_match:<matchId>
  SET  matchmaking:user:<user_b_id> in_match:<matchId>
  → 通过 user:<id>:socket 找到 socket，emit MATCH_FOUND
```

### 3.2 示例：断线重连

```
客户端重连时带上 matchId 和 JWT：
  1. 认证后查 user:<user_id>:match 确认 matchId 匹配
  2. GET room:<matchId>:state → 拿当前完整权威状态
  3. 按玩家视角执行 `filterStateForPlayer`
  4. 发 `STATE_SNAPSHOT` 给客户端
  5. 刷新 user:<user_id>:socket 为新 socket id

说明：
- 当前代码线重连时直接返回一份**过滤后的全量快照**
- `REQUEST_SNAPSHOT.fromSeq` 仅作未来增量同步预留，当前不会额外回放 Redis 中的事件段
```

## 4. JSON 配置文件

路径：`packages/shared/src/configs/`

### 4.1 `units.json`

```json
{
  "warrior": {
    "id": "warrior",
    "displayName": "战士",
    "hp": 20,
    "atk": 8,
    "def": 5,
    "minRange": 1,
    "maxRange": 1,
    "moveRange": 3,
    "sight": 2,
    "cost": 6,
    "upkeep": 1,
    "description": "近战耐久单位。克制弓手。",
    "attackKind": "single"
  },
  "archer": {
    "id": "archer",
    "displayName": "弓手",
    "hp": 18,
    "atk": 10,
    "def": 2,
    "minRange": 2,
    "maxRange": 3,
    "moveRange": 3,
    "sight": 4,
    "cost": 8,
    "upkeep": 1,
    "description": "远程脆皮单位。克制法师。近战无力。",
    "attackKind": "single"
  },
  "mage": {
    "id": "mage",
    "displayName": "法师",
    "hp": 17,
    "atk": 14,
    "def": 1,
    "minRange": 1,
    "maxRange": 4,
    "moveRange": 2,
    "sight": 4,
    "cost": 10,
    "upkeep": 2,
    "description": "高伤害远程单位。克制骑士。",
    "attackKind": "single"
  },
  "knight": {
    "id": "knight",
    "displayName": "骑士",
    "hp": 26,
    "atk": 11,
    "def": 4,
    "minRange": 1,
    "maxRange": 1,
    "moveRange": 5,
    "sight": 3,
    "cost": 12,
    "upkeep": 1,
    "description": "高机动综合单位。克制战士。",
    "attackKind": "single"
  },
  "priest": {
    "id": "priest",
    "displayName": "牧师",
    "hp": 16,
    "atk": 6,
    "def": 2,
    "minRange": 1,
    "maxRange": 2,
    "moveRange": 3,
    "sight": 3,
    "cost": 9,
    "upkeep": 1,
    "description": "后排辅助单位。可攻击，也可治疗友军。",
    "attackKind": "single",
    "abilities": [
      {
        "id": "heal",
        "displayName": "治疗",
        "kind": "heal",
        "minRange": 1,
        "maxRange": 3,
        "power": 5,
        "canTargetSelf": false
      }
    ]
  },
  "gunner": {
    "id": "gunner",
    "displayName": "炮手",
    "hp": 20,
    "atk": 13,
    "def": 2,
    "minRange": 3,
    "maxRange": 4,
    "moveRange": 2,
    "sight": 4,
    "cost": 11,
    "upkeep": 2,
    "description": "慢速远程炮击单位。普通攻击会对目标点周围造成溅射伤害。",
    "attackKind": "aoe",
    "canTargetEmptyTile": true,
    "splashRadius": 1,
    "splashMultiplier": 0.5
  }
}
```

### 4.2 `maps.json`

以下示例保留完整字段结构；`frontier_30` 为当前默认对战地图，`frontier_40` 保留为 40×40 回归 / 对照图。`blockedTiles` 在文档中仅节选前几项，真实数据以仓库内 `packages/shared/src/configs/maps.json` 为准。

```json
{
  "mvp_default": {
    "id": "mvp_default",
    "displayName": "初版默认地图",
    "width": 12,
    "height": 12,
    "basePositions": {
      "A": { "x": 5, "y": 0 },
      "B": { "x": 6, "y": 11 }
    },
    "resourcePoints": [
      { "x": 3, "y": 5 },
      { "x": 8, "y": 6 }
    ],
    "outposts": [],
    "blockedTiles": [],
    "initialUnits": {
      "A": [
        { "type": "warrior", "position": { "x": 4, "y": 1 } },
        { "type": "archer",  "position": { "x": 5, "y": 1 } },
        { "type": "knight",  "position": { "x": 6, "y": 1 } }
      ],
      "B": [
        { "type": "warrior", "position": { "x": 7, "y": 10 } },
        { "type": "archer",  "position": { "x": 6, "y": 10 } },
        { "type": "knight",  "position": { "x": 5, "y": 10 } }
      ]
    }
  },
  "frontier_40": {
    "id": "frontier_40",
    "displayName": "前线试验场 40",
    "width": 40,
    "height": 40,
    "basePositions": {
      "A": { "x": 4, "y": 20 },
      "B": { "x": 35, "y": 20 }
    },
    "resourcePoints": [
      { "x": 10, "y": 12 },
      { "x": 10, "y": 27 },
      { "x": 18, "y": 16 },
      { "x": 18, "y": 24 },
      { "x": 21, "y": 16 },
      { "x": 21, "y": 24 },
      { "x": 29, "y": 12 },
      { "x": 29, "y": 27 }
    ],
    "outposts": [
      { "x": 12, "y": 20 },
      { "x": 27, "y": 20 }
    ],
    "blockedTiles": [
      { "x": 14, "y": 13 },
      { "x": 14, "y": 14 },
      { "x": 14, "y": 15 }
    ],
    "initialUnits": {
      "A": [
        { "type": "warrior", "position": { "x": 3, "y": 20 } },
        { "type": "archer", "position": { "x": 4, "y": 19 } },
        { "type": "knight", "position": { "x": 4, "y": 21 } }
      ],
      "B": [
        { "type": "warrior", "position": { "x": 36, "y": 20 } },
        { "type": "archer", "position": { "x": 35, "y": 21 } },
        { "type": "knight", "position": { "x": 35, "y": 19 } }
      ]
    }
  }
}
```

当前代码线通过 `packages/shared/src/configs/index.ts` 导出 `DEFAULT_BATTLE_MAP_ID = 'frontier_30'`，联机匹配与 `/debug-battle` 默认都会使用这张 30×30 地图；`frontier_40` 仍可被显式指定用于回归验证。

### 4.3 `balance.json`

```json
{
  "match": {
    "turnTimeSeconds": 75,
    "reserveTimeSeconds": 300,
    "firstPlayer": "A"
  },
  "economy": {
    "startingGold": 5,
    "baseIncomePerTurn": 6,
    "resourcePointIncome": 3
  },
  "combat": {
    "counterBonus": 1.25,
    "counterPenalty": 0.8,
    "minDamage": 1
  },
  "counter": {
    "warrior": { "archer": "bonus", "knight": "penalty" },
    "archer":  { "mage": "bonus", "warrior": "penalty" },
    "mage":    { "knight": "bonus", "archer": "penalty" },
    "knight":  { "warrior": "bonus", "mage": "penalty" },
    "priest":  {},
    "gunner":  {},
    "scout":   {},
    "poisoner": {}
  },
  "base": {
    "maxHp": 30,
    "def": 5,
    "sight": 3
  },
  "resourcePoint": {
    "sight": 2
  },
  "outpost": {
    "incomePerTurn": 5,
    "defenseBonus": 2
  },
  "status": {
    "poison": {
      "maxStacks": 5,
      "decayPerTurn": 1
    }
  },
  "unit": {
    "populationCap": 16
  },
  "recruit": {
    "maxOrdersPerTurn": 1,
    "spawnDelayTurns": 1
  }
}
```

### 4.4 加载方式

在 `packages/shared/src/configs/index.ts` 中：

```typescript
import unitsJson from './units.json';
import mapsJson from './maps.json';
import balanceJson from './balance.json';

export const UNITS = unitsJson as Record<UnitType, UnitConfig>;
export const MAPS = mapsJson as Record<string, MapConfig>;
export const BALANCE = balanceJson as BalanceConfig;
```

TypeScript 接口定义在 `packages/shared/src/types/`。

## 5. 核心运行时类型（TypeScript）

放在 `packages/shared/src/types/battle.ts`。以下是最小定义，实现时按需扩展：

```typescript
export type PlayerSide = 'A' | 'B';
export type UnitType =
  | 'warrior'
  | 'archer'
  | 'mage'
  | 'knight'
  | 'priest'
  | 'gunner'
  | 'scout'
  | 'poisoner';

export interface Position {
  x: number;
  y: number;
}

export interface UnitStatus {
  poisonStacks: number;
}

export interface Unit {
  id: string;
  owner: PlayerSide;
  type: UnitType;
  position: Position;
  hp: number;
  hasMoved: boolean;
  hasActed: boolean;
  spawnedThisTurn: boolean;
  status: UnitStatus;
  cooldowns: Record<string, number>;
}

export interface Base {
  owner: PlayerSide;
  position: Position;
  hp: number;
}

export type TileType = 'plain' | 'blocked' | 'resource' | 'outpost' | 'base_a' | 'base_b';

export interface Tile {
  position: Position;
  type: TileType;
  resourceOwner?: PlayerSide | null;  // 仅 type === 'resource' 时有意义
  outpostOwner?: PlayerSide | null;   // 仅 type === 'outpost' 时有意义
}

export interface RecruitSource {
  kind: 'base' | 'outpost';
  position: Position;
}

export interface PendingRecruit {
  unitType: UnitType;
  source: RecruitSource;
  spawnAt: Position;
  orderedTurn: number;
}

export interface PlayerState {
  userId: string;
  side: PlayerSide;
  gold: number;
  pendingRecruits: PendingRecruit[];
  reserveTimeMs: number;   // 象棋时钟备用时间
}

/** 战争迷雾视角信息。仅存在于下发给客户端的过滤态；服务器内部权威态无此字段。 */
export interface FogInfo {
  perspective: PlayerSide;   // 本份状态是哪一方的视角
  visibleTiles: string[];    // "x,y" 字符串数组，便于 Set 快速查表
}

export interface BattleState {
  matchId: string;
  mapId: string;
  turnNumber: number;             // 1-based, 单调递增
  currentPlayer: PlayerSide;
  players: Record<PlayerSide, PlayerState>;
  units: Unit[];                  // 只含活着的单位（过滤态中只含可见单位）
  bases: Base[];                  // 长度 2
  tiles: Tile[][];                // [y][x]
  turnDeadline: number;           // 当前回合倒计时 deadline (epoch ms)
  winner: PlayerSide | null;
  endReason: 'base_destroyed' | 'surrender' | 'timeout' | null;
  /** 战争迷雾视角信息。存在 → 过滤态（联机客户端）；不存在 → 全量状态（服务器内部/离线调试）。 */
  fog?: FogInfo;
}
```

配置类型补充：

```typescript
export interface HealAbilityConfig {
  id: string;
  displayName: string;
  kind: 'heal';
  minRange: number;
  maxRange: number;
  power: number;
  canTargetSelf: boolean;
}

export interface PoisonBurstAbilityConfig {
  id: string;
  displayName: string;
  kind: 'poison_burst';
  minRange: number;
  maxRange: number;
  radius: number;
  applyStacks: number;
  cooldownTurns: number;
  canTargetEmptyTile: boolean;
}

export type AbilityConfig = HealAbilityConfig | PoisonBurstAbilityConfig;

export interface UnitConfig {
  id: UnitType;
  displayName: string;
  hp: number;
  atk: number;
  def: number;
  minRange: number;
  maxRange: number;
  moveRange: number;
  sight: number;
  cost: number;
  upkeep: number;
  description: string;
  attackKind: 'single' | 'aoe';
  canTargetEmptyTile?: boolean;
  splashRadius?: number;
  splashMultiplier?: number;
  abilities?: AbilityConfig[];
}
```

## 6. 数据生命周期

| 数据 | 写入时机 | 读取时机 | 清理时机 |
|---|---|---|---|
| `User` | 游客登录首次 / 注册 | 登录、匹配、战斗 | 用户主动删号（MVP 不做） |
| `Match` | 对局结束 | 战报列表、战斗回放 | 永不自动删除 |
| `MatchReplay` | 对局结束（与 Match 同事务） | 打开回放 | 随 Match 级联删除 |
| `Ranking` | 用户首次登录（默认 1000） | 战斗后更新 | 跟随 User |
| Redis `matchmaking:*` | 入队 | Matchmaker tick | 匹配成功 / 手动离队 / TTL |
| Redis `room:*` | 创建房间 | 实时通信 / 重连 | 对局结束 + 1h TTL（宽限重连） |
| Redis `session:*` | JWT 颁发 | 鉴权校验 | 登出 / 过期 |
