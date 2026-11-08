import { randomUUID } from 'node:crypto';
import { toLocale } from '@back-in-stock/i18n';
import type { Fetcher, Logger, NotifierPlugin } from '@back-in-stock/plugin-sdk';
import type { FastifyInstance } from 'fastify';
import {
  configJsonSchema,
  formatIssues,
  maskConfig,
  mergeConfig,
  secretFields,
} from '../application/channel-config.js';
import type { Channel, ChannelRepository } from '../application/ports.js';
import { notifierContext, testNotifier } from '../application/test-notifier.js';
import type { NotifierRegistry } from '../infrastructure/plugins/registry.js';

export interface ChannelRoutesOptions {
  notifiers: NotifierRegistry;
  channels: ChannelRepository;
  fetch: Fetcher;
  logger: Logger;
}

interface IdParams {
  id: string;
}

interface NotifierActionBody {
  /** Settings typed so far in the form. */
  config?: unknown;
  /** When editing a saved channel: its stored secrets fill the fields left empty. */
  channelId?: string;
  locale?: string;
}

interface CreateChannelBody {
  notifierId: string;
  name: string;
  config: unknown;
  enabled?: boolean;
  isDefault?: boolean;
}

type UpdateChannelBody = Partial<Omit<CreateChannelBody, 'notifierId'>>;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const actionBody = {
  type: 'object',
  properties: {
    config: { type: 'object', additionalProperties: true },
    channelId: { type: 'string' },
    locale: { type: 'string' },
  },
} as const;

const channelFields = {
  name: { type: 'string', minLength: 1, maxLength: 100 },
  config: { type: 'object', additionalProperties: true },
  enabled: { type: 'boolean' },
  isDefault: { type: 'boolean' },
} as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Notification channels (SPEC §2, §7 "Canaux", §9): configured instances of a notifier,
 * several per notifier if wanted. Secrets are never sent back (SPEC §14).
 */
