import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getLeaderboard } from '../rankings/service.js';

export default async function rankingsRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(req.query);

    return {
      seasonId: 1,
      entries: await getLeaderboard(app.prisma, { limit: query.limit ?? 50, seasonId: 1 }),
    };
  });
}
