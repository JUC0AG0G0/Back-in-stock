import { fallbackLocale, resources, supportedLocales, toLocale } from '@back-in-stock/i18n';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

/** localStorage key that remembers the language picked in the switcher. */
export const LANGUAGE_STORAGE_KEY = 'bis.language';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: supportedLocales,
    nonExplicitSupportedLngs: true, // "fr-FR" → "fr"
    fallbackLng: fallbackLocale,
    // Texts are bundled: no loading state, `t` works on first render.
    initAsync: false,
    interpolation: { escapeValue: false }, // React already escapes.
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

// Keep <html lang> in sync for screen readers and the browser's spellcheck.
function syncHtmlLang(lng: string) {
  document.documentElement.lang = toLocale(lng);
}
syncHtmlLang(i18n.resolvedLanguage ?? fallbackLocale);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
