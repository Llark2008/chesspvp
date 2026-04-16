# 07 - 后端设计（`apps/server`）

## 1. 技术清单

| 技术 | 版本 | 用途 |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| TypeScript | 5.x | 类型 |
| Fastify | 4.x | HTTP 框架 |
| Socket.IO | 4.x | WebSocket |
| Prisma | 5.x | ORM |
| PostgreSQL | 16 | 持久化 |
| ioredis | 5.x | Redis 客户端 |
| jose | 5.x | JWT 签发/校验 |
| zod | 3.x | 请求体校验 |
| pino | 9.x | 结构化日志 |
| vitest | 1.x | 测试 |
| tsx | 4.x | Dev runner (类似 ts-node) |
| immer | 10.x | 不可变状态（通过 `@chesspvp/shared` 传递依赖）|
| `@chesspvp/shared` | workspace | 规则引擎、协议、配置 |

## 2. 目录结构

```
apps/server/
├── src/
│   ├── index.ts                 # 启动入口
│   ├── app.ts                   # 构建 Fastify 实例（可被测试复用）
│   ├── config.ts                # 读 env，导出强类型配置
│   │
│   ├── plugins/                 # Fastify 插件（复用于多路由）
│   │   ├── prisma.ts            # 挂 prisma 到 fastify instance
│   │   ├── redis.ts             # 挂 redis 到 fastify instance
│   │   ├── cors.ts
│   │   └── logger.ts
│   │
│   ├── auth/
│   │   ├── jwt.ts               # sign / verify
│   │   ├── authHook.ts          # Fastify preHandler
│   │   └── guest.ts             # 创建游客用户
│   │
│   ├── routes/                  # HTTP 路由
│   │   ├── health.ts
│   │   ├── auth.ts
│   │   ├── me.ts
│   │   ├── matchmaking.ts
│   │   ├── matches.ts
│   │   └── configs.ts
│   │
│   ├── matchmaking/
│   │   ├── Matchmaker.ts        # 简单 FIFO 队列
│   │   └── events.ts            # 推送 MATCH_FOUND
│   │
│   ├── game/
│   │   ├── Room.ts              # 单场对局
│   │   ├── RoomManager.ts       # 全局房间集合
│   │   ├── Clock.ts             # 象棋时钟
│   │   └── replayStore.ts       # 对局结束后写入 DB
│   │
│   ├── socket/
│   │   ├── server.ts            # 创建 Socket.IO server
│   │   ├── gameNamespace.ts     # /game 命名空间事件处理
│   │   └── middleware.ts        # JWT 鉴权
│   │
│   └── utils/
│       ├── errors.ts            # 自定义错误类
│       ├── validate.ts          # zod helpers
│       └── id.ts                # UUID / jti
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── tests/
│   ├── auth.test.ts
│   ├── room.test.ts
│   └── matchmaking.test.ts
│
├── Dockerfile
├── tsconfig.json
└── package.json
```

## 3. 启动流程（`src/index.ts`）

```typescript
import { buildApp } from './app';
import { config } from './config';
import { logger } from './plugins/logger';

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`Server ready on :${config.port}`);
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
```

### `src/app.ts`

```typescript
export async function buildApp() {
  const app = Fastify({ logger });

  await app.register(cors, { origin: config.corsOrigin });
  await app.register(prismaPlugin);
  await app.register(redisPlugin);

  app.register(healthRoutes);
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(meRoutes, { prefix: '/api/v1/me' });
  app.register(matchmakingRoutes, { prefix: '/api/v1/matchmaking' });
  app.register(matchesRoutes, { prefix: '/api/v1/matches' });
  app.register(configsRoutes, { prefix: '/api/v1/configs' });

  // Socket.IO 挂在 fastify http server 上
  const io = createSocketServer(app.server);
  attachGameNamespace(io, { prisma: app.prisma, redis: app.redis });

  // 启动匹配器
  const matchmaker = new Matchmaker({ redis: app.redis, io, prisma: app.prisma });
  matchmaker.start();

  // 启动房间管理
  RoomManager.init({ io, prisma: app.prisma, redis: app.redis });

  return app;
}
```

## 4. 认证

### 4.1 `auth/jwt.ts`

