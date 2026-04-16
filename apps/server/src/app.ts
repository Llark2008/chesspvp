import Fastify from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { config } from './config.js';
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import matchmakingRoutes from './routes/matchmaking.js';
import matchesRoutes from './routes/matches.js';
import configsRoutes from './routes/configs.js';
import debugRoutes from './routes/debug.js';
import rankingsRoutes from './routes/rankings.js';
import { createSocketServer } from './socket/server.js';
import { attachGameNamespace } from './socket/gameNamespace.js';
import { RoomManager } from './game/RoomManager.js';
import { Matchmaker } from './matchmaking/Matchmaker.js';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    matchmaker: Matchmaker;
  }
}

export async function buildApp() {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });

  // In development allow any origin so --host LAN testing works out of the box.
  // In production CORS_ORIGIN must be set explicitly.
  const corsOrigin = config.NODE_ENV === 'development' ? true : config.CORS_ORIGIN;
  await app.register(cors, { origin: corsOrigin });
  await app.register(prismaPlugin);
  await app.register(redisPlugin);

  app.register(healthRoutes);
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(meRoutes, { prefix: '/api/v1/me' });
  app.register(matchmakingRoutes, { prefix: '/api/v1/matchmaking' });
  app.register(matchesRoutes, { prefix: '/api/v1/matches' });
  app.register(rankingsRoutes, { prefix: '/api/v1/rankings' });
  app.register(configsRoutes, { prefix: '/api/v1/configs' });

  // Socket + game infrastructure — registered as a plugin so it runs
  // after prisma/redis are available (inside the plugin lifecycle)
  await app.register(
    fp(async (instance: FastifyInstance) => {
      const io = createSocketServer(instance.server);
      attachGameNamespace(io, { prisma: instance.prisma, redis: instance.redis });
      RoomManager.init({ io, prisma: instance.prisma, redis: instance.redis });
      const matchmaker = new Matchmaker({
        redis: instance.redis,
        io,
        prisma: instance.prisma,
      });
      matchmaker.start();
      instance.decorate('matchmaker', matchmaker);
    }),
  );

  app.register(async (instance: FastifyInstance) => {
    debugRoutes(instance, { matchmaker: instance.matchmaker });
  }, { prefix: '/api/v1/debug' });

  return app;
}
