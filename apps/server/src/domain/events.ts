import type { ListingItem, Price } from '@back-in-stock/plugin-sdk';

/** Business facts deduced by comparing two checks. They drive notifications. */
export type DomainEvent =
  | { type: 'ProductRestocked'; title?: string; price?: Price; imageUrl?: string }
  | { type: 'ProductOutOfStock'; title?: string }
  | { type: 'ListingItemAdded'; item: ListingItem }
  | { type: 'ListingItemRemoved'; item: ListingItem };

export type DomainEventType = DomainEvent['type'];
