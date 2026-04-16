import type { Server, Namespace, Socket } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  BattleEngine,
  filterStateForPlayer,
  filterEventsForPlayer,
  type BattleState,
  type Action,
  type GameEvent,
  type PlayerSide,
  type Client2ServerEvents,
  type Server2ClientEvents,
} from '@chesspvp/shared';
import { Clock } from './Clock.js';
import { settleRankedMatch } from '../rankings/service.js';

type IoServer = Server<Client2ServerEvents, Server2ClientEvents>;
type GameNamespace = Namespace<Client2ServerEvents, Server2ClientEvents>;

interface RoomPlayer {
  userId: string;
  side: PlayerSide;
  socketId: string | null;
  readyAt: number | null;
  disconnectedAt: number | null;
}

type Ack = { ok: true } | { ok: false; error: { code: string; message: string } };

function ackErr(code: string, message: string): Ack {
  return { ok: false, error: { code, message } };
}

function otherSide(s: PlayerSide): PlayerSide {
  return s === 'A' ? 'B' : 'A';
}

function cloneForTransport<T>(value: T): T {
  return structuredClone(value) as T;
}

export class Room {
  readonly matchId: string;
  private engine: BattleEngine;
  private players: [RoomPlayer, RoomPlayer];
  private clock: Clock;
  private actionLog: Array<{ action: Action; actorSide: PlayerSide; seq: number }> = [];
  private eventSeq = 0;
  private startedAt = 0;
  private initialState: BattleState;
  private turnTimeoutHandle?: NodeJS.Timeout;
  private disconnectGraceHandles = new Map<string, NodeJS.Timeout>();
  private ended = false;
  private matchStarted = false;

  constructor(
    private io: IoServer,
    private redis: Redis,
    private prisma: PrismaClient,
    matchId: string,
    players: Array<{ userId: string; side: PlayerSide }>,
    initialState: BattleState,
    private isRanked = true,
  ) {
    this.matchId = matchId;
    this.initialState = JSON.parse(JSON.stringify(initialState)) as BattleState;
    this.engine = new BattleEngine(initialState);
    this.players = players.map((p) => ({
      userId: p.userId,
      side: p.side,
      socketId: null,
      readyAt: null,
      disconnectedAt: null,
    })) as [RoomPlayer, RoomPlayer];
    this.clock = new Clock(initialState.players.A.reserveTimeMs);
  }

  get currentSeq(): number {
    return this.eventSeq;
  }

  get state(): BattleState {
    return this.engine.state;
  }

  /** /game namespace — all broadcasts must go through this, not the root io */
  private get ns(): GameNamespace {
    return this.io.of('/game') as GameNamespace;
  }

  /**
   * Return a plain-JS deep copy of the current engine state.
   * Immer 10 freezes its produced objects and leaves internal proxy metadata
   * that Socket.IO's hasBinary serialiser cannot traverse.
   * structuredClone strips all of that and produces a clean serialisable tree.
   */
  private plainState(): BattleState {
    return structuredClone(this.engine.state) as BattleState;
  }

  private get roomKey(): string {
    return `match:${this.matchId}`;
  }

  private getPlayer(userId: string): RoomPlayer {
    const p = this.players.find((p) => p.userId === userId);
    if (!p) throw new Error(`Player ${userId} not in room ${this.matchId}`);
    return p;
  }

  private getUserIdBySide(side: PlayerSide): string {
    return this.players.find((p) => p.side === side)!.userId;
  }

  // =========================================================
  // Lifecycle
  // =========================================================

  async onPlayerReady(userId: string, socketId: string): Promise<void> {
    const p = this.getPlayer(userId);
    p.readyAt = Date.now();
    p.socketId = socketId;

    const allReady = this.players.every((p) => p.readyAt !== null);
    if (allReady) await this.startMatch();
  }

  private async startMatch(): Promise<void> {
    if (this.matchStarted) return;
    this.matchStarted = true;
    this.startedAt = Date.now();

    const beginEvents = this.engine.beginTurn(this.engine.state.currentPlayer, this.startedAt);
    beginEvents.forEach((e) => {
      (e as GameEvent & { seq: number }).seq = ++this.eventSeq;
    });

    // 向每位玩家分别发送经过战争迷雾过滤的初始状态
    for (const player of this.players) {
      if (!player.socketId) continue;
      const socket = this.ns.sockets.get(player.socketId);
      if (!socket) continue;
      socket.emit('MATCH_START', {
        matchId: this.matchId,
        firstPlayer: this.engine.state.currentPlayer,
        initialState: filterStateForPlayer(this.engine.state as BattleState, player.side),
        turnDeadline: this.engine.state.turnDeadline,
        clocks: this.clock.snapshot(),
      });
    }

    this.scheduleTurnTimeout();
    await this.persistRoomState();
  }

