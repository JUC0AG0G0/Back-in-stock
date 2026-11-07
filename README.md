<div align="center">

# 🔔 Back in stock !

**Sois prévenu dès qu'un produit revient en stock, ou qu'un nouvel article apparaît sur une page reconditionné.**

Open source · Auto-hébergé · Sans serveur central · TypeScript · Docker · 🇫🇷 / 🇬🇧

[![CI](https://github.com/JUC0AG0G0/Back-in-stock/actions/workflows/ci.yml/badge.svg)](https://github.com/JUC0AG0G0/Back-in-stock/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/JUC0AG0G0/Back-in-stock?include_prereleases&sort=semver)](https://github.com/JUC0AG0G0/Back-in-stock/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

> 🚧 **Projet en cours de construction.** Les fonctionnalités ci-dessous décrivent la cible. Voir la [spécification complète](./SPEC.md).

## Fonctionnalités

- 🛒 **Retour en stock** : surveille une page produit (avec variante : taille, couleur…) et te prévient dès qu'elle repasse disponible.
- 🆕 **Nouveaux articles** : surveille une page liste, par exemple le reconditionné **Fanatec Europe**, et te prévient de chaque nouvel article.
- 🔔 **Notifications avec photo du produit** : Telegram, email, ntfy, webhook. Plusieurs comptes par canal possibles.
- ⏱️ **Fréquence réglable** : une valeur par défaut globale, modifiable pour chaque veille.
- 🧩 **Plugins** : ajoute un site ou un moyen de notification sans toucher au cœur de l'application.
- 🖥️ **Interface web** en français et en anglais, avec un assistant de premier lancement et une configuration guidée de Telegram et de l'email.
- ⬆️ **Mises à jour en un clic** depuis l'interface quand une nouvelle version sort.
- 🔒 **Tes données restent chez toi** : un conteneur Docker et un fichier SQLite, pas de compte ni de télémétrie.

## Démarrage rapide

> Disponible dès la première release.

```yaml
# docker-compose.yml
services:
  back-in-stock:
    image: ghcr.io/juc0ag0g0/back-in-stock:latest
    restart: unless-stopped
    ports: ["8080:8080"]
    volumes:
      - ./data:/data
    environment:
      TZ: Europe/Paris
```

```bash
docker compose up -d
```

Ouvre ensuite <http://localhost:8080> : l'assistant te guide pour créer ton compte, configurer ton premier canal de notification et ajouter ta première veille.

## Documentation

La documentation complète (installation, configuration de chaque canal, écrire un plugin) sera publiée sur **<https://juc0ag0g0.github.io/back-in-stock/>**.

## Contribuer

Les contributions sont les bienvenues, surtout pour **ajouter de nouveaux sites** ou **de nouveaux moyens de notification**. Commence par [CONTRIBUTING.md](./CONTRIBUTING.md). Pour proposer un site ou un canal, ouvre une [issue](https://github.com/JUC0AG0G0/Back-in-stock/issues/new/choose).

## Licence

[MIT](./LICENSE). Usage personnel et responsable : respecte les conditions d'utilisation des sites que tu surveilles.