```typescript
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(config.jwtSecret);

export async function signJwt(payload: { sub: string; username: string; isGuest: boolean; role: string }) {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
  return { token, jti };
}

export async function verifyJwt(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as JwtPayload;
}
```

### 4.2 `auth/authHook.ts`

```typescript
export async function authHook(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: { code: 'UNAUTHENTICATED' } });
  }
  try {
    const payload = await verifyJwt(auth.slice(7));
    // 检查 session 未吊销
    const exists = await req.server.redis.exists(`session:${payload.jti}`);
    if (!exists) {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED' } });
    }
    req.user = payload;
  } catch {
    return reply.code(401).send({ error: { code: 'UNAUTHENTICATED' } });
  }
}
```

### 4.3 `auth/guest.ts`

```typescript
export async function createGuestUser(prisma: PrismaClient, redis: Redis, nickname?: string) {
  const username = nickname ?? `Player${randomDigits(6)}`;
  const user = await prisma.user.create({
    data: {
      username,
      isGuest: true,
      role: 'player',
      ranking: { create: {} },
      lastLoginAt: new Date(),
    },
  });
  const { token, jti } = await signJwt({
    sub: user.id,
    username: user.username,
    isGuest: true,
    role: 'player',
  });
  await redis.set(`session:${jti}`, user.id, 'EX', 7 * 24 * 3600);
  return { token, user };
}
```

## 5. HTTP 路由

### 5.1 `routes/auth.ts`

```typescript
export default async function (app: FastifyInstance) {
  app.post('/guest', async (req, reply) => {
    const body = z.object({ nickname: z.string().min(1).max(32).optional() }).parse(req.body);
    const { token, user } = await createGuestUser(app.prisma, app.redis, body.nickname);
    return { token, user: mapUserDto(user) };
  });

  app.post('/register', async (req, reply) => reply.code(501).send({ error: { code: 'NOT_IMPLEMENTED' } }));
  app.post('/login', async (req, reply) => reply.code(501).send({ error: { code: 'NOT_IMPLEMENTED' } }));
}
```

### 5.2 `routes/me.ts`

```typescript
export default async function (app: FastifyInstance) {
  app.addHook('preHandler', authHook);
  app.get('/', async (req) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { ranking: true },
    });
    return mapMeDto(user!);
  });
}
```

### 5.3 `routes/matchmaking.ts`

```typescript
export default async function (app: FastifyInstance) {
  app.addHook('preHandler', authHook);

  app.post('/join', async (req, reply) => {
    const userId = req.user.sub;
    const status = await app.redis.get(`matchmaking:user:${userId}`);
    if (status === 'queued') return reply.code(409).send({ error: { code: 'ALREADY_IN_QUEUE' } });
    if (status?.startsWith('in_match:')) return reply.code(409).send({ error: { code: 'ALREADY_IN_MATCH' } });

    const now = Date.now();
    await app.redis.zadd('matchmaking:queue', now, userId);
    await app.redis.set(`matchmaking:user:${userId}`, 'queued', 'EX', 600);
    return { status: 'queued', queuedAt: now, estimatedWaitMs: 5000 };
  });

  app.post('/leave', async (req, reply) => {
    const userId = req.user.sub;
    await app.redis.zrem('matchmaking:queue', userId);
    await app.redis.del(`matchmaking:user:${userId}`);
    return { status: 'left' };
  });
}
```

### 5.4 `routes/matches.ts`

```typescript
export default async function (app: FastifyInstance) {
  app.addHook('preHandler', authHook);

  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const match = await app.prisma.match.findUnique({
      where: { id },
      include: { playerA: true, playerB: true, winner: true },
    });
    if (!match) return reply.code(404).send({ error: { code: 'MATCH_NOT_FOUND' } });
    if (![match.playerAId, match.playerBId].includes(req.user.sub) && req.user.role !== 'admin') {
      return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
    }
    return mapMatchDto(match);
  });

  app.get('/:id/replay', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const replay = await app.prisma.matchReplay.findUnique({
      where: { matchId: id },
      include: { match: true },
    });
    if (!replay) return reply.code(404).send({ error: { code: 'MATCH_NOT_FOUND' } });
    // 权限校验（同上）
    return {
      matchId: id,
      initialState: replay.initialState,
      actions: replay.actions,
    };
  });
}
```

