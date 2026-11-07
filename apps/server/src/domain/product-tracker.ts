import type { ProductSnapshot } from '@back-in-stock/plugin-sdk';
import type { DomainEvent } from './events.js';

/**
 * State machine of a `product` watch.
 *
 *   NEW ──first check──▶ OUT_OF_STOCK ◀────────────┐
 *    │                     │  IN_STOCK seen         │ OUT_OF_STOCK
 *    │                     ▼                        │
 *    │                CONFIRMING ──IN_STOCK again──▶ IN_STOCK
 *    │                     │ not confirmed          ▲
 *    │                     └──▶ OUT_OF_STOCK        │
 *    └────────────first check is IN_STOCK───────────┘
 *
 * Rules (SPEC §2 and §5):
 * - The first check is the reference: it never notifies.
 * - A restock is notified only once, after a second check confirms it (unless disabled).
 * - Errors and UNKNOWN never change the state: a broken page is never "in stock".
 * - PREORDER counts as unavailable.
 */
export type ProductPhase = 'NEW' | 'OUT_OF_STOCK' | 'CONFIRMING' | 'IN_STOCK';

export interface ProductState {
  phase: ProductPhase;
}

export const initialProductState: ProductState = { phase: 'NEW' };

export type ProductObservation =
  | { kind: 'snapshot'; snapshot: ProductSnapshot }
  /** The check failed (the plugin threw, timeout, captcha…). */
  | { kind: 'error' };

export interface ProductTrackerOptions {
  /** Re-check before notifying a restock. On by default. */
  confirmRestock: boolean;
}

export interface ProductTransition {
  state: ProductState;
  events: DomainEvent[];
  /** The scheduler must run a confirmation check soon (about 30 s later). */
  confirmationNeeded: boolean;
}

function unchanged(state: ProductState): ProductTransition {
  return { state, events: [], confirmationNeeded: false };
}

function restocked(snapshot: ProductSnapshot): ProductTransition {
  const event: DomainEvent = { type: 'ProductRestocked' };
  if (snapshot.title !== undefined) event.title = snapshot.title;
  if (snapshot.price !== undefined) event.price = snapshot.price;
  if (snapshot.imageUrl !== undefined) event.imageUrl = snapshot.imageUrl;
  return { state: { phase: 'IN_STOCK' }, events: [event], confirmationNeeded: false };
}

export function trackProduct(
  state: ProductState,
  observation: ProductObservation,
  options: ProductTrackerOptions,
): ProductTransition {
  if (observation.kind === 'error') return unchanged(state);

  const { snapshot } = observation;
  if (snapshot.status === 'UNKNOWN') return unchanged(state);

  const inStock = snapshot.status === 'IN_STOCK';

  switch (state.phase) {
    case 'NEW':
      return {
        state: { phase: inStock ? 'IN_STOCK' : 'OUT_OF_STOCK' },
        events: [],
        confirmationNeeded: false,
      };

    case 'OUT_OF_STOCK':
      if (!inStock) return unchanged(state);
      if (!options.confirmRestock) return restocked(snapshot);
      return { state: { phase: 'CONFIRMING' }, events: [], confirmationNeeded: true };

    case 'CONFIRMING':
      if (inStock) return restocked(snapshot);
      // False alarm: back to out of stock, nothing sent.
      return { state: { phase: 'OUT_OF_STOCK' }, events: [], confirmationNeeded: false };

    case 'IN_STOCK': {
      if (inStock) return unchanged(state);
      const event: DomainEvent = { type: 'ProductOutOfStock' };
      if (snapshot.title !== undefined) event.title = snapshot.title;
      return { state: { phase: 'OUT_OF_STOCK' }, events: [event], confirmationNeeded: false };
    }
  }
}
