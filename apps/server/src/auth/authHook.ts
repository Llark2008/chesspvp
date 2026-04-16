import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, type JwtPayload } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

export async function authHook(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'No token' } });
  }
  try {
    const payload = await verifyJwt(auth.slice(7));
    const exists = await req.server.redis.exists(`session:${payload.jti}`);
    if (!exists) {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Session expired' } });
    }
    req.user = payload;
  } catch {
    return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid token' } });
  }
}
