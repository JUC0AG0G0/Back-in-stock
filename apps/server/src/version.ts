import { readFileSync } from 'node:fs';

interface PackageJson {
  version: string;
}

/** Version of the app, read from the root package.json that release-please bumps. */
export function readVersion(): string {
  const url = new URL('../../../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(url, 'utf8')) as PackageJson;
  return pkg.version;
}
