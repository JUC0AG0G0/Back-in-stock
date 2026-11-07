import { describe, expect, it } from 'vitest';
import { renderNotification, type RenderContext } from './render-notification.js';

const fr: RenderContext = {
  locale: 'fr',
  watchName: 'Fanatec reconditionné',
  watchUrl: 'https://fanatec.com/eu/fr/refurbished',
};
const en: RenderContext = { ...fr, locale: 'en' };
const price = { amountCents: 34995, currency: 'EUR' };

describe('renderNotification', () => {
  it('announces a new product watch with its current status', () => {
    const message = renderNotification(
      { type: 'WatchStarted', watchType: 'product', status: 'OUT_OF_STOCK', price },
      fr,
    );
    expect(message).toEqual({
      event: 'WatchStarted',
      locale: 'fr',
      watchName: 'Fanatec reconditionné',
      url: 'https://fanatec.com/eu/fr/refurbished',
      title: 'Alertes activées : Fanatec reconditionné',
      text: 'Statut actuel : en rupture.\nPrix : 349,95 €',
      price,
    });
  });

  it('announces a new listing watch with the number of items', () => {
    const message = renderNotification(
      { type: 'WatchStarted', watchType: 'listing', itemCount: 12 },
      en,
    );
    expect(message.title).toBe('Alerts on: Fanatec reconditionné');
    expect(message.text).toBe('12 items currently listed. You will be told about new ones.');
  });

  it('writes each status change in the user language', () => {
    const event = { title: 'ClubSport DD+', price, imageUrl: 'https://img.example/dd.jpg' };
    expect(renderNotification({ type: 'ProductRestocked', ...event }, fr)).toMatchObject({
      title: 'De retour en stock : Fanatec reconditionné',
      text: 'ClubSport DD+ est de nouveau disponible.\nPrix : 349,95 €',
      imageUrl: 'https://img.example/dd.jpg',
    });
    expect(renderNotification({ type: 'ProductOutOfStock', ...event }, en).title).toBe(
      'Out of stock: Fanatec reconditionné',
    );
    expect(renderNotification({ type: 'ProductPreorder', ...event }, en).text).toBe(
      'ClubSport DD+ is available for preorder.\nPrice: €349.95',
    );
  });

  it('falls back to the watch name when the product has no title', () => {
    expect(renderNotification({ type: 'ProductRestocked' }, en).text).toBe(
      'Fanatec reconditionné is available again.',
    );
  });

  it('links a new listing item to its own page', () => {
    const item = {
      id: 'sku-1',
      title: 'CSL DD (B-Stock)',
      url: 'https://fanatec.com/p/sku-1',
      price,
    };
    expect(renderNotification({ type: 'ListingItemAdded', item }, fr)).toMatchObject({
      url: 'https://fanatec.com/p/sku-1',
      title: 'Nouvel article : CSL DD (B-Stock)',
      text: 'Nouveau sur Fanatec reconditionné.\nPrix : 349,95 €',
    });
    expect(renderNotification({ type: 'ListingItemRemoved', item }, en).title).toBe(
      'Item removed: CSL DD (B-Stock)',
    );
  });
});
