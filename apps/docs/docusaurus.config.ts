import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const repoUrl = 'https://github.com/JUC0AG0G0/Back-in-stock';

const config: Config = {
  title: 'Back in stock !',
  tagline: 'Sois prévenu dès qu’un produit revient en stock.',
  favicon: 'img/favicon.svg',

  // GitHub Pages: https://juc0ag0g0.github.io/Back-in-stock/
  url: 'https://juc0ag0g0.github.io',
  baseUrl: '/Back-in-stock/',
  organizationName: 'JUC0AG0G0',
  projectName: 'Back-in-stock',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: { hooks: { onBrokenMarkdownLinks: 'throw' } },

  // French is the default language (served at /), English is served at /en/.
  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en'],
    localeConfigs: {
      fr: { label: 'Français', htmlLang: 'fr' },
      en: { label: 'English', htmlLang: 'en' },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // Docs live at the root (/getting-started…); src/pages/index.tsx is the home page.
          sidebarPath: './sidebars.ts',
          editUrl: `${repoUrl}/edit/main/apps/docs/`,
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'Back in stock !',
      logo: { alt: '', src: 'img/favicon.svg' },
      items: [
        { type: 'doc', docId: 'intro', label: 'Documentation', position: 'left' },
        { type: 'localeDropdown', position: 'right' },
        { href: repoUrl, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Démarrage rapide', to: '/getting-started' },
            { label: 'Écrire un plugin', to: '/plugins/overview' },
          ],
        },
        {
          title: 'Projet',
          items: [
            { label: 'GitHub', href: repoUrl },
            { label: 'Releases', href: `${repoUrl}/releases` },
            { label: 'Mentions légales', to: '/legal' },
          ],
        },
      ],
      copyright: `MIT · ${new Date().getFullYear()} Back in stock ! contributors`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
