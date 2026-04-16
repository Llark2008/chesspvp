import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { Matchmaker } from '../matchmaking/Matchmaker.js';

export default async function debugRoutes(
  app: FastifyInstance,
  opts: { matchmaker: Matchmaker },
) {
  if (config.NODE_ENV !== 'development') return;

  app.post('/create-match', async (req, reply) => {
    const body = z
      .object({ userAId: z.string(), userBId: z.string() })
      .parse(req.body);
    const matchId = await opts.matchmaker.createMatch(body.userAId, body.userBId, false);
    return reply.send({ matchId });
  });
}
