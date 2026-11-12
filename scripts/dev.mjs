#!/usr/bin/env node
// `pnpm dev`: starts the API (tsx watch) and the web UI (Vite, hot reload) together.
//
// - The API gets a free port from 8081 upwards, so it never clashes with a Docker
//   install on 8080, and Vite never proxies to that instance by mistake.
//   Force one with BIS_DEV_API_PORT=9000 pnpm dev.
// - Workspace packages (packages/*, plugins/*) are read from their TypeScript
//   sources through the "@back-in-stock/source" condition: no build, and editing
//   them reloads the API (tsx watch) or the page (Vite) like any other file.
// - Ctrl+C stops both; if one of them stops, the other is stopped too.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const FIRST_API_PORT = 8081;

function isFree(port, host) {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', (error) =>
        resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT'),
      )
      .once('listening', () => server.close(() => resolve(true)))
      .listen({ port, host, exclusive: true });
  });
}

async function findApiPort() {
  const forced = process.env.BIS_DEV_API_PORT;
  if (forced) return Number(forced);
  for (let port = FIRST_API_PORT; port < FIRST_API_PORT + 50; port++) {
    // Docker publishes on both stacks: check IPv4 and IPv6.
    if ((await isFree(port, '0.0.0.0')) && (await isFree(port, '::'))) return port;
  }
  throw new Error(`No free port between ${FIRST_API_PORT} and ${FIRST_API_PORT + 49}`);
}

const colors = { api: '\x1b[36m', web: '\x1b[35m' };
const reset = '\x1b[0m';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function prefixed(name, stream, target) {
  const label = useColor ? `${colors[name]}[${name}]${reset} ` : `[${name}] `;
  let pending = '';
  stream.on('data', (chunk) => {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop();
    for (const line of lines) target.write(label + line + '\n');
  });
  stream.on('end', () => pending && target.write(label + pending + '\n'));
}

const apiPort = await findApiPort();
const env = {
  ...process.env,
  PORT: String(apiPort),
  BIS_DEV_API_PORT: String(apiPort),
  FORCE_COLOR: useColor ? '1' : '0',
};

const children = new Map();
let stopping = false;

function run(name, filter) {
  const child = spawn('pnpm', ['--silent', '--filter', filter, 'run', 'dev'], {
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  prefixed(name, child.stdout, process.stdout);
  prefixed(name, child.stderr, process.stderr);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!stopping) {
      console.error(`[${name}] stopped (${signal ?? `code ${code}`}), stopping the rest.`);
      stop(code ?? 1);
    } else if (children.size === 0) {
      process.exit(process.exitCode ?? 0);
    }
  });
  children.set(name, child);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (children.size === 0) process.exit(code);
  for (const child of children.values()) child.kill('SIGINT');
  // Do not hang forever on a child that ignores the signal.
  setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL');
    process.exit(code);
  }, 5000).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log(
  `API on http://localhost:${apiPort} (Swagger: /api/docs), web UI on http://localhost:5173 (Vite prints the actual port).`,
);
run('api', '@back-in-stock/server');
run('web', '@back-in-stock/web');
