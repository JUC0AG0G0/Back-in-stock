import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPDATE_INTERVAL_LIMITS } from './application/runtime-settings.js';
import type { BuildChannel, UpdateChannel } from './application/update-checker.js';

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: string;
  /** Folder holding the built web UI (index.html + assets). */
  webDir: string;
  /** SQLite file, inside BIS_DATA_DIR (/data in Docker, ./data in development). */
  databasePath: string;
  /**
   * BIS_API_DOCS: Swagger UI at /api/docs. Default: on in development, off in production
   * (NODE_ENV=production). It is only the default: Settings can turn it on or off at runtime.
   */
  apiDocs: boolean;
  /** BIS_DATA_DIR: database, updater token, backups. */
  dataDir: string;
  updates: {
    /** BIS_UPDATE_CHECK=false turns off the only outgoing request to GitHub. */
    check: boolean;
    /** BIS_UPDATE_CHANNEL: stable (default) or prerelease. */
    channel: UpdateChannel;
    /** BIS_UPDATE_INTERVAL: hours between two checks, 6 by default. */
    intervalHours: number;
    /** BIS_BUILD_CHANNEL, baked into the image by the publish workflow. Absent: dev. */
    buildChannel: BuildChannel;
    /** BIS_UPDATER_URL, e.g. http://updater:8090. Absent: no one-click install. */
    updaterUrl: string | null;
    /** owner/name of the GitHub repository whose releases are checked. */
    repository: string;
  };
}

const isFalse = (value: string | undefined) => /^(false|0|no|off)$/i.test(value ?? '');
const isTrue = (value: string | undefined) => /^(true|1|yes|on)$/i.test(value ?? '');

// Same relative layout in the repo and in the Docker image: apps/server/dist -> apps/web/dist.
const defaultWebDir = fileURLToPath(new URL('../../web/dist', import.meta.url));

/** Reads the server settings from environment variables, with safe defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const dataDir = resolve(env.BIS_DATA_DIR ?? 'data');
  const channel = env.BIS_UPDATE_CHANNEL ?? 'stable';
  if (channel !== 'stable' && channel !== 'prerelease') {
    throw new Error(`Invalid BIS_UPDATE_CHANNEL: ${channel} (stable or prerelease)`);
  }
  const buildChannel = env.BIS_BUILD_CHANNEL;
  const intervalHours = Number(env.BIS_UPDATE_INTERVAL ?? 6);
  if (
    !Number.isInteger(intervalHours) ||
    intervalHours < UPDATE_INTERVAL_LIMITS.min ||
    intervalHours > UPDATE_INTERVAL_LIMITS.max
  ) {
    throw new Error(
      `Invalid BIS_UPDATE_INTERVAL: ${env.BIS_UPDATE_INTERVAL} (hours, ${UPDATE_INTERVAL_LIMITS.min} to ${UPDATE_INTERVAL_LIMITS.max})`,
    );
  }
  const apiDocsDefault = env.NODE_ENV !== 'production';
  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    logLevel: env.LOG_LEVEL ?? 'info',
    webDir: env.BIS_WEB_DIR ?? defaultWebDir,
    databasePath: join(dataDir, 'back-in-stock.db'),
    apiDocs: isTrue(env.BIS_API_DOCS) ? true : isFalse(env.BIS_API_DOCS) ? false : apiDocsDefault,
    dataDir,
    updates: {
      check: !isFalse(env.BIS_UPDATE_CHECK),
      channel,
      intervalHours,
      buildChannel: buildChannel === 'release' || buildChannel === 'edge' ? buildChannel : 'dev',
      updaterUrl: env.BIS_UPDATER_URL || null,
      repository: env.BIS_UPDATE_REPOSITORY ?? 'JUC0AG0G0/Back-in-stock',
    },
  };
}
