import type { WatchType } from '@back-in-stock/plugin-sdk';
import { DomainError } from './errors.js';
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
