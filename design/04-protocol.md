# 04 - 通信协议

## 1. 概览

- **HTTP REST**：账号、匹配入队、历史查询、配置读取。无状态。
- **Socket.IO**：实时对战消息。有状态（带 JWT 认证的长连接）。

所有消息类型定义在 `packages/shared/src/protocol/`，**前后端导入同一份类型**。

## 2. HTTP REST API

所有路由前缀：`/api/v1`
所有请求/响应：`application/json; charset=utf-8`
错误格式统一：

```json
{
  "error": {
    "code": "INVALID_ACTION",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### 2.1 Auth

#### `POST /api/v1/auth/guest`

创建一次性游客账号并颁发 JWT。

**请求体**
```json
{
  "nickname": "PlayerXXX"   // 可选，不传则服务器生成随机名
}
```

**响应 200**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "username": "PlayerXXX",
    "isGuest": true,
    "role": "player",
    "createdAt": "2026-04-09T..."
  }
}
```

#### `POST /api/v1/auth/register`（预留，MVP 返回 501）
#### `POST /api/v1/auth/login`（预留，MVP 返回 501）

### 2.2 Me

#### `GET /api/v1/me` — 需要认证

**响应 200**
```json
{
  "id": "uuid",
  "username": "PlayerXXX",
  "isGuest": true,
  "role": "player",
  "rating": 1000,
  "wins": 0,
  "losses": 0
}
```

### 2.3 Matchmaking

#### `POST /api/v1/matchmaking/join` — 需要认证

加入匹配队列。立即返回 `queued` 状态，真正的 `MATCH_FOUND` 通过 Socket 推送。

**请求体**：空 `{}`

**响应 200**
```json
{
  "status": "queued",
  "queuedAt": 1712654321000,
  "estimatedWaitMs": 5000
}
```

**错误**
- `409 ALREADY_IN_QUEUE`
- `409 ALREADY_IN_MATCH`

#### `POST /api/v1/matchmaking/leave` — 需要认证

**响应 200**：`{ "status": "left" }`

### 2.4 Matches

#### `GET /api/v1/matches/:id` — 需要认证

仅允许该对局的参与者 / admin 查看。

**响应 200**
```json
{
  "id": "uuid",
  "playerA": { "id": "uuid", "username": "..." },
  "playerB": { "id": "uuid", "username": "..." },
  "winner": "uuid | null",
  "result": "base_destroyed",
  "mapId": "frontier_30",
  "durationMs": 312000,
  "turnCount": 18,
  "startedAt": "...",
  "endedAt": "..."
}
```

#### `GET /api/v1/matches/:id/replay` — 需要认证

**响应 200**
```json
{
  "matchId": "uuid",
  "initialState": { /* BattleState */ },
  "actions": [
    { "seq": 1, "player": "A", "type": "MOVE", "payload": { ... } },
    { "seq": 2, "player": "A", "type": "ATTACK", "payload": { ... } },
    { "seq": 3, "player": "A", "type": "END_TURN", "payload": {} },
    ...
  ]
}
```

### 2.5 Configs

#### `GET /api/v1/configs/units`
#### `GET /api/v1/configs/maps`
#### `GET /api/v1/configs/balance`

直接返回 `packages/shared/src/configs/*.json` 的内容（服务器启动时读一次，带 ETag 缓存）。MVP 客户端启动时会请求这三个端点初始化。

## 3. Socket.IO 协议

### 3.1 连接

- **URL**：`io(SOCKET_URL, { auth: { token: jwt }, transports: ['websocket'] })`
- **命名空间**：`/game`
- **鉴权**：服务器 middleware 校验 `socket.handshake.auth.token`，通过则把 `user` 挂在 `socket.data`；失败 `socket.disconnect`。

### 3.2 消息通用结构

```typescript
interface SocketMessage<T = unknown> {
  seq: number;          // 服务器 → 客户端 的消息必带；客户端 → 服务器 可选
  type: string;         // 事件名
  payload: T;
  timestamp: number;    // epoch ms (server 时钟)
}
```

Socket.IO 的事件名即 `type`，`payload/seq/timestamp` 通过事件载荷传递。

### 3.3 客户端 → 服务器（Client2Server）

