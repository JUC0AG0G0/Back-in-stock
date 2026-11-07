import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineNotifierPlugin, defineSourcePlugin } from './define.js';
import { SDK_API_VERSION } from './version.js';
import { validatePlugin } from './validate.js';
import { z } from 'zod';

const source = defineSourcePlugin({
  id: 'example-shop',
  name: 'Example Shop',
  version: '1.0.0',
  supports: ['product', 'listing'],
  match: (url) => (url.hostname === 'shop.example' ? 1 : 0),
  checkProduct: async () => ({ status: 'IN_STOCK' }),
  checkListing: async () => ({ items: [], complete: true }),
});

const notifier = defineNotifierPlugin({
  id: 'example-notifier',
  name: 'Example notifier',
  version: '0.1.0',
  configSchema: z.object({ token: z.string() }),
  send: async () => {},
});

function errorsOf(value: unknown): string[] {
  const result = validatePlugin(value);
  return result.ok ? [] : result.errors;
}

describe('define helpers', () => {
  it('stamp the kind and the API version', () => {
    expect(source.kind).toBe('source');
    expect(notifier.kind).toBe('notifier');
    expect(source.apiVersion).toBe(SDK_API_VERSION);
    expect(notifier.apiVersion).toBe(SDK_API_VERSION);
  });
});

describe('validatePlugin', () => {
  it('accepts valid source and notifier plugins', () => {
    expect(validatePlugin(source)).toEqual({ ok: true, plugin: source });
    expect(validatePlugin(notifier)).toEqual({ ok: true, plugin: notifier });
  });

  it('rejects values that are not plugins without throwing', () => {
    for (const value of [undefined, null, 42, 'telegram', {}, []]) {
      expect(validatePlugin(value).ok).toBe(false);
    }
  });

  it('rejects a plugin built for another API version', () => {
    expect(errorsOf({ ...source, apiVersion: SDK_API_VERSION + 1 })).toEqual([
      `apiVersion: built for plugin API v${SDK_API_VERSION + 1}, this app supports v${SDK_API_VERSION}`,
    ]);
  });

  it('requires a kebab-case id and a semver version', () => {
    expect(errorsOf({ ...source, id: 'Example Shop', version: 'v1' })).toEqual([
      'id: must be kebab-case (lowercase letters, digits, dashes)',
      'version: must be a semver version like 1.0.0',
    ]);
  });

  it('requires a check function for each supported watch type', () => {
    const { checkListing: _omitted, ...productOnly } = source;
    expect(errorsOf(productOnly)).toEqual([
      'checkListing: required when supports includes "listing"',
    ]);
    expect(validatePlugin({ ...productOnly, supports: ['product'] }).ok).toBe(true);
  });

  it('requires a Zod config schema and a send function for notifiers', () => {
    expect(errorsOf({ ...notifier, configSchema: { token: 'string' }, send: 'nope' })).toEqual([
      'configSchema: must be a Zod schema',
      'send: must be a function',
    ]);
  });
});

describe('typing', () => {
  it('infers the config type from configSchema', () => {
    const plugin = defineNotifierPlugin({
      id: 'typed',
      name: 'Typed',
      version: '1.0.0',
      configSchema: z.object({ chatId: z.number() }),
      send: async (ctx) => {
        expectTypeOf(ctx.config).toEqualTypeOf<{ chatId: number }>();
      },
    });
    expectTypeOf(plugin.configSchema).toExtend<z.ZodType<{ chatId: number }>>();
  });
});
