import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineSourcePlugin } from '@back-in-stock/plugin-sdk';
import { NotifierRegistry, SourceRegistry } from '../infrastructure/plugins/registry.js';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/health', () => {
  it('answers ok with the app version', async () => {
    app = await buildApp({ version: '1.2.3' });

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: '1.2.3' });
  });
});

describe('web UI', () => {
  let webDir: string;

  beforeAll(() => {
    webDir = mkdtempSync(join(tmpdir(), 'bis-web-'));
    writeFileSync(join(webDir, 'index.html'), '<div id="root"></div>');
    writeFileSync(join(webDir, 'app.js'), 'console.log(1)');
  });

  afterAll(() => {
    rmSync(webDir, { recursive: true, force: true });
  });

  it('serves static files', async () => {
    app = await buildApp({ version: '1.2.3', webDir });

    const res = await app.inject({ method: 'GET', url: '/app.js' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('console.log(1)');
  });

  it('falls back to index.html for client-side routes', async () => {
    app = await buildApp({ version: '1.2.3', webDir });

    const res = await app.inject({ method: 'GET', url: '/watches/42' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<div id="root">');
  });

  it('keeps a JSON 404 for unknown API routes', async () => {
    app = await buildApp({ version: '1.2.3', webDir });

    const res = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Not Found' });
  });

  it('runs without a built UI', async () => {
    app = await buildApp({ version: '1.2.3', webDir: join(webDir, 'missing') });

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/plugins', () => {
  it('lists registered and rejected plugins', async () => {
    const sources = new SourceRegistry();
    sources.register(
      defineSourcePlugin({
        id: 'fanatec',
        name: 'Fanatec',
        version: '1.0.0',
        supports: ['listing'],
        match: () => 1,
        checkListing: async () => ({ items: [], complete: true }),
      }),
    );
    sources.register({ id: 'broken' }, '/data/plugins/broken');
    app = await buildApp({
      version: '1.2.3',
      plugins: { sources, notifiers: new NotifierRegistry() },
    });

    const res = await app.inject({ method: 'GET', url: '/api/plugins' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sources: [{ id: 'fanatec', name: 'Fanatec', version: '1.0.0', supports: ['listing'] }],
      notifiers: [],
      rejected: [expect.objectContaining({ origin: '/data/plugins/broken', id: 'broken' })],
    });
  });
});
