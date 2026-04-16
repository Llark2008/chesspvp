import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../auth/authHook.js';

export default async function matchesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authHook);

  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const match = await app.prisma.match.findUnique({
      where: { id },
      include: { playerA: true, playerB: true, winner: true },
    });
    if (!match) {
      return reply.code(404).send({ error: { code: 'MATCH_NOT_FOUND', message: 'Match not found' } });
    }
    if (![match.playerAId, match.playerBId].includes(req.user.sub) && req.user.role !== 'admin') {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }
    return {
      id: match.id,
      playerA: { id: match.playerA.id, username: match.playerA.username },
      playerB: { id: match.playerB.id, username: match.playerB.username },
      winner: match.winner ? { id: match.winner.id, username: match.winner.username } : null,
      result: match.result,
      mapId: match.mapId,
      isRanked: match.isRanked,
      durationMs: match.durationMs,
      turnCount: match.turnCount,
      startedAt: match.startedAt.toISOString(),
      endedAt: match.endedAt.toISOString(),
    };
  });

  app.get('/:id/replay', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const replay = await app.prisma.matchReplay.findUnique({
      where: { matchId: id },
      include: { match: true },
    });
    if (!replay) {
      return reply.code(404).send({ error: { code: 'MATCH_NOT_FOUND', message: 'Match not found' } });
    }
    if (
      ![replay.match.playerAId, replay.match.playerBId].includes(req.user.sub) &&
      req.user.role !== 'admin'
    ) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }
    return {
      matchId: id,
      initialState: replay.initialState,
      actions: replay.actions,
    };
  });
}
