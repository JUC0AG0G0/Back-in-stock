import telegram from '@back-in-stock/plugin-notifier-telegram';
import { RuntimeSettings } from './application/runtime-settings.js';
import { UpdateChecker } from './application/update-checker.js';
import { UpdateScheduler } from './application/update-scheduler.js';
import { loadConfig } from './config.js';
import { buildApp } from './http/app.js';
import { openDatabase } from './infrastructure/db/database.js';
import {
  SqliteChannelRepository,
  SqliteSettingsRepository,
} from './infrastructure/db/repositories.js';
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

// Settings screen: environment variables are the defaults, values saved from the UI win.
const settings = new RuntimeSettings(new SqliteSettingsRepository(database.db), {
  updateCheck: config.updates.check,
  updateIntervalHours: config.updates.intervalHours,
  updateChannel: config.updates.channel,
  apiDocs: config.apiDocs,
});
await settings.load();

const HOUR_MS = 60 * 60 * 1000;
// New version check (SPEC §7quater): release images only, every 6 hours by default.
const updateChecker = new UpdateChecker({
  currentVersion: version,
  buildChannel: config.updates.buildChannel,
  channel: settings.get('updateChannel'),
  enabled: settings.get('updateCheck'),
  feed: new GitHubReleaseFeed({
    repository: config.updates.repository,
    userAgent: `back-in-stock/${version}`,
  }),
});
const updateScheduler = new UpdateScheduler({
  checker: updateChecker,
  intervalMs: settings.get('updateIntervalHours') * HOUR_MS,
});
updateScheduler.start();
settings.onChange((values, changed) => {
  updateChecker.configure({ enabled: values.updateCheck, channel: values.updateChannel });
  if (changed.includes('updateIntervalHours')) {
    updateScheduler.setInterval(values.updateIntervalHours * HOUR_MS);
  } else if (changed.includes('updateCheck')) {
    updateScheduler.reschedule();
  }
});
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
  apiDocs: () => settings.get('apiDocs'),
  updates: {
    checker: updateChecker,
    updater,
    readLastJob: () => readLastJob(config.dataDir),
    onChecked: () => updateScheduler.reschedule(),
  },
  settings: {
    settings,
    updateCheckSupported: config.updates.buildChannel === 'release',
  },
  channels: { repository: channels, fetch: fetcher },
  pluginTests: { fetch: fetcher, channels },
});
if (settings.get('apiDocs')) {
  app.log.info(`API docs: http://localhost:${config.port}/api/docs`);
}
app.log.info({ database: config.databasePath }, 'database ready');

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  updateScheduler.stop();
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
