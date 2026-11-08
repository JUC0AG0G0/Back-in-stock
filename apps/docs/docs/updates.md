---
sidebar_position: 4
title: Mises à jour
---

# Mises à jour

Back in stock ! te prévient quand une nouvelle version sort, et peut l'installer en un clic depuis l'interface. Tes données sont toujours conservées.

## Le bandeau « Nouvelle version disponible »

Quand une version plus récente que la tienne est publiée, un bandeau apparaît en haut de toutes les pages : « Version 1.4.0 disponible (tu as 1.3.2) ».

- **Voir les nouveautés** ouvre le changelog de toutes les versions entre la tienne et la dernière, tiré des [notes de release GitHub](https://github.com/JUC0AG0G0/Back-in-stock/releases).
- **Installer** lance la mise à jour en un clic si le service `updater` est installé (voir plus bas). Sinon, il affiche les commandes à lancer.
- **Plus tard** masque le bandeau jusqu'à la version suivante (le choix est mémorisé dans ton navigateur).

Si une des versions contient des **changements cassants**, le bandeau est orange et renvoie vers le [guide de migration](#migration) avant d'installer.

### D'où vient l'information

Le serveur interroge l'API GitHub Releases (`api.github.com/repos/JUC0AG0G0/Back-in-stock/releases`) **toutes les 6 heures**, sans compte ni jeton. Il envoie l'en-tête `If-None-Match` : quand rien n'a changé, GitHub répond « 304 » et rien n'est téléchargé.

C'est la **seule requête sortante** de l'application en dehors des sites que tu surveilles et de tes canaux de notification. Elle n'envoie rien sur toi, à part ton adresse IP et la version installée (dans l'en-tête `User-Agent`).

La vérification ne se fait que sur les **images publiées** (`latest`, `1`, `1.4`, `1.4.2`…). Les images `edge` et les builds locaux ne cherchent jamais de mise à jour.

### Réglages {#settings}

| Variable             | Défaut   | Rôle                                                                     |
| -------------------- | -------- | ------------------------------------------------------------------------ |
| `BIS_UPDATE_CHECK`   | `true`   | `false` coupe complètement la vérification (plus aucune requête GitHub). |
| `BIS_UPDATE_CHANNEL` | `stable` | `prerelease` propose aussi les pré-versions (`-rc`, `-beta`).            |
| `BIS_UPDATER_URL`    | (aucun)  | Adresse du service `updater`, par exemple `http://updater:8090`.         |

## Mise à jour en un clic

Un conteneur ne peut pas se remplacer lui-même. La mise à jour en un clic passe donc par un **petit service compagnon optionnel**, `updater`, dans le même `docker-compose.yml`. Le [script d'installation](getting-started.md) te propose de l'ajouter. Pour l'ajouter à la main :

```yaml title="docker-compose.yml"
services:
  back-in-stock:
    image: ghcr.io/juc0ag0g0/back-in-stock:${BIS_IMAGE_TAG:-latest}
    # ... le reste de ta configuration
    environment:
      BIS_UPDATER_URL: http://updater:8090

  updater:
    image: ghcr.io/juc0ag0g0/back-in-stock-updater:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data # le même dossier de données que l'application
      - .:/install # pour mettre à jour BIS_IMAGE_TAG dans .env
    environment:
      BIS_TARGET_SERVICE: back-in-stock
```

Puis `docker compose up -d`.

### Ce qui se passe quand tu cliques sur « Installer »

1. L'application demande la mise à jour à l'`updater`, avec un jeton secret créé au premier démarrage dans `data/updater.token`.
2. L'`updater` **télécharge la nouvelle image** pendant que l'application tourne encore (variante `slim` ou `full` conservée).
3. Il **arrête proprement** l'application et **sauvegarde la base** dans `data/backups/db-<version>-<date>.sqlite`.
4. Il **recrée le conteneur** avec exactement la même configuration : volumes, ports, variables, réseaux. Seuls l'image et ce qu'elle définit (version, commande) changent.
5. La nouvelle version démarre et applique ses migrations. L'`updater` attend que le **healthcheck** passe.
6. Si elle ne démarre pas correctement, il fait un **retour arrière automatique** : il remet l'ancien conteneur et restaure la sauvegarde de la base.

Pendant ce temps, l'interface affiche chaque étape, puis se recharge toute seule sur la nouvelle version avec le message « Mise à jour réussie ». En cas d'échec, elle affiche la raison et indique que l'ancienne version a été remise.

### Tag d'image et fichier `.env`

| `BIS_IMAGE_TAG` dans `.env` | Comportement                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `latest` (défaut)           | L'`updater` retélécharge `latest`. Rien d'autre à changer.                                                                                                                                                                              |
| `1` ou `1.4`                | Pareil, tant que la nouvelle version reste dans cette série (une 2.0 ne sera pas sous le tag `1`).                                                                                                                                      |
| `1.4.2` (version précise)   | L'`updater` passe sur le tag de la nouvelle version et réécrit **uniquement** la ligne `BIS_IMAGE_TAG` de `.env`, pour qu'un `docker compose up -d` ultérieur garde la nouvelle version. Il lui faut pour cela le montage `.:/install`. |
| `edge`                      | Pas de mise à jour en un clic : ce n'est pas une version publiée.                                                                                                                                                                       |

### Sécurité : le compromis

:::warning Accès au socket Docker
Monter `/var/run/docker.sock` donne à l'`updater` **le contrôle complet de Docker sur la machine**, ce qui équivaut en pratique à un accès root. Lis ce qui suit avant de l'activer.
:::

Ce qui limite le risque :

- L'`updater` est **séparé** de l'application : l'application, qui lit des pages web externes, n'a jamais accès au socket.
- Il **n'expose aucun port** : il n'est joignable que par l'application, sur le réseau interne de Docker Compose.
- Chaque appel demande le **jeton secret** de `data/updater.token` (lisible seulement par l'application).
- Il ne sait faire qu'**une chose** : remplacer le conteneur `back-in-stock` par une version **publiée et plus récente** annoncée par GitHub. Il refuse les autres tags, et l'application refuse de lui demander une version qui n'est pas dans la liste des mises à jour.
- Son code est court et sans dépendance : [`apps/updater`](https://github.com/JUC0AG0G0/Back-in-stock/tree/main/apps/updater).

Ce qui reste vrai : tant que l'authentification de l'interface n'existe pas (prévue au jalon M3), **toute personne qui accède à l'interface peut lancer une mise à jour** vers une version publiée. N'expose pas l'interface sur Internet sans protection.

Si tu préfères ne pas donner cet accès, n'installe pas l'`updater` : le bandeau reste, et **Installer** affiche simplement les commandes à lancer.

## Mettre à jour à la main

Dans le dossier qui contient ton `docker-compose.yml` :

```bash
docker compose pull
docker compose up -d
```

Si `BIS_IMAGE_TAG` est une version précise dans `.env`, remplace-la d'abord par la nouvelle. Tes données dans `./data` sont conservées et la base est migrée au démarrage.

### Avec un outil de mise à jour automatique

Tu peux aussi confier les mises à jour à un outil qui surveille les images, comme [Watchtower](https://containrrr.dev/watchtower/) ou [Diun](https://crazymax.dev/diun/) (qui notifie sans mettre à jour). Ils ont besoin du même accès au socket Docker, ne font pas de sauvegarde de la base ni de retour arrière, et ne savent pas qu'une version a des changements cassants. Dans ce cas, mets `BIS_UPDATE_CHECK=false` pour ne pas avoir le bandeau en double.

## Revenir à la version précédente {#rollback}

En cas de souci après une mise à jour réussie :

1. Arrête l'application : `docker compose stop back-in-stock`.
2. Remets la sauvegarde : copie `data/backups/db-<ancienne version>-<date>.sqlite` sur `data/back-in-stock.db`, et supprime `data/back-in-stock.db-wal` et `data/back-in-stock.db-shm` s'ils existent.
3. Mets l'ancienne version dans `.env` (`BIS_IMAGE_TAG=1.3.2`) puis `docker compose up -d`.

Les sauvegardes ne sont jamais supprimées automatiquement : fais le ménage dans `data/backups` de temps en temps.

## Guide de migration {#migration}

Les changements cassants sont listés en tête des notes de chaque version, dans la section « ⚠ BREAKING CHANGES ». Lis-les avant d'installer : ils indiquent ce qu'il faut adapter (variable renommée, plugin à mettre à jour…).

Aucune version publiée n'a encore de changement cassant.
