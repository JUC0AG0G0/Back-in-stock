/**
 * Level-2 sections the release workflow appends to every GitHub release (docker-publish.yml):
 * how to install from scratch. Useful on GitHub, but noise in the in-app "what's new" dialog,
 * where the app is already installed and has its own install button.
 */
const INSTALL_SECTION = /^##\s+(?:\S+\s+)?(?:installation|image docker|docker image)\s*$/iu;

/** Removes the install sections from a release's notes, keeping everything else as written. */
export function withoutInstallSections(markdown: string): string {
  const kept: string[] = [];
  let skipping = false;
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    // A "## " line inside a code block is not a heading.
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (!fence && /^#{1,2}\s/.test(line)) skipping = INSTALL_SECTION.test(line.trim());
    if (marker) {
      if (!fence) fence = marker;
      else if (marker.startsWith(fence)) fence = null;
    }
    if (!skipping) kept.push(line);
  }
  return kept.join('\n').trim();
}
