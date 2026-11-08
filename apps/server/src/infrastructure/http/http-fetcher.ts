import type { FetchOptions, FetchResult, Fetcher, PostOptions } from '@back-in-stock/plugin-sdk';

export interface HttpFetcherOptions {
  userAgent?: string;
  /** Applied when the caller gives no signal of its own. */
  timeoutMs?: number;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; BackInStock/1.0; +https://github.com/juc0ag0g0/back-in-stock)';

/**
 * Plain HTTP fetcher on top of Node's fetch. Rate limiting, retries and cookies
 * per domain (SPEC §5) will come as decorators around it.
 */
export class HttpFetcher implements Fetcher {
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(options: HttpFetcherOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  get(url: URL | string, options: FetchOptions = {}): Promise<FetchResult> {
    return this.request(url, 'GET', options);
  }

  post(url: URL | string, options: PostOptions = {}): Promise<FetchResult> {
    const headers = { ...options.headers };
    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['content-type'] ??= 'application/json';
    }
    return this.request(url, 'POST', { ...options, headers }, body);
  }

  private async request(
    url: URL | string,
    method: string,
    options: FetchOptions,
    body?: string,
  ): Promise<FetchResult> {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': this.userAgent, ...options.headers },
      signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
      ...(body === undefined ? {} : { body }),
    });
    return {
      url: res.url,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: await res.text(),
    };
  }
}
