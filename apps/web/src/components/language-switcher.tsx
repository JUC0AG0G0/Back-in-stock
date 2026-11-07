import { supportedLocales, toLocale, type Locale } from '@back-in-stock/i18n';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Each language is shown in its own name, so anyone can find theirs. */
const languageNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
};

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = toLocale(i18n.resolvedLanguage);

  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">{t('app.language')}</span>
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-foreground"
        value={current}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
      >
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale}>
            {languageNames[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
