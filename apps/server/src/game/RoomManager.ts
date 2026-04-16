import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type {
  BattleState,
  PlayerSide,
  Client2ServerEvents,
  Server2ClientEvents,
} from '@chesspvp/shared';
import { Room } from './Room.js';

type IoServer = Server<Client2ServerEvents, Server2ClientEvents>;

export class RoomManager {
  private static rooms = new Map<string, Room>();
  private static io: IoServer;
  private static redis: Redis;
  private static prisma: PrismaClient;

  static init(deps: { io: IoServer; redis: Redis; prisma: PrismaClient }): void {
    this.io = deps.io;
    this.redis = deps.redis;
    this.prisma = deps.prisma;
  }

  static createRoom(opts: {
    matchId: string;
    isRanked: boolean;
    players: Array<{ userId: string; side: PlayerSide }>;
    initialState: BattleState;
  }): Room {
    const room = new Room(
      this.io,
      this.redis,
      this.prisma,
      opts.matchId,
      opts.players,
      opts.initialState,
      opts.isRanked,
    );
    this.rooms.set(opts.matchId, room);
    return room;
  }

  static getByMatchId(matchId: string): Room | undefined {
    return this.rooms.get(matchId);
  }

  static removeRoom(matchId: string): void {
    this.rooms.delete(matchId);
  }

  static async getByUserId(userId: string): Promise<Room | null> {
    const matchId = await this.redis.get(`user:${userId}:match`);
    if (!matchId) return null;
    return this.rooms.get(matchId) ?? null;
  }
}
