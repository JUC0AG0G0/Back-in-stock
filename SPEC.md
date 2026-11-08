# Back in stock ! — Spécification

> Version 0.6 (brouillon) · 7 novembre 2026
> Statut : à valider. Les points marqués **[À VALIDER]** sont des choix par défaut proposés.

## 1. Vision

**Back in stock !** est une application **open source et auto-hébergée**. Chacun la fait tourner sur son propre petit serveur (VPS, Raspberry Pi, NAS) avec Docker. Il n'y a **aucun serveur central** : pas de compte, pas de télémétrie, les données restent chez l'utilisateur.

L'application surveille des pages web de boutiques et envoie une notification quand :

1. **un produit revient en stock** (veille d'une page produit) ;
2. **un nouvel article apparaît sur une page liste**, par exemple la page « Reconditionné » d'une boutique (veille d'une page liste).

Tout est écrit en **TypeScript**. Les sites supportés et les canaux de notification sont des **plugins** : on peut en ajouter sans toucher au cœur de l'application.

### Objectifs
- Installer l'application avec un seul `docker compose up -d`.
- Ajouter une veille depuis l'interface web en collant une URL.
- Choisir une fréquence par défaut globale, puis la changer pour chaque veille.
- Ajouter un site ou un canal de notification en écrivant un petit module isolé, publiable sur npm.
- Aucune notification en double, et aucun faux « en stock » quand une page est en erreur ou bloquée.

### Hors périmètre (v1)
- Achat automatique, ajout au panier.
- Service hébergé « SaaS » ou serveur central de synchronisation.
- Contournement de captcha ou de protections anti-bot agressives.

## 2. Concepts du domaine

| Concept | Description |
|---|---|
| **Watch** (veille) | Une URL surveillée. Elle a un **type** (`product` ou `listing`), une fréquence, un plugin source, des filtres et des canaux de notification. |
| **Source plugin** | Sait lire un site ou une famille de sites (ex. Shopify, données structurées génériques, Apple Refurb, Back Market…). Il renvoie un instantané normalisé. |
| **Snapshot** | Résultat d'une vérification. Pour une page produit : `ProductState`. Pour une page liste : `ListingItem[]`. |
| **Event** (événement) | Fait métier déduit en comparant deux snapshots : `ProductRestocked`, `ProductOutOfStock`, `ListingItemAdded`, `ListingItemRemoved`, `WatchFailing`. |
| **Notifier plugin** | Envoie un événement sur un canal. v1 : Telegram, email, ntfy, webhook. D'autres (Discord, Gotify, Pushover…) pourront venir de la communauté. |
| **Channel** (canal) | Une instance configurée d'un notifier, par exemple « Mon Telegram perso » avec son token. L'utilisateur peut créer **autant de canaux qu'il veut, y compris plusieurs du même type** (deux bots ou chats Telegram, plusieurs adresses mail…). Chaque veille choisit ses canaux. Un ou plusieurs canaux peuvent être marqués **« par défaut »** : ils sont pré-cochés à la création d'une veille. |

### Les deux types de veille

**`product` : retour en stock**
- État suivi : `IN_STOCK` · `OUT_OF_STOCK` · `PREORDER` · `UNKNOWN` · `ERROR`, avec le prix et une variante éventuelle (taille, couleur).
- Notification quand l'état passe à `IN_STOCK`, après **double confirmation**.

**`listing` : nouveaux articles sur une page (ex. reconditionné)**
- Le plugin extrait la liste des articles visibles. Chaque article a un **identifiant stable** (SKU, id produit ou URL normalisée), un titre, un prix, une URL, une image et des attributs libres (état, capacité, couleur…).
- Le système compare la liste à la précédente : un identifiant jamais vu déclenche `ListingItemAdded`.
- **Filtres** par veille pour ne pas être spammé (**après la v1** : au départ, tous les nouveaux articles sont notifiés) : mots-clés inclus ou exclus, prix maximum, attributs (ex. `capacité >= 256 Go`, `état = "Très bon"`).
- Le premier passage sert de **référence** et n'envoie aucune notification.
- Pagination gérée par le plugin, avec un nombre de pages maximum configurable.

## 3. Architecture

Architecture **hexagonale (ports & adapters)**. Le domaine ne dépend ni de la base de données, ni du HTTP, ni des plugins. Il ne connaît que des interfaces.

```
                         ┌───────────────────────────────┐
   Interface web ───────▶│  API HTTP (Fastify, REST)     │
   (React SPA)           └──────────────┬────────────────┘
                                        │ use cases
┌───────────────────────────────────────▼──────────────────────────────┐
│                         APPLICATION (use cases)                      │
│  CreateWatch · UpdateWatch · RunCheck · TestUrl · ListEvents · ...   │
└──────┬──────────────────┬──────────────────┬──────────────────┬──────┘
       │                  │                  │                  │
┌──────▼──────┐   ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼──────┐
│  DOMAINE    │   │  Scheduler    │  │  Event bus    │  │  Ports       │
│ Watch,      │   │ (file + rate  │  │ (observer)    │  │ WatchRepo,   │
│ Snapshot,   │   │  limit/domain)│  │               │  │ Fetcher,     │
│ diff, règles│   └───────────────┘  └───────┬───────┘  │ Clock, Logger│
└─────────────┘                              │          └──────┬───────┘
                                             ▼                 │
                              ┌───────────────────────┐        │
                              │ NotificationDispatcher│        │
                              └──────────┬────────────┘        │
         ADAPTERS                        │                     │
┌────────────────────┐   ┌───────────────▼──────┐   ┌──────────▼────────┐
│ Source plugins     │   │ Notifier plugins     │   │ SQLite (Drizzle), │
│ shopify, jsonld,   │   │ telegram, ntfy,      │   │ HttpFetcher,      │
│ css-rule, fanatec, │   │ email, webhook,      │   │ BrowserFetcher    │
│ shopify, ...       │   │ webhook, ...         │   │ (Playwright)      │
└────────────────────┘   └──────────────────────┘   └───────────────────┘
```

### Design patterns utilisés

