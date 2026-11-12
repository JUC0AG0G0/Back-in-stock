import type { ZodType } from 'zod';
import type { Fetcher, HtmlHelpers, Logger, Price } from './common.js';

export type WatchType = 'product' | 'listing';

/**
 * Stock status a plugin can read on a page.
 * There is no "error" status: when a page cannot be read, throw a `SourceError`.
 */
export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' | 'UNKNOWN';

export interface ProductSnapshot {
  status: StockStatus;
  title?: string;
  /** Price to pay now, discount included. */
  price?: Price;
  /** Price before discount, only when the product is on sale (higher than `price`). */
  regularPrice?: Price;
  imageUrl?: string;
  /** Selected variant, e.g. "Taille 42". */
  variant?: string;
  /** What the decision was based on, shown to the user to debug, e.g. "json-ld offers.availability". */
  signal?: string;
}

export type ListingAttributeValue = string | number | boolean;

export interface ListingItem {
  /** Stable identifier on this site: SKU, product id or normalized URL. Never a position in the page. */
  id: string;
  title: string;
  url: string;
  price?: Price;
  imageUrl?: string;
  /** Free attributes, e.g. { condition: "Très bon", capacityGb: 256 }. */
  attributes?: Record<string, ListingAttributeValue>;
}

export interface ListingSnapshot {
  items: ListingItem[];
  /** False when pagination stopped early (page limit reached): missing items are then not removals. */
  complete: boolean;
}

export interface SourceContext<Config> {
  url: URL;
  config: Config;
  fetch: Fetcher;
  html: HtmlHelpers;
  logger: Logger;
  /** Aborted when the check times out. */
  signal: AbortSignal;
}

export type FetchMode = 'http' | 'browser' | 'auto';

/**
 * A real page the plugin knows how to read, used by the "Test" and "Test all sites" buttons:
 * the core fetches and parses it like a check, shows the result and saves nothing.
 * Pick a stable page (a category, a long-lived product) so the test keeps working.
 */
export interface SourceTestTarget<Config> {
  url: string;
  type: WatchType;
  /** Plugin options to use for this page. Defaults to an empty config. */
  config?: Config;
  /** Short label shown in the UI, e.g. "Refurbished EU". Defaults to the URL. */
  label?: string;
}

export interface SourcePlugin<Config = unknown> {
  kind: 'source';
  apiVersion: number;
  /** Unique kebab-case id, e.g. "shopify" or "fanatec". */
  id: string;
  name: string;
  /** Plugin version (semver). */
  version: string;
  supports: readonly WatchType[];
  /** Score from 0 to 1: how well this plugin can read this URL. 0 means "not for me". */
  match(url: URL): number;
  /** Plugin options (variant, selectors…), validated and rendered as a form in the UI. */
  configSchema?: ZodType<Config>;
  fetchMode?: FetchMode;
  checkProduct?(ctx: SourceContext<Config>): Promise<ProductSnapshot>;
  checkListing?(ctx: SourceContext<Config>): Promise<ListingSnapshot>;
  /**
   * Example pages for the self-test. Optional: without them, a test needs a URL typed in the UI,
   * and "Test all sites" skips this plugin.
   */
  testTargets?: readonly SourceTestTarget<Config>[];
}

export type SourcePluginDefinition<Config> = Omit<SourcePlugin<Config>, 'kind' | 'apiVersion'>;
