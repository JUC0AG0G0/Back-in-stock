import {
  chownSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  buildCreateBody,
  type ContainerInspect,
  formatImageRef,
  type ImageInspect,
  imageVersion,
  planImageTag,
  setEnvValue,
} from './recreate.js';

/** What the job needs from Docker (DockerClient in production, a fake in tests). */
export interface Docker {
  json<T>(method: string, path: string, body?: unknown): Promise<T>;
  send(method: string, path: string, body?: unknown): Promise<void>;
  pull(repository: string, tag: string): Promise<void>;
}

export type JobState = 'idle' | 'running' | 'succeeded' | 'failed' | 'rolled-back';
export type JobStep = 'pull' | 'backup' | 'recreate' | 'healthcheck' | 'rollback' | 'done';

export interface JobStatus {
  id: string | null;
  state: JobState;
  step: JobStep | null;
  fromVersion: string | null;
  targetVersion: string | null;
  /** Database copy taken before the update, relative to /data. */
  backup: string | null;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export const IDLE: JobStatus = {
  id: null,
  state: 'idle',
  step: null,
  fromVersion: null,
  targetVersion: null,
  backup: null,
  message: null,
  startedAt: null,
  finishedAt: null,
};

/** Refused before anything changed: the UI then shows the manual commands. */
export class PreconditionError extends Error {
  constructor(
    readonly code: 'unsupported-tag' | 'pinned-without-env' | 'no-database' | 'not-found',
    message: string,
  ) {
    super(message);
  }
}

export interface UpdaterOptions {
  docker: Docker;
  /** The shared /data folder (same one as the app). */
  dataDir: string;
  /** The install's .env, when mounted (lets a pinned BIS_IMAGE_TAG move to the new version). */
  envFile: string | null;
  /** Finds the app container to update. */
  findTarget: () => Promise<string>;
  healthTimeoutMs?: number;
  pollMs?: number;
  stopTimeoutSec?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

const DATABASE = 'back-in-stock.db';
const STATUS_FILE = join('updater', 'status.json');

/**
 * Replaces the app container with a newer image (SPEC §7quater):
 * pull → stop → back up the database → re-create with the same settings → wait for the
 * healthcheck → remove the old container. Any failure after the stop rolls everything back.
 */
export class Updater {
  private current: JobStatus;
  private readonly o: Required<Omit<UpdaterOptions, 'envFile'>> & { envFile: string | null };

