# Contribuer à Back in stock !

Merci de ton intérêt ! Les contributions les plus utiles sont **les nouveaux sites** et **les nouveaux moyens de notification**. Ils s'écrivent comme des plugins isolés, sans toucher au cœur de l'application.

## Workflow Git

- `main` est la seule branche principale. Elle est **toujours déployable** et protégée : on ne pousse jamais directement dessus.
- Chaque modification passe par une **branche courte** créée depuis `main`, puis une **pull request** :

  | Préfixe | Usage |
  |---|---|
  | `feat/<sujet>` | Nouvelle fonctionnalité, nouveau site, nouveau notifier |
  | `fix/<sujet>` | Correction de bug |
  | `docs/<sujet>` | Documentation |
  | `refactor/<sujet>` | Refactorisation sans changement de comportement |
  | `chore/<sujet>`, `ci/<sujet>` | Maintenance, CI, dépendances |

- Les PR sont fusionnées en **squash merge** : un commit par PR sur `main`, et la branche est supprimée automatiquement.
- Garde les PR **petites** : mieux vaut plusieurs petites PR fusionnées vite qu'une grosse qui traîne.

## Titre de PR : Conventional Commits

Le titre de la PR devient le message du commit sur `main` et sert à générer le changelog et la version. Il est vérifié par la CI.

```
<type>(<scope optionnel>): <description>
```

| Type | Effet sur la version |
|---|---|
| `fix:`, `perf:`, `docs:`, `revert:` | patch (1.2.**3**) |
| `feat:`, `refactor:` | mineure (1.**3**.0) |
| `feat!:` ou `BREAKING CHANGE:` dans le corps | majeure (**2**.0.0) |
| `test:`, `ci:`, `chore:`, `build:` | pas de release seule (absents du changelog) |

Tant que le projet est en `0.x`, un changement cassant donne une version mineure (0.**2**.0) et non majeure.

Exemples : `feat(fanatec): detect new refurbished items`, `fix(telegram): escape markdown in product names`.

## Releases

Les releases sont automatiques grâce à [release-please](https://github.com/googleapis/release-please) :

1. À chaque fusion sur `main`, une PR **« chore(main): release x.y.z »** est créée ou mise à jour avec le changelog.
   Les règles de version sont dans `release-please-config.json` (sections du changelog) et `scripts/release-please/versioning.ts` (`refactor:` compté comme une nouveauté).
2. **Fusionner cette PR publie la version** : tag `vX.Y.Z`, release GitHub, images Docker sur GHCR (`latest`, `X.Y.Z`, `X.Y`, `X`), et en assets de la release : `docker-compose.yml` réglé sur la version, SBOM et sommes de contrôle.
   Chaque fusion sur `main` publie aussi l'image `edge` (version de développement).
3. Les instances auto-hébergées voient alors le bandeau « Nouvelle version disponible ».

## Avant d'ouvrir une PR

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

- Ajoute ou mets à jour les tests. Un plugin de site doit fournir des **pages HTML enregistrées** (fixtures).
- Tout texte de l'interface doit exister en **français et en anglais**.
- Mets à jour la documentation si ton changement la concerne.

## Ajouter un site ou un moyen de notification

Les guides sont dans la documentation : [Écrire un plugin](https://juc0ag0g0.github.io/Back-in-stock/plugins/overview). Leurs sources sont dans `apps/docs/` (`pnpm docs:dev` pour la lancer en local). Le contrat complet est décrit dans [SPEC.md](./SPEC.md#4-système-de-plugins).

## Code de conduite

Ce projet suit le [code de conduite](./CODE_OF_CONDUCT.md). En participant, tu acceptes de le respecter.
