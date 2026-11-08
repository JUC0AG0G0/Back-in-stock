import type { FastifyInstance } from 'fastify';
import type { UpdateChecker } from '../application/update-checker.js';
import type { UpdateJob, UpdaterClient } from '../infrastructure/updates/updater-client.js';
import { installUpdateSchema, updateJobSchema, updateStatusSchema } from './schemas.js';

export interface UpdateRoutesOptions {
  checker: UpdateChecker;
  /** Null when no updater is configured (BIS_UPDATER_URL unset). */
  updater: UpdaterClient | null;
  /** Last result written by the updater in /data, used when the updater does not answer. */
  readLastJob: () => UpdateJob | null;
  /** Called after a manual check, e.g. to count the next automatic one from now. */
  onChecked?: () => void;
}

/** New version banner and one-click install (SPEC §7quater). */
export function registerUpdateRoutes(
  app: FastifyInstance,
  { checker, updater, readLastJob, onChecked }: UpdateRoutesOptions,
): void {
  const job = async (): Promise<UpdateJob | null> => (await updater?.job()) ?? readLastJob();

  const fullStatus = async () => ({
    ...checker.status(),
    oneClick: updater ? await updater.available() : false,
    job: await job(),
  });

  app.get('/api/update', { schema: updateStatusSchema }, fullStatus);

  // "Check now" button (Settings): asks GitHub right away instead of waiting for the next tick.
  app.post('/api/update/check', { schema: updateStatusSchema }, async () => {
    await checker.check();
    onChecked?.();
    return fullStatus();
  });

  app.get('/api/update/job', { schema: updateJobSchema }, async () => ({ job: await job() }));

  app.post<{ Body: { version: string } }>(
    '/api/update/install',
    { schema: installUpdateSchema },
    async (request, reply) => {
      const { version } = request.body;
      // Only a version GitHub announced as newer than ours: the API cannot be used to
      // downgrade, or to install an arbitrary tag.
      if (!checker.status().releases.some((r) => r.version === version)) {
        return reply.code(400).send({
          error: 'unknown-version',
          message: `${version} is not an available update`,
        });
      }
      if (!updater || !(await updater.available())) {
        return reply
          .code(409)
          .send({ error: 'no-updater', message: 'The updater service is not installed' });
      }
      const result = await updater.start(version);
      if (!result.ok) return reply.code(409).send({ error: result.code, message: result.message });
      return reply.code(202).send({ job: result.job });
    },
  );
}
