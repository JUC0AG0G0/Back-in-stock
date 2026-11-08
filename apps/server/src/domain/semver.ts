/**
 * Minimal semantic versioning (https://semver.org), enough to compare our own releases.
 * Accepts an optional leading "v" (Git tags are "v1.2.3").
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release identifiers, e.g. ["rc", 1] for "1.2.0-rc.1". Empty for a stable release. */
  prerelease: (string | number)[];
}

const PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parses "1.2.3", "v1.2.3-rc.1"... Returns null when the text is not a valid version. */
export function parseSemVer(text: string): SemVer | null {
  const match = PATTERN.exec(text.trim());
  if (!match) return null;
  const [, major, minor, patch, pre] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: pre ? pre.split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [],
  };
}

/** Negative when a < b, 0 when equal, positive when a > b (build metadata is ignored). */
export function compareSemVer(a: SemVer, b: SemVer): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;
  // A stable release is greater than its pre-releases: 1.0.0 > 1.0.0-rc.1.
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (typeof x === 'number') return -1; // numbers sort before strings
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function isPrerelease(version: SemVer): boolean {
  return version.prerelease.length > 0;
}

/**
 * Whether going from `from` to `to` crosses a major version.
 * In 0.x a minor bump can also be breaking (SPEC §15ter), but so is every `feat`:
 * the release notes ("BREAKING CHANGES") tell those apart, see update-checker.ts.
 */
export function isMajorUpgrade(from: SemVer, to: SemVer): boolean {
  return to.major > from.major;
}

export function formatSemVer(version: SemVer): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length ? `${core}-${version.prerelease.join('.')}` : core;
}
