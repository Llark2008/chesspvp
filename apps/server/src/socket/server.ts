import { Server } from 'socket.io';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Http2SecureServer, Http2Server } from 'node:http2';
import type { Server as HttpServer } from 'node:http';
import type { Client2ServerEvents, Server2ClientEvents } from '@chesspvp/shared';
import { config } from '../config.js';

export function createSocketServer(
  httpServer: HttpServer | Http2Server | Http2SecureServer,
) {
  const corsOrigin = config.NODE_ENV === 'development' ? true : config.CORS_ORIGIN;
  const io = new Server<Client2ServerEvents, Server2ClientEvents>(
    httpServer as HttpServer<typeof IncomingMessage, typeof ServerResponse>,
    {
      cors: { origin: corsOrigin },
      pingInterval: 10000,
      pingTimeout: 5000,
    },
  );
  return io;
}