export async function registerChannelRoutes(
  app: FastifyInstance,
  { notifiers, channels, fetch, logger }: ChannelRoutesOptions,
): Promise<void> {
  const deps = { fetch, logger };

  const toView = (channel: Channel) => {
    const plugin = notifiers.get(channel.notifierId);
    const masked = maskConfig(channel.config, plugin ? secretFields(plugin) : []);
    return { ...channel, ...masked, available: plugin !== undefined };
  };

  /** Config typed in the form, completed with the stored secrets of the edited channel. */
  const formConfig = async (plugin: NotifierPlugin, body: NotifierActionBody) => {
    const stored = body.channelId ? await channels.get(body.channelId) : undefined;
    const base = stored?.notifierId === plugin.id ? stored.config : {};
    return mergeConfig(base, body.config ?? {}, secretFields(plugin));
  };

  app.get(
    '/api/notifiers',
    { schema: { tags: ['channels'], summary: 'Notifier plugins and how to set them up' } },
    async () =>
      notifiers.list().map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        configSchema: configJsonSchema(plugin),
        secretFields: secretFields(plugin),
        setupGuide: plugin.setupGuide ?? [],
        translations: plugin.translations ?? {},
        capabilities: {
          validate: plugin.validate !== undefined,
          discover: plugin.discover !== undefined,
        },
      })),
  );

  const notifierOr404 = (id: string) => notifiers.get(id);

  app.post<{ Params: IdParams; Body: NotifierActionBody }>(
    '/api/notifiers/:id/validate',
    {
      schema: {
        tags: ['channels'],
        summary: 'Check settings before saving',
        params: idParams,
        body: actionBody,
      },
    },
    async (request, reply) => {
      const plugin = notifierOr404(request.params.id);
      if (!plugin) return reply.code(404).send({ error: 'Unknown notifier' });
      const config = await formConfig(plugin, request.body);
      if (!plugin.validate) {
        const parsed = plugin.configSchema.safeParse(config);
        return parsed.success
          ? { ok: true }
          : { ok: false, error: formatIssues(parsed.error).join('\n') };
      }
      try {
        return await plugin.validate(notifierContext(config, deps));
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  app.post<{ Params: IdParams; Body: NotifierActionBody }>(
    '/api/notifiers/:id/discover',
    {
      schema: {
        tags: ['channels'],
        summary: 'Look up settings, e.g. the Telegram chat id',
        params: idParams,
        body: actionBody,
      },
    },
    async (request, reply) => {
      const plugin = notifierOr404(request.params.id);
      if (!plugin) return reply.code(404).send({ error: 'Unknown notifier' });
      if (!plugin.discover)
        return reply.code(400).send({ error: 'This notifier cannot discover settings' });
      try {
        const config = await formConfig(plugin, request.body);
        const { candidates } = await plugin.discover(notifierContext(config, deps));
        return { ok: true, candidates };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  const runTest = async (plugin: NotifierPlugin, config: unknown, locale: string | undefined) => {
    const parsed = plugin.configSchema.safeParse(config);
    if (!parsed.success) return { ok: false, error: formatIssues(parsed.error).join('\n') };
    try {
      await testNotifier(plugin, parsed.data, { ...deps, locale: toLocale(locale) });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  };

  app.post<{ Params: IdParams; Body: NotifierActionBody }>(
    '/api/notifiers/:id/test',
    {
      schema: {
        tags: ['channels'],
        summary: 'Send a test message with unsaved settings',
        params: idParams,
        body: actionBody,
      },
    },
    async (request, reply) => {
      const plugin = notifierOr404(request.params.id);
      if (!plugin) return reply.code(404).send({ error: 'Unknown notifier' });
      return runTest(plugin, await formConfig(plugin, request.body), request.body.locale);
    },
  );

  app.get(
    '/api/channels',
    { schema: { tags: ['channels'], summary: 'Configured channels, secrets hidden' } },
    async () => (await channels.list()).map(toView),
  );

  app.post<{ Body: CreateChannelBody }>(
    '/api/channels',
    {
      schema: {
        tags: ['channels'],
        summary: 'Create a channel',
        body: {
          type: 'object',
          required: ['notifierId', 'name', 'config'],
          properties: { notifierId: { type: 'string' }, ...channelFields },
        },
      },
    },
    async (request, reply) => {
      const { notifierId, name, config, enabled = true, isDefault = false } = request.body;
      const plugin = notifiers.get(notifierId);
      if (!plugin) return reply.code(400).send({ error: `Unknown notifier: ${notifierId}` });
      const parsed = plugin.configSchema.safeParse(config);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid config', issues: formatIssues(parsed.error) });
      }
      const channel: Channel = {
        id: randomUUID(),
        notifierId,
        name: name.trim(),
        config: parsed.data,
        enabled,
        isDefault,
      };
      await channels.save(channel);
      return reply.code(201).send(toView(channel));
    },
  );

  app.patch<{ Params: IdParams; Body: UpdateChannelBody }>(
    '/api/channels/:id',
    {
      schema: {
        tags: ['channels'],
        summary: 'Update a channel. Empty secrets keep their stored value',
        params: idParams,
        body: { type: 'object', properties: channelFields },
      },
    },
    async (request, reply) => {
      const channel = await channels.get(request.params.id);
      if (!channel) return reply.code(404).send({ error: 'Unknown channel' });
      const { name, config, enabled, isDefault } = request.body;
      const updated: Channel = {
        ...channel,
        ...(name === undefined ? {} : { name: name.trim() }),
        ...(enabled === undefined ? {} : { enabled }),
        ...(isDefault === undefined ? {} : { isDefault }),
      };
      if (config !== undefined) {
        const plugin = notifiers.get(channel.notifierId);
        if (!plugin) return reply.code(409).send({ error: 'Notifier plugin not installed' });
        const parsed = plugin.configSchema.safeParse(
          mergeConfig(channel.config, config, secretFields(plugin)),
        );
        if (!parsed.success) {
          return reply
            .code(400)
            .send({ error: 'Invalid config', issues: formatIssues(parsed.error) });
        }
        updated.config = parsed.data;
      }
      await channels.save(updated);
      return toView(updated);
    },
  );

  app.delete<{ Params: IdParams }>(
    '/api/channels/:id',
    { schema: { tags: ['channels'], summary: 'Delete a channel', params: idParams } },
    async (request, reply) => {
      if (!(await channels.get(request.params.id))) {
        return reply.code(404).send({ error: 'Unknown channel' });
      }
      await channels.delete(request.params.id);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: IdParams; Body: { locale?: string } | undefined }>(
    '/api/channels/:id/test',
    {
      schema: {
        tags: ['channels'],
        summary: 'Send a test message on a saved channel',
        params: idParams,
      },
    },
    async (request, reply) => {
      const channel = await channels.get(request.params.id);
      if (!channel) return reply.code(404).send({ error: 'Unknown channel' });
      const plugin = notifiers.get(channel.notifierId);
      if (!plugin) return reply.code(409).send({ error: 'Notifier plugin not installed' });
      return runTest(plugin, channel.config, request.body?.locale);
    },
  );
}
