// Versioning strategy used by release-please (see release-please-config.json, "versioning").
//
// release-please's default strategy bumps the major for breaking changes, the minor for `feat`
// and the patch for everything else that shows up in the changelog (`fix`, `perf`, ...).
// This project also wants a minor release for `refactor`, which no built-in strategy offers:
// this one counts `refactor` commits as features, then defers to the default strategy
// (so Release-As footers, breaking changes and the pre-1.0 options keep working).
import type { ConventionalCommit, VersioningStrategyFactoryOptions } from 'release-please';
import { registerVersioningStrategy } from 'release-please';
// Not re-exported by the package entry point. The version is locked and covered by tests.
import { DefaultVersioningStrategy } from 'release-please/build/src/versioning-strategies/default.js';
import type { Version } from 'release-please/build/src/version.js';
import type { VersionUpdater } from 'release-please/build/src/versioning-strategy.js';

export const REFACTOR_MINOR = 'refactor-minor';

/** Commit types that trigger a minor release, on top of `feat`. */
const MINOR_TYPES = new Set(['refactor']);

export class RefactorMinorVersioningStrategy extends DefaultVersioningStrategy {
  override determineReleaseType(version: Version, commits: ConventionalCommit[]): VersionUpdater {
    return super.determineReleaseType(
      version,
      commits.map((commit) =>
        MINOR_TYPES.has(commit.type) ? { ...commit, type: 'feat' } : commit,
      ),
    );
  }
}

export function buildRefactorMinorStrategy(
  options: VersioningStrategyFactoryOptions,
): RefactorMinorVersioningStrategy {
  return new RefactorMinorVersioningStrategy({
    bumpMinorPreMajor: options.bumpMinorPreMajor === true,
    bumpPatchForMinorPreMajor: options.bumpPatchForMinorPreMajor === true,
  });
}

export function registerRefactorMinorStrategy(): void {
  registerVersioningStrategy(REFACTOR_MINOR, buildRefactorMinorStrategy);
}
