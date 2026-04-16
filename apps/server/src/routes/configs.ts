import type { FastifyInstance } from 'fastify';
import { UNITS, MAPS, BALANCE } from '@chesspvp/shared';

export default async function configsRoutes(app: FastifyInstance) {
  app.get('/units', async () => UNITS);
  app.get('/maps', async () => MAPS);
  app.get('/balance', async () => BALANCE);
}
