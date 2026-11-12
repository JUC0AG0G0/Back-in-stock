import type { WatchType } from '@back-in-stock/plugin-sdk';
import { DomainError } from './errors.js';
import type { NotificationOverrides } from './notification-routing.js';
import { Interval, Url } from './value-objects.js';

/** A monitored URL (SPEC §2). */
export interface Watch {
  id: string;
  type: WatchType;
  url: Url;
  name: string;
  /** Source plugin id, e.g. "fanatec". */
  sourceId: string;
  /** Null: follows the global default interval, including its later changes. */
  interval: Interval | null;
  active: boolean;
  confirmRestock: boolean;
  channelIds: readonly string[];
  /** Per watch exceptions to the global notification rules. */
  notificationOverrides: NotificationOverrides;
}

export interface NewWatch {
  id: string;
  type: WatchType;
  url: string;
  name?: string;
  sourceId: string;
  intervalSeconds?: number | null;
  active?: boolean;
  confirmRestock?: boolean;
  channelIds?: readonly string[];
  notificationOverrides?: NotificationOverrides;
}

export function createWatch(input: NewWatch): Watch {
  const url = Url.parse(input.url);
  const name = (input.name ?? '').trim() || url.hostname;
  if (input.sourceId.trim() === '') {
    throw new DomainError('A watch needs a source plugin');
  }
  return {
    id: input.id,
    type: input.type,
    url,
    name,
    sourceId: input.sourceId,
    interval: input.intervalSeconds == null ? null : Interval.ofSeconds(input.intervalSeconds),
    active: input.active ?? true,
    confirmRestock: input.confirmRestock ?? true,
    channelIds: [...new Set(input.channelIds ?? [])],
    notificationOverrides: input.notificationOverrides ?? {},
  };
}

/**
 * Interval actually used for a watch: its own, or the global default,
 * never below the global floor (BIS_MIN_INTERVAL) to protect the shops.
 */
export function effectiveInterval(
  watch: Watch,
  globalDefault: Interval,
  floor: Interval,
): Interval {
  return (watch.interval ?? globalDefault).max(floor);
}

/**
 * Bounds of a per watch interval, in seconds. The floor is the default BIS_MIN_INTERVAL
 * (1 min, SPEC §6), the ceiling a week.
 */
export const WATCH_INTERVAL_LIMITS = { min: 60, max: 7 * 24 * 3600 } as const;

/** What the edit panel of a watch can change. Missing fields stay as they are. */
export interface WatchChanges {
  name?: string;
  active?: boolean;
  channelIds?: readonly string[];
  /** Null: back to the global default interval. */
  intervalSeconds?: number | null;
}

export function updateWatch(watch: Watch, changes: WatchChanges): Watch {
  const { intervalSeconds } = changes;
  if (
    intervalSeconds != null &&
    (intervalSeconds < WATCH_INTERVAL_LIMITS.min || intervalSeconds > WATCH_INTERVAL_LIMITS.max)
  ) {
    throw new DomainError(
      `Interval must be between ${WATCH_INTERVAL_LIMITS.min} and ${WATCH_INTERVAL_LIMITS.max} seconds`,
    );
  }
  const name = changes.name?.trim();
  return {
    ...watch,
    ...(name ? { name } : {}),
    ...(changes.active === undefined ? {} : { active: changes.active }),
    ...(changes.channelIds === undefined ? {} : { channelIds: [...new Set(changes.channelIds)] }),
    ...(intervalSeconds === undefined
      ? {}
      : { interval: intervalSeconds === null ? null : Interval.ofSeconds(intervalSeconds) }),
  };
}