### 5.5 `routes/configs.ts`

```typescript
import { UNITS, MAPS, BALANCE } from '@chesspvp/shared';

export default async function (app: FastifyInstance) {
  app.get('/units', async () => UNITS);
  app.get('/maps', async () => MAPS);
  app.get('/balance', async () => BALANCE);
}
```

（这些端点可以不鉴权，或轻鉴权）

## 6. Matchmaker

### `matchmaking/Matchmaker.ts`

当前代码实现会从 `@chesspvp/shared` 导入 `DEFAULT_BATTLE_MAP_ID`，统一复用默认地图配置。

```typescript
export class Matchmaker {
  private intervalId?: NodeJS.Timeout;

  constructor(private deps: { redis: Redis; io: Server; prisma: PrismaClient }) {}

  start() {
    this.intervalId = setInterval(() => this.tick().catch(logger.error), 1000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async tick() {
    const queue = await this.deps.redis.zrange('matchmaking:queue', 0, 1);
    if (queue.length < 2) return;
    const [userAId, userBId] = queue;
    // 原子地移出队列（避免并发重复配对）
    const removed = await this.deps.redis.zrem('matchmaking:queue', userAId, userBId);
    if (removed < 2) return;

    await this.createMatch(userAId, userBId);
  }

  private async createMatch(userAId: string, userBId: string) {
    // 随机先后手
    const aFirst = Math.random() < 0.5;
    const side = { [aFirst ? userAId : userBId]: 'A', [aFirst ? userBId : userAId]: 'B' } as const;

    const matchId = crypto.randomUUID();
    const initialState = createInitialState(matchId, DEFAULT_BATTLE_MAP_ID, userAId, userBId);

    const room = await RoomManager.createRoom({
      matchId,
      players: [
        { userId: userAId, side: side[userAId] },
        { userId: userBId, side: side[userBId] },
      ],
      initialState,
    });

    // 标记双方在对局中
    await this.deps.redis.set(`matchmaking:user:${userAId}`, `in_match:${matchId}`, 'EX', 3600);
    await this.deps.redis.set(`matchmaking:user:${userBId}`, `in_match:${matchId}`, 'EX', 3600);
    await this.deps.redis.set(`user:${userAId}:match`, matchId, 'EX', 3600);
    await this.deps.redis.set(`user:${userBId}:match`, matchId, 'EX', 3600);

    // 推送 MATCH_FOUND 给双方
    const userA = await this.deps.prisma.user.findUnique({ where: { id: userAId } });
    const userB = await this.deps.prisma.user.findUnique({ where: { id: userBId } });
    const map = MAPS[DEFAULT_BATTLE_MAP_ID];

    pushToUser(this.deps.io, userAId, 'MATCH_FOUND', {
      matchId, opponent: mapUserDto(userB!), yourSide: side[userAId], map,
      expiresAt: Date.now() + 30_000,
    });
    pushToUser(this.deps.io, userBId, 'MATCH_FOUND', {
      matchId, opponent: mapUserDto(userA!), yourSide: side[userBId], map,
      expiresAt: Date.now() + 30_000,
    });
  }
}
```

`pushToUser` 通过 `user:<id>:socket` 反查当前 socket id 并 emit。

## 7. 房间 / Room 系统

### 7.1 `game/Room.ts`

