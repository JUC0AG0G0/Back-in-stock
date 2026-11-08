/** Types and calls of the update API (apps/server/src/http/update-routes.ts). */

export interface ReleaseSummary {
  version: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string;
  prerelease: boolean;
  breaking: boolean;
}

export interface UpdateJob {
  id: string | null;
  state: 'idle' | 'running' | 'succeeded' | 'failed' | 'rolled-back';
  step: 'pull' | 'backup' | 'recreate' | 'healthcheck' | 'rollback' | 'done' | null;
  fromVersion: string | null;
  targetVersion: string | null;
  message: string | null;
}

export interface UpdateStatus {
  enabled: boolean;
  /** disabled: turned off in Settings or by BIS_UPDATE_CHECK. not-a-release: edge or dev build. */
  disabledReason: 'disabled' | 'not-a-release' | null;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  breaking: boolean;
  releases: ReleaseSummary[];
  /** Date of the last check (ISO), null before the first one. */
  checkedAt: string | null;
  /** Last check failed: the previous result is kept. */
  error: string | null;
  /** The updater service answers: "Install" can update in one click. */
  oneClick: boolean;
  job: UpdateJob | null;
}

export class InstallRefused extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchUpdateStatus = async (): Promise<UpdateStatus> =>
  json<UpdateStatus>(await fetch('/api/update'));

export const fetchJob = async (): Promise<UpdateJob | null> =>
  (await json<{ job: UpdateJob | null }>(await fetch('/api/update/job'))).job;

export const fetchRunningVersion = async (): Promise<string> =>
  (await json<{ version: string }>(await fetch('/api/health', { cache: 'no-store' }))).version;

export async function installUpdate(version: string): Promise<UpdateJob> {
  const res = await fetch('/api/update/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  const body = (await res.json()) as { job?: UpdateJob; error?: string; message?: string };
  if (!res.ok || !body.job) {
    throw new InstallRefused(body.error ?? `http-${res.status}`, body.message ?? '');
  }
  return body.job;
}

/** Documentation site: French at the root, English under /en/. */
export function docsUrl(language: string, page: string): string {
  const prefix = language === 'fr' ? '' : 'en/';
  return `https://juc0ag0g0.github.io/Back-in-stock/${prefix}${page}`;
}
