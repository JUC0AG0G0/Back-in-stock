---
sidebar_position: 3
title: Configuration
---

# Configuration

Le serveur se règle avec des variables d'environnement, à mettre dans la section `environment` de ton `docker-compose.yml`. Tous les réglages fonctionnels (fréquence de vérification, canaux, règles de notification) se feront depuis l'interface.

| Variable       | Défaut (Docker) | Rôle                                                                                              |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `PORT`         | `8080`          | Port HTTP du serveur.                                                                             |
| `HOST`         | `0.0.0.0`       | Adresse d'écoute.                                                                                 |
| `BIS_DATA_DIR` | `/data`         | Dossier de la base SQLite (`back-in-stock.db`). Hors Docker : `./data`.                           |
| `LOG_LEVEL`    | `info`          | `debug`, `info`, `warn` ou `error`.                                                               |
| `TZ`           | (aucun)         | Fuseau horaire, par exemple `Europe/Paris`, pour les heures affichées et les plages silencieuses. |

Les variables de la vérification de nouvelle version et de la mise à jour en un clic (`BIS_UPDATE_CHECK`, `BIS_UPDATE_CHANNEL`, `BIS_UPDATER_URL`) sont décrites dans [Mises à jour](updates.md#settings).

## Langue

L'interface suit la langue de ton navigateur (français ou anglais, anglais par défaut sinon). Tu peux en changer avec le sélecteur en haut de l'écran : ton choix est mémorisé.

## Notifications

Pour chaque type d'évènement (alertes activées, retour en stock, rupture, précommande, nouvel article, article retiré), un réglage global indique s'il faut notifier et sur quels canaux. Chaque veille peut remplacer ce réglage.

| Évènement        | Quand                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Alertes activées | Première vérification réussie d'une nouvelle veille, avec l'état actuel. |
| Retour en stock  | Le produit repasse disponible (confirmé par une seconde vérification).   |
| Rupture          | Le produit n'est plus disponible.                                        |
| Précommande      | Le produit passe en précommande.                                         |
| Nouvel article   | Un article apparaît sur une page liste.                                  |
| Article retiré   | Un article disparaît d'une page liste.                                   |

Une erreur de lecture d'une page ne change jamais l'état et ne déclenche pas de fausse alerte.

Les canaux se créent dans l'écran **Canaux** de l'interface. Voir le guide [Telegram](./channels/telegram.md).

:::info À venir
L'écran de réglages et la configuration guidée de l'email arrivent avec le jalon M1.
:::
