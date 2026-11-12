import type { Price, ProductSnapshot, StockStatus } from '@back-in-stock/plugin-sdk';

/**
 * Reading of a fanatec.com product page.
 *
 * The site is a Next.js app: the server renders every product page with its full data in
 * the `__NEXT_DATA__` script (the same data the page shows), plus a schema.org `Product`
 * block in JSON-LD. Both are read, `__NEXT_DATA__` first because it carries the regular
 * price and the backorder flag that JSON-LD lacks.
 */

/** Product data as found in `props.pageProps.productData.productDetail.items[0]`. */
export interface FanatecProduct {
  name?: string;
  sku?: string;
  stock_status?: string;
  not_sellable?: boolean;
  backorder?: { available?: boolean } | null;
  image?: { url?: string } | null;
  media_gallery?: { url?: string }[] | null;
  price_range?: {
    minimum_price?: {
      regular_price?: { value?: number; currency?: string };
      final_price?: { value?: number; currency?: string };
    };
  };
}

export interface NextData {
  page?: string;
  props?: {
    pageProps?: {
      /** Only on a short link (/eu/fr/p/SKU): the browser builds the full URL from these. */
      sku?: string;
      category?: string;
      url_key?: string;
      productData?: { productDetail?: { items?: FanatecProduct[] } };
    };
  };
}

export interface JsonLdProduct {
  '@type': 'Product';
  name?: string;
  image?: string | string[];
  offers?: JsonLdOffer | JsonLdOffer[];
}

interface JsonLdOffer {
  price?: string | number;
  priceCurrency?: string;
  availability?: string;
}

const NEXT_DATA = /<script\b[^>]*\bid\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

export function readNextData(html: string): NextData | undefined {
  const content = NEXT_DATA.exec(html)?.[1];
  if (!content) return undefined;
  try {
    const data: unknown = JSON.parse(content);
    return typeof data === 'object' && data !== null ? (data as NextData) : undefined;
  } catch {
    return undefined;
  }
}

export function findJsonLdProduct(blocks: unknown[]): JsonLdProduct | undefined {
  const all = blocks.flatMap((block) => (Array.isArray(block) ? block : [block]));
  return all.find(
    (block): block is JsonLdProduct =>
      typeof block === 'object' &&
      block !== null &&
      (block as JsonLdProduct)['@type'] === 'Product',
  );
}

/** The product shown on the page, or undefined (short link, error page…). */
export function productOf(data: NextData | undefined): FanatecProduct | undefined {
  return data?.props?.pageProps?.productData?.productDetail?.items?.[0];
}

/**
 * Full product URL of a short link such as /eu/fr/p/CRD-9040002-WW, built the way the site's
 * own JavaScript does it: /eu/fr/p/{category}/{sku in lowercase}/{url_key}.
 */
export function fullUrlOfShortLink(data: NextData | undefined, pageUrl: URL): URL | undefined {
  const props = data?.props?.pageProps;
  if (!props?.sku || !props.category || !props.url_key) return undefined;
  const [region, language] = pageUrl.pathname.split('/').filter(Boolean);
  if (!region || !language) return undefined;
  const path = [region, language, 'p', props.category, props.sku.toLowerCase(), props.url_key]
    .map(encodeURIComponent)
    .join('/');
  return new URL(`/${path}`, pageUrl);
}

function toPrice(value: unknown, currency: unknown): Price | undefined {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return undefined;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined;
  return { amountCents: Math.round(amount * 100), currency };
}

function stockOf(product: FanatecProduct): { status: StockStatus; signal: string } {
  if (product.not_sellable === true) {
    return { status: 'OUT_OF_STOCK', signal: '__NEXT_DATA__ not_sellable' };
  }
  switch (product.stock_status) {
    case 'IN_STOCK':
      return { status: 'IN_STOCK', signal: '__NEXT_DATA__ stock_status' };
    case 'OUT_OF_STOCK':
      // Out of stock but open to backorders: the site takes orders now for a later delivery.
      return product.backorder?.available === true
        ? { status: 'PREORDER', signal: '__NEXT_DATA__ backorder.available' }
        : { status: 'OUT_OF_STOCK', signal: '__NEXT_DATA__ stock_status' };
    default:
      return {
        status: 'UNKNOWN',
        signal: `__NEXT_DATA__ stock_status=${String(product.stock_status)}`,
      };
  }
}

const LD_AVAILABILITY: Record<string, StockStatus> = {
  instock: 'IN_STOCK',
  limitedavailability: 'IN_STOCK',
  onlineonly: 'IN_STOCK',
  outofstock: 'OUT_OF_STOCK',
  soldout: 'OUT_OF_STOCK',
  discontinued: 'OUT_OF_STOCK',
  preorder: 'PREORDER',
  presale: 'PREORDER',
  backorder: 'PREORDER',
};

function ldStatus(offer: JsonLdOffer | undefined): StockStatus {
  // "https://schema.org/InStock" or "InStock".
  const key = offer?.availability?.split('/').pop()?.toLowerCase();
  return (key && LD_AVAILABILITY[key]) || 'UNKNOWN';
}

function firstImage(
  ld: JsonLdProduct | undefined,
  product: FanatecProduct | undefined,
): string | undefined {
  const ldImage = Array.isArray(ld?.image) ? ld.image[0] : ld?.image;
  // __NEXT_DATA__ only has 96 px thumbnails: JSON-LD has the 1024 px photo.
  return ldImage ?? product?.media_gallery?.[0]?.url ?? product?.image?.url ?? undefined;
}

/** Builds the snapshot from what the page holds. Undefined when it holds no product at all. */
export function readProduct(
  product: FanatecProduct | undefined,
  ld: JsonLdProduct | undefined,
): ProductSnapshot | undefined {
  if (!product && !ld) return undefined;
  const offer = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;

  const snapshot: ProductSnapshot = product
    ? stockOf(product)
    : { status: ldStatus(offer), signal: 'json-ld offers.availability' };

  const title = product?.name?.trim() || ld?.name?.trim();
  if (title) snapshot.title = title;

  const prices = product?.price_range?.minimum_price;
  const price =
    toPrice(prices?.final_price?.value, prices?.final_price?.currency) ??
    toPrice(offer?.price, offer?.priceCurrency);
  if (price) snapshot.price = price;
  const regular = toPrice(prices?.regular_price?.value, prices?.regular_price?.currency);
  if (
    price &&
    regular &&
    regular.currency === price.currency &&
    regular.amountCents > price.amountCents
  ) {
    snapshot.regularPrice = regular;
  }

  const imageUrl = firstImage(ld, product);
  if (imageUrl) snapshot.imageUrl = imageUrl;
  return snapshot;
}
