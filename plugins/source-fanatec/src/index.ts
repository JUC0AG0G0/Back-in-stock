import {
  SourceError,
  defineSourcePlugin,
  type FetchResult,
  type ProductSnapshot,
  type SourceContext,
} from '@back-in-stock/plugin-sdk';
import {
  findJsonLdProduct,
  fullUrlOfShortLink,
  productOf,
  readNextData,
  readProduct,
} from './page.js';

/** Product pages: /{region}/{language}/p/…, e.g. /eu/fr/p/steering-wheels/crd-9020019-ww/clubsport-formula-v3. */
const PRODUCT_PATH = /^\/[a-z]{2}\/[a-z]{2}\/p\/[^/]+/i;

function isFanatec(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'fanatec.com' || host.endsWith('.fanatec.com');
}

function checkStatus(page: FetchResult): void {
  if (page.status === 404 || page.status === 410) {
    throw new SourceError('not-found', `Product page not found (HTTP ${page.status})`);
  }
  if (page.status === 403 || page.status === 429) {
    throw new SourceError('blocked', `fanatec.com refused the request (HTTP ${page.status})`);
  }
  if (page.status >= 500)
    throw new SourceError('network', `fanatec.com error (HTTP ${page.status})`);
  if (page.status >= 400) throw new SourceError('parse', `Unexpected HTTP ${page.status}`);
}

async function checkProduct({
  url,
  fetch,
  html,
  logger,
  signal,
}: SourceContext<unknown>): Promise<ProductSnapshot> {
  let page = await fetch.get(url, { signal });
  checkStatus(page);
  let data = readNextData(page.body);
  // The site answers 200 with its "page not found" page for an unknown product.
  if (data?.page === '/404') throw new SourceError('not-found', 'Product not found on fanatec.com');

  // A short link (/eu/fr/p/SKU) holds no product: the browser builds the full URL with JavaScript.
  if (!productOf(data)) {
    const full = fullUrlOfShortLink(data, new URL(page.url || url));
    if (full) {
      logger.debug('short link, following the full product URL', { url: full.toString() });
      page = await fetch.get(full, { signal });
      checkStatus(page);
      data = readNextData(page.body);
      if (data?.page === '/404') {
        throw new SourceError('not-found', 'Product not found on fanatec.com');
      }
    }
  }

  const snapshot = readProduct(productOf(data), findJsonLdProduct(html.extractJsonLd(page.body)));
  if (!snapshot) {
    throw new SourceError('parse', 'No product data on this page (is it a product page?)');
  }
  return snapshot;
}

export default defineSourcePlugin({
  id: 'fanatec',
  name: 'Fanatec',
  version: '0.1.0',
  supports: ['product'],
  fetchMode: 'http',
  match: (url) => (isFanatec(url) && PRODUCT_PATH.test(url.pathname) ? 1 : 0),
  checkProduct,
  testTargets: [
    {
      type: 'product',
      label: 'ClubSport Formula V3 (EU)',
      url: 'https://www.fanatec.com/eu/en/p/steering-wheels/crd-9020019-ww/clubsport-formula-v3',
    },
  ],
});
