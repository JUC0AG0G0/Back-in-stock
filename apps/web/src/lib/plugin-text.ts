import { useTranslation } from 'react-i18next';
import type { NotifierInfo } from './api';

/** Fills `{{name}}` placeholders, e.g. in "https://t.me/{{botUsername}}". */
export function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match);
}

/**
 * Texts shipped by a plugin (SPEC §7ter): current language, then English, then the key.
 * Returns undefined for a missing key when `optional` is set, e.g. for help texts.
 */
export function usePluginText(notifier: NotifierInfo | undefined) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  function pt(key: string): string;
  function pt(key: string, optional: true): string | undefined;
  function pt(key: string, optional?: true): string | undefined {
    const text = notifier?.translations[lang]?.[key] ?? notifier?.translations.en?.[key];
    return text ?? (optional ? undefined : key);
  }
  return pt;
}
