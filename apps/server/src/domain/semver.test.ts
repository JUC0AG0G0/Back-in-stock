import { describe, expect, it } from 'vitest';
import { compareSemVer, formatSemVer, isMajorUpgrade, parseSemVer, type SemVer } from './semver.js';

const v = (text: string): SemVer => {
  const parsed = parseSemVer(text);
  if (!parsed) throw new Error(`invalid version in test: ${text}`);
  return parsed;
};

describe('parseSemVer', () => {
  it('parses releases, tags and pre-releases', () => {
    expect(v('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(v('v0.10.0')).toMatchObject({ major: 0, minor: 10, patch: 0 });
    expect(v('2.0.0-rc.1').prerelease).toEqual(['rc', 1]);
    expect(v('1.0.0+build.5').prerelease).toEqual([]);
  });

  it('rejects anything else', () => {
    for (const text of ['', 'edge', 'latest', '1.2', '01.2.3', '1.2.3-', 'dev-abc123']) {
      expect(parseSemVer(text)).toBeNull();
    }
  });
});

describe('compareSemVer', () => {
  it('follows the semver precedence rules', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
      '10.0.0',
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareSemVer(v(ordered[i - 1]!), v(ordered[i]!))).toBeLessThan(0);
      expect(compareSemVer(v(ordered[i]!), v(ordered[i - 1]!))).toBeGreaterThan(0);
    }
    expect(compareSemVer(v('v1.2.3'), v('1.2.3'))).toBe(0);
  });
});

describe('isMajorUpgrade', () => {
  it('is true only when the major version goes up', () => {
    expect(isMajorUpgrade(v('1.9.0'), v('2.0.0'))).toBe(true);
    expect(isMajorUpgrade(v('1.2.0'), v('1.3.0'))).toBe(false);
    expect(isMajorUpgrade(v('0.1.0'), v('0.2.0'))).toBe(false);
  });
});

describe('formatSemVer', () => {
  it('drops the leading v', () => {
    expect(formatSemVer(v('v1.2.3-rc.1'))).toBe('1.2.3-rc.1');
  });
});
