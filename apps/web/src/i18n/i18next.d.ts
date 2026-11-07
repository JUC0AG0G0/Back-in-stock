import type { resources } from '@back-in-stock/i18n';

// Type-safe keys: t('app.tagline') is checked, t('app.typo') does not compile.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: (typeof resources)['en'];
  }
}
