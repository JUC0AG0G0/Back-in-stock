import { describe, expect, it, vi } from 'vitest';
import {
  type PublishedRelease,
  type ReleaseFeed,
  UpdateChecker,
  type UpdateCheckerOptions,
} from './update-checker.js';

const release = (tag: string, extra: Partial<PublishedRelease> = {}): PublishedRelease => ({
  tag,
  name: tag,
  body: `Notes of ${tag}`,
  url: `https://github.com/x/y/releases/tag/${tag}`,
  publishedAt: '2026-11-08T00:00:00Z',
  prerelease: false,
  draft: false,
  ...extra,
});

const feedOf = (releases: PublishedRelease[]): ReleaseFeed => ({
  fetch: vi.fn(async () => ({ notModified: false as const, etag: '"abc"', releases })),
});

const checker = (feed: ReleaseFeed, options: Partial<UpdateCheckerOptions> = {}) =>
  new UpdateChecker({
    currentVersion: '1.2.0',
    buildChannel: 'release',
    channel: 'stable',
    enabled: true,
    feed,
    now: () => new Date('2026-11-08T10:00:00Z'),
    ...options,
  });

describe('UpdateChecker', () => {
  it('lists the newer stable releases, newest first', async () => {
    const feed = feedOf([
      release('v1.1.0'),
      release('v1.3.0'),
      release('v1.2.0'),
      release('v1.4.0-rc.1', { prerelease: true }),
      release('v1.2.1'),
      release('v9.9.9', { draft: true }),
      release('plugin-sdk-v5.0.0'),
    ]);

    const status = await checker(feed).check();

    expect(status).toMatchObject({
      enabled: true,
      currentVersion: '1.2.0',
      latestVersion: '1.3.0',
      updateAvailable: true,
      breaking: false,
      checkedAt: '2026-11-08T10:00:00.000Z',
      error: null,
    });
    expect(status.releases.map((r) => r.version)).toEqual(['1.3.0', '1.2.1']);
  });

  it('includes pre-releases on the prerelease channel', async () => {
    const status = await checker(feedOf([release('v1.3.0-beta.2', { prerelease: true })]), {
      channel: 'prerelease',
    }).check();

    expect(status.latestVersion).toBe('1.3.0-beta.2');
    expect(status.releases[0]?.prerelease).toBe(true);
  });

  it('reports no update when we run the latest version', async () => {
    const status = await checker(feedOf([release('v1.2.0'), release('v1.0.0')])).check();
    expect(status).toMatchObject({ updateAvailable: false, latestVersion: null, releases: [] });
  });

  it('flags major versions and releases with breaking changes', async () => {
    const major = await checker(feedOf([release('v2.0.0')])).check();
    expect(major.breaking).toBe(true);

    const notes = await checker(
      feedOf([release('v1.3.0', { body: '### ⚠ BREAKING CHANGES\n\n* config renamed' })]),
    ).check();
    expect(notes.breaking).toBe(true);
    expect(notes.releases[0]?.breaking).toBe(true);
  });

  it('does not query GitHub when disabled, nor on edge and dev builds', async () => {
    for (const options of [
      { enabled: false },
      { buildChannel: 'edge' as const },
      { buildChannel: 'dev' as const },
      { currentVersion: 'edge' },
    ]) {
      const feed = feedOf([release('v9.0.0')]);
      const status = await checker(feed, options).check();
      expect(feed.fetch).not.toHaveBeenCalled();
      expect(status.enabled).toBe(false);
      expect(status.updateAvailable).toBe(false);
    }
    expect(checker(feedOf([]), { enabled: false }).status().disabledReason).toBe('disabled');
    expect(checker(feedOf([]), { buildChannel: 'edge' }).status().disabledReason).toBe(
      'not-a-release',
    );
  });

  it('applies a change of channel or switch made in Settings', async () => {
    const feed = feedOf([release('v1.3.0'), release('v1.4.0-rc.1', { prerelease: true })]);
    const c = checker(feed);
    await c.check();
    expect(c.status().latestVersion).toBe('1.3.0');

    c.configure({ channel: 'prerelease' });
    expect(c.status().latestVersion).toBe('1.4.0-rc.1');

    c.configure({ enabled: false });
    expect(c.active).toBe(false);
    expect(c.status()).toMatchObject({ enabled: false, disabledReason: 'disabled' });
  });

  it('sends the ETag back and keeps the releases when nothing changed', async () => {
    const fetch = vi
      .fn<ReleaseFeed['fetch']>()
      .mockResolvedValueOnce({ notModified: false, etag: '"v1"', releases: [release('v1.3.0')] })
      .mockResolvedValueOnce({ notModified: true });
    const c = checker({ fetch });

    await c.check();
    const second = await c.check();

    expect(fetch).toHaveBeenLastCalledWith('"v1"');
    expect(second.latestVersion).toBe('1.3.0');
  });

  it('keeps the last result and reports the error when GitHub fails', async () => {
    const fetch = vi
      .fn<ReleaseFeed['fetch']>()
      .mockResolvedValueOnce({ notModified: false, etag: null, releases: [release('v1.3.0')] })
      .mockRejectedValueOnce(new Error('GitHub answered 403'));
    const c = checker({ fetch });

    await c.check();
    const status = await c.check();

    expect(status.error).toBe('GitHub answered 403');
    expect(status.latestVersion).toBe('1.3.0');
  });
});