| 事件 | Payload | 说明 |
|---|---|---|
| `MATCH_READY` | `{ matchId }` | 匹配成功后确认进入战斗 |
| `ACTION_MOVE` | `{ matchId, unitId, to: {x,y} }` | 移动 |
| `ACTION_ATTACK` | `{ matchId, unitId, targetId?: string, targetPos?: {x,y} }` | 普通攻击；炮手可用 `targetPos` 直接指定空地中心点 |
| `ACTION_USE_ABILITY` | `{ matchId, unitId, abilityId, targetId?: string, targetPos?: {x,y} }` | 使用主动技能；`heal` 主要用 `targetId`，`poison_burst` 主要用 `targetPos` 指向空地或单位格中心 |
| `ACTION_RECRUIT` | `{ matchId, unitType, source: { kind: 'base' \| 'outpost', position: {x,y} }, spawnAt: {x,y} }` | 从基地或前哨站下招募单 |
| `ACTION_END_TURN` | `{ matchId }` | 结束回合 |
| `ACTION_SURRENDER` | `{ matchId }` | 投降 |
| `REQUEST_SNAPSHOT` | `{ matchId, fromSeq: number }` | 重连后主动拉取当前快照；`fromSeq` 当前仅作将来增量同步预留 |
| `PING` | `{ ts }` | 心跳 |

所有 `ACTION_*` 服务器必须在校验后通过 ack 回调返回：

```typescript
socket.emit('ACTION_MOVE', payload, (ack) => {
  // ack: { ok: true } | { ok: false, error: { code, message } }
});
```

### 3.4 服务器 → 客户端（Server2Client）

| 事件 | Payload | 说明 |
|---|---|---|
| `MATCH_FOUND` | `{ matchId, opponent, yourSide, map, expiresAt }` | 匹配到对手，可能在 HTTP join 后立即推送 |
| `MATCH_START` | `{ matchId, firstPlayer, initialState, turnDeadline, clocks }` | 双方 `MATCH_READY` 后开战 |
| `EVENT_BATCH` | `{ seq, matchId, events: Event[] }` | 一次 action 产生的事件组，按 seq 递增 |
| `TURN_CHANGED` | `{ matchId, currentPlayer, turnNumber, turnDeadline, clocks }` | 回合切换 |
| `STATE_SNAPSHOT` | `{ matchId, seq, state: BattleState }` | 重连后全量同步；状态按请求玩家视角过滤，不能泄露迷雾外敌军信息 |
| `OPPONENT_DISCONNECTED` | `{ matchId, reconnectDeadline }` | 对手掉线，进入宽限期 |
| `OPPONENT_RECONNECTED` | `{ matchId }` | 对手回来了 |
| `MATCH_ENDED` | `{ matchId, winner, reason, durationMs }` | 对局结束，之后 socket 可以离开 room |
| `ACTION_REJECTED` | `{ matchId, reason, details }` | （通常通过 ack 返回，特殊情况也可推送）|
| `ERROR` | `{ code, message }` | 全局错误 |
| `PONG` | `{ ts }` | |

### 3.5 事件类型（`EVENT_BATCH.events[]`）

所有事件结构统一：

```typescript
interface GameEvent {
  seq: number;         // 全局递增（同 EVENT_BATCH.seq 可以不一致；EVENT_BATCH.seq 代表批号）
  type: string;
  payload: any;
}
```

事件类型详见 `01-gameplay-rules.md` §12。以下给出完整 payload：

