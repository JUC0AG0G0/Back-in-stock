import type { ListingItem, Price, StockStatus } from '@back-in-stock/plugin-sdk';

/** Stock status as shown to the user once a check succeeded (UNKNOWN is never a state). */
export type ProductStatus = Exclude<StockStatus, 'UNKNOWN'>;

export interface ProductDetails {
  title?: string;
  price?: Price;
  /** Price before discount, when on sale. */
  regularPrice?: Price;
  imageUrl?: string;
}

/** Business facts deduced by comparing two checks. They drive notifications. */
export type DomainEvent =
  /** First successful check of a new watch: confirms alerts are on and gives the current state. */
  | ({ type: 'WatchStarted'; watchType: 'product'; status: ProductStatus } & ProductDetails)
  | { type: 'WatchStarted'; watchType: 'listing'; itemCount: number }
  /** The status changed: restocked (after confirmation), out of stock, or open for preorder. */
  | ({ type: 'ProductRestocked' | 'ProductOutOfStock' | 'ProductPreorder' } & ProductDetails)
  | { type: 'ListingItemAdded'; item: ListingItem }
  | { type: 'ListingItemRemoved'; item: ListingItem };

export type DomainEventType = DomainEvent['type'];
