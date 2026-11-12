import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Fetcher, Logger } from '@back-in-stock/plugin-sdk';
import type { ChannelRepository, WatchRepository } from '../application/ports.js';
import { fallbackLocale } from '@back-in-stock/i18n';
import { testNotifier } from '../application/test-notifier.js';
import { PluginTester } from '../application/test-plugins.js';
import { htmlHelpers } from '../infrastructure/html/html-helpers.js';
import { pluginLogger } from '../infrastructure/plugin-logger.js';
import type { NotifierRegistry, SourceRegistry } from '../infrastructure/plugins/registry.js';
import { registerApiDocs } from './api-docs.js';
import { registerChannelRoutes } from './channels.js';
import { registerPluginTestRoutes } from './plugin-tests.js';
import { registerSettingsRoutes, type SettingsRoutesOptions } from './settings-routes.js';
import { healthSchema, pluginsSchema } from './schemas.js';
import { registerUpdateRoutes, type UpdateRoutesOptions } from './update-routes.js';
import { registerWatchRoutes } from './watch-routes.js';

export interface AppOptions {
  version: string;
  /** Built web UI to serve. Skipped when missing, e.g. while the UI runs on the Vite dev server. */
  webDir?: string;
  logger?: FastifyServerOptions['logger'];
  plugins?: { sources: SourceRegistry; notifiers: NotifierRegistry };
  /** Returns false when the database cannot answer: /api/health then fails. */
  databasePing?: () => boolean;
  /**
   * Serves the Swagger UI at /api/docs. A function is read on every request,
   * so the Settings screen can turn it on or off at runtime.
   */
  apiDocs?: boolean | (() => boolean);
  /** New version banner and one-click install. */
  updates?: UpdateRoutesOptions;
  /** Settings screen (/api/settings). */
  settings?: SettingsRoutesOptions;
  /** Enables the channel routes (/api/channels, /api/notifiers). Needs `plugins`. */
  channels?: { repository: ChannelRepository; fetch: Fetcher; logger?: Logger };
  /**
   * Enables the watch routes (/api/watches, /api/sources/match). Needs `plugins`.
   * Default channels come from `channels.repository` when set.
   */
  watches?: { repository: WatchRepository; newId?: () => string };
  /** Enables the plugin test routes (/api/plugins/.../test). Needs `plugins`. */
  pluginTests?: {
    fetch: Fetcher;
    /** Saved channels, tested for each notifier. */
    channels?: Pick<ChannelRepository, 'list'>;
    logger?: Logger;
    timeoutMs?: number;
  };
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
  updates,
  settings,
  channels,
  watches,
  pluginTests,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  const apiDocsAvailable =
    apiDocs !== false &&
    (await registerApiDocs(app, version, typeof apiDocs === 'function' ? apiDocs : () => true));

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

  if (updates) registerUpdateRoutes(app, updates);
  if (settings) registerSettingsRoutes(app, settings, apiDocsAvailable);
  if (plugins && channels) {
    await registerChannelRoutes(app, {
      notifiers: plugins.notifiers,
      channels: channels.repository,
      fetch: channels.fetch,
      logger: channels.logger ?? pluginLogger(app.log, { component: 'notifier' }),
    });
  }
  if (plugins && watches) {
    registerWatchRoutes(app, {
      sources: plugins.sources,
      watches: watches.repository,
      ...(channels ? { channels: channels.repository } : {}),
      ...(watches.newId ? { newId: watches.newId } : {}),
    });
  }
  if (plugins && pluginTests) {
    const tester = new PluginTester({
      ...plugins,
      ...pluginTests,
      html: htmlHelpers,
      logger: pluginTests.logger ?? pluginLogger(app.log, { component: 'plugin-test' }),
      testNotifier: (plugin, config, { locale = fallbackLocale, ...deps }, content) =>
        testNotifier(plugin, config, { ...deps, locale }, content),
    });
    registerPluginTestRoutes(app, tester);
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
