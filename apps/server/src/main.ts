import telegram from '@back-in-stock/plugin-notifier-telegram';
import { UpdateChecker } from './application/update-checker.js';
import { loadConfig } from './config.js';
import { buildApp } from './http/app.js';
import { openDatabase } from './infrastructure/db/database.js';
import { SqliteChannelRepository } from './infrastructure/db/repositories.js';
import { HttpFetcher } from './infrastructure/http/http-fetcher.js';
import { NotifierRegistry, SourceRegistry } from './infrastructure/plugins/registry.js';
import { GitHubReleaseFeed } from './infrastructure/updates/github-release-feed.js';
import {
  ensureUpdaterToken,
  readLastJob,
  UpdaterClient,
} from './infrastructure/updates/updater-client.js';
import { readVersion } from './version.js';

// Composition root: this is the only place that wires concrete dependencies together.
const config = loadConfig();
// Opening the database also applies pending migrations.
const database = openDatabase(config.databasePath);
// Built-in plugins (plugins/*) and external ones (npm, /data/plugins) will register here (M1, M4).
const plugins = { sources: new SourceRegistry(), notifiers: new NotifierRegistry() };
plugins.notifiers.register(telegram);
const fetcher = new HttpFetcher();
const channels = new SqliteChannelRepository(database.db);

const version = readVersion();

// New version check (SPEC §7quater): release images only, every 6 hours, can be turned off.
const updateChecker = new UpdateChecker({
  currentVersion: version,
  buildChannel: config.updates.buildChannel,
  channel: config.updates.channel,
  enabled: config.updates.check,
  feed: new GitHubReleaseFeed({
    repository: config.updates.repository,
    userAgent: `back-in-stock/${version}`,
  }),
});
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let updateTimer: NodeJS.Timeout | undefined;
if (updateChecker.active) {
  const check = () => void updateChecker.check();
  setTimeout(check, 10_000).unref(); // not on the critical path of startup
  updateTimer = setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref();
}
// One-click install: the updater service reads the same token from /data.
const updater = config.updates.updaterUrl
  ? new UpdaterClient(config.updates.updaterUrl, ensureUpdaterToken(config.dataDir))
  : null;

const app = await buildApp({
  version,
  webDir: config.webDir,
  logger: { level: config.logLevel },
  plugins,
  databasePing: database.ping,
  apiDocs: config.apiDocs,
  updates: {
    checker: updateChecker,
    updater,
    readLastJob: () => readLastJob(config.dataDir),
  },
  channels: { repository: channels, fetch: fetcher },
  pluginTests: { fetch: fetcher, channels },
});
if (config.apiDocs) app.log.info(`API docs: http://localhost:${config.port}/api/docs`);
app.log.info({ database: config.databasePath }, 'database ready');

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  clearInterval(updateTimer);
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