| Pattern | Où | Pourquoi |
|---|---|---|
| **Ports & Adapters** | Tout le backend | Le domaine se teste sans base ni réseau. On peut changer de stockage ou de fetcher sans toucher au métier. |
| **Plugin + Registry** | `SourceRegistry`, `NotifierRegistry` | Les plugins s'enregistrent au démarrage. Le cœur les découvre par leur `id`. |
| **Strategy** | Choix du plugin source pour une URL, choix du fetcher (HTTP ou navigateur) | Comportement interchangeable. |
| **Chain of Responsibility** | Détection automatique : plugin dédié au site, puis JSON-LD, puis règle CSS, puis heuristique | Le premier qui conclut avec assez de confiance gagne. |
| **State machine** | Cycle de vie de l'état d'une veille produit (rupture, confirmation en attente, en stock) | Rend la double confirmation et la non-duplication explicites et testables. |
| **Observer / Event bus** | Événements de domaine vers le dispatcher, les logs et l'interface (SSE) | Découple la détection de la notification. |
| **Repository** | `WatchRepository`, `SnapshotRepository`, `EventRepository` | Isole l'ORM. |
| **Dependency Injection** (composition root manuelle) | `src/main.ts` | Pas de framework DI lourd. Les dépendances sont câblées à un seul endroit. |
| **Template / Decorator** | Fetcher avec retry, backoff, cache et rate-limit en décorateurs | Responsabilités séparées et combinables. |
| **Value Objects** | `Url`, `Money`, `Interval`, `ItemId` | Validation à la construction, aucune primitive « nue » dans le domaine. |

## 4. Système de plugins

### Contrat d'un plugin source

```ts
// @back-in-stock/plugin-sdk
export interface SourcePlugin<Config = unknown> {
  id: string;                         // "shopify", "apple-refurb"
  name: string;
  version: string;
  supports: Array<'product' | 'listing'>;
  /** Score de 0 à 1 : à quel point ce plugin sait lire cette URL. */
  match(url: URL): number;
  /** Options propres au plugin (variante, sélecteurs…), validées et affichées dans l'interface. */
  configSchema?: z.ZodType<Config>;
  fetchMode?: 'http' | 'browser' | 'auto';
  checkProduct?(ctx: SourceContext<Config>): Promise<ProductSnapshot>;
  checkListing?(ctx: SourceContext<Config>): Promise<ListingSnapshot>;
}

export interface SourceContext<C> {
  url: URL;
  config: C;
  fetch: Fetcher;        // fourni par le cœur : rate-limit, retry, user-agent, cookies
  html: HtmlParser;      // helpers : cheerio, JSON-LD, microdata
  logger: Logger;
  signal: AbortSignal;   // timeout
}
```

### Contrat d'un plugin de notification

```ts
export interface NotifierPlugin<Config = unknown> {
  id: string;                         // "telegram"
  name: string;
  version: string;
  configSchema: z.ZodType<Config>;    // token, chat id… L'interface génère le formulaire.
  send(ctx: NotifierContext<Config>, message: NotificationMessage): Promise<void>;
  test?(ctx: NotifierContext<Config>): Promise<void>;   // bouton « Envoyer un test »
}
```