```typescript
import { BattleEngine, BattleState, Action, GameEvent, PlayerSide, InvalidActionError } from '@chesspvp/shared';

interface RoomPlayer {
  userId: string;
  side: PlayerSide;
  socketId: string | null;   // null 代表断线中
  readyAt: number | null;
  disconnectedAt: number | null;
}

export class Room {
  readonly matchId: string;
  private engine: BattleEngine;
  private players: [RoomPlayer, RoomPlayer];
  private clock: Clock;
  private actionLog: Array<{ action: Action; actorSide: PlayerSide; seq: number }> = [];
  private eventSeq = 0;
  private startedAt: number = 0;
  private turnTimeoutHandle?: NodeJS.Timeout;
  private disconnectGraceHandles = new Map<string, NodeJS.Timeout>();
  private ended = false;

  constructor(
    private io: Server,
    private redis: Redis,
    private prisma: PrismaClient,
    matchId: string,
    players: Array<{ userId: string; side: PlayerSide }>,
    initialState: BattleState,
  ) {
    this.matchId = matchId;
    this.engine = new BattleEngine(initialState);
    this.players = players.map(p => ({
      userId: p.userId, side: p.side, socketId: null, readyAt: null, disconnectedAt: null,
    })) as any;
    this.clock = new Clock(initialState.players.A.reserveTimeMs);
  }

  // ========= 生命周期 =========

  async onPlayerReady(userId: string, socketId: string) {
    const p = this.getPlayer(userId);
    p.readyAt = Date.now();
    p.socketId = socketId;

    const allReady = this.players.every(p => p.readyAt !== null);
    if (allReady) this.startMatch();
  }

  private startMatch() {
    this.startedAt = Date.now();
    const state = this.engine.state;

    // beginTurn 首回合
    const beginEvents = this.engine.beginTurn(state.currentPlayer);
    beginEvents.forEach(e => (e as any).seq = ++this.eventSeq);

    // 战争迷雾：向每位玩家分别发送过滤后的初始状态
    for (const player of this.players) {
      const socket = this.ns.sockets.get(player.socketId!);
      socket?.emit('MATCH_START', {
        matchId: this.matchId,
        firstPlayer: state.currentPlayer,
        initialState: filterStateForPlayer(this.engine.state, player.side),  // 过滤态
        turnDeadline: this.engine.state.turnDeadline,
        clocks: this.clock.snapshot(),
      });
    }

    this.scheduleTurnTimeout();
    this.persistRoomState();
  }

  // ========= 动作处理 =========

  async handleAction(userId: string, action: Action): Promise<Ack> {
    if (this.ended) return ackErr('MATCH_NOT_FOUND', 'Match ended');
    const player = this.getPlayer(userId);
    const state = this.engine.state;
    if (state.currentPlayer !== player.side) return ackErr('NOT_YOUR_TURN', 'Not your turn');

    // 战争迷雾：记录 action 执行前的完整权威状态用于事件过滤
    const preState = structuredClone(this.engine.state);

    let events: GameEvent[];
    try {
      const result = this.engine.apply(action, player.side);
      events = result.events;
    } catch (err) {
      if (err instanceof InvalidActionError) {
        return ackErr(err.result.code, err.result.message);
      }
      throw err;
    }

    this.actionLog.push({ action, actorSide: player.side, seq: this.eventSeq + 1 });
    events.forEach(e => ((e as any).seq = ++this.eventSeq));

    const postState = this.engine.state;

    // 战争迷雾：按玩家视角分别过滤事件 + 状态快照，逐一推送
    for (const p of this.players) {
      const socket = this.ns.sockets.get(p.socketId!);
      if (!socket) continue;
      socket.emit('EVENT_BATCH', {
        seq: this.eventSeq,
        matchId: this.matchId,
        events: filterEventsForPlayer(events, p.side, preState, postState),  // 过滤事件
      });
      socket.emit('STATE_SNAPSHOT', {
        matchId: this.matchId,
        seq: this.eventSeq,
        state: filterStateForPlayer(postState, p.side),  // 过滤状态
      });
    }

    // 处理回合切换
    if (action.type === 'END_TURN') {
      this.onTurnChanged();
    }

    // 处理胜负
    const victory = this.engine.checkVictory();
    if (victory) await this.endMatch(victory.winner, victory.reason);

    await this.persistRoomState();
    return { ok: true };
  }

  // ========= 回合控制 =========

  private scheduleTurnTimeout() {
    if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
    const ms = Math.max(0, this.engine.state.turnDeadline - Date.now());
    this.turnTimeoutHandle = setTimeout(() => this.onTurnTimeout(), ms);
  }

  private async onTurnTimeout() {
    const state = this.engine.state;
    const current = state.currentPlayer;
    // 从备用时间扣
    const drained = this.clock.drainReserve(current, 1000);
    if (drained === 0) {
      // 备用时间耗尽 → 判负
      const winner = other(current);
      await this.endMatch(winner, 'timeout');
      return;
    }
    // 否则自动 END_TURN
    await this.handleAction(this.getUserIdBySide(current), { type: 'END_TURN', payload: {} });
  }

  private onTurnChanged() {
    this.scheduleTurnTimeout();
    this.io.to(this.roomKey).emit('TURN_CHANGED', {
      matchId: this.matchId,
      currentPlayer: this.engine.state.currentPlayer,
      turnNumber: this.engine.state.turnNumber,
      turnDeadline: this.engine.state.turnDeadline,
      clocks: this.clock.snapshot(),
    });
  }

  // ========= 断线重连 =========

  onDisconnect(userId: string) {
    const p = this.getPlayer(userId);
    p.socketId = null;
    p.disconnectedAt = Date.now();
    const reconnectDeadline = Date.now() + 30_000;

    this.io.to(this.roomKey).emit('OPPONENT_DISCONNECTED', { matchId: this.matchId, reconnectDeadline });

    const handle = setTimeout(() => this.onReconnectTimeout(userId), 30_000);
    this.disconnectGraceHandles.set(userId, handle);
  }

  async onReconnect(userId: string, socketId: string) {
    const p = this.getPlayer(userId);
    p.socketId = socketId;
    p.disconnectedAt = null;

    const handle = this.disconnectGraceHandles.get(userId);
    if (handle) { clearTimeout(handle); this.disconnectGraceHandles.delete(userId); }

    // 把 socket 重新加入 room
    const socket = this.io.sockets.sockets.get(socketId);
    await socket?.join(this.roomKey);

    // 推送当前玩家视角的完整快照
    socket?.emit('STATE_SNAPSHOT', {
      matchId: this.matchId,
      seq: this.eventSeq,
      state: filterStateForPlayer(this.engine.state, p.side),
    });

    this.io.to(this.roomKey).emit('OPPONENT_RECONNECTED', { matchId: this.matchId });
  }

  private async onReconnectTimeout(userId: string) {
    const p = this.getPlayer(userId);
    if (p.socketId !== null) return;  // 已经回来了
    // 判负
    const winner = other(p.side);
    await this.endMatch(winner, 'timeout');
  }

  // ========= 结束 =========

  private async endMatch(winner: PlayerSide, reason: string) {
    if (this.ended) return;
    this.ended = true;
    if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);

    const durationMs = Date.now() - this.startedAt;
    this.io.to(this.roomKey).emit('MATCH_ENDED', {
      matchId: this.matchId,
      winner,
      reason,
      durationMs,
    });

    await this.persistMatch(winner, reason, durationMs);
    await this.cleanupRedis();
    RoomManager.removeRoom(this.matchId);
  }

  private async persistMatch(winner: PlayerSide, reason: string, durationMs: number) {
    const winnerUserId = this.getUserIdBySide(winner);
    const match = await this.prisma.match.create({
      data: {
        id: this.matchId,
        playerAId: this.getUserIdBySide('A'),
        playerBId: this.getUserIdBySide('B'),
        winnerId: winnerUserId,
        result: reason,
        mapId: this.engine.state.mapId,
        seed: BigInt(0),
        durationMs,
        turnCount: this.engine.state.turnNumber,
        startedAt: new Date(this.startedAt),
        endedAt: new Date(),
        replay: {
          create: {
            initialState: this.initialState,  // 需要在构造时保存一份
            actions: this.actionLog.map(a => ({
              seq: a.seq, player: a.actorSide, type: a.action.type, payload: a.action.payload,
            })),
          },
        },
      },
    });
  }

  // ========= Helpers =========

  private get roomKey() { return `match:${this.matchId}`; }
  private getPlayer(userId: string) { return this.players.find(p => p.userId === userId)!; }
  private getUserIdBySide(side: PlayerSide) { return this.players.find(p => p.side === side)!.userId; }

  private async persistRoomState() {
    await this.redis.set(`room:${this.matchId}:state`, JSON.stringify(this.engine.state), 'EX', 3600);
    await this.redis.set(`room:${this.matchId}:seq`, String(this.eventSeq), 'EX', 3600);
  }

  private async cleanupRedis() {
    await this.redis.del(
      `room:${this.matchId}:state`,
      `room:${this.matchId}:seq`,
      `room:${this.matchId}:events`,
    );
    const p1 = this.players[0].userId, p2 = this.players[1].userId;
    await this.redis.del(
      `matchmaking:user:${p1}`,
      `matchmaking:user:${p2}`,
      `user:${p1}:match`,
      `user:${p2}:match`,
    );
  }
}

function other(s: PlayerSide): PlayerSide { return s === 'A' ? 'B' : 'A'; }
function ackErr(code: string, message: string): Ack { return { ok: false, error: { code, message } }; }
```

