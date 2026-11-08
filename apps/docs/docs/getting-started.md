---
sidebar_position: 2
title: Démarrage rapide
---

# Démarrage rapide

Il te faut une machine avec [Docker](https://docs.docker.com/get-docker/) et Docker Compose : un NAS, un Raspberry Pi 4 ou plus, un petit serveur ou ton ordinateur.

## Installation en une commande

Sur macOS ou Linux, dans un terminal :

```bash
curl -fsSL https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.sh | sh
```

Sur Windows, dans PowerShell :

```powershell
irm https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.ps1 | iex
```

Le script vérifie que Docker est installé et démarré, puis te pose quelques questions, chacune avec une valeur proposée (Entrée pour la garder) :

| Question                | Valeur proposée                           |
| ----------------------- | ----------------------------------------- |
| Dossier d'installation  | `~/back-in-stock`                         |
| Port de l'interface web | `8080`, ou le suivant libre s'il est pris |
| Fuseau horaire          | Celui de ta machine                       |
| Mise à jour en un clic  | Oui (dès qu'elle est disponible)          |

Il écrit ensuite `docker-compose.yml` et `.env` dans ce dossier, démarre l'application, attend qu'elle réponde et t'affiche son adresse. Les réglages sont dans `.env` : modifie-le puis lance `docker compose up -d` pour les appliquer.

Relancer la même commande **met à jour** une installation existante : tes données et tes réponses sont conservées.

<details>
<summary>Sans questions (script, serveur distant)</summary>

Les réponses peuvent venir de variables d'environnement : `BIS_DIR`, `BIS_PORT`, `BIS_TZ`, `BIS_VERSION` (par défaut `latest`) et `BIS_UPDATER` (`yes` ou `no`).

```bash
curl -fsSL https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.sh | BIS_PORT=9000 sh -s -- --yes
```

Options de `install.sh` : `--yes` (aucune question), `--version 0.2.0` (version précise), `--no-updater` (pas de mise à jour en un clic), `--dir` et `--port`. Sur Windows, `$env:BIS_YES = '1'` remplace `--yes`.

</details>

Tu préfères tout faire à la main ? Suis les étapes ci-dessous.

## 1. Créer le fichier `docker-compose.yml`

```yaml title="docker-compose.yml"
services:
  back-in-stock:
    image: ghcr.io/juc0ag0g0/back-in-stock:latest
    restart: unless-stopped
    ports:
      - '8080:8080'
    volumes:
      - ./data:/data
    environment:
      TZ: Europe/Paris
```

Le dossier `./data` contient toute la base de données (fichier SQLite). C'est le seul dossier à sauvegarder.

## 2. Démarrer

```bash
docker compose up -d
```

Ouvre ensuite [http://localhost:8080](http://localhost:8080) (ou l'adresse de ta machine sur le port 8080).

## 3. Vérifier que tout fonctionne

```bash
curl http://localhost:8080/api/health
# {"status":"ok","version":"0.1.0"}
```

Docker suit aussi cet état : `docker compose ps` affiche `healthy` quand l'application est prête.

## Choisir la version de l'image

| Tag      | Contenu                                                                           |
| -------- | --------------------------------------------------------------------------------- |
| `latest` | Dernière version publiée.                                                         |
| `0.1.0`  | Une version précise, qui ne change jamais.                                        |
| `0.1`    | Dernière version corrective de la 0.1 (0.1.0, 0.1.1…).                            |
| `edge`   | Version de développement, reconstruite à chaque modification. Peut être instable. |

Chaque [release](https://github.com/JUC0AG0G0/Back-in-stock/releases) fournit aussi un `docker-compose.yml` déjà réglé sur sa version, la liste des composants de l'image (SBOM) et un fichier de sommes de contrôle. L'image existe pour `amd64` (PC, NAS Intel) et `arm64` (Raspberry Pi, Mac Apple Silicon).

## Mettre à jour

```bash
docker compose pull
docker compose up -d
```

Tes données dans `./data` sont conservées, et la base est migrée automatiquement au démarrage. L'interface t'affiche aussi un bandeau quand une nouvelle version sort, et peut l'installer en un clic : voir [Mises à jour](updates.md).

:::info À venir
Un assistant de premier lancement te guidera pour configurer ton premier canal de notification (Telegram ou email) et ajouter ta première veille.
:::