`NotificationMessage` est déjà rendu par le cœur à partir de l'événement : titre, texte, URL, image, prix. Chaque notifier l'adapte à son format (Markdown Telegram, HTML pour l'email…).

### Écrire et charger un plugin
- Un helper `defineSourcePlugin({...})` / `defineNotifierPlugin({...})` donne le typage complet.
- Les **plugins intégrés** sont dans le monorepo (`plugins/*`) et chargés par défaut.
- Les **plugins externes** se chargent de deux façons :
  1. **Paquets npm** nommés `back-in-stock-plugin-*` (ou `@scope/back-in-stock-plugin-*`), listés dans la variable `BIS_PLUGINS=back-in-stock-plugin-fnac,...`. Ils sont installés au démarrage du conteneur.
  2. **Dossier local** monté dans `/data/plugins/` : chaque sous-dossier contient un `index.js` qui exporte un plugin. C'est la voie la plus simple pour du développement local.
- Au chargement, le cœur vérifie la `apiVersion` du SDK et valide la forme du plugin. Un plugin invalide est ignoré et signalé dans l'interface, sans faire planter l'application.
- Un kit de test (`@back-in-stock/plugin-testkit`) permet de tester un plugin sur des pages HTML enregistrées (fixtures).
- Un template `create-back-in-stock-plugin` génère un plugin vide.

> Sécurité : un plugin est du code exécuté avec les droits de l'application. La documentation doit le dire clairement : n'installer que des plugins de confiance.

### Plugins livrés en v1 [À VALIDER]

| Plugin | Type | Rôle |
|---|---|---|
| `structured-data` | product | JSON-LD / microdata `schema.org/Offer.availability`. Plugin générique par défaut. |
| `css-rule` | product, listing | Règle définie par l'utilisateur dans l'interface : sélecteurs CSS pour l'état ou pour les articles d'une liste (conteneur, id, titre, prix, lien). |
| `shopify` | product, listing | Endpoints `/products/<handle>.js` et `/collections/<x>/products.json`. Très fiable. |
| `fanatec` | listing, product | **Cible prioritaire** : page reconditionné (refurbished / B-stock) de la boutique **Fanatec Europe**. Détecte les nouveaux articles et peut suivre un produit précis. Région/boutique configurable (EU par défaut) pour qu'un contributeur puisse étendre aux autres régions. |
| `telegram`, `email` | notifier | **Canaux prioritaires**, avec assistant de configuration guidée (voir §7bis). |
| `ntfy`, `webhook` | notifier | Canaux simples, utiles pour tester et pour les intégrations (Home Assistant, n8n…). |

Discord n'est **pas** livré en v1. Il fera un bon premier plugin communautaire, et servira d'exemple dans la doc « Ajouter un notifier ».

## 5. Récupération et détection

### Fetchers
- `HttpFetcher` : `undici`/`fetch` avec un User-Agent réaliste, `Accept-Language` configurable, cookies par domaine, compression.
- `BrowserFetcher` : Playwright Chromium, un seul navigateur partagé et un contexte par domaine. Il est **optionnel** et fourni dans une image Docker séparée (`:full`), car Chromium pèse environ 400 Mo.
- Mode `auto` : on essaie HTTP d'abord, puis le navigateur si le plugin conclut `UNKNOWN`.
- Décorateurs : `RateLimited` (1 requête à la fois par domaine, délai minimal), `Retrying` (backoff exponentiel sur 429/5xx), `TimeoutBound`.

### Règles anti-faux positifs
- Une erreur HTTP, un captcha détecté, une page vide ou un titre manquant donnent `ERROR`, **jamais** `IN_STOCK`.
- **Double confirmation** : un passage à `IN_STOCK` est revérifié environ 30 s plus tard avant de notifier. On peut le désactiver pour une veille donnée.
- Pages liste : si une liste revient vide alors que la précédente contenait des articles, on considère que c'est une **erreur probable**, pas « tous les articles ont disparu ». Les retraits ne sont validés qu'après N vérifications.
- Si une veille est en `ERROR` depuis plus de X heures, l'événement `WatchFailing` part vers un canal « admin ».

## 6. Fréquence de vérification

- **Fréquence par défaut globale**, réglable dans *Paramètres* (et par la variable `BIS_DEFAULT_INTERVAL=5m` au premier démarrage). Valeur par défaut : 5 min.
- **Surcharge par veille** : un champ « Fréquence » dans la veille. S'il est vide, la veille suit la valeur globale, et suit aussi ses changements.
- **Plancher global** (`BIS_MIN_INTERVAL`, 1 min par défaut) et **plancher par domaine** pour ne pas surcharger une boutique, même si plusieurs veilles visent le même site.
- **Jitter** de ±15 % pour ne pas frapper à heure fixe.
- **Plages horaires** optionnelles par veille (ex. vérifier toutes les minutes de 9 h à 11 h les jours de drop) [v2].
- Après une erreur, backoff exponentiel plafonné à 1 h, puis retour à la fréquence normale au premier succès.

Implémentation : le scheduler tourne en mémoire et lit `next_check_at` en base toutes les quelques secondes. Les tâches passent par une file (`p-queue`) avec une concurrence globale (`BIS_CONCURRENCY=4`) et des files par domaine. Quand on modifie une veille, son `next_check_at` est recalculé tout de suite. Après un redémarrage, l'état reprend depuis la base.

## 7. Interface web

Application monopage (SPA) servie par le même conteneur.

**Écrans**
1. **Tableau de bord** : liste des veilles avec leur type, leur état (pastille), la date du dernier et du prochain check, la fréquence, le prix. Filtres par état et par boutique. On peut mettre en pause, reprendre, lancer un check tout de suite ou supprimer.
2. **Ajouter une veille** : on colle une URL, l'application choisit le plugin le plus adapté (avec possibilité de forcer un autre plugin) et affiche un **aperçu en direct** : l'état détecté, ou les N articles trouvés pour une page liste. On règle ensuite le type, la fréquence, la variante, les filtres et les canaux. Pour le plugin `css-rule`, l'éditeur de sélecteurs se met à jour en direct.
3. **Détail d'une veille** : historique des checks, événements, courbe de prix, articles connus (pour une page liste), dernière erreur avec un extrait de la page.
4. **Canaux** : ajouter un canal (formulaire généré depuis le `configSchema` du plugin), bouton « Envoyer un test ».
5. **Plugins** : plugins chargés, version, erreurs de chargement.
6. **Paramètres** : fréquence par défaut, plancher, fuseau horaire, langue, canal admin.

**Mises à jour en temps réel** : un flux Server-Sent Events (`/api/events/stream`) pousse les changements d'état vers l'interface.

**Authentification** : **un seul utilisateur par instance** en v1. L'application tourne sur ton serveur et peut être exposée sur Internet, donc l'authentification est activée par défaut. Ce compte admin unique (mot de passe hashé avec argon2, session par cookie httpOnly) est créé au premier lancement. Une option `BIS_AUTH=none` existe pour un usage derrière un VPN ou un proxy qui gère déjà l'authentification.

**i18n** : voir §7ter.

## 7bis. Premier démarrage et configuration guidée

### Assistant de premier lancement (onboarding)
Au premier accès à l'interface, un assistant en plusieurs étapes s'affiche. On peut le relancer depuis *Paramètres*.

1. **Langue** : français ou anglais, détectée depuis le navigateur.
2. **Compte admin** : choix du mot de passe.
3. **Réglages de base** : fuseau horaire, fréquence de vérification par défaut (avec explication du plancher et du jitter).
4. **Premier canal de notification** : choix du type (Telegram, email, ntfy, webhook), puis lancement de l'assistant du canal (voir ci-dessous). Un message de test est envoyé avant de valider.
5. **Première veille** : on colle une URL (une suggestion : la page reconditionné Fanatec EU), on voit l'aperçu en direct et on enregistre.
6. **Récapitulatif** : liens vers le tableau de bord et vers la documentation.

On peut passer chaque étape et y revenir plus tard. Une checklist « Pour bien démarrer » reste visible sur le tableau de bord tant qu'elle n'est pas complète.

### Assistants de configuration des canaux
Chaque plugin de notification peut fournir un **guide pas à pas** (`setupGuide`) que l'interface affiche comme un assistant : étapes numérotées, captures ou liens, champs à remplir, vérification automatique à chaque étape.

**Telegram** (le parcours le plus guidé) :
1. « Ouvre Telegram et parle à **@BotFather** » : lien `https://t.me/BotFather` et QR code.
2. « Envoie `/newbot`, choisis un nom et un identifiant se terminant par `bot` » : texte prêt à copier.
3. « Colle le token que BotFather t'a donné » : l'application vérifie le token immédiatement (`getMe`) et affiche le nom du bot.
4. « Ouvre ton bot et envoie-lui `/start` » : lien direct `https://t.me/<nom_du_bot>` et QR code. L'application **détecte automatiquement le chat** (`getUpdates`), donc pas besoin de chercher le chat id. Pour un groupe : ajouter le bot au groupe et y écrire un message.
5. « Message de test envoyé, l'as-tu reçu ? » Le canal est créé.

**Email (SMTP)** :
- Préréglages Gmail, Outlook / Hotmail, Free, Orange, OVH, et « Autre serveur SMTP ». Le préréglage remplit hôte, port et TLS.
- Explication contextuelle des **mots de passe d'application** (Gmail, Outlook) avec liens vers les pages officielles.
- Test de connexion SMTP, puis envoi d'un e-mail de test.

**ntfy** : génération d'un nom de topic aléatoire, QR code pour s'abonner depuis l'app mobile, choix du serveur (ntfy.sh ou auto-hébergé), envoi d'un test.

**Webhook** : URL, méthode, en-têtes, aperçu du JSON envoyé, test.

### Contrat côté plugin
Le contrat `NotifierPlugin` (§4) gagne des champs optionnels :

```ts
setupGuide?: SetupStep[];      // étapes de l'assistant (textes = clés i18n)
validate?(config): Promise<ValidationResult>;          // ex. getMe pour Telegram
discover?(partialConfig): Promise<Partial<Config>>;    // ex. détection du chat id
translations?: Record<'fr' | 'en', Record<string, string>>;
```

Un plugin sans `setupGuide` reste utilisable : l'interface affiche simplement le formulaire généré depuis `configSchema`.

## 7ter. Internationalisation (i18n)

- Langues **français et anglais dès la v1**, avec architecture prête pour d'autres langues proposées par la communauté.
- Front : **i18next + react-i18next**, fichiers `locales/<lang>/*.json` par domaine fonctionnel. Langue détectée depuis le navigateur, puis choix enregistré dans les paramètres.
- Back : les **messages de notification** utilisent aussi i18next. La langue des notifications est un réglage global, modifiable par canal (ex. un canal en anglais pour quelqu'un d'autre).
- **Plugins** : ils fournissent leurs propres traductions (`translations`) pour leurs libellés, champs et guides. Le cœur les fusionne sous un espace de noms `plugin.<id>`.
- Formats localisés via `Intl` : prix (`1 189,00 €` / `€1,189.00`), dates, durées (« il y a 5 min »).
- CI : un script vérifie que toutes les clés existent dans les deux langues. Une clé manquante fait échouer la CI.
- Aucun texte en dur dans les composants (règle ESLint `i18next/no-literal-string`).

## 7quater. Bandeau « Nouvelle version disponible » et mise à jour en un clic

### Détection d'une nouvelle version
- Le serveur interroge l'API GitHub Releases (`/repos/juc0ag0g0/back-in-stock/releases`) **toutes les 6 h**, avec cache et en-tête `If-None-Match` pour rester léger.
- Il compare la version publiée à la sienne (`BIS_VERSION`, injectée dans l'image au build) en **semver**.
- Canal de mise à jour réglable : **stable** (par défaut, releases uniquement) ou **pré-versions** (`-rc`, `-beta`).
- Seules les **images publiées** vérifient : le workflow de publication injecte `BIS_BUILD_CHANNEL=release` et `BIS_VERSION` dans les images de release. Les images `edge` (`BIS_BUILD_CHANNEL=edge`) et les builds locaux (`dev`) ne cherchent jamais de mise à jour.
- Désactivable (`BIS_UPDATE_CHECK=false`, ou dans *Paramètres*). C'est la seule requête sortante de l'application en dehors des sites surveillés et des canaux, et la doc le dit clairement.

### Bandeau dans l'interface
- Bandeau discret en haut de toutes les pages : « Version 1.4.0 disponible (tu as 1.3.2) », avec les boutons **Voir les nouveautés**, **Installer** et **Plus tard**.
- *Voir les nouveautés* ouvre une fenêtre avec le changelog de toutes les versions entre la tienne et la dernière, rendu depuis les notes de release GitHub.
- *Plus tard* masque le bandeau jusqu'à la version suivante.
- Pour une **version majeure** (changement cassant), le bandeau est orange, affiche un avertissement et renvoie vers le guide de migration de la doc avant d'installer.
- Optionnel : une notification sur le canal admin quand une nouvelle version sort.

### Installation en un clic
Un conteneur ne peut pas se remplacer lui-même. On ajoute donc un **petit service compagnon optionnel**, `updater`, dans le même `docker-compose.yml` :

```yaml
  updater:
    image: ghcr.io/juc0ag0g0/back-in-stock-updater:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - .:/install          # pour réécrire BIS_IMAGE_TAG dans .env quand la version est épinglée
    environment:
      BIS_TARGET_SERVICE: back-in-stock   # ou BIS_TARGET_CONTAINER: <nom> hors compose
    # pas de port exposé : joignable uniquement par l'application (BIS_UPDATER_URL=http://updater:8090)
```

Quand on clique sur **Installer** :
1. L'application appelle l'`updater` sur le réseau Docker interne, avec un jeton partagé généré au premier démarrage et stocké dans `/data`.
2. Il télécharge la nouvelle image (en gardant la variante `slim` ou `full`) pendant que l'application tourne encore, et vérifie qu'elle contient bien la version demandée. Tag flottant (`latest`, `1`, `1.4`) : il est retéléchargé. Version précise (`1.4.2`) : il passe au tag de la nouvelle version et réécrit la ligne `BIS_IMAGE_TAG` de `.env`.
3. Il arrête proprement l'application et **sauvegarde la base** (`/data/backups/db-<version>-<date>.sqlite`).
4. Il recrée le conteneur avec la même configuration (volumes, variables, ports, réseaux).
5. Il attend que le **healthcheck** passe. Les migrations de base s'appliquent au démarrage.
6. Si le healthcheck échoue, il fait un **rollback automatique** : il remet l'ancienne image et restaure la sauvegarde.
7. Pendant l'opération, l'interface affiche la progression, puis se recharge toute seule sur la nouvelle version.

Si l'`updater` n'est pas installé, le bouton **Installer** affiche les commandes à copier (`docker compose pull && docker compose up -d`) avec un lien vers la doc.

> Sécurité : l'accès au socket Docker donne beaucoup de droits. C'est pourquoi l'`updater` est un service séparé, minimal, sans port exposé et protégé par jeton. Il est **optionnel**, et la doc explique le compromis. Pour ceux qui préfèrent, la doc indique aussi comment utiliser un outil de mise à jour automatique d'images existant.

## 8. Modèle de données (SQLite via Drizzle ORM)

```
settings        (key, value)
channels        (id, notifier_id, name, config_json[chiffré], enabled, created_at)
watches         (id, type[product|listing], url, name, source_id, source_config_json,
                 interval_sec NULL, active, filters_json, confirm_restock,
                 last_status, last_checked_at, next_check_at, error_count,
                 created_at, updated_at)
watch_channels  (watch_id, channel_id)
product_snapshots (id, watch_id, checked_at, status, price_cents, currency,
                   title, image_id, signal, http_status, duration_ms, error)
listing_items   (watch_id, item_id, title, price_cents, currency, url, image_url, image_id,
                 attrs_json, first_seen_at, last_seen_at, missing_count, removed_at)
check_runs      (id, watch_id, started_at, duration_ms, ok, error, item_count)
events          (id, watch_id, type, payload_json, created_at)
deliveries      (id, event_id, channel_id, status, attempts, last_error, sent_at)
images          (id, source_url, sha256, mime, width, height, bytes, path,
                 fetched_at, last_used_at)
```

- `interval_sec = NULL` signifie que la veille suit la fréquence globale.
- Les secrets des canaux sont chiffrés en base avec une clé `BIS_SECRET_KEY`, générée au premier démarrage si elle est absente.
- `deliveries` sert d'**outbox** : une notification qui échoue est réessayée sans relancer la détection.
- Rétention configurable : les snapshots de plus de 30 jours sont supprimés, sauf les changements d'état.
- Migrations versionnées avec Drizzle Kit et appliquées au démarrage.

## 9. API REST (extrait)

```
GET    /api/watches                    POST /api/watches
GET    /api/watches/:id                PATCH /api/watches/:id    DELETE /api/watches/:id
POST   /api/watches/:id/check          # check immédiat
GET    /api/watches/:id/history
POST   /api/preview                    # { url, type, sourceId?, config? } → aperçu sans sauvegarder
GET    /api/channels  POST /api/channels  POST /api/channels/:id/test
GET    /api/plugins
GET    /api/settings  PATCH /api/settings
GET    /api/events/stream              # SSE
GET    /api/health                     # pour Docker healthcheck
```

Les contrats sont partagés entre le front et le back via des schémas **Zod**, dans un paquet commun. Une spec OpenAPI est générée automatiquement, ce qui laisse la porte ouverte à une future app mobile ou à des scripts.

## 10. Stack technique

| Sujet | Choix | Raison |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Écosystème, Playwright |
| Langage | **TypeScript strict** (`strict`, `noUncheckedIndexedAccess`) | |
| Monorepo | **pnpm workspaces** + Turborepo | Cœur, SDK et plugins publiables séparément |
| Backend | **Fastify** | Rapide, typé, plugins, schémas |
| Validation | **Zod** | Partagée front/back et plugins, génère les formulaires |
| ORM / BDD | **Drizzle ORM + SQLite** (`better-sqlite3`) | Zéro infra, un fichier dans `/data`, parfait pour de l'auto-hébergement |
| Parsing HTML | **cheerio** | Léger |
| Images | **sharp** | Redimensionnement et conversion des images produit |
| Navigateur | **Playwright** (optionnel) | Sites JS |
| Ordonnancement | Scheduler maison + **p-queue** | Pas besoin de Redis |
| Front | **React + Vite + TanStack Query + TanStack Router**, **shadcn/ui** (Tailwind) | Standard, rapide à construire [À VALIDER] |
| i18n | **i18next** + react-i18next | Partagé front/back, traductions des plugins |
| Documentation | **Docusaurus** + TypeDoc, déployé sur GitHub Pages | Standard des projets open source TS |
| Logs | **pino** (JSON) | |
| Tests | **Vitest** (unitaires, domaine), fixtures HTML pour les plugins, **Playwright Test** pour le e2e de l'interface | |
| Qualité | ESLint (typescript-eslint), Prettier, Husky + lint-staged, commitlint, **release-please** pour les versions et changelogs | |
| CI/CD | GitHub Actions + release-please, images multi-arch sur **GHCR** (`ghcr.io/juc0ag0g0/back-in-stock`), voir §15ter | |

## 11. Structure du dépôt

```
back-in-stock/
├── apps/
│   ├── server/                 # Fastify + scheduler + composition root
│   │   └── src/
│   │       ├── domain/         # entités, value objects, state machine, diff de listes
│   │       ├── application/    # use cases, ports (interfaces)
│   │       ├── infrastructure/ # drizzle repos, fetchers, plugin loader, event bus
│   │       ├── http/           # routes Fastify, SSE, auth
│   │       └── main.ts         # câblage des dépendances
│   ├── updater/                # service compagnon de mise à jour en un clic
│   ├── web/                    # SPA React (i18n dans src/locales/fr|en)
│   └── docs/                   # site Docusaurus (FR/EN), publié sur GitHub Pages
├── packages/
│   ├── plugin-sdk/             # types + defineSourcePlugin / defineNotifierPlugin
│   ├── plugin-testkit/
│   ├── shared/                 # schémas Zod API, types partagés
│   └── create-plugin/          # générateur de plugin
├── plugins/
│   ├── source-structured-data/
│   ├── source-css-rule/
│   ├── source-shopify/
│   ├── source-fanatec/
│   ├── notifier-telegram/
│   ├── notifier-ntfy/
│   ├── notifier-webhook/
│   └── notifier-email/
├── docker/
│   ├── Dockerfile              # multi-stage, image "slim" sans Chromium
│   └── Dockerfile.full         # avec Chromium / Playwright
├── docker-compose.yml
├── .github/workflows/          # CI, images Docker, déploiement de la doc sur GitHub Pages
├── CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  LICENSE
└── SPEC.md
```

## 12. Docker et auto-hébergement

```yaml
# docker-compose.yml
services:
  back-in-stock:
    image: ghcr.io/juc0ag0g0/back-in-stock:latest   # ou :full pour Playwright
    restart: unless-stopped
    ports: ["8080:8080"]
    volumes:
      - ./data:/data            # base SQLite, plugins locaux, clé secrète
    environment:
      TZ: Europe/Paris
      BIS_DEFAULT_INTERVAL: 5m
      BIS_PLUGINS: ""           # plugins npm additionnels
```

- Build multi-stage, utilisateur non-root, `HEALTHCHECK` sur `/api/health`.
- Images **amd64 et arm64** (Raspberry Pi).
- Une seule image contient l'API, le scheduler et l'interface : un seul conteneur à gérer.
- La sauvegarde consiste à copier le dossier `./data`.
- Documentation pour mettre l'application derrière un reverse proxy (Caddy, Traefik) avec HTTPS.

### Script d'installation en une commande [jalon M1]

Un script permet à un nouvel utilisateur d'installer et de démarrer l'application sans écrire de configuration à la main :

```sh
curl -fsSL https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.sh | sh
```

Sur Windows, l'équivalent PowerShell (`scripts/install.ps1`) fait les mêmes étapes et écrit les mêmes fichiers :

```powershell
irm https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.ps1 | iex
```

1. **Vérifie les prérequis** : Docker est installé, le démon répond et Docker Compose v2 (`docker compose`) est disponible. Sinon, le script s'arrête avec un message clair et le lien vers la doc d'installation de Docker.
2. **Demande le port** d'écoute en proposant **8080** par défaut (Entrée pour accepter). Il vérifie que le port est libre et redemande sinon.
3. **Génère une configuration prête à l'emploi** dans un dossier dédié (par défaut `~/back-in-stock`) : `docker-compose.yml`, `.env` (`BIS_IMAGE_TAG`, `BIS_PORT`, `BIS_TZ` détecté) et dossier `data/`. Il propose aussi la mise à jour en un clic (service `updater`, accès au socket Docker) dès que son image est publiée.
4. **Démarre le projet** (`docker compose up -d`), attend que `/api/health` réponde, puis affiche l'URL de l'interface (`http://localhost:<port>`), où l'assistant de premier lancement prend le relais.

Règles :
- Script POSIX `sh` (Linux, macOS, WSL), sans dépendance autre que Docker et `curl`. Questions lues sur le terminal même via `curl | sh`, messages en français ou en anglais selon la langue du système.
- Idempotent : relancé sur une installation existante, il ne touche pas à `data/`, reprend les réponses précédentes comme valeurs par défaut et met l'image à jour.
- **Choix de la version** : `--version 1.2.3` installe une version précise au lieu de la dernière (l'image est alors épinglée sur le tag `1.2.3`, pas `latest`). Les tags partiels sont acceptés (`--version 1.2` suit les correctifs de la 1.2). Le script vérifie que la version existe sur ghcr.io avant de continuer. Exemple : `curl -fsSL …/install.sh | sh -s -- --version 1.2.3`.
- Mode non interactif pour l'automatisation : `--port 8080 --dir /opt/back-in-stock --version 1.2.3 --yes` (ou les variables `BIS_PORT`, `BIS_DIR`, `BIS_TZ`, `BIS_VERSION`, `BIS_UPDATER`). `--no-updater` n'ajoute pas le service `updater`.
- Testé en CI : `shellcheck`, puis les deux scripts installent l'image de la PR et doivent produire les mêmes fichiers.
- Publié comme asset de chaque release, avec sa somme sha256, et documenté dans le guide de démarrage.

## 13. Notifications : comportement

- Une notification par événement et par canal, avec suivi dans `deliveries` et retries.
- Un seul `ProductRestocked` par retour en stock : il faut repasser par `OUT_OF_STOCK` pour en déclencher un nouveau.
- Pour une page liste, si plusieurs articles apparaissent pendant le même check, ils sont **groupés** dans un seul message au-delà de 3 articles.
- Les messages sont rendus par des templates côté cœur, en français et en anglais.
- Exemple :
  ```
  🆕 Nouveau sur « Apple — Reconditionné Mac »
  MacBook Air M3 15" 16 Go / 512 Go — 1 189 €
  https://...
  ```

### Images produit dans les notifications

Chaque notification peut contenir **la photo du produit**.

**Récupération de l'image**
- Le plugin source renvoie `imageUrl` dans ses snapshots, aussi bien pour un produit que pour chaque article d'une liste. Le plugin dédié (ex. `fanatec`) sait où trouver la bonne image.
- Sinon, le cœur la cherche automatiquement, dans cet ordre : `image` du JSON-LD `Product`, `og:image`, `twitter:image`, puis la première grande image de la zone produit.
- L'URL est rendue absolue. Pour une variante (couleur), on prend l'image de la variante si elle existe.

**Téléchargement et cache local**
- L'image est **téléchargée par le serveur** (avec le même fetcher, donc la même politesse et les mêmes cookies), puis stockée dans `/data/images/`. On ne fait pas de hotlink : beaucoup de boutiques bloquent l'accès direct, et certaines URL expirent.
- Elle est redimensionnée et convertie avec **sharp** (largeur max 1 024 px, JPEG ou WebP, quelques centaines de Ko) pour respecter les limites des canaux.
- Cache par empreinte (hash de l'URL et du contenu) : une image n'est téléchargée qu'une fois, même si l'article apparaît dans plusieurs veilles.
- Nettoyage automatique des images qui ne sont plus référencées depuis 30 jours.
- Si le téléchargement échoue, la notification part quand même, sans image.

**Envoi selon le canal**

| Canal | Comportement |
|---|---|
| Telegram | `sendPhoto` avec l'image en pièce jointe et le texte en légende. Pour un groupe d'articles d'une liste : `sendMediaGroup` (album de 10 images max), puis un message récapitulatif avec les liens. |
| Email | Image **intégrée dans le HTML** (pièce jointe inline `cid:`), donc visible même si le client bloque les images distantes. Version texte sans image. |
| ntfy | Image envoyée en pièce jointe (`attach`) et affichée dans la notification mobile. |
| Webhook | Champ `image` dans le JSON avec l'URL d'origine, plus l'image en base64 en option. |

- Réglage **« Inclure les images »** par canal, activé par défaut.
- Côté plugin notifier, `NotificationMessage.image` contient le fichier local (chemin, type MIME, taille) et l'URL d'origine. Le notifier choisit ce qu'il utilise. Un notifier qui ne gère pas les images les ignore simplement.
- L'interface web affiche aussi ces images : vignettes dans le tableau de bord, la liste des articles d'une veille liste et l'historique.

## 14. Sécurité et éthique

- Usage personnel, à fréquence raisonnable. Les planchers de fréquence sont imposés par domaine. Pas de contournement de captcha.
- Secrets chiffrés au repos, jamais renvoyés en clair par l'API.
- Protection CSRF et en-têtes de sécurité (`@fastify/helmet`), rate-limit sur la connexion.
- Les plugins sont du code de confiance, et la documentation le dit explicitement.
- Le serveur ne fait **aucune requête sortante** hormis les sites surveillés, les canaux configurés et la vérification de nouvelle version (désactivable).

## 15. Licence et contributions

- **Licence : MIT** pour tout le dépôt (cœur, SDK, plugins). C'est la licence la plus simple et la plus courante. N'importe qui peut utiliser, modifier et redistribuer le projet, et écrire ses propres plugins sous la licence de son choix.
  - Alternative envisageable : **AGPL-3.0** pour le cœur (oblige à repartager les modifications si quelqu'un en fait un service hébergé) avec le SDK en MIT. Elle protège davantage mais décourage certains contributeurs. Choix retenu : MIT.
- **Contribuer un site ou un notifier** est le chemin de contribution principal et doit être le plus simple possible :
  - `CONTRIBUTING.md` avec un guide pas à pas « Ajouter un site » et « Ajouter un notifier » ;
  - générateur `pnpm create back-in-stock-plugin` ;
  - chaque plugin de site doit fournir des **fixtures HTML** et des tests (testkit), vérifiés par la CI ;
  - modèles d'issues GitHub : « Demande de support d'un site », « Demande de canal de notification », « Bug de détection » (avec URL et extrait de page) ;
  - labels `good first issue` / `new-site` / `new-notifier` ;
  - Conventional Commits + release-please, PR obligatoire sur `main` (voir §15ter).
- Les plugins de la communauté peuvent vivre dans le dépôt principal (`plugins/`) ou dans leur propre dépôt npm. La doc tient un **catalogue** des plugins connus.

## 15bis. Documentation (Docusaurus + GitHub Pages)

Site de documentation construit avec **Docusaurus**, dans `apps/docs`, **bilingue FR/EN** (i18n native de Docusaurus) et publié sur **GitHub Pages** (`https://juc0ag0g0.github.io/back-in-stock/`) par une GitHub Action à chaque merge sur `main`.

**Plan du site**

1. **Introduction** : à quoi sert l'application, captures d'écran, fonctionnement en un schéma.
2. **Guide de démarrage**
   - Prérequis (un serveur, un VPS, un Raspberry Pi ou un NAS avec Docker).
   - Installation en 5 minutes avec `docker compose`.
   - Premier lancement et assistant.
   - Mettre l'application derrière un reverse proxy avec HTTPS (Caddy, Traefik, Nginx Proxy Manager).
   - Mise à jour, sauvegarde et restauration du dossier `data`.
3. **Configuration**
   - Toutes les variables d'environnement (tableau généré depuis le schéma Zod de config, donc toujours à jour).
   - Fréquences : globale, par veille, planchers.
   - **Canaux de notification** : un guide par canal (Telegram avec BotFather, email avec Gmail et Outlook, ntfy, webhook), avec captures.
   - Veilles produit et veilles liste, filtres, règles CSS.
   - Dépannage : page bloquée, faux positifs, sélecteur cassé, FAQ.
4. **Développer un plugin**
   - Concepts : sources, notifiers, cycle de vie, contexte fourni par le cœur.
   - **Tutoriel « Ajouter un site »** pas à pas : générer le plugin, enregistrer des fixtures HTML, écrire `checkProduct` / `checkListing`, tester avec le testkit, publier.
   - **Tutoriel « Ajouter un moyen de notification »** pas à pas, avec **Discord** comme exemple complet : `configSchema`, `send`, `setupGuide`, `validate`, traductions FR/EN.
   - Référence de l'API du SDK, générée avec **TypeDoc** (`docusaurus-plugin-typedoc`).
   - Publier sur npm, ou proposer le plugin dans le dépôt principal.
   - Catalogue des plugins existants.
5. **Contribuer** : installer le monorepo en local, conventions (Conventional Commits, branches, releases), traduire l'application dans une nouvelle langue, processus de revue.
6. **Architecture** : architecture hexagonale, design patterns, modèle de données. Destiné aux contributeurs du cœur.

**Bonnes pratiques**
- Les exemples de code de la doc sont **testés** : ils sont importés depuis de vrais fichiers du dépôt compilés en CI, pour ne jamais être obsolètes.
- Recherche locale (`@easyops-cn/docusaurus-search-local`), sans service externe.
- Lien « Modifier cette page » vers GitHub sur chaque page.
- Versionnement de la doc à partir de la v1.0.
- L'interface de l'application renvoie vers la page de doc correspondante (bouton « ? » sur chaque écran et dans chaque assistant).

## 15ter. Branches, versions et releases

L'objectif est de **publier vite et souvent**.

### Modèle de branches (trunk-based)
- **`main`** : unique branche principale, **toujours déployable**. Elle est protégée : personne ne pousse directement dessus.
- Chaque modification se fait sur une **branche courte**, créée depuis `main` et fusionnée par une **pull request** :
  `feat/<sujet>`, `fix/<sujet>`, `docs/<sujet>`, `chore/<sujet>`, `refactor/<sujet>`.
- Fusion en **squash merge** uniquement : un commit propre par PR sur `main`. La branche est supprimée automatiquement après la fusion.
- Le **titre de la PR suit Conventional Commits** (`feat(fanatec): …`, `fix(scheduler): …`), vérifié par la CI. C'est lui qui devient le message du commit sur `main` et qui alimente le changelog.

### Releases automatiques (release-please)
- À chaque fusion sur `main`, **release-please** met à jour une PR « Release vX.Y.Z » qui contient le changelog et la nouvelle version :
  - `fix:`, `perf:`, `docs:` et `revert:` donnent une version patch, `feat:` et `refactor:` une version mineure, `feat!:` ou `BREAKING CHANGE:` une version majeure.
  - `test:`, `ci:`, `chore:` et `build:` ne déclenchent pas de release : ils sont masqués dans le changelog, et release-please ne publie que s'il y a au moins une entrée visible.
  - `refactor:` en mineure n'existe dans aucune stratégie de release-please : le dépôt enregistre sa propre stratégie (`scripts/release-please/versioning.ts`, `"versioning": "refactor-minor"`). C'est pour cela que `release-please.yml` lance release-please par un script Node (`scripts/release-please/run.ts`) au lieu de `googleapis/release-please-action`, qui ne sait pas charger de stratégie personnalisée.
- **Fusionner cette PR publie la release** : tag `vX.Y.Z`, release GitHub avec les notes, et lancement de la chaîne de publication. On peut donc sortir une version plusieurs fois par jour en un clic.
- Mode **monorepo** (manifest) : l'application et le SDK de plugins (`@back-in-stock/plugin-sdk`) ont chacun leur version et leur changelog. Release-please remplace Changesets, prévu dans la v0.3.
- Tant que le projet est en `0.x`, un `feat` incrémente la version mineure et un changement cassant aussi.

### Pipelines CI/CD (GitHub Actions)

| Workflow | Déclencheur | Rôle |
|---|---|---|
| `ci.yml` | PR uniquement (la branche doit être à jour avec `main` pour fusionner, donc pas de seconde exécution après fusion) | Installation pnpm avec cache, lint, typecheck, tests unitaires, vérification des clés i18n, build. Tests e2e Playwright sur les PR touchant le front. |
| `pr-title.yml` | Ouverture ou modification de PR | Vérifie le titre Conventional Commits. |
| `release-please.yml` | Push sur `main` | Lance release-please (script `scripts/release-please/run.ts`, stratégie de version maison). Met à jour la PR de release. Quand elle est fusionnée, crée le tag et la release GitHub. |
| `publish.yml` | Release créée | Build des images **multi-arch** (amd64, arm64) `slim` et `full`, plus l'image `updater`, push sur **GHCR** (`ghcr.io/juc0ag0g0/back-in-stock`) avec les tags `X.Y.Z`, `X.Y`, `X`, `latest` (et `-full`). Publication du SDK sur npm (provenance activée). Signature des images avec cosign et SBOM. |
| `edge.yml` | Push sur `main` | Image `:edge` construite à chaque fusion, pour tester la toute dernière version avant release. |
| `docs.yml` | Push sur `main` touchant `apps/docs` ou le SDK | Build Docusaurus et déploiement sur GitHub Pages. Build de vérification sur les PR. |
| `codeql.yml` | PR et chaque semaine | Analyse de sécurité du code. |

Dépendances : **Renovate** (ou Dependabot) ouvre des PR groupées chaque semaine, avec fusion automatique des mises à jour mineures et patch quand la CI est verte.

### Règles du dépôt (rulesets GitHub sur `main`)
- Pull request obligatoire avant fusion. **0 approbation requise** tant que tu es seul (passer à 1 quand d'autres mainteneurs arrivent), mais toutes les conversations doivent être résolues.
- **Checks obligatoires** : `ci`, `pr-title`, `docs-build`.
- Branche à jour avec `main` avant fusion.
- **Squash merge uniquement**, historique linéaire.
- Interdiction des force-push et de la suppression de `main`.
- Tags `v*` protégés : seule la CI de release peut les créer.
- Suppression automatique des branches fusionnées, auto-merge autorisé.

Les rulesets sont versionnés dans `.github/rulesets/*.json` pour pouvoir les **importer** dans *Settings → Rules → Rulesets → Import*.

### Fichiers de gouvernance du dépôt
`CONTRIBUTING.md` (modèle de branches, conventions, comment ajouter un site ou un notifier), `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE` (MIT), modèle de PR, modèles d'issues (bug de détection, demande de site, demande de notifier), `CODEOWNERS`, `.editorconfig`, labels.

## 16. Plan de livraison

| Jalon | Contenu |
|---|---|
| **M0 — Socle** | Monorepo, **CI/CD complète, release-please, rulesets**, SDK de plugins, domaine (veille, state machine, diff de listes), SQLite + migrations, **i18n FR/EN en place (front et back)**, squelette Docusaurus publié sur GitHub Pages |
| **M1 — MVP produit** | Veilles `product`, plugins `structured-data` et `css-rule`, scheduler avec fréquence globale et par veille, notifiers **Telegram et email avec assistants guidés et images produit**, ntfy, API, interface (liste, ajout avec aperçu), **assistant de premier lancement**, image Docker, **script d'installation en une commande** (§12), **guide de démarrage et de configuration** dans la doc |
| **M2 — Pages liste** | Veilles `listing` (sans filtres), **plugin `fanatec` (reconditionné EU)**, plugin Shopify, groupement des notifications |
| **M3 — Robustesse** | Fetcher navigateur (image `:full`), backoff, alertes `WatchFailing`, outbox avec retries, auth, chiffrement des secrets, **bandeau de nouvelle version + service `updater`** |
| **M4 — Écosystème** | Chargement de plugins npm et locaux, testkit, `create-plugin`, **tutoriels Docusaurus « Ajouter un site » et « Ajouter un notifier » (exemple Discord)**, référence TypeDoc, publication du SDK sur npm |
| **M5 — Confort** | Filtres sur les pages liste, historique et courbe de prix, plages horaires, import/export JSON des veilles |

## 17. Décisions prises

| Sujet | Décision |
|---|---|
| Langage | TypeScript partout |
| Hébergement | Auto-hébergé, Docker, sans serveur central |
| Utilisateurs | Un seul utilisateur par instance (v1) |
| Canaux | Plusieurs canaux par utilisateur, y compris plusieurs du même type |
| Première cible | Page reconditionné **Fanatec Europe** |
| Licence | MIT, contributions de sites et de notifiers encouragées |
| Front | React + shadcn/ui |
| Notifiers v1 | Telegram, email (prioritaires, guidés), ntfy, webhook. Pas de Discord en v1 |
| i18n | Français et anglais dans l'application, les notifications et la doc |
| Onboarding | Assistant de premier lancement + assistants de configuration par canal |
| Documentation | Docusaurus bilingue, publié sur GitHub Pages |
| Filtres | Pas de filtres en v1 sur les pages liste |
| Images | `ghcr.io/juc0ag0g0/back-in-stock` (compte perso) |
| Branches | `main` protégée + branches courtes fusionnées par PR (squash) |
| Releases | release-please, publications fréquentes, image `:edge` à chaque fusion |
| Mises à jour | Bandeau dans l'interface + installation en un clic via le service `updater` |
| Images | Photo du produit récupérée, mise en cache localement et jointe aux notifications |

## 18. Questions ouvertes

1. **Analyse technique Fanatec** : à faire au début de M2. Il faut vérifier si la page reconditionné est rendue côté serveur ou en JavaScript, si une API JSON existe et s'il y a une protection anti-bot. Cela décide si le plugin a besoin de l'image `:full`.
