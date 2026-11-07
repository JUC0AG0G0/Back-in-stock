import type { ListingItem, ListingSnapshot } from '@back-in-stock/plugin-sdk';
import { DomainError } from './errors.js';
import type { DomainEvent } from './events.js';
import { ItemId } from './value-objects.js';

/**
 * Diff of a `listing` watch (e.g. a refurbished page): which items appeared or disappeared.
 *
 * Rules (SPEC §2 and §5):
 * - The first non-empty check is the reference: it sends `WatchStarted` with the item count,
 *   but no `ListingItemAdded` for items that were already there.
 * - An id not currently known gives `ListingItemAdded` (an item coming back after removal counts).
 * - An empty list after a non-empty one is a probable error (block, layout change), not "everything sold".
 * - An item is removed only after missing from `removeAfterMisses` complete checks in a row.
 * - When pagination stopped early (`complete: false`), missing items are not counted as missing.
 */
export interface KnownItem {
  item: ListingItem;
  /** Consecutive complete checks where the item was absent. */
  missingCount: number;
}

export interface ListingState {
  /** False until the reference check has been recorded. */
  baselined: boolean;
  items: ReadonlyMap<string, KnownItem>;
}

export const initialListingState: ListingState = { baselined: false, items: new Map() };

export type ListingObservation =
  { kind: 'snapshot'; snapshot: ListingSnapshot } | { kind: 'error' };

export interface ListingTrackerOptions {
  removeAfterMisses: number;
}

export const defaultListingTrackerOptions: ListingTrackerOptions = { removeAfterMisses: 3 };

export interface ListingTransition {
  state: ListingState;
  events: DomainEvent[];
  /** The check returned nothing although items were known: treat it as a failed check. */
  suspectedError: boolean;
}

function hasValidId(item: ListingItem): boolean {
  try {
    ItemId.of(item.id);
    return true;
  } catch (err) {
    if (err instanceof DomainError) return false;
    throw err;
  }
}

/**
 * Drops items without a usable id and keeps the first occurrence of each id
 * (some pages show the same item twice). Ids are trimmed.
 */
function normalize(items: readonly ListingItem[]): ListingItem[] {
  const seen = new Set<string>();
  const result: ListingItem[] = [];
  for (const item of items) {
    if (!hasValidId(item)) continue;
    const id = item.id.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id === item.id ? item : { ...item, id });
  }
  return result;
}

export function trackListing(
  state: ListingState,
  observation: ListingObservation,
  options: ListingTrackerOptions = defaultListingTrackerOptions,
): ListingTransition {
  const unchanged = (suspectedError: boolean): ListingTransition => ({
    state,
    events: [],
    suspectedError,
  });

  if (observation.kind === 'error') return unchanged(false);

  const current = normalize(observation.snapshot.items);

  if (current.length === 0) {
    // Never use an empty page as reference, and never read it as "everything is gone".
    return unchanged(state.items.size > 0);
  }

  if (!state.baselined) {
    const items = new Map(current.map((item) => [item.id, { item, missingCount: 0 }]));
    return {
      state: { baselined: true, items },
      events: [{ type: 'WatchStarted', watchType: 'listing', itemCount: items.size }],
      suspectedError: false,
    };
  }

  const events: DomainEvent[] = [];
  const next = new Map<string, KnownItem>();
  const currentIds = new Set(current.map((item) => item.id));

  for (const item of current) {
    if (!state.items.has(item.id)) {
      events.push({ type: 'ListingItemAdded', item });
    }
    next.set(item.id, { item, missingCount: 0 });
  }

  for (const [id, known] of state.items) {
    if (currentIds.has(id)) continue;
    if (!observation.snapshot.complete) {
      next.set(id, known);
      continue;
    }
    const missingCount = known.missingCount + 1;
    if (missingCount >= options.removeAfterMisses) {
      events.push({ type: 'ListingItemRemoved', item: known.item });
    } else {
      next.set(id, { item: known.item, missingCount });
    }
  }

  return { state: { baselined: true, items: next }, events, suspectedError: false };
}
