import type { SourceMatch, WatchType } from './api';

/**
 * The link in what was pasted or typed: the first http(s) URL in the text, or a bare
 * domain such as "www.fanatec.com/eu" completed with https://. Undefined when there is none.
 */
export function extractUrl(text: string): string | undefined {
  const found = /https?:\/\/[^\s<>"']+/i.exec(text)?.[0];
  const candidate = found ?? text.trim();
  if (candidate === '' || /\s/.test(candidate)) return undefined;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    // A bare word ("hello") is not a link: ask for a dot in the host.
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Words in a path that usually mean a page listing several items (category, search, refurbished…). */
const LISTING_HINTS =
  /(^|[/_\-.])(refurbished|reconditionn\w*|occasion|outlet|deals?|soldes|collections?|categor(y|ies|ie)|search|recherche|catalog(ue)?|c|cat|list|liste)($|[/_\-.?])/i;

/**
 * Watch type pre-selected in the dialog. When only one type can be read by a plugin, that one.
 * Otherwise a listing for paths that look like a list of items, a product for the rest.
 */
export function guessWatchType(match: Pick<SourceMatch, 'url' | 'suggested'>): WatchType {
  const { product, listing } = match.suggested;
  if (listing && !product) return 'listing';
  if (product && !listing) return 'product';
  const url = new URL(match.url);
  return LISTING_HINTS.test(url.pathname) || url.searchParams.has('q') ? 'listing' : 'product';
}
