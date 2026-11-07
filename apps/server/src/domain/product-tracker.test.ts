import type { StockStatus } from '@back-in-stock/plugin-sdk';
import { describe, expect, it } from 'vitest';
import {
  initialProductState,
  trackProduct,
  type ProductObservation,
  type ProductState,
  type ProductTrackerOptions,
} from './product-tracker.js';

const confirm: ProductTrackerOptions = { confirmRestock: true };
const noConfirm: ProductTrackerOptions = { confirmRestock: false };

const price = { amountCents: 34995, currency: 'EUR' };
const seen = (status: StockStatus): ProductObservation => ({
  kind: 'snapshot',
  snapshot: { status, title: 'Volant CSL DD', price },
});
const error: ProductObservation = { kind: 'error' };

/** Runs a sequence of checks and returns every event type, in order. */
function run(observations: ProductObservation[], options = confirm) {
  let state: ProductState = initialProductState;
  const events: string[] = [];
  for (const observation of observations) {
    const result = trackProduct(state, observation, options);
    state = result.state;
    events.push(...result.events.map((event) => event.type));
  }
  return { state, events };
}

describe('trackProduct: first check', () => {
  it.each(['OUT_OF_STOCK', 'IN_STOCK', 'PREORDER'] as const)(
    'sends WatchStarted with the current state (%s), without confirmation',
    (status) => {
      const result = trackProduct(initialProductState, seen(status), confirm);
      expect(result).toEqual({
        state: { phase: status },
        events: [
          {
            type: 'WatchStarted',
            watchType: 'product',
            status,
            title: 'Volant CSL DD',
            price,
          },
        ],
        confirmationNeeded: false,
      });
    },
  );

  it('waits for a successful check before sending WatchStarted', () => {
    expect(run([error, seen('UNKNOWN'), error])).toEqual({
      state: { phase: 'NEW' },
      events: [],
    });
    expect(run([error, seen('OUT_OF_STOCK')]).events).toEqual(['WatchStarted']);
  });
});

describe('trackProduct: restock', () => {
  it('asks for a confirmation check before notifying', () => {
    const first = trackProduct({ phase: 'OUT_OF_STOCK' }, seen('IN_STOCK'), confirm);
    expect(first).toEqual({
      state: { phase: 'CONFIRMING', previous: 'OUT_OF_STOCK' },
      events: [],
      confirmationNeeded: true,
    });

    const second = trackProduct(first.state, seen('IN_STOCK'), confirm);
    expect(second.state).toEqual({ phase: 'IN_STOCK' });
    expect(second.events).toEqual([{ type: 'ProductRestocked', title: 'Volant CSL DD', price }]);
  });

  it('sends nothing when the confirmation check does not see the stock', () => {
    expect(run([seen('OUT_OF_STOCK'), seen('IN_STOCK'), seen('OUT_OF_STOCK')])).toEqual({
      state: { phase: 'OUT_OF_STOCK' },
      events: ['WatchStarted'],
    });
  });

  it('notifies at once when confirmation is disabled', () => {
    expect(run([seen('OUT_OF_STOCK'), seen('IN_STOCK')], noConfirm).events).toEqual([
      'WatchStarted',
      'ProductRestocked',
    ]);
  });

  it('notifies once while it stays in stock', () => {
    const checks = [seen('OUT_OF_STOCK'), seen('IN_STOCK'), seen('IN_STOCK'), seen('IN_STOCK')];
    expect(run(checks).events).toEqual(['WatchStarted', 'ProductRestocked']);
  });

  it('also confirms a restock coming from preorder', () => {
    expect(run([seen('PREORDER'), seen('IN_STOCK'), seen('IN_STOCK')]).events).toEqual([
      'WatchStarted',
      'ProductRestocked',
    ]);
  });

  it('does not let errors between two "in stock" checks skip the confirmation', () => {
    expect(run([seen('OUT_OF_STOCK'), error, seen('IN_STOCK'), error]).state.phase).toBe(
      'CONFIRMING',
    );
  });
});

describe('trackProduct: every status change', () => {
  it('notifies each change once, in both directions', () => {
    const checks = [
      seen('IN_STOCK'),
      seen('OUT_OF_STOCK'),
      seen('OUT_OF_STOCK'),
      seen('PREORDER'),
      seen('PREORDER'),
      seen('OUT_OF_STOCK'),
      seen('IN_STOCK'),
      seen('IN_STOCK'),
      seen('PREORDER'),
    ];
    expect(run(checks).events).toEqual([
      'WatchStarted',
      'ProductOutOfStock',
      'ProductPreorder',
      'ProductOutOfStock',
      'ProductRestocked',
      'ProductPreorder',
    ]);
  });

  it('notifies a change seen instead of the expected confirmation', () => {
    const { state, events } = run([seen('OUT_OF_STOCK'), seen('IN_STOCK'), seen('PREORDER')]);
    expect(state).toEqual({ phase: 'PREORDER' });
    expect(events).toEqual(['WatchStarted', 'ProductPreorder']);
  });

  it('never changes the state on errors or UNKNOWN', () => {
    const states: ProductState[] = [
      { phase: 'NEW' },
      { phase: 'OUT_OF_STOCK' },
      { phase: 'PREORDER' },
      { phase: 'IN_STOCK' },
      { phase: 'CONFIRMING', previous: 'OUT_OF_STOCK' },
    ];
    for (const state of states) {
      for (const observation of [error, seen('UNKNOWN')]) {
        expect(trackProduct(state, observation, confirm)).toEqual({
          state,
          events: [],
          confirmationNeeded: false,
        });
      }
    }
  });
});