### 7.2 `game/RoomManager.ts`

```typescript
export class RoomManager {
  private static rooms = new Map<string, Room>();
  private static io: Server;
  private static redis: Redis;
  private static prisma: PrismaClient;

  static init(deps: { io: Server; redis: Redis; prisma: PrismaClient }) {
    this.io = deps.io;
    this.redis = deps.redis;
    this.prisma = deps.prisma;
  }

  static async createRoom(opts: { matchId: string; players: Array<{ userId: string; side: PlayerSide }>; initialState: BattleState }) {
    const room = new Room(this.io, this.redis, this.prisma, opts.matchId, opts.players, opts.initialState);
    this.rooms.set(opts.matchId, room);
    return room;
  }

  static getByMatchId(matchId: string) { return this.rooms.get(matchId); }
  static removeRoom(matchId: string) { this.rooms.delete(matchId); }

  static async getByUserId(userId: string): Promise<Room | null> {
    const matchId = await this.redis.get(`user:${userId}:match`);
    if (!matchId) return null;
    return this.rooms.get(matchId) ?? null;
  }
}
```

### 7.3 `game/Clock.ts`

```typescript
export class Clock {
  private reserveA: number;
  private reserveB: number;

  constructor(initialReserveMs: number) {
    this.reserveA = initialReserveMs;
    this.reserveB = initialReserveMs;
  }

  /** 返回实际扣除的量 */
  drainReserve(side: PlayerSide, ms: number): number {
    const key = side === 'A' ? 'reserveA' : 'reserveB';
    const old = this[key];
    this[key] = Math.max(0, old - ms);
    return old - this[key];
  }

  snapshot() {
    return { A: { reserveMs: this.reserveA }, B: { reserveMs: this.reserveB } };
  }
}
```

