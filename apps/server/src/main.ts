import { loadConfig } from './config.js';
import { buildApp } from './http/app.js';
import { readVersion } from './version.js';

// Composition root: this is the only place that wires concrete dependencies together.
const config = loadConfig();
const app = buildApp({ version: readVersion(), logger: { level: config.logLevel } });

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
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
