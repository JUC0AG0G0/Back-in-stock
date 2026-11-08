import Link from '@docusaurus/Link';
import Translate, { translate } from '@docusaurus/Translate';
import useBaseUrl from '@docusaurus/useBaseUrl';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import type { ReactNode } from 'react';

import styles from './index.module.css';

const repoUrl = 'https://github.com/JUC0AG0G0/Back-in-stock';
const installCommand =
  'curl -fsSL https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.sh | sh';

interface Feature {
  title: ReactNode;
  description: ReactNode;
}

const features: Feature[] = [
  {
    title: <Translate id="home.feature.selfhosted.title">Chez toi, rien qu'à toi</Translate>,
    description: (
      <Translate id="home.feature.selfhosted.description">
        Un conteneur Docker et un fichier SQLite sur ta machine. Pas de serveur central, pas de
        compte, pas de télémétrie.
      </Translate>
    ),
  },
  {
    title: <Translate id="home.feature.watch.title">Deux façons de surveiller</Translate>,
    description: (
      <Translate id="home.feature.watch.description">
        Une page produit (retour en stock, rupture, précommande) ou une page liste, comme le
        reconditionné Fanatec, pour repérer chaque nouvel article.
      </Translate>
    ),
  },
  {
    title: <Translate id="home.feature.notify.title">Prévenu là où tu es</Translate>,
    description: (
      <Translate id="home.feature.notify.description">
        Telegram dès aujourd'hui, l'email ensuite, avec plusieurs comptes par canal si tu veux.
      </Translate>
    ),
  },
  {
    title: <Translate id="home.feature.frequency.title">À ton rythme</Translate>,
    description: (
      <Translate id="home.feature.frequency.description">
        Une fréquence de vérification par défaut, que tu peux ajuster produit par produit.
      </Translate>
    ),
  },
  {
    title: <Translate id="home.feature.plugins.title">Extensible par plugins</Translate>,
    description: (
      <Translate id="home.feature.plugins.description">
        Chaque site et chaque canal de notification est un module isolé, écrit en TypeScript. Tu
        peux en ajouter sans toucher au cœur.
      </Translate>
    ),
  },
  {
    title: <Translate id="home.feature.updates.title">Toujours à jour</Translate>,
    description: (
      <Translate id="home.feature.updates.description">
        Un bandeau t'annonce chaque nouvelle version, et tu peux l'installer en un clic depuis
        l'interface.
      </Translate>
    ),
  },
];

function Hero(): ReactNode {
  return (
    <header className={styles.hero}>
      <div className="container">
        <img className={styles.logo} src={useBaseUrl('/img/favicon.svg')} alt="" />
        <Heading as="h1" className={styles.title}>
          Back in stock !
        </Heading>
        <p className={styles.tagline}>
          <Translate id="home.tagline">
            Sois prévenu dès qu'un produit revient en stock, ou qu'un nouvel article apparaît. Open
            source, auto-hébergé, en français et en anglais.
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/getting-started">
            <Translate id="home.cta.start">Démarrer en 2 minutes</Translate>
          </Link>
          <Link className="button button--secondary button--outline button--lg" to="/intro">
            <Translate id="home.cta.docs">Lire la documentation</Translate>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Install(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2">
          <Translate id="home.install.title">Installation en une commande</Translate>
        </Heading>
        <p>
          <Translate id="home.install.description">
            Sur macOS ou Linux, avec Docker installé. Le script te pose quelques questions, démarre
            l'application et t'affiche son adresse.
          </Translate>
        </p>
        <CodeBlock language="bash">{installCommand}</CodeBlock>
        <p>
          <Translate
            id="home.install.more"
            values={{
              link: (
                <Link to="/getting-started">
                  <Translate id="home.install.more.link">Démarrage rapide</Translate>
                </Link>
              ),
            }}
          >
            {
              'Windows, installation manuelle avec Docker Compose, choix de la version : tout est dans le {link}.'
            }
          </Translate>
        </p>
      </div>
    </section>
  );
}

function Features(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className="row">
          {features.map((feature, index) => (
            <div key={index} className="col col--4">
              <div className={styles.feature}>
                <Heading as="h3">{feature.title}</Heading>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Links(): ReactNode {
  const links = [
    {
      to: '/getting-started',
      label: <Translate id="home.links.start">Installer et configurer</Translate>,
    },
    {
      to: '/channels/telegram',
      label: <Translate id="home.links.telegram">Créer ton bot Telegram</Translate>,
    },
    {
      to: '/plugins/overview',
      label: <Translate id="home.links.plugins">Écrire un plugin (site ou notification)</Translate>,
    },
    {
      to: '/contributing/development',
      label: <Translate id="home.links.contribute">Contribuer au code</Translate>,
    },
    { href: repoUrl, label: <Translate id="home.links.github">Code source sur GitHub</Translate> },
  ];
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2">
          <Translate id="home.links.title">Et ensuite ?</Translate>
        </Heading>
        <ul className={styles.links}>
          {links.map((link, index) => (
            <li key={index}>
              <Link {...('href' in link ? { href: link.href } : { to: link.to })}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title={translate({
        id: 'home.meta.title',
        message: 'Alertes de retour en stock auto-hébergées',
      })}
      description={translate({
        id: 'home.meta.description',
        message:
          "Back in stock ! surveille des pages produit et des pages liste et te prévient sur Telegram dès qu'un produit revient en stock. Open source, auto-hébergé avec Docker.",
      })}
    >
      <Hero />
      <main>
        <Install />
        <Features />
        <Links />
      </main>
    </Layout>
  );
}
