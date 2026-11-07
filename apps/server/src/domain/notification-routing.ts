import { DomainError } from './errors.js';
import type { DomainEventType } from './events.js';

/**
 * Where each kind of notification goes (SPEC §2 "Channel").
 *
 * - Global settings give, for each event type, whether it is sent and to which channels.
 * - Each watch can override any event type.
 * - A rule without `channelIds` sends to the watch's own channels.
 * - Disabled or deleted channels are skipped.
 *
 * Example: "WatchStarted" off globally, "ProductRestocked" also sent to an extra Telegram
 * channel for one watch only.
 */
export interface NotificationRule {
  enabled: boolean;
  /** Undefined: the channels selected on the watch. */
  channelIds?: readonly string[];
}

export type NotificationRules = Record<DomainEventType, NotificationRule>;

export type NotificationOverrides = Partial<Record<DomainEventType, NotificationRule>>;

export const EVENT_TYPES = [
  'WatchStarted',
  'ProductRestocked',
  'ProductOutOfStock',
  'ProductPreorder',
  'ListingItemAdded',
  'ListingItemRemoved',
] as const satisfies readonly DomainEventType[];

/** Out of the box, everything is sent to the channels of the watch. */
export const defaultNotificationRules: NotificationRules = Object.fromEntries(
  EVENT_TYPES.map((type) => [type, { enabled: true }]),
) as NotificationRules;

export interface RoutingContext {
  /** Global settings. */
  rules: NotificationRules;
  watch: { channelIds: readonly string[]; notificationOverrides?: NotificationOverrides };
  /** Channels that exist and are enabled. */
  activeChannelIds: ReadonlySet<string>;
}

/** Returns the channels an event must be delivered to, without duplicates. Empty: not sent. */
export function routeEvent(type: DomainEventType, ctx: RoutingContext): string[] {
  const rule = ctx.watch.notificationOverrides?.[type] ?? ctx.rules[type];
  if (!rule.enabled) return [];
  const targets = rule.channelIds ?? ctx.watch.channelIds;
  return [...new Set(targets)].filter((id) => ctx.activeChannelIds.has(id));
}

/** Validates a rule set read from settings or from the API: every type, known channels. */
export function checkNotificationRules(
  rules: Partial<Record<string, NotificationRule>>,
  knownChannelIds: ReadonlySet<string>,
): NotificationRules {
  const result = { ...defaultNotificationRules };
  for (const [type, rule] of Object.entries(rules)) {
    if (!(EVENT_TYPES as readonly string[]).includes(type)) {
      throw new DomainError(`Unknown notification type: ${type}`);
    }
    if (rule === undefined) continue;
    const unknown = (rule.channelIds ?? []).filter((id) => !knownChannelIds.has(id));
    if (unknown.length > 0) {
      throw new DomainError(`Unknown channel(s) for ${type}: ${unknown.join(', ')}`);
    }
    result[type as DomainEventType] = rule;
  }
  return result;
}
