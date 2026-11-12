import type { ProductSnapshot } from '@back-in-stock/plugin-sdk';
import type { DomainEvent, ProductDetails, ProductStatus } from './events.js';

/**
 * State machine of a `product` watch.
 *
 *   NEW ──first successful check──▶ OUT_OF_STOCK | PREORDER | IN_STOCK   (WatchStarted)
 *
 *   OUT_OF_STOCK ◀──────────▶ PREORDER            (ProductOutOfStock / ProductPreorder)
 *        │    ▲                   │
 *        │    └── not confirmed ──┤
 *        └──IN_STOCK──▶ CONFIRMING ◀──IN_STOCK──┘
 *                          │ IN_STOCK again
 *                          ▼
 *                       IN_STOCK ──OUT_OF_STOCK / PREORDER──▶ (ProductOutOfStock / ProductPreorder)
 *
 * Rules (SPEC §2 and §5):
 * - The first successful check sends `WatchStarted` with the current state, so the user
 *   knows alerts are on. Its state is taken as is, without confirmation.
 * - Every later change of status is notified once.
 * - A restock is notified only after a second check confirms it (unless disabled).
 * - Errors and UNKNOWN never change the state: a broken page is never "in stock".
 */
export type ProductPhase = 'NEW' | ProductStatus | 'CONFIRMING';

export type ProductState =
  | { phase: 'NEW' | ProductStatus }
  /** A restock was seen once and waits for its confirmation check. */
  | { phase: 'CONFIRMING'; previous: Exclude<ProductStatus, 'IN_STOCK'> };

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

function details(snapshot: ProductSnapshot): ProductDetails {
  const result: ProductDetails = {};
  if (snapshot.title !== undefined) result.title = snapshot.title;
  if (snapshot.price !== undefined) result.price = snapshot.price;
  if (snapshot.regularPrice !== undefined) result.regularPrice = snapshot.regularPrice;
  if (snapshot.imageUrl !== undefined) result.imageUrl = snapshot.imageUrl;
  return result;
}

const CHANGE_EVENT = {
  IN_STOCK: 'ProductRestocked',
  OUT_OF_STOCK: 'ProductOutOfStock',
  PREORDER: 'ProductPreorder',
} as const satisfies Record<ProductStatus, DomainEvent['type']>;

function changedTo(status: ProductStatus, snapshot: ProductSnapshot): ProductTransition {
  return {
    state: { phase: status },
    events: [{ type: CHANGE_EVENT[status], ...details(snapshot) }],
    confirmationNeeded: false,
  };
}

export function trackProduct(
  state: ProductState,
  observation: ProductObservation,
  options: ProductTrackerOptions,
): ProductTransition {
  const unchanged: ProductTransition = { state, events: [], confirmationNeeded: false };

  if (observation.kind === 'error') return unchanged;
  const { snapshot } = observation;
  if (snapshot.status === 'UNKNOWN') return unchanged;
  const status: ProductStatus = snapshot.status;

  switch (state.phase) {
    case 'NEW':
      return {
        state: { phase: status },
        events: [{ type: 'WatchStarted', watchType: 'product', status, ...details(snapshot) }],
        confirmationNeeded: false,
      };

    case 'CONFIRMING':
      if (status === 'IN_STOCK') return changedTo('IN_STOCK', snapshot);
      // Not confirmed: nothing was sent, so going back needs no notification either.
      if (status === state.previous) return { ...unchanged, state: { phase: status } };
      return changedTo(status, snapshot);

    case 'IN_STOCK':
    case 'OUT_OF_STOCK':
    case 'PREORDER':
      if (status === state.phase) return unchanged;
      if (status === 'IN_STOCK' && options.confirmRestock) {
        return {
          state: { phase: 'CONFIRMING', previous: state.phase as 'OUT_OF_STOCK' | 'PREORDER' },
          events: [],
          confirmationNeeded: true,
        };
      }
      return changedTo(status, snapshot);
  }
}
