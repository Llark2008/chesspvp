import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    let dbStatus = 'ok';
    let redisStatus = 'ok';
    try {
      await app.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'fail';
    }
    try {
      const pong = await app.redis.ping();
      if (pong !== 'PONG') redisStatus = 'fail';
    } catch {
      redisStatus = 'fail';
    }
    return { status: 'ok', db: dbStatus, redis: redisStatus };
  });
}
