import { readFileSync } from 'node:fs';
import { parseSemVer } from './domain/semver.js';

interface PackageJson {
  version: string;
}

/**
 * Version of the app. Release images carry it in BIS_VERSION (set by the publish workflow);
 * otherwise it is read from the root package.json that release-please bumps.
 */
export function readVersion(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BIS_VERSION && parseSemVer(env.BIS_VERSION)) return env.BIS_VERSION;
  const url = new URL('../../../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(url, 'utf8')) as PackageJson;
  return pkg.version;
}
