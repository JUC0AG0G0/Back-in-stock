import type { FastifyInstance } from 'fastify';

/** Where the Swagger UI is served. The OpenAPI document is at `${API_DOCS_PREFIX}/json`. */
export const API_DOCS_PREFIX = '/api/docs';

/**
 * Swagger UI for developers, generated from the route schemas.
 * Development only: both packages are devDependencies, absent from the Docker image,
 * so they are imported lazily and never loaded in production.
 *
 * Must be registered before the routes, so that it sees them being added.
 */
export async function registerApiDocs(app: FastifyInstance, version: string): Promise<void> {
  const [{ default: swagger }, { default: swaggerUi }] = await Promise.all([
    import('@fastify/swagger'),
    import('@fastify/swagger-ui'),
  ]);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Back in stock ! API',
        description: 'Internal API of the web UI. Not stable yet: it can change in any release.',
        version,
      },
      tags: [{ name: 'system', description: 'Health and installed plugins' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: API_DOCS_PREFIX });
}
