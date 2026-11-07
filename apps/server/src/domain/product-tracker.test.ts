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

const seen = (status: StockStatus): ProductObservation => ({
  kind: 'snapshot',
  snapshot: { status, title: 'Volant CSL DD', price: { amountCents: 34995, currency: 'EUR' } },
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

describe('trackProduct', () => {
  it('uses the first check as reference without notifying', () => {
    expect(run([seen('OUT_OF_STOCK')])).toEqual({ state: { phase: 'OUT_OF_STOCK' }, events: [] });
    expect(run([seen('IN_STOCK')])).toEqual({ state: { phase: 'IN_STOCK' }, events: [] });
  });

  it('asks for a confirmation check before notifying a restock', () => {
    const first = trackProduct({ phase: 'OUT_OF_STOCK' }, seen('IN_STOCK'), confirm);
    expect(first).toEqual({ state: { phase: 'CONFIRMING' }, events: [], confirmationNeeded: true });

    const second = trackProduct(first.state, seen('IN_STOCK'), confirm);
    expect(second.state.phase).toBe('IN_STOCK');
    expect(second.events).toEqual([
      {
        type: 'ProductRestocked',
        title: 'Volant CSL DD',
        price: { amountCents: 34995, currency: 'EUR' },
      },
    ]);
  });

  it('sends nothing when the confirmation check does not see the stock', () => {
    expect(run([seen('OUT_OF_STOCK'), seen('IN_STOCK'), seen('OUT_OF_STOCK')])).toEqual({
      state: { phase: 'OUT_OF_STOCK' },
      events: [],
    });
  });

  it('notifies at once when confirmation is disabled', () => {
    expect(run([seen('OUT_OF_STOCK'), seen('IN_STOCK')], noConfirm).events).toEqual([
      'ProductRestocked',
    ]);
  });

  it('notifies a restock only once while it stays in stock', () => {
    const checks = [seen('OUT_OF_STOCK'), seen('IN_STOCK'), seen('IN_STOCK'), seen('IN_STOCK')];
    expect(run(checks).events).toEqual(['ProductRestocked']);
  });

  it('notifies again after an out-of-stock period', () => {
    const checks = [
      seen('OUT_OF_STOCK'),
      seen('IN_STOCK'),
      seen('IN_STOCK'),
      seen('OUT_OF_STOCK'),
      seen('IN_STOCK'),
      seen('IN_STOCK'),
    ];
    expect(run(checks).events).toEqual([
      'ProductRestocked',
      'ProductOutOfStock',
      'ProductRestocked',
    ]);
  });

  it('never changes the state on errors or UNKNOWN', () => {
    for (const phase of ['NEW', 'OUT_OF_STOCK', 'CONFIRMING', 'IN_STOCK'] as const) {
      for (const observation of [error, seen('UNKNOWN')]) {
        expect(trackProduct({ phase }, observation, confirm)).toEqual({
          state: { phase },
          events: [],
          confirmationNeeded: false,
        });
      }
    }
  });

  it('does not let errors between two "in stock" checks skip the confirmation', () => {
    expect(run([seen('OUT_OF_STOCK'), error, seen('IN_STOCK'), error]).state.phase).toBe(
      'CONFIRMING',
    );
  });

  it('treats PREORDER as unavailable', () => {
    expect(run([seen('OUT_OF_STOCK'), seen('PREORDER')]).state.phase).toBe('OUT_OF_STOCK');
    expect(run([seen('IN_STOCK'), seen('PREORDER')]).events).toEqual(['ProductOutOfStock']);
  });
});