## 8. Socket.IO Namespace `/game`

### 8.1 `socket/server.ts`

```typescript
export function createSocketServer(httpServer: http.Server) {
  const io = new Server<Client2ServerEvents, Server2ClientEvents>(httpServer, {
    cors: { origin: config.corsOrigin },
    pingInterval: 10000,
    pingTimeout: 5000,
  });
  return io;
}
```

### 8.2 `socket/middleware.ts`

```typescript
export function socketAuthMiddleware(redis: Redis) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const payload = await verifyJwt(token);
      const exists = await redis.exists(`session:${payload.jti}`);
      if (!exists) return next(new Error('UNAUTHENTICATED'));
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  };
}
```

### 8.3 `socket/gameNamespace.ts`

当前实现会额外提供 `getSnapshotStateForUser(state, userId)` helper，内部通过 `filterStateForPlayer` 返回请求玩家可见的过滤态快照。

```typescript
export function attachGameNamespace(io: Server, deps: { redis: Redis; prisma: PrismaClient }) {
  const ns = io.of('/game');
  ns.use(socketAuthMiddleware(deps.redis));

  ns.on('connection', async (socket) => {
    const userId = socket.data.user.sub;

    // 登记当前 socket
    await deps.redis.set(`user:${userId}:socket`, socket.id, 'EX', 3600);

    // 重连检测
    const matchId = await deps.redis.get(`user:${userId}:match`);
    if (matchId) {
      const room = RoomManager.getByMatchId(matchId);
      if (room) await room.onReconnect(userId, socket.id);
    }

    socket.on('MATCH_READY', async ({ matchId }, ack) => {
      const room = RoomManager.getByMatchId(matchId);
      if (!room) return ack({ ok: false, error: { code: 'MATCH_NOT_FOUND', message: '' } });
      await socket.join(`match:${matchId}`);
      await room.onPlayerReady(userId, socket.id);
      ack({ ok: true });
    });

    const actionHandler = (type: Action['type']) => async (payload: any, ack: any) => {
      const room = RoomManager.getByMatchId(payload.matchId);
      if (!room) return ack({ ok: false, error: { code: 'MATCH_NOT_FOUND', message: '' } });
      const action = { type, payload } as Action;
      const result = await room.handleAction(userId, action);
      ack(result);
    };

    socket.on('ACTION_MOVE', actionHandler('MOVE'));
    socket.on('ACTION_ATTACK', actionHandler('ATTACK'));
    socket.on('ACTION_USE_ABILITY', actionHandler('USE_ABILITY'));
    socket.on('ACTION_RECRUIT', actionHandler('RECRUIT'));
    socket.on('ACTION_END_TURN', actionHandler('END_TURN'));
    socket.on('ACTION_SURRENDER', actionHandler('SURRENDER'));

    socket.on('REQUEST_SNAPSHOT', async ({ matchId, fromSeq }) => {
      const room = RoomManager.getByMatchId(matchId);
      if (!room) return;
      // 当前返回完整过滤态快照；fromSeq 仅作未来增量同步预留
      socket.emit('STATE_SNAPSHOT', {
        matchId,
        seq: room.currentSeq,
        state: getSnapshotStateForUser(room.state, userId),
      });
    });

    socket.on('PING', ({ ts }) => socket.emit('PONG', { ts }));

    socket.on('disconnect', async () => {
      await deps.redis.del(`user:${userId}:socket`);
      const matchId = await deps.redis.get(`user:${userId}:match`);
      if (matchId) {
        const room = RoomManager.getByMatchId(matchId);
        room?.onDisconnect(userId);
      }
    });
  });
}
```

