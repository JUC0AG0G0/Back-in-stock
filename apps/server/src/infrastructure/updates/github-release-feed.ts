import type {
  PublishedRelease,
  ReleaseFeed,
  ReleaseFeedResult,
} from '../../application/update-checker.js';

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
}

export interface GitHubReleaseFeedOptions {
  /** owner/name */
  repository: string;
  userAgent: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Releases from the GitHub REST API, without a token (60 requests/hour per IP, we make 4/day).
 * Sends If-None-Match: an unchanged list answers 304, which does not count against the limit.
 */
export class GitHubReleaseFeed implements ReleaseFeed {
  constructor(private readonly options: GitHubReleaseFeedOptions) {}

  async fetch(etag: string | null): Promise<ReleaseFeedResult> {
    const doFetch = this.options.fetch ?? fetch;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': this.options.userAgent,
    };
    if (etag) headers['If-None-Match'] = etag;

    const res = await doFetch(
      `https://api.github.com/repos/${this.options.repository}/releases?per_page=50`,
      { headers, signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000) },
    );
    if (res.status === 304) return { notModified: true };
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);

    const releases = (await res.json()) as GitHubRelease[];
    return {
      notModified: false,
      etag: res.headers.get('etag'),
      releases: releases.map((r): PublishedRelease => ({
        tag: r.tag_name,
        name: r.name ?? r.tag_name,
        body: r.body ?? '',
        url: r.html_url,
        publishedAt: r.published_at ?? '',
        prerelease: r.prerelease,
        draft: r.draft,
      })),
    };
  }
}
