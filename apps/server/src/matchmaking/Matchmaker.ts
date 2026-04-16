import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  createInitialState,
  DEFAULT_BATTLE_MAP_ID,
  MAPS,
  type Client2ServerEvents,
  type Server2ClientEvents,
} from '@chesspvp/shared';
import { RoomManager } from '../game/RoomManager.js';
import { mapUserDto } from '../auth/guest.js';
import { getAllowedRatingDelta } from '../rankings/service.js';

type IoServer = Server<Client2ServerEvents, Server2ClientEvents>;

interface QueueEntry {
  userId: string;
  joinedAt: number;
  rating: number;
}

export function findCompatiblePair(
  entries: QueueEntry[],
  nowMs: number,
): [string, string] | null {
  const sortedEntries = [...entries].sort((a, b) => a.joinedAt - b.joinedAt);

  for (let i = 0; i < sortedEntries.length; i += 1) {
    const candidateA = sortedEntries[i]!;
    const allowedA = getAllowedRatingDelta(nowMs - candidateA.joinedAt);

    for (let j = i + 1; j < sortedEntries.length; j += 1) {
      const candidateB = sortedEntries[j]!;
      const allowedB = getAllowedRatingDelta(nowMs - candidateB.joinedAt);
      const diff = Math.abs(candidateA.rating - candidateB.rating);

      if (diff <= allowedA && diff <= allowedB) {
        return [candidateA.userId, candidateB.userId];
      }
    }
  }

  return null;
}

export class Matchmaker {
  private intervalId?: NodeJS.Timeout;

  constructor(
    private deps: { redis: Redis; io: IoServer; prisma: PrismaClient },
  ) {}

  /** Add a user to the matchmaking queue. rating is reserved for future ELO matching. */
  async enqueue(userId: string, rating = 1000): Promise<void> {
    const now = Date.now();
    await this.deps.redis.zadd('matchmaking:queue', now, userId);
    await this.deps.redis.set(`matchmaking:user:${userId}`, 'queued', 'EX', 600);
    await this.deps.redis.set(`matchmaking:rating:${userId}`, String(rating), 'EX', 600);
  }

  start(): void {
    this.intervalId = setInterval(() => void this.tick(), 1000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async tick(): Promise<void> {
    const queuedUsers = await this.deps.redis.zrange('matchmaking:queue', 0, -1);
    if (queuedUsers.length < 2) return;

    const entries = await Promise.all(
      queuedUsers.map(async (userId) => ({
        userId,
        joinedAt: Number((await this.deps.redis.zscore('matchmaking:queue', userId)) ?? Date.now()),
        rating: Number((await this.deps.redis.get(`matchmaking:rating:${userId}`)) ?? 1000),
      })),
    );
    const pair = findCompatiblePair(entries, Date.now());
    if (!pair) return;

    const [userAId, userBId] = pair;
    const removed = await this.deps.redis.zrem('matchmaking:queue', userAId, userBId);
    if (removed < 2) return;

    await this.createMatch(userAId, userBId, true);
  }

  async createMatch(userAId: string, userBId: string, isRanked = true): Promise<string> {
    const aFirst = Math.random() < 0.5;
    // sideAUser plays as side A, sideBUser plays as side B
    const sideAUserId = aFirst ? userAId : userBId;
    const sideBUserId = aFirst ? userBId : userAId;
    const sideMap: Record<string, 'A' | 'B'> = {
      [sideAUserId]: 'A',
      [sideBUserId]: 'B',
    };

    const matchId = crypto.randomUUID();
    // createInitialState(matchId, mapId, playerAId, playerBId) — must match sideMap
    const initialState = createInitialState(matchId, DEFAULT_BATTLE_MAP_ID, sideAUserId, sideBUserId, Date.now());

    RoomManager.createRoom({
      matchId,
      isRanked,
      players: [
        { userId: userAId, side: sideMap[userAId] as 'A' | 'B' },
        { userId: userBId, side: sideMap[userBId] as 'A' | 'B' },
      ],
      initialState,
    });

    await this.deps.redis.set(`matchmaking:user:${userAId}`, `in_match:${matchId}`, 'EX', 3600);
    await this.deps.redis.set(`matchmaking:user:${userBId}`, `in_match:${matchId}`, 'EX', 3600);
    await this.deps.redis.set(`user:${userAId}:match`, matchId, 'EX', 3600);
    await this.deps.redis.set(`user:${userBId}:match`, matchId, 'EX', 3600);
    await this.deps.redis.del(`matchmaking:rating:${userAId}`, `matchmaking:rating:${userBId}`);

    const [userA, userB] = await Promise.all([
      this.deps.prisma.user.findUnique({ where: { id: userAId } }),
      this.deps.prisma.user.findUnique({ where: { id: userBId } }),
    ]);
    const map = MAPS[DEFAULT_BATTLE_MAP_ID];
    const expiresAt = Date.now() + 30_000;

    await this.pushToUser(userAId, 'MATCH_FOUND', {
      matchId,
      opponent: mapUserDto(userB!),
      yourSide: sideMap[userAId] as 'A' | 'B',
      map,
      expiresAt,
    });
    await this.pushToUser(userBId, 'MATCH_FOUND', {
      matchId,
      opponent: mapUserDto(userA!),
      yourSide: sideMap[userBId] as 'A' | 'B',
      map,
      expiresAt,
    });

    return matchId;
  }

  private async pushToUser(userId: string, event: string, payload: unknown): Promise<void> {
    const socketId = await this.deps.redis.get(`user:${userId}:socket`);
    if (socketId) {
      this.deps.io.of('/game').to(socketId).emit(event as keyof Server2ClientEvents, payload as never);
    }
  }
}
