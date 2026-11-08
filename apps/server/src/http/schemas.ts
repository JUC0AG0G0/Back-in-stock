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

const nullableString = { type: ['string', 'null'] } as const;

const updateJob = {
  type: ['object', 'null'],
  description: 'Last update run by the updater service, null when none.',
  properties: {
    id: nullableString,
    state: { type: 'string', enum: ['idle', 'running', 'succeeded', 'failed', 'rolled-back'] },
    step: {
      type: ['string', 'null'],
      enum: ['pull', 'backup', 'recreate', 'healthcheck', 'rollback', 'done', null],
    },
    fromVersion: nullableString,
    targetVersion: nullableString,
    backup: nullableString,
    message: nullableString,
    startedAt: nullableString,
    finishedAt: nullableString,
  },
} as const;

export const updateStatusSchema = {
  tags: ['system'],
  summary: 'Available updates, their changelog and the state of the one-click install',
  response: {
    200: {
      type: 'object',
      required: ['enabled', 'currentVersion', 'updateAvailable', 'releases', 'oneClick'],
      properties: {
        enabled: { type: 'boolean' },
        disabledReason: { type: ['string', 'null'], enum: ['disabled', 'not-a-release', null] },
        currentVersion: { type: 'string', examples: ['1.3.2'] },
        buildChannel: { type: 'string', enum: ['release', 'edge', 'dev'] },
        channel: { type: 'string', enum: ['stable', 'prerelease'] },
        latestVersion: { ...nullableString, examples: ['1.4.0'] },
        updateAvailable: { type: 'boolean' },
        breaking: { type: 'boolean' },
        releases: {
          type: 'array',
          items: {
            type: 'object',
            required: ['version', 'name', 'notes', 'url'],
            properties: {
              version: { type: 'string' },
              name: { type: 'string' },
              notes: { type: 'string', description: 'Release notes in Markdown' },
              url: { type: 'string' },
              publishedAt: { type: 'string' },
              prerelease: { type: 'boolean' },
              breaking: { type: 'boolean' },
            },
          },
        },
        checkedAt: nullableString,
        error: nullableString,
        oneClick: { type: 'boolean', description: 'The updater service answers' },
        job: updateJob,
      },
    },
  },
} as const;

export const updateJobSchema = {
  tags: ['system'],
  summary: 'Progress of the running (or last) update',
  response: { 200: { type: 'object', properties: { job: updateJob } } },
} as const;

const updateError = {
  type: 'object',
  required: ['error', 'message'],
  properties: { error: { type: 'string' }, message: { type: 'string' } },
} as const;

export const installUpdateSchema = {
  tags: ['system'],
  summary: 'Installs an available version through the updater service',
  body: {
    type: 'object',
    required: ['version'],
    additionalProperties: false,
    properties: { version: { type: 'string', examples: ['1.4.0'] } },
  },
  response: {
    202: { type: 'object', properties: { job: updateJob } },
    400: updateError,
    409: updateError,
  },
} as const;
