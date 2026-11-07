import {
  defineNotifierPlugin,
  defineSourcePlugin,
  z,
  type SourcePlugin,
} from '@back-in-stock/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { NotifierRegistry, SourceRegistry } from './registry.js';

function source(
  id: string,
  match: SourcePlugin['match'],
  supports: SourcePlugin['supports'] = ['product', 'listing'],
) {
  return defineSourcePlugin({
    id,
    name: id,
    version: '1.0.0',
    supports,
    match,
    checkProduct: async () => ({ status: 'UNKNOWN' }),
    checkListing: async () => ({ items: [], complete: true }),
  });
}

const fanatec = source('fanatec', (url) => (url.hostname.endsWith('fanatec.com') ? 1 : 0), [
  'listing',
]);
const jsonLd = source('structured-data', () => 0.5, ['product']);
const cssRule = source('css-rule', () => 0.1);

const telegram = defineNotifierPlugin({
  id: 'telegram',
  name: 'Telegram',
  version: '1.0.0',
  configSchema: z.object({ token: z.string(), chatId: z.string() }),
  send: async () => {},
});

describe('SourceRegistry.register', () => {
  it('registers valid plugins and finds them by id', () => {
    const registry = new SourceRegistry();
    expect(registry.register(fanatec)).toEqual({ ok: true, id: 'fanatec' });
    expect(registry.get('fanatec')).toBe(fanatec);
    expect(registry.list()).toEqual([fanatec]);
  });

  it('keeps invalid plugins out and remembers why, without throwing', () => {
    const registry = new SourceRegistry();
    const result = registry.register(
      { id: 'broken', kind: 'source' },
      'back-in-stock-plugin-broken',
    );
    expect(result.ok).toBe(false);
    expect(registry.list()).toEqual([]);
    expect(registry.rejected()).toEqual([
      expect.objectContaining({ origin: 'back-in-stock-plugin-broken', id: 'broken' }),
    ]);
  });

  it('refuses a notifier in the source registry', () => {
    expect(new SourceRegistry().register(telegram)).toEqual({
      ok: false,
      errors: ['kind: expected a source plugin, got a notifier plugin'],
    });
  });

  it('refuses a second plugin with the same id', () => {
    const registry = new SourceRegistry();
    registry.register(fanatec);
    expect(registry.register({ ...fanatec, name: 'Other' }, '/data/plugins/fanatec')).toEqual({
      ok: false,
      errors: ['id: "fanatec" is already registered'],
    });
    expect(registry.get('fanatec')?.name).toBe('fanatec');
  });
});

describe('SourceRegistry.resolve', () => {
  const registry = new SourceRegistry();
  registry.register(cssRule);
  registry.register(jsonLd);
  registry.register(fanatec);
  registry.register(
    source('throws', () => {
      throw new Error('boom');
    }),
  );
  registry.register(source('nan', () => Number.NaN));

  it('prefers the site-specific plugin', () => {
    const match = registry.resolve(new URL('https://fanatec.com/eu/en/refurbished'), 'listing');
    expect(match).toEqual({ plugin: fanatec, score: 1 });
  });

  it('only considers plugins that support the watch type', () => {
    expect(registry.resolve(new URL('https://fanatec.com/eu/p/1'), 'product')?.plugin.id).toBe(
      'structured-data',
    );
  });

  it('falls back to the generic plugin, and ignores plugins whose match() is broken', () => {
    expect(registry.resolve(new URL('https://shop.example/list'), 'listing')?.plugin.id).toBe(
      'css-rule',
    );
  });

  it('returns nothing when no plugin can read the URL', () => {
    const empty = new SourceRegistry();
    empty.register(fanatec);
    expect(empty.resolve(new URL('https://shop.example/'), 'listing')).toBeUndefined();
  });
});

describe('NotifierRegistry', () => {
  it('registers notifiers and refuses sources', () => {
    const registry = new NotifierRegistry();
    expect(registry.register(telegram).ok).toBe(true);
    expect(registry.register(fanatec).ok).toBe(false);
    expect(registry.get('telegram')).toBe(telegram);
  });
});