```typescript
type GameEvent =
  | { type: 'TURN_BEGAN', payload: { currentPlayer: PlayerSide, turnNumber: number, goldA: number, goldB: number, turnDeadline: number } }
  | { type: 'GOLD_CHANGED', payload: { player: PlayerSide, delta: number, newAmount: number, reason: 'base_income' | 'resource_point' | 'recruit_cost' | 'recruit_refund' | 'unit_upkeep' } }
  | { type: 'RESOURCE_POINT_CAPTURED', payload: { position: Position, newOwner: PlayerSide | null, previousOwner: PlayerSide | null } }
  | { type: 'OUTPOST_CAPTURED', payload: { position: Position, newOwner: PlayerSide | null, previousOwner: PlayerSide | null } }
  | { type: 'UNIT_RECRUIT_ORDERED', payload: { player: PlayerSide, unitType: UnitType, source: RecruitSource, spawnAt: Position } }
  | { type: 'UNIT_RECRUITED', payload: { unit: Unit } }
  | { type: 'UNIT_RECRUIT_FAILED', payload: { player: PlayerSide, source: RecruitSource, reason: 'spawn_blocked', refundedGold: number } }
  | { type: 'UNIT_MOVED', payload: { unitId: string, from: Position, to: Position, path: Position[] } }
  | { type: 'UNIT_ABILITY_USED', payload: { unitId: string, abilityId: string, targetId?: string, targetPos?: Position } }
  | { type: 'UNIT_HEALED', payload: { unitId: string, amount: number, hpBefore: number, hpAfter: number } }
  | { type: 'UNIT_POISON_CHANGED', payload: { unitId: string, stacksBefore: number, stacksAfter: number, reason: 'attack' | 'skill' | 'turn_tick' } }
  | { type: 'UNIT_ATTACKED', payload: { attackerId: string, targetId?: string, targetPos?: Position, damage?: number, counterMul?: number } }
  | { type: 'UNIT_DAMAGED', payload: { unitId: string, damage: number, hpBefore: number, hpAfter: number } }
  | { type: 'UNIT_KILLED', payload: { unitId: string } }
  | { type: 'BASE_DAMAGED', payload: { owner: PlayerSide, damage: number, hpBefore: number, hpAfter: number } }
  | { type: 'BASE_DESTROYED', payload: { owner: PlayerSide } }
  | { type: 'TURN_ENDED', payload: { player: PlayerSide, elapsedMs: number, reserveRemaining: number } }
  | { type: 'TURN_CHANGED', payload: { currentPlayer: PlayerSide, turnNumber: number } }
  | { type: 'MATCH_ENDED', payload: { winner: PlayerSide, reason: string } };
```

### 3.6 消息时序与幂等性

- **服务器的 seq 全局递增**（按 Room 维度），每个 `EVENT_BATCH` 带一个 `batchSeq`，其中的 `events[]` 也各自带 `seq`。
- 客户端记录最后处理的 `seq`。当前重连时用 `REQUEST_SNAPSHOT { fromSeq }` 拉取**当前全量可见快照**；`fromSeq` 仅作未来增量补齐预留。
- **客户端的 action 不带 seq**，服务器以接收顺序为准（同一玩家同一回合内）。
- 同一玩家**串行处理** action：前一条未 ack 完成前，后一条入队等待。

### 3.7 示例：完整匹配-战斗时序

```
Client A                  Server                   Client B

POST /matchmaking/join   -->
                         <-- { status: "queued" }
                                                   POST /matchmaking/join -->
                                                   <-- { status: "queued" }

                         Matchmaker tick:
                         create matchId=m1
                         init Room

emit MATCH_FOUND (推)     ---> (对双方)
        <----
        <----                                      (同样收到)

emit MATCH_READY -->
                                                   emit MATCH_READY -->

                         两边都 ready，初始化战斗
emit MATCH_START (推)     ---> (带 initialState)
                                                   (同样收到)

                         A 先手
emit ACTION_MOVE -->
                         validate, apply
                         broadcast EVENT_BATCH #1
        <----
                                                   <----
emit ACTION_ATTACK -->
                         ...
        <----EVENT_BATCH #2
                                                   <---- EVENT_BATCH #2
emit ACTION_END_TURN -->
                         server switch turn
        <---- TURN_CHANGED (B)
                                                   <---- TURN_CHANGED (B)

                                                   (B 操作...)

...

                         base_destroyed (A 胜)
        <---- EVENT_BATCH (包含 BASE_DESTROYED, MATCH_ENDED)
        <---- MATCH_ENDED
                                                   <---- MATCH_ENDED
```

### 3.8 断线重连时序

```
Client A                         Server

(网络断)                          onDisconnect(A)
                                  start 30s grace timer
                                  emit OPPONENT_DISCONNECTED --> Client B

(5s 后)
io.connect (带 JWT)             -->
                                  认证通过
                                  读 user:<A>:match 查到 matchId
emit REQUEST_SNAPSHOT
  { matchId, fromSeq: 17 }     -->
                                  GET room:<matchId>:state
                                  filterStateForPlayer(side)
        <--- STATE_SNAPSHOT
                                  emit OPPONENT_RECONNECTED --> Client B
                                  cancel grace timer
(恢复正常战斗)
```

### 3.9 超时与错误处理

