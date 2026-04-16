import type { Socket } from 'socket.io';
import type Redis from 'ioredis';
import { verifyJwt } from '../auth/jwt.js';

export function socketAuthMiddleware(redis: Redis) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
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
