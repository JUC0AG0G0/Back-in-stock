import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

export interface AppOptions {
  version: string;
  /** Built web UI to serve. Skipped when missing, e.g. while the UI runs on the Vite dev server. */
  webDir?: string;
  logger?: FastifyServerOptions['logger'];
}

/**
 * Builds the HTTP app without listening on a port,
 * so tests can call it with `app.inject()`.
 */
export async function buildApp({
  version,
  webDir,
  logger = false,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  app.get('/api/health', async () => ({ status: 'ok' as const, version }));

  const serveWeb = webDir !== undefined && existsSync(join(webDir, 'index.html'));
  if (serveWeb) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false });
  }

  app.setNotFoundHandler(async (request, reply) => {
    // Unknown page routes fall back to the SPA, which does its own routing.
    if (serveWeb && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });

  return app;
}
