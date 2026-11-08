/** Minimal logger handed to plugins. The core prefixes every line with the plugin id. */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  /** Overrides the context signal, e.g. for a shorter timeout. */
  signal?: AbortSignal;
}

export interface FetchResult {
  /** Final URL, after redirects. */
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * HTTP client provided by the core. It applies rate limiting per domain, retries,
 * a realistic User-Agent and cookies, so plugins must use it instead of `fetch`.
 */
export interface Fetcher {
  get(url: URL | string, options?: FetchOptions): Promise<FetchResult>;
  /** Sends `json` as a JSON body (content-type set by the core), or a raw `body`. */
  post(url: URL | string, options?: PostOptions): Promise<FetchResult>;
}

export interface PostOptions extends FetchOptions {
  json?: unknown;
  body?: string;
}

/** HTML helpers provided by the core. */
export interface HtmlHelpers {
  /** Parsed contents of every `<script type="application/ld+json">` block, invalid ones skipped. */
  extractJsonLd(html: string): unknown[];
}

/** A price in the smallest currency unit, to avoid floating point errors (19.99 € → 1999). */
export interface Price {
  amountCents: number;
  /** ISO 4217 code, e.g. "EUR". */
  currency: string;
}
