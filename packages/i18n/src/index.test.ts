import { describe, expect, it } from 'vitest';
import { createTranslator, formatPrice, resources, supportedLocales, toLocale } from './index.js';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

describe('locales', () => {
  const reference = resources.en.translation;

  it.each(supportedLocales)('%s has exactly the same keys as en', (locale) => {
    expect(keys(resources[locale].translation).sort()).toEqual(keys(reference).sort());
  });

  it.each(supportedLocales)('%s uses the same {{placeholders}} as en', (locale) => {
    const get = (root: unknown, path: string) =>
      path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], root);
    for (const key of keys(reference)) {
      const text = get(resources[locale].translation, key) as string;
      expect(placeholders(text), key).toEqual(placeholders(get(reference, key) as string));
    }
  });
});

describe('createTranslator', () => {
  it('translates with interpolation and plurals', () => {
    const fr = createTranslator('fr');
    const en = createTranslator('en');
    expect(fr('notifications.productRestocked.title', { watch: 'Fanatec' })).toBe(
      'De retour en stock : Fanatec',
    );
    expect(fr('notifications.watchStarted.listing', { count: 1 })).toMatch(/^1 article visible/);
    expect(fr('notifications.watchStarted.listing', { count: 12 })).toMatch(
      /^12 articles visibles/,
    );
    expect(en('notifications.watchStarted.listing', { count: 12 })).toMatch(/^12 items/);
  });

  it('does not escape HTML: each notifier escapes for its own format', () => {
    expect(createTranslator('en')('notifications.listingItemAdded.title', { item: 'A & B' })).toBe(
      'New item: A & B',
    );
  });
});

describe('toLocale', () => {
  it.each([
    ['fr-FR', 'fr'],
    ['FR', 'fr'],
    ['en_US', 'en'],
    ['de-DE', 'en'],
    [undefined, 'en'],
  ])('%s → %s', (input, expected) => {
    expect(toLocale(input)).toBe(expected);
  });
});

describe('formatPrice', () => {
  it('formats cents in the language of the user', () => {
    expect(formatPrice(34995, 'EUR', 'fr')).toBe('349,95 €');
    expect(formatPrice(34995, 'EUR', 'en')).toBe('€349.95');
  });
});
