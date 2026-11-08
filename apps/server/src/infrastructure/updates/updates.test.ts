import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GitHubReleaseFeed } from './github-release-feed.js';
import { ensureUpdaterToken } from './updater-client.js';

describe('GitHubReleaseFeed', () => {
  const feed = (fetch: typeof globalThis.fetch) =>
    new GitHubReleaseFeed({ repository: 'o/r', userAgent: 'back-in-stock/1.0.0', fetch });

  it('maps the releases and returns the ETag', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        [
          {
            tag_name: 'v1.1.0',
            name: null,
            body: null,
            html_url: 'https://github.com/o/r/releases/tag/v1.1.0',
            published_at: '2026-11-08T00:00:00Z',
            prerelease: false,
            draft: false,
          },
        ],
        { headers: { etag: '"e1"' } },
      ),
    );

    const result = await feed(fetch).fetch(null);

    expect(result).toEqual({
      notModified: false,
      etag: '"e1"',
      releases: [
        {
          tag: 'v1.1.0',
          name: 'v1.1.0',
          body: '',
          url: 'https://github.com/o/r/releases/tag/v1.1.0',
          publishedAt: '2026-11-08T00:00:00Z',
          prerelease: false,
          draft: false,
        },
      ],
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/releases?per_page=50',
      expect.objectContaining({ headers: expect.not.objectContaining({ 'If-None-Match': '' }) }),
    );
  });

  it('sends If-None-Match and understands 304', async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['If-None-Match']).toBe('"e1"');
      return new Response(null, { status: 304 });
    });
    expect(await feed(fetch as typeof globalThis.fetch).fetch('"e1"')).toEqual({
      notModified: true,
    });
  });

  it('fails on an error status', async () => {
    const fetch = vi.fn(async () => new Response('rate limited', { status: 403 }));
    await expect(feed(fetch).fetch(null)).rejects.toThrow('GitHub answered 403');
  });
});

describe('ensureUpdaterToken', () => {
  it('creates a private token once, then reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bis-token-'));
    try {
      const token = ensureUpdaterToken(dir);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(statSync(join(dir, 'updater.token')).mode & 0o777).toBe(0o600);
      expect(ensureUpdaterToken(dir)).toBe(token);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
