import { io, type Socket } from 'socket.io-client';
import type { Server2ClientEvents, Client2ServerEvents } from '@chesspvp/shared';
import { env } from '../env';

export type GameSocket = Socket<Server2ClientEvents, Client2ServerEvents>;

let _socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (!_socket) {
    throw new Error('Socket not initialized. Call connectSocket() first.');
  }
  return _socket;
}

export function connectSocket(token: string): GameSocket {
  if (_socket?.connected) return _socket;

  _socket = io(`${env.SOCKET_URL}/game`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  }) as GameSocket;

  return _socket;
}

export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
