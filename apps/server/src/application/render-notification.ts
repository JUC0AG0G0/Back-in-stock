import { createTranslator, formatPrice, type Locale } from '@back-in-stock/i18n';
import type { NotificationMessage, Price } from '@back-in-stock/plugin-sdk';
import type { TFunction } from 'i18next';
import type { DomainEvent } from '../domain/index.js';

/**
 * Turns a domain event into a message already written in the user's language (SPEC §4).
 * Notifiers only adapt it to their format (Telegram Markdown, email HTML…).
 */
export interface RenderContext {
  locale: Locale;
  watchName: string;
  /** Page of the watch, used when the event has no URL of its own. */
  watchUrl: string;
}

const translators = new Map<Locale, TFunction>();

function translatorFor(locale: Locale): TFunction {
  let t = translators.get(locale);
  if (!t) {
    t = createTranslator(locale);
    translators.set(locale, t);
  }
  return t;
}

export function renderNotification(event: DomainEvent, ctx: RenderContext): NotificationMessage {
  const t = translatorFor(ctx.locale);
  const watch = ctx.watchName;
  const format = (price: Price) => formatPrice(price.amountCents, price.currency, ctx.locale);
  const withPrice = (text: string, price: Price | undefined, regularPrice?: Price) => {
    if (!price) return text;
    const line =
      regularPrice && regularPrice.amountCents > price.amountCents
        ? t('notifications.priceOnSale', {
            price: format(price),
            regularPrice: format(regularPrice),
          })
        : t('notifications.price', { price: format(price) });
    return `${text}\n${line}`;
  };

  const base = { event: event.type, locale: ctx.locale, watchName: watch, url: ctx.watchUrl };

  switch (event.type) {
    case 'WatchStarted': {
      const title = t('notifications.watchStarted.title', { watch });
      if (event.watchType === 'listing') {
        const text = t('notifications.watchStarted.listing', { count: event.itemCount });
        return { ...base, title, text };
      }
      const status = t(`status.${event.status}`);
      return {
        ...base,
        title,
        text: withPrice(
          t('notifications.watchStarted.product', { status }),
          event.price,
          event.regularPrice,
        ),
        ...optional({ price: event.price, imageUrl: event.imageUrl }),
      };
    }

    case 'ProductRestocked':
    case 'ProductOutOfStock':
    case 'ProductPreorder': {
      const key = {
        ProductRestocked: 'productRestocked',
        ProductOutOfStock: 'productOutOfStock',
        ProductPreorder: 'productPreorder',
      }[event.type];
      const product = event.title ?? watch;
      return {
        ...base,
        title: t(`notifications.${key}.title`, { watch }),
        text: withPrice(
          t(`notifications.${key}.text`, { product }),
          event.price,
          event.regularPrice,
        ),
        ...optional({ price: event.price, imageUrl: event.imageUrl }),
      };
    }

    case 'ListingItemAdded':
    case 'ListingItemRemoved': {
      const key = event.type === 'ListingItemAdded' ? 'listingItemAdded' : 'listingItemRemoved';
      const { item } = event;
      return {
        ...base,
        url: item.url,
        title: t(`notifications.${key}.title`, { item: item.title }),
        text: withPrice(t(`notifications.${key}.text`, { watch }), item.price),
        ...optional({ price: item.price, imageUrl: item.imageUrl }),
      };
    }
  }
}

/** Drops undefined values, as required by exactOptionalPropertyTypes. */
function optional<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
