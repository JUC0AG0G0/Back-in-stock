import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: string;
  /** Folder holding the built web UI (index.html + assets). */
  webDir: string;
  /** SQLite file, inside BIS_DATA_DIR (/data in Docker, ./data in development). */
  databasePath: string;
  /** Swagger UI at /api/docs: on in development, always off in production (NODE_ENV=production). */
  apiDocs: boolean;
}

// Same relative layout in the repo and in the Docker image: apps/server/dist -> apps/web/dist.
const defaultWebDir = fileURLToPath(new URL('../../web/dist', import.meta.url));

/** Reads the server settings from environment variables, with safe defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    logLevel: env.LOG_LEVEL ?? 'info',
    webDir: env.BIS_WEB_DIR ?? defaultWebDir,
    databasePath: join(resolve(env.BIS_DATA_DIR ?? 'data'), 'back-in-stock.db'),
    apiDocs: env.NODE_ENV !== 'production',
  };
}
