import type { FastifyInstance } from 'fastify';
import { authHook } from '../auth/authHook.js';
import { mapMeDto } from '../auth/guest.js';

export default async function meRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authHook);

  app.get('/', async (req, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { ranking: true },
    });
    if (!user) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    return mapMeDto(app.prisma, user);
  });
}
