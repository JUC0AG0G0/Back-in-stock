import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import { Interval, ItemId, Money, Url } from './value-objects.js';

describe('Url', () => {
  it('normalizes the URL and drops the fragment', () => {
    const url = Url.parse('  HTTPS://Fanatec.com/eu/en/refurbished#top ');
    expect(url.value).toBe('https://fanatec.com/eu/en/refurbished');
    expect(url.hostname).toBe('fanatec.com');
    expect(url.equals(Url.parse('https://fanatec.com/eu/en/refurbished'))).toBe(true);
  });

  it('keeps the query string, which can select a variant', () => {
    expect(Url.parse('https://shop.example/p?size=42').value).toBe(
      'https://shop.example/p?size=42',
    );
  });

  it.each(['not a url', 'ftp://shop.example/file', 'javascript:alert(1)', 'file:///etc/passwd'])(
    'rejects %s',
    (input) => {
      expect(() => Url.parse(input)).toThrow(DomainError);
    },
  );
});

describe('Money', () => {
  it('stores cents and an upper-case currency', () => {
    const price = Money.of(1999, 'eur');
    expect(price).toMatchObject({ amountCents: 1999, currency: 'EUR' });
    expect(price.equals(Money.of(1999, 'EUR'))).toBe(true);
    expect(price.equals(Money.of(1999, 'USD'))).toBe(false);
  });

  it.each([
    [19.99, 'EUR'],
    [-1, 'EUR'],
    [100, 'EURO'],
    [100, ''],
  ])('rejects %s %s', (amount, currency) => {
    expect(() => Money.of(amount, currency)).toThrow(DomainError);
  });
});

describe('Interval', () => {
  it.each([
    ['30s', 30],
    ['5m', 300],
    ['1h', 3600],
    ['2d', 172800],
    [' 10 M ', 600],
  ])('parses %s', (input, seconds) => {
    expect(Interval.parse(input).seconds).toBe(seconds);
  });

  it.each(['', '5', '5 minutes', '-5m', '0s', '1.5h'])('rejects "%s"', (input) => {
    expect(() => Interval.parse(input)).toThrow(DomainError);
  });

  it('returns the longest of two intervals', () => {
    expect(Interval.parse('30s').max(Interval.parse('1m')).seconds).toBe(60);
  });
});

describe('ItemId', () => {
  it('trims the id', () => {
    expect(ItemId.of('  SKU-42 ').value).toBe('SKU-42');
  });

  it('rejects empty and very long ids', () => {
    expect(() => ItemId.of('   ')).toThrow(DomainError);
    expect(() => ItemId.of('x'.repeat(513))).toThrow(DomainError);
  });
});
