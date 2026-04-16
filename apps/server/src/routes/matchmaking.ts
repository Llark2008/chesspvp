import type { FastifyInstance } from 'fastify';
import { authHook } from '../auth/authHook.js';

export default async function matchmakingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authHook);

  app.post('/join', async (req, reply) => {
    const userId = req.user.sub;
    const status = await app.redis.get(`matchmaking:user:${userId}`);
    if (status === 'queued') {
      return reply.code(409).send({ error: { code: 'ALREADY_IN_QUEUE', message: 'Already in queue' } });
    }
    if (status?.startsWith('in_match:')) {
      return reply.code(409).send({ error: { code: 'ALREADY_IN_MATCH', message: 'Already in a match' } });
    }
    const ranking = await app.prisma.ranking.findUnique({ where: { userId } });
    const now = Date.now();
    await app.matchmaker.enqueue(userId, ranking?.rating ?? 1000);
    return { status: 'queued', queuedAt: now, estimatedWaitMs: 5000 };
  });

  app.post('/leave', async (req) => {
    const userId = req.user.sub;
    await app.redis.zrem('matchmaking:queue', userId);
    await app.redis.del(`matchmaking:user:${userId}`, `matchmaking:rating:${userId}`);
    return { status: 'left' };
  });
}
