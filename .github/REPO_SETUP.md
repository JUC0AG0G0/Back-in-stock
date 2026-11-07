# Paramétrage du dépôt GitHub

Ces réglages ne peuvent pas être versionnés dans des fichiers : ils se font une fois dans l'interface GitHub. Compte environ 10 minutes.

## 1. Settings → General

**Default branch** : `main`.

Section **Pull Requests** :
- ❌ Allow merge commits
- ✅ **Allow squash merging**, avec *Default commit message* = **Pull request title**
- ❌ Allow rebase merging
- ✅ Always suggest updating pull request branches
- ✅ **Allow auto-merge**
- ✅ **Automatically delete head branches**

## 2. Settings → Actions → General

Section **Workflow permissions** :
- *Read repository contents and packages permissions* (les workflows demandent eux-mêmes les droits dont ils ont besoin)
- ✅ **Allow GitHub Actions to create and approve pull requests** (indispensable pour release-please)

## 3. Secret `RELEASE_PLEASE_TOKEN`

Sans ce secret, la PR de release est créée par `GITHUB_TOKEN`, et GitHub **ne lance pas la CI** dessus. Les checks obligatoires ne passent jamais et la PR ne peut pas être fusionnée.

1. Crée un **fine-grained personal access token** : <https://github.com/settings/personal-access-tokens/new>
   - *Repository access* : uniquement `JUC0AG0G0/Back-in-stock`
   - *Permissions* : **Contents** = Read and write, **Pull requests** = Read and write
   - Expiration : 1 an (mets un rappel pour le renouveler)
2. Ajoute-le dans **Settings → Secrets and variables → Actions → New repository secret**, nom `RELEASE_PLEASE_TOKEN`.

## 4. Règles de branche et de tags (rulesets)

**Settings → Rules → Rulesets → New ruleset → Import a ruleset**, puis importe :

| Fichier | Effet |
|---|---|
| [`rulesets/main.json`](./rulesets/main.json) | Sur `main` : PR obligatoire (0 approbation tant que tu es seul), conversations résolues, checks `ci` et `pr-title` verts, branche à jour, squash uniquement, historique linéaire, pas de force-push ni de suppression. |
| [`rulesets/release-tags.json`](./rulesets/release-tags.json) | Tags `v*` : création, modification et suppression réservées aux admins et à GitHub Actions. |

Quand d'autres mainteneurs arriveront, passe *Required approvals* à 1 dans le ruleset `main`.

> ⚠️ Importe le ruleset `main` **après** avoir fusionné la PR qui ajoute cette configuration. Le workflow `pr-title` est lu depuis `main` (`pull_request_target`), il ne tourne donc pas sur cette première PR : elle resterait bloquée en attendant ce check.

## 5. Settings → Code security

- ✅ Dependabot alerts et Dependabot security updates
- ✅ Secret scanning et **Push protection**
- ✅ **Private vulnerability reporting** (utilisé par `SECURITY.md`)

## 6. Labels

Crée ces labels (**Issues → Labels**), utilisés par les modèles d'issues :
`triage`, `bug`, `detection`, `new-site`, `new-notifier`, `good first issue`.

## 7. Plus tard

- **GitHub Pages** (quand la doc Docusaurus arrivera) : *Settings → Pages → Source* = **GitHub Actions**.
- **Images Docker** : après la première publication sur GHCR, va dans *Packages → back-in-stock → Package settings*, passe la visibilité en **Public** et lie le package au dépôt.
- **npm** (publication du SDK de plugins) : ajoute un secret `NPM_TOKEN` ou configure la publication « trusted publishing » d'npm.

## Cycle de travail au quotidien

```bash
git switch main && git pull
git switch -c feat/mon-sujet
# … commits …
git push -u origin feat/mon-sujet
# Ouvre la PR avec un titre Conventional Commits, active l'auto-merge :
# elle se fusionne toute seule dès que la CI est verte.
```

Pour publier : fusionne la PR **« chore(main): release x.y.z »** quand tu veux sortir une version, aussi souvent que tu veux.
