import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface Database {
  db: Db;
  /** Cheap query for /api/health. */
  ping(): boolean;
  close(): void;
}

// Same relative layout in the repo and in the Docker image: apps/server/dist -> apps/server/drizzle.
const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

/**
 * Opens the SQLite file (":memory:" for tests) and applies pending migrations.
 * Migrations run at every start, so an image update upgrades the schema by itself.
 */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const sqlite = new BetterSqlite3(path);
  // WAL: readers do not block the writer. busy_timeout: wait instead of failing on a lock.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  return {
    db,
    ping: () => {
      try {
        return sqlite.prepare('select 1 as ok').get() !== undefined;
      } catch {
        return false;
      }
    },
    close: () => sqlite.close(),
  };
}
