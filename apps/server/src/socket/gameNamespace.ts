import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type {
  Client2ServerEvents,
  Server2ClientEvents,
  Action,
  BattleState,
} from '@chesspvp/shared';
import { filterStateForPlayer } from '@chesspvp/shared';
import { socketAuthMiddleware } from './middleware.js';
import { RoomManager } from '../game/RoomManager.js';

type IoServer = Server<Client2ServerEvents, Server2ClientEvents>;

export function getSnapshotStateForUser(state: BattleState, userId: string): BattleState {
  const side = state.players.A.userId === userId ? 'A' : 'B';
  return filterStateForPlayer(state, side);
}

export function attachGameNamespace(
  io: IoServer,
  deps: { redis: Redis; prisma: PrismaClient },
): void {
  const ns = io.of('/game');
  ns.use(socketAuthMiddleware(deps.redis));

  ns.on('connection', async (socket) => {
    const userId = socket.data.user.sub as string;

    // ---------------------------------------------------------------
    // IMPORTANT: Register ALL event handlers synchronously FIRST,
    // before any `await`.  Node's EventEmitter does not buffer events
    // for unregistered listeners, so if MATCH_READY (or any action)
    // arrives while the server is still executing the async reconnect
    // logic below, it would be silently dropped — causing the match
    // to never start for the late-connecting client.
    // ---------------------------------------------------------------

    const makeActionHandler =
      (type: Action['type']) =>
      async (payload: Record<string, unknown>, ack: (r: unknown) => void) => {
        const mid = (payload.matchId as string | undefined) ?? '';
        const room = RoomManager.getByMatchId(mid);
        if (!room) return ack({ ok: false, error: { code: 'MATCH_NOT_FOUND', message: 'Room not found' } });
        const action = { type, payload } as Action;
        const result = await room.handleAction(userId, action);
        ack(result);
      };

    socket.on('MATCH_READY', async ({ matchId }, ack) => {
      const room = RoomManager.getByMatchId(matchId);
      if (!room) return ack({ ok: false, error: { code: 'MATCH_NOT_FOUND', message: 'Room not found' } });
      await socket.join(`match:${matchId}`);
      await room.onPlayerReady(userId, socket.id);
      ack({ ok: true });
    });

    socket.on('ACTION_MOVE', makeActionHandler('MOVE') as never);
    socket.on('ACTION_ATTACK', makeActionHandler('ATTACK') as never);
    socket.on('ACTION_USE_ABILITY', makeActionHandler('USE_ABILITY') as never);
    socket.on('ACTION_RECRUIT', makeActionHandler('RECRUIT') as never);
    socket.on('ACTION_END_TURN', makeActionHandler('END_TURN') as never);
    socket.on('ACTION_SURRENDER', makeActionHandler('SURRENDER') as never);

    socket.on('REQUEST_SNAPSHOT', async ({ matchId, fromSeq: _fromSeq }) => {
      const room = RoomManager.getByMatchId(matchId);
      if (!room) return;
      socket.emit('STATE_SNAPSHOT', {
        matchId,
        seq: room.currentSeq,
        state: structuredClone(getSnapshotStateForUser(room.state, userId)) as typeof room.state,
      });
    });

    socket.on('PING', ({ ts }) => socket.emit('PONG', { ts }));

    socket.on('disconnect', async () => {
      await deps.redis.del(`user:${userId}:socket`);
      const mid = await deps.redis.get(`user:${userId}:match`);
      if (mid) {
        const room = RoomManager.getByMatchId(mid);
        room?.onDisconnect(userId);
      }
    });

    // ---------------------------------------------------------------
    // Async setup: record socket ID + handle reconnect case.
    // All handlers are already registered above, so no events are
    // dropped while we await here.
    // ---------------------------------------------------------------

    await deps.redis.set(`user:${userId}:socket`, socket.id, 'EX', 3600);

    // Reconnect: if user was in a match, re-join the room
    const matchId = await deps.redis.get(`user:${userId}:match`);
    if (matchId) {
      const room = RoomManager.getByMatchId(matchId);
      if (room) {
        await socket.join(`match:${matchId}`);
        await room.onReconnect(userId, socket.id);
      }
    }
  });
}
