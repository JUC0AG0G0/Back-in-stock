import { loadConfig } from './config.js';
import { buildApp } from './http/app.js';
import { openDatabase } from './infrastructure/db/database.js';
import { NotifierRegistry, SourceRegistry } from './infrastructure/plugins/registry.js';
import { readVersion } from './version.js';

// Composition root: this is the only place that wires concrete dependencies together.
const config = loadConfig();
// Opening the database also applies pending migrations.
const database = openDatabase(config.databasePath);
// Built-in plugins (plugins/*) and external ones (npm, /data/plugins) will register here (M1, M4).
const plugins = { sources: new SourceRegistry(), notifiers: new NotifierRegistry() };

const app = await buildApp({
  version: readVersion(),
  webDir: config.webDir,
  logger: { level: config.logLevel },
  plugins,
  databasePing: database.ping,
});
app.log.info({ database: config.databasePath }, 'database ready');

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  database.close();
  process.exit(0);
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