- **客户端 action 1 秒未收到 ack** → 客户端 UI 显示 "重试中"，再次发送（同样内容）
- **服务器去重**：对同一玩家最近 5 条 action 做幂等判断（基于简单 hash），避免重复执行
- **服务器收到非法 action** → ack `{ ok: false, error }`，不广播
- **回合超时**：服务器 setTimeout 到 `turnDeadline`，触发自动 `END_TURN`（广播 `TURN_ENDED` + `TURN_CHANGED`）
- **备用时间归零** → 自动触发 `MATCH_ENDED { reason: 'timeout' }`

## 4. 错误码表

| 码 | 含义 |
|---|---|
| `UNAUTHENTICATED` | 无 token 或 token 无效 |
| `FORBIDDEN` | 无权访问 |
| `ALREADY_IN_QUEUE` | 重复入队 |
| `ALREADY_IN_MATCH` | 已在对局中 |
| `NOT_IN_MATCH` | 非当前对局参与者 |
| `NOT_YOUR_TURN` | 对手回合时操作 |
| `INVALID_ACTION` | 规则校验失败（详细 reason 在 details）|
| `INVALID_MOVE_TARGET` | 目标格不可达 |
| `INVALID_ATTACK_TARGET` | 目标不在射程内 |
| `UNIT_ALREADY_ACTED` | 单位已行动 |
| `INSUFFICIENT_GOLD` | 招募金币不足 |
| `POPULATION_CAP` | 人口已满 |
| `RECRUIT_ALREADY_ORDERED` | 当前来源建筑本回合已下招募单 |
| `ABILITY_NOT_FOUND` | 技能不存在 |
| `ABILITY_ON_COOLDOWN` | 技能冷却中 |
| `INVALID_ABILITY_TARGET` | 技能目标非法 |
| `INVALID_SPAWN_POSITION` | 招募生成位置非法（与来源建筑不匹配：基地四邻格 / 前哨站本格或四邻格） |
| `MATCH_NOT_FOUND` | 对局不存在 |
| `INTERNAL` | 未分类错误 |

## 5. 版本管理

- HTTP 路由前缀 `/api/v1`
- Socket 命名空间 `/game`
- **协议变更原则**：加字段不破坏向后兼容；删字段或改语义必须升级到 `/api/v2` / `/game-v2`

## 6. 前后端共享类型的实现

`packages/shared/src/protocol/socket.ts`:

```typescript
// 客户端发送 -> 服务器
export interface Client2ServerEvents {
  MATCH_READY: (data: { matchId: string }, ack: (r: Ack) => void) => void;
  ACTION_MOVE: (data: MovePayload, ack: (r: Ack) => void) => void;
  ACTION_ATTACK: (data: AttackPayload, ack: (r: Ack) => void) => void;
  ACTION_RECRUIT: (data: { matchId: string; unitType: string; source: RecruitSource; spawnAt: Position }, ack: (r: Ack) => void) => void;
  ACTION_END_TURN: (data: { matchId: string }, ack: (r: Ack) => void) => void;
  ACTION_SURRENDER: (data: { matchId: string }, ack: (r: Ack) => void) => void;
  REQUEST_SNAPSHOT: (data: { matchId: string; fromSeq: number }) => void;
  PING: (data: { ts: number }) => void;
}

// 服务器发送 -> 客户端
export interface Server2ClientEvents {
  MATCH_FOUND: (data: MatchFoundPayload) => void;
  MATCH_START: (data: MatchStartPayload) => void;
  EVENT_BATCH: (data: EventBatchPayload) => void;
  TURN_CHANGED: (data: TurnChangedPayload) => void;
  STATE_SNAPSHOT: (data: StateSnapshotPayload) => void;
  OPPONENT_DISCONNECTED: (data: { matchId: string; reconnectDeadline: number }) => void;
  OPPONENT_RECONNECTED: (data: { matchId: string }) => void;
  MATCH_ENDED: (data: MatchEndedPayload) => void;
  ACTION_REJECTED: (data: { matchId: string; reason: string; details?: unknown }) => void;
  ERROR: (data: { code: string; message: string }) => void;
  PONG: (data: { ts: number }) => void;
}

export type Ack = { ok: true } | { ok: false; error: { code: string; message: string } };
```

Socket.IO 原生支持这套泛型：
```typescript
// server
const io = new Server<Client2ServerEvents, Server2ClientEvents>(...)
// client
const socket: Socket<Server2ClientEvents, Client2ServerEvents> = io(...)
```
