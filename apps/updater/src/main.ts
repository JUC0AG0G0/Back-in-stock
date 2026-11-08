import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { DockerClient } from './docker.js';
import { PreconditionError, Updater } from './job.js';
import type { ContainerInspect } from './recreate.js';

/**
 * Optional companion service of Back in stock ! (SPEC §7quater).
 * It is the only part with access to the Docker socket. No port is published:
 * only the app reaches it, on the compose network, with a token shared through /data.
 */
const env = process.env;
const port = Number(env.BIS_UPDATER_PORT ?? 8090);
const dataDir = env.BIS_DATA_DIR ?? '/data';
const tokenFile = join(dataDir, 'updater.token');
const envFile = env.BIS_ENV_FILE ?? '/install/.env';
const docker = new DockerClient(env.DOCKER_SOCKET ?? '/var/run/docker.sock');

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);

/**
 * The app container: BIS_TARGET_CONTAINER (a name) if set, else the `back-in-stock` service
 * (BIS_TARGET_SERVICE) of the compose project the updater itself belongs to.
 */
async function findTarget(): Promise<string> {
  if (env.BIS_TARGET_CONTAINER) return env.BIS_TARGET_CONTAINER;
  const service = env.BIS_TARGET_SERVICE ?? 'back-in-stock';
  const self = await docker.json<ContainerInspect>('GET', `/containers/${hostname()}/json`);
  const project = self.Config.Labels?.['com.docker.compose.project'];
  if (!project) {
    throw new PreconditionError(
      'not-found',
      'Not started by docker compose: set BIS_TARGET_CONTAINER to the app container name.',
    );
  }
  const filters = JSON.stringify({
    label: [`com.docker.compose.project=${project}`, `com.docker.compose.service=${service}`],
  });
  const found = await docker.json<{ Id: string }[]>(
    'GET',
    `/containers/json?all=true&filters=${encodeURIComponent(filters)}`,
  );
  if (found.length !== 1 || !found[0]) {
    throw new PreconditionError(
      'not-found',
      `Expected one "${service}" container in compose project "${project}", found ${found.length}.`,
    );
  }
  return found[0].Id;
}

const updater = new Updater({
  docker,
  dataDir,
  envFile,
  findTarget,
  log,
});

/** Token written by the app on its first start. Read on every call: it can be rotated. */
function authorized(req: IncomingMessage): boolean {
  let token: string;
  try {
    token = readFileSync(tokenFile, 'utf8').trim();
  } catch {
    return false;
  }
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const expected = Buffer.from(token);
  return token.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 10_000) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const server = createServer((req, res) => {
  void (async () => {
    // Liveness for the app ("is the updater installed?"): says nothing else.
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });

    if (req.method === 'GET' && req.url === '/status') return send(res, 200, updater.status());

    if (req.method === 'POST' && req.url === '/update') {
      const body = (await readBody(req)) as { version?: unknown };
      if (typeof body.version !== 'string' || !VERSION.test(body.version)) {
        return send(res, 400, { error: 'invalid version' });
      }
      try {
        log(`update to ${body.version} requested`);
        return send(res, 202, await updater.start(body.version));
      } catch (err) {
        if (err instanceof PreconditionError) {
          return send(res, 409, { error: err.code, message: err.message });
        }
        throw err;
      }
    }
    return send(res, 404, { error: 'not found' });
  })().catch((err: unknown) => {
    log(`error: ${String(err)}`);
    if (!res.headersSent) send(res, 500, { error: 'internal', message: String(err) });
  });
});

server.listen(port, '0.0.0.0', () => log(`updater listening on :${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
