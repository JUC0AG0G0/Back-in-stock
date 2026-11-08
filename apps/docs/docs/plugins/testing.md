---
sidebar_position: 4
title: Tester un plugin
---

# Tester un plugin

L'application sait tester ses plugins en direct, depuis l'interface ou l'API. Rien n'est enregistré : aucune veille créée, aucun état modifié.

| Type de plugin | Ce que fait le test                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source         | Télécharge et lit une page exactement comme une vraie vérification (`checkProduct` ou `checkListing`), puis affiche le résultat : statut, titre, prix, ou articles trouvés. |
| Notifieur      | Envoie une notification de test à **chaque canal** configuré avec ce notifieur.                                                                                             |

## Depuis l'interface

La page **Plugins** de l’interface liste les plugins chargés.

- **Tester tous les plugins** lance tous les tests d'un coup et affiche un récapitulatif (réussis, échecs, ignorés).
- **Tester** sur une ligne ne teste que ce plugin. Pour une source, tu peux saisir une URL et choisir le type de veille : la page saisie est lue à la place des pages d'exemple.

Un test est **ignoré** quand il n'y a rien à tester : une source sans page d'exemple (et sans URL saisie), ou un notifieur sans canal. Chaque test est coupé au bout de 30 secondes.

## Donner des pages d'exemple à une source

Pour qu'une source soit testée par « Tester tous les plugins », déclare une ou plusieurs pages d'exemple avec `testTargets` :

```ts
export default defineSourcePlugin({
  id: 'exemple',
  // …
  supports: ['product', 'listing'],
  testTargets: [
    { url: 'https://exemple.fr/reconditionne', type: 'listing', label: 'Reconditionné' },
    { url: 'https://exemple.fr/p/volant-gt', type: 'product', config: { variant: 'EU' } },
  ],
});
```

- `url` : une page `http(s)` stable (une catégorie, un produit qui reste en ligne longtemps).
- `type` : `product` ou `listing`. Il doit faire partie de `supports`, sinon le plugin est refusé au chargement.
- `config` (facultatif) : les options du plugin pour cette page, validées par `configSchema`.
- `label` (facultatif) : le nom affiché dans l'interface. Par défaut, l'URL.

Ces tests visent le **vrai site**. Ils complètent les tests sur fixtures, ils ne les remplacent pas : un site peut changer ou bloquer, alors que les fixtures restent stables.

## Tester un notifieur

Il n'y a rien à ajouter : le test réutilise ce que le bouton « Envoyer un test » d'un canal fait déjà. Si ton notifieur définit `test(ctx)`, c'est elle qui est appelée. Sinon, le cœur appelle `send(ctx, message)` avec un message de test traduit (`event: 'Test'`). La configuration du canal est d'abord validée par `configSchema`.

### Personnaliser le message de test

Sur la ligne d'un notifieur, choisis le message à envoyer pour vérifier le rendu de ton canal :

| Préréglage            | Ce qui est envoyé                                                   |
| --------------------- | ------------------------------------------------------------------- |
| Test standard         | Le test du plugin (`test()` s'il existe, sinon le message traduit). |
| Texte seul            | Un titre et un texte.                                               |
| Texte + lien          | Un titre, un texte et un lien.                                      |
| Texte + lien + image  | Un titre, un texte, un lien et une image.                           |
| Lien seul, sans image | Un titre et un lien, sans texte ni image.                           |

Chaque champ (titre, texte, lien, URL de l'image) reste modifiable, et un champ vide n'est pas envoyé (un titre vide reprend le titre par défaut). Un message personnalisé passe toujours par `send()`, donc par le vrai rendu du notifieur. Si le notifieur a plusieurs canaux, tu peux n'en tester qu'un.

## Depuis l'API

```http
POST /api/plugins/test                  # tous les plugins, body facultatif { "kind": "source" | "notifier" }
POST /api/plugins/sources/:id/test      # body facultatif { "url", "type", "config" }
POST /api/plugins/notifiers/:id/test    # body facultatif { "channelId", "locale", "message": { "title", "text", "url", "imageUrl" } }
```

Chaque route répond `{ results: [...] }`, avec un résultat par page ou par canal :

```json
{
  "kind": "source",
  "pluginId": "exemple",
  "status": "passed",
  "target": {
    "label": "Reconditionné",
    "url": "https://exemple.fr/reconditionne",
    "type": "listing"
  },
  "durationMs": 812,
  "output": {
    "type": "listing",
    "itemCount": 42,
    "complete": true,
    "items": ["… 20 premiers articles"]
  }
}
```

`status` vaut `passed`, `failed` (avec `error.message`, et `error.kind` pour une `SourceError`) ou `skipped` (avec `skipReason` : `no-test-target` ou `no-channel`). Une URL invalide ou un type non supporté donne une erreur 400, un plugin inconnu une erreur 404.
