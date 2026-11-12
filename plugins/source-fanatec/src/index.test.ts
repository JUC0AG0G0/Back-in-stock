import { readFileSync } from 'node:fs';
import {
  SourceError,
  validatePlugin,
  type FetchResult,
  type Fetcher,
  type HtmlHelpers,
  type Logger,
} from '@back-in-stock/plugin-sdk';
import { describe, expect, it } from 'vitest';
import fanatec from './index.js';

/** Trimmed copies of real pages, saved on 2026-11-12. */
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');

const DRIFT =
  'https://www.fanatec.com/eu/en/p/steering-wheels/sw_cs_drift_v2_x/clubsport-steering-wheel-drift-v2-xbox?position=82&queryID=8886ca82a5ae473d28cc3e7216b5d0de';
const FORMULA =
  'https://www.fanatec.com/eu/en/p/steering-wheels/crd-9020019-ww/clubsport-formula-v3?position=1';
const SHORT = 'https://www.fanatec.com/eu/fr/p/CRD-9040002-WW';
const SHORT_TARGET = 'https://www.fanatec.com/eu/fr/p/add-ons/crd-9040002-ww/clubsport-shifter-sq';

type Page = { status?: number; body: string };

/** Answers each URL (without its query string) with a page, and 404 for the rest. */
function fakeFetcher(pages: Record<string, Page>) {
  const requested: string[] = [];
  const fetcher: Fetcher = {
    get: async (target): Promise<FetchResult> => {
      const url = new URL(String(target));
      requested.push(url.toString());
      const page = pages[`${url.origin}${url.pathname}`];
      return {
        url: url.toString(),
        status: page ? (page.status ?? 200) : 404,
        headers: {},
        body: page?.body ?? '',
      };
    },
    post: () => Promise.reject(new Error('unexpected POST')),
  };
  return { fetcher, requested };
}

const html: HtmlHelpers = {
  extractJsonLd: (body) =>
    [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (match) => JSON.parse(match[1] ?? 'null') as unknown,
    ),
};
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

function check(url: string, pages: Record<string, Page>) {
  const { fetcher, requested } = fakeFetcher(pages);
  const result = fanatec.checkProduct!({
    url: new URL(url),
    config: {},
    fetch: fetcher,
    html,
    logger,
    signal: new AbortController().signal,
  });
  return { result, requested };
}

const pageOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
};

describe('fanatec plugin', () => {
  it('is a valid source plugin', () => {
    expect(validatePlugin(fanatec).ok).toBe(true);
  });

  it('claims fanatec.com product pages only', () => {
    expect(fanatec.match(new URL(DRIFT))).toBe(1);
    expect(fanatec.match(new URL(SHORT))).toBe(1);
    expect(fanatec.match(new URL('https://fanatec.com/us/en/p/wheel-bases/x/y'))).toBe(1);
    expect(fanatec.match(new URL('https://www.fanatec.com/eu/fr/c/wheel-bases'))).toBe(0);
    expect(fanatec.match(new URL('https://www.fanatec.com/eu/fr'))).toBe(0);
    expect(fanatec.match(new URL('https://notfanatec.com/eu/fr/p/abc'))).toBe(0);
  });

  it('reads an out-of-stock product on sale: name, photo, price and regular price', async () => {
    const { result } = check(DRIFT, { [pageOf(DRIFT)]: { body: fixture('out-of-stock-on-sale') } });
    await expect(result).resolves.toEqual({
      status: 'OUT_OF_STOCK',
      title: 'ClubSport Steering Wheel Drift V2 for XBOX',
      price: { amountCents: 44995, currency: 'EUR' },
      regularPrice: { amountCents: 53985, currency: 'EUR' },
      imageUrl:
        'https://assets.fanatec.com/image/upload/c_fill,q_auto,h_1024,w_1024,f_auto/products/Steering-Wheels/SW_CS_%20DRIFT_V2_X/SW_CS__DRIFT_V2_X-01.webp',
      signal: '__NEXT_DATA__ stock_status',
    });
  });

  it('reads an in-stock product at its regular price, without a regular price', async () => {
    const { result } = check(FORMULA, { [pageOf(FORMULA)]: { body: fixture('in-stock') } });
    const snapshot = await result;
    expect(snapshot).toMatchObject({
      status: 'IN_STOCK',
      title: 'ClubSport Formula V3',
      price: { amountCents: 34995, currency: 'EUR' },
    });
    expect(snapshot.regularPrice).toBeUndefined();
    expect(snapshot.imageUrl).toMatch(/^https:\/\/assets\.fanatec\.com\/.+CRD-9020019-WW-01/);
  });

  it('reads a backorder as a preorder', async () => {
    const body = fixture('out-of-stock-on-sale').replace('"available": false', '"available": true');
    const { result } = check(DRIFT, { [pageOf(DRIFT)]: { body } });
    await expect(result).resolves.toMatchObject({ status: 'PREORDER' });
  });

  it('follows a short link to the full product page', async () => {
    const { result, requested } = check(SHORT, {
      [SHORT]: { body: fixture('short-link') },
      [SHORT_TARGET]: { body: fixture('short-link-target') },
    });
    await expect(result).resolves.toMatchObject({
      status: 'IN_STOCK',
      title: 'ClubSport Shifter SQ V1.5',
      price: { amountCents: 26995, currency: 'EUR' },
    });
    expect(requested).toEqual([SHORT, SHORT_TARGET]);
  });

  it('falls back to JSON-LD when the Next.js data is missing', async () => {
    const body = fixture('out-of-stock-on-sale').replace(/<script id="__NEXT_DATA__"[\s\S]*$/, '');
    const { result } = check(DRIFT, { [pageOf(DRIFT)]: { body } });
    await expect(result).resolves.toMatchObject({
      status: 'OUT_OF_STOCK',
      title: 'ClubSport Steering Wheel Drift V2 for XBOX',
      price: { amountCents: 44995, currency: 'EUR' },
      signal: 'json-ld offers.availability',
    });
  });

  it('says "UNKNOWN" for a stock status it does not know, never a stock change', async () => {
    const body = fixture('in-stock').replace('"stock_status": "IN_STOCK"', '"stock_status": "X"');
    const { result } = check(FORMULA, { [pageOf(FORMULA)]: { body } });
    await expect(result).resolves.toMatchObject({ status: 'UNKNOWN' });
  });

  it.each([
    ['the site "not found" page', { body: fixture('not-found') }, 'not-found'],
    ['an HTTP 404', { status: 404, body: '' }, 'not-found'],
    ['an HTTP 403', { status: 403, body: 'Access Denied' }, 'blocked'],
    ['an HTTP 503', { status: 503, body: '' }, 'network'],
    ['a page without product data', { body: '<html><body>Hello</body></html>' }, 'parse'],
  ])('throws a SourceError on %s', async (_label, page, kind) => {
    const { result } = check(FORMULA, { [pageOf(FORMULA)]: page });
    await expect(result).rejects.toBeInstanceOf(SourceError);
    await expect(result).rejects.toMatchObject({ kind });
  });
});
