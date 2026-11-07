import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import {
  checkNotificationRules,
  defaultNotificationRules,
  routeEvent,
  type RoutingContext,
} from './notification-routing.js';

const active = new Set(['tg-perso', 'tg-famille', 'mail']);

function ctx(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    rules: defaultNotificationRules,
    watch: { channelIds: ['tg-perso', 'mail'] },
    activeChannelIds: active,
    ...overrides,
  };
}

describe('routeEvent', () => {
  it('sends every event to the channels of the watch by default', () => {
    expect(routeEvent('ProductRestocked', ctx())).toEqual(['tg-perso', 'mail']);
    expect(routeEvent('WatchStarted', ctx())).toEqual(['tg-perso', 'mail']);
  });

  it('applies a global switch, e.g. no notification when a watch is added', () => {
    const rules = { ...defaultNotificationRules, WatchStarted: { enabled: false } };
    expect(routeEvent('WatchStarted', ctx({ rules }))).toEqual([]);
    expect(routeEvent('ProductRestocked', ctx({ rules }))).toEqual(['tg-perso', 'mail']);
  });

  it('applies global channels for one event type', () => {
    const rules = {
      ...defaultNotificationRules,
      WatchStarted: { enabled: true, channelIds: ['mail'] },
    };
    expect(routeEvent('WatchStarted', ctx({ rules }))).toEqual(['mail']);
  });

  it('lets a watch override the global rule in both directions', () => {
    const rules = { ...defaultNotificationRules, ProductOutOfStock: { enabled: false } };
    const watch = {
      channelIds: ['tg-perso'],
      notificationOverrides: {
        ProductOutOfStock: { enabled: true },
        ProductRestocked: { enabled: true, channelIds: ['tg-perso', 'tg-famille'] },
        ProductPreorder: { enabled: false },
      },
    };
    expect(routeEvent('ProductOutOfStock', ctx({ rules, watch }))).toEqual(['tg-perso']);
    expect(routeEvent('ProductRestocked', ctx({ rules, watch }))).toEqual([
      'tg-perso',
      'tg-famille',
    ]);
    expect(routeEvent('ProductPreorder', ctx({ rules, watch }))).toEqual([]);
  });

  it('skips disabled or deleted channels and duplicates', () => {
    const watch = { channelIds: ['tg-perso', 'old-bot', 'tg-perso'] };
    expect(routeEvent('ListingItemAdded', ctx({ watch }))).toEqual(['tg-perso']);
  });
});

describe('checkNotificationRules', () => {
  const known = new Set(['tg-perso', 'mail']);

  it('fills the missing types with the defaults', () => {
    const rules = checkNotificationRules({ WatchStarted: { enabled: false } }, known);
    expect(rules.WatchStarted).toEqual({ enabled: false });
    expect(rules.ListingItemAdded).toEqual({ enabled: true });
  });

  it('rejects unknown event types and unknown channels', () => {
    expect(() => checkNotificationRules({ Restock: { enabled: true } }, known)).toThrow(
      DomainError,
    );
    expect(() =>
      checkNotificationRules({ WatchStarted: { enabled: true, channelIds: ['ghost'] } }, known),
    ).toThrow('Unknown channel(s) for WatchStarted: ghost');
  });
});