## 9. 配置（`src/config.ts`）

```typescript
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export const config = schema.parse(process.env);
```

## 10. Prisma Plugin

```typescript
export const prismaPlugin: FastifyPluginAsync = async (app) => {
  const prisma = new PrismaClient();
  await prisma.$connect();
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => { await prisma.$disconnect(); });
};
```

## 11. Redis Plugin

```typescript
export const redisPlugin: FastifyPluginAsync = async (app) => {
  const redis = new Redis(config.redisUrl);
  app.decorate('redis', redis);
  app.addHook('onClose', async () => { await redis.quit(); });
};
```

## 12. 测试策略

### `tests/auth.test.ts`
- `POST /auth/guest` 返回 token 和 user
- `GET /me` 带 token 返回当前用户信息
- 无 token → 401

### `tests/matchmaking.test.ts`
- 两个用户 join → Matchmaker tick → 应该创建 Room
- 同用户重复 join → 409

### `tests/room.test.ts`
- 创建 Room → onPlayerReady × 2 → MATCH_START 广播
- handleAction 合法动作 → EVENT_BATCH
- handleAction 非法动作 → ack error
- 对 base 造成致命伤 → MATCH_ENDED 并写 DB

### 集成测试
- 用 socket.io-client 模拟两个玩家
- 完整打一局 → 验证 DB 有 Match + MatchReplay

## 13. 日志

使用 pino + 结构化日志：

```typescript
logger.info({ matchId, userId, actionType: 'MOVE' }, 'action received');
```

线上建议输出到 stdout，由容器日志采集。

## 14. 健康检查

```typescript
app.get('/health', async () => ({
  status: 'ok',
  db: (await app.prisma.$queryRaw`SELECT 1`) ? 'ok' : 'fail',
  redis: (await app.redis.ping()) === 'PONG' ? 'ok' : 'fail',
}));
```

## 15. 部署与 Docker

### `Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @chesspvp/server prisma generate
RUN pnpm --filter @chesspvp/server build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
CMD ["node", "dist/index.js"]
```

MVP 阶段本地 `pnpm dev` 运行即可，Docker 化留给后期。

## 16. 为完整产品预留的扩展点

- **多进程扩展**：Socket.IO `@socket.io/redis-adapter`，多 server 进程共享 room 广播
- **分布式 Matchmaker**：Redis Lua 脚本原子匹配
- **ELO 计算**：`endMatch` 里加 hook `updateRating(winnerId, loserId)`
- **管理员后台**：新增 `routes/admin/*`，用 `role === 'admin'` 鉴权
- **WebSocket 水平扩展**：Sticky session + Redis adapter
- **监控**：集成 OpenTelemetry / Prometheus metrics