  constructor(options: UpdaterOptions) {
    this.o = {
      healthTimeoutMs: 180_000,
      pollMs: 2_000,
      stopTimeoutSec: 30,
      now: () => new Date(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (m) => console.log(m),
      ...options,
    };
    this.current = this.readStatus();
    // The updater itself restarted mid-update: say so instead of showing "running" forever.
    if (this.current.state === 'running') {
      this.save({ ...this.current, state: 'failed', message: 'The updater restarted mid-update.' });
    }
  }

  status(): JobStatus {
    return this.current;
  }

  /**
   * Checks the preconditions, then runs the update in the background.
   * Throws PreconditionError when nothing can be done safely.
   */
  async start(targetVersion: string): Promise<JobStatus> {
    if (this.current.state === 'running') return this.current;

    const targetId = await this.o.findTarget();
    const container = await this.o.docker.json<ContainerInspect>(
      'GET',
      `/containers/${targetId}/json`,
    );
    const plan = planImageTag(container.Config.Image, targetVersion);
    if (plan.kind === 'unsupported') throw new PreconditionError('unsupported-tag', plan.reason);
    if (plan.kind === 'pinned' && !this.envHasImageTag()) {
      throw new PreconditionError(
        'pinned-without-env',
        'The image is pinned to a version and the .env file is not mounted in the updater.',
      );
    }
    if (!existsSync(join(this.o.dataDir, DATABASE))) {
      throw new PreconditionError(
        'no-database',
        `No ${DATABASE} in the updater's /data: it must mount the same data folder as the app.`,
      );
    }

    const oldImage = await this.o.docker.json<ImageInspect>(
      'GET',
      `/images/${encodeURIComponent(container.Image ?? container.Config.Image)}/json`,
    );
    this.save({
      ...IDLE,
      id: `${this.o.now().getTime()}`,
      state: 'running',
      step: 'pull',
      fromVersion: imageVersion(oldImage),
      targetVersion,
      startedAt: this.o.now().toISOString(),
    });
    void this.run(container, oldImage, plan.image, plan.kind === 'pinned' ? plan.tag : null).catch(
      (err: unknown) => this.finish('failed', `Unexpected error: ${String(err)}`),
    );
    return this.current;
  }

  private async run(
    container: ContainerInspect,
    oldImage: ImageInspect,
    image: { repository: string; tag: string },
    pinnedTag: string | null,
  ): Promise<void> {
    const { docker } = this.o;
    const name = container.Name.replace(/^\//, '');
    const target = this.current.targetVersion ?? '';

    // 1. Pull first: the app keeps running while the image downloads.
    try {
      await docker.pull(image.repository, image.tag);
    } catch (err) {
      return this.finish('failed', `Download of ${formatImageRef(image)} failed: ${message(err)}`);
    }
    const newRef = formatImageRef(image);
    const newImage = await docker.json<ImageInspect>(
      'GET',
      `/images/${encodeURIComponent(newRef)}/json`,
    );
    const pulledVersion = imageVersion(newImage);
    if (pulledVersion !== target) {
      return this.finish(
        'failed',
        `${newRef} is version ${pulledVersion ?? 'unknown'}, not ${target}. ` +
          'The tag may not follow this version yet: try again later, or change the tag.',
      );
    }

    // 2. Stop the app cleanly (SQLite flushes its journal), then copy the database.
    this.step('backup');
    await docker.send('POST', `/containers/${container.Id}/stop?t=${this.o.stopTimeoutSec}`);
    let backup: string;
    try {
      backup = this.backupDatabase(this.current.fromVersion ?? 'unknown');
    } catch (err) {
      await docker.send('POST', `/containers/${container.Id}/start`).catch(() => undefined);
      return this.finish('failed', `Database backup failed: ${message(err)}`);
    }
    this.save({ ...this.current, backup });

    // 3. Keep the old container aside under another name, create the new one in its place.
    this.step('recreate');
    const oldName = `${name}-before-${this.current.id}`;
    let newId: string | null = null;
    try {
      await docker.send(
        'POST',
        `/containers/${container.Id}/rename?name=${encodeURIComponent(oldName)}`,
      );
      const created = await docker.json<{ Id: string }>(
        'POST',
        `/containers/create?name=${encodeURIComponent(name)}`,
        buildCreateBody(container, oldImage, newRef),
      );
      newId = created.Id;
      await docker.send('POST', `/containers/${newId}/start`);

      // 4. The new version applies its migrations on start, then must become healthy.
      this.step('healthcheck');
      const healthy = await this.waitHealthy(newId);
      if (healthy !== true) throw new Error(healthy);
    } catch (err) {
      return this.rollback(container.Id, name, newId, backup, message(err));
    }

    // 5. Success: drop the old container (its volumes are kept, they are in use) and
    // move a pinned BIS_IMAGE_TAG so that `docker compose up` keeps the new version.
    await docker.send('DELETE', `/containers/${container.Id}`).catch(() => undefined);
    if (pinnedTag && this.o.envFile) {
      const env = readFileSync(this.o.envFile, 'utf8');
      // Written in place: the file is bind-mounted, replacing it would break the mount.
      writeFileSync(this.o.envFile, setEnvValue(env, 'BIS_IMAGE_TAG', pinnedTag));
    }
    this.finish('succeeded', null);
  }

  private async rollback(
    oldId: string,
    name: string,
    newId: string | null,
    backup: string,
    reason: string,
  ): Promise<void> {
    this.o.log(`update failed, rolling back: ${reason}`);
    this.step('rollback');
    const { docker } = this.o;
    try {
      if (newId) await docker.send('DELETE', `/containers/${newId}?force=true`);
      this.restoreDatabase(backup);
      await docker.send('POST', `/containers/${oldId}/rename?name=${encodeURIComponent(name)}`);
      await docker.send('POST', `/containers/${oldId}/start`);
      this.finish('rolled-back', reason);
    } catch (err) {
      this.finish(
        'failed',
        `${reason}. Rollback failed too: ${message(err)}. Database backup: ${backup}`,
      );
    }
  }

  private async waitHealthy(id: string): Promise<true | string> {
    const deadline = this.o.now().getTime() + this.o.healthTimeoutMs;
    while (this.o.now().getTime() < deadline) {
      const c = await this.o.docker.json<ContainerInspect>('GET', `/containers/${id}/json`);
      if (!c.State?.Running) return `The new version stopped (${c.State?.Status ?? 'unknown'}).`;
      const health = c.State.Health?.Status;
      if (health === 'healthy' || health === undefined) return true; // no healthcheck: running is enough
      if (health === 'unhealthy') return 'The new version is unhealthy.';
      await this.o.sleep(this.o.pollMs);
    }
    return `The new version was not healthy after ${this.o.healthTimeoutMs / 1000}s.`;
  }

  private backupDatabase(fromVersion: string): string {
    const dir = join(this.o.dataDir, 'backups');
    mkdirSync(dir, { recursive: true });
    const date = this.o.now().toISOString().replace(/[:.]/g, '-');
    const file = join('backups', `db-${fromVersion}-${date}.sqlite`);
    copyFileSync(join(this.o.dataDir, DATABASE), join(this.o.dataDir, file));
    for (const suffix of ['-wal', '-shm']) {
      const journal = join(this.o.dataDir, DATABASE + suffix);
      if (existsSync(journal)) copyFileSync(journal, join(this.o.dataDir, file + suffix));
    }
    return file;
  }

  private restoreDatabase(backup: string): void {
    const db = join(this.o.dataDir, DATABASE);
    // The updater runs as root, the app does not: restored files keep the app's owner.
    const { uid, gid } = statSync(db);
    copyFileSync(join(this.o.dataDir, backup), db);
    for (const suffix of ['-wal', '-shm']) {
      const saved = join(this.o.dataDir, backup + suffix);
      if (existsSync(saved)) {
        copyFileSync(saved, db + suffix);
        chownSync(db + suffix, uid, gid);
      } else rmSync(db + suffix, { force: true });
    }
  }

  private envHasImageTag(): boolean {
    if (!this.o.envFile || !existsSync(this.o.envFile)) return false;
    return /^\s*BIS_IMAGE_TAG\s*=/m.test(readFileSync(this.o.envFile, 'utf8'));
  }

  private step(step: JobStep): void {
    this.save({ ...this.current, step });
  }

  private finish(state: JobState, msg: string | null): void {
    this.save({
      ...this.current,
      state,
      step: 'done',
      message: msg,
      finishedAt: this.o.now().toISOString(),
    });
  }

  /** The status is kept in /data so the app and a restarted updater can read it. */
  private save(status: JobStatus): void {
    this.current = status;
    try {
      mkdirSync(join(this.o.dataDir, 'updater'), { recursive: true });
      writeFileSync(join(this.o.dataDir, STATUS_FILE), JSON.stringify(status, null, 2));
    } catch (err) {
      this.o.log(`cannot save the update status: ${message(err)}`);
    }
  }

  private readStatus(): JobStatus {
    try {
      return { ...IDLE, ...JSON.parse(readFileSync(join(this.o.dataDir, STATUS_FILE), 'utf8')) };
    } catch {
      return IDLE;
    }
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
