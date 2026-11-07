<!--
Titre de la PR : Conventional Commits, il devient le message du commit sur main
et apparaît dans le changelog. Exemples :
  feat(fanatec): detect new refurbished items
  fix(scheduler): respect per-domain minimum interval
  docs: add Telegram setup guide
-->

## Description

<!-- Quoi et pourquoi. Lier l'issue : "Closes #123". -->

## Type de changement

- [ ] Nouveau site (plugin source)
- [ ] Nouveau moyen de notification (plugin notifier)
- [ ] Nouvelle fonctionnalité
- [ ] Correction de bug
- [ ] Documentation
- [ ] Maintenance / CI
- [ ] ⚠️ Changement cassant (titre avec `!`, ex. `feat!:`)

## Vérifications

- [ ] Tests ajoutés ou mis à jour (fixtures HTML pour un plugin de site)
- [ ] Textes de l'interface traduits en français **et** en anglais
- [ ] Documentation mise à jour si nécessaire
- [ ] `pnpm lint && pnpm typecheck && pnpm test` passent en local
