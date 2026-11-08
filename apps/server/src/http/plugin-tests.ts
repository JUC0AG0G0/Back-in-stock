import { toLocale } from '@back-in-stock/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  InvalidTestInputError,
  UnknownPluginError,
  type PluginKind,
  type NotifierTestInput,
  type PluginTester,
  type SourceTestInput,
} from '../application/test-plugins.js';
import {
  testAllPluginsSchema,
  testNotifierPluginSchema,
  testSourcePluginSchema,
} from './plugin-tests.schemas.js';

/** Routes of the Plugins screen's "Test" buttons. Nothing they do is saved. */
export function registerPluginTestRoutes(app: FastifyInstance, tester: PluginTester): void {
  app.post<{ Body: { kind?: PluginKind } | undefined }>(
    '/api/plugins/test',
    { schema: testAllPluginsSchema },
    async (request) => ({ results: await tester.testAll(request.body?.kind) }),
  );

  app.post<{ Params: { id: string }; Body: SourceTestInput | undefined }>(
    '/api/plugins/sources/:id/test',
    { schema: testSourcePluginSchema },
    async (request, reply) => {
      try {
        return { results: await tester.testSource(request.params.id, request.body ?? {}) };
      } catch (err) {
        return sendKnownError(reply, err);
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: (Omit<NotifierTestInput, 'locale'> & { locale?: string }) | undefined;
  }>(
    '/api/plugins/notifiers/:id/test',
    { schema: testNotifierPluginSchema },
    async (request, reply) => {
      try {
        const { locale, ...input } = request.body ?? {};
        return {
          results: await tester.testNotifier(request.params.id, {
            ...input,
            ...(locale ? { locale: toLocale(locale) } : {}),
          }),
        };
      } catch (err) {
        return sendKnownError(reply, err);
      }
    },
  );
}

function sendKnownError(reply: FastifyReply, err: unknown) {
  if (err instanceof UnknownPluginError) return reply.code(404).send({ error: err.message });
  if (err instanceof InvalidTestInputError) return reply.code(400).send({ error: err.message });
  throw err;
}
