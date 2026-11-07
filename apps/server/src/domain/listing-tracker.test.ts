import type { ListingItem } from '@back-in-stock/plugin-sdk';
import { describe, expect, it } from 'vitest';
import {
  initialListingState,
  trackListing,
  type ListingObservation,
  type ListingState,
} from './listing-tracker.js';

const item = (id: string): ListingItem => ({
  id,
  title: `Item ${id}`,
  url: `https://shop.example/${id}`,
});

const page = (ids: string[], complete = true): ListingObservation => ({
  kind: 'snapshot',
  snapshot: { items: ids.map(item), complete },
});
const error: ListingObservation = { kind: 'error' };

/**
 * Runs a sequence of checks and returns the item events as "Added:a", "Removed:b".
 * WatchStarted is returned apart, as the item count it announced.
 */
function run(observations: ListingObservation[], removeAfterMisses = 3) {
  let state: ListingState = initialListingState;
  const events: string[] = [];
  const suspected: boolean[] = [];
  const started: number[] = [];
  for (const observation of observations) {
    const result = trackListing(state, observation, { removeAfterMisses });
    state = result.state;
    suspected.push(result.suspectedError);
    for (const event of result.events) {
      if (event.type === 'WatchStarted' && event.watchType === 'listing') {
        started.push(event.itemCount);
      }
      if (event.type === 'ListingItemAdded') events.push(`Added:${event.item.id}`);
      if (event.type === 'ListingItemRemoved') events.push(`Removed:${event.item.id}`);
    }
  }
  return { state, events, suspected, started };
}

describe('trackListing', () => {
  it('uses the first check as reference and only sends WatchStarted with the count', () => {
    const { state, events, started } = run([page(['a', 'b']), page(['a', 'b'])]);
    expect(started).toEqual([2]);
    expect(events).toEqual([]);
    expect(state.baselined).toBe(true);
    expect([...state.items.keys()]).toEqual(['a', 'b']);
  });

  it('notifies each new item once', () => {
    expect(run([page(['a']), page(['a', 'b', 'c']), page(['a', 'b', 'c'])]).events).toEqual([
      'Added:b',
      'Added:c',
    ]);
  });

  it('never uses an empty page as reference', () => {
    const { state, events, started } = run([page([]), page(['a', 'b']), page(['a', 'b', 'c'])]);
    expect(started).toEqual([2]);
    expect(events).toEqual(['Added:c']);
    expect(state.items.size).toBe(3);
  });

  it('treats an empty page after a full one as a probable error', () => {
    const { state, events, suspected } = run([page(['a', 'b']), page([]), page(['a', 'b'])]);
    expect(events).toEqual([]);
    expect(suspected).toEqual([false, true, false]);
    expect(state.items.size).toBe(2);
  });

  it('removes an item only after several complete checks without it', () => {
    const checks = [page(['a', 'b']), page(['a']), page(['a']), page(['a'])];
    expect(run(checks).events).toEqual(['Removed:b']);
    expect(run(checks.slice(0, 3)).events).toEqual([]);
  });

  it('resets the missing count when the item shows up again', () => {
    const checks = [page(['a', 'b']), page(['a']), page(['a']), page(['a', 'b']), page(['a'])];
    const { events, state } = run(checks);
    expect(events).toEqual([]);
    expect(state.items.get('b')?.missingCount).toBe(1);
  });

  it('does not count missing items when pagination stopped early', () => {
    const checks = [page(['a', 'b']), page(['a'], false), page(['a'], false), page(['a'], false)];
    expect(run(checks).events).toEqual([]);
  });

  it('notifies an item again when it comes back after being removed', () => {
    const checks = [page(['a', 'b']), page(['a']), page(['a', 'b'])];
    expect(run(checks, 1).events).toEqual(['Removed:b', 'Added:b']);
  });

  it('ignores errors', () => {
    expect(run([page(['a']), error, page(['a', 'b'])]).events).toEqual(['Added:b']);
    expect(run([error]).state).toBe(initialListingState);
  });

  it('dedupes ids, trims them and skips items without an id', () => {
    const messy: ListingObservation = {
      kind: 'snapshot',
      snapshot: { items: [item('a'), item('a'), item(' b '), item('  ')], complete: true },
    };
    const { state, events } = run([page(['a']), messy]);
    expect(events).toEqual(['Added:b']);
    expect([...state.items.keys()]).toEqual(['a', 'b']);
  });

  it('keeps the latest data of a known item (price drop, new title)', () => {
    const cheaper: ListingObservation = {
      kind: 'snapshot',
      snapshot: {
        items: [{ ...item('a'), price: { amountCents: 100, currency: 'EUR' } }],
        complete: true,
      },
    };
    const { state } = run([page(['a']), cheaper]);
    expect(state.items.get('a')?.item.price).toEqual({ amountCents: 100, currency: 'EUR' });
  });
});
