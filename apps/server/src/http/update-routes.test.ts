import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateChecker } from '../application/update-checker.js';
import type { UpdateJob, UpdaterClient } from '../infrastructure/updates/updater-client.js';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const job: UpdateJob = {
  id: '1',
  state: 'running',
  step: 'pull',
  fromVersion: '1.2.0',
  targetVersion: '1.3.0',
  backup: null,
  message: null,
  startedAt: '2026-11-08T10:00:00.000Z',
  finishedAt: null,
};

async function setup(updater: Partial<UpdaterClient> | null) {
  const checker = new UpdateChecker({
    currentVersion: '1.2.0',
    buildChannel: 'release',
    channel: 'stable',
    enabled: true,
    feed: {
      fetch: async () => ({
        notModified: false,
        etag: null,
        releases: [
          {
            tag: 'v1.3.0',
            name: 'v1.3.0',
            body: '### ✨ Nouveautés\n\n* telegram',
            url: 'https://github.com/x/y/releases/tag/v1.3.0',
            publishedAt: '2026-11-08T00:00:00Z',
            prerelease: false,
            draft: false,
          },
        ],
      }),
    },
  });
  await checker.check();
  app = await buildApp({
    version: '1.2.0',
    updates: {
      checker,
      updater: updater as UpdaterClient | null,
      readLastJob: () => null,
    },
  });
  return app;
}

describe('update API', () => {
  it('reports the available version and its changelog', async () => {
    const a = await setup(null);
    const res = await a.inject({ method: 'GET', url: '/api/update' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      enabled: true,
      currentVersion: '1.2.0',
      latestVersion: '1.3.0',
      updateAvailable: true,
      oneClick: false,
      job: null,
      releases: [{ version: '1.3.0', notes: '### ✨ Nouveautés\n\n* telegram' }],
    });
  });

  it('starts the update through the updater', async () => {
    const start = vi.fn(async () => ({ ok: true as const, job }));
    const a = await setup({ available: async () => true, job: async () => null, start });

    const res = await a.inject({
      method: 'POST',
      url: '/api/update/install',
      payload: { version: '1.3.0' },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ job });
    expect(start).toHaveBeenCalledWith('1.3.0');
  });

  it('only installs an announced newer version', async () => {
    const start = vi.fn();
    const a = await setup({ available: async () => true, job: async () => null, start });

    const res = await a.inject({
      method: 'POST',
      url: '/api/update/install',
      payload: { version: '1.0.0' },
    });

    expect(res.statusCode).toBe(400);
    expect(start).not.toHaveBeenCalled();
  });

  it('answers 409 without an updater, so the UI shows the manual commands', async () => {
    const a = await setup(null);
    const res = await a.inject({
      method: 'POST',
      url: '/api/update/install',
      payload: { version: '1.3.0' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'no-updater' });
  });

  it('passes on a refusal of the updater', async () => {
    const a = await setup({
      available: async () => true,
      job: async () => null,
      start: async () => ({ ok: false as const, code: 'pinned-without-env', message: 'pinned' }),
    });
    const res = await a.inject({
      method: 'POST',
      url: '/api/update/install',
      payload: { version: '1.3.0' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'pinned-without-env', message: 'pinned' });
  });
});
