import { randomUUID } from 'node:crypto';
import type { WatchType } from '@back-in-stock/plugin-sdk';
import type { FastifyInstance } from 'fastify';
import type { ChannelRepository, WatchRepository } from '../application/ports.js';
import { createWatch, DomainError, Url, type Watch } from '../domain/index.js';
import type { SourceRegistry } from '../infrastructure/plugins/registry.js';

export interface WatchRoutesOptions {
  sources: SourceRegistry;
  watches: WatchRepository;
  /** Enabled default channels are attached to every new watch. */
  channels?: Pick<ChannelRepository, 'list'>;
  newId?: () => string;
}

interface MatchBody {
  url: string;
}

interface CreateWatchBody {
  url: string;
  type: WatchType;
  sourceId: string;
  name?: string;
}

const watchType = { type: 'string', enum: ['product', 'listing'] } as const;

const watchView = {
  type: 'object',
  required: ['id', 'type', 'url', 'name', 'sourceId', 'active', 'channelIds'],
  properties: {
    id: { type: 'string' },
    type: watchType,
    url: { type: 'string' },
    name: { type: 'string' },
    sourceId: { type: 'string' },
    active: { type: 'boolean' },
    channelIds: { type: 'array', items: { type: 'string' } },
  },
} as const;

const errorView = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
} as const;

const matchSchema = {
  tags: ['watches'],
  summary: 'Source plugins able to read a URL, best first',
  description:
    'Used by the "paste a link" box: lists every plugin whose match() score is above 0, ' +
    'and the best one for each watch type.',
  body: {
    type: 'object',
    required: ['url'],
    properties: { url: { type: 'string', minLength: 1, maxLength: 2048 } },
  },
  response: {
    200: {
      type: 'object',
      required: ['url', 'hostname', 'candidates', 'suggested'],
      properties: {
        url: { type: 'string', description: 'Normalized URL (no fragment).' },
        hostname: { type: 'string' },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'supports', 'score'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              supports: { type: 'array', items: watchType },
              score: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
        suggested: {
          type: 'object',
          description: 'Best plugin id for each watch type, missing when none can read the URL.',
          properties: { product: { type: 'string' }, listing: { type: 'string' } },
        },
      },
    },
    400: errorView,
  },
} as const;

function toView(watch: Watch) {
  return { ...watch, url: watch.url.value };
}

/** Watches (SPEC §2): created from the home page, by pasting a link. */
export function registerWatchRoutes(
  app: FastifyInstance,
  { sources, watches, channels, newId = randomUUID }: WatchRoutesOptions,
): void {
  app.post<{ Body: MatchBody }>(
    '/api/sources/match',
    { schema: matchSchema },
    async (request, reply) => {
      let url: Url;
      try {
        url = Url.parse(request.body.url);
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
      const target = url.toURL();
      const candidates = sources
        .list()
        .map((plugin) => ({
          id: plugin.id,
          name: plugin.name,
          supports: [...plugin.supports],
          score: sources.score(plugin, target),
        }))
        .filter((candidate) => candidate.score > 0)
        // Stable sort: ties keep the registration order, like SourceRegistry.resolve().
        .sort((a, b) => b.score - a.score);
      const suggested: Partial<Record<WatchType, string>> = {};
      for (const type of ['product', 'listing'] as const) {
        const best = sources.resolve(target, type);
        if (best) suggested[type] = best.plugin.id;
      }
      return { url: url.value, hostname: url.hostname, candidates, suggested };
    },
  );

  app.get(
    '/api/watches',
    {
      schema: {
        tags: ['watches'],
        summary: 'Monitored URLs',
        response: { 200: { type: 'array', items: watchView } },
      },
    },
    async () => (await watches.list()).map(toView),
  );

  app.post<{ Body: CreateWatchBody }>(
    '/api/watches',
    {
      schema: {
        tags: ['watches'],
        summary: 'Start monitoring a URL',
        description: 'Enabled default channels are attached to the new watch.',
        body: {
          type: 'object',
          required: ['url', 'type', 'sourceId'],
          properties: {
            url: { type: 'string', minLength: 1, maxLength: 2048 },
            type: watchType,
            sourceId: { type: 'string', minLength: 1 },
            name: { type: 'string', maxLength: 200 },
          },
        },
        response: { 201: watchView, 400: errorView },
      },
    },
    async (request, reply) => {
      const { url, type, sourceId, name } = request.body;
      const plugin = sources.get(sourceId);
      if (!plugin) return reply.code(400).send({ error: `Unknown source plugin: ${sourceId}` });
      if (!plugin.supports.includes(type)) {
        return reply.code(400).send({ error: `${plugin.name} cannot watch a ${type}` });
      }
      const defaults = channels
        ? (await channels.list()).filter((c) => c.enabled && c.isDefault).map((c) => c.id)
        : [];
      let watch: Watch;
      try {
        watch = createWatch({
          id: newId(),
          type,
          url,
          sourceId,
          channelIds: defaults,
          ...(name === undefined ? {} : { name }),
        });
      } catch (err) {
        if (err instanceof DomainError) return reply.code(400).send({ error: err.message });
        throw err;
      }
      await watches.save(watch);
      return reply.code(201).send(toView(watch));
    },
  );
}
