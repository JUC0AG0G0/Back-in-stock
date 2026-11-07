import { createInstance, type TFunction } from 'i18next';
import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };

/**
 * Texts of the app in every supported language (SPEC §7ter).
 * To add a language: copy locales/en.json, translate it, and add it below.
 * A test checks that every language has exactly the same keys.
 */
export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

export type Locale = keyof typeof resources;

export const supportedLocales = Object.keys(resources) as Locale[];

/** Used when the user's language is not supported. */
export const fallbackLocale: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (supportedLocales as string[]).includes(value);
}

/** "fr-FR" → "fr", unknown → fallback. */
export function toLocale(value: string | undefined): Locale {
  const base = (value ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  return isLocale(base) ? base : fallbackLocale;
}

/** A translation function for one language, for the server (notifications, emails). */
export function createTranslator(locale: Locale): TFunction {
  const instance = createInstance();
  void instance.init({
    resources,
    lng: locale,
    fallbackLng: fallbackLocale,
    // Resources are bundled: initialize synchronously so `t` works right away.
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance.t.bind(instance);
}

/** Formats cents in the user's language, e.g. 34995 EUR → "349,95 €" (fr) or "€349.95" (en). */
export function formatPrice(amountCents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountCents / 100);
}
