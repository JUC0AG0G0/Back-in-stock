import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

export interface AppOptions {
  version: string;
  logger?: FastifyServerOptions['logger'];
}

/**
 * Builds the HTTP app without listening on a port,
 * so tests can call it with `app.inject()`.
 */
export function buildApp({ version, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/api/health', async () => ({ status: 'ok' as const, version }));

  return app;
}
