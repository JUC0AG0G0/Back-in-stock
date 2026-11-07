import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { NotifierRegistry, SourceRegistry } from '../infrastructure/plugins/registry.js';
import { registerApiDocs } from './api-docs.js';
import { healthSchema, pluginsSchema } from './schemas.js';

export interface AppOptions {
  version: string;
  /** Built web UI to serve. Skipped when missing, e.g. while the UI runs on the Vite dev server. */
  webDir?: string;
  logger?: FastifyServerOptions['logger'];
  plugins?: { sources: SourceRegistry; notifiers: NotifierRegistry };
  /** Returns false when the database cannot answer: /api/health then fails. */
  databasePing?: () => boolean;
  /** Serves the Swagger UI at /api/docs. Development only (needs the server's devDependencies). */
  apiDocs?: boolean;
}

/**
 * Builds the HTTP app without listening on a port,
 * so tests can call it with `app.inject()`.
 */
export async function buildApp({
  version,
  webDir,
  logger = false,
  plugins,
  databasePing,
  apiDocs = false,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  if (apiDocs) await registerApiDocs(app, version);

  // Used by the Docker HEALTHCHECK: an unreachable database makes the container unhealthy.
  app.get('/api/health', { schema: healthSchema }, async (_request, reply) => {
    if (databasePing && !databasePing()) {
      return reply.code(503).send({ status: 'error', version, database: 'unavailable' });
    }
    return { status: 'ok' as const, version };
  });

  if (plugins) {
    // Lets the UI show installed plugins and explain why a plugin was not loaded.
    app.get('/api/plugins', { schema: pluginsSchema }, async () => ({
      sources: plugins.sources.list().map(({ id, name, version, supports }) => ({
        id,
        name,
        version,
        supports,
      })),
      notifiers: plugins.notifiers.list().map(({ id, name, version }) => ({ id, name, version })),
      rejected: [...plugins.sources.rejected(), ...plugins.notifiers.rejected()],
    }));
  }

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