  // =========================================================
  // Action handling
  // =========================================================

  async handleAction(userId: string, action: Action): Promise<Ack> {
    if (this.ended) return ackErr('MATCH_NOT_FOUND', 'Match has ended');
    const player = this.getPlayer(userId);
    const state = this.engine.state;
    if (state.currentPlayer !== player.side) return ackErr('NOT_YOUR_TURN', 'Not your turn');

    // 在 apply 前记录完整的事前状态，用于事件过滤
    const preState = structuredClone(this.engine.state) as BattleState;

    let events: GameEvent[];
    try {
      const result = this.engine.apply(action, player.side, Date.now());
      events = result.events;
    } catch (err) {
      const anyErr = err as { code?: string; message?: string };
      return ackErr(anyErr.code ?? 'INVALID_ACTION', anyErr.message ?? 'Invalid action');
    }

    this.actionLog.push({ action, actorSide: player.side, seq: this.eventSeq + 1 });
    events.forEach((e) => {
      (e as GameEvent & { seq: number }).seq = ++this.eventSeq;
    });

    const postState = this.engine.state as BattleState;

    // 向每位玩家分别发送经战争迷雾过滤的事件和状态快照
    for (const p of this.players) {
      if (!p.socketId) continue;
      const socket = this.ns.sockets.get(p.socketId);
      if (!socket) continue;

      const filteredEvents = filterEventsForPlayer(events, p.side, preState, postState);
      try {
        const eventBatch = {
          seq: this.eventSeq,
          matchId: this.matchId,
          events: cloneForTransport(filteredEvents),
        };
        socket.emit('EVENT_BATCH', eventBatch);
      } catch (err) {
        console.error('[room:event-batch] failed to emit filtered events', {
          matchId: this.matchId,
          side: p.side,
          actionType: action.type,
          eventTypes: filteredEvents.map((event) => event.type),
          error: err,
        });
      }

      // STATE_SNAPSHOT 用于客户端引擎同步，也要按视角过滤
      try {
        socket.emit('STATE_SNAPSHOT', {
          matchId: this.matchId,
          seq: this.eventSeq,
          state: cloneForTransport(filterStateForPlayer(postState, p.side)),
        });
      } catch (err) {
        console.error('[room:state-snapshot] failed to emit filtered state', {
          matchId: this.matchId,
          side: p.side,
          actionType: action.type,
          error: err,
        });
      }
    }

    if (action.type === 'END_TURN') {
      this.onTurnChanged();
    }

    const victory = this.engine.checkVictory();
    if (victory) await this.endMatch(victory.winner, victory.reason ?? 'base_destroyed');

    await this.persistRoomState();
    return { ok: true };
  }

  // =========================================================
  // Turn control
  // =========================================================

  private scheduleTurnTimeout(): void {
    if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
    const ms = Math.max(0, this.engine.state.turnDeadline - Date.now());
    this.turnTimeoutHandle = setTimeout(() => void this.onTurnTimeout(), ms);
  }

  private async onTurnTimeout(): Promise<void> {
    const current = this.engine.state.currentPlayer;
    const drained = this.clock.drainReserve(current, 1000);
    if (drained === 0) {
      const winner = otherSide(current);
      await this.endMatch(winner, 'timeout');
      return;
    }
    await this.handleAction(this.getUserIdBySide(current), { type: 'END_TURN', payload: {} });
  }

  private onTurnChanged(): void {
    this.scheduleTurnTimeout();
    this.ns.to(this.roomKey).emit('TURN_CHANGED', {
      matchId: this.matchId,
      currentPlayer: this.engine.state.currentPlayer,
      turnNumber: this.engine.state.turnNumber,
      turnDeadline: this.engine.state.turnDeadline,
      clocks: this.clock.snapshot(),
    });
  }

  // =========================================================
  // Disconnect / reconnect
  // =========================================================

  onDisconnect(userId: string): void {
    const p = this.getPlayer(userId);
    p.socketId = null;
    p.disconnectedAt = Date.now();
    const reconnectDeadline = Date.now() + 30_000;

    this.ns.to(this.roomKey).emit('OPPONENT_DISCONNECTED', {
      matchId: this.matchId,
      reconnectDeadline,
    });

    const handle = setTimeout(() => void this.onReconnectTimeout(userId), 30_000);
    this.disconnectGraceHandles.set(userId, handle);
  }

