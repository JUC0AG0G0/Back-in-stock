import { randomUUID } from 'node:crypto';
import {
  SourceError,
  type Fetcher,
  type Logger,
  type ProductSnapshot,
  type WatchType,
} from '@back-in-stock/plugin-sdk';
import type { FastifyInstance } from 'fastify';
import type {
  ChannelRepository,
  ProductReading,
  ProductReadingRepository,
  WatchRepository,
} from '../application/ports.js';
import {
  createWatch,
  DomainError,
  updateWatch,
  Url,
  WATCH_INTERVAL_LIMITS,
  type Watch,
  type WatchChanges,
} from '../domain/index.js';
import { htmlHelpers } from '../infrastructure/html/html-helpers.js';
import type { SourceRegistry } from '../infrastructure/plugins/registry.js';

export interface WatchRoutesOptions {
  sources: SourceRegistry;
  watches: WatchRepository;
  /** Enabled default channels are attached to every new watch. */
  channels?: Pick<ChannelRepository, 'list'>;
  newId?: () => string;
  /** Last product read of each watch, shown on its card. */
  readings?: ProductReadingRepository;
  /** Reads a product watch's page now (the "Refresh" button). */
  checkProduct?: (watch: Watch) => Promise<ProductSnapshot>;
  now?: () => Date;
}

interface MatchBody {
  url: string;
}

interface CreateWatchBody {
  url: string;
  type: WatchType;
  sourceId: string;
  name?: string;
  /** Channels to notify. Defaults to the enabled default channels. */
  channelIds?: string[];
  /** Product info shown in the dialog preview, kept as the first reading of the watch. */
  snapshot?: ProductSnapshot;
}

const watchType = { type: 'string', enum: ['product', 'listing'] } as const;

const price = {
  type: 'object',
  required: ['amountCents', 'currency'],
  properties: { amountCents: { type: 'integer' }, currency: { type: 'string' } },
} as const;

const productSnapshot = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'UNKNOWN'] },
    title: { type: 'string', maxLength: 500 },
    price,
    regularPrice: price,
    imageUrl: { type: 'string', maxLength: 2048 },
    variant: { type: 'string', maxLength: 200 },
    signal: { type: 'string', maxLength: 500 },
  },
} as const;

