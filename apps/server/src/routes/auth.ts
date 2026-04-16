import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../auth/authHook.js';
import { createGuestUser, mapMeDto } from '../auth/guest.js';
import {
  AuthServiceError,
  loginUser,
  logoutSession,
  registerUser,
  upgradeGuestUser,
} from '../auth/service.js';

export default async function authRoutes(app: FastifyInstance) {
  app.post('/guest', async (req) => {
    const body = z
      .object({ username: z.string().trim().min(1).max(32).optional() })
      .parse(req.body);
    const { token, user } = await createGuestUser(app.prisma, app.redis, body.username);
    return { token, user: await mapMeDto(app.prisma, user) };
  });

  app.post('/register', async (req, reply) => {
    const body = z.object({
      username: z.string().trim().min(1).max(32),
      email: z.string().trim().email(),
      password: z.string().min(8),
    }).parse(req.body);
    try {
      return await registerUser(app.prisma, app.redis, body);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/login', async (req, reply) => {
    const body = z.object({
      email: z.string().trim().email(),
      password: z.string().min(8),
    }).parse(req.body);
    try {
      return await loginUser(app.prisma, app.redis, body);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/upgrade', { preHandler: authHook }, async (req, reply) => {
    const body = z.object({
      username: z.string().trim().min(1).max(32),
      email: z.string().trim().email(),
      password: z.string().min(8),
    }).parse(req.body);

    try {
      return await upgradeGuestUser(
        app.prisma,
        app.redis,
        { userId: req.user.sub, currentJti: req.user.jti },
        body,
      );
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/logout', { preHandler: authHook }, async (req) => {
    return logoutSession(app.redis, req.user.jti);
  });
}
