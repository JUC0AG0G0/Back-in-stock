import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Docker, type JobStatus, PreconditionError, Updater } from './job.js';
import type { ContainerInspect, ImageInspect } from './recreate.js';

const REPO = 'ghcr.io/juc0ag0g0/back-in-stock';

/** In-memory Docker: one app container, images by reference. */
class FakeDocker implements Docker {
  calls: string[] = [];
  images: Record<string, string> = { [`${REPO}:latest`]: '1.4.0', [`${REPO}:1.4.0`]: '1.4.0' };
  containers: Record<string, { name: string; image: string; running: boolean }> = {
    old: { name: 'bis-app-1', image: `${REPO}:latest`, running: true },
  };
  /** Registry content: what a pull of each tag gives. */
  registry: Record<string, string> = { latest: '1.5.0', '1.5.0': '1.5.0' };
  newHealth = 'healthy';
  onStartNew: () => void = () => undefined;

  async pull(repository: string, tag: string): Promise<void> {
    this.calls.push(`pull ${tag}`);
    const version = this.registry[tag];
    if (!version) throw new Error('manifest unknown');
    this.images[`${repository}:${tag}`] = version;
  }

  async send(method: string, path: string): Promise<void> {
    this.calls.push(`${method} ${path}`);
    const [, id, action] = /^\/containers\/([^/?]+)(?:\/(\w+))?/.exec(path) ?? [];
    const c = id ? this.containers[id] : undefined;
    if (!id || !c) throw new Error(`no container ${id}`);
    if (method === 'DELETE') delete this.containers[id];
    else if (action === 'stop') c.running = false;
    else if (action === 'start') {
      c.running = true;
      if (id === 'new') this.onStartNew();
    } else if (action === 'rename') c.name = new URL(`http://x${path}`).searchParams.get('name')!;
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (method === 'POST' && path.startsWith('/containers/create')) {
      this.calls.push(`create ${(body as { Image: string }).Image}`);
      const name = new URL(`http://x${path}`).searchParams.get('name')!;
      this.containers.new = { name, image: (body as { Image: string }).Image, running: false };
      return { Id: 'new' } as T;
    }
    const image = /^\/images\/(.+)\/json$/.exec(path);
    if (image) {
      const ref = decodeURIComponent(image[1]!);
      return {
        Id: ref,
        Config: { Env: [`BIS_VERSION=${this.images[ref]}`] },
      } satisfies ImageInspect as T;
    }
    const container = /^\/containers\/([^/]+)\/json$/.exec(path);
    const c = container ? this.containers[container[1]!] : undefined;
    if (!container || !c) throw new Error(`unexpected ${method} ${path}`);
    return {
      Id: container[1]!,
      Name: `/${c.name}`,
      Image: c.image,
      Config: { Image: c.image, Env: [`BIS_VERSION=${this.images[c.image]}`, 'TZ=Europe/Paris'] },
      HostConfig: { Binds: ['/srv/data:/data'] },
      NetworkSettings: { Networks: {} },
      State: {
        Running: c.running,
        Status: c.running ? 'running' : 'exited',
        Health: { Status: container[1] === 'new' ? this.newHealth : 'healthy' },
      },
    } satisfies ContainerInspect as T;
  }
}

let dataDir: string;
let docker: FakeDocker;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'bis-updater-'));
  writeFileSync(join(dataDir, 'back-in-stock.db'), 'v1.4 data');
  docker = new FakeDocker();
});

afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

const makeUpdater = (envFile: string | null = null) =>
  new Updater({
    docker,
    dataDir,
    envFile,
    findTarget: async () => 'old',
    pollMs: 1,
    healthTimeoutMs: 50,
    sleep: async () => undefined,
    now: () => new Date('2026-11-08T10:00:00Z'),
    log: () => undefined,
  });

async function runToEnd(updater: Updater, version: string): Promise<JobStatus> {
  await updater.start(version);
  for (let i = 0; i < 100 && updater.status().state === 'running'; i++) {
    await new Promise((r) => setTimeout(r, 1));
  }
  return updater.status();
}

describe('Updater', () => {
  it('replaces the container and keeps a database backup', async () => {
    const status = await runToEnd(makeUpdater(), '1.5.0');

    expect(status).toMatchObject({
      state: 'succeeded',
      fromVersion: '1.4.0',
      targetVersion: '1.5.0',
      backup: 'backups/db-1.4.0-2026-11-08T10-00-00-000Z.sqlite',
    });
    expect(readFileSync(join(dataDir, status.backup!), 'utf8')).toBe('v1.4 data');
    expect(docker.containers).toEqual({
      new: { name: 'bis-app-1', image: `${REPO}:latest`, running: true },
    });
    // The download happens while the app still runs.
    expect(docker.calls.indexOf('pull latest')).toBeLessThan(
      docker.calls.indexOf('POST /containers/old/stop?t=30'),
    );
    // Readable by the app after a restart.
    expect(JSON.parse(readFileSync(join(dataDir, 'updater/status.json'), 'utf8')).state).toBe(
      'succeeded',
    );
  });

  it('rolls back to the old container and database when the new one is unhealthy', async () => {
    docker.newHealth = 'unhealthy';
    // The new version migrates the database before failing.
    docker.onStartNew = () => writeFileSync(join(dataDir, 'back-in-stock.db'), 'v1.5 migrated');
    const status = await runToEnd(makeUpdater(), '1.5.0');

    expect(status).toMatchObject({
      state: 'rolled-back',
      message: 'The new version is unhealthy.',
    });
    expect(docker.containers).toEqual({
      old: { name: 'bis-app-1', image: `${REPO}:latest`, running: true },
    });
    expect(readFileSync(join(dataDir, 'back-in-stock.db'), 'utf8')).toBe('v1.4 data');
  });

  it('stops before touching anything when the tag is not the new version yet', async () => {
    docker.registry.latest = '1.4.0';
    const status = await runToEnd(makeUpdater(), '1.5.0');

    expect(status.state).toBe('failed');
    expect(status.message).toContain('not 1.5.0');
    expect(docker.containers.old?.running).toBe(true);
    expect(docker.calls.some((c) => c.includes('/stop'))).toBe(false);
  });

  it('moves a pinned BIS_IMAGE_TAG in .env and keeps the other lines', async () => {
    docker.containers.old!.image = `${REPO}:1.4.0`;
    const envFile = join(dataDir, '.env');
    writeFileSync(envFile, 'BIS_PORT=8080\nBIS_IMAGE_TAG=1.4.0\nBIS_TZ=Europe/Paris\n');

    const status = await runToEnd(makeUpdater(envFile), '1.5.0');

    expect(status.state).toBe('succeeded');
    expect(docker.calls).toContain(`create ${REPO}:1.5.0`);
    expect(readFileSync(envFile, 'utf8')).toBe(
      'BIS_PORT=8080\nBIS_IMAGE_TAG=1.5.0\nBIS_TZ=Europe/Paris\n',
    );
  });

  it('refuses a pinned version when it cannot update .env', async () => {
    docker.containers.old!.image = `${REPO}:1.4.0`;
    await expect(makeUpdater().start('1.5.0')).rejects.toMatchObject({
      code: 'pinned-without-env',
    });
  });

  it('refuses when it does not see the database', async () => {
    rmSync(join(dataDir, 'back-in-stock.db'));
    await expect(makeUpdater().start('1.5.0')).rejects.toBeInstanceOf(PreconditionError);
  });
});
