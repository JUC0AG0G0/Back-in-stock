import {
  compareSemVer,
  formatSemVer,
  isMajorUpgrade,
  isPrerelease,
  parseSemVer,
  type SemVer,
} from '../domain/semver.js';

/** A release as published on GitHub (only the fields we use). */
export interface PublishedRelease {
  tag: string;
  name: string;
  /** Release notes in Markdown, written by release-please. */
  body: string;
  url: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
}

export type ReleaseFeedResult =
  { notModified: true } | { notModified: false; etag: string | null; releases: PublishedRelease[] };

/** Port: where the published releases come from (GitHub in production, a fake in tests). */
export interface ReleaseFeed {
  fetch(etag: string | null): Promise<ReleaseFeedResult>;
}

/**
 * Which builds look for updates:
 * - release: image built from a release tag (X.Y.Z, X.Y, X, latest) → yes;
 * - edge: image rebuilt on every merge to main → no, it is already ahead of the releases;
 * - dev: `pnpm dev` or a local `docker build` → no.
 */
export type BuildChannel = 'release' | 'edge' | 'dev';

/** stable: releases only. prerelease: also -rc / -beta versions. */
export type UpdateChannel = 'stable' | 'prerelease';

export interface ReleaseSummary {
  version: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string;
  prerelease: boolean;
  breaking: boolean;
}

export interface UpdateStatus {
  /** False when checks are off (BIS_UPDATE_CHECK=false) or the build is not a release. */
  enabled: boolean;
  disabledReason: 'disabled' | 'not-a-release' | null;
  currentVersion: string;
  buildChannel: BuildChannel;
  channel: UpdateChannel;
  /** Newest version available on the channel, null when none is newer than ours. */
  latestVersion: string | null;
  updateAvailable: boolean;
  /** At least one release between ours and the latest has breaking changes. */
  breaking: boolean;
  /** Every release newer than ours, newest first: the changelog shown in the UI. */
  releases: ReleaseSummary[];
  checkedAt: string | null;
  /** Last check failed (network, rate limit...). The previous result is kept. */
  error: string | null;
}

export interface UpdateCheckerOptions {
  currentVersion: string;
  buildChannel: BuildChannel;
  channel: UpdateChannel;
  enabled: boolean;
  feed: ReleaseFeed;
  now?: () => Date;
}

/** release-please writes this heading when a commit has `!` or a BREAKING CHANGE footer. */
const BREAKING_MARKER = /BREAKING CHANGES?/;

/** Compares the running version with the published releases (SPEC §7quater). */
export class UpdateChecker {
  private etag: string | null = null;
  private releases: PublishedRelease[] = [];
  private checkedAt: Date | null = null;
  private error: string | null = null;
  private readonly current: SemVer | null;
  private readonly now: () => Date;

  constructor(private readonly options: UpdateCheckerOptions) {
    this.current = parseSemVer(options.currentVersion);
    this.now = options.now ?? (() => new Date());
  }

  /** Whether this instance should look for updates at all. */
  get active(): boolean {
    return this.disabledReason === null;
  }

  private get disabledReason(): UpdateStatus['disabledReason'] {
    if (!this.options.enabled) return 'disabled';
    if (this.options.buildChannel !== 'release' || !this.current) return 'not-a-release';
    return null;
  }

  /** Asks the feed for new releases. Never throws: a failure is kept in `status().error`. */
  async check(): Promise<UpdateStatus> {
    if (!this.active) return this.status();
    try {
      const result = await this.options.feed.fetch(this.etag);
      if (!result.notModified) {
        this.etag = result.etag;
        this.releases = result.releases;
      }
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
    this.checkedAt = this.now();
    return this.status();
  }

  status(): UpdateStatus {
    const base = {
      currentVersion: this.options.currentVersion,
      buildChannel: this.options.buildChannel,
      channel: this.options.channel,
      checkedAt: this.checkedAt?.toISOString() ?? null,
      error: this.error,
    };
    const current = this.current;
    if (!this.active || !current) {
      return {
        ...base,
        enabled: false,
        disabledReason: this.disabledReason,
        latestVersion: null,
        updateAvailable: false,
        breaking: false,
        releases: [],
      };
    }

    const newer = this.releases
      .filter((r) => !r.draft)
      .map((r) => ({ release: r, version: parseSemVer(r.tag) }))
      .filter((r): r is { release: PublishedRelease; version: SemVer } => r.version !== null)
      .filter(
        ({ release, version }) =>
          this.options.channel === 'prerelease' || (!release.prerelease && !isPrerelease(version)),
      )
      .filter(({ version }) => compareSemVer(version, current) > 0)
      .sort((a, b) => compareSemVer(b.version, a.version));

    const releases: ReleaseSummary[] = newer.map(({ release, version }) => ({
      version: formatSemVer(version),
      name: release.name || release.tag,
      notes: release.body,
      url: release.url,
      publishedAt: release.publishedAt,
      prerelease: release.prerelease || isPrerelease(version),
      breaking: isMajorUpgrade(current, version) || BREAKING_MARKER.test(release.body),
    }));

    return {
      ...base,
      enabled: true,
      disabledReason: null,
      latestVersion: releases[0]?.version ?? null,
      updateAvailable: releases.length > 0,
      breaking: releases.some((r) => r.breaking),
      releases,
    };
  }
}
