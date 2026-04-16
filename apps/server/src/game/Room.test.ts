import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Server, Namespace, Socket } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { createInitialState, type BattleState, type Action } from '@chesspvp/shared';
import { Room } from './Room.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function createRoomState(): BattleState {
  const state = createInitialState('room-heal', 'mvp_default', 'userA', 'userB', 0);
  state.units = [
    {
      id: 'u_a_priest',
      owner: 'A',
      type: 'priest' as never,
      position: { x: 5, y: 5 },
      hp: 16,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
      cooldowns: {},
      status: { poisonStacks: 0 },
    },
    {
      id: 'u_a_warrior',
      owner: 'A',
      type: 'warrior',
      position: { x: 5, y: 7 },
      hp: 10,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
      cooldowns: {},
      status: { poisonStacks: 0 },
    },
    {
      id: 'u_b_warrior',
      owner: 'B',
      type: 'warrior',
      position: { x: 8, y: 8 },
      hp: 20,
      hasMoved: false,
      hasActed: false,
      spawnedThisTurn: false,
      cooldowns: {},
      status: { poisonStacks: 0 },
    },
  ];
  state.currentPlayer = 'A';
  return state;
}

function createSocketHarness() {
  const socketA = {
    emit: vi.fn((event: string) => {
      if (event === 'EVENT_BATCH') {
        throw new TypeError("Cannot perform 'IsArray' on a proxy that has been revoked");
      }
    }),
  } as unknown as Socket;
  const socketB = {
    emit: vi.fn(),
  } as unknown as Socket;

  const namespace = {
    sockets: new Map([
      ['socket-a', socketA],
      ['socket-b', socketB],
    ]),
    to: vi.fn(() => ({ emit: vi.fn() })),
  } as unknown as Namespace;

  const io = {
    of: vi.fn(() => namespace),
  } as unknown as Server;

  return { io, socketA, socketB };
}

function createRoom(actionState = createRoomState()) {
  const { io, socketA, socketB } = createSocketHarness();
  const redis = {
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  } as unknown as Redis;
  const prisma = {
    match: {
      create: vi.fn(),
    },
  } as unknown as PrismaClient;

  const room = new Room(
    io,
    redis,
    prisma,
    'match-1',
    [
      { userId: 'userA', side: 'A' },
      { userId: 'userB', side: 'B' },
    ],
    actionState
  );

  const roomAny = room as unknown as {
    players: Array<{ socketId: string | null }>;
    persistRoomState: () => Promise<void>;
  };
  roomAny.players[0]!.socketId = 'socket-a';
  roomAny.players[1]!.socketId = 'socket-b';
  roomAny.persistRoomState = vi.fn().mockResolvedValue(undefined);

  return { room, socketA, socketB };
}

describe('Room.handleAction', () => {
  it('EVENT_BATCH 发送异常时仍继续发送 STATE_SNAPSHOT 并返回成功', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { room, socketA, socketB } = createRoom();

    const result = await room.handleAction('userA', {
      type: 'USE_ABILITY',
      payload: {
        unitId: 'u_a_priest',
        abilityId: 'heal',
        targetId: 'u_a_warrior',
      },
    } satisfies Action);

    expect(result).toEqual({ ok: true });
    expect(socketA.emit).toHaveBeenCalledWith(
      'EVENT_BATCH',
      expect.objectContaining({ matchId: 'match-1' })
    );
    expect(socketA.emit).toHaveBeenCalledWith(
      'STATE_SNAPSHOT',
      expect.objectContaining({ matchId: 'match-1' })
    );
    expect(socketB.emit).toHaveBeenCalledWith(
      'EVENT_BATCH',
      expect.objectContaining({ matchId: 'match-1' })
    );
    expect(socketB.emit).toHaveBeenCalledWith(
      'STATE_SNAPSHOT',
      expect.objectContaining({ matchId: 'match-1' })
    );
    expect(consoleError).toHaveBeenCalledWith(
      '[room:event-batch] failed to emit filtered events',
      expect.objectContaining({
        matchId: 'match-1',
        side: 'A',
        actionType: 'USE_ABILITY',
      })
    );
  });
});
