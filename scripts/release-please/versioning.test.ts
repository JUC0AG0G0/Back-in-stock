import { readFileSync } from 'node:fs';
import type { ConventionalCommit } from 'release-please';
import { Version } from 'release-please/build/src/version.js';
import { buildVersioningStrategy } from 'release-please/build/src/factories/versioning-strategy-factory.js';
import { describe, expect, it } from 'vitest';
import {
  REFACTOR_MINOR,
  RefactorMinorVersioningStrategy,
  registerRefactorMinorStrategy,
} from './versioning.ts';

function commit(type: string, breaking = false): ConventionalCommit {
  return {
    sha: 'abc123',
    message: `${type}${breaking ? '!' : ''}: something`,
    files: [],
    type,
    scope: null,
    notes: [],
    references: [],
    bareMessage: 'something',
    breaking,
  };
}

// Same options as release-please-config.json.
const strategy = new RefactorMinorVersioningStrategy({
  bumpMinorPreMajor: true,
  bumpPatchForMinorPreMajor: false,
});

function next(from: string, ...types: string[]): string {
  return strategy
    .bump(
      Version.parse(from),
      types.map((type) => commit(type)),
    )
    .toString();
}

describe('RefactorMinorVersioningStrategy', () => {
  it('bumps the minor for refactor', () => {
    expect(next('0.1.0', 'refactor')).toBe('0.2.0');
    expect(next('1.2.3', 'refactor')).toBe('1.3.0');
  });

  it('bumps the patch for perf and fix', () => {
    expect(next('0.1.0', 'perf')).toBe('0.1.1');
    expect(next('0.1.0', 'fix')).toBe('0.1.1');
  });

  it('keeps the default rules for feat and breaking changes', () => {
    expect(next('0.1.0', 'feat')).toBe('0.2.0');
    expect(next('1.2.3', 'perf', 'refactor')).toBe('1.3.0');
    expect(strategy.bump(Version.parse('0.1.0'), [commit('refactor', true)]).toString()).toBe(
      '0.2.0',
    );
    expect(strategy.bump(Version.parse('1.2.3'), [commit('refactor', true)]).toString()).toBe(
      '2.0.0',
    );
  });

  it('is what release-please builds from the config', () => {
    registerRefactorMinorStrategy();
    const config = JSON.parse(readFileSync('release-please-config.json', 'utf8')) as {
      versioning: string;
      'changelog-sections': { type: string; hidden?: boolean }[];
    };
    expect(config.versioning).toBe(REFACTOR_MINOR);
    // A commit type only produces a release when its changelog section is visible.
    for (const type of ['feat', 'fix', 'perf', 'refactor']) {
      const section = config['changelog-sections'].find((s) => s.type === type);
      expect(section?.hidden ?? false, type).toBe(false);
    }
    // github is only used by strategies that read the repository.
    const built = buildVersioningStrategy({ type: config.versioning, github: undefined as never });
    expect(built).toBeInstanceOf(RefactorMinorVersioningStrategy);
  });
});