  async onReconnect(userId: string, socketId: string): Promise<void> {
    const p = this.getPlayer(userId);
    p.socketId = socketId;
    p.disconnectedAt = null;

    const handle = this.disconnectGraceHandles.get(userId);
    if (handle) {
      clearTimeout(handle);
      this.disconnectGraceHandles.delete(userId);
    }

    const socket = this.ns.sockets.get(socketId) as Socket | undefined;
    await socket?.join(this.roomKey);

    // Only send a snapshot once the match has started.  Before startMatch()
    // there is no meaningful authoritative state to sync, and sending a
    // pre-start snapshot would set engine without setting mySide on the
    // client, making the board render but uncontrollable.
    if (this.matchStarted) {
      socket?.emit('STATE_SNAPSHOT', {
        matchId: this.matchId,
        seq: this.eventSeq,
        state: filterStateForPlayer(this.engine.state as BattleState, p.side),
      });
    }

    this.ns.to(this.roomKey).emit('OPPONENT_RECONNECTED', { matchId: this.matchId });
  }

  private async onReconnectTimeout(userId: string): Promise<void> {
    const p = this.getPlayer(userId);
    if (p.socketId !== null) return;
    const winner = otherSide(p.side);
    await this.endMatch(winner, 'timeout');
  }

  // =========================================================
  // Match end
  // =========================================================

  private async endMatch(winner: PlayerSide, reason: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);

    const durationMs = Date.now() - this.startedAt;
    this.ns.to(this.roomKey).emit('MATCH_ENDED', {
      matchId: this.matchId,
      winner,
      reason,
      durationMs,
    });

    await this.persistMatch(winner, reason, durationMs);
    if (this.isRanked) {
      await settleRankedMatch(this.prisma, {
        playerAId: this.getUserIdBySide('A'),
        playerBId: this.getUserIdBySide('B'),
        winnerId: this.getUserIdBySide(winner),
      });
    }
    await this.cleanupRedis();

    const { RoomManager } = await import('./RoomManager.js');
    RoomManager.removeRoom(this.matchId);
  }

  private async persistMatch(winner: PlayerSide, reason: string, durationMs: number): Promise<void> {
    const winnerUserId = this.getUserIdBySide(winner);
    // startedAt is 0 when the match never properly started (e.g. a player
    // never sent MATCH_READY and onReconnectTimeout fired first).
    // In that case Date.now() - 0 ≈ 1.78 trillion ms, which overflows
    // PostgreSQL INT4 (max ~2.1 billion).  Record 0 for such degenerate matches.
    const safeDurationMs = this.startedAt > 0 ? durationMs : 0;
    await this.prisma.match.create({
      data: {
        id: this.matchId,
        playerAId: this.getUserIdBySide('A'),
        playerBId: this.getUserIdBySide('B'),
        winnerId: winnerUserId,
        result: reason,
        mapId: this.engine.state.mapId,
        isRanked: this.isRanked,
        seed: BigInt(0),
        durationMs: safeDurationMs,
        turnCount: this.engine.state.turnNumber,
        startedAt: new Date(this.startedAt),
        endedAt: new Date(),
        replay: {
          create: {
            initialState: this.initialState as object,
            actions: this.actionLog.map((a) => ({
              seq: a.seq,
              player: a.actorSide,
              type: a.action.type,
              payload: (a.action as Record<string, unknown>).payload ?? {},
            })),
          },
        },
      },
    });
  }

  private async persistRoomState(): Promise<void> {
    await this.redis.set(
      `room:${this.matchId}:state`,
      JSON.stringify(this.engine.state),
      'EX',
      3600,
    );
    await this.redis.set(`room:${this.matchId}:seq`, String(this.eventSeq), 'EX', 3600);
  }

  private async cleanupRedis(): Promise<void> {
    await this.redis.del(
      `room:${this.matchId}:state`,
      `room:${this.matchId}:seq`,
      `room:${this.matchId}:events`,
    );
    const [p1, p2] = this.players;
    await this.redis.del(
      `matchmaking:user:${p1.userId}`,
      `matchmaking:user:${p2.userId}`,
      `matchmaking:rating:${p1.userId}`,
      `matchmaking:rating:${p2.userId}`,
      `user:${p1.userId}:match`,
      `user:${p2.userId}:match`,
    );
  }
}
