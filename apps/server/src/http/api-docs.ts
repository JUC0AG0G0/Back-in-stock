import type { FastifyInstance } from 'fastify';

/** Where the Swagger UI is served. The OpenAPI document is at `${API_DOCS_PREFIX}/json`. */
export const API_DOCS_PREFIX = '/api/docs';

const API_DOCS_URL = /^\/api\/docs(?:[/?]|$)/;

/**
 * Swagger UI, generated from the route schemas.
 * `enabled` is read on every request, so Settings can turn it on or off without a restart:
 * when off, /api/docs answers 404 as if it did not exist.
 *
 * Must be registered before the routes, so that it sees them being added.
 * Returns false when the Swagger packages cannot be loaded (the UI then shows it as unavailable).
 */
export async function registerApiDocs(
  app: FastifyInstance,
  version: string,
  enabled: () => boolean,
): Promise<boolean> {
  let plugins;
  try {
    plugins = await Promise.all([import('@fastify/swagger'), import('@fastify/swagger-ui')]);
  } catch (err) {
    app.log.warn({ err }, 'Swagger packages not found: API docs unavailable');
    return false;
  }
  const [{ default: swagger }, { default: swaggerUi }] = plugins;

  app.addHook('onRequest', async (request, reply) => {
    if (API_DOCS_URL.test(request.url) && !enabled()) {
      return reply.code(404).send({ error: 'Not Found' });
    }
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Back in stock ! API',
        description: 'Internal API of the web UI. Not stable yet: it can change in any release.',
        version,
      },
      tags: [
        { name: 'system', description: 'Health, installed plugins, updates and settings' },
        { name: 'plugins', description: 'Plugin self-tests' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: API_DOCS_PREFIX });
  return true;
}
