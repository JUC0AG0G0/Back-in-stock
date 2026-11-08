import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeSettings } from '../application/runtime-settings.js';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup() {
  const rows = new Map<string, unknown>();
  const settings = new RuntimeSettings(
    {
      getValue: async (key) => rows.get(key),
      setValue: async (key, value) =>
        void (value === null ? rows.delete(key) : rows.set(key, value)),
    },
    { updateCheck: true, updateIntervalHours: 6, updateChannel: 'stable', apiDocs: false },
  );
  app = await buildApp({
    version: '1.2.3',
    apiDocs: () => settings.get('apiDocs'),
    settings: { settings, updateCheckSupported: true },
  });
  return app;
}

describe('settings API', () => {
  it('lists the settings with their defaults and limits', async () => {
    const a = await setup();
    const res = await a.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      values: {
        updateCheck: { value: true, default: true, overridden: false },
        updateIntervalHours: { value: 6, default: 6, overridden: false },
        updateChannel: { value: 'stable', default: 'stable', overridden: false },
        apiDocs: { value: false, default: false, overridden: false },
      },
      updateIntervalHours: { min: 1, max: 168 },
      updateCheckSupported: true,
      apiDocs: { available: true, path: '/api/docs' },
    });
  });

  it('turns the API docs on without a restart, and back to the default', async () => {
    const a = await setup();
    expect((await a.inject({ method: 'GET', url: '/api/docs/json' })).statusCode).toBe(404);

    const on = await a.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { apiDocs: true },
    });
    expect(on.json().values.apiDocs).toEqual({ value: true, default: false, overridden: true });
    expect((await a.inject({ method: 'GET', url: '/api/docs/json' })).statusCode).toBe(200);

    await a.inject({ method: 'PATCH', url: '/api/settings', payload: { apiDocs: null } });
    expect((await a.inject({ method: 'GET', url: '/api/docs/json' })).statusCode).toBe(404);
  });

  it('saves the update interval and rejects one out of bounds', async () => {
    const a = await setup();
    const ok = await a.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { updateIntervalHours: 24, updateChannel: 'prerelease' },
    });
    expect(ok.json().values.updateIntervalHours.value).toBe(24);
    expect(ok.json().values.updateChannel.value).toBe('prerelease');

    for (const updateIntervalHours of [0, 169, 1.5]) {
      const bad = await a.inject({
        method: 'PATCH',
        url: '/api/settings',
        payload: { updateIntervalHours },
      });
      expect(bad.statusCode).toBe(400);
    }
    // Fastify drops unknown properties (removeAdditional): they change nothing.
    const unknown = await a.inject({ method: 'PATCH', url: '/api/settings', payload: { foo: 1 } });
    expect(unknown.json().values.updateIntervalHours.value).toBe(24);
  });
});
