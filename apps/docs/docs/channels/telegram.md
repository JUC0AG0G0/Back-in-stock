---
sidebar_position: 1
title: Telegram
---

# Recevoir les alertes sur Telegram

Les alertes arrivent dans Telegram grâce à **ton propre bot**. Il est gratuit, ne prend que quelques minutes à créer et n'appartient qu'à toi : aucun service tiers ne voit passer tes messages, à part Telegram.

Tu peux créer **autant de canaux Telegram que tu veux** : un pour toi, un pour un groupe familial, un canal pour des amis… Chaque veille choisit les canaux qu'elle prévient.

## Configuration guidée

Dans l'interface, ouvre **Canaux**, puis **Ajouter un canal** et choisis **Telegram**. Un assistant te guide en cinq étapes :

1. **Parler à @BotFather.** C'est le bot officiel de Telegram pour créer des bots. Le lien et le QR code l'ouvrent directement sur ton ordinateur ou ton téléphone.
2. **Créer le bot.** Envoie `/newbot` à BotFather (un bouton copie la commande), choisis un nom libre puis un identifiant qui se termine par `bot`, par exemple `monstock_bot`.
3. **Coller le token.** BotFather répond avec un token de la forme `123456789:AAH…`. Colle-le et clique sur **Vérifier** : l'application interroge Telegram (`getMe`) et affiche le nom du bot.
4. **Envoyer `/start` au bot.** Le lien et le QR code ouvrent ton bot. Envoie-lui `/start`, puis clique sur **Détecter** : l'application trouve la discussion toute seule (`getUpdates`), inutile de chercher le « chat id ».
5. **Envoyer un test.** Un message de test part dans la discussion choisie. Confirme que tu l'as reçu, donne un nom au canal (par exemple « Mon Telegram perso »), coche éventuellement **Canal par défaut**, puis enregistre.

:::tip Canal par défaut
Les canaux par défaut sont pré-cochés quand tu crées une veille.
:::

## Groupe ou canal Telegram

- **Groupe** : ajoute ton bot au groupe, écris un message dans le groupe, puis clique sur **Détecter** à l'étape 4. L'identifiant d'un groupe est négatif (par exemple `-1001234567890`).
- **Canal** : ajoute le bot comme **administrateur** du canal, publie un message, puis clique sur **Détecter**. Pour un canal public, tu peux aussi saisir son nom sous la forme `@moncanal`.

## Réglages du canal

| Réglage                    | Rôle                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Token du bot               | Donné par BotFather. Il est secret : l'interface ne le réaffiche jamais après l'enregistrement. |
| Identifiant de discussion  | Détecté automatiquement, ou saisi à la main.                                                    |
| Inclure les images         | Envoie la photo du produit avec l'alerte (activé par défaut).                                   |
| Notifications silencieuses | Les messages arrivent sans son.                                                                 |

Pour modifier un canal, clique sur **Modifier**. Laisse le champ du token vide pour garder celui déjà enregistré. Le bouton **Envoyer un test** vérifie à tout moment que le canal fonctionne, et l'interrupteur à droite le met en pause.

## Dépannage

| Message                                       | Que faire                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| « Telegram refuse ce token »                  | Le token est incomplet ou a été régénéré. Recopie-le en entier, ou crée-en un nouveau avec `/token` dans BotFather. |
| « Rien détecté pour l'instant »               | Envoie un message au bot (ou dans le groupe) puis reclique sur **Détecter**. Telegram garde ces messages 24 h.      |
| « Ce bot utilise un webhook »                 | Le bot est déjà branché sur un autre service. Saisis l'identifiant à la main, ou utilise un bot dédié.              |
| `403: Forbidden: bot was blocked by the user` | Tu as bloqué le bot dans Telegram. Débloque-le et envoie-lui `/start`.                                              |
| `400: Bad Request: chat not found`            | L'identifiant de discussion est faux, ou le bot a été retiré du groupe.                                             |
