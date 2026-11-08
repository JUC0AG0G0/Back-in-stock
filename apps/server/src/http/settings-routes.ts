import type { FastifyInstance } from 'fastify';
import {
  InvalidSettingError,
  UPDATE_INTERVAL_LIMITS,
  type RuntimeSettings,
  type RuntimeSettingsPatch,
} from '../application/runtime-settings.js';
import { API_DOCS_PREFIX } from './api-docs.js';

export interface SettingsRoutesOptions {
  settings: RuntimeSettings;
  /** False for edge and dev builds: they never look for updates, whatever the setting. */
  updateCheckSupported: boolean;
}

const setting = (type: object) =>
  ({
    type: 'object',
    required: ['value', 'default', 'overridden'],
    properties: { value: type, default: type, overridden: { type: 'boolean' } },
  }) as const;

const intervalType = {
  type: 'integer',
  minimum: UPDATE_INTERVAL_LIMITS.min,
  maximum: UPDATE_INTERVAL_LIMITS.max,
} as const;
const channelType = { type: 'string', enum: ['stable', 'prerelease'] } as const;

const settingsResponse = {
  type: 'object',
  required: ['values', 'updateIntervalHours', 'updateCheckSupported', 'apiDocs'],
  properties: {
    values: {
      type: 'object',
      required: ['updateCheck', 'updateIntervalHours', 'updateChannel', 'apiDocs'],
      properties: {
        updateCheck: setting({ type: 'boolean' }),
        updateIntervalHours: setting(intervalType),
        updateChannel: setting(channelType),
        apiDocs: setting({ type: 'boolean' }),
      },
    },
    updateIntervalHours: {
      type: 'object',
      properties: { min: { type: 'integer' }, max: { type: 'integer' } },
    },
    updateCheckSupported: { type: 'boolean' },
    apiDocs: {
      type: 'object',
      required: ['available', 'path'],
      properties: {
        available: { type: 'boolean', description: 'The Swagger packages are installed' },
        path: { type: 'string', examples: [API_DOCS_PREFIX] },
      },
    },
  },
} as const;

// A type list rather than anyOf: with Fastify's type coercion, anyOf would turn 0 into null.
const nullable = <T extends { type: string; enum?: readonly string[] }>(schema: T) => ({
  ...schema,
  type: [schema.type, 'null'],
  ...(schema.enum ? { enum: [...schema.enum, null] } : {}),
});

/** Settings screen (SPEC §7). Environment variables are defaults, saved values replace them. */
export function registerSettingsRoutes(
  app: FastifyInstance,
  { settings, updateCheckSupported }: SettingsRoutesOptions,
  apiDocsAvailable: boolean,
): void {
  const view = () => ({
    values: settings.view(),
    updateIntervalHours: UPDATE_INTERVAL_LIMITS,
    updateCheckSupported,
    apiDocs: { available: apiDocsAvailable, path: API_DOCS_PREFIX },
  });

  app.get(
    '/api/settings',
    {
      schema: {
        tags: ['system'],
        summary: 'Settings that can change without a restart',
        response: { 200: settingsResponse },
      },
    },
    async () => view(),
  );

  app.patch<{ Body: RuntimeSettingsPatch }>(
    '/api/settings',
    {
      schema: {
        tags: ['system'],
        summary: 'Changes settings. null goes back to the default (environment variable)',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            updateCheck: nullable({ type: 'boolean' }),
            updateIntervalHours: nullable(intervalType),
            updateChannel: nullable(channelType),
            apiDocs: nullable({ type: 'boolean' }),
          },
        },
        response: {
          200: settingsResponse,
          400: {
            type: 'object',
            properties: { error: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await settings.update(request.body);
      } catch (err) {
        if (err instanceof InvalidSettingError) {
          return reply.code(400).send({ error: 'invalid-setting', message: err.message });
        }
        throw err;
      }
      return view();
    },
  );
}
