import { describe, expect, it } from 'vitest';
import { extractUrl, guessWatchType } from './url';

describe('extractUrl', () => {
  it('keeps a plain link', () => {
    expect(extractUrl(' https://www.fanatec.com/eu/fr/p/abc ')).toBe(
      'https://www.fanatec.com/eu/fr/p/abc',
    );
  });

  it('finds the link inside a shared text', () => {
    expect(extractUrl('Regarde ça : https://shop.example/p/1?ref=x merci')).toBe(
      'https://shop.example/p/1?ref=x',
    );
  });

  it('adds https:// to a bare domain', () => {
    expect(extractUrl('www.fanatec.com/eu')).toBe('https://www.fanatec.com/eu');
  });

  it('ignores text that is not a link', () => {
    expect(extractUrl('')).toBeUndefined();
    expect(extractUrl('bonjour')).toBeUndefined();
    expect(extractUrl('deux mots')).toBeUndefined();
    expect(extractUrl('ftp://example.com/file')).toBeUndefined();
  });
});

describe('guessWatchType', () => {
  const both = { product: 'a', listing: 'b' };

  it('follows the only type a plugin can read', () => {
    expect(guessWatchType({ url: 'https://x.example/p/1', suggested: { listing: 'b' } })).toBe(
      'listing',
    );
    expect(guessWatchType({ url: 'https://x.example/outlet', suggested: { product: 'a' } })).toBe(
      'product',
    );
  });

  it('reads the path when both types are possible', () => {
    expect(
      guessWatchType({ url: 'https://www.fanatec.com/eu/fr/refurbished', suggested: both }),
    ).toBe('listing');
    expect(guessWatchType({ url: 'https://shop.example/collections/new', suggested: both })).toBe(
      'listing',
    );
    expect(guessWatchType({ url: 'https://shop.example/search?q=gpu', suggested: both })).toBe(
      'listing',
    );
    expect(guessWatchType({ url: 'https://shop.example/products/csl-dd', suggested: both })).toBe(
      'product',
    );
  });
});
