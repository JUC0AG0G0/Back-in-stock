// JSON schemas of the API responses. Fastify uses them to serialize responses
// (fields not listed are dropped, so nothing leaks by accident) and Swagger to document them.

export const healthSchema = {
  tags: ['system'],
  summary: 'Health of the server and its database',
  description: 'Used by the Docker HEALTHCHECK.',
  response: {
    200: {
      type: 'object',
      required: ['status', 'version'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        version: { type: 'string', examples: ['0.1.0'] },
      },
    },
    503: {
      type: 'object',
      required: ['status', 'version', 'database'],
      properties: {
        status: { type: 'string', enum: ['error'] },
        version: { type: 'string' },
        database: { type: 'string', enum: ['unavailable'] },
      },
    },
  },
} as const;

const pluginInfo = {
  type: 'object',
  required: ['id', 'name', 'version'],
  properties: {
    id: { type: 'string', examples: ['fanatec'] },
    name: { type: 'string' },
    version: { type: 'string' },
  },
} as const;

export const pluginsSchema = {
  tags: ['system'],
  summary: 'Installed plugins, and the ones that failed to load',
  response: {
    200: {
      type: 'object',
      required: ['sources', 'notifiers', 'rejected'],
      properties: {
        sources: {
          type: 'array',
          items: {
            ...pluginInfo,
            required: [...pluginInfo.required, 'supports'],
            properties: {
              ...pluginInfo.properties,
              supports: { type: 'array', items: { type: 'string', enum: ['product', 'listing'] } },
            },
          },
        },
        notifiers: { type: 'array', items: pluginInfo },
        rejected: {
          type: 'array',
          items: {
            type: 'object',
            required: ['origin', 'errors'],
            properties: {
              origin: { type: 'string', examples: ['builtin'] },
              id: { type: 'string' },
              errors: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
} as const;
