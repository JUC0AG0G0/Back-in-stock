import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Utiliser',
      collapsed: false,
      items: ['getting-started', 'configuration', 'updates'],
    },
    {
      type: 'category',
      label: 'Canaux de notification',
      collapsed: false,
      items: ['channels/telegram'],
    },
    {
      type: 'category',
      label: 'Écrire un plugin',
      collapsed: false,
      items: ['plugins/overview', 'plugins/source', 'plugins/notifier'],
    },
    {
      type: 'category',
      label: 'Contribuer',
      items: ['contributing/development'],
    },
  ],
};

export default sidebars;
