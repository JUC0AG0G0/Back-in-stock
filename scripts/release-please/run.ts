// Runs release-please like googleapis/release-please-action, with our versioning strategy
// registered first (the action cannot load custom strategies).
//
// 1. Creates the tag and the GitHub release when a release PR has just been merged.
// 2. Opens or updates the "chore(main): release x.y.z" PR.
//
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo), GITHUB_OUTPUT (set by GitHub Actions).
// Outputs: release_created, tag_name, version, major, minor, patch, sha, html_url, prs_created, pr.
import { appendFileSync } from 'node:fs';
import { GitHub, Manifest } from 'release-please';
import { registerRefactorMinorStrategy } from './versioning.ts';

const CONFIG_FILE = 'release-please-config.json';
const MANIFEST_FILE = '.release-please-manifest.json';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function setOutput(name: string, value: string | number | boolean): void {
  const line = `${name}=${String(value)}\n`;
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, line);
  else process.stdout.write(`output ${line}`);
}

registerRefactorMinorStrategy();

const [owner, repo] = requireEnv('GITHUB_REPOSITORY').split('/');
if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must look like owner/repo');

const github = await GitHub.create({ owner, repo, token: requireEnv('GITHUB_TOKEN') });
const branch = github.repository.defaultBranch;

// The manifest is reloaded between the two steps, as the action does: creating a release
// changes what the next release PR must contain.
const releases = (
  await (await Manifest.fromManifest(github, branch, CONFIG_FILE, MANIFEST_FILE)).createReleases()
).filter((release) => release !== undefined);

setOutput('release_created', false);
for (const release of releases) {
  // Single package at the repository root: unprefixed outputs, like the action.
  if (release.path !== '.') continue;
  setOutput('release_created', true);
  setOutput('tag_name', release.tagName);
  setOutput('version', release.version);
  setOutput('major', release.major);
  setOutput('minor', release.minor);
  setOutput('patch', release.patch);
  setOutput('sha', release.sha);
  setOutput('html_url', release.url);
}

const prs = (
  await (
    await Manifest.fromManifest(github, branch, CONFIG_FILE, MANIFEST_FILE)
  ).createPullRequests()
).filter((pr) => pr !== undefined);

setOutput('prs_created', prs.length > 0);
if (prs[0]) setOutput('pr', JSON.stringify(prs[0]));
