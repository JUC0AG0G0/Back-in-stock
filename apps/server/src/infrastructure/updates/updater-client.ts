import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Progress of an update, as reported by the updater service (apps/updater). */
export interface UpdateJob {
  id: string | null;
  state: 'idle' | 'running' | 'succeeded' | 'failed' | 'rolled-back';
  step: 'pull' | 'backup' | 'recreate' | 'healthcheck' | 'rollback' | 'done' | null;
  fromVersion: string | null;
  targetVersion: string | null;
  backup: string | null;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export type StartResult =
  | { ok: true; job: UpdateJob }
  /** The updater refused before changing anything (pinned version, wrong data folder...). */
  | { ok: false; code: string; message: string };

/**
 * Shared secret between the app and the updater, created on first start in /data
 * (readable by the owner only). The updater reads it from the same volume.
 */
export function ensureUpdaterToken(dataDir: string): string {
  const file = join(dataDir, 'updater.token');
  if (existsSync(file)) {
    const token = readFileSync(file, 'utf8').trim();
    if (token) return token;
  }
  const token = randomBytes(32).toString('hex');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}

/** Calls the optional updater service on the internal Docker network. */
export class UpdaterClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  private async call(path: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<Response> {
    return this.doFetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  /** True when the updater answers: the UI then offers the one-click install. */
  async available(): Promise<boolean> {
    try {
      return (await this.call('/health', {}, 2_000)).ok;
    } catch {
      return false;
    }
  }

  async job(): Promise<UpdateJob | null> {
    try {
      const res = await this.call('/status');
      return res.ok ? ((await res.json()) as UpdateJob) : null;
    } catch {
      return null;
    }
  }

  async start(version: string): Promise<StartResult> {
    const res = await this.call(
      '/update',
      { method: 'POST', body: JSON.stringify({ version }) },
      30_000,
    );
    const body = (await res.json()) as UpdateJob & { error?: string; message?: string };
    if (res.ok) return { ok: true, job: body };
    return {
      ok: false,
      code: body.error ?? `http-${res.status}`,
      message: body.message ?? `Updater answered ${res.status}`,
    };
  }
}

/** Last update result, written by the updater in /data: readable even if the updater is gone. */
export function readLastJob(dataDir: string): UpdateJob | null {
  try {
    return JSON.parse(readFileSync(join(dataDir, 'updater', 'status.json'), 'utf8')) as UpdateJob;
  } catch {
    return null;
  }
}