const watchView = {
  type: 'object',
  required: ['id', 'type', 'url', 'name', 'sourceId', 'active', 'channelIds', 'intervalSeconds'],
  properties: {
    lastReading: {
      type: 'object',
      description: 'Last product read on the page, for display. Missing until a first reading.',
      required: ['snapshot', 'checkedAt'],
      properties: { snapshot: productSnapshot, checkedAt: { type: 'string', format: 'date-time' } },
    },
    id: { type: 'string' },
    type: watchType,
    url: { type: 'string' },
    name: { type: 'string' },
    sourceId: { type: 'string' },
    active: { type: 'boolean' },
    channelIds: { type: 'array', items: { type: 'string' } },
    intervalSeconds: {
      type: ['integer', 'null'],
      description: 'Check frequency of this watch. Null: follows the global default.',
    },
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

function toView(watch: Watch, reading?: ProductReading) {
  return {
    ...watch,
    url: watch.url.value,
    intervalSeconds: watch.interval?.seconds ?? null,
    ...(reading
      ? {
          lastReading: {
            snapshot: reading.snapshot,
            checkedAt: reading.checkedAt.toISOString(),
          },
        }
      : {}),
  };
}

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

/** Watches (SPEC §2): created from the home page, by pasting a link. */
export function registerWatchRoutes(
  app: FastifyInstance,
  {
    sources,
    watches,
    channels,
    newId = randomUUID,
    readings,
    checkProduct,
    now = () => new Date(),
  }: WatchRoutesOptions,
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
    async () => {
      const latest = (await readings?.list()) ?? new Map<string, ProductReading>();
      return (await watches.list()).map((watch) => toView(watch, latest.get(watch.id)));
    },
  );

  app.post<{ Body: CreateWatchBody }>(
    '/api/watches',
    {
      schema: {
        tags: ['watches'],
        summary: 'Start monitoring a URL',
        description:
          'Without channelIds, the enabled default channels are attached to the new watch.',
        body: {
          type: 'object',
          required: ['url', 'type', 'sourceId'],
          properties: {
            url: { type: 'string', minLength: 1, maxLength: 2048 },
            type: watchType,
            sourceId: { type: 'string', minLength: 1 },
            name: { type: 'string', maxLength: 200 },
            channelIds: {
              type: 'array',
              maxItems: 50,
              items: { type: 'string', minLength: 1 },
              description: 'Channels to notify. Omitted: the enabled default channels.',
            },
            snapshot: {
              ...productSnapshot,
              description: 'Product info read by the dialog preview, kept as the first reading.',
            },
          },
        },
        response: { 201: watchView, 400: errorView },
      },
    },
    async (request, reply) => {
      const { url, type, sourceId, name, channelIds, snapshot } = request.body;
      const plugin = sources.get(sourceId);
      if (!plugin) return reply.code(400).send({ error: `Unknown source plugin: ${sourceId}` });
      if (!plugin.supports.includes(type)) {
        return reply.code(400).send({ error: `${plugin.name} cannot watch a ${type}` });
      }
      const saved = channels ? await channels.list() : [];
      let selected: string[];
      if (channelIds === undefined) {
        selected = saved.filter((c) => c.enabled && c.isDefault).map((c) => c.id);
      } else {
        const unknown = unknownChannels(channelIds, saved);
        if (unknown) return reply.code(400).send({ error: unknown });
        selected = channelIds;
      }
      let watch: Watch;
      try {
        watch = createWatch({
          id: newId(),
          type,
          url,
          sourceId,
          channelIds: selected,
          ...(name === undefined ? {} : { name }),
        });
      } catch (err) {
        if (err instanceof DomainError) return reply.code(400).send({ error: err.message });
        throw err;
      }
      await watches.save(watch);
      let reading: ProductReading | undefined;
      if (snapshot && type === 'product' && readings) {
        reading = { snapshot, checkedAt: now() };
        await readings.save(watch.id, reading);
      }
      return reply.code(201).send(toView(watch, reading));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/watches/:id/refresh',
    {
      schema: {
        tags: ['watches'],
        summary: 'Read a product page now',
        description:
          'Updates the product info shown on the card. Display only: it never sends an alert ' +
          'nor changes the tracked stock state.',
        params: idParams,
        response: { 200: watchView, 400: errorView, 404: errorView, 502: errorView },
      },
    },
    async (request, reply) => {
      const watch = await watches.get(request.params.id);
      if (!watch) return reply.code(404).send({ error: 'Unknown watch' });
      if (watch.type !== 'product' || !checkProduct || !readings) {
        return reply.code(400).send({ error: 'Only a product watch can be refreshed' });
      }
      let snapshot: ProductSnapshot;
      try {
        snapshot = await checkProduct(watch);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const kind = err instanceof SourceError ? `[${err.kind}] ` : '';
        return reply.code(502).send({ error: `${kind}${message}` });
      }
      const reading = { snapshot, checkedAt: now() };
      await readings.save(watch.id, reading);
      return toView(watch, reading);
    },
  );

  app.patch<{ Params: { id: string }; Body: WatchChanges }>(
    '/api/watches/:id',
    {
      schema: {
        tags: ['watches'],
        summary: 'Edit a watch',
        description:
          'Changes the channels, pauses or resumes, or sets the check frequency. ' +
          'Fields left out stay as they are.',
        params: idParams,
        body: {
          type: 'object',
          minProperties: 1,
          properties: {
            name: { type: 'string', maxLength: 200 },
            active: { type: 'boolean', description: 'False pauses the watch.' },
            channelIds: {
              type: 'array',
              maxItems: 50,
              items: { type: 'string', minLength: 1 },
              description: 'Channels to notify. Empty: no alert.',
            },
            intervalSeconds: {
              type: ['integer', 'null'],
              minimum: WATCH_INTERVAL_LIMITS.min,
              maximum: WATCH_INTERVAL_LIMITS.max,
              description: 'Check frequency of this watch. Null: back to the global default.',
            },
          },
        },
        response: { 200: watchView, 400: errorView, 404: errorView },
      },
    },
    async (request, reply) => {
      const watch = await watches.get(request.params.id);
      if (!watch) return reply.code(404).send({ error: 'Unknown watch' });
      if (request.body.channelIds !== undefined) {
        const unknown = unknownChannels(
          request.body.channelIds,
          channels ? await channels.list() : [],
        );
        if (unknown) return reply.code(400).send({ error: unknown });
      }
      let updated: Watch;
      try {
        updated = updateWatch(watch, request.body);
      } catch (err) {
        if (err instanceof DomainError) return reply.code(400).send({ error: err.message });
        throw err;
      }
      await watches.save(updated);
      const latest = await readings?.list();
      return toView(updated, latest?.get(updated.id));
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/watches/:id',
    {
      schema: {
        tags: ['watches'],
        summary: 'Stop watching',
        params: idParams,
        response: { 204: { type: 'null' }, 404: errorView },
      },
    },
    async (request, reply) => {
      const watch = await watches.get(request.params.id);
      if (!watch) return reply.code(404).send({ error: 'Unknown watch' });
      await watches.delete(watch.id);
      return reply.code(204).send();
    },
  );
}

/** Error message when some ids are not saved channels, undefined when all are known. */
function unknownChannels(ids: readonly string[], saved: readonly { id: string }[]) {
  const known = new Set(saved.map((c) => c.id));
  const unknown = ids.filter((id) => !known.has(id));
  return unknown.length > 0 ? `Unknown channel: ${unknown.join(', ')}` : undefined;
}

const CHECK_TIMEOUT_MS = 30_000;

/** Reads a product watch's page with its source plugin, like a real check. */
export function productChecker(
  sources: Pick<SourceRegistry, 'get'>,
  fetch: Fetcher,
  logger: Logger,
  timeoutMs = CHECK_TIMEOUT_MS,
): (watch: Watch) => Promise<ProductSnapshot> {
  return async (watch) => {
    const plugin = sources.get(watch.sourceId);
    if (!plugin?.checkProduct) {
      throw new Error(`Source plugin "${watch.sourceId}" is not installed`);
    }
    const parsed = plugin.configSchema?.safeParse({});
    const signal = AbortSignal.timeout(timeoutMs);
    const check = plugin.checkProduct({
      url: watch.url.toURL(),
      config: parsed?.success ? parsed.data : {},
      fetch,
      html: htmlHelpers,
      logger,
      signal,
    });
    // A plugin that ignores the signal must still be cut off at the timeout.
    const timeout = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
    });
    return Promise.race([check, timeout]);
  };
}
