#!/usr/bin/env bash
# Decides which CI jobs a pull request needs, from the list of files it changes.
#
# Usage: scripts/ci/changes.sh <head branch>   (changed files on stdin, one per line)
# Prints node=true|false and docker=true|false, ready for $GITHUB_OUTPUT.
#
#   node    lint, format, typecheck, tests, build
#   docker  app and updater images, smoke tests, installers
#
# The release-please PR only bumps the version and the changelog: it needs neither.
set -euo pipefail

branch="${1:-}"
node=false
docker=false

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  case "$file" in
    # Release-please bookkeeping. package.json counts only on its branch: elsewhere it can
    # change scripts or dependencies.
    CHANGELOG.md | .release-please-manifest.json) continue ;;
    package.json) [[ "$branch" == release-please--* ]] && continue ;;
    # GitHub settings and the other workflows: no code, and prettier ignores .github/.
    .github/workflows/ci.yml | .github/actions/*) ;;
    .github/*) continue ;;
    # Root markdown and licence: ignored by prettier, not in the image.
    LICENSE | *.md) [[ "$file" != */* ]] && continue ;;
  esac
  node=true
  case "$file" in
    # The documentation site is linted and built by the node jobs, but is not in the image.
    apps/docs/* | *.md) ;;
    *) docker=true ;;
  esac
done

echo "node=$node"
echo "docker=$docker"
