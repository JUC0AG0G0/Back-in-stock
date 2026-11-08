import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import { withoutInstallSections } from './notes';

// No typography plugin: give the few elements release-please writes a readable style.
// Raw HTML in the notes is not rendered (react-markdown's default), only Markdown.
const components: Components = {
  h1: ({ children }) => <h4 className="mt-4 font-semibold">{children}</h4>,
  h2: ({ children }) => <h4 className="mt-4 font-semibold">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-3 text-sm font-semibold">{children}</h5>,
  p: ({ children }) => <p className="mt-2 text-sm">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all">{children}</code>
  ),
  // Wrapped, not scrolled: a long command must not widen the dialog.
  pre: ({ children }) => (
    <pre className="mt-2 rounded-md bg-muted p-3 text-xs break-all whitespace-pre-wrap [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
};

export function ReleaseNotes({ markdown }: { markdown: string }) {
  // Long links and words wrap instead of pushing the dialog sideways.
  return (
    <div className="min-w-0 wrap-break-word">
      <Markdown components={components}>{withoutInstallSections(markdown)}</Markdown>
    </div>
  );
}
